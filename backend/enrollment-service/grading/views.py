from decimal import Decimal
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import (
    IsAdminRegistrarOrReadOnly,
    IsAdvisoryTeacherOrStaff,
    assert_teacher_may_write_enrollment,
    guardian_student_ids,
    teacher_student_ids,
)
from enrollment_service.deletes import InUseDeleteMixin
from enrollments.models import Enrollment
from subjects.models import Subject
from .deped import (
    PASSING_GRADE,
    descriptor,
    percentage_score,
    quantize,
    transmute,
)
from .models import GradingTemplate, GradingComponent, ScoreEntry
from .serializers import (
    GradingTemplateSerializer,
    GradingComponentSerializer,
    ScoreEntrySerializer,
)


class GradingTemplateViewSet(InUseDeleteMixin, viewsets.ModelViewSet):
    in_use_message = (
        "Scores are already recorded under this template, so it can't be deleted. "
        "Deactivate it instead."
    )
    queryset = GradingTemplate.objects.prefetch_related("components").all()
    serializer_class = GradingTemplateSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]
    filter_backends = (DjangoFilterBackend, SearchFilter)
    search_fields = ("template_name",)

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get("is_active") in ["true", "false"]:
            qs = qs.filter(is_active=params["is_active"] == "true")
        if params.get("school_level"):
            qs = qs.filter(school_level=params["school_level"])
        return qs


class GradingComponentViewSet(InUseDeleteMixin, viewsets.ModelViewSet):
    in_use_message = "Scores are already recorded under this component, so it can't be deleted."
    queryset = GradingComponent.objects.all()
    serializer_class = GradingComponentSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("grading_template_id"):
            qs = qs.filter(
                grading_template_id=self.request.query_params["grading_template_id"]
            )
        return qs


class ScoreEntryViewSet(viewsets.ModelViewSet):
    queryset = ScoreEntry.objects.select_related("grading_component").all()
    serializer_class = ScoreEntrySerializer
    permission_classes = [IsAdvisoryTeacherOrStaff]
    owner_student_id_field = "enrollment__student_id"
    filter_backends = (DjangoFilterBackend, OrderingFilter)
    ordering_fields = ("recorded_at", "score_entry_id")
    ordering = ("-recorded_at",)

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get("enrollment_id"):
            qs = qs.filter(enrollment_id=params["enrollment_id"])
        if params.get("subject_id"):
            qs = qs.filter(subject_id=params["subject_id"])
        if params.get("grading_period"):
            qs = qs.filter(grading_period=params["grading_period"])
        if params.get("grading_component_id"):
            qs = qs.filter(grading_component_id=params["grading_component_id"])
        role = getattr(self.request.user, "role", None)
        if role == "teacher":
            qs = qs.filter(enrollment__student_id__in=teacher_student_ids(self.request.user))
        elif role == "guardian":
            qs = qs.filter(enrollment__student_id__in=guardian_student_ids(self.request.user))
        return qs

    def perform_create(self, serializer):
        # has_object_permission never runs on create, so without this any
        # teacher could post a score entry for any learner in the school.
        #
        # GradeViewSet and AttendanceViewSet both close this the same way, and
        # assert_teacher_may_write_enrollment's own docstring names "grades /
        # attendance" as the paths it was written for -- score entries were
        # missed. They are not a lesser record: compute_grade() turns them into
        # the transmuted grade that goes on the report card and on SF9/SF10.
        assert_teacher_may_write_enrollment(
            self.request.user, serializer.validated_data.get("enrollment")
        )
        serializer.save()

    def perform_update(self, serializer):
        # Detail routes DO get has_object_permission, but only against the row
        # as it already exists. A PATCH that moves an entry onto a different
        # enrollment is checked against the old one, so the destination needs
        # its own check.
        assert_teacher_may_write_enrollment(
            self.request.user,
            serializer.validated_data.get("enrollment")
            or getattr(serializer.instance, "enrollment", None),
        )
        serializer.save()

    @action(detail=False, methods=["get"], url_path="compute")
    def compute_grade(self, request):
        """
        GET /api/score-entries/compute/?enrollment_id=1&subject_id=2&grading_period=1st_quarter

        Returns weighted grade breakdown per component and the final grade.
        """
        enrollment_id = request.query_params.get("enrollment_id")
        subject_id = request.query_params.get("subject_id")
        grading_period = request.query_params.get("grading_period")

        if not all([enrollment_id, subject_id, grading_period]):
            return Response(
                {"error": "enrollment_id, subject_id, and grading_period are required."},
                status=400,
            )
        try:
            enrollment_id, subject_id = int(enrollment_id), int(subject_id)
        except (TypeError, ValueError):
            return Response(
                {"error": "enrollment_id and subject_id must be whole numbers."}, status=400,
            )

        role = getattr(request.user, "role", None)
        if role in ("teacher", "guardian"):
            student_id = Enrollment.objects.filter(pk=enrollment_id).values_list("student_id", flat=True).first()
            allowed = teacher_student_ids(request.user) if role == "teacher" else guardian_student_ids(request.user)
            if student_id not in allowed:
                return Response(
                    {"detail": "You do not have access to this record."},
                    status=403,
                )

        try:
            subject = Subject.objects.select_related("grading_template").get(
                subject_id=subject_id
            )
        except Subject.DoesNotExist:
            return Response({"error": "Subject not found."}, status=404)

        template = subject.grading_template
        if not template:
            return Response(
                {"error": "No grading template assigned to this subject."},
                status=400,
            )

        components = template.components.all().order_by("sort_order")
        component_results = []
        pending_components = []
        weighted_total = Decimal("0")
        encoded_weight = Decimal("0")

        for comp in components:
            entries = list(ScoreEntry.objects.filter(
                enrollment_id=enrollment_id,
                subject_id=subject_id,
                grading_component=comp,
                grading_period=grading_period,
            ))

            # DO 8 Percentage Score, over summed raw and highest-possible
            # scores rather than a mean of per-assessment percentages.
            ps = percentage_score(entries)

            if ps is None:
                # A component with nothing encoded is NOT a zero. Scoring it 0
                # and weighting it in made every learner read as failing until
                # the last column was encoded.
                pending_components.append(comp.component_name)
                weighted = None
            else:
                weighted = (ps * comp.weight) / Decimal("100")
                weighted_total += weighted
                encoded_weight += Decimal(str(comp.weight))

            component_results.append({
                "component_id": comp.grading_component_id,
                "component_name": comp.component_name,
                "weight": float(comp.weight),
                "entries_count": len(entries),
                "is_encoded": ps is not None,
                "average_percentage": None if ps is None else float(quantize(ps)),
                "weighted_score": None if weighted is None else float(quantize(weighted)),
            })

        is_complete = not pending_components and bool(component_results)

        # While encoding is still in progress, renormalise over the components
        # that do have scores so the running grade is meaningful instead of
        # artificially depressed. This mirrors how the risk model renormalises
        # over the signals actually present (ai/services.py).
        if encoded_weight > 0:
            initial_grade = quantize(weighted_total * 100 / encoded_weight)
        else:
            initial_grade = None

        transmuted_grade = transmute(initial_grade)

        # Pass/fail is a determination about a finished quarter, and it is made
        # on the TRANSMUTED grade -- an Initial Grade of 74.99 transmutes to 84,
        # which is a pass. Applying the 75 line to the initial grade, as this
        # used to, got the determination wrong across the whole 60-99 band.
        remarks = None
        if is_complete and transmuted_grade is not None:
            remarks = "passed" if transmuted_grade >= PASSING_GRADE else "failed"

        return Response({
            "enrollment_id": int(enrollment_id),
            "subject_id": int(subject_id),
            "subject_name": subject.subject_name,
            "grading_period": grading_period,
            "template_name": template.template_name,
            "components": component_results,
            "initial_grade": None if initial_grade is None else float(initial_grade),
            "transmuted_grade": transmuted_grade,
            # `final_grade` keeps its name for existing callers, but now holds
            # the transmuted grade -- the number that goes on the form.
            "final_grade": transmuted_grade,
            "descriptor": descriptor(transmuted_grade),
            "is_complete": is_complete,
            "pending_components": pending_components,
            "remarks": remarks,
        })