"""
Unit tests for billing-service's RBAC permission classes. Requests are built
via APIRequestFactory with a SimpleNamespace as request.user rather than a
real accounts.User (managed=False, no table in a fresh pytest-django DB) —
same technique used by identity-service's test_login.py.
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
        request.user = _user("accounting")
        assert self.perm.has_permission(request, None) is True

    def test_registrar_can_write(self):
        request = factory.post("/")
        request.user = _user("registrar")
        assert self.perm.has_permission(request, None) is True

    def test_accounting_cannot_write(self):
        request = factory.post("/")
        request.user = _user("accounting")
        assert self.perm.has_permission(request, None) is False


class TestHasRole:
    BILLING_ROLES = {"super_admin", "admin", "accounting"}

    def test_registrar_denied_billing_access(self):
        request = factory.get("/")
        request.user = _user("registrar")
        view = SimpleNamespace(required_roles=self.BILLING_ROLES)
        assert HasRole().has_permission(request, view) is False

    def test_teacher_denied_billing_access(self):
        request = factory.get("/")
        request.user = _user("teacher")
        view = SimpleNamespace(required_roles=self.BILLING_ROLES)
        assert HasRole().has_permission(request, view) is False

    def test_accounting_allowed_billing_access(self):
        request = factory.post("/")
        request.user = _user("accounting")
        view = SimpleNamespace(required_roles=self.BILLING_ROLES)
        assert HasRole().has_permission(request, view) is True

    def test_super_admin_allowed_billing_access(self):
        request = factory.get("/")
        request.user = _user("super_admin")
        view = SimpleNamespace(required_roles=self.BILLING_ROLES)
        assert HasRole().has_permission(request, view) is True
