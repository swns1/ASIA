"""
Tests for LoginView, including the django-axes brute-force lockout wiring
added in accounts/auth_backends.py + settings.AUTHENTICATION_BACKENDS.

The user lookup is mocked (patching accounts.auth_backends.User.objects.filter)
so these don't depend on the `users` table existing in the test database --
User (accounts/models.py) is `managed = False`, meaning no Django migration
creates it, so a freshly created pytest-django test database won't have it.
Password hashing IS exercised for real (make_password/check_password), and
so is axes -- AccessAttempt (axes.models) is a real managed table from the
axes package itself, so @pytest.mark.django_db gives every test a real one.
AuditLog is also a managed model (migrations/0001_create_audit_log.py), so
these tests need django_db for the audit-log write on both the success and
failure paths regardless.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from rest_framework.test import APIClient

from axes.models import AccessAttempt

from accounts.views import REFRESH_COOKIE_PATH

CORRECT_PASSWORD = "correct-horse-battery-staple"


@pytest.fixture(autouse=True)
def _reset_login_throttle():
    """
    LoginRateThrottle ("login": "10/minute") shares this service's CACHES
    backend (see settings.py), which -- like the LocMemCache default it
    replaced -- persists across test functions within one pytest run, not
    just within one test. Several tests below deliberately POST to
    /api/auth/login/ more than 10 times in a row to exercise axes lockout;
    without this they'd trip the *rate* limit instead of the thing under
    test. Axes itself is unaffected -- it stores attempts in the database
    (AccessAttempt), not in this cache.
    """
    cache.clear()


def _fake_user(**overrides):
    defaults = dict(
        user_id=1,
        name="Test Teacher",
        email="teacher@example.com",
        role="teacher",
        profile_picture=None,
        password=make_password(CORRECT_PASSWORD),
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _mock_user_lookup(user):
    """
    Patches accounts.auth_backends.User.objects.filter(...).first() to
    return `user` when the email/name lookup matches it, None otherwise --
    the same two-step lookup IdentityUserBackend actually performs.
    """

    def fake_filter(**kwargs):
        email = kwargs.get("email__iexact")
        name = kwargs.get("name__iexact")
        match = user is not None and (
            (email is not None and email.lower() == user.email.lower())
            or (name is not None and name.lower() == user.name.lower())
        )
        result = MagicMock()
        result.first.return_value = user if match else None
        return result

    return patch("accounts.auth_backends.User.objects.filter", side_effect=fake_filter)


def _post_login(identifier="teacher@example.com", password=CORRECT_PASSWORD):
    return APIClient().post(
        "/api/auth/login/",
        {"identifier": identifier, "password": password},
        format="json",
    )


@pytest.mark.django_db
@patch("accounts.views.stamp_session_id")
def test_login_with_correct_credentials_returns_token_and_sets_refresh_cookie(mock_stamp_session_id):
    user = _fake_user()
    with _mock_user_lookup(user):
        response = _post_login()

    assert response.status_code == 200
    assert "access" in response.data
    assert response.data["user"]["email"] == "teacher@example.com"
    assert response.data["user"]["role"] == "teacher"
    assert "refresh" in response.cookies
    assert response.cookies["refresh"]["httponly"]
    # Scoped to /api/auth/* (RefreshView, LogoutView) rather than every
    # request to this service -- and must match LogoutView's
    # delete_cookie() path exactly, or logout silently fails to clear it
    # (see test_logout.py).
    assert response.cookies["refresh"]["path"] == REFRESH_COOKIE_PATH
    mock_stamp_session_id.assert_called_once()
    assert mock_stamp_session_id.call_args[0][0] == 1  # user_id from _fake_user()


@pytest.mark.django_db
@patch("accounts.views.stamp_session_id")
def test_login_with_wrong_password_is_rejected(mock_stamp_session_id):
    user = _fake_user()
    with _mock_user_lookup(user):
        response = _post_login(password="wrong-password")

    assert response.status_code == 400
    assert "access" not in response.data
    mock_stamp_session_id.assert_not_called()


@pytest.mark.django_db
def test_login_with_unknown_identifier_gives_the_same_generic_message():
    """
    Regression guard for the enumeration fix: an unknown identifier and a
    known identifier with the wrong password must be indistinguishable to
    the caller. Before this phase, find_user() returned "User not found."
    vs. "Invalid credentials." as two different strings.
    """
    with _mock_user_lookup(None):
        not_found_response = _post_login(identifier="nobody@example.com")

    user = _fake_user()
    with _mock_user_lookup(user):
        wrong_password_response = _post_login(password="wrong-password")

    assert not_found_response.status_code == 400
    assert wrong_password_response.status_code == 400
    assert not_found_response.data["detail"] == wrong_password_response.data["detail"]


@pytest.mark.django_db
def test_repeated_failures_lock_out_further_attempts(settings):
    """
    The actual point of this phase: axes was previously configured
    (AXES_FAILURE_LIMIT etc.) but structurally dead, because login never
    called django.contrib.auth.authenticate() -- the one function axes
    hooks. This proves failures are now actually counted and enforced.
    """
    user = _fake_user()
    with _mock_user_lookup(user):
        for _ in range(settings.AXES_FAILURE_LIMIT):
            response = _post_login(password="wrong-password")
            assert response.status_code == 400

        # Locked out now -- even the *correct* password must be rejected,
        # and with the same generic message as an ordinary bad login (see
        # the enumeration test above; a distinct "you're locked out"
        # message would leak lockout state to an attacker).
        locked_response = _post_login(password=CORRECT_PASSWORD)

    assert locked_response.status_code == 400
    assert "access" not in locked_response.data

    attempt = AccessAttempt.objects.get(username="teacher@example.com")
    assert attempt.failures_since_start >= settings.AXES_FAILURE_LIMIT


@pytest.mark.django_db
@patch("accounts.views.stamp_session_id")
def test_successful_login_resets_the_failure_counter(mock_stamp_session_id, settings):
    """
    This API is stateless JWT, not Django sessions -- axes normally resets
    its counter on django.contrib.auth.login()'s user_logged_in signal,
    which nothing here ever fires. LoginView.post() instead calls
    axes.utils.reset() by hand after a successful authenticate(); this
    proves that call actually clears the recorded attempts rather than
    letting them silently accumulate toward AXES_FAILURE_LIMIT across
    separate, otherwise-successful sessions.
    """
    user = _fake_user()
    with _mock_user_lookup(user):
        for _ in range(settings.AXES_FAILURE_LIMIT - 1):
            assert _post_login(password="wrong-password").status_code == 400

        assert AccessAttempt.objects.filter(username="teacher@example.com").exists()

        assert _post_login(password=CORRECT_PASSWORD).status_code == 200

    assert not AccessAttempt.objects.filter(username="teacher@example.com").exists()
