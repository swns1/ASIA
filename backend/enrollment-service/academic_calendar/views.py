from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from accounts.permissions import HasRole, IsAdminRegistrarOrReadOnly
from enrollments.archive import ArchivedYearGuard
from shared.roles import STAFF_ROLES
from .models import CalendarEvent, PersonalEvent
from .serializers import CalendarEventSerializer, GuardianCalendarEventSerializer, PersonalEventSerializer


class CalendarPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 500


# end_date__gte / start_date__lte: the events overlapping a window of days,
# whichever school year they're filed under -- the teacher's "Coming up" runs
# past the year's end into the next one's opening.
DATE_WINDOW_FILTERS = {
    "end_date":   ["gte"],
    "start_date": ["lte"],
}


class CalendarEventViewSet(ArchivedYearGuard, ModelViewSet):
    queryset = CalendarEvent.objects.all()
    serializer_class = CalendarEventSerializer
    permission_classes = [IsAdminRegistrarOrReadOnly]
    pagination_class = CalendarPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "school_year": ["exact"],
        "event_type":  ["exact"],
        **DATE_WINDOW_FILTERS,
    }
    search_fields = ["title", "description"]
    ordering_fields = ["start_date", "event_type", "school_year"]
    ordering = ["start_date"]


class GuardianCalendarEventViewSet(ReadOnlyModelViewSet):
    """
    The school calendar as the guardian portal shows it: only the events the
    registrar left visible to guardians. Guardians only -- staff read the
    whole calendar from CalendarEventViewSet, which refuses guardians.
    """

    # Grading periods are excluded by type as well as by the flag: the
    # serializer keeps their flag off, and this holds even for a row written
    # around it.
    queryset = CalendarEvent.objects.filter(visible_to_guardians=True).exclude(event_type="grading_period")
    serializer_class = GuardianCalendarEventSerializer
    permission_classes = [HasRole]
    required_roles = {"guardian"}
    pagination_class = CalendarPagination
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = {"school_year": ["exact"], **DATE_WINDOW_FILTERS}
    ordering_fields = ["start_date"]
    ordering = ["start_date"]


class PersonalEventViewSet(ModelViewSet):
    """
    The caller's own calendar entries. Every query is scoped to them, so
    another person's event answers 404, not 403: nobody, admins included,
    can learn that it exists. Staff only; guardians have no personal calendar.
    """

    serializer_class = PersonalEventSerializer
    permission_classes = [HasRole]
    required_roles = STAFF_ROLES
    pagination_class = CalendarPagination
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = DATE_WINDOW_FILTERS
    ordering_fields = ["start_date"]
    ordering = ["start_date"]

    def get_queryset(self):
        return PersonalEvent.objects.filter(owner_user_id=self.request.user.user_id)

    def perform_create(self, serializer):
        serializer.save(owner_user_id=self.request.user.user_id)
