"""
Regressions from the 2026-09-25 QA pass over identity-service. Each was
reproduced against a real database before it was fixed:

- A name over 100 characters or an email over 150 was a 500 (DataError at
  the INSERT), and "not-an-email" was accepted as a sign-in address.
- A photo the page allowed (under 2 MB) was a 500: base64 in JSON pushed the
  body past Django's 2.5 MB cap, and the shared exception handler turned
  RequestDataTooBig into "Something went wrong on our end".
- A 6 MB string of non-base64 junk measured as a tiny image.
- Two accounts sharing a display name: the second could never sign in by
  name, even with its own correct password.
- Every signed-in call was throttled as anonymous traffic, 30 a minute per
  address, and refresh shared that bucket.
- A refresh returned only the token, so a restored session couldn't know who
  was signed in.
- An admin's password reset left an axes lockout in place for up to an hour.

User is managed=False (no table in the test database), so lookups are
mocked, matching the rest of this service's tests.
"""
import base64
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.hashers import make_password
from django.core.exceptions import RequestDataTooBig
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.audit import record_audit_event
from accounts.throttles import SessionRateThrottle
from shared.exception_handler import safe_exception_handler

PASSWORD = "correct-horse-battery-staple"


def _admin(**overrides):
    defaults = dict(user_id=1, pk=1, name="Admin User", email="admin@example.com",
                    role="admin", is_authenticated=True)
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _target(**overrides):
    defaults = dict(
        user_id=2, pk=2, name="Teacher User", email="teacher@example.com", role="teacher",
        password=make_password("original-password-123"), current_session_id=uuid.uuid4(),
        profile_picture=None, save=MagicMock(),
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _patch_as(user, target, body):
    with patch("accounts.permissions.resolve_user_from_request", return_value=user), \
         patch("accounts.views.UserDetailView._get_target", return_value=target), \
         patch("accounts.views.User") as user_model, \
         patch("accounts.views.axes_reset") as reset:
        user_model.objects.filter.return_value.exclude.return_value.exists.return_value = False
        response = APIClient().patch(f"/api/auth/users/{target.user_id}/", body, format="json")
    return response, reset


def _create_as(user, body):
    with patch("accounts.permissions.resolve_user_from_request", return_value=user), \
         patch("accounts.views.User") as user_model:
        user_model.objects.filter.return_value.exists.return_value = False
        response = APIClient().post("/api/auth/users/", body, format="json")
    return response, user_model


# ── input limits ─────────────────────────────────────────────────────────────

@pytest.mark.django_db
@pytest.mark.parametrize("field, value, message", [
    ("email", "a" * 140 + "@example.test", "150 characters"),
    ("email", "not-an-email", "valid email"),
    ("name", "N" * 101, "100 characters"),
])
def test_create_rejects_bad_input_with_a_400_on_the_field(field, value, message):
    body = {"name": "New Teacher", "email": "new@example.com", "role": "teacher",
            "password": "Xk9-mQ2vLp-teststrong", field: value}
    response, user_model = _create_as(_admin(), body)

    assert response.status_code == 400
    assert message in response.data[field][0]
    user_model.objects.create.assert_not_called()


@pytest.mark.django_db
@pytest.mark.parametrize("field, value", [("name", "N" * 101), ("email", "x")])
def test_edit_rejects_bad_input_with_a_400(field, value):
    target = _target()
    response, _ = _patch_as(_admin(), target, {field: value})

    assert response.status_code == 400
    assert field in response.data
    target.save.assert_not_called()


@pytest.mark.django_db
def test_an_unchanged_email_is_not_revalidated():
    """An existing account whose address predates validation can still have
    its name edited -- the form always sends the email back."""
    target = _target(email="legacy-address")
    response, _ = _patch_as(_admin(), target, {"email": "legacy-address", "name": "Renamed"})
    assert response.status_code == 200


# ── profile picture ──────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_junk_that_is_not_base64_is_rejected():
    target = _target()
    junk = "data:image/png;base64,AAAA" + "!" * 1000
    response, _ = _patch_as(_admin(), target, {"profile_picture": junk})

    assert response.status_code == 400
    target.save.assert_not_called()


@pytest.mark.django_db
def test_a_2mb_photo_is_accepted():
    """1.99 MB of image is 2.65 MB as base64 -- over Django's default cap."""
    target = _target()
    photo = "data:image/png;base64," + base64.b64encode(b"\x89PNG" + b"\0" * 1_990_000).decode()
    response, _ = _patch_as(_admin(), target, {"profile_picture": photo})

    assert response.status_code == 200
    assert target.profile_picture == photo


def test_an_oversized_request_is_a_413_not_a_500():
    response = safe_exception_handler(RequestDataTooBig("too big"), {"view": None})
    assert response.status_code == 413


# ── password reset clears a lockout ──────────────────────────────────────────

@pytest.mark.django_db
def test_an_admin_password_reset_lifts_the_lockout():
    target = _target()
    response, reset = _patch_as(_admin(), target, {"new_password": "Fresh-Pass-4-Teacher!"})

    assert response.status_code == 200
    reset.assert_any_call(username="teacher@example.com")
    reset.assert_any_call(username="Teacher User")


@pytest.mark.django_db
def test_a_name_change_does_not_touch_lockouts():
    target = _target()
    response, reset = _patch_as(_admin(), target, {"name": "Renamed"})

    assert response.status_code == 200
    reset.assert_not_called()


# ── signing in by a shared display name ──────────────────────────────────────

def _backend_lookup(users):
    def fake_filter(**kwargs):
        result = MagicMock()
        email = kwargs.get("email__iexact")
        name = kwargs.get("name__iexact")
        if email is not None:
            result.first.return_value = next((u for u in users if u.email.lower() == email.lower()), None)
        if name is not None:
            result.__getitem__.return_value = [u for u in users if u.name.lower() == name.lower()]
        return result
    return patch("accounts.auth_backends.User.objects.filter", side_effect=fake_filter)


def _maria(user_id, password):
    return SimpleNamespace(user_id=user_id, pk=user_id, name="Maria Santos",
                           email=f"maria{user_id}@example.com", role="guardian",
                           profile_picture=None, password=make_password(password))


@pytest.mark.django_db
@patch("accounts.views.stamp_session_id")
def test_the_second_account_with_a_shared_name_can_sign_in_by_name(_stamp):
    first, second = _maria(1, "first-maria-password"), _maria(2, PASSWORD)
    with _backend_lookup([first, second]):
        response = APIClient().post(
            "/api/auth/login/", {"identifier": "maria santos", "password": PASSWORD}, format="json",
        )

    assert response.status_code == 200
    assert response.data["user"]["id"] == 2


@pytest.mark.django_db
@patch("accounts.views.stamp_session_id")
def test_a_shared_name_with_a_shared_password_is_refused(_stamp):
    with _backend_lookup([_maria(1, PASSWORD), _maria(2, PASSWORD)]):
        response = APIClient().post(
            "/api/auth/login/", {"identifier": "Maria Santos", "password": PASSWORD}, format="json",
        )

    assert response.status_code == 400


@pytest.mark.django_db
def test_a_missing_field_comes_back_as_one_message_not_a_dict():
    """The login page renders `detail` as text."""
    response = APIClient().post("/api/auth/login/", {"identifier": "x"}, format="json")

    assert response.status_code == 400
    assert isinstance(response.data["detail"], str)


# ── throttling ───────────────────────────────────────────────────────────────

@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.AuditLog")
def test_a_signed_in_admin_is_not_capped_at_the_anonymous_rate(_audit, mock_resolve):
    mock_resolve.return_value = _admin()
    client = APIClient()
    codes = [client.get("/api/auth/audit-logs/facets/").status_code for _ in range(35)]
    assert 429 not in codes


def test_session_throttle_gives_each_signed_in_browser_its_own_budget():
    factory = APIRequestFactory()
    a = factory.post("/api/auth/refresh/")
    a.COOKIES["refresh"] = "session-a"
    b = factory.post("/api/auth/refresh/")
    b.COOKIES["refresh"] = "session-b"

    throttle = SessionRateThrottle()
    key_a, key_b = throttle.get_cache_key(a, None), throttle.get_cache_key(b, None)
    assert key_a != key_b
    assert "session-a" not in key_a  # the raw token never lands in the cache


# ── refresh returns who is signed in ─────────────────────────────────────────

@pytest.mark.django_db
def test_refresh_returns_the_user_with_the_token():
    session_id = uuid.uuid4()
    user = SimpleNamespace(user_id=1, name="Registrar", email="r@example.com", role="registrar",
                           profile_picture=None, current_session_id=session_id)
    refresh = RefreshToken()
    refresh["user_id"] = 1
    refresh["sid"] = str(session_id)
    client = APIClient()
    client.cookies["refresh"] = str(refresh)

    with patch("accounts.views.User.objects.filter") as mock_filter:
        mock_filter.return_value.first.return_value = user
        response = client.post("/api/auth/refresh/")

    assert response.status_code == 200
    assert response.data["access"]
    assert response.data["user"] == {
        "id": 1, "name": "Registrar", "email": "r@example.com",
        "role": "registrar", "profile_picture": None,
    }


# ── audit trail keeps long identifiers ───────────────────────────────────────

def test_an_overlong_identifier_is_clipped_not_dropped():
    request = APIRequestFactory().post("/api/auth/login/")
    with patch("accounts.audit.AuditLog.objects.create") as create:
        record_audit_event(request, user_name="x" * 200, user_role="unknown",
                           action="Failed login attempt", module="Identity", status="failed")

    assert len(create.call_args.kwargs["user_name"]) == 150
