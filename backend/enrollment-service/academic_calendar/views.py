from rest_framework.viewsets import ModelViewSet
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from accounts.permissions import IsAdminRegistrarOrReadOnly
from .models import CalendarEvent
from .serializers import CalendarEventSerializer


class CalendarPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 500


class CalendarEventViewSet(ModelViewSet):
    queryset = CalendarEvent.objects.all()
    serializer_class = CalendarEventSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]
    pagination_class = CalendarPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["school_year", "event_type"]
    search_fields = ["title", "description"]
    ordering_fields = ["start_date", "event_type", "school_year"]
    ordering = ["start_date"]
