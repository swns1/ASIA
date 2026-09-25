"""
Regression tests for the admin/super_admin rank (QA audit finding).

`is_audit_admin()` treats "admin" and "super_admin" identically, which is the
right answer for "may read the audit trail" and the wrong one for "may edit
this account". Before these rules there was no rank at all, and a plain admin
could take the system over in one request each:

  - PATCH another user's password without knowing it (the current-password
    check only applies to a self-edit), including the super_admin's -- then
    simply log in as them;
  - PATCH their own role to super_admin;
  - DELETE the super_admin outright.

Each of those is now refused. The self-role-change rule also protects against
the duller version of the same mistake: an admin demoting themselves and
locking the last administrator out.

Mocks resolve_user_from_request() and _get_target() rather than hitting a real
database, matching the convention in test_user_detail_patch.py / test_roles.py.
"""
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.hashers import make_password
from rest_framework.test import APIClient


def _user(**overrides):
    defaults = dict(
        user_id=1,
        name="Admin User",
        email="admin@example.com",
        role="admin",
        password=make_password("original-password-123"),
        current_session_id=uuid.uuid4(),
        save=MagicMock(),
        delete=MagicMock(),
    )
    defaults.update(overrides)
    # What DRF's throttles read off request.user, which HasRole now sets.
    defaults.setdefault("is_authenticated", True)
    defaults.setdefault("pk", defaults["user_id"])
    return SimpleNamespace(**defaults)


def _super(**overrides):
    defaults = dict(
        user_id=2,
        name="Owner",
        email="owner@example.com",
        role="super_admin",
    )
    defaults.update(overrides)
    return _user(**defaults)


# ── An admin may not reach a super_admin account ─────────────────────────────

@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.UserDetailView._get_target")
def test_admin_cannot_reset_a_super_admins_password(mock_get_target, mock_resolve):
    """The takeover path: set the password, then log in as them."""
    mock_resolve.return_value = _user()          # requester: plain admin
    target = _super()
    mock_get_target.return_value = target

    response = APIClient().patch(
        "/api/auth/users/2/",
        {"new_password": "a-perfectly-valid-password-42"},
        format="json",
    )

    assert response.status_code == 403
    target.save.assert_not_called()


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.UserDetailView._get_target")
def test_admin_cannot_demote_a_super_admin(mock_get_target, mock_resolve):
    mock_resolve.return_value = _user()
    target = _super()
    mock_get_target.return_value = target

    response = APIClient().patch(
        "/api/auth/users/2/", {"role": "teacher"}, format="json"
    )

    assert response.status_code == 403
    target.save.assert_not_called()


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.UserDetailView._get_target")
def test_admin_cannot_delete_a_super_admin(mock_get_target, mock_resolve):
    mock_resolve.return_value = _user()
    target = _super()
    mock_get_target.return_value = target

    response = APIClient().delete("/api/auth/users/2/")

    assert response.status_code == 403
    target.delete.assert_not_called()


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.UserDetailView._get_target")
def test_super_admin_may_still_edit_another_super_admin(mock_get_target, mock_resolve):
    """The rank restricts admins, not super_admins -- otherwise the role
    becomes unadministrable."""
    mock_resolve.return_value = _super(user_id=9, email="owner2@example.com")
    target = _super()
    mock_get_target.return_value = target

    response = APIClient().patch(
        "/api/auth/users/2/", {"name": "Renamed Owner"}, format="json"
    )

    assert response.status_code == 200
    target.save.assert_called_once()


# ── Nobody grants themselves a promotion ─────────────────────────────────────

@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.UserDetailView._get_target")
def test_admin_cannot_promote_self_to_super_admin(mock_get_target, mock_resolve):
    requester = _user(user_id=1)
    mock_resolve.return_value = requester
    mock_get_target.return_value = requester     # editing their own record

    response = APIClient().patch(
        "/api/auth/users/1/", {"role": "super_admin"}, format="json"
    )

    assert response.status_code == 403
    assert requester.role == "admin"


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.UserDetailView._get_target")
def test_admin_cannot_change_own_role_at_all(mock_get_target, mock_resolve):
    """Not just upward: a self-demotion is how the last admin locks everyone
    out of user management."""
    requester = _user(user_id=1)
    mock_resolve.return_value = requester
    mock_get_target.return_value = requester

    response = APIClient().patch(
        "/api/auth/users/1/", {"role": "teacher"}, format="json"
    )

    assert response.status_code == 403
    assert requester.role == "admin"


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.UserDetailView._get_target")
def test_admin_may_still_change_another_users_role(mock_get_target, mock_resolve):
    """The ordinary case has to keep working."""
    mock_resolve.return_value = _user()
    target = _user(user_id=3, email="teacher@example.com", role="teacher")
    mock_get_target.return_value = target

    response = APIClient().patch(
        "/api/auth/users/3/", {"role": "registrar"}, format="json"
    )

    assert response.status_code == 200
    assert target.role == "registrar"
    # A role change must still kill the session (see test_user_detail_patch).
    assert target.current_session_id is None


# ── Creating a super_admin is a super_admin's decision ───────────────────────

@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
def test_admin_cannot_create_a_super_admin(mock_resolve):
    """Otherwise the rank above is sidestepped by minting a fresh super_admin
    and logging into it."""
    mock_resolve.return_value = _user()

    response = APIClient().post(
        "/api/auth/users/",
        {
            "name": "New Owner",
            "email": "new-owner@example.com",
            "role": "super_admin",
            "password": "a-perfectly-valid-password-42",
        },
        format="json",
    )

    assert response.status_code == 403
