"""
Settings that only matter once the services sit behind a hosting proxy on a
different site from the frontend (Railway): the refresh cookie's SameSite
attribute, the refresh endpoint's origin check, the address axes locks out
on, and the health check surviving an HTTPS redirect.

User lookups are mocked, matching test_login.py / test_logout.py.
"""
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from axes.helpers import get_client_ip_address, get_client_parameters
from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import RequestFactory, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

PASSWORD = "correct-horse-battery-staple"


def _user():
    return SimpleNamespace(
        user_id=1, pk=1, name="Registrar", email="registrar@example.com", role="registrar",
        profile_picture=None, password=make_password(PASSWORD), current_session_id=None,
        is_active=True,
    )


def _login(client=None):
    user = _user()

    def fake_filter(**kwargs):
        result = MagicMock()
        email = kwargs.get("email__iexact")
        result.first.return_value = user if email == user.email else None
        return result

    with patch("accounts.auth_backends.User.objects.filter", side_effect=fake_filter), \
         patch("accounts.views.stamp_session_id"):
        return (client or APIClient()).post(
            "/api/auth/login/",
            {"identifier": user.email, "password": PASSWORD},
            format="json",
        )


# -- refresh cookie ----------------------------------------------------------

@pytest.mark.django_db
def test_lan_default_is_lax_and_not_forced_secure():
    response = _login()
    cookie = response.cookies["refresh"]
    assert cookie["samesite"] == "Lax"
    assert not cookie["secure"]


@pytest.mark.django_db
@override_settings(REFRESH_COOKIE_SAMESITE="None", REFRESH_COOKIE_SECURE=True)
def test_cross_site_setting_sends_samesite_none_and_secure():
    response = _login()
    cookie = response.cookies["refresh"]
    assert cookie["samesite"] == "None"
    assert cookie["secure"]


@pytest.mark.django_db
@override_settings(REFRESH_COOKIE_SAMESITE="None", REFRESH_COOKIE_SECURE=True)
def test_logout_deletes_the_cookie_with_matching_attributes():
    session_id = uuid.uuid4()
    user = SimpleNamespace(user_id=1, name="R", email="r@example.com", role="registrar",
                           profile_picture=None, current_session_id=session_id)
    refresh = RefreshToken()
    refresh["user_id"] = 1
    refresh["sid"] = str(session_id)
    client = APIClient()
    client.cookies["refresh"] = str(refresh)

    with patch("accounts.models.User.objects.filter") as mock_filter:
        mock_filter.return_value.first.return_value = user
        response = client.post(
            "/api/auth/logout/", HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}",
        )

    assert response.status_code == 200
    cookie = response.cookies["refresh"]
    assert cookie["max-age"] == 0
    assert cookie["samesite"] == "None"
    assert cookie["secure"]


# -- refresh origin check ----------------------------------------------------

@pytest.mark.django_db
def test_refresh_refuses_an_origin_the_frontend_is_not_served_from():
    client = APIClient()
    client.cookies["refresh"] = "anything"
    response = client.post("/api/auth/refresh/", HTTP_ORIGIN="https://evil.example")
    assert response.status_code == 403


@pytest.mark.django_db
def test_refresh_accepts_a_configured_origin():
    origin = settings.CORS_ALLOWED_ORIGINS[0]
    response = APIClient().post("/api/auth/refresh/", HTTP_ORIGIN=origin)
    # Past the origin check; fails later only because there is no cookie.
    assert response.status_code == 401


@pytest.mark.django_db
def test_refresh_without_an_origin_header_is_not_blocked():
    response = APIClient().post("/api/auth/refresh/")
    assert response.status_code == 401


# -- axes: the address it locks on ------------------------------------------

def test_axes_uses_the_proxy_aware_client_address():
    request = RequestFactory().post(
        "/api/auth/login/",
        REMOTE_ADDR="10.0.0.1",  # the hosting proxy
        HTTP_X_FORWARDED_FOR="203.0.113.7",
    )
    with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}):
        assert get_client_ip_address(request) == "203.0.113.7"
    with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "NUM_PROXIES": 0}):
        assert get_client_ip_address(request) == "10.0.0.1"


def test_axes_locks_the_ip_and_username_pair_not_either_alone():
    request = RequestFactory().post("/api/auth/login/")
    params = get_client_parameters("registrar@example.com", "203.0.113.7", "ua", request)
    # One combined filter -- not one per key, which would lock everyone
    # sharing the address, or every device trying that username.
    assert params == [{"ip_address": "203.0.113.7", "username": "registrar@example.com"}]


# -- HTTPS redirect vs. the platform health check -----------------------------

@pytest.mark.django_db
@override_settings(SECURE_SSL_REDIRECT=True, ALLOWED_HOSTS=["healthcheck.railway.app", "api.example"])
def test_health_check_over_plain_http_is_not_redirected():
    # Railway calls /health/ over HTTP with no X-Forwarded-Proto; a 301 here
    # marks every deploy as failed.
    response = APIClient().get("/health/", HTTP_HOST="healthcheck.railway.app")
    assert response.status_code == 200


@pytest.mark.django_db
@override_settings(SECURE_SSL_REDIRECT=True, ALLOWED_HOSTS=["api.example"])
def test_other_plain_http_requests_are_still_redirected():
    response = APIClient().get("/api/auth/refresh/", HTTP_HOST="api.example")
    assert response.status_code == 301
