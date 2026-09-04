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
from rest_framework_simplejwt.tokens import AccessToken

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

        mock_filter.assert_any_call(user_id=user.user_id)
        mock_filter.return_value.update.assert_called_once_with(current_session_id=None)


@pytest.mark.django_db
def test_logout_without_a_bearer_token_is_rejected():
    response = APIClient().post("/api/auth/logout/")
    assert response.status_code == 401


@pytest.mark.django_db
def test_logout_with_a_stale_session_id_is_rejected():
    """
    The token's sid claim must match the user's *current* session --
    superseded by a later login elsewhere, this is treated as
    unauthenticated (see resolve_user_from_request's fail-closed sid check).
    """
    real_session = uuid.uuid4()
    stale_token = _bearer_token(1, uuid.uuid4())  # different sid
    user = _fake_user(real_session)

    with patch("accounts.models.User.objects.filter") as mock_filter:
        mock_filter.return_value.first.return_value = user
        response = APIClient().post("/api/auth/logout/", HTTP_AUTHORIZATION=f"Bearer {stale_token}")

    assert response.status_code == 401
