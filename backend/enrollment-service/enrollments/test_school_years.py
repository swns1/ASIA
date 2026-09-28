"""
Tests for EnrollmentViewSet.school_years() -- the list behind every school-year
picker.

The list and the current year come from the school_years registry now, not
from whatever labels enrollments happen to use plus a July-cutoff guess.

No database in this service's tests: Enrollment is managed=False and the
project can't build a test DB (see ai/test_risk_assessment.py), so the ORM
chains are mocked, same convention as the rest of this service.
"""
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.models import SchoolYear
from enrollments.views import EnrollmentViewSet

factory = APIRequestFactory()


def _user(role, user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


def _year(label, is_current=False, archived=False):
    return SchoolYear(
        label=label,
        start_date=date(int(label[:4]), 7, 1),
        end_date=date(int(label[:4]) + 1, 6, 30),
        is_current=is_current,
        archived_at=date(2030, 1, 1) if archived else None,
    )


def _call(user):
    request = Request(factory.get("/api/enrollments/school-years/"))
    request.user = user
    view = EnrollmentViewSet()
    view.request = request
    view.format_kwarg = None
    return view.school_years(request)


def _call_with(rows, years, today=date(2026, 9, 16)):
    with patch("enrollments.views.Enrollment.objects") as objects, \
         patch("enrollments.views.SchoolYear.objects") as registry, \
         patch("enrollments.views.timezone.localdate", return_value=today):
        chain = objects.exclude.return_value.exclude.return_value
        chain.order_by.return_value.values.return_value.annotate.return_value = rows
        registry.all.return_value = years
        response = _call(_user("registrar"))
    return response, objects


def test_guardian_is_denied():
    with patch("enrollments.views.Enrollment.objects") as objects:
        response = _call(_user("guardian"))
    assert response.status_code == 403
    objects.exclude.assert_not_called()


def test_current_year_comes_from_the_registry_not_the_date():
    """The defect: "current" was a July-cutoff guess from today's date, one
    of four places deciding the current year. In September 2026 the guess
    says 2026-2027; the school says 2025-2026."""
    response, _ = _call_with(
        [{"school_year": "2025-2026", "count": 140}],
        [_year("2026-2027"), _year("2025-2026", is_current=True)],
    )
    assert response.data["current"] == "2025-2026"


def test_years_are_newest_first_with_counts_and_states():
    response, _ = _call_with(
        [
            {"school_year": "2024-2025", "count": 120},
            {"school_year": "2025-2026", "count": 140},
        ],
        [
            _year("2026-2027"),
            _year("2025-2026", is_current=True),
            _year("2024-2025", archived=True),
        ],
    )
    assert response.status_code == 200
    assert response.data["results"] == [
        {"school_year": "2026-2027", "count": 0, "state": "upcoming"},
        {"school_year": "2025-2026", "count": 140, "state": "current"},
        {"school_year": "2024-2025", "count": 120, "state": "archived"},
    ]


def test_a_registered_year_is_listed_before_it_has_enrollments():
    """Next year is set up before anyone is enrolled in it -- that is the
    whole point of an upcoming year -- so it must be offered empty."""
    response, _ = _call_with([], [_year("2026-2027"), _year("2025-2026", is_current=True)])
    assert [r["school_year"] for r in response.data["results"]] == ["2026-2027", "2025-2026"]


def test_an_unregistered_label_stays_reachable():
    """Only possible before migration 0006's foreign keys. Listing it with no
    state keeps those records reachable instead of silently hiding them."""
    response, _ = _call_with(
        [{"school_year": "2023-2024", "count": 3}],
        [_year("2025-2026", is_current=True)],
    )
    assert {"school_year": "2023-2024", "count": 3, "state": None} in response.data["results"]


def test_falls_back_to_the_date_only_when_no_year_is_current():
    response, _ = _call_with([], [], today=date(2026, 9, 16))
    assert response.data["current"] == "2026-2027"
    assert response.data["results"] == [{"school_year": "2026-2027", "count": 0, "state": None}]


def test_blank_and_null_years_are_excluded():
    _, objects = _call_with([], [])
    objects.exclude.assert_called_once_with(school_year__isnull=True)
    objects.exclude.return_value.exclude.assert_called_once_with(school_year="")
