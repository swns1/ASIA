"""
Tests for LogoutView -- previously untested entirely. Also locks in the
refresh cookie's new path scoping (REFRESH_COOKIE_PATH in views.py):
delete_cookie() has to use the exact same path used by set_cookie(), or the
browser's cookie jar won't match the two and the "deletion" is silently a
no-op, leaving the refresh token alive.

accounts.models.User is managed=False (no table in a fresh pytest-django
test database), so User.objects.filter is mocked -- same technique
test_login.py and test_roles.py use. Patched at accounts.models.User since
that's the one place the class actually lives; accounts.views.User and
accounts.audit.User are both just imports of the same object, so one patch
covers resolve_user_from_request() (audit.py) and the current_session_id
clear (views.py) alike.
"""
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient
from datetime import timedelta

from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from accounts.views import REFRESH_COOKIE_PATH


def _fake_user(session_id, **overrides):
    defaults = dict(
        user_id=1,
        name="Test Teacher",
        email="teacher@example.com",
        role="teacher",
        profile_picture=None,
        current_session_id=session_id,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _bearer_token(user_id, session_id):
    token = AccessToken()
    token["user_id"] = user_id
    token["sid"] = str(session_id)
    return str(token)


@pytest.mark.django_db
def test_logout_clears_the_refresh_cookie_at_the_same_path_it_was_set():
    session_id = uuid.uuid4()
    user = _fake_user(session_id)
    token = _bearer_token(1, session_id)

    client = APIClient()
    client.cookies["refresh"] = "irrelevant-opaque-refresh-token-value"

    with patch("accounts.models.User.objects.filter") as mock_filter:
        mock_filter.return_value.first.return_value = user
        mock_filter.return_value.update.return_value = 1
        response = client.post("/api/auth/logout/", HTTP_AUTHORIZATION=f"Bearer {token}")

    assert response.status_code == 200
    deleted = response.cookies["refresh"]
    assert deleted.value == ""
    assert deleted["path"] == REFRESH_COOKIE_PATH
    assert deleted["max-age"] == 0


@pytest.mark.django_db
def test_logout_clears_current_session_id_so_the_old_access_token_stops_working():
    session_id = uuid.uuid4()
    user = _fake_user(session_id)
    token = _bearer_token(1, session_id)

    with patch("accounts.models.User.objects.filter") as mock_filter:
        mock_filter.return_value.first.return_value = user
        APIClient().post("/api/auth/logout/", HTTP_AUTHORIZATION=f"Bearer {token}")

        # Scoped to the session being ended, so a login that lands in
        # between is not the one cleared.
        mock_filter.assert_any_call(user_id=user.user_id, current_session_id=session_id)
        mock_filter.return_value.update.assert_called_once_with(current_session_id=None)


def _refresh_cookie(user_id, session_id):
    refresh = RefreshToken()
    refresh["user_id"] = user_id
    refresh["sid"] = str(session_id)
    return str(refresh)


def _expired_bearer_token(user_id, session_id):
    token = AccessToken()
    token["user_id"] = user_id
    token["sid"] = str(session_id)
    token.set_exp(lifetime=-timedelta(minutes=1))
    return str(token)


@pytest.mark.django_db
def test_logout_after_the_access_token_expired_still_ends_the_session():
    """
    The regression: open the portal, leave it past the 2-hour access token,
    click Log out. That used to be a 401 -- session still active, refresh
    cookie still valid for up to 7 days and still minting tokens. The cookie
    now identifies the session.
    """
    session_id = uuid.uuid4()
    user = _fake_user(session_id)

    client = APIClient()
    client.cookies["refresh"] = _refresh_cookie(1, session_id)

    with patch("accounts.models.User.objects.filter") as mock_filter:
        mock_filter.return_value.first.return_value = user
        response = client.post(
            "/api/auth/logout/", HTTP_AUTHORIZATION=f"Bearer {_expired_bearer_token(1, session_id)}",
        )

        mock_filter.return_value.update.assert_called_once_with(current_session_id=None)

    assert response.status_code == 200
    assert response.cookies["refresh"].value == ""


@pytest.mark.django_db
def test_logout_with_no_credentials_still_deletes_the_cookie():
    """Idempotent: nothing to end, but the browser is told to drop the cookie."""
    with patch("accounts.models.User.objects.filter") as mock_filter:
        response = APIClient().post("/api/auth/logout/")
        mock_filter.return_value.update.assert_not_called()

    assert response.status_code == 200
    assert response.cookies["refresh"]["max-age"] == 0


@pytest.mark.django_db
def test_a_superseded_session_does_not_sign_out_the_newer_login():
    """
    The token's sid must match the user's *current* session. If the user has
    since signed in on another device, logging out this old one must leave
    that newer session alone -- by access token or by cookie.
    """
    real_session = uuid.uuid4()
    stale_session = uuid.uuid4()
    user = _fake_user(real_session)

    client = APIClient()
    client.cookies["refresh"] = _refresh_cookie(1, stale_session)

    with patch("accounts.models.User.objects.filter") as mock_filter:
        mock_filter.return_value.first.return_value = user
        response = client.post(
            "/api/auth/logout/", HTTP_AUTHORIZATION=f"Bearer {_bearer_token(1, stale_session)}",
        )
        mock_filter.return_value.update.assert_not_called()

    assert response.status_code == 200
    assert response.cookies["refresh"].value == ""


@pytest.mark.django_db
def test_logout_refuses_a_foreign_origin():
    """Now that the cookie alone can end a session, a cross-site page must
    not be able to sign people out -- same origin check as refresh."""
    client = APIClient()
    client.cookies["refresh"] = "anything"
    response = client.post("/api/auth/logout/", HTTP_ORIGIN="https://evil.example")
    assert response.status_code == 403
