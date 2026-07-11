"""
Unit tests for billing-service's RBAC permission classes. Requests are built
via APIRequestFactory with a SimpleNamespace as request.user rather than a
real accounts.User (managed=False, no table in a fresh pytest-django DB) —
same technique used by identity-service's test_login.py.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from rest_framework.test import APIRequestFactory

from accounts.permissions import (
    HasRole,
    IsAdminRegistrarOrReadOnly,
    IsBillingStaffOrOwnerGuardianReadOnly,
    guardian_enrollment_ids,
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


def _mirror_returning(values):
    m = MagicMock()
    m.objects.filter.return_value.values_list.return_value = values
    return m


class TestIsBillingStaffOrOwnerGuardianReadOnly:
    perm = IsBillingStaffOrOwnerGuardianReadOnly()

    def test_accounting_full_access(self):
        get_request = factory.get("/")
        get_request.user = _user("accounting")
        assert self.perm.has_permission(get_request, None) is True
        post_request = factory.post("/")
        post_request.user = _user("accounting")
        assert self.perm.has_permission(post_request, None) is True

    def test_registrar_denied(self):
        request = factory.get("/")
        request.user = _user("registrar")
        assert self.perm.has_permission(request, None) is False

    def test_guardian_read_allowed_write_denied(self):
        get_request = factory.get("/")
        get_request.user = _user("guardian")
        assert self.perm.has_permission(get_request, None) is True
        post_request = factory.post("/")
        post_request.user = _user("guardian")
        assert self.perm.has_permission(post_request, None) is False

    def test_guardian_invoice_scoped_to_own_child(self):
        # guardian is linked to student(s) whose enrollments are {100, 101};
        # an invoice for enrollment 200 must be denied, 100 allowed.
        view = SimpleNamespace(owner_enrollment_id_field="enrollment_id")
        own_invoice   = SimpleNamespace(enrollment_id=100)
        other_invoice = SimpleNamespace(enrollment_id=200)
        request = factory.get("/")
        request.user = _user("guardian", user_id=7)

        # guardian_enrollment_ids chains GuardianMirror -> student_ids ->
        # EnrollmentMirror -> enrollment_ids. Patch both mirrors.
        with patch("billing.guardian_mirror.GuardianMirror", _mirror_returning([10])), \
             patch("billing.enrollment_mirror.EnrollmentMirror", _mirror_returning([100, 101])):
            assert self.perm.has_object_permission(request, view, own_invoice) is True
        with patch("billing.guardian_mirror.GuardianMirror", _mirror_returning([10])), \
             patch("billing.enrollment_mirror.EnrollmentMirror", _mirror_returning([100, 101])):
            assert self.perm.has_object_permission(request, view, other_invoice) is False

    def test_installment_owner_path_resolves_through_invoice(self):
        view = SimpleNamespace(owner_enrollment_id_field="invoice__enrollment_id")
        installment = SimpleNamespace(invoice=SimpleNamespace(enrollment_id=100))
        request = factory.get("/")
        request.user = _user("guardian", user_id=7)

        with patch("billing.guardian_mirror.GuardianMirror", _mirror_returning([10])), \
             patch("billing.enrollment_mirror.EnrollmentMirror", _mirror_returning([100])):
            assert self.perm.has_object_permission(request, view, installment) is True

    def test_unlinked_guardian_sees_nothing(self):
        view = SimpleNamespace(owner_enrollment_id_field="enrollment_id")
        invoice = SimpleNamespace(enrollment_id=100)
        request = factory.get("/")
        request.user = _user("guardian", user_id=999)

        with patch("billing.guardian_mirror.GuardianMirror", _mirror_returning([])):
            assert self.perm.has_object_permission(request, view, invoice) is False

    def test_staff_object_permission_unaffected(self):
        request = factory.get("/")
        request.user = _user("accounting")
        assert self.perm.has_object_permission(request, SimpleNamespace(), SimpleNamespace(enrollment_id=200)) is True


class TestGuardianEnrollmentIds:
    def test_empty_when_no_linked_students(self):
        with patch("billing.guardian_mirror.GuardianMirror", _mirror_returning([])):
            assert guardian_enrollment_ids(_user("guardian", user_id=7)) == set()
