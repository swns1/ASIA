"""
All models in this app are `managed = False`. Schema lives in pgAdmin /
the SLIS SQL file. Django will never alter these tables.
"""
from django.db import models


# ─── unmanaged Student reference ────────────────────────────────────────────
class Student(models.Model):
    """
    Read-only mirror of the `students` table from student-service.
    Includes the new `updated_at` column you added.
    """

    student_id = models.BigAutoField(primary_key=True)
    student_number = models.CharField(max_length=30, unique=True)
    lrn = models.CharField(max_length=20, unique=True)

    first_name = models.CharField(max_length=50)
    middle_name = models.CharField(max_length=50, null=True, blank=True)
    last_name = models.CharField(max_length=50)
    suffix = models.CharField(max_length=10, null=True, blank=True)

    sex = models.CharField(max_length=10)
    birth_date = models.DateField()

    email = models.EmailField(max_length=150, null=True, blank=True)
    mobile_number = models.CharField(max_length=20, null=True, blank=True)

    status = models.CharField(max_length=20, default="active")

    current_address = models.TextField()

    # Nullable FK to households, carried as a plain id (this service doesn't
    # model the households table). Students sharing one are siblings -- that is
    # how this system records the relationship, rather than in the
    # `student_siblings` table, which models the same thing a second way and
    # is unused. Read by accounts/guardian_provisioning.py so one parent's
    # portal account covers all of their enrolled children.
    household_id = models.BigIntegerField(null=True, blank=True)

    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "students"

    def __str__(self):  # pragma: no cover
        return f"{self.last_name}, {self.first_name} ({self.lrn})"


# ─── Enrollment ─────────────────────────────────────────────────────────────
class Enrollment(models.Model):

    SCHOOL_LEVEL_CHOICES = [
        ("nursery",           "Nursery"),
        ("kindergarten",      "Kindergarten"),
        ("elementary",        "Elementary"),
        ("junior_highschool", "Junior High School"),
        ("senior_highschool", "Senior High School"),
    ]

    SEMESTER_CHOICES = [
        ("1st", "1st Semester"),
        ("2nd", "2nd Semester"),
    ]

    STATUS_CHOICES = [
        ("enrolled",        "Enrolled"),
        ("pending",         "Pending"),
        ("cancelled",       "Cancelled"),
        ("completed",       "Completed"),
        ("transferred_out", "Transferred Out"),
    ]

    enrollment_id = models.BigAutoField(primary_key=True)

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        db_column="student_id",
        related_name="enrollments",
    )

    school_year  = models.CharField(max_length=20)
    school_level = models.CharField(max_length=20, choices=SCHOOL_LEVEL_CHOICES)
    grade_level  = models.CharField(max_length=20)
    section      = models.CharField(max_length=50)
    strand       = models.CharField(max_length=50, null=True, blank=True)
    semester     = models.CharField(max_length=20, null=True, blank=True, choices=SEMESTER_CHOICES)

    enrollment_status = models.CharField(
        max_length=20, default="enrolled", choices=STATUS_CHOICES,
    )

    class Meta:
        managed = False
        db_table = "enrollments"
        ordering = ["-enrollment_id"]

    def __str__(self):  # pragma: no cover
        return f"#{self.enrollment_id} · student={self.student_id} · SY {self.school_year}"


# ─── Enrollment Override audit ───────────────────────────────────────────────
class EnrollmentOverride(models.Model):
    """
    Audit record created whenever a staff member bypasses grade progression or
    subject-completion rules via progression_override=true.
    """

    enrollment_override_id = models.BigAutoField(primary_key=True)
    enrollment = models.OneToOneField(
        Enrollment,
        on_delete=models.CASCADE,
        db_column="enrollment_id",
        related_name="override",
    )
    override_reason = models.TextField()
    overridden_by = models.IntegerField()   # user_id from identity-service JWT
    overridden_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = "enrollment_overrides"

    def __str__(self):  # pragma: no cover
        return f"Override for enrollment #{self.enrollment_id} by user #{self.overridden_by}"


# ─── Teacher advisory assignment ─────────────────────────────────────────────
class SectionAdvisory(models.Model):
    """
    Assigns a teacher (identity-service user_id) as adviser of a section for a
    school year — the basis for scoping a teacher's grade/attendance/narrative
    report access to only the students in their own section(s). New data
    genuinely owned by enrollment-service, so unlike most models in this file
    this one IS Django-managed (real migrations).
    """

    advisory_id = models.BigAutoField(primary_key=True)

    teacher_user_id = models.BigIntegerField(db_index=True)  # user_id from identity-service JWT

    school_year  = models.CharField(max_length=20)
    school_level = models.CharField(max_length=20, choices=Enrollment.SCHOOL_LEVEL_CHOICES)
    grade_level  = models.CharField(max_length=20)
    section      = models.CharField(max_length=50)
    strand       = models.CharField(max_length=50, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = True
        db_table = "section_advisories"
        unique_together = (
            ("teacher_user_id", "school_year", "school_level", "grade_level", "section", "strand"),
        )

    def __str__(self):  # pragma: no cover
        return f"Teacher #{self.teacher_user_id} → {self.school_year} {self.grade_level}-{self.section}"


# ─── Transfer audit log ───────────────────────────────────────────────────────
class EnrollmentTransfer(models.Model):
    """
    Append-only audit log covering all three mid-year transfer scenarios:
    a student leaving SLIS (transfer_out), a student arriving mid-year from
    another school (transfer_in), and a currently-enrolled student changing
    grade/section/strand within SLIS (internal_move).

    Distinct from EnrollmentOverride, which upserts a single row per
    enrollment and is scoped only to progression-rule bypasses — this table
    keeps a full chronological history instead, since a single enrollment can
    reasonably accumulate more than one transfer/move event over its life.
    New data genuinely owned by enrollment-service, so like SectionAdvisory
    this one IS Django-managed (real migration).
    """

    TRANSFER_TYPE_CHOICES = [
        ("transfer_out",  "Transfer Out"),
        ("transfer_in",   "Transfer In"),
        ("internal_move", "Internal Move"),
    ]

    transfer_id = models.BigAutoField(primary_key=True)

    enrollment = models.ForeignKey(
        Enrollment,
        on_delete=models.CASCADE,
        db_column="enrollment_id",
        related_name="transfers",
    )

    transfer_type  = models.CharField(max_length=20, choices=TRANSFER_TYPE_CHOICES)
    effective_date = models.DateField()
    reason         = models.TextField(blank=True)

    # Snapshot of placement at the moment of the event — survives later edits
    # to the enrollment row itself.
    from_grade_level = models.CharField(max_length=20, null=True, blank=True)
    from_section     = models.CharField(max_length=50, null=True, blank=True)
    from_strand      = models.CharField(max_length=50, null=True, blank=True)
    to_grade_level   = models.CharField(max_length=20, null=True, blank=True)
    to_section       = models.CharField(max_length=50, null=True, blank=True)
    to_strand        = models.CharField(max_length=50, null=True, blank=True)

    # transfer_out only: where the student is going.
    destination_school_name = models.CharField(max_length=150, null=True, blank=True)
    # transfer_in only: where the student came from (mirrors student-service's
    # PreviousSchool, kept here too since that table isn't owned by this service).
    origin_school_name      = models.CharField(max_length=150, null=True, blank=True)

    initiated_by = models.IntegerField()  # user_id from identity-service JWT
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = True
        db_table = "enrollment_transfers"
        ordering = ["-created_at"]

    def __str__(self):  # pragma: no cover
        return f"{self.get_transfer_type_display()} · enrollment #{self.enrollment_id} · {self.effective_date}"


# ─── Guardian's answer to "returning next school year?" ─────────────────────
class GuardianResponse(models.Model):
    """
    A guardian's answer on a continuing learner's next-year `pending` row --
    the only thing the guardian portal writes.

    Guardians do not enroll. Promote (or the registrar) creates the pending
    row, and the registrar activates it through the document gate or cancels
    it; this only tells them which way the family is leaning. It never changes
    the enrollment's status, so "not returning" is a prompt to follow up, not
    a withdrawal.

    One row per enrollment, overwritten while the enrollment is still pending
    so a guardian can change their mind. New data owned by enrollment-service,
    so -- like EnrollmentTransfer -- Django-managed with a real migration.
    """

    RESPONSE_CHOICES = [
        ("returning",     "Returning"),
        ("not_returning", "Not returning"),
    ]

    guardian_response_id = models.BigAutoField(primary_key=True)

    enrollment = models.OneToOneField(
        Enrollment,
        on_delete=models.CASCADE,
        db_column="enrollment_id",
        related_name="guardian_response",
    )

    response = models.CharField(max_length=20, choices=RESPONSE_CHOICES)
    reason = models.TextField(blank=True)

    responded_by = models.IntegerField()  # user_id from identity-service JWT
    responded_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = True
        db_table = "guardian_responses"

    def __str__(self):  # pragma: no cover
        return f"{self.get_response_display()} · enrollment #{self.enrollment_id}"


# ─── Email delivery failure record ───────────────────────────────────────────
class EmailDeliveryFailure(models.Model):
    """
    Written whenever an outbound email exhausts its retries (see
    email_views.py). There's only one outbound mail path (SMTP) in this
    codebase and no task queue to retry through later, so this is the
    fallback for "the send failed": instead of the error vanishing into an
    HTTP response nobody reads, it's durable in this table so a failed
    enrollment confirmation can be noticed and resent by hand. The registrar
    also sees the failure at the moment it happens (the form reports it).
    """

    email_delivery_failure_id = models.BigAutoField(primary_key=True)

    to_email = models.EmailField(max_length=150)
    subject = models.CharField(max_length=200)
    # e.g. {"enrollment_id": 123} — enough to identify what triggered the
    # send without a hard FK, since the trigger type may vary later.
    context = models.JSONField(default=dict, blank=True)
    error_message = models.TextField()

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = True
        db_table = "email_delivery_failures"
        ordering = ["-created_at"]

    def __str__(self):  # pragma: no cover
        return f"Failed email to {self.to_email} · {self.created_at:%Y-%m-%d %H:%M}"
