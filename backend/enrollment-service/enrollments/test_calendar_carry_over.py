"""
Tests for copying an earlier year's calendar: events move to the same day and
month in the new year, and nothing the new year already has is duplicated.

No database (see test_school_years.py): the ORM is mocked.
"""
from contextlib import nullcontext
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.models import SchoolYear
from enrollments.views import SchoolYearViewSet

factory = APIRequestFactory()


def _year(label, pk):
    first = int(label[:4])
    return SchoolYear(school_year_id=pk, label=label,
                      start_date=date(first, 6, 1), end_date=date(first + 1, 3, 31))


def _event(title, start, end=None, event_type="holiday", grading_period=None):
    return SimpleNamespace(title=title, event_type=event_type, grading_period=grading_period,
                           start_date=start, end_date=end or start, description=None)


def _carry(body, source_events=(), target_events=(), source="2024-2025", target="2026-2027"):
    source_year, target_year = _year(source, 1), _year(target, 2)
    request = Request(factory.post(f"/api/school-years/{target}/carry-over/", body, format="json"),
                      parsers=[JSONParser()])
    request.user = SimpleNamespace(role="admin", user_id=1, is_authenticated=True)
    view = SchoolYearViewSet()
    view.request, view.format_kwarg, view.action = request, None, "carry_over"
    view.kwargs = {"label": target}

    def event_filter(school_year, **kwargs):
        qs = MagicMock()
        if school_year == source:
            qs.order_by.return_value = list(source_events)
        elif "grading_period__isnull" in kwargs:
            qs.values_list.return_value = [e.grading_period for e in target_events if e.grading_period]
        else:
            qs.values_list.return_value = [(e.event_type, e.title) for e in target_events]
        return qs

    with patch.object(view, "get_object", return_value=target_year), \
         patch("enrollments.views.SchoolYear.objects") as years, \
         patch("academic_calendar.models.CalendarEvent.objects") as events, \
         patch("enrollments.views.transaction.atomic", return_value=nullcontext()):
        years.filter.return_value.first.return_value = source_year
        events.filter.side_effect = event_filter
        response = view.carry_over(request, label=target)
    return response, events


def test_events_move_to_the_same_day_in_the_new_year():
    response, events = _carry(
        {"from": "2024-2025", "parts": ["calendar"]},
        source_events=[
            _event("Christmas Day", date(2024, 12, 25)),
            _event("1st Quarter", date(2024, 6, 3), date(2024, 8, 16), "grading_period", "1st_quarter"),
            # 2024 is a leap year; 2026 isn't.
            _event("Leap day fair", date(2024, 2, 29), event_type="event"),
        ],
    )
    assert response.status_code == 200
    result = response.data["calendar"]
    assert result["shift_years"] == 2
    created = events.bulk_create.call_args.args[0]
    assert [(e.title, e.start_date, e.end_date, e.school_year) for e in created] == [
        ("Christmas Day", date(2026, 12, 25), date(2026, 12, 25), "2026-2027"),
        ("1st Quarter", date(2026, 6, 3), date(2026, 8, 16), "2026-2027"),
        ("Leap day fair", date(2026, 2, 28), date(2026, 2, 28), "2026-2027"),
    ]
    assert created[1].grading_period == "1st_quarter"


def test_nothing_the_new_year_has_is_duplicated():
    response, events = _carry(
        {"from": "2024-2025", "parts": ["calendar"]},
        source_events=[
            _event("Christmas Day", date(2024, 12, 25)),
            _event("Q1", date(2024, 6, 3), date(2024, 8, 16), "grading_period", "1st_quarter"),
            _event("Independence Day", date(2025, 6, 12)),
        ],
        target_events=[
            _event("CHRISTMAS DAY", date(2026, 12, 25)),
            _event("1st Quarter", date(2026, 6, 1), date(2026, 8, 14), "grading_period", "1st_quarter"),
        ],
    )
    result = response.data["calendar"]
    assert [r["title"] for r in result["copied"]] == ["Independence Day"]
    assert [r["title"] for r in result["skipped"]] == ["Christmas Day", "Q1"]


def test_a_calendar_preview_writes_nothing():
    response, events = _carry(
        {"from": "2024-2025", "parts": ["calendar"], "dry_run": True},
        source_events=[_event("Christmas Day", date(2024, 12, 25))],
    )
    assert response.data["calendar"]["copied"][0]["start_date"] == date(2026, 12, 25)
    events.bulk_create.assert_not_called()
