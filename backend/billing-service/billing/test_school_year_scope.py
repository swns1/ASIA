"""
Tests for school-year scoping of invoices (billing/views.py).

An invoice carries no school year of its own — only `enrollment_id` — so
scoping to a year means resolving enrollment ids through EnrollmentMirror.
These tests pin the two behaviours that are easy to regress and expensive to
notice: a blank year must NOT filter (it is the "all years" view), and the
list and /summary/ endpoints must scope through the same helper so the page's
stat tiles can never disagree with the rows beneath them.

EnrollmentMirror is managed=False and lives in another service's table, so it
is mocked here rather than hitting a real database — matching test_services.py.
"""
from unittest.mock import patch

from billing.views import scope_invoices_to_school_year


class FakeQuerySet:
    """Records whether .filter() was called, and with what."""

    def __init__(self):
        self.filter_calls = []

    def filter(self, **kwargs):
        self.filter_calls.append(kwargs)
        return self


# ── blank input is the all-years view, not an empty result ──────────────────

def test_blank_school_year_does_not_filter():
    qs = FakeQuerySet()
    assert scope_invoices_to_school_year(qs, "") is qs
    assert qs.filter_calls == []


def test_none_school_year_does_not_filter():
    qs = FakeQuerySet()
    assert scope_invoices_to_school_year(qs, None) is qs
    assert qs.filter_calls == []


def test_whitespace_only_school_year_does_not_filter():
    """A stray "  " from a query string must not silently filter to nothing."""
    qs = FakeQuerySet()
    assert scope_invoices_to_school_year(qs, "   ") is qs
    assert qs.filter_calls == []


# ── a real year filters by enrollment id ────────────────────────────────────

@patch("billing.enrollment_mirror.EnrollmentMirror.objects")
def test_school_year_filters_by_enrollment_ids(mock_objects):
    mock_objects.filter.return_value.values_list.return_value = [7, 8]

    qs = FakeQuerySet()
    scope_invoices_to_school_year(qs, "2025-2026")

    mock_objects.filter.assert_called_once_with(school_year="2025-2026")
    assert qs.filter_calls == [{"enrollment_id__in": [7, 8]}]


@patch("billing.enrollment_mirror.EnrollmentMirror.objects")
def test_school_year_is_trimmed_before_lookup(mock_objects):
    mock_objects.filter.return_value.values_list.return_value = []

    scope_invoices_to_school_year(FakeQuerySet(), "  2026-2027  ")

    mock_objects.filter.assert_called_once_with(school_year="2026-2027")


@patch("billing.enrollment_mirror.EnrollmentMirror.objects")
def test_year_with_no_enrollments_yields_empty_filter(mock_objects):
    """A year nobody enrolled in filters to nothing rather than to everything."""
    mock_objects.filter.return_value.values_list.return_value = []

    qs = FakeQuerySet()
    scope_invoices_to_school_year(qs, "2099-2100")

    assert qs.filter_calls == [{"enrollment_id__in": []}]
