from shared.audit import BaseAuditLogMiddleware

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
}

SPECIAL_ACTIONS = {
    ("payments", "POST"): ("Recorded payment", "Payment was recorded successfully.", "Payment could not be recorded. Please review the payment details."),
    ("send-enrollment-email", "POST"): ("Sent enrollment email", "Enrollment email was sent successfully.", "Enrollment email could not be sent. Please review the student's email address."),
    ("enrollment-scholarships", "POST"): ("Awarded scholarship", "Scholarship was awarded successfully.", "Scholarship could not be awarded. Please review the scholarship details."),
    ("score-entries", "POST"): ("Added score entry", "Score entry was added successfully.", "Score entry could not be added. Please review the grade details."),
}


class AuditLogMiddleware(BaseAuditLogMiddleware):
    module_labels = MODULE_LABELS
    record_labels = RECORD_LABELS
    special_actions = SPECIAL_ACTIONS
