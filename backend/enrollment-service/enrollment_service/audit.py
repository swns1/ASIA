import json

import jwt
from django.conf import settings
from django.db import DatabaseError, connection
from django.utils import timezone

STATE_CHANGING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

MODULE_LABELS = {
    "students": "Students",
    "households": "Households",
    "guardians": "Guardians",
    "student_siblings": "Student Siblings",
    "siblings": "Siblings",
    "previous_schools": "Previous Schools",
    "requirement_types": "Requirements",
    "student_requirement_submissions": "Requirements",
    "enrollments": "Enrollments",
    "send-enrollment-email": "Enrollment Email",
    "subjects": "Subjects",
    "grades": "Grades",
    "grading-templates": "Grading Templates",
    "grading-components": "Grading Components",
    "score-entries": "Grades",
    "scholarship-types": "Scholarship Types",
    "enrollment-scholarships": "Scholarships",
    "school-settings": "School Settings",
    "fee-schedules": "Fee Schedules",
    "fee-schedule-items": "Fee Schedule Items",
    "discount-types": "Discount Types",
    "invoices": "Invoices",
    "payments": "Payments",
    "installments": "Installments",
}


def client_ip(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def path_key(request):
    parts = [part for part in request.path.strip("/").split("/") if part]
    if parts and parts[0] == "api":
        return parts[1] if len(parts) > 1 else "api"
    return parts[0] if parts else "system"


def module_label(request):
    return MODULE_LABELS.get(path_key(request), path_key(request).replace("-", " ").replace("_", " ").title())


def action_label(request):
    key = path_key(request)
    normalized_path = request.path.strip("/")

    if key == "payments" and request.method == "POST":
        return "Recorded payment"
    if normalized_path.endswith("invoices/generate/") or normalized_path.endswith("invoices/generate"):
        return "Generated invoice"
    if key == "send-enrollment-email" and request.method == "POST":
        return "Sent enrollment email"

    verb = {
        "POST": "Created",
        "PUT": "Updated",
        "PATCH": "Updated",
        "DELETE": "Deleted",
    }.get(request.method, "Changed")
    return f"{verb} {module_label(request)} record"


def user_from_token(request):
    auth_header = request.META.get("HTTP_AUTHORIZATION", "")
    if not auth_header.startswith("Bearer "):
        return None, "Unknown user", "unknown"

    token = auth_header.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get(settings.SIMPLE_JWT.get("USER_ID_FIELD", "user_id")) or payload.get("user_id")
    except jwt.InvalidTokenError:
        return None, "Unknown user", "unknown"

    if not user_id:
        return None, "Unknown user", "unknown"

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT name, role FROM users WHERE user_id = %s", [user_id])
            row = cursor.fetchone()
    except DatabaseError:
        return user_id, f"User #{user_id}", "unknown"

    if not row:
        return user_id, f"User #{user_id}", "unknown"
    return user_id, row[0] or f"User #{user_id}", row[1] or "unknown"


def insert_audit_log(request, response):
    user_id, user_name, user_role = user_from_token(request)
    status_value = "success" if response.status_code < 400 else "failed"
    metadata = {
        "method": request.method,
        "path": request.path,
        "query_string": request.META.get("QUERY_STRING", ""),
        "status_code": response.status_code,
    }

    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO audit_logs
                (user_id, user_name, user_role, action, module, occurred_at, status, details, ip_address, metadata)
            VALUES
                (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            [
                user_id,
                user_name,
                user_role,
                action_label(request),
                module_label(request),
                timezone.now(),
                status_value,
                f"{request.method} {request.path} returned HTTP {response.status_code}.",
                client_ip(request),
                json.dumps(metadata),
            ],
        )


class AuditLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        if request.method in STATE_CHANGING_METHODS and request.path.startswith("/api/"):
            try:
                insert_audit_log(request, response)
            except DatabaseError:
                pass

        return response