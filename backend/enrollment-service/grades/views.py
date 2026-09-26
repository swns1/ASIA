from rest_framework import viewsets
from rest_framework.filters import OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import (
    IsAdminRegistrarOrReadOnly,
    IsAdvisoryTeacherOrStaff,
    assert_teacher_may_write_enrollment,
    guardian_student_ids,
    teacher_student_ids,
)
from enrollment_service.deletes import InUseDeleteMixin
from .models import Grade, NarrativeCategory, NarrativeReport
from .serializers import GradeSerializer, NarrativeCategorySerializer, NarrativeReportSerializer


def _scope_to_student_records(qs, user, path="enrollment__student_id"):
    """Narrow a queryset to the student_ids a teacher/guardian may see.
    Staff roles are unaffected. Guardians/teachers with no linked students
    get an empty queryset (fail closed)."""
    role = getattr(user, "role", None)
    if role == "teacher":
        return qs.filter(**{f"{path}__in": teacher_student_ids(user)})
    if role == "guardian":
        return qs.filter(**{f"{path}__in": guardian_student_ids(user)})
    return qs


class GradeViewSet(viewsets.ModelViewSet):
    queryset = Grade.objects.select_related("enrollment", "subject").all()
    serializer_class = GradeSerializer
    permission_classes = [IsAdvisoryTeacherOrStaff]
    owner_student_id_field = "enrollment__student_id"
    filter_backends = (DjangoFilterBackend, OrderingFilter)
    filterset_fields = {
        "enrollment": ["exact"], "enrollment__student": ["exact"],
        "subject": ["exact"], "grading_period": ["exact"], "remarks": ["exact"],
    }
    ordering_fields = ("grade_id", "grading_period", "recorded_at", "numeric_grade")
    ordering = ("-recorded_at", "-grade_id")

    def get_queryset(self):
        return _scope_to_student_records(super().get_queryset(), self.request.user)

    def perform_create(self, serializer):
        # has_object_permission never runs on create — without this a teacher
        # could post a grade for any student in the school.
        assert_teacher_may_write_enrollment(
            self.request.user, serializer.validated_data.get("enrollment")
        )
        serializer.save()

    def perform_update(self, serializer):
        # The object check saw the grade where it was; a PATCH can move it onto
        # another learner's enrollment, so check where it is going too.
        assert_teacher_may_write_enrollment(
            self.request.user,
            serializer.validated_data.get("enrollment") or serializer.instance.enrollment,
        )
        serializer.save()


class NarrativeCategoryViewSet(InUseDeleteMixin, viewsets.ModelViewSet):
    in_use_message = (
        "Observed values are already recorded under this category, so it can't be "
        "deleted. Turn it off (inactive) instead."
    )
    queryset           = NarrativeCategory.objects.all()
    serializer_class   = NarrativeCategorySerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]
    filter_backends    = (DjangoFilterBackend, OrderingFilter)
    filterset_fields   = {"is_active": ["exact"]}
    ordering_fields    = ("sort_order", "name", "category_id")
    ordering           = ("sort_order", "name")


class NarrativeReportViewSet(viewsets.ModelViewSet):
    queryset           = NarrativeReport.objects.select_related("enrollment", "category").all()
    serializer_class   = NarrativeReportSerializer
    permission_classes = [IsAdvisoryTeacherOrStaff]
    owner_student_id_field = "enrollment__student_id"
    filter_backends    = (DjangoFilterBackend, OrderingFilter)
    filterset_fields   = {"enrollment": ["exact"], "category": ["exact"], "grading_period": ["exact"]}
    ordering_fields    = ("report_id", "recorded_at")
    ordering           = ("category__sort_order", "category__name")

    def get_queryset(self):
        return _scope_to_student_records(super().get_queryset(), self.request.user)

    def perform_create(self, serializer):
        assert_teacher_may_write_enrollment(
            self.request.user, serializer.validated_data.get("enrollment")
        )
        serializer.save()

    def perform_update(self, serializer):
        assert_teacher_may_write_enrollment(
            self.request.user,
            serializer.validated_data.get("enrollment") or serializer.instance.enrollment,
        )
        serializer.save()