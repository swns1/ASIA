import logging

from django.db import DatabaseError
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from shared.audit import client_ip as get_client_ip
from .models import AuditLog, User

logger = logging.getLogger(__name__)

ADMIN_ROLES = {"admin", "super_admin", "superadmin"}


def normalize_role(role):
    return str(role or "").strip().lower()


def is_audit_admin(user):
    return bool(user and normalize_role(getattr(user, "role", "")) in ADMIN_ROLES)


# `admin` and `super_admin` are distinct roles, but is_audit_admin() treats
# them identically -- which is correct for "may see the audit trail" and wrong
# for "may edit this account". Without a rank, a plain admin could set the
# super_admin's password (no current-password check applies when editing
# someone else), log in as them, promote themselves, or delete the account
# outright. Anything that targets or grants super_admin goes through this.
SUPER_ADMIN_ROLES = {"super_admin", "superadmin"}


def is_super_admin(user):
    return bool(user and normalize_role(getattr(user, "role", "")) in SUPER_ADMIN_ROLES)


def resolve_user_from_request(request):
    auth_header = request.META.get("HTTP_AUTHORIZATION", "")
    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None

    try:
        access = AccessToken(token)
        user_id = access.get("user_id")
    except Exception:
        return None

    if not user_id:
        return None

    try:
        user = User.objects.filter(user_id=user_id).first()
    except DatabaseError:
        return None

    if not user:
        return None

    # Deactivating clears current_session_id, so the sid check below already
    # refuses the account's old tokens; this holds even if that clear is ever
    # skipped.
    if not getattr(user, "is_active", True):
        return None

    # Single-active-session enforcement: a token whose sid claim doesn't
    # match the user's current session is stale (superseded by a later
    # login elsewhere) — treat it as unauthenticated rather than resolving
    # it. Missing sid on either side fails closed (forces re-login), which
    # also covers tokens issued before this claim existed.
    sid = access.get("sid")
    if not sid or not user.current_session_id or str(user.current_session_id) != str(sid):
        return None

    return user


def _clip(value, field):
    limit = AuditLog._meta.get_field(field).max_length
    text = str(value)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def record_audit_event(
    request,
    *,
    user=None,
    user_name=None,
    user_role=None,
    action,
    module,
    status="success",
    details="",
    metadata=None,
):
    try:
        user = user or resolve_user_from_request(request)
        AuditLog.objects.create(
            user_id=getattr(user, "user_id", None),
            # Clipped to the column widths. A failed sign-in records whatever
            # was typed as the identifier, and a 200-character one used to
            # overflow user_name -- the insert failed, the except below
            # swallowed it, and the attempt never reached the audit trail.
            user_name=_clip(user_name or getattr(user, "name", None) or "Unknown user", "user_name"),
            user_role=_clip(user_role or getattr(user, "role", None) or "unknown", "user_role"),
            action=_clip(action, "action"),
            module=_clip(module, "module"),
            occurred_at=timezone.now(),
            status=_clip(status, "status"),
            details=details or "",
            ip_address=get_client_ip(request),
            metadata=metadata or {},
        )
    except DatabaseError:
        # A dropped audit row must not take the request down (the actual
        # mutation already succeeded), but silence here means a schema
        # drift or full disk loses every audit entry with zero signal --
        # log it so it's at least visible to whoever's watching the
        # process, even before real log aggregation exists (see README).
        logger.exception(
            "Failed to write audit log entry: action=%r module=%r", action, module
        )