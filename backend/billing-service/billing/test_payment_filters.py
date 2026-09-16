"""
Tests for payment student-search and school-year scoping (billing/views.py).

A payment is two hops from both of these: it has an invoice, the invoice has an
enrollment_id, and only the enrollment carries a school year and a student. The
student filter previously matched `invoice_no` as a stand-in for the name, so
typing a name found nothing — the one thing the field existed for. These tests
pin that it now resolves real names, and that the list and /summary/ go through
the same helper so the per-method tiles can never disagree with the rows.

The mirrors are managed=False and live in another service's tables, so they are
mocked rather than hitting a database — matching test_school_year_scope.py.
"""
from unittest.mock import patch

from billing.views import (
    StudentPaymentViewSet,
    enrollment_ids_for_school_year,
    enrollment_ids_matching_student,
)


class FakeQuerySet:
    """Records every .filter() call, and with what."""

    def __init__(self):
        self.filter_calls = []

    def filter(self, *args, **kwargs):
        self.filter_calls.append((args, kwargs))
        return self


def apply(params):
    """Run _apply_filters the way both the list and /summary/ do."""
    qs = FakeQuerySet()
    return qs, StudentPaymentViewSet()._apply_filters(qs, params)


# ── "no filter asked for" must stay distinct from "nothing matched" ─────────

def test_blank_term_returns_none_not_empty():
    """None means 'no filter'; an empty list would wrongly match nothing."""
    assert enrollment_ids_matching_student("") is None
    assert enrollment_ids_matching_student(None) is None
    assert enrollment_ids_matching_student("   ") is None


def test_blank_school_year_returns_none():
    assert enrollment_ids_for_school_year("") is None
    assert enrollment_ids_for_school_year(None) is None
    assert enrollment_ids_for_school_year("   ") is None


def test_no_params_applies_no_filters():
    qs, _ = apply({})
    assert qs.filter_calls == []


# ── the student filter resolves real names, not invoice numbers ─────────────

@patch("billing.enrollment_mirror.EnrollmentMirror.objects")
@patch("billing.enrollment_mirror.StudentMirror.objects")
def test_student_search_matches_by_name(mock_students, mock_enrollments):
    mock_students.filter.return_value.values_list.return_value = [3]
    mock_enrollments.filter.return_value.values_list.return_value = [41, 42]

    enrollment_ids_matching_student("Santos")

    # The name must reach StudentMirror — the old code never looked here.
    assert mock_students.filter.called
    q = mock_students.filter.call_args[0][0]
    assert "Santos" in str(q)


@patch("billing.views.enrollment_ids_matching_student", return_value=[41])
def test_search_param_filters_payments(_mock):
    qs, _ = apply({"search": "Santos"})
    assert len(qs.filter_calls) == 1
    # Q-object OR: invoice_no substring OR the student's enrollments.
    assert qs.filter_calls[0][0]


@patch("billing.views.enrollment_ids_matching_student", return_value=[41])
def test_student_name_is_accepted_as_an_alias(_mock):
    """The pre-existing param name keeps working for existing callers."""
    qs, _ = apply({"student_name": "Santos"})
    assert len(qs.filter_calls) == 1


# ── school year reaches through the invoice to the enrollment ──────────────

@patch("billing.views.enrollment_ids_for_school_year", return_value=[7, 8])
def test_school_year_filters_through_invoice(_mock):
    qs, _ = apply({"school_year": "2025-2026"})
    assert qs.filter_calls == [((), {"invoice__enrollment_id__in": [7, 8]})]


@patch("billing.views.enrollment_ids_for_school_year", return_value=None)
def test_blank_school_year_does_not_filter_payments(_mock):
    qs, _ = apply({"school_year": ""})
    assert qs.filter_calls == []


# ── the tiles and the rows must be scoped by the same code ─────────────────

def test_summary_and_list_share_the_filter_helper():
    """
    /summary/ computes per-method totals over ALL matches, not just the page.
    If it scoped differently from the list, the tiles would report figures the
    rows beneath them contradict — so both must call _apply_filters.
    """
    import inspect

    view = StudentPaymentViewSet
    assert "_apply_filters" in inspect.getsource(view.get_queryset)
    assert "_apply_filters" in inspect.getsource(view.summary)


def test_search_filter_backend_is_not_enabled():
    """
    DRF's SearchFilter would also consume `search`, applying it as an icontains
    against invoice__enrollment_id (an integer column). The two filters AND
    together, so leaving it on made every name search return nothing.
    """
    from rest_framework.filters import SearchFilter

    assert SearchFilter not in StudentPaymentViewSet.filter_backends
