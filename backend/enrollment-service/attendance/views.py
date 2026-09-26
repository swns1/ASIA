from datetime import date

from django.db import transaction
from django.db.models import Count, Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.permissions import (
    IsAdvisoryTeacherOrStaff,
    assert_teacher_may_write_enrollment,
    guardian_student_ids,
    teacher_enrollment_ids,
    teacher_student_ids,
)
from enrollments.models import Enrollment
from .models import AttendanceRecord
from .serializers import AttendanceRecordSerializer, BulkAttendanceSerializer, attendance_problem


def _query_date(value, name):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError({name: "Must be a date (YYYY-MM-DD)."})


class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = AttendanceRecord.objects.select_related(
        "enrollment__student"
    ).all()
    serializer_class = AttendanceRecordSerializer
    permission_classes = [IsAdvisoryTeacherOrStaff]
    owner_student_id_field = "enrollment__student_id"
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = {
        "date":                         ["exact", "gte", "lte"],
        "status":                        ["exact", "in"],
        "enrollment__school_year":       ["exact"],
        "enrollment__grade_level":       ["exact"],
        "enrollment__section":           ["exact"],
        "enrollment__enrollment_status": ["exact"],
        "enrollment":                    ["exact"],
    }
    ordering_fields = ["date", "enrollment__student__last_name"]
    ordering = ["-date"]

    def get_queryset(self):
        qs = super().get_queryset()
        role = getattr(self.request.user, "role", None)
        if role == "teacher":
            qs = qs.filter(enrollment__student_id__in=teacher_student_ids(self.request.user))
        elif role == "guardian":
            qs = qs.filter(enrollment__student_id__in=guardian_student_ids(self.request.user))
        return qs

    def perform_create(self, serializer):
        # The `bulk` action below already enforces this; the single-record
        # create path was reachable without it, so a teacher could record
        # attendance for any student in the school.
        assert_teacher_may_write_enrollment(
            self.request.user, serializer.validated_data.get("enrollment")
        )
        serializer.save(recorded_by=getattr(self.request.user, "user_id", None))

    def perform_update(self, serializer):
        # has_object_permission checked the record where it was; a PATCH can
        # move it onto another learner's enrollment, so check that one too.
        assert_teacher_may_write_enrollment(
            self.request.user,
            serializer.validated_data.get("enrollment") or serializer.instance.enrollment,
        )
        serializer.save(recorded_by=getattr(self.request.user, "user_id", None))

    # POST /api/attendance/bulk/
    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk(self, request):
        ser = BulkAttendanceSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        day         = ser.validated_data["date"]
        records     = ser.validated_data["records"]
        user_id     = getattr(request.user, "user_id", None)
        created_ids = []

        enrollment_ids = [item["enrollment_id"] for item in records]
        if getattr(request.user, "role", None) == "teacher":
            allowed = teacher_enrollment_ids(request.user)
            if any(eid not in allowed for eid in enrollment_ids):
                return Response(
                    {"detail": "You can only record attendance for your own advisory section."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Checked up front, all of them: an unknown id used to fail on its own
        # row after the rows before it had already been saved -- a 500 and a
        # half-recorded day.
        enrollments = {e.enrollment_id: e for e in Enrollment.objects.filter(enrollment_id__in=enrollment_ids)}
        problems = {}
        for eid in enrollment_ids:
            enrollment = enrollments.get(eid)
            problem = "No such enrollment." if enrollment is None else attendance_problem(enrollment, day)
            if problem:
                problems[str(eid)] = problem
        if problems:
            return Response(
                {"detail": "No attendance was saved.", "records": problems},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for item in records:
                obj, _ = AttendanceRecord.objects.update_or_create(
                    enrollment_id=item["enrollment_id"],
                    date=day,
                    defaults={
                        "status":      item["status"],
                        "remarks":     item.get("remarks") or "",
                        "recorded_by": user_id,
                    },
                )
                created_ids.append(obj.attendance_id)

        return Response({"saved": len(created_ids), "ids": created_ids}, status=status.HTTP_200_OK)

    # GET /api/attendance/summary/?school_year=&grade_level=&section=&date_from=&date_to=
    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        qs = AttendanceRecord.objects.all()
        role = getattr(request.user, "role", None)
        if role == "teacher":
            qs = qs.filter(enrollment__student_id__in=teacher_student_ids(request.user))
        elif role == "guardian":
            qs = qs.filter(enrollment__student_id__in=guardian_student_ids(request.user))

        school_year = request.query_params.get("school_year")
        grade_level = request.query_params.get("grade_level")
        section     = request.query_params.get("section")
        date_from   = request.query_params.get("date_from")
        date_to     = request.query_params.get("date_to")
        enrollment  = request.query_params.get("enrollment")

        if school_year:
            qs = qs.filter(enrollment__school_year=school_year)
        if grade_level:
            qs = qs.filter(enrollment__grade_level=grade_level)
        if section:
            qs = qs.filter(enrollment__section=section)
        # Unparseable values used to reach the query as-is and 500.
        if date_from:
            qs = qs.filter(date__gte=_query_date(date_from, "date_from"))
        if date_to:
            qs = qs.filter(date__lte=_query_date(date_to, "date_to"))
        if enrollment:
            try:
                qs = qs.filter(enrollment_id=int(enrollment))
            except (TypeError, ValueError):
                raise ValidationError({"enrollment": "Must be a whole number."})

        totals = qs.aggregate(
            total=Count("attendance_id"),
            present=Count("attendance_id", filter=Q(status="P")),
            absent=Count("attendance_id",  filter=Q(status="A")),
            late=Count("attendance_id",    filter=Q(status="L")),
            excused=Count("attendance_id", filter=Q(status="E")),
        )

        # Per-enrollment breakdown when filtered to a single enrollment
        per_enrollment = (
            qs.values(
                "enrollment_id",
                "enrollment__student__last_name",
                "enrollment__student__first_name",
                "enrollment__student__lrn",
            )
            .annotate(
                total=Count("attendance_id"),
                present=Count("attendance_id", filter=Q(status="P")),
                absent=Count("attendance_id",  filter=Q(status="A")),
                late=Count("attendance_id",    filter=Q(status="L")),
                excused=Count("attendance_id", filter=Q(status="E")),
            )
            .order_by("enrollment__student__last_name")
        )

        return Response({
            "totals":         totals,
            "per_enrollment": list(per_enrollment),
        })