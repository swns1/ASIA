from rest_framework import viewsets
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import IsAdminRegistrarOrReadOnly
from enrollments.archive import ArchivedYearGuard
from .models import Subject
from .serializers import SubjectSerializer


class SubjectViewSet(ArchivedYearGuard, viewsets.ModelViewSet):
    """
    /api/subjects/?school_year=2026-2027[&school_level=][&grade_level=]...

    Each school year's curriculum. Every reader passes the year it's showing
    -- an enrollment's, a section's, the page's -- so a subject added or
    renamed for one year never shows up in another. An archived year's
    subjects are read-only (ArchivedYearGuard).
    """

    queryset = Subject.objects.select_related("grading_template").prefetch_related(
        "grading_template__components"
    ).all()
    serializer_class = SubjectSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]

    filter_backends = (DjangoFilterBackend, SearchFilter, OrderingFilter)
    filterset_fields = ("school_year", "school_level", "grade_level", "strand", "semester")
    search_fields = ("subject_code", "subject_name")
    ordering_fields = ("school_level", "grade_level", "subject_name", "subject_code")
    ordering = ("school_level", "grade_level", "subject_name")
