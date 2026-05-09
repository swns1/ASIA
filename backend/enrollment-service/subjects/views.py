from rest_framework import viewsets
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import IsAdminRegistrarOrReadOnly
from .models import Subject
from .serializers import SubjectSerializer


class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.select_related("grading_template").prefetch_related(
        "grading_template__components"
    ).all()
    serializer_class = SubjectSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]

    filter_backends = (DjangoFilterBackend, SearchFilter, OrderingFilter)
    filterset_fields = ("school_level", "grade_level", "strand", "semester")
    search_fields = ("subject_code", "subject_name")
    ordering_fields = ("school_level", "grade_level", "subject_name", "subject_code")
    ordering = ("school_level", "grade_level", "subject_name")