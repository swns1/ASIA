"""
Tests for shared.audit.client_ip and the DatabaseError logging added to
both audit writers (shared/audit.py's BaseAuditLogMiddleware and this
service's own record_audit_event) -- previously:

1. client_ip() took the left-most X-Forwarded-For value unconditionally,
   spoofable by any client since nothing in this stack strips or verifies
   that header (no reverse proxy is in front of these services). It now
   reads REST_FRAMEWORK["NUM_PROXIES"] (0 in every service's settings.py
   today), matching the same trusted-proxy semantics DRF's own throttling
   already uses.
2. A failed audit write (`except DatabaseError`) was silently swallowed in
   both writers -- a schema drift or full disk lost every audit entry with
   zero signal. Both now log the failure.
"""
from unittest.mock import patch

import pytest
from django.db import DatabaseError
from rest_framework.test import APIRequestFactory

from accounts.audit import record_audit_event
from shared.audit import client_ip

factory = APIRequestFactory()


class TestClientIp:
    def test_num_proxies_zero_ignores_x_forwarded_for(self, settings):
        settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 0}
        request = factory.get("/", REMOTE_ADDR="10.0.0.1", HTTP_X_FORWARDED_FOR="1.2.3.4")
        assert client_ip(request) == "10.0.0.1"

    def test_num_proxies_zero_is_the_actual_configured_default(self):
        """Regression guard: the real settings.py value, not a value this
        test invents, must already be safe."""
        request = factory.get("/", REMOTE_ADDR="10.0.0.1", HTTP_X_FORWARDED_FOR="1.2.3.4")
        assert client_ip(request) == "10.0.0.1"

    def test_num_proxies_one_takes_the_hop_closest_to_the_trusted_proxy(self, settings):
        settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}
        # attacker, real-proxy -- with one trusted proxy, the right-most
        # entry is the one *that* proxy appended, so it's the only trustworthy one.
        request = factory.get("/", HTTP_X_FORWARDED_FOR="9.9.9.9, 203.0.113.5")
        assert client_ip(request) == "203.0.113.5"

    def test_no_forwarded_header_uses_remote_addr_regardless(self, settings):
        settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}
        request = factory.get("/", REMOTE_ADDR="10.0.0.1")
        assert client_ip(request) == "10.0.0.1"


@pytest.mark.django_db
def test_record_audit_event_logs_rather_than_swallows_a_database_error(caplog):
    request = factory.post("/api/auth/users/")
    with patch("accounts.audit.AuditLog.objects.create", side_effect=DatabaseError("boom")):
        record_audit_event(
            request,
            user_name="Someone",
            user_role="admin",
            action="Did a thing",
            module="Users",
            status="success",
            details="",
        )
    assert any("Failed to write audit log entry" in r.message for r in caplog.records)
