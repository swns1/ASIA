"""
Tests for the role-based queryset/serializer scoping added to
students/views.py. Before this, IsAdminRegistrarOrReadOnly let any
authenticated non-guardian role (teacher, accounting) read the full,
unscoped student roster -- every student's LRN, birth date, home address,
religion, and 4Ps welfare status, plus every guardian's contact details and
every scanned document's image_url. This scopes:

  - teacher: to students in their own section advisory roster
    (accounts.permissions.teacher_student_ids), matching how
    enrollment-service already scopes grades/attendance/dashboard.
  - accounting: denied entirely on guardian/sibling/previous-school/
    document-submission data (not billing-relevant); kept on students
    (via a reduced serializer, StudentBillingSummarySerializer) and
    households (is_4ps_beneficiary etc. genuinely affects fee discounts).
  - super_admin/admin/registrar: unfiltered, unchanged.

_scope_to_teacher_roster is tested directly (DB-free, mocked querysets --
same technique as enrollment-service/grades/test_views.py's
_scope_to_student_records tests), plus one get_queryset()/
get_serializer_class() integration test per viewset for the wiring,
assigning a MagicMock directly to view.queryset (DRF's GenericAPIView.
get_queryset() returns self.queryset as-is when it isn't a real QuerySet
instance, so this exercises the exact call chain without a database).
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.db.models import Q
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from students.views import (
    GuardianViewSet,
    HouseholdViewSet,
    PreviousSchoolViewSet,
    SiblingViewSet,
    StudentRequirementSubmissionViewSet,
    StudentSiblingViewSet,
    StudentViewSet,
    _scope_to_teacher_roster,
)
from students.serializers import StudentBillingSummarySerializer, StudentSerializer

factory = APIRequestFactory()


def _user(role, user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


def _view(cls, user, query_params=""):
    view = cls()
    django_request = factory.get(f"/?{query_params}")
    request = Request(django_request)
    request.user = user
    view.request = request
    view.format_kwarg = None
    view.queryset = MagicMock()
    return view


class TestScopeToTeacherRoster:
    def test_teacher_filtered_to_their_roster(self):
        qs = MagicMock()
        qs.filter.return_value = "filtered"
        with patch("students.views.teacher_student_ids", return_value={1, 2, 3}):
            result = _scope_to_teacher_roster(qs, _user("teacher"))
        qs.filter.assert_called_once_with(student_id__in={1, 2, 3})
        assert result == "filtered"

    def test_teacher_filtered_on_a_custom_field(self):
        qs = MagicMock()
        qs.filter.return_value = "filtered"
        with patch("students.views.teacher_student_ids", return_value={7}):
            result = _scope_to_teacher_roster(qs, _user("teacher"), field="student__student_id__in")
        qs.filter.assert_called_once_with(student__student_id__in={7})
        assert result == "filtered"

    def test_accounting_denied_by_default(self):
        qs = MagicMock()
        qs.none.return_value = "empty"
        result = _scope_to_teacher_roster(qs, _user("accounting"))
        qs.none.assert_called_once()
        assert result == "empty"

    def test_accounting_not_denied_when_opted_out(self):
        qs = MagicMock()
        result = _scope_to_teacher_roster(qs, _user("accounting"), deny_accounting=False)
        qs.none.assert_not_called()
        assert result is qs

    def test_registrar_unfiltered(self):
        qs = MagicMock()
        result = _scope_to_teacher_roster(qs, _user("registrar"))
        qs.filter.assert_not_called()
        qs.none.assert_not_called()
        assert result is qs


class TestStudentViewSet:
    def test_accounting_gets_the_reduced_serializer(self):
        view = _view(StudentViewSet, _user("accounting"))
        assert view.get_serializer_class() is StudentBillingSummarySerializer

    def test_teacher_gets_the_full_serializer(self):
        view = _view(StudentViewSet, _user("teacher"))
        assert view.get_serializer_class() is StudentSerializer

    def test_accounting_queryset_is_not_filtered(self):
        view = _view(StudentViewSet, _user("accounting"))
        result = view.get_queryset()
        view.queryset.none.assert_not_called()
        assert result is view.queryset

    def test_teacher_queryset_filtered_to_roster(self):
        view = _view(StudentViewSet, _user("teacher"))
        view.queryset.filter.return_value = view.queryset
        with patch("students.views.teacher_student_ids", return_value={5, 6}):
            view.get_queryset()
        view.queryset.filter.assert_any_call(student_id__in={5, 6})


class TestHouseholdViewSet:
    def test_teacher_filtered_via_reverse_relation(self):
        view = _view(HouseholdViewSet, _user("teacher"))
        view.queryset.filter.return_value = view.queryset
        with patch("students.views.teacher_student_ids", return_value={9}):
            view.get_queryset()
        view.queryset.filter.assert_any_call(student__student_id__in={9})

    def test_accounting_not_denied(self):
        view = _view(HouseholdViewSet, _user("accounting"))
        view.get_queryset()
        view.queryset.none.assert_not_called()


class TestGuardianViewSet:
    def test_accounting_denied(self):
        view = _view(GuardianViewSet, _user("accounting"))
        view.queryset.none.return_value = "empty"
        result = view.get_queryset()
        assert result == "empty"


class TestSiblingViewSet:
    def test_accounting_denied(self):
        view = _view(SiblingViewSet, _user("accounting"))
        view.queryset.none.return_value = "empty"
        assert view.get_queryset() == "empty"


class TestPreviousSchoolViewSet:
    def test_accounting_denied(self):
        view = _view(PreviousSchoolViewSet, _user("accounting"))
        view.queryset.none.return_value = "empty"
        assert view.get_queryset() == "empty"


class TestStudentRequirementSubmissionViewSet:
    def test_accounting_denied(self):
        view = _view(StudentRequirementSubmissionViewSet, _user("accounting"))
        view.queryset.none.return_value = "empty"
        assert view.get_queryset() == "empty"

    def test_teacher_filtered_to_roster(self):
        view = _view(StudentRequirementSubmissionViewSet, _user("teacher"))
        view.queryset.filter.return_value = view.queryset
        with patch("students.views.teacher_student_ids", return_value={4}):
            view.get_queryset()
        view.queryset.filter.assert_any_call(student_id__in={4})


class TestStudentSiblingViewSet:
    def test_teacher_sees_either_side_of_the_relationship(self):
        view = _view(StudentSiblingViewSet, _user("teacher"))
        with patch("students.views.teacher_student_ids", return_value={1, 2}):
            view.get_queryset()
        view.queryset.filter.assert_called_once_with(
            Q(student_id__in={1, 2}) | Q(sibling_student_id__in={1, 2})
        )

    def test_accounting_denied(self):
        view = _view(StudentSiblingViewSet, _user("accounting"))
        view.queryset.none.return_value = "empty"
        assert view.get_queryset() == "empty"

    def test_registrar_unfiltered(self):
        view = _view(StudentSiblingViewSet, _user("registrar"))
        result = view.get_queryset()
        view.queryset.filter.assert_not_called()
        view.queryset.none.assert_not_called()
        assert result is view.queryset
