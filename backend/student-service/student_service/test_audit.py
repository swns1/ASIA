"""
BaseAuditLogMiddleware.__call__ used to swallow a failed audit-log write
(`except DatabaseError: pass`) with no signal at all -- a schema drift or
full disk lost every audit entry silently. It now logs the failure. Tested
here (rather than in shared/) because shared/ has no pytest.ini of its own
and isn't discovered by any service's test run; AuditLogMiddleware is this
service's own concrete subclass of the shared base.

insert_audit_log is mocked to raise directly, so this never touches the
database -- no @pytest.mark.django_db needed (and this service can't build
a fresh test database anyway; see enrollment-service/ai/test_risk_assessment.py's
docstring for that unrelated, already-documented limitation).
"""
from unittest.mock import MagicMock, patch

from django.db import DatabaseError
from django.test import RequestFactory

from student_service.audit import AuditLogMiddleware

factory = RequestFactory()


def test_a_failed_audit_write_is_logged_not_swallowed(caplog):
    middleware = AuditLogMiddleware(get_response=lambda request: MagicMock(status_code=201))
    request = factory.post("/api/students/")

    with patch.object(middleware, "insert_audit_log", side_effect=DatabaseError("boom")):
        response = middleware(request)

    assert response.status_code == 201  # the actual mutation's response still goes through
    assert any("Failed to write audit log entry" in r.message for r in caplog.records)
