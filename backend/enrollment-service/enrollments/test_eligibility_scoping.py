"""
Regression tests for EnrollmentViewSet.eligibility()'s access scoping.

Previously only guardians were denied ("Enrollment eligibility is a staff
planning tool, not part of the guardian portal") -- a teacher could pass
any student_id and get that student's full enrollment history, failed-
subject list with grades, and missing-document list, regardless of whether
that student was in their own advisory. The identical pattern was already
correctly guarded 30 lines earlier at {enrollment_id}/grades/ (see
test_grades_scoping_matches_the_existing_pattern below); this closes the
same gap here.

Enrollment/RequirementType/StudentRequirementSubmission are all
managed=False -- mocked rather than hitting a real database, same
convention as the rest of this service's tests.
"""
from types import SimpleNamespace
from unittest.mock import patch

from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.views import EnrollmentViewSet

factory = APIRequestFactory()


def _user(role, user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


def _call_eligibility(user, student_id="42"):
    django_request = factory.get(f"/api/enrollments/eligibility/?student_id={student_id}")
    request = Request(django_request)
    request.user = user
    view = EnrollmentViewSet()
    view.request = request
    view.format_kwarg = None
    return view.eligibility(request)


def test_teacher_outside_their_roster_is_denied():
    with patch("enrollments.views.teacher_student_ids", return_value={1, 2, 3}):
        response = _call_eligibility(_user("teacher"), student_id="42")
    assert response.status_code == 403


def test_guardian_is_still_denied():
    response = _call_eligibility(_user("guardian"))
    assert response.status_code == 403


@patch("enrollments.views.Enrollment.objects.filter")
def test_teacher_inside_their_roster_is_allowed_through(mock_enrollment_filter):
    mock_enrollment_filter.return_value.order_by.return_value = []
    with patch("enrollments.views.teacher_student_ids", return_value={42}), \
         patch("requirements.models.RequirementType.objects.filter", return_value=[]), \
         patch("requirements.models.StudentRequirementSubmission.objects.filter") as mock_submissions:
        mock_submissions.return_value.values_list.return_value = []
        response = _call_eligibility(_user("teacher"), student_id="42")

    assert response.status_code == 200
    assert response.data["student_id"] == 42
    assert response.data["is_new_student"] is True


@patch("enrollments.views.Enrollment.objects.filter")
def test_registrar_is_unscoped(mock_enrollment_filter):
    """registrar isn't teacher or guardian, so neither guard applies --
    matches this action's behavior before the teacher scoping was added."""
    mock_enrollment_filter.return_value.order_by.return_value = []
    with patch("requirements.models.RequirementType.objects.filter", return_value=[]), \
         patch("requirements.models.StudentRequirementSubmission.objects.filter") as mock_submissions:
        mock_submissions.return_value.values_list.return_value = []
        response = _call_eligibility(_user("registrar"), student_id="999")

    assert response.status_code == 200
