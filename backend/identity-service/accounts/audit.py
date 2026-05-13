from django.db import DatabaseError
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from .models import AuditLog, User

ADMIN_ROLES = {"admin", "super_admin", "superadmin"}


def normalize_role(role):
    return str(role or "").strip().lower()


def is_audit_admin(user):
    return bool(user and normalize_role(getattr(user, "role", "")) in ADMIN_ROLES)


def get_client_ip(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


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
        return User.objects.filter(user_id=user_id).first()
    except DatabaseError:
        return None


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
            user_name=user_name or getattr(user, "name", None) or "Unknown user",
            user_role=user_role or getattr(user, "role", None) or "unknown",
            action=action,
            module=module,
            occurred_at=timezone.now(),
            status=status,
            details=details or "",
            ip_address=get_client_ip(request),
            metadata=metadata or {},
        )
    except DatabaseError:
        pass