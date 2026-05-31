from rest_framework.viewsets import ModelViewSet
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from accounts.permissions import IsAdminRegistrarOrReadOnly
from .models import CalendarEvent
from .serializers import CalendarEventSerializer


class CalendarEventViewSet(ModelViewSet):
    queryset = CalendarEvent.objects.all()
    serializer_class = CalendarEventSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["school_year", "event_type"]
    search_fields = ["title", "description"]
    ordering_fields = ["start_date", "event_type", "school_year"]
    ordering = ["start_date"]
