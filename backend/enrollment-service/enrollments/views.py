from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction

from accounts.permissions import (
    IsAdminRegistrarOrReadOnly,
    IsAdvisoryTeacherOrStaff,
    IsStaffOrOwnerGuardianReadOnly,
    guardian_student_ids,
    teacher_student_ids,
)
from .models import Enrollment, EnrollmentOverride, SectionAdvisory
from .serializers import (
    EnrollmentSerializer,
    GRADE_ORDER,
    get_next_grade_level,
    SectionAdvisorySerializer,
    StudentSummarySerializer,
)
from .filters import EnrollmentFilter

ACADEMIC_STAFF_ROLES = ("super_admin", "admin", "registrar")


class SectionAdvisoryViewSet(viewsets.ModelViewSet):
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
            "section_grades", "section_attendance",
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
            enrollment_qs = Enrollment.objects.filter(
                school_year=advisory.school_year,
                school_level=advisory.school_level,
                grade_level=advisory.grade_level,
                section=advisory.section,
                enrollment_status="enrolled",
            ).select_related("student")
            if advisory.strand:
                enrollment_qs = enrollment_qs.filter(strand=advisory.strand)

            students = []
            for e in enrollment_qs.order_by("student__last_name", "student__first_name"):
                student_data = StudentSummarySerializer(e.student).data
                student_data["enrollment_id"] = e.enrollment_id
                students.append(student_data)

            subject_qs = Subject.objects.filter(
                school_level=advisory.school_level,
                grade_level=advisory.grade_level,
            )
            subject_qs = (
                subject_qs.filter(strand=advisory.strand) if advisory.strand
                else subject_qs.filter(strand__isnull=True)
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

        advisory = SectionAdvisory.objects.filter(
            advisory_id=advisory_id, teacher_user_id=teacher_user_id
        ).first()
        if advisory is None:
            return Response(
                {"detail": "Advisory not found or not assigned to this teacher."},
                status=status.HTTP_404_NOT_FOUND,
            )

        enrollment_qs = Enrollment.objects.filter(
            school_year=advisory.school_year,
            school_level=advisory.school_level,
            grade_level=advisory.grade_level,
            section=advisory.section,
            enrollment_status="enrolled",
        ).select_related("student")
        if advisory.strand:
            enrollment_qs = enrollment_qs.filter(strand=advisory.strand)
        enrollments_by_student = {e.student_id: e for e in enrollment_qs}

        if request.method == "POST":
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
        date = params.get("date")

        missing = [f for f, v in [("advisory_id", advisory_id), ("date", date)] if not v]
        if missing:
            return Response(
                {"detail": f"Missing required fields: {', '.join(missing)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        advisory = SectionAdvisory.objects.filter(
            advisory_id=advisory_id, teacher_user_id=teacher_user_id
        ).first()
        if advisory is None:
            return Response(
                {"detail": "Advisory not found or not assigned to this teacher."},
                status=status.HTTP_404_NOT_FOUND,
            )

        enrollment_qs = Enrollment.objects.filter(
            school_year=advisory.school_year,
            school_level=advisory.school_level,
            grade_level=advisory.grade_level,
            section=advisory.section,
            enrollment_status="enrolled",
        ).select_related("student")
        if advisory.strand:
            enrollment_qs = enrollment_qs.filter(strand=advisory.strand)
        enrollments_by_student = {e.student_id: e for e in enrollment_qs}

        if request.method == "POST":
            entries = request.data.get("records", [])
            valid_statuses = {"P", "A", "L", "E"}
            if not isinstance(entries, list) or not entries:
                return Response(
                    {"detail": "A non-empty 'records' list is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            saved, failed = [], []
            recorded_by = getattr(request, "user_id", None) or getattr(request.user, "id", None)
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
                        date=date,
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
                enrollment__in=enrollments_by_student.values(), date=date,
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
            advisory_id=advisory_id, teacher_user_id=teacher_user_id
        ).first()
        if advisory is None:
            return Response(
                {"detail": "Advisory not found or not assigned to this teacher."},
                status=status.HTTP_404_NOT_FOUND,
            )

        enrollment_qs = Enrollment.objects.filter(
            school_year=advisory.school_year,
            school_level=advisory.school_level,
            grade_level=advisory.grade_level,
            section=advisory.section,
            enrollment_status="enrolled",
        ).select_related("student")
        if advisory.strand:
            enrollment_qs = enrollment_qs.filter(strand=advisory.strand)
        enrollments_by_student = {e.student_id: e for e in enrollment_qs}

        records_qs = AttendanceRecord.objects.filter(
            enrollment__in=enrollments_by_student.values()
        )

        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if date_from:
            records_qs = records_qs.filter(date__gte=date_from)
        if date_to:
            records_qs = records_qs.filter(date__lte=date_to)

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
            advisory_id=advisory_id, teacher_user_id=teacher_user_id
        ).first()
        if advisory is None:
            return Response(
                {"detail": "Advisory not found or not assigned to this teacher."},
                status=status.HTTP_404_NOT_FOUND,
            )

        enrollment_qs = Enrollment.objects.filter(
            school_year=advisory.school_year,
            school_level=advisory.school_level,
            grade_level=advisory.grade_level,
            section=advisory.section,
            enrollment_status="enrolled",
        )
        if advisory.strand:
            enrollment_qs = enrollment_qs.filter(strand=advisory.strand)

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


class EnrollmentViewSet(viewsets.ModelViewSet):
    """
    /api/enrollments/

    Filters:
      ?student=12
      ?school_year=2026-2027
      ?school_level=senior_highschool
      ?enrollment_status=enrolled
      ?search=Cruz       (matches student name, LRN, student_number, section)
    """

    queryset = Enrollment.objects.select_related("student").all()
    serializer_class = EnrollmentSerializer
    permission_classes = [IsStaffOrOwnerGuardianReadOnly]
    owner_student_id_field = "student_id"  # obj is the Enrollment itself

    filter_backends = (DjangoFilterBackend, SearchFilter, OrderingFilter)
    filterset_class = EnrollmentFilter

    def get_queryset(self):
        qs = super().get_queryset()
        # Guardians only ever see their own child(ren)'s enrollments; an
        # unlinked guardian gets an empty list (fail closed).
        if getattr(self.request.user, "role", None) == "guardian":
            qs = qs.filter(student_id__in=guardian_student_ids(self.request.user))
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

    def _save_override_audit(self, serializer, enrollment):
        """Create or update the override audit record for this enrollment."""
        user_id = getattr(self.request.user, "id", None) or 0
        reason = getattr(serializer, "_progression_override_reason", "") or "(no reason provided)"
        EnrollmentOverride.objects.update_or_create(
            enrollment=enrollment,
            defaults={
                "override_reason": reason,
                "overridden_by": user_id,
            },
        )

    def perform_create(self, serializer):
        enrollment = serializer.save()
        if getattr(serializer, "_progression_override", False):
            self._save_override_audit(serializer, enrollment)

    def perform_update(self, serializer):
        enrollment = serializer.save()
        if getattr(serializer, "_progression_override", False):
            self._save_override_audit(serializer, enrollment)

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
                    "reason": str(exc),
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

        to_grade_level = get_next_grade_level(from_grade_level)
        if to_grade_level is None:
            return Response(
                {"detail": f"No grade level follows '{from_grade_level}' in the progression order."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Determine destination school_level from to_grade_level
        from .serializers import GRADE_ORDER
        LEVEL_MAP = {}
        for g in ["Nursery"]:                                              LEVEL_MAP[g] = "nursery"
        for g in ["Kindergarten"]:                                         LEVEL_MAP[g] = "kindergarten"
        for g in ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"]: LEVEL_MAP[g] = "elementary"
        for g in ["Grade 7","Grade 8","Grade 9","Grade 10"]:               LEVEL_MAP[g] = "junior_highschool"
        for g in ["Grade 11","Grade 12"]:                                  LEVEL_MAP[g] = "senior_highschool"
        to_school_level = LEVEL_MAP.get(to_grade_level, "junior_highschool")

        # Source: all completed enrollments in the from-section
        source_qs = Enrollment.objects.filter(
            school_year=from_school_year,
            grade_level=from_grade_level,
            section__iexact=from_section,
            enrollment_status="completed",
        ).select_related("student")

        if not source_qs.exists():
            return Response(
                {"detail": "No completed enrollments found for the specified section and school year."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Students already in the destination year (any active status)
        already_enrolled_ids = set(
            Enrollment.objects.filter(
                school_year=to_school_year,
                enrollment_status__in=("enrolled", "pending"),
            ).values_list("student_id", flat=True)
        )

        to_promote = []
        to_skip    = []

        for enrollment in source_qs:
            student = enrollment.student
            student_name = f"{student.last_name}, {student.first_name}"
            avg = None

            # Compute subject average for display
            grades = Grade.objects.filter(enrollment=enrollment).select_related("subject")
            if grades.exists():
                vals = [float(g.numeric_grade) for g in grades if g.numeric_grade is not None]
                avg = round(sum(vals) / len(vals), 2) if vals else None

            # Skip if already enrolled in destination year
            if student.student_id in already_enrolled_ids:
                to_skip.append({
                    "student_id":   student.student_id,
                    "student_name": student_name,
                    "reason":       f"Already has an active enrollment in {to_school_year}.",
                    "average":      avg,
                })
                continue

            # Skip if failed/incomplete subjects
            failed = grades.filter(remarks__in=["failed", "incomplete"])
            if failed.exists():
                failed_names = ", ".join(
                    f"{g.subject.subject_name} ({g.numeric_grade})" for g in failed
                )
                to_skip.append({
                    "student_id":   student.student_id,
                    "student_name": student_name,
                    "reason":       f"Failed/incomplete: {failed_names}",
                    "average":      avg,
                })
                continue

            to_promote.append({
                "student_id":   student.student_id,
                "student_name": student_name,
                "average":      avg,
                # carry object reference for actual creation (not serialized)
                "_student_obj": student,
            })

        if dry_run:
            # Strip internal references before returning
            return Response({
                "to_grade_level":  to_grade_level,
                "to_school_level": to_school_level,
                "to_section":      to_section,
                "to_school_year":  to_school_year,
                "to_promote": [
                    {k: v for k, v in s.items() if not k.startswith("_")}
                    for s in to_promote
                ],
                "to_skip": to_skip,
            })

        # ── Commit ─────────────────────────────────────────────────────────────
        created  = []
        failed_c = []

        with transaction.atomic():
            for entry in to_promote:
                student_obj = entry["_student_obj"]
                try:
                    enr = Enrollment.objects.create(
                        student=student_obj,
                        school_year=to_school_year,
                        school_level=to_school_level,
                        grade_level=to_grade_level,
                        section=to_section,
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
                        "reason":       str(exc),
                    })

        return Response(
            {
                "to_grade_level":  to_grade_level,
                "to_school_level": to_school_level,
                "to_section":      to_section,
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

        role = getattr(request.user, "role", None)
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
        from grades.models import Grade
        from requirements.models import RequirementType, StudentRequirementSubmission

        # Enrollment eligibility is a staff planning tool, not part of the
        # guardian portal — guardians have no business probing it.
        if getattr(request.user, "role", None) == "guardian":
            return Response({"detail": "You do not have access to this record."}, status=403)

        student_id = request.query_params.get("student_id")
        if not student_id:
            return Response({"detail": "student_id is required."}, status=400)

        # ── Fetch student's enrollment history ─────────────────────────────────
        all_enrollments = list(
            Enrollment.objects
            .filter(student_id=student_id)
            .order_by("-school_year", "-enrollment_id")
        )
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

            # ── Check for failed/incomplete subjects ───────────────────────────
            failed_grades = list(
                Grade.objects
                .filter(enrollment=last_completed, remarks__in=["failed", "incomplete"])
                .select_related("subject")
            )
            if failed_grades:
                can_repeat = True
                for g in failed_grades:
                    blocking_reasons.append(
                        f"Subject '{g.subject.subject_name}' in {last_completed.grade_level}: "
                        f"{g.remarks}"
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
        active_req_types = list(RequirementType.objects.filter(is_active=True))
        submitted_ids = set(
            StudentRequirementSubmission.objects
            .filter(student_id=student_id, is_submitted=True)
            .values_list("requirement_type_id", flat=True)
        )
        missing_docs = [
            {
                "requirement_type_id": rt.requirement_type_id,
                "requirement_code": rt.requirement_code,
                "requirement_name": rt.requirement_name,
            }
            for rt in active_req_types
            if rt.requirement_type_id not in submitted_ids
        ]

        # ── Is eligible? ───────────────────────────────────────────────────────
        # Eligible if: no grade blocks AND no missing docs (or new student)
        has_grade_blocks = len(blocking_reasons) > 0
        is_eligible = not has_grade_blocks and len(missing_docs) == 0

        return Response({
            "student_id": int(student_id),
            "is_eligible": is_eligible,
            "last_enrollment": last_enrollment_data,
            "next_allowed_grade": next_allowed_grade,
            "next_allowed_semester": next_allowed_semester,
            "blocking_reasons": blocking_reasons,
            "missing_docs": missing_docs,
            "can_repeat": can_repeat,
            "admin_override_required": has_grade_blocks,
            "is_new_student": last_any is None,
        })
