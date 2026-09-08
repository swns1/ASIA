import re

from django.db import DatabaseError, connection

from shared.audit import BaseAuditLogMiddleware, user_from_token

MODULE_LABELS = {
    "students": "Students",
    "ocr": "Document Scan",
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
    "application-invites": "Application Invites",
    "student-applications": "Student Applications",
    "apply": "Student Applications",
}

RECORD_LABELS = {
    "students": "student record",
    "ocr": "document scan",
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
    "application-invites": "application invite",
    "student-applications": "student application",
    "apply": "student application",
}

SPECIAL_ACTIONS = {
    ("payments", "POST"): ("Recorded payment", "Payment was recorded successfully.", "Payment could not be recorded. Please review the payment details."),
    ("send-enrollment-email", "POST"): ("Sent enrollment email", "Enrollment email was sent successfully.", "Enrollment email could not be sent. Please review the student's email address."),
    ("enrollment-scholarships", "POST"): ("Awarded scholarship", "Scholarship was awarded successfully.", "Scholarship could not be awarded. Please review the scholarship details."),
    ("score-entries", "POST"): ("Added score entry", "Score entry was added successfully.", "Score entry could not be added. Please review the grade details."),
    ("application-invites", "POST"): ("Issued application invite", "Application invite was issued successfully.", "Application invite could not be issued."),
    ("student-applications", "POST"): ("Reviewed student application", "Student application was updated successfully.", "Student application could not be updated."),
    ("apply", "POST"): ("Submitted student application", "Application was received.", "Application could not be received. Please review the submitted details."),
    ("apply", "PATCH"): ("Saved student application draft", "Draft was saved.", "Draft could not be saved."),
}

_APPLY_INVITE_ID_RE = re.compile(r"^/api/apply/([0-9a-fA-F-]{36})/")


class AuditLogMiddleware(BaseAuditLogMiddleware):
    module_labels = MODULE_LABELS
    record_labels = RECORD_LABELS
    special_actions = SPECIAL_ACTIONS

    # /submit/, /approve/ and /reject/ all live under the same ("apply" or
    # "student-applications", "POST") key, so the base class's single
    # SPECIAL_ACTIONS entry per key can't distinguish them. Mirrors the base
    # class's own "/bulk-create" path-suffix special case.
    def action_label(self, request):
        if "/approve/" in request.path:
            return "Approved student application"
        if "/reject/" in request.path:
            return "Rejected student application"
        if "/claim/" in request.path:
            return "Claimed student application"
        return super().action_label(request)

    def detail_message(self, request, response):
        success = response.status_code < 400
        if "/approve/" in request.path:
            return ("Application was approved and the student record was created."
                    if success else "Application could not be approved. Please review the submitted details.")
        if "/reject/" in request.path:
            return ("Application was rejected." if success
                    else "Application could not be rejected. A reason is required.")
        if "/claim/" in request.path:
            return ("Application was claimed for review." if success
                    else "Application could not be claimed.")
        return super().detail_message(request, response)

    def identify_user(self, request):
        """Falls back to the invite's issuing staff member for the public
        /api/apply/<invite_id>/... requests, which carry no Authorization
        header at all (see intake/views.py's module docstring on why that's
        deliberate). Without this override, every applicant submission
        would log as user_id=NULL / "Unknown user" — indistinguishable from
        genuinely anonymous traffic, which defeats the traceability that is
        half the reason invites are staff-issued in the first place."""
        user_id, user_name, user_role = user_from_token(request)
        if user_id is not None:
            return user_id, user_name, user_role

        match = _APPLY_INVITE_ID_RE.match(request.path)
        if not match:
            return user_id, user_name, user_role

        from intake.models import ApplicationInvite

        try:
            invite = ApplicationInvite.objects.only("issued_by_user_id").get(pk=match.group(1))
        except (ApplicationInvite.DoesNotExist, ValueError):
            return user_id, user_name, user_role

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT name, role FROM users WHERE user_id = %s", [invite.issued_by_user_id])
                row = cursor.fetchone()
        except DatabaseError:
            return invite.issued_by_user_id, f"User #{invite.issued_by_user_id}", "unknown"

        if not row:
            return invite.issued_by_user_id, f"User #{invite.issued_by_user_id}", "unknown"
        name = row[0] or f"User #{invite.issued_by_user_id}"
        return invite.issued_by_user_id, f"{name} (issued this application link)", row[1] or "unknown"
