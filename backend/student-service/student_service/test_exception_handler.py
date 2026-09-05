"""
shared/exception_handler.py -- see test_logging.py's module docstring for why
shared/ modules are tested from inside student-service.
"""
from unittest.mock import MagicMock

from django.http import HttpResponse
from django.test import RequestFactory

from shared.exception_handler import safe_exception_handler
from shared.request_id import RequestIDMiddleware

factory = RequestFactory()


def test_unhandled_exception_returns_a_generic_500_with_the_request_id():
    # RequestIDMiddleware sets the contextvar safe_exception_handler reads;
    # exercise it the same way a real request would rather than reaching
    # into the private contextvar directly.
    captured = {}

    def get_response(request):
        response = safe_exception_handler(ValueError("db exploded"), {"view": None})
        captured["body"] = response.data
        captured["status"] = response.status_code
        return HttpResponse(status=200)

    RequestIDMiddleware(get_response=get_response)(factory.get("/api/students/"))

    assert captured["status"] == 500
    assert captured["body"]["detail"] == "Something went wrong on our end. Please try again."
    assert captured["body"]["request_id"] != "-"
    assert len(captured["body"]["request_id"]) == 36


def test_recognized_drf_exceptions_pass_through_unchanged():
    # DRF's own exception_handler already produces a clean response for
    # things it recognizes (Http404, PermissionDenied, ...) -- this handler
    # must not touch that path or add request_id noise to responses that
    # were never the "something went wrong" case it exists for.
    from rest_framework.exceptions import PermissionDenied

    response = safe_exception_handler(PermissionDenied("nope"), {"view": MagicMock()})

    assert response.status_code == 403
    assert "request_id" not in response.data
