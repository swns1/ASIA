"""
The enrollment-service QA pass, second round (2026-09-26).

- Senior high subject lists used an exact strand match, which drops the core
  subjects every strand takes (SF9, SF10, the Certificate of Registration and
  My Sections all read them that way).
- Analytics and the at-risk score read only `enrolled` rows: a finished year
  was empty, and a senior high learner's two semester rows were not one year.
- A finished school year could only be closed a class at a time.
- The "not yet placed" list named learners who had transferred out.
- Scholarships could be awarded on a cancelled enrollment or from a retired
  scholarship, and nothing said an issued invoice needs re-issuing.
- Failed confirmation emails were logged where no screen would ever read them.

DB-free: managers are swapped for enrollments.fake_orm.FakeQuerySet or mocks.
"""
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from rest_framework import serializers as drf_serializers
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from ai.services import pick_primary_enrollment
from enrollments.fake_orm import FakeQuerySet
from enrollments.views import EnrollmentViewSet
from scholarships.serializers import EnrollmentScholarshipSerializer
from subjects.filters import SubjectFilter

factory = APIRequestFactory()


def _view(method, path, data=None, *, role="registrar"):
    request = Request(getattr(factory, method)(path, data or {}, format="json"))
    if data is not None:
        request._full_data = data
    request.user = SimpleNamespace(role=role, user_id=1, is_authenticated=True)
    view = EnrollmentViewSet()
    view.request, view.format_kwarg, view.kwargs = request, None, {}
    return view, request


# ── subjects a learner takes ────────────────────────────────────────────────

def _q_leaves(q):
    out = []
    for child in q.children:
        out.extend(_q_leaves(child) if hasattr(child, "children") else [child])
    return out


def test_for_strand_is_core_plus_that_strand():
    qs = MagicMock()
    SubjectFilter().filter_for_strand(qs, "for_strand", "ABM")
    (q,), _ = qs.filter.call_args
    assert q.connector == "OR"
    leaves = _q_leaves(q)
    assert ("strand__isnull", True) in leaves
    assert ("strand__iexact", "ABM") in leaves


def test_my_sections_does_not_narrow_to_one_half_of_the_list():
    """A strand advisory gets core + strand; a whole-section one gets all."""
    import inspect

    source = inspect.getsource(EnrollmentViewSet) + inspect.getsource(
        __import__("enrollments.views", fromlist=["SectionAdvisoryViewSet"]).SectionAdvisoryViewSet.my_sections
    )
    assert 'filter(strand__isnull=True)' not in source


# ── one learner, one year, however many rows ────────────────────────────────

def test_the_current_row_is_the_one_being_studied_on():
    first_sem = SimpleNamespace(enrollment_id=10, enrollment_status="completed")
    second_sem = SimpleNamespace(enrollment_id=11, enrollment_status="enrolled")
    assert pick_primary_enrollment([second_sem, first_sem]) is second_sem


def test_a_finished_year_reports_against_its_latest_row():
    rows = [SimpleNamespace(enrollment_id=10, enrollment_status="completed"),
            SimpleNamespace(enrollment_id=11, enrollment_status="completed")]
    assert pick_primary_enrollment(rows).enrollment_id == 11
    assert pick_primary_enrollment([]) is None


# ── Close SY ────────────────────────────────────────────────────────────────

def _row(e_id, year, status):
    return SimpleNamespace(enrollment_id=e_id, pk=e_id, school_year=year, enrollment_status=status)


@patch("enrollments.views.timezone.localdate", return_value=date(2026, 9, 26))
def test_close_a_finished_year(_today):
    rows = [_row(1, "2025-2026", "enrolled"), _row(2, "2025-2026", "completed"),
            _row(3, "2026-2027", "enrolled")]
    view, request = _view("post", "/api/enrollments/close-year/", {"school_year": "2025-2026"})
    with patch("enrollments.views.Enrollment.objects", new=FakeQuerySet(rows)), \
         patch("enrollments.views.transaction.atomic", MagicMock()):
        response = view.close_year(request)
    assert response.status_code == 200
    assert response.data == {"school_year": "2025-2026", "completed": 1}
    assert [r.enrollment_status for r in rows] == ["completed", "completed", "enrolled"]


@pytest.mark.parametrize("year", ["2026-2027", "2027-2028", "2025"])
@patch("enrollments.views.timezone.localdate", return_value=date(2026, 9, 26))
def test_the_year_in_progress_is_not_closed_this_way(_today, year):
    rows = [_row(3, "2026-2027", "enrolled")]
    view, request = _view("post", "/api/enrollments/close-year/", {"school_year": year})
    with patch("enrollments.views.Enrollment.objects", new=FakeQuerySet(rows)):
        response = view.close_year(request)
    assert response.status_code == 400
    assert rows[0].enrollment_status == "enrolled"


# ── not yet placed ──────────────────────────────────────────────────────────

def test_a_learner_who_transferred_out_is_not_waiting_for_a_place():
    stay = SimpleNamespace(student_id=1, pk=1, status="active", student_number="S-1", lrn="1",
                           first_name="Ana", middle_name=None, last_name="Cruz", suffix=None)
    left = SimpleNamespace(student_id=2, pk=2, status="active", student_number="S-2", lrn="2",
                           first_name="Ben", middle_name=None, last_name="Reyes", suffix=None)
    enrollments = [SimpleNamespace(enrollment_id=9, student_id=2, school_year="2026-2027",
                                   enrollment_status="transferred_out", grade_level="Grade 5",
                                   semester=None)]
    view, request = _view("get", "/api/enrollments/unplaced/?school_year=2026-2027")
    with patch("enrollments.views.Enrollment.objects", new=FakeQuerySet(enrollments)), \
         patch("enrollments.views.Student.objects", new=FakeQuerySet([stay, left])):
        response = view.unplaced(request)
    assert [r["student_id"] for r in response.data["results"]] == [1]


# ── scholarships ────────────────────────────────────────────────────────────

ACTIVE = SimpleNamespace(pk=1, is_active=True)
RETIRED = SimpleNamespace(pk=2, is_active=False)


def _award_validate(attrs, instance=None):
    serializer = EnrollmentScholarshipSerializer()
    serializer.instance = instance
    with patch("scholarships.serializers.EnrollmentScholarship.objects", new=FakeQuerySet([])):
        return serializer.validate(dict(attrs))


def test_no_award_on_a_cancelled_enrollment():
    with pytest.raises(drf_serializers.ValidationError) as exc:
        _award_validate({"enrollment": SimpleNamespace(enrollment_status="cancelled"),
                         "scholarship_type": ACTIVE})
    assert "enrollment" in exc.value.detail


def test_no_award_from_a_retired_scholarship():
    with pytest.raises(drf_serializers.ValidationError) as exc:
        _award_validate({"enrollment": SimpleNamespace(enrollment_status="enrolled"),
                         "scholarship_type": RETIRED})
    assert "scholarship_type" in exc.value.detail


def test_last_years_award_keeps_its_notes_editable():
    """Awarded while enrolled; the year has since completed and the type retired."""
    award = SimpleNamespace(pk=7, enrollment=SimpleNamespace(enrollment_status="completed"),
                            scholarship_type=RETIRED)
    attrs = _award_validate({"notes": "Renewed on appeal"}, instance=award)
    assert attrs["notes"] == "Renewed on appeal"


def test_revoking_names_the_invoice_to_reissue():
    from scholarships.views import EnrollmentScholarshipViewSet

    view = EnrollmentScholarshipViewSet()
    award = SimpleNamespace(enrollment=SimpleNamespace(student_id=5, school_year="2026-2027"))
    with patch.object(EnrollmentScholarshipViewSet, "get_object", return_value=award), \
         patch.object(EnrollmentScholarshipViewSet, "perform_destroy") as destroy, \
         patch("scholarships.views.live_invoice_no", return_value="INV-2026-000301"):
        response = view.destroy(None)
    destroy.assert_called_once_with(award)
    assert response.data == {"invoice_to_reissue": "INV-2026-000301"}


# ── failed confirmation emails ──────────────────────────────────────────────

def test_email_status_is_for_staff_who_can_resend():
    view, request = _view("get", "/api/enrollments/55/email-status/", role="accounting")
    assert view.email_status(request, pk=55).status_code == 403


def test_email_status_lists_the_open_failures():
    view, request = _view("get", "/api/enrollments/55/email-status/")
    failure = SimpleNamespace(email_delivery_failure_id=3, to_email="maria@example.com",
                              context={"enrollment_id": 55, "recipients": ["maria@example.com"]},
                              created_at="2026-09-20T08:00:00+08:00")
    with patch.object(EnrollmentViewSet, "get_object", return_value=SimpleNamespace(enrollment_id=55)), \
         patch("enrollments.views.EmailDeliveryFailure.objects") as failures:
        failures.filter.return_value.order_by.return_value = [failure]
        response = view.email_status(request, pk=55)
    failures.filter.assert_called_once_with(context__enrollment_id=55, resolved_at__isnull=True)
    assert response.data["failures"][0]["recipients"] == ["maria@example.com"]
