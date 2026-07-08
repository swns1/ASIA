from rest_framework import viewsets, permissions
from rest_framework.filters import OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend

from .models import Grade, NarrativeCategory, NarrativeReport
from .serializers import GradeSerializer, NarrativeCategorySerializer, NarrativeReportSerializer


class GradeViewSet(viewsets.ModelViewSet):
    queryset = Grade.objects.select_related("enrollment", "subject").all()
    serializer_class = GradeSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = (DjangoFilterBackend, OrderingFilter)
    filterset_fields = {
        "enrollment": ["exact"], "enrollment__student": ["exact"],
        "subject": ["exact"], "grading_period": ["exact"], "remarks": ["exact"],
    }
    ordering_fields = ("grade_id", "grading_period", "recorded_at", "numeric_grade")
    ordering = ("-recorded_at", "-grade_id")


class NarrativeCategoryViewSet(viewsets.ModelViewSet):
    queryset           = NarrativeCategory.objects.all()
    serializer_class   = NarrativeCategorySerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = (DjangoFilterBackend, OrderingFilter)
    filterset_fields   = {"is_active": ["exact"]}
    ordering_fields    = ("sort_order", "name", "category_id")
    ordering           = ("sort_order", "name")


class NarrativeReportViewSet(viewsets.ModelViewSet):
    queryset           = NarrativeReport.objects.select_related("enrollment", "category").all()
    serializer_class   = NarrativeReportSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = (DjangoFilterBackend, OrderingFilter)
    filterset_fields   = {"enrollment": ["exact"], "category": ["exact"], "grading_period": ["exact"]}
    ordering_fields    = ("report_id", "recorded_at")
    ordering           = ("category__sort_order", "category__name")