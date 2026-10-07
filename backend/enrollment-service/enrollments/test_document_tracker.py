"""
EnrollmentViewSet.documents() -- the Requirements page's list of learners,
with the required documents each still owes, and the complete/missing split
its status band draws.

These pin who may read it, that the band's numbers cover the year (and level
and grade) whatever the search or the documents filter narrow the rows to,
and that a learner's status is the activation gate's own rule. Querysets are
mocked, as in the rest of this service's tests.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.views import EnrollmentViewSet

factory = APIRequestFactory()


def _user(role):
    return SimpleNamespace(role=role, user_id=1, is_authenticated=True)


def _call(role, query):
    request = Request(factory.get(f"/api/enrollments/documents/?{query}"))
    request.user = _user(role)
    view = EnrollmentViewSet()
    view.request = request
    view.format_kwarg = None
    return view, request


def _types():
    def rt(id_, statuses):
        return SimpleNamespace(
            requirement_type_id=id_, requirement_name=f"Doc {id_}", is_required=True,
            applies_to_levels=["elementary", "junior_highschool"], applies_to_entry_statuses=statuses,
        )
    # Everyone owes 1; only a transferee owes 2.
    return [rt(1, ["new", "transferee", "continuing"]), rt(2, ["transferee"])]


def _enrollment(id_, student_id, last):
    return SimpleNamespace(
        enrollment_id=id_, student_id=student_id, grade_level="Grade 7",
        school_level="junior_highschool", section="Rizal", enrollment_status="pending",
        student=SimpleNamespace(first_name="A", middle_name=None, last_name=last, suffix=None,
                                lrn=f"L{student_id}", student_number=f"S{student_id}"),
    )


# Student 1 is continuing and has doc 1: complete. Student 2 is a walk-in
# transferee with doc 1 only: missing doc 2. Student 3 has nothing: missing.
ENROLLMENTS = [_enrollment(10, 1, "Abad"), _enrollment(11, 2, "Bautista"), _enrollment(12, 3, "Cruz")]
SUBMITTED = [(1, 1), (2, 1)]


def _run(query, *, role="registrar", search_hits=None):
    view, request = _call(role, query)
    scope = MagicMock(name="scope")
    scope.filter.return_value = scope
    scope.order_by.return_value = ENROLLMENTS
    base = MagicMock(name="get_queryset")
    base.filter.return_value = scope

    earlier = MagicMock()
    earlier.values_list.return_value = [1]
    transfers = MagicMock()
    transfers.values_list.return_value = []
    submissions = MagicMock()
    submissions.values_list.return_value = SUBMITTED
    search = MagicMock()
    search.values_list.return_value = search_hits or []

    with patch.object(EnrollmentViewSet, "get_queryset", return_value=base), \
         patch("enrollments.views.Enrollment.objects.filter", return_value=earlier) as earlier_filter, \
         patch("enrollments.views.EnrollmentTransfer.objects.filter", return_value=transfers), \
         patch("requirements.models.StudentRequirementSubmission.objects.filter", return_value=submissions), \
         patch("requirements.models.RequirementType.objects.filter", return_value=_types()), \
         patch("enrollments.views.SearchFilter.filter_queryset", return_value=search) as search_filter:
        response = view.documents(request)
    return response, SimpleNamespace(base=base, scope=scope, earlier=earlier_filter, search=search_filter)


def test_lists_each_learner_with_what_they_still_owe():
    response, calls = _run("school_year=2026-2027")

    assert response.status_code == 200
    assert response.data["summary"] == {"learners": 3, "complete": 1, "missing": 2}
    assert response.data["count"] == 3
    rows = {r["student_id"]: r for r in response.data["results"]}
    assert (rows[1]["entry_status"], rows[1]["required"], rows[1]["missing"]) == ("continuing", 1, [])
    assert rows[2]["entry_status"] == "transferee"
    assert [m["requirement_name"] for m in rows[2]["missing"]] == ["Doc 2"]
    assert (rows[3]["required"], rows[3]["submitted"]) == (2, 0)

    # The year's live rows only, and "continuing" means an earlier year here.
    calls.base.filter.assert_called_once_with(
        school_year="2026-2027", enrollment_status__in=("pending", "enrolled", "completed"),
    )
    assert calls.earlier.call_args.kwargs["school_year__lt"] == "2026-2027"
    assert calls.earlier.call_args.kwargs["enrollment_status__in"] == ("enrolled", "completed", "transferred_out")


def test_level_and_grade_narrow_the_count_too():
    _, calls = _run("school_year=2026-2027&school_level=junior_highschool&grade_level=Grade 7")
    calls.scope.filter.assert_any_call(school_level__iexact="junior_highschool")
    calls.scope.filter.assert_any_call(grade_level__iexact="Grade 7")


def test_the_documents_filter_narrows_the_rows_but_not_the_band():
    response, _ = _run("school_year=2026-2027&documents=missing")
    assert [r["student_id"] for r in response.data["results"]] == [2, 3]
    assert response.data["count"] == 2
    assert response.data["summary"] == {"learners": 3, "complete": 1, "missing": 2}

    response, _ = _run("school_year=2026-2027&documents=complete")
    assert [r["student_id"] for r in response.data["results"]] == [1]


def test_search_uses_the_lists_own_search_and_leaves_the_band_alone():
    response, calls = _run("school_year=2026-2027&search=cruz", search_hits=[3])
    assert [r["student_id"] for r in response.data["results"]] == [3]
    assert response.data["summary"]["learners"] == 3
    assert calls.search.call_args.args[1] is calls.scope


def test_a_link_can_open_on_one_learner():
    response, _ = _run("school_year=2026-2027&student=2")
    assert [r["student_id"] for r in response.data["results"]] == [2]

    with pytest.raises(ValidationError):
        _run("school_year=2026-2027&student=abc")


def test_a_school_year_is_required():
    view, request = _call("registrar", "")
    assert view.documents(request).status_code == 400


@pytest.mark.parametrize("role", ["guardian", "accounting"])
def test_closed_to_guardians_and_accounting(role):
    view, request = _call(role, "school_year=2026-2027")
    with patch.object(EnrollmentViewSet, "get_queryset") as get_qs:
        response = view.documents(request)
    assert response.status_code == 403
    get_qs.assert_not_called()
