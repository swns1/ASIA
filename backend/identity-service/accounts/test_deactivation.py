"""
Deactivating an account instead of deleting it.

Deleting a user left every id that pointed at them dangling -- `users` has no
foreign keys -- so a departed teacher's section advisories named nobody. A
deactivated account stays, so the id still resolves to a name, but it can't
sign in and any open session ends at once (every service checks the session
id on each request, so clearing it is enough).

User is managed=False (no table in the test database), so lookups are
mocked, matching the rest of this service's tests.
"""
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.hashers import make_password
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from accounts.audit import resolve_user_from_request

PASSWORD = "correct-horse-battery-staple"


def _admin(**overrides):
    defaults = dict(user_id=1, pk=1, name="Admin User", email="admin@example.com",
                    role="admin", is_authenticated=True, is_active=True)
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _teacher(**overrides):
    defaults = dict(
        user_id=2, pk=2, name="Teacher User", email="teacher@example.com", role="teacher",
        password=make_password(PASSWORD), current_session_id=uuid.uuid4(),
        profile_picture=None, is_active=True, save=MagicMock(),
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _patch(requester, target, body):
    with patch("accounts.permissions.resolve_user_from_request", return_value=requester), \
         patch("accounts.views.UserDetailView._get_target", return_value=target):
        return APIClient().patch(f"/api/auth/users/{target.user_id}/", body, format="json")


# ── who may deactivate whom ──────────────────────────────────────────────────

@pytest.mark.django_db
def test_an_admin_deactivates_a_teacher_and_their_session_ends():
    target = _teacher()
    response = _patch(_admin(), target, {"is_active": False})

    assert response.status_code == 200
    assert target.is_active is False
    assert target.current_session_id is None
    target.save.assert_called_once()


@pytest.mark.django_db
def test_reactivating_restores_sign_in_without_touching_the_session():
    session = uuid.uuid4()
    target = _teacher(is_active=False, current_session_id=session)
    response = _patch(_admin(), target, {"is_active": True})

    assert response.status_code == 200
    assert target.is_active is True
    assert target.current_session_id == session


@pytest.mark.django_db
def test_nobody_deactivates_their_own_account():
    me = _teacher(user_id=1, pk=1, role="admin")
    response = _patch(_admin(), me, {"is_active": False})

    assert response.status_code == 403
    me.save.assert_not_called()


@pytest.mark.django_db
def test_a_plain_admin_cannot_deactivate_a_super_admin():
    target = _teacher(role="super_admin")
    response = _patch(_admin(), target, {"is_active": False})

    assert response.status_code == 403
    assert target.is_active is True


@pytest.mark.django_db
def test_a_non_admin_cannot_deactivate_anyone():
    target = _teacher(user_id=5, pk=5)
    response = _patch(_admin(role="registrar"), target, {"is_active": False})

    assert response.status_code == 403


@pytest.mark.django_db
def test_is_active_must_be_a_boolean():
    target = _teacher()
    response = _patch(_admin(), target, {"is_active": "no"})

    assert response.status_code == 400
    assert target.is_active is True


# ── a deactivated account can't get in ──────────────────────────────────────

def _login_as(user, password):
    def fake_filter(**kwargs):
        result = MagicMock()
        email = kwargs.get("email__iexact")
        result.first.return_value = user if email and email.lower() == user.email.lower() else None
        result.__getitem__.return_value = []
        return result

    with patch("accounts.auth_backends.User.objects.filter", side_effect=fake_filter), \
         patch("accounts.views.stamp_session_id") as stamp:
        response = APIClient().post(
            "/api/auth/login/", {"identifier": user.email, "password": password}, format="json",
        )
    return response, stamp


@pytest.mark.django_db
def test_a_deactivated_account_is_told_so_after_the_right_password():
    response, stamp = _login_as(_teacher(is_active=False), PASSWORD)

    assert response.status_code == 400
    assert "deactivated" in response.data["detail"]
    stamp.assert_not_called()


@pytest.mark.django_db
def test_a_wrong_password_on_a_deactivated_account_reveals_nothing():
    response, _ = _login_as(_teacher(is_active=False), "not-the-password")

    assert response.status_code == 400
    assert response.data["detail"] == "Invalid identifier or password."


def test_an_old_access_token_of_a_deactivated_account_is_refused():
    session = uuid.uuid4()
    user = _teacher(is_active=False, current_session_id=session)
    token = AccessToken()
    token["user_id"] = user.user_id
    token["sid"] = str(session)
    request = APIRequestFactory().get("/", HTTP_AUTHORIZATION=f"Bearer {token}")

    with patch("accounts.audit.User.objects.filter") as mock_filter:
        mock_filter.return_value.first.return_value = user
        assert resolve_user_from_request(request) is None


@pytest.mark.django_db
def test_a_deactivated_account_cannot_refresh():
    session = uuid.uuid4()
    user = _teacher(is_active=False, current_session_id=session)
    refresh = RefreshToken()
    refresh["user_id"] = user.user_id
    refresh["sid"] = str(session)
    client = APIClient()
    client.cookies["refresh"] = str(refresh)

    with patch("accounts.views.User.objects.filter") as mock_filter:
        mock_filter.return_value.first.return_value = user
        response = client.post("/api/auth/refresh/")

    assert response.status_code == 401
