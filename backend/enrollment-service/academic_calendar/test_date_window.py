"""
The calendar list filters by a window of days, not only by school year.

The teacher's "Coming up" asked for the current year's events, so in the last
weeks of a year the next year's opening days never showed. It now asks for
the events overlapping its window (end_date__gte / start_date__lte).
"""
from django_filters.rest_framework import DjangoFilterBackend

from academic_calendar.models import CalendarEvent
from academic_calendar.views import CalendarEventViewSet


def _filters():
    view = CalendarEventViewSet()
    filterset = DjangoFilterBackend().get_filterset_class(view, CalendarEvent.objects.all())
    return filterset.base_filters


def test_events_overlapping_a_window_of_days():
    filters = _filters()
    assert filters["end_date__gte"].lookup_expr == "gte"
    assert filters["start_date__lte"].lookup_expr == "lte"


def test_the_year_and_type_filters_keep_their_names():
    filters = _filters()
    assert filters["school_year"].lookup_expr == "exact"
    assert filters["event_type"].lookup_expr == "exact"
