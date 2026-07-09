"""
Tests for LoginView. find_user() is mocked so these don't depend on the
`users` table existing in the test database — User (accounts/models.py) is
`managed = False`, meaning no Django migration creates it, so a freshly
created pytest-django test database won't have it. RefreshToken.for_user()
and record_audit_event() only ever use getattr() on the user object, so a
plain SimpleNamespace stands in fine for a real User instance. AuditLog IS
a managed model (see migrations/0001_create_audit_log.py), so these tests
still need @pytest.mark.django_db for the audit-log write on both the
success and failure paths.
"""
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient


def _fake_user(**overrides):
    defaults = dict(
        user_id=1,
        name="Test Teacher",
        email="teacher@example.com",
        role="teacher",
        profile_picture=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


@pytest.mark.django_db
@patch("accounts.serializers.find_user")
def test_login_with_correct_credentials_returns_token_and_sets_refresh_cookie(mock_find_user):
    mock_find_user.return_value = (_fake_user(), None)

    response = APIClient().post(
        "/api/auth/login/",
        {"identifier": "teacher@example.com", "password": "correct-horse-battery-staple"},
        format="json",
    )

    assert response.status_code == 200
    assert "access" in response.data
    assert response.data["user"]["email"] == "teacher@example.com"
    assert response.data["user"]["role"] == "teacher"
    assert "refresh" in response.cookies
    assert response.cookies["refresh"]["httponly"]


@pytest.mark.django_db
@patch("accounts.serializers.find_user")
def test_login_with_wrong_password_is_rejected(mock_find_user):
    mock_find_user.return_value = (None, "Invalid credentials.")

    response = APIClient().post(
        "/api/auth/login/",
        {"identifier": "teacher@example.com", "password": "wrong-password"},
        format="json",
    )

    assert response.status_code == 400
    assert "access" not in response.data
