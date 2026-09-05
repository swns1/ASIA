"""
Tests for shared/request_id.py and shared/logging_config.py.

Placed here rather than in backend/shared/ for the same reason as
test_audit.py in this file's own directory: shared/ has no pytest.ini of its
own and isn't discovered by any service's test run. Nothing here is
student-service-specific -- these exercise the shared modules directly.
"""
import json
import logging
import sys

from django.http import HttpResponse
from django.test import RequestFactory

from shared.logging_config import JsonFormatter, build_logging
from shared.request_id import (
    REQUEST_ID_HEADER,
    RequestIDLogFilter,
    RequestIDMiddleware,
    current_request_id,
)

factory = RequestFactory()


def _noop_response(request):
    return HttpResponse()


def _make_record(message="something happened", exc_info=None):
    return logging.LogRecord(
        name="shared.audit", level=logging.INFO, pathname=__file__, lineno=1,
        msg=message, args=(), exc_info=exc_info,
    )


# ── RequestIDMiddleware ──────────────────────────────────────────────────────

def test_generates_a_request_id_when_none_is_supplied():
    middleware = RequestIDMiddleware(get_response=_noop_response)
    request = factory.get("/api/students/")

    response = middleware(request)

    request_id = response[REQUEST_ID_HEADER]
    assert request_id != "-"
    assert len(request_id) == 36  # a UUID4 string
    assert request.request_id == request_id


def test_honors_a_well_formed_inbound_request_id():
    inbound = "11111111-2222-3333-4444-555555555555"
    middleware = RequestIDMiddleware(get_response=_noop_response)
    request = factory.get("/api/students/", HTTP_X_REQUEST_ID=inbound)

    response = middleware(request)

    assert response[REQUEST_ID_HEADER] == inbound


def test_rejects_a_malformed_inbound_request_id_and_generates_its_own():
    # Not UUID-shaped, and includes exactly the kind of value that would be a
    # log-forging attempt if it were trusted verbatim (see shared/request_id.py).
    hostile = "abc\r\nFAKE LOG LINE: user admin deleted"
    middleware = RequestIDMiddleware(get_response=_noop_response)
    request = factory.get("/api/students/", HTTP_X_REQUEST_ID=hostile)

    response = middleware(request)

    assert response[REQUEST_ID_HEADER] != hostile
    assert len(response[REQUEST_ID_HEADER]) == 36


def test_request_id_is_readable_via_current_request_id_during_the_request():
    seen = {}

    def get_response(request):
        seen["during"] = current_request_id()
        return HttpResponse()

    middleware = RequestIDMiddleware(get_response=get_response)
    request = factory.get("/api/students/")

    response = middleware(request)

    assert seen["during"] == response[REQUEST_ID_HEADER]
    assert seen["during"] != "-"


def test_contextvar_resets_to_the_sentinel_after_the_request_completes():
    middleware = RequestIDMiddleware(get_response=_noop_response)
    request = factory.get("/api/students/")

    middleware(request)

    # A management command or a later request handled on the same thread
    # before the middleware sets a fresh ID must not inherit this one.
    assert current_request_id() == "-"


def test_a_second_request_gets_a_different_id():
    middleware = RequestIDMiddleware(get_response=_noop_response)

    first = middleware(factory.get("/api/students/"))
    second = middleware(factory.get("/api/students/"))

    assert first[REQUEST_ID_HEADER] != second[REQUEST_ID_HEADER]


# ── RequestIDLogFilter ───────────────────────────────────────────────────────

def test_filter_attaches_the_current_request_id_to_a_log_record():
    seen_request_id = {}

    def get_response(request):
        seen_request_id["value"] = current_request_id()
        record = _make_record()
        RequestIDLogFilter().filter(record)
        assert record.request_id == seen_request_id["value"]
        return HttpResponse()

    middleware = RequestIDMiddleware(get_response=get_response)
    middleware(factory.get("/api/students/"))


def test_filter_defaults_to_a_dash_outside_any_request():
    record = _make_record()

    RequestIDLogFilter().filter(record)

    assert record.request_id == "-"


# ── JsonFormatter ─────────────────────────────────────────────────────────────

def test_json_formatter_produces_valid_json_with_the_expected_fields():
    formatter = JsonFormatter(service="test-service")
    record = _make_record("payment could not be recorded")
    record.request_id = "11111111-2222-3333-4444-555555555555"

    line = formatter.format(record)
    payload = json.loads(line)

    assert payload["service"] == "test-service"
    assert payload["level"] == "INFO"
    assert payload["logger"] == "shared.audit"
    assert payload["message"] == "payment could not be recorded"
    assert payload["request_id"] == "11111111-2222-3333-4444-555555555555"
    assert payload["timestamp"].endswith("Z")


def test_json_formatter_defaults_request_id_to_dash_when_the_filter_never_ran():
    formatter = JsonFormatter(service="test-service")
    record = _make_record()  # no .request_id attribute set

    payload = json.loads(formatter.format(record))

    assert payload["request_id"] == "-"


def test_json_formatter_includes_the_traceback_for_an_exception_record():
    formatter = JsonFormatter(service="test-service")
    try:
        raise ValueError("boom")
    except ValueError:
        record = _make_record("unhandled exception", exc_info=sys.exc_info())

    payload = json.loads(formatter.format(record))

    assert "ValueError: boom" in payload["exception"]


# ── build_logging ─────────────────────────────────────────────────────────────

def test_build_logging_creates_the_log_directory(tmp_path):
    log_dir = tmp_path / "logs"
    assert not log_dir.exists()

    build_logging(tmp_path, "some-service", debug=False)

    assert log_dir.is_dir()


def test_build_logging_points_the_file_handler_at_the_service_name(tmp_path):
    config = build_logging(tmp_path, "billing-service", debug=False)

    assert config["handlers"]["file"]["filename"] == str(tmp_path / "logs" / "billing-service.log")


def test_build_logging_uses_json_on_console_outside_debug(tmp_path):
    config = build_logging(tmp_path, "some-service", debug=False)

    assert config["handlers"]["console"]["formatter"] == "json"
    assert config["root"]["level"] == "INFO"


def test_build_logging_uses_a_human_console_formatter_in_debug(tmp_path):
    config = build_logging(tmp_path, "some-service", debug=True)

    assert config["handlers"]["console"]["formatter"] == "console"
    assert config["root"]["level"] == "DEBUG"


def test_build_logging_keeps_existing_loggers_alive(tmp_path):
    # Without disable_existing_loggers=False, applying this dict would tear
    # down every logger Django's own DEFAULT_LOGGING and axes had already
    # configured (runserver's access log, axes' lockout logger, ...).
    config = build_logging(tmp_path, "some-service", debug=False)

    assert config["disable_existing_loggers"] is False


def test_build_logging_redirects_djangos_own_request_logger_to_real_handlers(tmp_path):
    # django.request is where an unhandled view exception is logged. Under
    # DEBUG=False, Django's own DEFAULT_LOGGING points it at mail_admins,
    # which silently does nothing when ADMINS is unset (it is, everywhere in
    # this project) -- this asserts the override actually replaces that.
    config = build_logging(tmp_path, "some-service", debug=False)

    assert config["loggers"]["django"]["handlers"] == ["console", "file"]
    assert config["loggers"]["django"]["propagate"] is False


def test_build_logging_silences_noisy_third_party_debug_chatter(tmp_path):
    config = build_logging(tmp_path, "some-service", debug=True)

    assert config["loggers"]["django.db.backends"]["level"] == "INFO"
