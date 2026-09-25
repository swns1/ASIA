"""
Shared DRF exception handler — the generic fallback for "the unexpected
happened" across every service. DRF's own exception_handler already returns
a clean response for anything it recognizes (APIException, Http404,
PermissionDenied, etc.); this only steps in for what that returns None for —
an unhandled exception (a DB error, a bug) that would otherwise reach
Django's DEBUG=True HTML error page instead of JSON.
"""
import logging

from django.core.exceptions import RequestDataTooBig
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from shared.request_id import current_request_id

logger = logging.getLogger(__name__)


def safe_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None:
        return response

    # A body over DATA_UPLOAD_MAX_MEMORY_SIZE is the client's doing, not a
    # server fault. DRF doesn't recognise Django's exception for it, so it
    # used to fall through to the 500 below -- "Something went wrong on our
    # end" for a photo that was simply too big.
    if isinstance(exc, RequestDataTooBig):
        return Response(
            {"detail": "This request is too large. If you attached a file, choose a smaller one."},
            status=413,
        )

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
