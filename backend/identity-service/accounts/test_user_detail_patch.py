"""
Tests for UserDetailView.patch -- previously entirely untested (audit
finding). Covers two things added in this phase:

1. validate_password() is now enforced on both create (UserListView.post,
   see test_roles.py) and change here, instead of only a bare len() >= 8
   check that accepted anything, including "xxxxxxxx".
2. A role or password change clears the target's current_session_id, which
   every service checks against the token's sid claim (see
   accounts.audit.resolve_user_from_request and
   shared.authentication.SingleSessionJWTAuthentication) -- so this signs
   the user out everywhere, not just here, immediately rather than waiting
   up to ACCESS_TOKEN_LIFETIME for a captured/compromised session to expire
   on its own.

resolve_user_from_request() and UserDetailView._get_target() are mocked
rather than exercised against a real database, same convention as
test_roles.py / test_login.py.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.hashers import check_password, make_password
from rest_framework.test import APIClient


def _admin_user(**overrides):
    defaults = dict(user_id=1, name="Admin User", email="admin@example.com", role="admin")
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _target_user(**overrides):
    import uuid

    defaults = dict(
        user_id=2,
        name="Teacher User",
        email="teacher@example.com",
        role="teacher",
        password=make_password("original-password-123"),
        current_session_id=uuid.uuid4(),
        save=MagicMock(),
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.UserDetailView._get_target")
def test_weak_password_is_rejected(mock_get_target, mock_resolve):
    mock_resolve.return_value = _admin_user()
    target = _target_user()
    mock_get_target.return_value = target

    response = APIClient().patch(
        "/api/auth/users/2/",
        {"new_password": "xxxxxxxx"},  # 8 chars -- would have passed the old len() check
        format="json",
    )

    assert response.status_code == 400
    target.save.assert_not_called()


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.UserDetailView._get_target")
def test_role_change_clears_current_session_id(mock_get_target, mock_resolve):
    mock_resolve.return_value = _admin_user()
    target = _target_user()
    mock_get_target.return_value = target

    response = APIClient().patch("/api/auth/users/2/", {"role": "registrar"}, format="json")

    assert response.status_code == 200
    assert target.current_session_id is None
    target.save.assert_called_once()


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.UserDetailView._get_target")
def test_admin_password_reset_clears_current_session_id(mock_get_target, mock_resolve):
    """The scenario the fix targets: an admin resets a compromised
    account's password, and the attacker's existing session must not
    survive that reset."""
    mock_resolve.return_value = _admin_user()
    target = _target_user()
    mock_get_target.return_value = target

    response = APIClient().patch(
        "/api/auth/users/2/",
        {"new_password": "Xk9-mQ2vLp-teststrong"},
        format="json",
    )

    assert response.status_code == 200
    assert target.current_session_id is None
    assert check_password("Xk9-mQ2vLp-teststrong", target.password)


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.UserDetailView._get_target")
def test_name_only_change_does_not_clear_current_session_id(mock_get_target, mock_resolve):
    """Negative case: an edit that touches neither role nor password must
    not sign the user out -- otherwise every profile tweak would force a
    re-login."""
    mock_resolve.return_value = _admin_user()
    target = _target_user()
    original_session_id = target.current_session_id
    mock_get_target.return_value = target

    response = APIClient().patch("/api/auth/users/2/", {"name": "New Name"}, format="json")

    assert response.status_code == 200
    assert target.current_session_id == original_session_id


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.UserDetailView._get_target")
def test_self_password_change_clears_own_current_session_id(mock_get_target, mock_resolve):
    """Self-service password change also signs the user out of every
    active session (including the one making this request) -- standard
    practice, and consistent with the admin-reset case above rather than a
    special exemption for editing your own account."""
    user = _target_user(user_id=1, email="me@example.com")
    mock_resolve.return_value = user
    mock_get_target.return_value = user

    response = APIClient().patch(
        "/api/auth/users/1/",
        {"current_password": "original-password-123", "new_password": "Xk9-mQ2vLp-teststrong"},
        format="json",
    )

    assert response.status_code == 200
    assert user.current_session_id is None
