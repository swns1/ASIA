"""
GET /api/enrollments/{id}/subjects/ -- the subject list on a Certificate of
Registration.

The certificate used to ask /api/subjects/ for it, which guardians may not
read, so a parent could not print their own child's. These tests pin that the
action answers for exactly the enrollments its caller may open (a guardian:
their own child's only), that it asks for that learner's subjects (senior
high: core + strand, and the semester's plus those with none), and that it
returns only what the certificate prints.

DB-free: managers swapped for enrollments.fake_orm.FakeQuerySet.
"""
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.http import Http404
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.fake_orm import FakeQuerySet
from enrollments.views import EnrollmentViewSet
from subjects.filters import enrollment_subject_params

factory = APIRequestFactory()


def enrollment(e_id, student_id, *, level="elementary", grade="Grade 5", strand=None, semester=None):
    return SimpleNamespace(
        enrollment_id=e_id, pk=e_id, student_id=student_id,
        school_year="2026-2027", school_level=level, grade_level=grade,
        strand=strand, semester=semester, enrollment_status="enrolled",
    )


ANA_G5 = enrollment(10, 1)
BEN_G11 = enrollment(20, 2, level="senior_highschool", grade="Grade 11", strand="ABM", semester="1st")

SUBJECTS = [
    SimpleNamespace(subject_id=2, subject_code="SCI5", subject_name="Science", strand=None, semester=None,
                    grading_template_id=9),
    SimpleNamespace(subject_id=1, subject_code="ENG5", subject_name="English", strand=None, semester=None,
                    grading_template_id=9),
]


class FakeSubjectFilter:
    """Records the query it was given; .qs is the canned subject list."""
    calls = []

    def __init__(self, data, queryset):
        FakeSubjectFilter.calls.append(data)
        self.qs = FakeQuerySet(SUBJECTS)


def _fake_get_object_or_404(queryset, **kw):
    obj = queryset.filter(**kw).first()
    if obj is None:
        raise Http404
    return obj


def _subjects(role, pk, *, linked=frozenset({1})):
    request = Request(factory.get(f"/api/enrollments/{pk}/subjects/"))
    request.user = SimpleNamespace(role=role, user_id=77, is_authenticated=True)
    view = EnrollmentViewSet()
    view.request = request
    view.format_kwarg = None
    view.kwargs = {"pk": pk}
    view.queryset = FakeQuerySet([ANA_G5, BEN_G11])
    # The filter backends read query params against a real model; the
    # access under test is get_queryset() + the object permission.
    view.filter_queryset = lambda qs: qs

    FakeSubjectFilter.calls = []
    with patch("enrollments.views.guardian_student_ids", return_value=set(linked)), \
         patch("accounts.permissions.guardian_student_ids", return_value=set(linked)), \
         patch("rest_framework.generics.get_object_or_404", new=_fake_get_object_or_404), \
         patch("subjects.filters.SubjectFilter", new=FakeSubjectFilter):
        return view.subjects(request, pk=pk)


def test_a_guardian_gets_their_own_childs_subjects():
    response = _subjects("guardian", 10)

    assert response.status_code == 200
    assert [s["subject_name"] for s in response.data] == ["English", "Science"]


def test_only_what_the_certificate_prints_is_returned():
    response = _subjects("guardian", 10)

    assert set(response.data[0]) == {"subject_id", "subject_code", "subject_name", "strand", "semester"}


def test_a_guardian_cannot_read_another_familys_child():
    with pytest.raises(Http404):
        _subjects("guardian", 20)


def test_an_unlinked_guardian_reads_nothing():
    with pytest.raises(Http404):
        _subjects("guardian", 10, linked=frozenset())


def test_staff_read_any_enrollment_and_the_query_is_that_learners():
    response = _subjects("registrar", 20)

    assert response.status_code == 200
    assert FakeSubjectFilter.calls == [enrollment_subject_params(BEN_G11)]


def test_elementary_asks_for_the_year_level_and_grade_only():
    assert enrollment_subject_params(ANA_G5) == {
        "school_year": "2026-2027", "school_level": "elementary", "grade_level": "Grade 5",
    }


def test_senior_high_asks_for_core_plus_strand_and_the_semester():
    # for_strand / for_semester, not strand / semester: the exact matches
    # dropped the core subjects and those with no semester recorded.
    assert enrollment_subject_params(BEN_G11) == {
        "school_year": "2026-2027", "school_level": "senior_highschool", "grade_level": "Grade 11",
        "for_strand": "ABM", "for_semester": "1st",
    }
