"""
Tests for deactivating/reactivating an account (users.is_active) -- how
someone who has left is retired without deleting them, so their past
records keep a name.

Same conventions as test_user_detail_patch.py: resolve_user_from_request()
and UserDetailView._get_target() are mocked rather than hitting the
unmanaged `users` table, which the test database doesn't have.
"""
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from accounts.audit import resolve_user_from_request


@pytest.fixture(autouse=True)
def _reset_throttles():
    # DRF's anon throttle (30/minute) counts in this service's file-based
    # cache, which outlives a single test and even a single pytest run -- see
    # the same fixture in test_login.py.
    cache.clear()


def _requester(**overrides):
    defaults = dict(user_id=1, name="Admin User", email="admin@example.com", role="admin")
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _target(**overrides):
    defaults = dict(
        user_id=2, name="Teacher User", email="teacher@example.com", role="teacher",
        profile_picture=None, is_active=True, current_session_id=uuid.uuid4(), save=MagicMock(),
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _patch_status(requester, target, is_active, user_id=2):
    with patch("accounts.permissions.resolve_user_from_request", return_value=requester), \
         patch("accounts.views.UserDetailView._get_target", return_value=target), \
         patch("accounts.views.record_audit_event") as audit:
        response = APIClient().patch(
            f"/api/auth/users/{user_id}/", {"is_active": is_active}, format="json",
        )
    return response, audit


# -- PATCH is_active ------------------------------------------------------------

@pytest.mark.django_db
def test_deactivating_signs_them_out_everywhere_and_is_audited():
    target = _target()
    response, audit = _patch_status(_requester(), target, False)

    assert response.status_code == 200
    assert response.data["is_active"] is False
    assert target.is_active is False
    # Clearing the session is what stops their live tokens in every service.
    assert target.current_session_id is None
    target.save.assert_called_once()
    assert audit.call_args.kwargs["action"] == "Deactivated user account"


@pytest.mark.django_db
def test_reactivating_keeps_them_active_without_touching_the_session():
    session_id = uuid.uuid4()
    target = _target(is_active=False, current_session_id=session_id)
    response, audit = _patch_status(_requester(), target, True)

    assert response.status_code == 200
    assert target.is_active is True
    assert target.current_session_id == session_id
    assert audit.call_args.kwargs["action"] == "Reactivated user account"


@pytest.mark.django_db
def test_sending_the_current_status_changes_nothing():
    target = _target()
    response, audit = _patch_status(_requester(), target, True)

    assert response.status_code == 200
    target.save.assert_not_called()
    audit.assert_not_called()


@pytest.mark.django_db
@pytest.mark.parametrize("role", ["registrar", "teacher", "accounting", "guardian"])
def test_only_admins_can_change_account_status(role):
    target = _target(user_id=5)
    response, _ = _patch_status(_requester(user_id=5, role=role), target, False, user_id=5)

    assert response.status_code == 403
    assert target.is_active is True
    target.save.assert_not_called()


@pytest.mark.django_db
def test_an_admin_cannot_deactivate_themselves():
    target = _target(user_id=1, role="admin")
    response, _ = _patch_status(_requester(), target, False, user_id=1)

    assert response.status_code == 403
    assert target.is_active is True
    target.save.assert_not_called()


@pytest.mark.django_db
def test_a_plain_admin_cannot_deactivate_a_super_admin():
    target = _target(role="super_admin")
    response, _ = _patch_status(_requester(), target, False)

    assert response.status_code == 403
    assert target.is_active is True


@pytest.mark.django_db
def test_a_super_admin_can_deactivate_a_super_admin():
    target = _target(role="super_admin")
    response, _ = _patch_status(_requester(role="super_admin"), target, False)

    assert response.status_code == 200
    assert target.is_active is False


@pytest.mark.django_db
@pytest.mark.parametrize("value", ["false", 0, None])
def test_status_must_be_a_real_boolean(value):
    target = _target()
    response, _ = _patch_status(_requester(), target, value)

    assert response.status_code == 400
    assert target.is_active is True
    target.save.assert_not_called()


# -- an inactive account's tokens stop working --------------------------------

def _access_request(user_id, session_id):
    token = AccessToken()
    token["user_id"] = user_id
    token["sid"] = str(session_id)
    return SimpleNamespace(META={"HTTP_AUTHORIZATION": f"Bearer {token}"})


@pytest.mark.parametrize("is_active, resolved", [(True, True), (False, False)])
def test_an_access_token_resolves_only_for_an_active_account(is_active, resolved):
    session_id = uuid.uuid4()
    user = _target(is_active=is_active, current_session_id=session_id)
    with patch("accounts.audit.User.objects.filter") as users:
        users.return_value.first.return_value = user
        result = resolve_user_from_request(_access_request(2, session_id))

    assert (result is user) is resolved


def test_a_refresh_token_is_refused_for_an_inactive_account():
    session_id = uuid.uuid4()
    refresh = RefreshToken()
    refresh["user_id"] = 2
    refresh["sid"] = str(session_id)
    client = APIClient()
    client.cookies["refresh"] = str(refresh)

    with patch("accounts.views.User.objects.filter") as users:
        users.return_value.first.return_value = _target(is_active=False, current_session_id=session_id)
        response = client.post("/api/auth/refresh/")

    assert response.status_code == 401
    assert "access" not in response.data
