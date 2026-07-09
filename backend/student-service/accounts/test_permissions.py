"""
Unit tests for student-service's new RBAC permission classes. This service
had NO role concept at all before this change (StatelessJWTAuthentication
never touched the DB), so these tests exist mainly to prove the newly added
accounts app behaves identically to the same classes in enrollment-service
and billing-service.
"""
from types import SimpleNamespace

from rest_framework.test import APIRequestFactory

from accounts.permissions import HasRole, IsAdminRegistrarOrReadOnly

factory = APIRequestFactory()


def _user(role):
    return SimpleNamespace(role=role, is_authenticated=True)


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

    def test_admin_can_write(self):
        request = factory.post("/")
        request.user = _user("admin")
        assert self.perm.has_permission(request, None) is True

    def test_teacher_cannot_write_student_records(self):
        request = factory.post("/")
        request.user = _user("teacher")
        assert self.perm.has_permission(request, None) is False


class TestHasRole:
    def test_ocr_scan_denied_for_teacher(self):
        request = factory.post("/")
        request.user = _user("teacher")
        view = SimpleNamespace(required_roles={"super_admin", "admin", "registrar"})
        assert HasRole().has_permission(request, view) is False

    def test_ocr_scan_allowed_for_registrar(self):
        request = factory.post("/")
        request.user = _user("registrar")
        view = SimpleNamespace(required_roles={"super_admin", "admin", "registrar"})
        assert HasRole().has_permission(request, view) is True
