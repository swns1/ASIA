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

RECORD_LABELS = {
    "students": "student record",
    "households": "household record",
    "guardians": "guardian record",
    "student_siblings": "student sibling record",
    "siblings": "sibling record",
    "previous_schools": "previous school record",
    "requirement_types": "requirement type",
    "student_requirement_submissions": "student requirement submission",
    "enrollments": "enrollment record",
    "subjects": "subject",
    "grades": "grade record",
    "grading-templates": "grading template",
    "grading-components": "grading component",
    "score-entries": "score entry",
    "scholarship-types": "scholarship type",
    "enrollment-scholarships": "scholarship award",
    "school-settings": "school settings",
    "fee-schedules": "fee schedule",
    "fee-schedule-items": "fee schedule item",
    "discount-types": "discount type",
    "invoices": "invoice",
    "payments": "payment",
}

PLURAL_RECORDS = {"school-settings"}

METHOD_WORDS = {
    "POST": ("Created", "created", "create"),
    "PUT": ("Updated", "updated", "update"),
    "PATCH": ("Updated", "updated", "update"),
    "DELETE": ("Deleted", "deleted", "delete"),
}

SPECIAL_ACTIONS = {
    ("payments", "POST"): ("Recorded payment", "Payment was recorded successfully.", "Payment could not be recorded. Please review the payment details."),
    ("send-enrollment-email", "POST"): ("Sent enrollment email", "Enrollment email was sent successfully.", "Enrollment email could not be sent. Please review the student's email address."),
    ("enrollment-scholarships", "POST"): ("Awarded scholarship", "Scholarship was awarded successfully.", "Scholarship could not be awarded. Please review the scholarship details."),
    ("score-entries", "POST"): ("Added score entry", "Score entry was added successfully.", "Score entry could not be added. Please review the grade details."),
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


def is_invoice_generate(request):
    normalized_path = request.path.strip("/")
    return normalized_path.endswith("invoices/generate/") or normalized_path.endswith("invoices/generate")


def module_label(request):
    key = path_key(request)
    return MODULE_LABELS.get(key, key.replace("-", " ").replace("_", " ").title())


def sentence_case(value):
    return value[:1].upper() + value[1:]


def action_label(request):
    key = path_key(request)

    if is_invoice_generate(request):
        return "Generated invoice"
    if key == "students" and "/bulk-create" in request.path:
        return "Saved student information"

    special = SPECIAL_ACTIONS.get((key, request.method))
    if special:
        return special[0]

    title_verb = METHOD_WORDS.get(request.method, ("Changed", "changed", "change"))[0]
    subject = RECORD_LABELS.get(key, f"{module_label(request).lower()} record")
    return f"{title_verb} {subject}"


def detail_message(request, response):
    key = path_key(request)
    success = response.status_code < 400

    if is_invoice_generate(request):
        if success:
            return "Invoice was generated successfully."
        return "Invoice could not be generated. Please review the enrollment and payment plan."
    if key == "students" and "/bulk-create" in request.path:
        if success:
            return "Student information was saved successfully."
        return "Student information could not be saved. Please review the student details."

    special = SPECIAL_ACTIONS.get((key, request.method))
    if special:
        return special[1] if success else special[2]

    _, past_tense, base_verb = METHOD_WORDS.get(request.method, ("Changed", "changed", "change"))
    subject = RECORD_LABELS.get(key, f"{module_label(request).lower()} record")
    be_word = "were" if key in PLURAL_RECORDS else "was"
    subject_text = sentence_case(subject)

    if success:
        return f"{subject_text} {be_word} {past_tense} successfully."
    return f"{subject_text} could not be {base_verb}d. Please review the submitted information."


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
                detail_message(request, response),
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