"""
Unit tests for accounts.permissions.HasRole -- identity-service's own
implementation, independent of shared/permissions.py (see that class's
docstring for why: no AUTH_USER_MODEL here, so every view resolves the
caller by hand via resolve_user_from_request() rather than request.user).

resolve_user_from_request() is mocked rather than exercised for real: it
decodes a JWT and queries accounts.User (managed=False, no table in a fresh
pytest-django test database), same technique the other three services'
accounts/test_permissions.py use for their own HasRole/related tests.
"""
from types import SimpleNamespace
from unittest.mock import patch

from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.test import APIRequestFactory

import pytest

from accounts.permissions import HasRole

factory = APIRequestFactory()


def _user(role):
    return SimpleNamespace(role=role, user_id=1)


class TestHasRole:
    def test_unauthenticated_raises_not_authenticated(self):
        request = factory.get("/")
        view = SimpleNamespace()
        with patch("accounts.permissions.resolve_user_from_request", return_value=None):
            with pytest.raises(NotAuthenticated):
                HasRole().has_permission(request, view)

    def test_role_in_required_set_allowed(self):
        request = factory.get("/")
        view = SimpleNamespace(required_roles={"super_admin", "admin"})
        with patch("accounts.permissions.resolve_user_from_request", return_value=_user("admin")):
            assert HasRole().has_permission(request, view) is True

    def test_role_outside_required_set_raises_permission_denied(self):
        request = factory.get("/")
        view = SimpleNamespace(required_roles={"super_admin", "admin"})
        with patch("accounts.permissions.resolve_user_from_request", return_value=_user("teacher")):
            with pytest.raises(PermissionDenied):
                HasRole().has_permission(request, view)

    def test_no_required_roles_configured_denies_by_default(self):
        """
        Fails closed: a view that forgets required_roles used to be
        readable by any authenticated user, since this class is
        DEFAULT_PERMISSION_CLASSES for the whole service. UserListView's
        required_roles = ADMIN_ROLES | {"registrar"} is what actually gates
        it now, not omission-means-open.
        """
        request = factory.get("/")
        view = SimpleNamespace()
        with patch("accounts.permissions.resolve_user_from_request", return_value=_user("teacher")):
            with pytest.raises(PermissionDenied):
                HasRole().has_permission(request, view)

    def test_allow_any_authenticated_role_opts_back_in_explicitly(self):
        """
        LogoutView and UserDetailView are the two real views that need
        "any authenticated user" -- logging out isn't role-gated, and a
        profile endpoint enforces ownership-or-admin in-method, not by
        role. Both set this flag explicitly rather than relying on
        omission (see views.py).
        """
        request = factory.get("/")
        view = SimpleNamespace(ALLOW_ANY_AUTHENTICATED_ROLE=True)
        with patch("accounts.permissions.resolve_user_from_request", return_value=_user("teacher")):
            assert HasRole().has_permission(request, view) is True

    def test_resolved_user_is_stashed_on_the_request(self):
        """Views read request.resolved_user instead of request.user (see
        the class docstring) -- this is what makes that available."""
        request = factory.get("/")
        view = SimpleNamespace(ALLOW_ANY_AUTHENTICATED_ROLE=True)
        user = _user("teacher")
        with patch("accounts.permissions.resolve_user_from_request", return_value=user):
            HasRole().has_permission(request, view)
        assert request.resolved_user is user
