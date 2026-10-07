from rest_framework import viewsets
from rest_framework.filters import SearchFilter, OrderingFilter
from django.db.models import Case, IntegerField, Value, When
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import IsAdminRegistrarOrReadOnly
from enrollment_service.deletes import InUseDeleteMixin
from enrollments.archive import ArchivedYearGuard
from enrollments.rules import GRADE_ORDER
from .filters import SubjectFilter
from .models import Subject
from .serializers import SubjectSerializer

# A subject's place on the grade ladder, Nursery to Grade 12. The level and
# grade columns sort as text, which put Grade 10 before Grade 7 and
# Kindergarten after Junior High; a grade also decides its level, so this one
# rank orders both. An unknown grade goes last.
GRADE_RANK = Case(
    *(When(grade_level=grade, then=Value(rank)) for rank, grade in enumerate(GRADE_ORDER)),
    default=Value(len(GRADE_ORDER)),
    output_field=IntegerField(),
)


class SubjectViewSet(InUseDeleteMixin, ArchivedYearGuard, viewsets.ModelViewSet):
    """
    /api/subjects/?school_year=2026-2027[&school_level=][&grade_level=]...

    Each school year's curriculum. Every reader passes the year it's showing
    -- an enrollment's, a section's, the page's -- so a subject added or
    renamed for one year never shows up in another. An archived year's
    subjects are read-only (ArchivedYearGuard).
    """

    in_use_message = (
        "Grades or scores are already recorded for this subject, so it can't be deleted."
    )
    queryset = Subject.objects.select_related("grading_template").prefetch_related(
        "grading_template__components"
    ).all()
    serializer_class = SubjectSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]

    filter_backends = (DjangoFilterBackend, SearchFilter, OrderingFilter)
    filterset_class = SubjectFilter
    search_fields = ("subject_code", "subject_name")
    ordering_fields = ("school_level", "grade_level", "subject_name", "subject_code")
    # The way the school reads its curriculum: grade by grade, then by name.
    ordering = ("grade_rank", "subject_name")

    def get_queryset(self):
        return super().get_queryset().annotate(grade_rank=GRADE_RANK)
