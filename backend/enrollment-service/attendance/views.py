from django.db.models import Count, Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AttendanceRecord
from .serializers import AttendanceRecordSerializer, BulkAttendanceSerializer


class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = AttendanceRecord.objects.select_related(
        "enrollment__student"
    ).all()
    serializer_class = AttendanceRecordSerializer
    permission_classes = [IsAuthenticated]
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

    def perform_create(self, serializer):
        serializer.save(recorded_by=getattr(self.request, "user_id", None))

    def perform_update(self, serializer):
        serializer.save(recorded_by=getattr(self.request, "user_id", None))

    # POST /api/attendance/bulk/
    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk(self, request):
        ser = BulkAttendanceSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        date        = ser.validated_data["date"]
        records     = ser.validated_data["records"]
        user_id     = getattr(request, "user_id", None)
        created_ids = []

        for item in records:
            obj, _ = AttendanceRecord.objects.update_or_create(
                enrollment_id=item["enrollment_id"],
                date=date,
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
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        if enrollment:
            qs = qs.filter(enrollment_id=enrollment)

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