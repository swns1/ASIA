from decimal import Decimal
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import IsAdminRegistrarOrReadOnly, IsAdvisoryTeacherOrStaff, teacher_student_ids
from enrollments.models import Enrollment
from subjects.models import Subject
from .models import GradingTemplate, GradingComponent, ScoreEntry
from .serializers import (
    GradingTemplateSerializer,
    GradingComponentSerializer,
    ScoreEntrySerializer,
)


class GradingTemplateViewSet(viewsets.ModelViewSet):
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


class GradingComponentViewSet(viewsets.ModelViewSet):
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
        if getattr(self.request.user, "role", None) == "teacher":
            qs = qs.filter(enrollment__student_id__in=teacher_student_ids(self.request.user))
        return qs

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

        if getattr(request.user, "role", None) == "teacher":
            student_id = Enrollment.objects.filter(pk=enrollment_id).values_list("student_id", flat=True).first()
            if student_id not in teacher_student_ids(request.user):
                return Response(
                    {"detail": "You can only view grade computations for your own advisory section."},
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
        final_grade = Decimal("0")

        for comp in components:
            entries = ScoreEntry.objects.filter(
                enrollment_id=enrollment_id,
                subject_id=subject_id,
                grading_component=comp,
                grading_period=grading_period,
            )

            if entries.exists():
                percentages = [
                    (Decimal(str(e.score)) / Decimal(str(e.max_score))) * 100
                    for e in entries
                ]
                avg_pct = sum(percentages) / len(percentages)
            else:
                avg_pct = Decimal("0")

            weighted = (avg_pct * comp.weight) / Decimal("100")
            final_grade += weighted

            component_results.append({
                "component_id": comp.grading_component_id,
                "component_name": comp.component_name,
                "weight": float(comp.weight),
                "entries_count": entries.count(),
                "average_percentage": round(float(avg_pct), 2),
                "weighted_score": round(float(weighted), 2),
            })

        final_grade = round(float(final_grade), 2)
        remarks = None
        if final_grade >= 75:
            remarks = "passed"
        elif final_grade > 0:
            remarks = "failed"

        return Response({
            "enrollment_id": int(enrollment_id),
            "subject_id": int(subject_id),
            "subject_name": subject.subject_name,
            "grading_period": grading_period,
            "template_name": template.template_name,
            "components": component_results,
            "final_grade": final_grade,
            "remarks": remarks,
        })