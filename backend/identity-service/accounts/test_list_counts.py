"""
The counts behind two list pages' status bands.

- Users: each role's accounts, and how many of them are inactive, so the band
  can count a role among the active (or inactive) accounts on screen.
- Audit Trail: the per-status counts follow the role, module, date and time
  filters -- what the page's menus narrowed to -- but never the status or the
  search, and the role and module lists stay whole.

`users` is unmanaged (no test table), so its counts take a stand-in queryset;
audit_logs is this service's own table, so those run against real rows.
"""
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AuditLog
from accounts.views import user_counts


def _rows(pairs):
    qs = MagicMock()
    qs.order_by.return_value.values.return_value.annotate.return_value = [
        {"role": role, "n": n} for role, n in pairs
    ]
    return qs


def test_user_counts_split_each_role_by_status():
    accounts = _rows([("teacher", 40), ("guardian", 438), ("admin", 2)])
    accounts.filter.return_value = _rows([("teacher", 3), ("guardian", 2)])

    counts = user_counts(accounts)

    accounts.filter.assert_called_once_with(is_active=False)
    assert counts == {
        "total": 480,
        "by_role": {"teacher": 40, "guardian": 438, "admin": 2},
        "inactive": 5,
        "inactive_by_role": {"teacher": 3, "guardian": 2},
    }


def _admin():
    return SimpleNamespace(user_id=1, name="Admin", email="a@example.com", role="admin",
                           is_authenticated=True, pk=1)


def _log(role, module, status, when):
    return AuditLog.objects.create(
        user_name=f"{role} user", user_role=role, action="Did something",
        module=module, status=status, occurred_at=when, details="",
    )


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
def test_audit_status_counts_follow_the_menus_but_not_the_search(mock_resolve):
    mock_resolve.return_value = _admin()
    today = timezone.now()
    _log("teacher", "Grades", "success", today)
    _log("teacher", "Grades", "failed", today)
    _log("teacher", "Students", "success", today - timedelta(days=3))
    _log("registrar", "Enrollments", "success", today)

    client = APIClient()
    every = client.get("/api/auth/audit-logs/facets/").data
    assert every["status_counts"] == {"success": 3, "failed": 1, "total": 4}

    teacher = client.get("/api/auth/audit-logs/facets/?role=teacher&search=nothing-matches&status=failed").data
    assert teacher["status_counts"] == {"success": 2, "failed": 1, "total": 3}
    # The menus' own options still cover the whole log.
    assert teacher["roles"] == ["registrar", "teacher"]
    assert teacher["modules"] == ["Enrollments", "Grades", "Students"]

    graded_today = client.get(
        f"/api/auth/audit-logs/facets/?role=teacher&module=grades&date={timezone.localdate(today).isoformat()}"
    ).data
    assert graded_today["status_counts"] == {"success": 1, "failed": 1, "total": 2}


@pytest.mark.django_db
@patch("accounts.permissions.resolve_user_from_request")
def test_audit_list_still_applies_status_and_search(mock_resolve):
    mock_resolve.return_value = _admin()
    now = timezone.now()
    _log("teacher", "Grades", "success", now)
    _log("teacher", "Grades", "failed", now)

    data = APIClient().get("/api/auth/audit-logs/?role=teacher&status=failed").data
    assert data["count"] == 1
    assert data["results"][0]["status"] == "failed"
