from rest_framework import viewsets, permissions
from rest_framework.filters import OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from .models import Grade
from .serializers import GradeSerializer


class GradeViewSet(viewsets.ModelViewSet):
    """
    /api/grades/

    Full CRUD per the spec ("teachers enter per student").

    Filters:
      ?enrollment={id}
      ?subject={id}
      ?grading_period=1st_quarter
      ?student={id}      (joins through enrollment)
    """

    queryset = Grade.objects.select_related("enrollment", "subject").all()
    serializer_class = GradeSerializer
    permission_classes = [permissions.IsAuthenticated]

    filter_backends = (DjangoFilterBackend, OrderingFilter)
    filterset_fields = {
        "enrollment":     ["exact"],
        "enrollment__student": ["exact"],
        "subject":        ["exact"],
        "grading_period": ["exact"],
        "remarks":        ["exact"],
    }
    ordering_fields = ("grade_id", "grading_period", "recorded_at", "numeric_grade")
    ordering = ("-recorded_at", "-grade_id")
