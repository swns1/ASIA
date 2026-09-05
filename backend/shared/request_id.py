"""
Request correlation IDs — one per request, attached to every log line that
request produces, and echoed back as a response header.

Before this, a user's "it broke" report (a screenshot, a timestamp) had no
way to become a specific log line: four services, no shared trace, and — see
shared/logging_config.py — nothing was actually written down durably either.
With this middleware first in MIDDLEWARE in all four services, a single ID
threads through everything that request touches, including a later failure
logged by BaseAuditLogMiddleware itself (shared/audit.py) or by
shared.exception_handler.safe_exception_handler, which also returns it in the
500 body so a user can hand it to support without opening dev tools.

A contextvar rather than a thread-local: Django's WSGI handler pins one
request to one thread at a time, so either would work under WSGI, but a
contextvar is also correct if any of these services ever moves to ASGI
(where one thread interleaves several requests' coroutines) — same cost,
strictly more correct.
"""
import logging
import re
import uuid
from contextvars import ContextVar

_current_request_id: ContextVar[str] = ContextVar("current_request_id", default="-")

REQUEST_ID_HEADER = "X-Request-ID"
_META_KEY = "HTTP_" + REQUEST_ID_HEADER.upper().replace("-", "_")

# Deliberately UUID-shaped only. No reverse proxy or gateway sits in front of
# these services today (see README), but if one ever does, honoring an
# inbound X-Request-ID lets its access log correlate with ours without a code
# change here. The header rides in on an unauthenticated request, though, and
# whatever it holds flows straight into every log line for this request — an
# arbitrary client-supplied string would let a caller inject newlines or
# control characters into the log stream (log forging) or just pollute it
# with junk. A UUID is wide enough to be a useful key and narrow enough to
# rule that out.
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def current_request_id() -> str:
    """The active request's ID, or "-" outside of any request context (a
    management command, a test that doesn't go through the middleware)."""
    return _current_request_id.get()


class RequestIDLogFilter:
    """Attaches the current request ID to every LogRecord as `.request_id`,
    so a formatter can include it (see shared/logging_config.py) without
    every call site passing it explicitly. Registered on handlers via
    LOGGING["filters"]."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = current_request_id()
        return True


class RequestIDMiddleware:
    """First in MIDDLEWARE in all four services — so every line any later
    middleware, view, or exception handler logs for this request carries its
    ID, including code that runs after an exception (safe_exception_handler)
    or after the view has already responded (BaseAuditLogMiddleware)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        inbound = request.META.get(_META_KEY, "")
        request_id = inbound if _UUID_RE.match(inbound) else str(uuid.uuid4())

        request.request_id = request_id  # available to views/serializers directly
        token = _current_request_id.set(request_id)
        try:
            response = self.get_response(request)
        finally:
            # Reset rather than leave set: a thread that runs any code
            # outside of a request between two requests (rare under WSGI,
            # routine once anything here moves async) would otherwise keep
            # logging the previous request's ID indefinitely.
            _current_request_id.reset(token)

        response[REQUEST_ID_HEADER] = request_id
        return response
