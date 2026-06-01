from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction

from .models import Enrollment, EnrollmentOverride
from .serializers import EnrollmentSerializer, GRADE_ORDER, get_next_grade_level
from .filters import EnrollmentFilter


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
    permission_classes = [permissions.IsAuthenticated]

    filter_backends = (DjangoFilterBackend, SearchFilter, OrderingFilter)
    filterset_class = EnrollmentFilter
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
