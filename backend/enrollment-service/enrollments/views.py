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
