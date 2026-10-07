import logging
from datetime import date

from rest_framework import viewsets, status
from rest_framework.exceptions import MethodNotAllowed, ValidationError as DRFValidationError
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db import IntegrityError, connection, transaction
from django.db.models.deletion import ProtectedError
from django.db.models import Count, Q
from django.utils import timezone

from accounts.guardian_provisioning import provision_for_enrollment
from shared import placement
from shared import school_year as school_year_rules
from shared.school_year import InvalidSchoolYear, normalize as normalize_school_year
from grading.deped import BLOCKING_REMARKS, summarize_subjects
from accounts.permissions import (
    GRADE_READ_ROLES,
    STAFF_FULL_WRITE_ROLES,
    HasRole,
    IsAdminRegistrarOrReadOnly,
    IsAdvisoryTeacherOrStaff,
    IsStaffOrOwnerGuardianReadOnly,
    guardian_student_ids,
    teacher_student_ids,
)
from . import year_compare
from .archive import ArchivedYearGuard, YearArchived, ensure_open
from .models import (
    EmailDeliveryFailure,
    Enrollment,
    EnrollmentOverride,
    EnrollmentTransfer,
    GuardianResponse,
    SchoolYear,
    Section,
    SectionAdvisory,
    Student,
    advisory_roster,
)
from .serializers import (
    EnrollmentSerializer,
    EnrollmentTransferSerializer,
    get_next_grade_level,
    promotion_grades,
    school_level_for_grade,
    SchoolYearSerializer,
    SectionAdvisorySerializer,
    SectionSerializer,
    StudentSummarySerializer,
)
from .filters import EnrollmentFilter
from .rules import ATTENDED_STATUSES, GRADE_ORDER, SCHOOL_LEVEL_OF_GRADE, date_outside_school_year
from . import promotion

logger = logging.getLogger(__name__)


def _bulk_failure_reason(exc, *, context):
    """A reason string safe to hand back in a bulk-operation report.

    Validation errors are written for the user and say something actionable
    ("this student already has an active enrollment this year"), so they are
    passed through. Anything else is a bug or an infrastructure fault, and
    str(exc) on those was leaking raw Postgres text — constraint names, column
    names, SQL fragments — straight into the response. Log it with the request
    ID instead and give the caller a sentence they can report.
    """
    if isinstance(exc, DRFValidationError):
        detail = exc.detail
        if isinstance(detail, dict):
            parts = []
            for messages in detail.values():
                parts.extend(messages if isinstance(messages, list) else [messages])
            return " ".join(str(p) for p in parts)
        if isinstance(detail, list):
            return " ".join(str(d) for d in detail)
        return str(detail)

    logger.exception("Bulk operation record failed (%s)", context)
    return "Could not be processed due to an unexpected error. Please try again or report this."

ACADEMIC_STAFF_ROLES = ("super_admin", "admin", "registrar")


def _parse_date(value):
    """Parse a 'YYYY-MM-DD' string into a date; returns None if missing/invalid."""
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


# Ids and dates arrive as text on query strings and in hand-built bodies, and
# passing "abc" straight into a filter raised ValueError -- a 500 -- on more
# than a dozen routes. A DRF ValidationError raised from a view is a 400.
def _int_param(value, name):
    try:
        return int(value)
    except (TypeError, ValueError):
        raise DRFValidationError({name: "Must be a whole number."})


def _date_param(value, name):
    parsed = _parse_date(value)
    if parsed is None:
        raise DRFValidationError({name: "Must be a date (YYYY-MM-DD)."})
    return parsed


class SectionAdvisoryViewSet(ArchivedYearGuard, viewsets.ModelViewSet):
    """
    /api/section-advisories/

    Assigns a teacher (identity-service user_id) as adviser of a section for
    a school year — this is what scopes a teacher's grade/attendance/
    narrative-report access to only their own students. Reads open to any
    authenticated staff (e.g. a teacher checking their own assignments);
    writes restricted to admin/registrar.

    Filters: ?teacher_user_id=5, ?school_year=2026-2027
    """

    queryset = SectionAdvisory.objects.all().order_by("-school_year", "grade_level", "section")
    serializer_class = SectionAdvisorySerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("teacher_user_id", "school_year", "school_level", "grade_level", "section")

    def get_permissions(self):
        # section-grades/section-attendance let a teacher POST for their own
        # roster — IsAdvisoryTeacherOrStaff (same class Grade/AttendanceViewSet
        # use) allows that, whereas the viewset's default
        # IsAdminRegistrarOrReadOnly would 403 a teacher's write. my-sections
        # is GET-only so either class covers it.
        if self.action in (
            "section_grades", "section_attendance", "section_narrative_reports",
            "section_attendance_stats", "section_grades_summary",
        ):
            return [IsAdvisoryTeacherOrStaff()]
        return super().get_permissions()

    @action(detail=False, methods=["get"], url_path="my-sections")
    def my_sections(self, request):
        """
        GET /api/section-advisories/my-sections/

        Returns the requesting teacher's own advisory assignments, each
        enriched with its student roster and matching subjects — the data
        backing the teacher-facing "My Sections" page.

        - role=teacher: always scoped to the caller's own user id. A
          ?teacher_user_id= param is ignored (a teacher may only ever see
          their own sections).
        - role=admin/registrar/super_admin: must pass ?teacher_user_id=<id>
          to view that teacher's sections (used by the admin teacher-picker).
        - Any other role: 403.
        """
        from subjects.models import Subject

        role = getattr(request.user, "role", None)

        if role == "teacher":
            teacher_user_id = getattr(request.user, "user_id", None) or getattr(request.user, "id", None)
        elif role in ACADEMIC_STAFF_ROLES:
            raw = request.query_params.get("teacher_user_id")
            if not raw:
                return Response(
                    {"detail": "teacher_user_id is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                teacher_user_id = int(raw)
            except (TypeError, ValueError):
                return Response(
                    {"detail": "teacher_user_id must be an integer."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            return Response(
                {"detail": "You do not have access to this resource."},
                status=status.HTTP_403_FORBIDDEN,
            )

        advisories = SectionAdvisory.objects.filter(
            teacher_user_id=teacher_user_id
        ).order_by("-school_year", "grade_level", "section")

        results = []
        for advisory in advisories:
            enrollment_qs = advisory_roster(advisory).select_related("student")

            students = []
            for e in enrollment_qs.order_by("student__last_name", "student__first_name"):
                student_data = StudentSummarySerializer(e.student).data
                student_data["enrollment_id"] = e.enrollment_id
                students.append(student_data)

            subject_qs = Subject.objects.filter(
                school_year=advisory.school_year,
                school_level=advisory.school_level,
                grade_level=advisory.grade_level,
            )
            # A strand's section takes the core subjects (no strand) as well as
            # its own; a whole-section advisory covers every strand in the
            # section, so it gets them all. This used to be the exact strand,
            # or core only -- each half of the list missing from one of them.
            if advisory.strand:
                subject_qs = subject_qs.filter(
                    Q(strand__isnull=True) | Q(strand="") | Q(strand__iexact=advisory.strand)
                )
            subjects = [
                {
                    "subject_id": s.subject_id,
                    "subject_code": s.subject_code,
                    "subject_name": s.subject_name,
                    "semester": s.semester,
                }
                for s in subject_qs
            ]

            results.append({
                "advisory": SectionAdvisorySerializer(advisory).data,
                "student_count": len(students),
                "students": students,
                "subjects": subjects,
            })

        return Response(results)

    def _resolve_teacher_user_id(self, request):
        """Same role/scoping rule as my_sections: teachers are pinned to
        themselves, staff must specify ?teacher_user_id=. Returns
        (teacher_user_id, error_response)."""
        role = getattr(request.user, "role", None)
        if role == "teacher":
            return (
                getattr(request.user, "user_id", None) or getattr(request.user, "id", None),
                None,
            )
        if role in ACADEMIC_STAFF_ROLES:
            raw = request.query_params.get("teacher_user_id") or request.data.get("teacher_user_id")
            if not raw:
                return None, Response(
                    {"detail": "teacher_user_id is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                return int(raw), None
            except (TypeError, ValueError):
                return None, Response(
                    {"detail": "teacher_user_id must be an integer."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return None, Response(
            {"detail": "You do not have access to this resource."},
            status=status.HTTP_403_FORBIDDEN,
        )

    @action(detail=False, methods=["get", "post"], url_path="section-grades")
    def section_grades(self, request):
        """
        GET /api/section-advisories/section-grades/
            ?advisory_id=<id>&subject_id=<id>&grading_period=<period>

        Returns each roster student alongside their existing Grade (or null)
        for the given subject + grading period — the data backing the
        "quick grade entry" grid on the My Sections page, so a teacher can
        grade their whole section for one subject/period without leaving
        the page.

        POST same body (JSON) plus `grades`: [{student_id, numeric_grade,
        remarks}, ...] — creates or updates a Grade per student in one call.

        Scoping is identical to my-sections: teachers are pinned to their own
        advisories; staff must pass ?teacher_user_id=.
        """
        from grades.models import Grade
        from grades.serializers import GradeSerializer

        teacher_user_id, error = self._resolve_teacher_user_id(request)
        if error:
            return error

        params = request.data if request.method == "POST" else request.query_params
        advisory_id = params.get("advisory_id")
        subject_id = params.get("subject_id")
        grading_period = params.get("grading_period")

        missing = [f for f, v in [
            ("advisory_id", advisory_id),
            ("subject_id", subject_id),
            ("grading_period", grading_period),
        ] if not v]
        if missing:
            return Response(
                {"detail": f"Missing required fields: {', '.join(missing)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        subject_id = _int_param(subject_id, "subject_id")

        advisory = SectionAdvisory.objects.filter(
            advisory_id=_int_param(advisory_id, "advisory_id"), teacher_user_id=teacher_user_id
        ).first()
        if advisory is None:
            return Response(
                {"detail": "Advisory not found or not assigned to this teacher."},
                status=status.HTTP_404_NOT_FOUND,
            )

        enrollment_qs = advisory_roster(advisory).select_related("student")
        enrollments_by_student = {e.student_id: e for e in enrollment_qs}

        if request.method == "POST":
            ensure_open(advisory.school_year)
            entries = request.data.get("grades", [])
            if not isinstance(entries, list) or not entries:
                return Response(
                    {"detail": "A non-empty 'grades' list is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            saved, failed = [], []
            with transaction.atomic():
                for entry in entries:
                    student_id = entry.get("student_id")
                    enrollment = enrollments_by_student.get(student_id)
                    if enrollment is None:
                        failed.append({"student_id": student_id, "reason": "Not in this section's roster."})
                        continue
                    payload = {
                        "enrollment": enrollment.enrollment_id,
                        "subject": subject_id,
                        "grading_period": grading_period,
                        "numeric_grade": entry.get("numeric_grade"),
                        "remarks": entry.get("remarks"),
                    }
                    existing = Grade.objects.filter(
                        enrollment=enrollment, subject_id=subject_id, grading_period=grading_period,
                    ).first()
                    serializer = GradeSerializer(
                        instance=existing, data=payload, context={"request": request},
                    )
                    if not serializer.is_valid():
                        failed.append({"student_id": student_id, "reason": str(serializer.errors)})
                        continue
                    grade = serializer.save()
                    saved.append({"student_id": student_id, "grade_id": grade.grade_id})

            return Response(
                {"saved": saved, "failed": failed},
                status=status.HTTP_207_MULTI_STATUS if failed else status.HTTP_200_OK,
            )

        # GET: return roster + existing grades for this subject/period
        existing_grades = {
            g.enrollment.student_id: g
            for g in Grade.objects.filter(
                enrollment__in=enrollments_by_student.values(),
                subject_id=subject_id,
                grading_period=grading_period,
            ).select_related("enrollment")
        }

        rows = []
        for e in sorted(
            enrollments_by_student.values(),
            key=lambda e: (e.student.last_name, e.student.first_name),
        ):
            grade = existing_grades.get(e.student_id)
            rows.append({
                "student": StudentSummarySerializer(e.student).data,
                "enrollment_id": e.enrollment_id,
                "grade": GradeSerializer(grade).data if grade else None,
            })

        return Response(rows)

    @action(detail=False, methods=["get", "post"], url_path="section-narrative-reports")
    def section_narrative_reports(self, request):
        """
        GET /api/section-advisories/section-narrative-reports/
            ?advisory_id=<id>&grading_period=<period>

        Returns each roster student alongside their existing narrative
        ratings (keyed by category_id) for the given grading period — the
        data backing the "Narrative Report" grid on the My Sections page.
        Active categories themselves come from the existing
        /narrative-categories/ endpoint (teacher-read-only, managed by
        admin/registrar), not from here.

        POST same body (JSON) plus `ratings`: [{student_id, category_id,
        rating}, ...] — creates or updates a NarrativeReport per
        (student, category) in one call.

        Scoping is identical to section-grades: teachers are pinned to their
        own advisories; staff must pass ?teacher_user_id=.
        """
        from grades.models import NarrativeReport
        from grades.serializers import NarrativeReportSerializer

        teacher_user_id, error = self._resolve_teacher_user_id(request)
        if error:
            return error

        params = request.data if request.method == "POST" else request.query_params
        advisory_id = params.get("advisory_id")
        grading_period = params.get("grading_period")

        missing = [f for f, v in [
            ("advisory_id", advisory_id),
            ("grading_period", grading_period),
        ] if not v]
        if missing:
            return Response(
                {"detail": f"Missing required fields: {', '.join(missing)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        advisory = SectionAdvisory.objects.filter(
            advisory_id=_int_param(advisory_id, "advisory_id"), teacher_user_id=teacher_user_id
        ).first()
        if advisory is None:
            return Response(
                {"detail": "Advisory not found or not assigned to this teacher."},
                status=status.HTTP_404_NOT_FOUND,
            )

        enrollment_qs = advisory_roster(advisory).select_related("student")
        enrollments_by_student = {e.student_id: e for e in enrollment_qs}

        if request.method == "POST":
            ensure_open(advisory.school_year)
            entries = request.data.get("ratings", [])
            if not isinstance(entries, list) or not entries:
                return Response(
                    {"detail": "A non-empty 'ratings' list is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            saved, failed = [], []
            with transaction.atomic():
                for entry in entries:
                    student_id = entry.get("student_id")
                    enrollment = enrollments_by_student.get(student_id)
                    if enrollment is None:
                        failed.append({"student_id": student_id, "reason": "Not in this section's roster."})
                        continue
                    category_id = entry.get("category_id")
                    payload = {
                        "enrollment": enrollment.enrollment_id,
                        "category": category_id,
                        "grading_period": grading_period,
                        "rating": entry.get("rating"),
                    }
                    existing = NarrativeReport.objects.filter(
                        enrollment=enrollment, category_id=category_id, grading_period=grading_period,
                    ).first()
                    serializer = NarrativeReportSerializer(
                        instance=existing, data=payload, context={"request": request},
                    )
                    if not serializer.is_valid():
                        failed.append({"student_id": student_id, "reason": str(serializer.errors)})
                        continue
                    report = serializer.save()
                    saved.append({"student_id": student_id, "report_id": report.report_id})

            return Response(
                {"saved": saved, "failed": failed},
                status=status.HTTP_207_MULTI_STATUS if failed else status.HTTP_200_OK,
            )

        # GET: return roster + existing ratings for this period
        existing_reports = NarrativeReport.objects.filter(
            enrollment__in=enrollments_by_student.values(), grading_period=grading_period,
        ).select_related("enrollment")
        ratings_by_student = {}
        for r in existing_reports:
            ratings_by_student.setdefault(r.enrollment.student_id, {})[r.category_id] = r.rating

        rows = []
        for e in sorted(
            enrollments_by_student.values(),
            key=lambda e: (e.student.last_name, e.student.first_name),
        ):
            rows.append({
                "student": StudentSummarySerializer(e.student).data,
                "enrollment_id": e.enrollment_id,
                "ratings": ratings_by_student.get(e.student_id, {}),
            })

        return Response(rows)

    @action(detail=False, methods=["get", "post"], url_path="section-attendance")
    def section_attendance(self, request):
        """
        GET /api/section-advisories/section-attendance/
            ?advisory_id=<id>&date=YYYY-MM-DD

        Returns each roster student alongside their existing
        AttendanceRecord (or null) for that date — the data backing the
        "quick attendance" grid on the My Sections page, so a teacher can
        mark their whole section for the day without leaving the page.

        POST same body (JSON) plus `records`: [{student_id, status, remarks},
        ...] — creates or updates one AttendanceRecord per student for that
        date in a single call (status one of P/A/L/E).

        Scoping is identical to section-grades: teachers are pinned to their
        own advisories; staff must pass ?teacher_user_id=.
        """
        from attendance.models import AttendanceRecord

        teacher_user_id, error = self._resolve_teacher_user_id(request)
        if error:
            return error

        params = request.data if request.method == "POST" else request.query_params
        advisory_id = params.get("advisory_id")
        day = params.get("date")

        missing = [f for f, v in [("advisory_id", advisory_id), ("date", day)] if not v]
        if missing:
            return Response(
                {"detail": f"Missing required fields: {', '.join(missing)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        day = _date_param(day, "date")

        advisory = SectionAdvisory.objects.filter(
            advisory_id=_int_param(advisory_id, "advisory_id"), teacher_user_id=teacher_user_id
        ).first()
        if advisory is None:
            return Response(
                {"detail": "Advisory not found or not assigned to this teacher."},
                status=status.HTTP_404_NOT_FOUND,
            )

        enrollment_qs = advisory_roster(advisory).select_related("student")
        enrollments_by_student = {e.student_id: e for e in enrollment_qs}

        if request.method == "POST":
            ensure_open(advisory.school_year)
            entries = request.data.get("records", [])
            valid_statuses = {"P", "A", "L", "E"}
            if not isinstance(entries, list) or not entries:
                return Response(
                    {"detail": "A non-empty 'records' list is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if day > timezone.localdate():
                return Response(
                    {"detail": "Attendance can't be recorded for a day that hasn't happened yet."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            outside = date_outside_school_year(day, advisory.school_year)
            if outside:
                return Response({"detail": outside}, status=status.HTTP_400_BAD_REQUEST)
            saved, failed = [], []
            recorded_by = getattr(request.user, "user_id", None) or getattr(request.user, "id", None)
            with transaction.atomic():
                for entry in entries:
                    student_id = entry.get("student_id")
                    enrollment = enrollments_by_student.get(student_id)
                    if enrollment is None:
                        failed.append({"student_id": student_id, "reason": "Not in this section's roster."})
                        continue
                    entry_status = entry.get("status")
                    if entry_status not in valid_statuses:
                        failed.append({"student_id": student_id, "reason": "Invalid status."})
                        continue
                    record, _ = AttendanceRecord.objects.update_or_create(
                        enrollment=enrollment,
                        date=day,
                        defaults={
                            "status": entry_status,
                            "remarks": entry.get("remarks") or "",
                            "recorded_by": recorded_by,
                        },
                    )
                    saved.append({"student_id": student_id, "attendance_id": record.attendance_id})

            return Response(
                {"saved": saved, "failed": failed},
                status=status.HTTP_207_MULTI_STATUS if failed else status.HTTP_200_OK,
            )

        # GET: return roster + existing attendance for this date
        existing_records = {
            r.enrollment.student_id: r
            for r in AttendanceRecord.objects.filter(
                enrollment__in=enrollments_by_student.values(), date=day,
            ).select_related("enrollment")
        }

        rows = []
        for e in sorted(
            enrollments_by_student.values(),
            key=lambda e: (e.student.last_name, e.student.first_name),
        ):
            record = existing_records.get(e.student_id)
            rows.append({
                "student": StudentSummarySerializer(e.student).data,
                "enrollment_id": e.enrollment_id,
                "attendance": {
                    "attendance_id": record.attendance_id,
                    "status": record.status,
                    "remarks": record.remarks,
                } if record else None,
            })

        return Response(rows)

    @action(detail=False, methods=["get"], url_path="section-attendance-stats")
    def section_attendance_stats(self, request):
        """
        GET /api/section-advisories/section-attendance-stats/
            ?advisory_id=<id>&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD

        Aggregated attendance stats for a teacher's section over a date
        range (defaults to the advisory's whole school_year if omitted) —
        backs the "Stats" tab on the My Sections page.

        "Total school days" is defined as the count of distinct dates on
        which at least one AttendanceRecord was recorded for this section
        (there is no stored semester-date-range config to derive it from
        otherwise) — so it reflects days actually taken, not the calendar.

        Returns:
          {
            "date_from", "date_to", "total_school_days",
            "totals": {present, absent, late, excused, total_marks},
            "daily": [{date, present, absent, late, excused, total}, ...],
            "per_student": [{student_id, name, lrn, present, absent, late,
                              excused, total, attendance_rate}, ...],
          }
        """
        from django.db.models import Count, Q
        from attendance.models import AttendanceRecord

        teacher_user_id, error = self._resolve_teacher_user_id(request)
        if error:
            return error

        advisory_id = request.query_params.get("advisory_id")
        if not advisory_id:
            return Response(
                {"detail": "Missing required field: advisory_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        advisory = SectionAdvisory.objects.filter(
            advisory_id=_int_param(advisory_id, "advisory_id"), teacher_user_id=teacher_user_id
        ).first()
        if advisory is None:
            return Response(
                {"detail": "Advisory not found or not assigned to this teacher."},
                status=status.HTTP_404_NOT_FOUND,
            )

        enrollment_qs = advisory_roster(advisory).select_related("student")
        enrollments_by_student = {e.student_id: e for e in enrollment_qs}

        records_qs = AttendanceRecord.objects.filter(
            enrollment__in=enrollments_by_student.values()
        )

        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if date_from:
            records_qs = records_qs.filter(date__gte=_date_param(date_from, "date_from"))
        if date_to:
            records_qs = records_qs.filter(date__lte=_date_param(date_to, "date_to"))

        totals = records_qs.aggregate(
            total_marks=Count("attendance_id"),
            present=Count("attendance_id", filter=Q(status="P")),
            absent=Count("attendance_id", filter=Q(status="A")),
            late=Count("attendance_id", filter=Q(status="L")),
            excused=Count("attendance_id", filter=Q(status="E")),
        )

        daily = list(
            records_qs.values("date")
            .annotate(
                present=Count("attendance_id", filter=Q(status="P")),
                absent=Count("attendance_id", filter=Q(status="A")),
                late=Count("attendance_id", filter=Q(status="L")),
                excused=Count("attendance_id", filter=Q(status="E")),
                total=Count("attendance_id"),
            )
            .order_by("date")
        )

        per_student_rows = (
            records_qs.values("enrollment_id")
            .annotate(
                present=Count("attendance_id", filter=Q(status="P")),
                absent=Count("attendance_id", filter=Q(status="A")),
                late=Count("attendance_id", filter=Q(status="L")),
                excused=Count("attendance_id", filter=Q(status="E")),
                total=Count("attendance_id"),
            )
        )
        stats_by_enrollment = {row["enrollment_id"]: row for row in per_student_rows}

        per_student = []
        for e in sorted(
            enrollments_by_student.values(),
            key=lambda e: (e.student.last_name, e.student.first_name),
        ):
            row = stats_by_enrollment.get(e.enrollment_id)
            present = row["present"] if row else 0
            absent = row["absent"] if row else 0
            late = row["late"] if row else 0
            excused = row["excused"] if row else 0
            total = row["total"] if row else 0
            per_student.append({
                "student_id": e.student_id,
                "name": " ".join(filter(None, [
                    e.student.first_name, e.student.middle_name,
                    e.student.last_name, e.student.suffix,
                ])),
                "lrn": e.student.lrn,
                "present": present,
                "absent": absent,
                "late": late,
                "excused": excused,
                "total": total,
                "attendance_rate": round((present + late) / total * 100, 1) if total else None,
            })

        return Response({
            "date_from": date_from,
            "date_to": date_to,
            "total_school_days": len(daily),
            "totals": totals,
            "daily": daily,
            "per_student": per_student,
        })

    @action(detail=False, methods=["get"], url_path="section-grades-summary")
    def section_grades_summary(self, request):
        """
        GET /api/section-advisories/section-grades-summary/?advisory_id=<id>

        Section-wide grade metrics across every subject/period recorded so
        far this school year — backs the Stats tab's average grade, pass
        rate, and grade-distribution panel. Unlike section-grades (which is
        scoped to one subject + period for the entry grid), this rolls up
        every Grade row for the roster's current enrollments.

        Returns:
          {
            "average": float|null, "pass_rate": float|null, "graded_count": int,
            "distribution": {"90_100": int, "75_89": int, "below_75": int},
          }
        """
        from django.db.models import Avg, Count, Q
        from grades.models import Grade

        teacher_user_id, error = self._resolve_teacher_user_id(request)
        if error:
            return error

        advisory_id = request.query_params.get("advisory_id")
        if not advisory_id:
            return Response(
                {"detail": "Missing required field: advisory_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        advisory = SectionAdvisory.objects.filter(
            advisory_id=_int_param(advisory_id, "advisory_id"), teacher_user_id=teacher_user_id
        ).first()
        if advisory is None:
            return Response(
                {"detail": "Advisory not found or not assigned to this teacher."},
                status=status.HTTP_404_NOT_FOUND,
            )

        enrollment_qs = advisory_roster(advisory)

        grades_qs = Grade.objects.filter(enrollment__in=enrollment_qs)

        agg = grades_qs.aggregate(
            average=Avg("numeric_grade"),
            graded_count=Count("grade_id"),
            passed=Count("grade_id", filter=Q(numeric_grade__gte=75)),
            above_90=Count("grade_id", filter=Q(numeric_grade__gte=90)),
            mid_75_89=Count("grade_id", filter=Q(numeric_grade__gte=75, numeric_grade__lt=90)),
            below_75=Count("grade_id", filter=Q(numeric_grade__lt=75)),
        )

        graded_count = agg["graded_count"]
        average = round(float(agg["average"]), 1) if agg["average"] is not None else None
        pass_rate = round(agg["passed"] / graded_count * 100, 1) if graded_count else None

        return Response({
            "average": average,
            "pass_rate": pass_rate,
            "graded_count": graded_count,
            "distribution": {
                "90_100": agg["above_90"],
                "75_89": agg["mid_75_89"],
                "below_75": agg["below_75"],
            },
        })


def _sync_school_settings(year):
    """
    Copy the current year and its dates onto School Settings.

    Transitional. The registry is the source now, but school_settings still
    carries current_school_year / sy_start_date / sy_end_date and some readers
    haven't moved yet (the settings API, SchoolFormsPage's default). Keeping
    the row in step means none of them can disagree with the registry while
    they move; once they have, those columns go. It's billing-service's table
    -- a cross-service write on the shared database, in the same transaction
    as the change it mirrors.
    """
    with connection.cursor() as cur:
        cur.execute(
            """
            UPDATE school_settings
               SET current_school_year = %s, sy_start_date = %s, sy_end_date = %s,
                   updated_at = now()
             WHERE setting_id = (SELECT min(setting_id) FROM school_settings)
            """,
            [year.label, year.start_date, year.end_date],
        )


class SchoolYearViewSet(viewsets.ModelViewSet):
    """
    /api/school-years/                         GET list · POST create
    /api/school-years/{label}/                 GET · PATCH (dates) · DELETE
    /api/school-years/{label}/make-current/    POST
    /api/school-years/{label}/archive/         POST
    /api/school-years/{label}/unarchive/       POST
    /api/school-years/compare/?years=a,b       GET  (admin-only)

    The registry of school years: which exist, each one's dates, and which is
    current. Every year picker reads it, so reads are open to all staff.
    Writes are super_admin/admin only -- which year the whole school works in
    is not a registrar decision.

    Unpaginated: a school gains one year per year.
    """

    queryset = SchoolYear.objects.all()
    serializer_class = SchoolYearSerializer
    permission_classes = [HasRole]
    required_roles = STAFF_FULL_WRITE_ROLES
    read_roles = {"super_admin", "admin", "registrar", "teacher", "accounting"}
    lookup_field = "label"
    lookup_value_regex = r"\d{4}-\d{4}"
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    pagination_class = None

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["current_label"] = (
            SchoolYear.objects.filter(is_current=True).values_list("label", flat=True).first()
        )
        return context

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        # The page shows how much each year holds, and whether it can still be
        # deleted, without a second request per year.
        counts = {
            r["school_year"]: r["count"]
            for r in Enrollment.objects.order_by().values("school_year").annotate(count=Count("pk"))
        }
        for row in response.data:
            row["enrollment_count"] = counts.get(row["label"], 0)
        return response

    def perform_update(self, serializer):
        if serializer.instance.archived_at:
            raise YearArchived(
                f"S.Y. {serializer.instance.label} is archived. Unarchive it to change its dates."
            )
        with transaction.atomic():
            year = serializer.save()
            if year.is_current:
                _sync_school_settings(year)

    def destroy(self, request, *args, **kwargs):
        year = self.get_object()
        if year.is_current:
            return Response(
                {"detail": f"S.Y. {year.label} is the current year. Make another year current first."},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            with transaction.atomic():
                year.delete()
        except (IntegrityError, ProtectedError):
            # The foreign keys from 0006 (and sections' own) refuse it while
            # anything is filed under this year.
            return Response(
                {"detail": (
                    f"S.Y. {year.label} still has records (sections, enrollments, "
                    "advisers, calendar events or risk runs), so it can't be deleted."
                )},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="make-current")
    def make_current(self, request, label=None):
        """
        Make this the year every page opens on. One transaction: the old
        current year is unset, this one set, School Settings synced. The old
        year is NOT archived -- final grades and late payments still land in
        it after the switch.
        """
        year = self.get_object()
        if year.archived_at:
            return Response(
                {"detail": f"S.Y. {year.label} is archived, so it can't be made current."},
                status=status.HTTP_409_CONFLICT,
            )
        with transaction.atomic():
            # Unset first: the partial unique index allows one current row at
            # a time, checked per statement.
            SchoolYear.objects.filter(is_current=True).exclude(pk=year.pk).update(
                is_current=False, updated_at=timezone.now(),
            )
            if not year.is_current:
                year.is_current = True
                year.save(update_fields=["is_current", "updated_at"])
            _sync_school_settings(year)
        serializer = self.get_serializer(year, context={**self.get_serializer_context(), "current_label": year.label})
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def archive(self, request, label=None):
        """
        Close a finished year: everything filed under it becomes read-only
        (enrollments/archive.py). Only a year that has ended can be archived
        -- not the current one, which every page opens on, and not one still
        to come. Payments against it still go through.

        Doesn't wait for the year to be tidy: learners left "enrolled" or
        "pending" stay that way, and the year page warns about them first.
        """
        year = self.get_object()
        if year.archived_at:
            return Response(self.get_serializer(year).data)
        current_label = self.get_serializer_context()["current_label"]
        if year.is_current:
            return Response(
                {"detail": f"S.Y. {year.label} is the current year. Make the next year current first."},
                status=status.HTTP_409_CONFLICT,
            )
        if year.state(current_label) == "upcoming":
            return Response(
                {"detail": f"S.Y. {year.label} hasn't started yet, so there's nothing to archive."},
                status=status.HTTP_409_CONFLICT,
            )
        year.archived_at = timezone.now()
        year.archived_by = getattr(request.user, "user_id", None) or getattr(request.user, "id", None)
        year.save(update_fields=["archived_at", "archived_by", "updated_at"])
        return Response(self.get_serializer(year).data)

    @action(detail=True, methods=["post"])
    def unarchive(self, request, label=None):
        """Reopen an archived year for corrections. Archive it again after."""
        year = self.get_object()
        if year.archived_at:
            year.archived_at = None
            year.archived_by = None
            year.save(update_fields=["archived_at", "archived_by", "updated_at"])
        return Response(self.get_serializer(year).data)

    @action(detail=False, methods=["get"])
    def compare(self, request):
        """
        GET /api/school-years/compare/?years=2024-2025,2025-2026,2026-2027

        Up to five registered years side by side, oldest first: learners,
        sections, grades, attendance and scholarships (enrollments/
        year_compare.py says what each number counts). Money is billing's;
        the page reads it from /api/invoices/financial-summary/ per year.

        Admin-only like the School Years pages: these are school-wide
        figures, and the viewset's wider read_roles are for the year pickers.
        """
        if getattr(request.user, "role", None) not in STAFF_FULL_WRITE_ROLES:
            return Response(
                {"detail": "Your role does not have access to this action."},
                status=status.HTTP_403_FORBIDDEN,
            )
        raw = [part for part in (request.query_params.get("years") or "").split(",") if part.strip()]
        if not raw:
            return Response({"detail": "Pick at least one school year."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            labels = sorted({normalize_school_year(part) for part in raw})
        except InvalidSchoolYear as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if len(labels) > year_compare.MAX_YEARS:
            return Response(
                {"detail": f"Compare up to {year_compare.MAX_YEARS} years at a time."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        registered = set(SchoolYear.objects.values_list("label", flat=True))
        unknown = [label for label in labels if label not in registered]
        if unknown:
            return Response(
                {"detail": f"S.Y. {', '.join(unknown)} isn't a registered year."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(year_compare.gather(labels, registered))

    # In the order they're applied: advisers land in sections, so sections
    # copied in the same run have to exist first.
    CARRY_OVER_PARTS = ("sections", "advisers", "calendar", "subjects")

    @action(detail=True, methods=["post"], url_path="carry-over")
    def carry_over(self, request, label=None):
        """
        POST /api/school-years/{label}/carry-over/
        Body: {"from": "2025-2026", "parts": ["sections", "advisers"], "dry_run": true}

        Start this year from an earlier one: copy the chosen parts across so
        that what didn't change needs no retyping. Any earlier year works,
        not only the last.

        Never overwrites. A section this year already has (same grade, same
        name, any capitalisation) is skipped and reported; so is an adviser
        whose section already has one here. Running it twice, or after
        setting a few things up by hand, is safe. dry_run answers the same
        question without writing -- the preview.

        Parts: "sections", "advisers", "calendar", "subjects". Fees are billing's to copy
        (POST /api/fee-schedules/carry-over/ on billing-service).
        """
        target = self.get_object()
        source_label = (request.data.get("from") or "").strip()
        parts = request.data.get("parts") or list(self.CARRY_OVER_PARTS)
        dry_run = bool(request.data.get("dry_run", False))

        unknown = [p for p in parts if p not in self.CARRY_OVER_PARTS]
        if unknown:
            return Response(
                {"detail": f"Can't carry over {', '.join(unknown)} yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target.archived_at:
            return Response(
                {"detail": f"S.Y. {target.label} is archived."},
                status=status.HTTP_409_CONFLICT,
            )
        source = SchoolYear.objects.filter(label=source_label).first()
        if source is None:
            return Response(
                {"detail": f"S.Y. {source_label or '(none)'} isn't a registered year."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if source.pk == target.pk:
            return Response(
                {"detail": "Pick a different year to copy from."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = {"from": source.label, "to": target.label, "dry_run": dry_run}
        # All or nothing: advisers placed into sections this same run created.
        with transaction.atomic():
            if "sections" in parts:
                result["sections"] = self._carry_over_sections(source, target, dry_run)
            if "advisers" in parts:
                # On a dry run the copied sections don't exist yet, but the
                # preview still has to count advisers going into them.
                planned = result["sections"]["copied"] if dry_run and "sections" in parts else []
                result["advisers"] = self._carry_over_advisers(source, target, dry_run, planned)
            if "calendar" in parts:
                result["calendar"] = self._carry_over_calendar(source, target, dry_run)
            if "subjects" in parts:
                result["subjects"] = self._carry_over_subjects(source, target, dry_run)
        return Response(result)

    def _carry_over_sections(self, source, target, dry_run):
        existing = {
            (grade, name.lower())
            for grade, name in Section.objects.filter(school_year=target).values_list("grade_level", "name")
        }
        copied, skipped = [], []
        for sec in Section.objects.filter(school_year=source).order_by("grade_level", "name"):
            row = {"grade_level": sec.grade_level, "name": sec.name, "strand": sec.strand}
            if (sec.grade_level, sec.name.lower()) in existing:
                skipped.append(row)
            else:
                copied.append(row)
        if copied and not dry_run:
            Section.objects.bulk_create([
                Section(
                    school_year=target,
                    school_level=school_level_for_grade(r["grade_level"]) or "elementary",
                    grade_level=r["grade_level"],
                    name=r["name"],
                    strand=r["strand"],
                )
                for r in copied
            ])
        return {"copied": copied, "skipped": skipped}

    def _carry_over_advisers(self, source, target, dry_run, planned_sections=()):
        """
        Each of the source year's advisers goes to the section of the same
        name and grade here. Skipped, with a reason:
          no_section   -- this year has no such section
          already      -- they already advise it this year
          has_adviser  -- someone else already does; not overwritten
          not_a_teacher -- the account is gone or no longer a teacher
          inactive     -- the teacher's account is deactivated (they left)
        A section's co-advisers carry over together.
        """
        from accounts.models import User

        sections = {
            (s["grade_level"], s["name"].lower()): s
            for s in Section.objects.filter(school_year=target).values("grade_level", "name", "strand")
        }
        for r in planned_sections:
            sections.setdefault((r["grade_level"], r["name"].lower()), r)

        advised = {}
        for grade, name, teacher in (
            SectionAdvisory.objects.filter(school_year=target.label)
            .values_list("grade_level", "section", "teacher_user_id")
        ):
            advised.setdefault((grade, name.lower()), set()).add(teacher)

        source_rows = list(
            SectionAdvisory.objects.filter(school_year=source.label)
            .order_by("grade_level", "section", "teacher_user_id")
        )
        teachers = {
            user_id: (name, is_active)
            for user_id, name, is_active in User.objects.filter(
                user_id__in={a.teacher_user_id for a in source_rows}, role="teacher",
            ).values_list("user_id", "name", "is_active")
        }

        copied, skipped = [], []
        for adv in source_rows:
            key = (adv.grade_level, adv.section.lower())
            section = sections.get(key)
            teacher = teachers.get(adv.teacher_user_id)
            row = {
                "teacher_user_id": adv.teacher_user_id,
                "teacher_name":    teacher[0] if teacher else None,
                "grade_level":     adv.grade_level,
                "section":         section["name"] if section else adv.section,
                "strand":          section["strand"] if section else adv.strand,
            }
            if teacher is None:
                skipped.append({**row, "reason": "not_a_teacher"})
            elif not teacher[1]:
                skipped.append({**row, "reason": "inactive"})
            elif section is None:
                skipped.append({**row, "reason": "no_section"})
            elif adv.teacher_user_id in advised.get(key, ()):
                skipped.append({**row, "reason": "already"})
            elif advised.get(key):
                skipped.append({**row, "reason": "has_adviser"})
            else:
                copied.append(row)

        if copied and not dry_run:
            SectionAdvisory.objects.bulk_create([
                SectionAdvisory(
                    teacher_user_id=r["teacher_user_id"],
                    school_year=target.label,
                    school_level=school_level_for_grade(r["grade_level"]) or "elementary",
                    grade_level=r["grade_level"],
                    section=r["section"],
                    strand=r["strand"],
                )
                for r in copied
            ])
        return {"copied": copied, "skipped": skipped}

    def _carry_over_calendar(self, source, target, dry_run):
        """
        The source year's calendar, moved to the same day and month in the
        target year (2025-2026 -> 2026-2027 is one year on). Right for fixed
        holidays and a fair first draft of the rest; holidays that move
        (Holy Week, Eid) and the quarter dates need checking, which the
        preview says.

        Skipped: an event this year already has (same type, same title, any
        capitalisation), and a quarter this year already has dates for.
        """
        from academic_calendar.models import CalendarEvent

        shift = int(target.label[:4]) - int(source.label[:4])

        def moved(day):
            try:
                return day.replace(year=day.year + shift)
            except ValueError:          # 29 February into a common year
                return day.replace(year=day.year + shift, day=28)

        existing = {
            (event_type, title.lower())
            for event_type, title in CalendarEvent.objects.filter(school_year=target.label)
            .values_list("event_type", "title")
        }
        quarters = set(
            CalendarEvent.objects.filter(school_year=target.label, grading_period__isnull=False)
            .values_list("grading_period", flat=True)
        )
        copied, skipped = [], []
        for event in CalendarEvent.objects.filter(school_year=source.label).order_by("start_date", "title"):
            row = {
                "title":          event.title,
                "event_type":     event.event_type,
                "grading_period": event.grading_period,
                "start_date":     moved(event.start_date),
                "end_date":       moved(event.end_date),
                "description":    event.description,
            }
            if (event.event_type, event.title.lower()) in existing or event.grading_period in quarters:
                skipped.append(row)
            else:
                copied.append(row)
        if copied and not dry_run:
            CalendarEvent.objects.bulk_create([
                CalendarEvent(school_year=target.label, **row) for row in copied
            ])
        def listed(rows):
            # The preview names each event; descriptions would only crowd it.
            return [{k: v for k, v in r.items() if k != "description"} for r in rows]

        return {"shift_years": shift, "copied": listed(copied), "skipped": listed(skipped)}

    def _carry_over_subjects(self, source, target, dry_run):
        """
        The source year's curriculum as it stood: codes, names, grades,
        strands, semesters and grading templates, ready to adjust for what
        changed. Skipped: a subject this year already has (same code, any
        capitalisation).
        """
        from subjects.models import Subject

        existing = {
            code.lower()
            for code in Subject.objects.filter(school_year=target.label).values_list("subject_code", flat=True)
        }
        copied, skipped = [], []
        for sub in Subject.objects.filter(school_year=source.label).order_by("grade_level", "subject_name"):
            row = {
                "subject_code":        sub.subject_code,
                "subject_name":        sub.subject_name,
                "school_level":        sub.school_level,
                "grade_level":         sub.grade_level,
                "strand":              sub.strand,
                "semester":            sub.semester,
                "grading_template_id": sub.grading_template_id,
            }
            (skipped if sub.subject_code.lower() in existing else copied).append(row)
        if copied and not dry_run:
            Subject.objects.bulk_create([Subject(school_year=target.label, **row) for row in copied])

        def listed(rows):
            return [{k: v for k, v in r.items() if k != "grading_template_id"} for r in rows]

        return {"copied": listed(copied), "skipped": listed(skipped)}

    @action(detail=True, methods=["get"], url_path="setup")
    def setup(self, request, label=None):
        """
        GET /api/school-years/{label}/setup/

        The numbers behind the year page's setup checklist: sections set up,
        how many have an adviser, which grades have subjects and fees, and
        whether the calendar has its quarter dates and holidays.

        Fees are billing-service's table, read here the way billing reads
        enrollments: raw SQL on the shared database, never written.
        """
        from academic_calendar.models import CalendarEvent
        from subjects.models import Subject

        year = self.get_object()
        sections = Section.objects.filter(school_year=year)
        section_keys = set(sections.values_list("grade_level", "name"))
        advised = set(
            SectionAdvisory.objects.filter(school_year=year.label)
            .values_list("grade_level", "section")
            .distinct()
        )
        events = CalendarEvent.objects.filter(school_year=year.label)
        subjects = Subject.objects.filter(school_year=year.label)
        with connection.cursor() as cur:
            cur.execute(
                "SELECT COUNT(DISTINCT grade_level) FROM fee_schedules WHERE school_year = %s AND is_active",
                [year.label],
            )
            fee_grades = cur.fetchone()[0]
        statuses = dict(
            Enrollment.objects.filter(school_year=year.label).order_by()
            .values_list("enrollment_status").annotate(n=Count("pk"))
        )
        return Response({
            # Learners not yet finished for the year. Archiving leaves them
            # as they are, so the archive confirm names them.
            "enrollments": {
                "total": sum(statuses.values()),
                "unfinished": statuses.get("enrolled", 0) + statuses.get("pending", 0),
            },
            "sections": {
                "count": len(section_keys),
                "grades": len({grade for grade, _ in section_keys}),
            },
            "advisers": {
                "sections": len(section_keys),
                "with_adviser": len(section_keys & advised),
            },
            "subjects": {
                "count": subjects.count(),
                "grades": subjects.values("grade_level").distinct().count(),
                "of": len(GRADE_ORDER),
                # Grades can't be computed for these until one is picked.
                "without_template": subjects.filter(grading_template__isnull=True).count(),
            },
            "fees": {"grades": fee_grades, "of": len(GRADE_ORDER)},
            "calendar": {
                "quarters_set": (
                    events.filter(event_type="grading_period")
                    .exclude(grading_period__isnull=True)
                    .values("grading_period").distinct().count()
                ),
                "holidays": events.filter(event_type="holiday").count(),
            },
        })


class SectionViewSet(ArchivedYearGuard, viewsets.ModelViewSet):
    """
    /api/sections/?school_year=2026-2027[&grade_level=Grade 7][&school_level=...]

    The sections of each school year. Reads are open to staff (every
    placement picker lists them); writes are admin/registrar -- a registrar
    enrolling a learner can add a missing section on the spot rather than
    waiting for an admin.

    Renaming cascades to every enrollment and advisory in the section (the
    composite foreign key's ON UPDATE CASCADE). Deleting is refused while
    any learner or adviser is filed under it.

    Unpaginated: a year has tens of sections, not thousands.
    """

    queryset = Section.objects.all()
    serializer_class = SectionSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("grade_level", "school_level")
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        year = (self.request.query_params.get("school_year") or "").strip()
        if year:
            qs = qs.filter(school_year_id=year)
        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        years = set(queryset.values_list("school_year_id", flat=True))
        context = {
            **self.get_serializer_context(),
            "enrollment_counts": self._counts(Enrollment.objects.exclude(enrollment_status="cancelled"), years),
            "adviser_counts": self._counts(SectionAdvisory.objects.all(), years),
        }
        return Response(SectionSerializer(queryset, many=True, context=context).data)

    @staticmethod
    def _counts(qs, years):
        rows = (
            qs.filter(school_year__in=years).order_by()
            .values("school_year", "grade_level", "section")
            .annotate(n=Count("pk"))
        )
        return {(r["school_year"], r["grade_level"], r["section"]): r["n"] for r in rows}

    def perform_update(self, serializer):
        before = serializer.instance.strand
        with transaction.atomic():
            section = super().perform_update(serializer)
            # The name cascades through the foreign key; the strand isn't part
            # of it, so the learners and advisers in this section follow it here.
            if section.strand != before:
                placed = dict(
                    school_year=section.school_year_id,
                    grade_level=section.grade_level,
                    section=section.name,
                )
                Enrollment.objects.filter(**placed).update(strand=section.strand)
                SectionAdvisory.objects.filter(**placed).update(strand=section.strand)

    def destroy(self, request, *args, **kwargs):
        section = self.get_object()
        try:
            with transaction.atomic():
                self.perform_destroy(section)
        except IntegrityError:
            return Response(
                {"detail": (
                    f"{section.grade_level} \u00b7 {section.name} still has learners or an adviser, "
                    "so it can't be deleted. Move them to another section first."
                )},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class EnrollmentViewSet(ArchivedYearGuard, viewsets.ModelViewSet):
    """
    /api/enrollments/

    Filters:
      ?student=12
      ?school_year=2026-2027
      ?school_level=senior_highschool
      ?enrollment_status=enrolled
      ?search=Cruz       (matches student name, LRN, student_number, section)
    """

    queryset = Enrollment.objects.select_related("student", "guardian_response").all()
    serializer_class = EnrollmentSerializer
    permission_classes = [IsStaffOrOwnerGuardianReadOnly]
    owner_student_id_field = "student_id"  # obj is the Enrollment itself

    filter_backends = (DjangoFilterBackend, SearchFilter, OrderingFilter)
    filterset_class = EnrollmentFilter

    @action(detail=False, methods=["get"], url_path="school-years")
    def school_years(self, request):
        """
        GET /api/enrollments/school-years/

        Every registered school year, newest first, with its enrollment count
        and state, plus which one is current.

        The list and the current year both come from the school_years
        registry. They used to come from whatever labels enrollments happened
        to use, plus a year guessed from today's date on a July cutoff -- one
        of four places that each decided "the current year" on their own.
        The shape is unchanged ({"current", "results": [{"school_year",
        "count"}]}) apart from the added `state`, because the external mobile
        client reads it too.

        A label on an enrollment that isn't registered can only exist before
        migration 0006's foreign keys; it's still listed (state null) so no
        record becomes unreachable. The date guess survives only for a school
        that hasn't registered a current year at all.
        """
        from shared.school_year import current as guess_current_year

        # The viewset's permission class lets guardians read, but these are
        # school-wide counts and the guardian portal has no picker to feed.
        if getattr(request.user, "role", None) == "guardian":
            return Response({"detail": "You do not have access to this record."}, status=403)

        # Deliberately not self.get_queryset(): the picker is staff-facing
        # chrome and should list the same years regardless of who is looking,
        # rather than narrowing to one teacher's advisory sections.
        rows = (
            Enrollment.objects.exclude(school_year__isnull=True)
            .exclude(school_year="")
            .order_by()
            .values("school_year")
            .annotate(count=Count("pk"))
        )
        counts = {r["school_year"]: r["count"] for r in rows}

        years = list(SchoolYear.objects.all())
        current = next((y.label for y in years if y.is_current), None)
        states = {y.label: y.state(current) for y in years}

        if current is None:
            current = guess_current_year(timezone.localdate())

        labels = set(states) | set(counts) | {current}
        results = [
            {"school_year": y, "count": counts.get(y, 0), "state": states.get(y)}
            for y in sorted(labels, reverse=True)
        ]
        return Response({"current": current, "results": results})

    @action(detail=False, methods=["get"], url_path="unplaced")
    def unplaced(self, request):
        """
        GET /api/enrollments/unplaced/?school_year=2026-2027

        Active students with no row holding a place in that school year
        (shared.placement; default year: the registry's current one) -- the
        registrar's worklist of learners nobody has placed.

        The rule this checks: every `active` student holds exactly one active
        enrollment per school year. The unique index uq_enrollments_student_sy
        already stops them holding two; nothing stopped them holding none. An
        approved application or a counter registration creates the Student
        and hands off to the enrollment form, and a form abandoned there left
        a learner with no class, no SF1 line and no invoice, and no screen
        that would ever show them.

        Each result carries the learner's latest enrollment of any year, so
        the screen can suggest the next grade -- or show that there is none
        and this is a new learner.
        """
        if getattr(request.user, "role", None) not in ACADEMIC_STAFF_ROLES:
            return Response({"detail": "You do not have access to this record."}, status=403)

        raw_year = request.query_params.get("school_year")
        try:
            year = (
                school_year_rules.normalize(raw_year)
                if raw_year
                else school_year_rules.configured_current()
                or school_year_rules.current(timezone.localdate())
            )
        except school_year_rules.InvalidSchoolYear as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Which rows hold a place is shared.placement's rule, the same one the
        # Students page's "Not enrolled" filter applies. A learner who
        # transferred out this year left the school; there is nothing to
        # place. Their student record should say "transferred", but that is a
        # second call from the browser after Transfer Out, and a learner it
        # missed still reads as active -- 5 of the 68 names on this list had
        # left. A completed row holds the place too: without it, every learner
        # of a closed year was listed as waiting for a class in it.
        placed = {
            row["student_id"]
            for row in (
                Enrollment.objects.filter(school_year=year)
                .exclude(enrollment_status="cancelled")
                .values("student_id", "enrollment_status", "semester")
            )
            if placement.holds_place(row["enrollment_status"], row["semester"])
        }
        students = list(
            Student.objects.filter(status="active")
            .exclude(student_id__in=placed)
            .order_by("last_name", "first_name", "student_id")
        )

        # One query for everyone's history; the first row per student in this
        # ordering is their latest.
        latest = {}
        for e in (
            Enrollment.objects.filter(student_id__in=[st.student_id for st in students])
            .order_by("student_id", "-school_year", "-enrollment_id")
        ):
            latest.setdefault(e.student_id, e)

        results = []
        for st in students:
            last = latest.get(st.student_id)
            results.append({
                "student_id":     st.student_id,
                "student_number": st.student_number,
                "lrn":            st.lrn,
                "full_name":      " ".join(
                    p for p in (st.first_name, st.middle_name, st.last_name, st.suffix) if p
                ),
                "last_enrollment": {
                    "enrollment_id":     last.enrollment_id,
                    "school_year":       last.school_year,
                    "grade_level":       last.grade_level,
                    # Tells a finished Grade 12 (2nd semester) apart from
                    # one mid-year: the page offers "mark graduated" for it.
                    "semester":          last.semester,
                    "enrollment_status": last.enrollment_status,
                } if last else None,
            })

        return Response({"school_year": year, "count": len(results), "results": results})

    def get_queryset(self):
        qs = super().get_queryset()
        role = getattr(self.request.user, "role", None)
        # Guardians only ever see their own child(ren)'s enrollments; an
        # unlinked guardian gets an empty list (fail closed).
        if role == "guardian":
            qs = qs.filter(student_id__in=guardian_student_ids(self.request.user))
        # Teachers only see their own SectionAdvisory roster — matches how
        # grades/attendance are already scoped for the teacher role.
        elif role == "teacher":
            qs = qs.filter(student_id__in=teacher_student_ids(self.request.user))
        return qs
    search_fields = (
        "student__first_name",
        "student__middle_name",
        "student__last_name",
        "student__lrn",
        "student__student_number",
        "section",
    )
    ordering_fields = (
        "enrollment_id",
        "school_year",
        "school_level",
        "grade_level",
        "enrollment_status",
    )
    ordering = ("-enrollment_id",)

    def destroy(self, request, *args, **kwargs):
        # Deleting an enrollment cascaded away its grades, attendance, observed
        # values, score entries and transfer history (and 500ed on an invoiced
        # one). Nothing in the app deletes enrollments; a wrong one is cancelled,
        # the same rule students and invoices already follow.
        raise MethodNotAllowed(
            request.method,
            detail="Enrollments can't be deleted. Cancel the enrollment instead.",
        )

    def _save_override_audit(self, serializer, enrollment):
        """Create or update the override audit record for this enrollment."""
        user_id = getattr(self.request.user, "user_id", None) or getattr(self.request.user, "id", None) or 0
        reason = getattr(serializer, "_progression_override_reason", "") or "(no reason provided)"
        EnrollmentOverride.objects.update_or_create(
            enrollment=enrollment,
            defaults={
                "override_reason": reason,
                "overridden_by": user_id,
            },
        )

    # Placement fields an "internal move" (grade/section/strand change within
    # SLIS) can touch. Deliberately wider than serializers.PLACEMENT_FIELDS —
    # that guard excludes `section` (freely PATCHable, no override required),
    # but a section-only change is still a real move worth an audit row.
    _MOVE_TRACKED_FIELDS = ("school_year", "grade_level", "school_level", "strand", "section")

    def _log_internal_move_if_changed(self, serializer, before, enrollment):
        """Write an append-only EnrollmentTransfer row when a PATCH actually
        changed grade/section/strand placement — fires regardless of whether
        progression_override was used, so section-only moves get logged too
        (unlike EnrollmentOverride, which only fires on override and
        overwrites the previous reason rather than keeping history)."""
        changed = any(
            before.get(f) != getattr(enrollment, f, None) for f in self._MOVE_TRACKED_FIELDS
        )
        if not changed:
            return
        user_id = getattr(self.request.user, "user_id", None) or getattr(self.request.user, "id", None) or 0
        reason = getattr(serializer, "_progression_override_reason", "") or ""
        # The transfer row has no school-year columns, so a move between years
        # is spelled out in its reason rather than lost.
        if before.get("school_year") != getattr(enrollment, "school_year", None):
            moved = f"School year {before.get('school_year')} → {enrollment.school_year}."
            reason = f"{moved} {reason}".strip()
        EnrollmentTransfer.objects.create(
            enrollment=enrollment,
            transfer_type="internal_move",
            effective_date=timezone.localdate(),
            reason=reason,
            from_grade_level=before.get("grade_level"),
            from_section=before.get("section"),
            from_strand=before.get("strand"),
            to_grade_level=enrollment.grade_level,
            to_section=enrollment.section,
            to_strand=enrollment.strand,
            initiated_by=user_id,
        )

    def perform_create(self, serializer):
        enrollment = super().perform_create(serializer)
        if getattr(serializer, "_progression_override", False):
            self._save_override_audit(serializer, enrollment)
        # Give this student's guardians portal access once they're actually
        # enrolled. Idempotent and failure-swallowing by design — see
        # accounts/guardian_provisioning.py.
        provision_for_enrollment(enrollment)

    def perform_update(self, serializer):
        before = {f: getattr(serializer.instance, f, None) for f in self._MOVE_TRACKED_FIELDS}
        enrollment = super().perform_update(serializer)
        if getattr(serializer, "_progression_override", False):
            self._save_override_audit(serializer, enrollment)
        self._log_internal_move_if_changed(serializer, before, enrollment)
        # Also here, not just on create: an application is usually saved as
        # "pending" first and flipped to "enrolled" later, which is the moment
        # access should actually start.
        provision_for_enrollment(enrollment)

    @action(detail=True, methods=["post"], url_path="transfer-out")
    def transfer_out(self, request, pk=None):
        """
        POST /api/enrollments/{id}/transfer-out/

        Marks a currently-enrolled student as having left SLIS mid-year for
        another school: flips this enrollment's status to "transferred_out"
        and records an EnrollmentTransfer audit row. Deliberately does NOT
        touch Student.status or billing here — the frontend calls those
        separately in sequence, matching this codebase's existing
        frontend-orchestrated cross-service pattern (e.g. enroll -> then
        prompt to generate an invoice) rather than a backend-to-backend call.

        Body:
          {
            "effective_date": "2026-07-17",
            "reason": "Family relocating to Cebu",
            "destination_school_name": "Cebu City National HS"   // optional
          }
        """
        enrollment = self.get_object()
        ensure_open(enrollment.school_year)

        if enrollment.enrollment_status != "enrolled":
            return Response(
                {
                    "detail": (
                        f"Cannot transfer out an enrollment with status "
                        f"'{enrollment.enrollment_status}'. Only 'enrolled' records can be transferred out."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"detail": "reason is required."}, status=status.HTTP_400_BAD_REQUEST)

        effective_date = _parse_date(request.data.get("effective_date"))
        if effective_date is None:
            return Response(
                {"detail": "effective_date is required and must be a valid date (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        outside = date_outside_school_year(effective_date, enrollment.school_year)
        if outside:
            return Response({"detail": outside}, status=status.HTTP_400_BAD_REQUEST)

        destination_school_name = (request.data.get("destination_school_name") or "").strip() or None

        with transaction.atomic():
            enrollment.enrollment_status = "transferred_out"
            enrollment.save(update_fields=["enrollment_status"])

            transfer = EnrollmentTransfer.objects.create(
                enrollment=enrollment,
                transfer_type="transfer_out",
                effective_date=effective_date,
                reason=reason,
                from_grade_level=enrollment.grade_level,
                from_section=enrollment.section,
                from_strand=enrollment.strand,
                destination_school_name=destination_school_name,
                initiated_by=getattr(request.user, "user_id", None) or getattr(request.user, "id", None) or 0,
            )

        return Response(
            {
                "enrollment": EnrollmentSerializer(enrollment).data,
                "transfer": EnrollmentTransferSerializer(transfer).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="transfer-in")
    def transfer_in(self, request, pk=None):
        """
        POST /api/enrollments/{id}/transfer-in/

        Records the audit trail for a student arriving mid-year from another
        school. Call this right after creating the new Enrollment row — it
        never creates or modifies the enrollment itself. No extra grade-
        progression gating is needed here: EnrollmentSerializer.validate()
        already skips that gate whenever the student has no prior completed
        enrollment in this DB, which is exactly the transfer-in case — their
        academic history lives at their previous school, not here.

        Body:
          {
            "effective_date": "2026-07-17",
            "reason": "Transferee from another school",
            "origin_school_name": "Cebu City National HS"   // optional
          }
        """
        enrollment = self.get_object()
        ensure_open(enrollment.school_year)

        # Recorded right after the learner's new enrollment is created, once.
        # It used to be accepted on any row any number of times -- two
        # "arrivals" on a closed 2024-2025 row, dated 2030.
        if enrollment.enrollment_status not in ("pending", "enrolled"):
            return Response(
                {"detail": "A transfer-in is recorded on the learner's new pending or enrolled enrollment."},
                status=status.HTTP_409_CONFLICT,
            )
        if EnrollmentTransfer.objects.filter(enrollment=enrollment, transfer_type="transfer_in").exists():
            return Response(
                {"detail": "This enrollment already has its transfer-in recorded."},
                status=status.HTTP_409_CONFLICT,
            )

        effective_date = _parse_date(request.data.get("effective_date"))
        if effective_date is None:
            return Response(
                {"detail": "effective_date is required and must be a valid date (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        outside = date_outside_school_year(effective_date, enrollment.school_year)
        if outside:
            return Response({"detail": outside}, status=status.HTTP_400_BAD_REQUEST)

        reason = (request.data.get("reason") or "").strip()
        origin_school_name = (request.data.get("origin_school_name") or "").strip() or None

        transfer = EnrollmentTransfer.objects.create(
            enrollment=enrollment,
            transfer_type="transfer_in",
            effective_date=effective_date,
            reason=reason,
            to_grade_level=enrollment.grade_level,
            to_section=enrollment.section,
            to_strand=enrollment.strand,
            origin_school_name=origin_school_name,
            initiated_by=getattr(request.user, "user_id", None) or getattr(request.user, "id", None) or 0,
        )

        return Response(
            {
                "enrollment": EnrollmentSerializer(enrollment).data,
                "transfer": EnrollmentTransferSerializer(transfer).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True, methods=["post"], url_path="guardian-response",
        # The viewset's IsStaffOrOwnerGuardianReadOnly refuses every guardian
        # write, which is right for everything else on this viewset. This is
        # the one exception, so it carries its own checks below instead.
        permission_classes=[IsAuthenticated],
    )
    def guardian_response(self, request, pk=None):
        """
        POST /api/enrollments/{id}/guardian-response/

        A guardian's answer to "will your child return next school year?",
        on the pending row Promote (or the registrar) created for it.

        Guardians do not enroll: this records the answer and nothing else. It
        never changes the enrollment's status -- the registrar still activates
        the row through the document gate, or cancels it. The answer can be
        changed while the row is pending.

        Refused unless the row is the caller's own child's, still pending, and
        a next-year row for a learner already here (an earlier enrollment
        exists). A pending row with no history is a new learner's placement
        waiting on documents, not a question for the family.

        Body:
          {
            "response": "returning" | "not_returning",
            "reason":   "Moving to Cebu"     // optional, kept for not_returning
          }
        """
        if getattr(request.user, "role", None) != "guardian":
            return Response(
                {"detail": "Only a guardian can answer for their child."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # get_queryset() is already scoped to this guardian's children, so
        # another family's row is simply not found here.
        try:
            pk = int(pk)
        except (TypeError, ValueError):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        enrollment = self.get_queryset().filter(pk=pk).first()
        if enrollment is None:
            return Response(
                {"detail": "You do not have access to this record."},
                status=status.HTTP_403_FORBIDDEN,
            )

        answer = (request.data.get("response") or "").strip()
        if answer not in ("returning", "not_returning"):
            return Response(
                {"detail": "response must be 'returning' or 'not_returning'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = (request.data.get("reason") or "").strip() if answer == "not_returning" else ""
        if len(reason) > 500:
            return Response(
                {"detail": "Please keep the reason under 500 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if enrollment.enrollment_status != "pending":
            return Response(
                {"detail": "This enrollment is no longer waiting on your answer."},
                status=status.HTTP_409_CONFLICT,
            )

        continuing = (
            Enrollment.objects.filter(
                student_id=enrollment.student_id,
                school_year__lt=enrollment.school_year,
                enrollment_status__in=("enrolled", "completed"),
            )
            .exclude(pk=enrollment.pk)
            .exists()
        )
        if not continuing:
            return Response(
                {"detail": "Only a returning learner's next-year enrollment takes an answer here."},
                status=status.HTTP_409_CONFLICT,
            )

        saved, _ = GuardianResponse.objects.update_or_create(
            enrollment=enrollment,
            defaults={
                "response": answer,
                "reason": reason,
                "responded_by": getattr(request.user, "user_id", None) or getattr(request.user, "id", None) or 0,
            },
        )

        return Response({
            "enrollment_id": enrollment.enrollment_id,
            "guardian_response": {
                "response":     saved.response,
                "reason":       saved.reason,
                "responded_at": saved.responded_at,
            },
        })

    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk_create(self, request):
        """
        POST /api/enrollments/bulk/

        Enroll multiple students into the same class section atomically.
        Body:
          {
            "students": [1, 2, 3, ...],
            "school_year": "2026-2027",
            "school_level": "elementary",
            "grade_level": "Grade 5",
            "section": "Sampaguita",
            "enrollment_status": "pending",   // optional, defaults to "pending"
            "strand": null,                    // SHS only
            "semester": null                   // SHS only
          }

        Response:
          {
            "created": [{"enrollment_id": 1, "student_id": 42}, ...],
            "failed":  [{"student_id": 99, "reason": "..."}]
          }
        """
        student_ids = request.data.get("students", [])
        if not isinstance(student_ids, list) or not student_ids:
            return Response(
                {"detail": "A non-empty 'students' list is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shared_fields = {
            "school_year":       request.data.get("school_year"),
            "school_level":      request.data.get("school_level"),
            "grade_level":       request.data.get("grade_level"),
            "section":           request.data.get("section"),
            "strand":            request.data.get("strand"),
            "semester":          request.data.get("semester"),
            "enrollment_status": request.data.get("enrollment_status", "pending"),
        }

        # Refused as a whole rather than learner by learner: every row would
        # fail for the same reason.
        try:
            ensure_open(normalize_school_year(shared_fields["school_year"] or ""))
        except InvalidSchoolYear:
            pass  # the serializer reports a malformed year on each row

        created_records = []
        failed_records  = []

        for student_id in student_ids:
            payload = {"student": student_id, **shared_fields}
            serializer = EnrollmentSerializer(
                data=payload, context={"request": request}
            )
            if not serializer.is_valid():
                # Flatten DRF error dict into a readable string
                errors = serializer.errors
                parts = []
                for field, msgs in errors.items():
                    if isinstance(msgs, list):
                        parts.append("; ".join(str(m) for m in msgs))
                    else:
                        parts.append(str(msgs))
                failed_records.append({
                    "student_id": student_id,
                    "reason": " | ".join(parts) if parts else "Validation failed.",
                })
                continue

            try:
                with transaction.atomic():
                    enrollment = serializer.save()
                    if getattr(serializer, "_progression_override", False):
                        self._save_override_audit(serializer, enrollment)
                created_records.append({
                    "enrollment_id": enrollment.enrollment_id,
                    "student_id":    student_id,
                })
            except Exception as exc:
                failed_records.append({
                    "student_id": student_id,
                    "reason": _bulk_failure_reason(
                        exc, context=f"bulk_create student_id={student_id}"
                    ),
                })

        return Response(
            {"created": created_records, "failed": failed_records},
            status=status.HTTP_207_MULTI_STATUS if failed_records else status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="promote/preview")
    def promote_preview(self, request):
        """
        POST /api/enrollments/promote/preview/

        Dry-run: returns which students will be promoted and which will be
        skipped (failed grades or already enrolled in the destination year).
        No enrollment records are created.

        Body:
          {
            "from_school_year": "2024-2025",
            "from_grade_level": "Grade 7",
            "from_section":     "Rizal",
            "to_school_year":   "2025-2026",
            "to_section":       "Rizal"   // optional, defaults to from_section
          }
        """
        return self._promote_logic(request, dry_run=True)

    @action(detail=False, methods=["post"], url_path="promote/confirm")
    def promote_confirm(self, request):
        """
        POST /api/enrollments/promote/confirm/

        Same body as preview — runs identical logic but commits the records.
        Idempotent: students already enrolled in to_school_year are silently
        skipped rather than duplicated.
        """
        return self._promote_logic(request, dry_run=False)

    @action(detail=False, methods=["post"], url_path="complete-section")
    def complete_section(self, request):
        """
        POST /api/enrollments/complete-section/

        Closes a section's school year: every `enrolled` row in it becomes
        `completed`, in one transaction. This is the step Promote reads from,
        and it used to take one "Mark Completed" click per learner.

        Only `enrolled` rows move. Pending, cancelled and transferred-out
        learners did not finish the year here and are left as they are.
        Whether a completed learner passed is still decided from their grades,
        by Promote -- completing a row does not promote anyone.

        Body:
          {
            "school_year": "2025-2026",
            "grade_level": "Grade 4",
            "section":     "Rizal",
            "semester":    "2nd"     // required for Grade 11 / Grade 12
          }
        """
        school_year = (request.data.get("school_year") or "").strip()
        grade_level = (request.data.get("grade_level") or "").strip()
        section     = (request.data.get("section") or "").strip()
        semester    = (request.data.get("semester") or "").strip() or None

        missing = [f for f, v in [
            ("school_year", school_year),
            ("grade_level", grade_level),
            ("section",     section),
        ] if not v]
        if missing:
            return Response(
                {"detail": f"Missing required fields: {', '.join(missing)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if grade_level in ("Grade 11", "Grade 12") and semester not in ("1st", "2nd"):
            return Response(
                {"detail": "semester ('1st' or '2nd') is required for senior high sections."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            school_year = school_year_rules.normalize(school_year)
        except school_year_rules.InvalidSchoolYear as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        qs = Enrollment.objects.filter(
            school_year=school_year,
            grade_level=grade_level,
            section__iexact=section,
            enrollment_status="enrolled",
        )
        if semester:
            qs = qs.filter(semester=semester)

        with transaction.atomic():
            completed = qs.update(enrollment_status="completed")

        return Response({"completed": completed})

    @action(detail=True, methods=["get"], url_path="email-status")
    def email_status(self, request, pk=None):
        """
        GET /api/enrollments/{id}/email-status/

        Confirmation emails for this enrollment that failed and have not gone
        through since. Failures were written to email_delivery_failures "for
        follow-up", but no screen read that table -- the registrar only knew
        from the toast at the moment of sending. The enrollment page shows
        these with a Resend button; a successful send settles them.
        """
        if getattr(request.user, "role", None) not in ACADEMIC_STAFF_ROLES:
            return Response({"detail": "You do not have access to this record."}, status=403)
        enrollment = self.get_object()
        failures = EmailDeliveryFailure.objects.filter(
            context__enrollment_id=enrollment.enrollment_id, resolved_at__isnull=True,
        ).order_by("-created_at")
        return Response({"failures": [
            {
                "id":         f.email_delivery_failure_id,
                "to_email":   f.to_email,
                "recipients": (f.context or {}).get("recipients") or [f.to_email],
                "created_at": f.created_at,
            }
            for f in failures
        ]})

    @action(detail=False, methods=["post"], url_path="close-year")
    def close_year(self, request):
        """
        POST /api/enrollments/close-year/   {"school_year": "2025-2026"}

        Marks every row of a FINISHED school year that is still `enrolled` as
        `completed`, in one transaction, and returns how many.

        Complete Section does this a class at a time, which is right for the
        end of the year in progress, when each adviser finishes grades on their
        own schedule. A year nobody closed stayed open forever: its learners
        read as enrolled in two years, their old advisers could still edit
        them, and analytics saw that year through the leftovers alone. The
        year in progress (and any later one) is refused -- closing it early
        would lock every class out of its own grades.
        """
        raw = (request.data.get("school_year") or "").strip()
        try:
            year = school_year_rules.normalize(raw)
        except school_year_rules.InvalidSchoolYear as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        current = school_year_rules.current(timezone.localdate())
        if year >= current:
            return Response(
                {"detail": (
                    f"SY {year} is not over yet. Close its classes one at a time with "
                    f"Complete Section in Promote, once their grades are in."
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            completed = Enrollment.objects.filter(
                school_year=year, enrollment_status="enrolled",
            ).update(enrollment_status="completed")
        return Response({"school_year": year, "completed": completed})

    def _promote_logic(self, request, dry_run):
        from grades.models import Grade

        from_school_year = request.data.get("from_school_year", "").strip()
        from_grade_level = request.data.get("from_grade_level", "").strip()
        from_section     = request.data.get("from_section", "").strip()
        to_school_year   = request.data.get("to_school_year", "").strip()
        to_section       = request.data.get("to_section", "").strip() or from_section

        missing = [f for f, v in [
            ("from_school_year", from_school_year),
            ("from_grade_level", from_grade_level),
            ("from_section",     from_section),
            ("to_school_year",   to_school_year),
        ] if not v]
        if missing:
            return Response(
                {"detail": f"Missing required fields: {', '.join(missing)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Promote carries a class into the NEXT school year. Neither year was
        # checked: promoting into the same year created next-grade rows beside
        # the completed ones, "2031-2032" skipped four years, and "next year"
        # was written to the rows verbatim as their school year.
        try:
            from_school_year = school_year_rules.normalize(from_school_year)
            to_school_year = school_year_rules.normalize(to_school_year)
        except school_year_rules.InvalidSchoolYear as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        expected_year = school_year_rules.following(from_school_year)
        if to_school_year != expected_year:
            return Response(
                {"detail": f"A class from {from_school_year} is promoted into {expected_year}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Promotion writes enrollments directly, past the serializer's
        # registered-year check, so the target year is checked here: an
        # unregistered year would otherwise fail every learner on the
        # foreign key with a raw database error in the "failed" list.
        if not SchoolYear.objects.filter(label=to_school_year).exists():
            return Response(
                {"detail": (
                    f"S.Y. {to_school_year} hasn't been set up yet. "
                    "An admin can add it under School Years first."
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Reading an archived year is fine -- last year's finished classes are
        # exactly what gets promoted. Writing into one isn't.
        ensure_open(to_school_year)

        to_grade_level = get_next_grade_level(from_grade_level)
        if to_grade_level is None:
            return Response(
                {"detail": f"No grade level follows '{from_grade_level}' in the progression order."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        to_school_level = SCHOOL_LEVEL_OF_GRADE[to_grade_level]
        from_school_level = SCHOOL_LEVEL_OF_GRADE.get(from_grade_level)

        # Crossing a school level is a registrar decision, not a batch
        # operation: the section names don't carry over, and Grade 10 -> 11
        # additionally needs a semester and a per-learner strand, which cannot
        # be assigned section-wide.
        #
        # This used to be attempted anyway. The enrollments CHECK constraint
        # requires semester IN ('1st','2nd') for senior_highschool, so every
        # Grade 10 learner hit an IntegrityError that the commit loop swallowed
        # into a "failed" list with a raw Postgres error string attached.
        # Refusing up front — in the preview as well as the commit — turns that
        # into a clear instruction.
        if from_school_level and from_school_level != to_school_level:
            detail = (
                f"'{from_grade_level}' to '{to_grade_level}' moves a learner from "
                f"{from_school_level.replace('_', ' ')} to "
                f"{to_school_level.replace('_', ' ')}, which has to be done per learner "
                f"rather than by section."
            )
            if to_school_level == "senior_highschool":
                detail += (
                    " Senior high school enrollment requires a semester and a strand, "
                    "and each learner chooses their own strand."
                )
            return Response(
                {
                    "detail": detail,
                    "reason": "level_transition",
                    "from_school_level": from_school_level,
                    "to_school_level":   to_school_level,
                    "from_grade_level":  from_grade_level,
                    "to_grade_level":    to_grade_level,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # The destination is a section of next year's next grade, set up
        # beforehand (usually carried over). It used to be free text that
        # defaulted to the source section's name, whether or not such a
        # section existed -- the same spelling-dependent link that decides a
        # teacher's access. Checked up front for the same reason as the year:
        # promotion writes enrollments directly, past the serializer.
        to_section_row = (
            Section.objects.filter(
                school_year_id=to_school_year, grade_level=to_grade_level, name__iexact=to_section,
            ).first()
        )
        if to_section_row is None:
            return Response(
                {"detail": (
                    f"S.Y. {to_school_year} {to_grade_level} has no section named "
                    f"\u201c{to_section}\u201d. Set it up first, or pick one of that grade's sections."
                ),
                 "reason": "unknown_section"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        to_section = to_section_row.name

        # The new enrollment opens the destination year's 1st semester. It used
        # to be created with no semester at all, which the enrollments CHECK
        # refuses for Senior High -- every Grade 11 -> 12 promotion failed.
        to_semester = "1st" if to_school_level == "senior_highschool" else None

        # Grade 11 is enrolled per semester, so a learner holds two rows in
        # the from-section. Promotion is judged at the end of the year: the
        # 2nd-semester row is the source, the 1st must also be completed, and
        # both semesters' grades count.
        semestered = from_grade_level == promotion.SEMESTERED_SOURCE
        section_qs = Enrollment.objects.filter(
            school_year=from_school_year,
            grade_level=from_grade_level,
            section__iexact=from_section,
        )
        if semestered:
            section_qs = section_qs.filter(semester="2nd")

        # Learners the section still lists as studying. Promote reads only
        # `completed` rows, and until now the only way to get there was one
        # "Mark Completed" click per learner -- the modal offers to close them
        # all at once (complete_section below) instead of reporting "no
        # completed enrollments" and leaving the registrar to find out why.
        still_enrolled = [
            {
                "enrollment_id": e.enrollment_id,
                "student_id":    e.student_id,
                "student_name":  f"{e.student.last_name}, {e.student.first_name}",
            }
            for e in section_qs.filter(enrollment_status="enrolled").select_related("student")
        ]

        source_rows = promotion.one_per_student(
            section_qs.filter(enrollment_status="completed")
            .select_related("student")
            .order_by("student__last_name", "student__first_name", "enrollment_id")
        )

        if not source_rows:
            if still_enrolled and dry_run:
                # Nothing to promote yet, but the preview is exactly where the
                # registrar can close the year -- so answer rather than 404.
                return Response({
                    "to_grade_level":  to_grade_level,
                    "to_school_level": to_school_level,
                    "to_section":      to_section,
                    "to_semester":     to_semester,
                    "to_school_year":  to_school_year,
                    "to_promote":      [],
                    "to_skip":         [],
                    "still_enrolled":  still_enrolled,
                })
            detail = "No completed enrollments found for the specified section and school year."
            if semestered:
                detail = (
                    f"Grade 11 is promoted from its 2nd semester, and no learner in "
                    f"{from_section} has a completed 2nd-semester enrollment in "
                    f"{from_school_year}. Enroll and complete the 2nd semester first."
                )
            return Response({"detail": detail}, status=status.HTTP_404_NOT_FOUND)

        # Students already in the destination year (any active status)
        already_enrolled_ids = set(
            Enrollment.objects.filter(
                school_year=to_school_year,
                enrollment_status__in=("enrolled", "pending"),
            ).values_list("student_id", flat=True)
        )

        student_ids = [row.student_id for row in source_rows]
        graded_enrollment_ids = {row.student_id: [row.enrollment_id] for row in source_rows}
        first_semester_done = set()
        if semestered:
            for e_id, s_id in Enrollment.objects.filter(
                student_id__in=student_ids,
                school_year=from_school_year,
                grade_level=from_grade_level,
                semester="1st",
                enrollment_status="completed",
            ).values_list("enrollment_id", "student_id"):
                first_semester_done.add(s_id)
                graded_enrollment_ids[s_id].append(e_id)

        grades_by_student = {s_id: [] for s_id in student_ids}
        enrollment_owner = {
            e_id: s_id for s_id, e_ids in graded_enrollment_ids.items() for e_id in e_ids
        }
        for g in Grade.objects.filter(enrollment_id__in=enrollment_owner).select_related("subject"):
            grades_by_student[enrollment_owner[g.enrollment_id]].append(g)

        to_promote = []
        to_skip    = []

        for enrollment in source_rows:
            student = enrollment.student
            student_name = f"{student.last_name}, {student.first_name}"

            avg, skip = promotion.assess(
                grades_by_student[student.student_id],
                from_grade_level=from_grade_level,
                to_school_year=to_school_year,
                already_enrolled=student.student_id in already_enrolled_ids,
                first_semester_done=student.student_id in first_semester_done,
            )
            if skip:
                to_skip.append({
                    "student_id":   student.student_id,
                    "student_name": student_name,
                    "reason":       skip["reason"],
                    "kind":         skip["kind"],
                    "average":      avg,
                })
                continue

            to_promote.append({
                "student_id":   student.student_id,
                "student_name": student_name,
                "average":      avg,
                # carry object references for actual creation (not serialized)
                "_student_obj": student,
                "_source":      enrollment,
            })

        if dry_run:
            # Strip internal references before returning
            return Response({
                "to_grade_level":  to_grade_level,
                "to_school_level": to_school_level,
                "to_section":      to_section,
                "to_semester":     to_semester,
                "to_school_year":  to_school_year,
                "to_promote": [
                    {k: v for k, v in s.items() if not k.startswith("_")}
                    for s in to_promote
                ],
                "to_skip": to_skip,
                "still_enrolled": still_enrolled,
            })

        # ── Commit ─────────────────────────────────────────────────────────────
        created  = []
        failed_c = []

        for entry in to_promote:
            student_obj = entry["_student_obj"]
            try:
                with transaction.atomic():
                    enr = Enrollment.objects.create(
                        student=student_obj,
                        school_year=to_school_year,
                        school_level=to_school_level,
                        grade_level=to_grade_level,
                        section=to_section,
                        # A Senior High section carries its strand.
                        strand=to_section_row.strand,
                        semester=to_semester,
                        enrollment_status="pending",
                    )
                created.append({
                    "enrollment_id": enr.enrollment_id,
                    "student_id":    student_obj.student_id,
                    "student_name":  entry["student_name"],
                })
            except Exception as exc:
                failed_c.append({
                    "student_id":   student_obj.student_id,
                    "student_name": entry["student_name"],
                    "reason":       _bulk_failure_reason(
                        exc, context=f"promote_confirm student_id={student_obj.student_id}"
                    ),
                })

        return Response(
            {
                "to_grade_level":  to_grade_level,
                "to_school_level": to_school_level,
                "to_section":      to_section,
                "to_semester":     to_semester,
                "to_school_year":  to_school_year,
                "created":  created,
                "skipped":  to_skip,
                "failed":   failed_c,
            },
            status=status.HTTP_207_MULTI_STATUS if (to_skip or failed_c) else status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"], url_path="grades")
    def grades(self, request, pk=None):
        """GET /api/enrollments/{id}/grades/ — convenience for grade panels."""
        from grades.models import Grade
        from grades.serializers import GradeSerializer

        # This action does not call get_object(), so DRF never runs
        # has_object_permission -- and IsStaffOrOwnerGuardianReadOnly's
        # has_permission waves through every SAFE_METHOD for every
        # authenticated role. The role allowlist therefore has to be explicit
        # here, or `accounting` reads any student's grades through this route
        # while GradeViewSet (IsAdvisoryTeacherOrStaff) denies the same role
        # outright. Mirrors GRADE_READ_ROLES, plus guardians scoped below.
        role = getattr(request.user, "role", None)
        if role not in GRADE_READ_ROLES and role != "guardian":
            return Response(
                {"detail": "You do not have access to this record."},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            pk = int(pk)
        except (TypeError, ValueError):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if role in ("teacher", "guardian"):
            student_id = Enrollment.objects.filter(pk=pk).values_list("student_id", flat=True).first()
            allowed = teacher_student_ids(request.user) if role == "teacher" else guardian_student_ids(request.user)
            if student_id not in allowed:
                return Response(
                    {"detail": "You do not have access to this record."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        qs = (
            Grade.objects
            .select_related("subject", "enrollment")
            .filter(enrollment_id=pk)
            .order_by("subject__subject_name", "grading_period")
        )
        return Response(GradeSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"], url_path="eligibility")
    def eligibility(self, request):
        """
        GET /api/enrollments/eligibility/?student_id=X

        Returns a structured eligibility report indicating whether a student
        can be enrolled, their next allowed grade, any blocking issues, and
        missing required documents.
        """
        from requirements.models import RequirementType, StudentRequirementSubmission

        # Enrollment eligibility is a staff planning tool, not part of the
        # guardian portal — guardians have no business probing it.
        # Guardians are denied outright; so is accounting. Eligibility hands
        # back failed subject names with their grades, the full enrollment
        # history and the missing-document list -- academic data a finance
        # role has no business reading, and which GradeViewSet already denies
        # it. This action doesn't call get_object(), so the viewset's
        # permission class (which allows every authenticated role to read)
        # never narrows it; the check has to be explicit here.
        role = getattr(request.user, "role", None)
        if role in ("guardian", "accounting"):
            return Response({"detail": "You do not have access to this record."}, status=403)

        student_id = request.query_params.get("student_id")
        if not student_id:
            return Response({"detail": "student_id is required."}, status=400)
        student_id = _int_param(student_id, "student_id")

        # A teacher may only run this for a student in their own advisory --
        # matches {enrollment_id}/grades/ above. This was previously
        # unscoped for teachers (only guardians were denied), letting a
        # teacher pull eligibility, failed subjects with grades, and
        # missing-document status for any student in the school, not just
        # their own class.
        if role == "teacher" and student_id not in teacher_student_ids(request.user):
            return Response({"detail": "You do not have access to this record."}, status=403)

        # ── Fetch student's enrollment history ─────────────────────────────────
        # `exclude_enrollment_id` is the row the caller is about to create or
        # activate. It MUST be left out of the history, for the same reason
        # EnrollmentSerializer.validate() excludes self.instance: on a
        # pending -> enrolled activation the row already exists, so counting it
        # classifies the learner as "continuing" and silently switches off the
        # transferee document rules on the exact path the gate exists for.
        # Without this the preview and the gate disagreed — the panel showed a
        # Grade 7 walk-in as continuing and eligible, then the PATCH rejected
        # them as a transferee owing Good Moral and a Form 137.
        exclude_enrollment_id = request.query_params.get("exclude_enrollment_id")

        history_qs = Enrollment.objects.filter(student_id=student_id)
        if exclude_enrollment_id:
            try:
                history_qs = history_qs.exclude(pk=int(exclude_enrollment_id))
            except (TypeError, ValueError):
                return Response(
                    {"detail": "exclude_enrollment_id must be an integer."}, status=400
                )

        all_enrollments = list(history_qs.order_by("-school_year", "-enrollment_id"))
        last_completed = next(
            (e for e in all_enrollments if e.enrollment_status == "completed"), None
        )
        last_any = all_enrollments[0] if all_enrollments else None

        # ── Compute next allowed grade ─────────────────────────────────────────
        next_allowed_grade = None
        next_allowed_semester = None
        last_enrollment_data = None
        blocking_reasons = []
        can_repeat = False

        if last_completed:
            last_enrollment_data = {
                "enrollment_id": last_completed.enrollment_id,
                "grade_level": last_completed.grade_level,
                "school_level": last_completed.school_level,
                "semester": last_completed.semester,
                "school_year": last_completed.school_year,
                "enrollment_status": last_completed.enrollment_status,
            }
            next_allowed_grade = get_next_grade_level(last_completed.grade_level)

            # SHS semester sequencing
            if last_completed.school_level == "senior_highschool":
                if last_completed.grade_level == "Grade 11":
                    g11_sems = set(
                        Enrollment.objects
                        .filter(
                            student_id=student_id,
                            grade_level="Grade 11",
                            enrollment_status="completed",
                        )
                        .values_list("semester", flat=True)
                    )
                    if "1st" in g11_sems and "2nd" not in g11_sems:
                        # Must complete 2nd sem of Grade 11 before Grade 12
                        next_allowed_grade = "Grade 11"
                        next_allowed_semester = "2nd"
                    elif {"1st", "2nd"}.issubset(g11_sems):
                        next_allowed_grade = "Grade 12"
                        next_allowed_semester = "1st"
                elif last_completed.grade_level == "Grade 12":
                    g12_sems = set(
                        Enrollment.objects
                        .filter(
                            student_id=student_id,
                            grade_level="Grade 12",
                            enrollment_status="completed",
                        )
                        .values_list("semester", flat=True)
                    )
                    if "1st" in g12_sems and "2nd" not in g12_sems:
                        next_allowed_grade = "Grade 12"
                        next_allowed_semester = "2nd"
                    else:
                        next_allowed_grade = None  # All done

            # ── Check for learning areas failed ON THE YEAR ────────────────────
            # Same reduction as the bulk promotion path and the report card
            # (grading.deped.summarize_subjects), so a student is never told
            # they are blocked by a subject their own report card passes --
            # over the same rows Promote reads (both Grade 11 semesters), and
            # with the same "no grades is not a pass" rule.
            year_grades = list(promotion_grades(last_completed))
            if not year_grades and last_completed.grade_level not in promotion.UNGRADED_LEVELS:
                blocking_reasons.append(
                    f"No final grades are recorded for {last_completed.grade_level}."
                )
            outcomes = summarize_subjects(year_grades)
            failed_outcomes = [
                o for o in outcomes.values()
                if o["remarks"] in BLOCKING_REMARKS
            ]
            if failed_outcomes:
                can_repeat = True
                for o in failed_outcomes:
                    shown = o["average"] if o["average"] is not None else "no grade"
                    blocking_reasons.append(
                        f"Subject '{o['subject'].subject_name}' in {last_completed.grade_level}: "
                        f"{o['remarks']} ({shown})"
                    )
        elif last_any:
            # Has enrollments but none completed — still in progress
            last_enrollment_data = {
                "enrollment_id": last_any.enrollment_id,
                "grade_level": last_any.grade_level,
                "school_level": last_any.school_level,
                "semester": last_any.semester,
                "school_year": last_any.school_year,
                "enrollment_status": last_any.enrollment_status,
            }

        # ── Required documents check ───────────────────────────────────────────
        # Scoped to the placement being considered, not the whole catalogue.
        # The caller may describe a hypothetical placement ("would a Grade 7
        # transfer-in be eligible?"); with nothing supplied this reports on the
        # next placement the progression rules above already worked out.
        from requirements.rules import derive_entry_status, split_missing

        q = request.query_params
        school_level = q.get("school_level") or getattr(last_any, "school_level", None)
        grade_level = q.get("grade_level") or next_allowed_grade \
            or getattr(last_any, "grade_level", None)
        is_transfer_in = str(q.get("is_transfer_in", "")).lower() in ("1", "true", "yes")

        # Only years actually spent here make a learner continuing -- the rule
        # the gate in EnrollmentSerializer.validate() applies.
        attended = any(e.enrollment_status in ATTENDED_STATUSES for e in all_enrollments)
        entry_status = derive_entry_status(
            has_prior_enrollment=attended,
            is_transfer_in=is_transfer_in,
            grade_level=grade_level,
        )

        active_req_types = list(RequirementType.objects.filter(is_active=True))
        submitted_ids = set(
            StudentRequirementSubmission.objects
            .filter(student_id=student_id, is_submitted=True)
            .values_list("requirement_type_id", flat=True)
        )
        required_missing, optional_missing = split_missing(
            active_req_types, submitted_ids,
            school_level=school_level, entry_status=entry_status,
        )

        def _doc(rt):
            return {
                "requirement_type_id": rt.requirement_type_id,
                "requirement_code": rt.requirement_code,
                "requirement_name": rt.requirement_name,
            }

        # `missing_docs` keeps its name and shape — it is what every existing
        # caller reads — but now holds only the documents that actually block.
        missing_docs = [_doc(rt) for rt in required_missing]
        optional_missing_docs = [_doc(rt) for rt in optional_missing]

        # Applicability is decided per school level and entry status, and
        # rules.applies_to() answers "no" — never "unknown" — when it cannot
        # resolve one. For a student with no enrollment history and a caller
        # that named no placement, that made EVERY document inapplicable and
        # this endpoint reported a learner who had submitted nothing as
        # document-complete and eligible. Say so explicitly instead: callers
        # get an honest "not assessed" rather than a confident, wrong "none
        # missing", and cannot read an empty list as a clean bill of health.
        documents_assessed = bool(school_level)

        # ── Is eligible? ───────────────────────────────────────────────────────
        # Eligible if: no grade blocks AND no missing docs (or new student).
        # An unassessed document check is not a passing one.
        #
        # Failed subjects block moving UP, not repeating: the serializer lets
        # a learner re-enroll in the grade they failed without an override
        # (retention), so when the caller asks about that placement the
        # failures are reported but do not demand one. Before this, the form
        # demanded an admin override for the one placement that needs none.
        repeating = (
            last_completed is not None
            and grade_level == last_completed.grade_level
        )
        has_grade_blocks = len(blocking_reasons) > 0 and not repeating
        is_eligible = (
            not has_grade_blocks
            and documents_assessed
            and len(missing_docs) == 0
        )

        return Response({
            "student_id": int(student_id),
            "is_eligible": is_eligible,
            "last_enrollment": last_enrollment_data,
            "next_allowed_grade": next_allowed_grade,
            "next_allowed_semester": next_allowed_semester,
            "blocking_reasons": blocking_reasons,
            "missing_docs": missing_docs,
            # Still owed, but not blocking — a registrar wants to see that a
            # transferee has yet to hand in a clearance even though it will not
            # hold up the enrollment.
            "optional_missing_docs": optional_missing_docs,
            # What the document scoping above was computed against, so the
            # client can explain the list rather than just print it.
            "entry_status": entry_status,
            "school_level_used": school_level,
            "grade_level_used": grade_level,
            # False means "we could not work out which documents apply", not
            # "none are missing" — see the note above. Clients must not render
            # an empty missing_docs as complete when this is False.
            "documents_assessed": documents_assessed,
            "can_repeat": can_repeat,
            "admin_override_required": has_grade_blocks,
            "is_new_student": not attended,
        })


class EnrollmentTransferViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/enrollment-transfers/

    Read-only audit trail of transfer-out / transfer-in / internal-move
    events. Rows are written by EnrollmentViewSet's transfer actions and by
    perform_update()'s internal-move auto-logging — never created directly
    through this endpoint.

    Filters:
      ?enrollment=42
      ?student=12       (student_id, resolved through the enrollment FK)
      ?transfer_type=transfer_out
    """

    queryset = EnrollmentTransfer.objects.select_related("enrollment").all()
    serializer_class = EnrollmentTransferSerializer
    permission_classes = [IsStaffOrOwnerGuardianReadOnly]

    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("enrollment", "transfer_type")

    def get_queryset(self):
        qs = super().get_queryset()
        role = getattr(self.request.user, "role", None)
        if role == "guardian":
            qs = qs.filter(enrollment__student_id__in=guardian_student_ids(self.request.user))
        elif role == "teacher":
            qs = qs.filter(enrollment__student_id__in=teacher_student_ids(self.request.user))

        student_id = self.request.query_params.get("student")
        if student_id:
            qs = qs.filter(enrollment__student_id=_int_param(student_id, "student"))
        return qs
