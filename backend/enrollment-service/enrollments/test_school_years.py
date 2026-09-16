"""
Tests for EnrollmentViewSet.school_years() -- the list behind the sidebar
school-year picker.

Enrollment is managed=False, so the ORM chain is mocked rather than hitting a
real database, same convention as the rest of this service's tests.
"""
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.views import EnrollmentViewSet

factory = APIRequestFactory()


def _user(role, user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


def _call(user):
    request = Request(factory.get("/api/enrollments/school-years/"))
    request.user = user
    view = EnrollmentViewSet()
    view.request = request
    view.format_kwarg = None
    return view.school_years(request)


class _FixedDate(date):
    @classmethod
    def today(cls):
        return cls(2026, 9, 16)


def _call_with_rows(rows):
    with patch("enrollments.views.Enrollment.objects") as objects, \
         patch("enrollments.views.date", _FixedDate):
        chain = objects.exclude.return_value.exclude.return_value
        chain.order_by.return_value.values.return_value.annotate.return_value = rows
        response = _call(_user("registrar"))
    return response, objects


def test_guardian_is_denied():
    with patch("enrollments.views.Enrollment.objects") as objects:
        response = _call(_user("guardian"))
    assert response.status_code == 403
    objects.exclude.assert_not_called()


def test_years_are_newest_first_with_counts():
    response, _ = _call_with_rows([
        {"school_year": "2024-2025", "count": 120},
        {"school_year": "2026-2027", "count": 5},
        {"school_year": "2025-2026", "count": 140},
    ])
    assert response.status_code == 200
    assert response.data["current"] == "2026-2027"
    assert response.data["results"] == [
        {"school_year": "2026-2027", "count": 5},
        {"school_year": "2025-2026", "count": 140},
        {"school_year": "2024-2025", "count": 120},
    ]


def test_current_year_is_included_even_when_empty():
    response, _ = _call_with_rows([{"school_year": "2025-2026", "count": 140}])
    assert response.data["results"] == [
        {"school_year": "2026-2027", "count": 0},
        {"school_year": "2025-2026", "count": 140},
    ]


def test_blank_and_null_years_are_excluded():
    _, objects = _call_with_rows([])
    objects.exclude.assert_called_once_with(school_year__isnull=True)
    objects.exclude.return_value.exclude.assert_called_once_with(school_year="")
