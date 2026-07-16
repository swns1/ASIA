"""
Tests for VALID_ROLES enforcement in UserListView.post / UserDetailView.patch
— the only two places a role is ever assigned, since `role` has no DB-level
constraint (see accounts/models.py). resolve_user_from_request() and
User.objects lookups are mocked rather than exercised against a real
database, same convention as test_login.py.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.test import APIClient


def _admin_user(**overrides):
    defaults = dict(user_id=1, name="Admin User", email="admin@example.com", role="admin")
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
def test_create_user_rejects_invalid_role(mock_resolve):
    mock_resolve.return_value = _admin_user()

    response = APIClient().post(
        "/api/auth/users/",
        {"name": "New Teacher", "email": "new@example.com", "role": "cashier", "password": "x" * 10},
        format="json",
    )

    assert response.status_code == 400
    assert "Invalid role" in response.data["detail"]


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.User")
def test_create_user_accepts_valid_role(mock_user_model, mock_resolve):
    mock_resolve.return_value = _admin_user()
    mock_user_model.objects.filter.return_value.exists.return_value = False
    created = SimpleNamespace(
        user_id=2, name="New Teacher", email="new@example.com",
        role="teacher", profile_picture=None,
    )
    mock_user_model.objects.create.return_value = created

    response = APIClient().post(
        "/api/auth/users/",
        {"name": "New Teacher", "email": "new@example.com", "role": "teacher", "password": "x" * 10},
        format="json",
    )

    assert response.status_code == 201
    mock_user_model.objects.create.assert_called_once()


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
@patch("accounts.views.UserDetailView._get_target")
def test_patch_rejects_invalid_role(mock_get_target, mock_resolve):
    mock_resolve.return_value = _admin_user()
    target = SimpleNamespace(user_id=2, name="Teacher", email="t@example.com", role="teacher", save=MagicMock())
    mock_get_target.return_value = target

    response = APIClient().patch(
        "/api/auth/users/2/",
        {"role": "cashier"},
        format="json",
    )

    assert response.status_code == 400
    assert "Invalid role" in response.data["detail"]
    target.save.assert_not_called()
