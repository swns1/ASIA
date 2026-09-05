"""
Shared DRF exception handler — the generic fallback for "the unexpected
happened" across every service. DRF's own exception_handler already returns
a clean response for anything it recognizes (APIException, Http404,
PermissionDenied, etc.); this only steps in for what that returns None for —
an unhandled exception (a DB error, a bug) that would otherwise reach
Django's DEBUG=True HTML error page instead of JSON.
"""
import logging

from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from shared.request_id import current_request_id

logger = logging.getLogger(__name__)


def safe_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None:
        return response

    view = context.get("view")
    logger.exception("Unhandled exception in %s", type(view).__name__ if view else "view")
    return Response(
        {
            "detail": "Something went wrong on our end. Please try again.",
            # Lets a user's bug report become "grep this ID" instead of
            # guessing which line, in which of the four services, matches
            # their timestamp — see shared/request_id.py and
            # shared/logging_config.py for where that ID actually lands.
            "request_id": current_request_id(),
        },
        status=500,
    )
