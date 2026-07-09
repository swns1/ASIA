"""
Unit tests for the RBAC permission classes. These build bare requests via
APIRequestFactory and attach a SimpleNamespace as request.user instead of a
real accounts.User (managed=False, no table in a fresh pytest-django DB) —
same technique used by identity-service's test_login.py.

teacher_student_ids() does a local `from enrollments.models import ...`
import and then queries Enrollment (managed=False), so its DB calls are
mocked at the source module (enrollments.models) rather than exercised
against a real database.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from rest_framework.test import APIRequestFactory

from accounts.permissions import (
    GRADE_READ_ROLES,
    HasRole,
    IsAdminRegistrarOrReadOnly,
    IsAdvisoryTeacherOrStaff,
    STAFF_FULL_WRITE_ROLES,
    teacher_student_ids,
)

factory = APIRequestFactory()


def _user(role, user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


def _anon():
    return SimpleNamespace(is_authenticated=False)


class TestIsAdminRegistrarOrReadOnly:
    perm = IsAdminRegistrarOrReadOnly()

    def test_unauthenticated_denied(self):
        request = factory.get("/")
        request.user = _anon()
        assert self.perm.has_permission(request, None) is False

    def test_any_authenticated_role_can_read(self):
        request = factory.get("/")
        request.user = _user("teacher")
        assert self.perm.has_permission(request, None) is True

    def test_registrar_can_write(self):
        request = factory.post("/")
        request.user = _user("registrar")
        assert self.perm.has_permission(request, None) is True

    def test_teacher_cannot_write(self):
        request = factory.post("/")
        request.user = _user("teacher")
        assert self.perm.has_permission(request, None) is False

    def test_accounting_cannot_write(self):
        request = factory.post("/")
        request.user = _user("accounting")
        assert self.perm.has_permission(request, None) is False


class TestHasRole:
    def test_denies_role_outside_required_set(self):
        request = factory.get("/")
        request.user = _user("accounting")
        view = SimpleNamespace(required_roles={"super_admin", "admin"})
        assert HasRole().has_permission(request, view) is False

    def test_allows_role_in_required_set(self):
        request = factory.get("/")
        request.user = _user("admin")
        view = SimpleNamespace(required_roles={"super_admin", "admin"})
        assert HasRole().has_permission(request, view) is True

    def test_no_required_roles_configured_allows_any_authenticated(self):
        request = factory.get("/")
        request.user = _user("teacher")
        view = SimpleNamespace()
        assert HasRole().has_permission(request, view) is True

    def test_unauthenticated_denied_even_without_required_roles(self):
        request = factory.get("/")
        request.user = _anon()
        view = SimpleNamespace()
        assert HasRole().has_permission(request, view) is False


class TestTeacherStudentIds:
    def test_returns_empty_set_for_user_without_user_id(self):
        assert teacher_student_ids(SimpleNamespace()) == set()

    @patch("enrollments.models.Enrollment")
    @patch("enrollments.models.SectionAdvisory")
    def test_returns_empty_set_when_no_advisory_assignment(self, mock_advisory, mock_enrollment):
        mock_advisory.objects.filter.return_value = []
        result = teacher_student_ids(_user("teacher", user_id=42))
        assert result == set()
        mock_advisory.objects.filter.assert_called_once_with(teacher_user_id=42)
        mock_enrollment.objects.filter.assert_not_called()

    @patch("enrollments.models.Enrollment")
    @patch("enrollments.models.SectionAdvisory")
    def test_resolves_student_ids_from_advisory_assignment(self, mock_advisory, mock_enrollment):
        advisory = SimpleNamespace(
            school_year="2025-2026", school_level="junior_highschool",
            grade_level="Grade 7", section="Rizal", strand=None,
        )
        mock_advisory.objects.filter.return_value = [advisory]
        mock_qs = MagicMock()
        mock_qs.values_list.return_value = [10, 11, 12]
        mock_enrollment.objects.filter.return_value = mock_qs

        result = teacher_student_ids(_user("teacher", user_id=7))

        assert result == {10, 11, 12}
        mock_enrollment.objects.filter.assert_called_once_with(
            school_year="2025-2026", school_level="junior_highschool",
            grade_level="Grade 7", section="Rizal",
        )
        mock_qs.filter.assert_not_called()  # no strand set, shouldn't narrow further

    @patch("enrollments.models.Enrollment")
    @patch("enrollments.models.SectionAdvisory")
    def test_applies_strand_filter_when_set(self, mock_advisory, mock_enrollment):
        advisory = SimpleNamespace(
            school_year="2025-2026", school_level="senior_highschool",
            grade_level="Grade 11", section="STEM-A", strand="STEM",
        )
        mock_advisory.objects.filter.return_value = [advisory]
        mock_qs = MagicMock()
        mock_qs.filter.return_value.values_list.return_value = [1]
        mock_enrollment.objects.filter.return_value = mock_qs

        result = teacher_student_ids(_user("teacher", user_id=9))

        assert result == {1}
        mock_qs.filter.assert_called_once_with(strand="STEM")


class TestIsAdvisoryTeacherOrStaff:
    perm = IsAdvisoryTeacherOrStaff()

    def test_accounting_denied_even_read(self):
        request = factory.get("/")
        request.user = _user("accounting")
        assert self.perm.has_permission(request, None) is False

    def test_registrar_can_read_but_not_write(self):
        get_request = factory.get("/")
        get_request.user = _user("registrar")
        assert self.perm.has_permission(get_request, None) is True

        post_request = factory.post("/")
        post_request.user = _user("registrar")
        assert self.perm.has_permission(post_request, None) is False

    def test_teacher_can_read_and_write(self):
        get_request = factory.get("/")
        get_request.user = _user("teacher")
        assert self.perm.has_permission(get_request, None) is True

        post_request = factory.post("/")
        post_request.user = _user("teacher")
        assert self.perm.has_permission(post_request, None) is True

    def test_admin_object_permission_always_allowed(self):
        request = factory.patch("/")
        request.user = _user("admin")
        obj = SimpleNamespace(enrollment=SimpleNamespace(student_id=99))
        assert self.perm.has_object_permission(request, None, obj) is True

    def test_registrar_object_permission_read_only(self):
        view = SimpleNamespace(owner_student_id_field="enrollment__student_id")
        obj = SimpleNamespace(enrollment=SimpleNamespace(student_id=99))

        get_request = factory.get("/")
        get_request.user = _user("registrar")
        assert self.perm.has_object_permission(get_request, view, obj) is True

        patch_request = factory.patch("/")
        patch_request.user = _user("registrar")
        assert self.perm.has_object_permission(patch_request, view, obj) is False

    @patch("enrollments.models.Enrollment")
    @patch("enrollments.models.SectionAdvisory")
    def test_teacher_denied_for_student_outside_advisory(self, mock_advisory, mock_enrollment):
        mock_advisory.objects.filter.return_value = []
        view = SimpleNamespace(owner_student_id_field="enrollment__student_id")
        obj = SimpleNamespace(enrollment=SimpleNamespace(student_id=99))

        request = factory.patch("/")
        request.user = _user("teacher", user_id=5)

        assert self.perm.has_object_permission(request, view, obj) is False

    @patch("enrollments.models.Enrollment")
    @patch("enrollments.models.SectionAdvisory")
    def test_teacher_allowed_for_student_inside_advisory(self, mock_advisory, mock_enrollment):
        advisory = SimpleNamespace(
            school_year="2025-2026", school_level="junior_highschool",
            grade_level="Grade 7", section="Rizal", strand=None,
        )
        mock_advisory.objects.filter.return_value = [advisory]
        mock_qs = MagicMock()
        mock_qs.values_list.return_value = [99]
        mock_enrollment.objects.filter.return_value = mock_qs

        view = SimpleNamespace(owner_student_id_field="enrollment__student_id")
        obj = SimpleNamespace(enrollment=SimpleNamespace(student_id=99))

        request = factory.patch("/")
        request.user = _user("teacher", user_id=5)

        assert self.perm.has_object_permission(request, view, obj) is True
