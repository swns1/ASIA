import re

from rest_framework import serializers

from .models import AuditLog, User
from .services.auth_service import find_user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("user_id", "name", "email", "role", "profile_picture")
        read_only_fields = ("user_id",)


MODULE_SUBJECTS = {
    "Students": "student record",
    "Households": "household record",
    "Guardians": "guardian record",
    "Student Siblings": "student sibling record",
    "Siblings": "sibling record",
    "Previous Schools": "previous school record",
    "Requirements": "requirement record",
    "Enrollments": "enrollment record",
    "Enrollment Email": "enrollment email",
    "Subjects": "subject",
    "Grades": "grade record",
    "Grading Templates": "grading template",
    "Grading Components": "grading component",
    "Scholarships": "scholarship award",
    "Scholarship Types": "scholarship type",
    "School Settings": "school settings",
    "Fee Schedules": "fee schedule",
    "Fee Schedule Items": "fee schedule item",
    "Discount Types": "discount type",
    "Invoices": "invoice",
    "Payments": "payment",
}

KEY_SUBJECTS = {
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

METHOD_WORDS = {
    "POST": ("Created", "created", "create"),
    "PUT": ("Updated", "updated", "update"),
    "PATCH": ("Updated", "updated", "update"),
    "DELETE": ("Deleted", "deleted", "delete"),
}

PLURAL_KEYS = {"school-settings"}
TECHNICAL_DETAIL_RE = re.compile(r"^([A-Z]+)\s+(/api/[^\s]+)\s+returned HTTP\s+(\d+)\.?$", re.IGNORECASE)


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()
    password = serializers.CharField(write_only=True)
    remember_me = serializers.BooleanField(default=True)

    def validate(self, attrs):
        identifier = attrs.get("identifier", "").strip()
        password = attrs.get("password", "")

        if not identifier or not password:
            raise serializers.ValidationError("Identifier and password are required.")

        user, error = find_user(identifier, password)
        if error:
            raise serializers.ValidationError(error)

        attrs["user"] = user
        return attrs


def sentence_case(value):
    return value[:1].upper() + value[1:] if value else value


def path_key(path):
    parts = [part for part in str(path or "").strip("/").split("/") if part]
    if parts and parts[0] == "api":
        return parts[1] if len(parts) > 1 else "api"
    return parts[0] if parts else "system"


def request_info(details, metadata):
    metadata = metadata or {}
    method = metadata.get("method")
    path = metadata.get("path")
    status_code = metadata.get("status_code")

    if not method or not path or status_code is None:
        match = TECHNICAL_DETAIL_RE.match(str(details or "").strip())
        if match:
            method = match.group(1)
            path = match.group(2)
            status_code = match.group(3)

    if not method or not path or status_code is None:
        return None

    try:
        status_code = int(status_code)
    except (TypeError, ValueError):
        status_code = 0

    key = path_key(path)
    return {
        "method": str(method).upper(),
        "path": str(path),
        "key": key,
        "success": status_code < 400,
    }


def action_from_info(info):
    key = info["key"]
    method = info["method"]
    path = info["path"]

    if key == "payments" and method == "POST":
        return "Recorded payment"
    if key == "score-entries" and method == "POST":
        return "Added score entry"
    if key == "send-enrollment-email" and method == "POST":
        return "Sent enrollment email"
    if key == "enrollment-scholarships" and method == "POST":
        return "Awarded scholarship"
    if key == "invoices" and "/generate" in path:
        return "Generated invoice"
    if key == "students" and "/bulk-create" in path:
        return "Saved student information"

    title_verb = METHOD_WORDS.get(method, ("Changed", "changed", "change"))[0]
    subject = KEY_SUBJECTS.get(key, f"{key.replace('-', ' ').replace('_', ' ')} record")
    return f"{title_verb} {subject}"


def details_from_info(info):
    key = info["key"]
    method = info["method"]
    path = info["path"]
    success = info["success"]

    if key == "payments" and method == "POST":
        return "Payment was recorded successfully." if success else "Payment could not be recorded. Please review the payment details."
    if key == "score-entries" and method == "POST":
        return "Score entry was added successfully." if success else "Score entry could not be added. Please review the grade details."
    if key == "send-enrollment-email" and method == "POST":
        return "Enrollment email was sent successfully." if success else "Enrollment email could not be sent. Please review the student's email address."
    if key == "enrollment-scholarships" and method == "POST":
        return "Scholarship was awarded successfully." if success else "Scholarship could not be awarded. Please review the scholarship details."
    if key == "invoices" and "/generate" in path:
        return "Invoice was generated successfully." if success else "Invoice could not be generated. Please review the enrollment and payment plan."
    if key == "students" and "/bulk-create" in path:
        return "Student information was saved successfully." if success else "Student information could not be saved. Please review the student details."

    _, past_tense, base_verb = METHOD_WORDS.get(method, ("Changed", "changed", "change"))
    subject = KEY_SUBJECTS.get(key, f"{key.replace('-', ' ').replace('_', ' ')} record")
    be_word = "were" if key in PLURAL_KEYS else "was"

    if success:
        return f"{sentence_case(subject)} {be_word} {past_tense} successfully."
    return f"{sentence_case(subject)} could not be {base_verb}d. Please review the submitted information."


def humanize_action(action, details, metadata, module):
    info = request_info(details, metadata)
    if info:
        return action_from_info(info)

    value = str(action or "").strip()
    match = re.match(r"^(Created|Updated|Deleted|Changed)\s+(.+?)\s+record$", value, re.IGNORECASE)
    if match:
        verb = match.group(1).capitalize()
        subject = MODULE_SUBJECTS.get(module, match.group(2).replace("_", " ").replace("-", " ").lower())
        if verb == "Created" and module == "Scholarships":
            return "Awarded scholarship"
        return f"{verb} {subject}"

    return value or "System activity"


def humanize_details(details, metadata):
    info = request_info(details, metadata)
    if info:
        return details_from_info(info)
    return str(details or "")


class AuditLogSerializer(serializers.ModelSerializer):
    action = serializers.SerializerMethodField()
    details = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = (
            "log_id",
            "user_id",
            "user_name",
            "user_role",
            "action",
            "module",
            "occurred_at",
            "status",
            "details",
            "ip_address",
            "metadata",
        )

    def get_action(self, obj):
        return humanize_action(obj.action, obj.details, obj.metadata, obj.module)

    def get_details(self, obj):
        return humanize_details(obj.details, obj.metadata)