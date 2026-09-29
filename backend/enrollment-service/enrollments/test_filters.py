"""
Tests for the enrollment list's filters.

No database: the filter set only builds the query, and these tests read its
WHERE clause instead of running it.
"""
from enrollments.filters import EnrollmentFilter
from enrollments.models import Enrollment


def _where(params):
    qs = EnrollmentFilter(params, queryset=Enrollment.objects.all()).qs
    return [(c.lhs.target.name, c.lookup_name, c.rhs) for c in qs.query.where.children]


def test_several_statuses_at_once():
    # The Grades page lists everyone who attended a year: a finished year is
    # all `completed`, and pending/cancelled rows never have grades.
    [(field, lookup, values)] = _where({"enrollment_status__in": "enrolled,completed,transferred_out"})
    assert (field, lookup) == ("enrollment_status", "in")
    assert list(values) == ["enrolled", "completed", "transferred_out"]


def test_a_single_status_still_matches_on_its_own():
    assert _where({"enrollment_status": "enrolled"}) == [("enrollment_status", "iexact", "enrolled")]


def test_a_blank_list_filters_nothing():
    assert _where({"enrollment_status__in": ""}) == []
