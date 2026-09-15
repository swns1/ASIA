"""
Tests for shared.audit.client_ip and the DatabaseError logging added to
both audit writers (shared/audit.py's BaseAuditLogMiddleware and this
service's own record_audit_event) -- previously:

1. client_ip() took the left-most X-Forwarded-For value unconditionally,
   spoofable by any client since nothing in this stack strips or verifies
   that header. It now reads REST_FRAMEWORK["NUM_PROXIES"], matching the
   same trusted-proxy semantics DRF's own throttling already uses. That
   setting is env-driven and defaults to 0 -- no proxy is configured
   anywhere in this repo, so trusting a hop would reintroduce the spoof it
   was added to close. Deployments behind a load balancer set NUM_PROXIES.
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

    def test_the_actual_configured_default_does_not_trust_forwarded_for(self):
        """
        Regression guard on the real settings.py value, not one this test
        invents. NUM_PROXIES is now env-driven and defaults to 0, because
        nothing in this repo actually deploys a reverse proxy -- no Dockerfile,
        no Procfile, no deployment manifest. Trusting a hop that isn't there
        let any client spoof both its throttle bucket and the ip_address
        written to the audit log.

        A deployment that really does sit behind one load balancer sets
        NUM_PROXIES=1 in its environment; the hop-counting behaviour that
        enables is covered by the test below.
        """
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
