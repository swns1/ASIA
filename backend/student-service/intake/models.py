"""
Self-service student intake: a staff-issued invite lets one named applicant
fill in the student information form themselves (on a front-desk device
handed over, or their own phone via a link), review it, and submit it as a
StudentApplication for a registrar to approve.

Genuinely new data owned by student-service, so — like DocumentExtraction in
students/models.py — this is Django-managed with a real migration, unlike
the managed=False mirrors of the legacy schema.

Nothing here writes to `students`, `households`, `guardians`, `siblings` or
`previous_schools` directly. Submission only ever produces a row in this
app; only an explicit staff approval (intake/services.py::approve_application)
creates the real records, reusing students/services.py::create_student_bundle.
"""
import uuid

from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.db.models import Q
from django.utils import timezone


class ApplicationInvite(models.Model):
    """
    The arming credential. `invite_id` (a UUID, unguessable) is the URL
    segment; `access_code_hash` is the second, separately-delivered factor
    that makes the link alone insufficient. Neither is enough on its own —
    see the module docstring and the plan's decision 3.

    Issued against a *named* applicant a staff member has actually spoken
    to — that human step, not the cryptography, is the real anti-fraud
    control. The code is shown to the issuing staff member exactly once
    (see intake/views.py::ApplicationInviteViewSet.create); it is never
    stored or re-displayed in plaintext, so a lost code means re-issuing,
    not looking it up.
    """

    WALK_IN, REMOTE = "walk_in", "remote"
    MODE_CHOICES = [(WALK_IN, "walk_in"), (REMOTE, "remote")]

    MAX_CODE_ATTEMPTS = 5

    invite_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    access_code_hash = models.CharField(max_length=200)
    code_attempts = models.PositiveSmallIntegerField(default=0)
    locked_at = models.DateTimeField(null=True, blank=True)

    applicant_first_name = models.CharField(max_length=50)
    applicant_last_name = models.CharField(max_length=50)
    contact_email = models.EmailField(max_length=150, null=True, blank=True)
    contact_mobile = models.CharField(max_length=20, null=True, blank=True)

    mode = models.CharField(max_length=10, choices=MODE_CHOICES, default=REMOTE)

    issued_by_user_id = models.BigIntegerField(db_index=True)
    issued_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(db_index=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    # Set only at submit (services.approve invite consumption), not at code
    # entry — that is what lets an applicant close the tab and resume later
    # on the same link/code without the invite already looking "used up".
    consumed_at = models.DateTimeField(null=True, blank=True)
    consumed_by_application_id = models.BigIntegerField(null=True, blank=True)

    class Meta:
        db_table = "application_invites"
        ordering = ["-issued_at"]
        indexes = [
            models.Index(fields=["expires_at"]),
        ]

    @property
    def applicant_full_name(self):
        return f"{self.applicant_first_name} {self.applicant_last_name}".strip()

    @property
    def is_locked(self):
        return self.locked_at is not None

    @property
    def is_expired(self):
        return self.expires_at <= timezone.now()

    @property
    def is_revoked(self):
        return self.revoked_at is not None

    @property
    def is_consumed(self):
        return self.consumed_at is not None

    @property
    def is_usable(self):
        """True only while an applicant could still open this link and make
        progress: not revoked, not expired, not locked out by repeated bad
        codes, and not already turned into a submitted application."""
        return not (self.is_revoked or self.is_expired or self.is_locked or self.is_consumed)

    def set_access_code(self, raw_code):
        self.access_code_hash = make_password(raw_code)

    def check_access_code(self, raw_code):
        """Verifies `raw_code` and records the attempt. Returns True/False;
        never raises. Locks the invite after MAX_CODE_ATTEMPTS consecutive
        failures — call sites must still save() the instance."""
        if self.is_locked:
            return False
        ok = check_password(raw_code, self.access_code_hash)
        if ok:
            self.code_attempts = 0
        else:
            self.code_attempts += 1
            if self.code_attempts >= self.MAX_CODE_ATTEMPTS:
                self.locked_at = timezone.now()
        return ok


class StudentApplication(models.Model):
    """
    One row per applicant submission. `payload_json` carries the full
    student-information-form bundle (student/household/guardians/siblings/
    previous_schools, shaped exactly like StudentBulkCreateSerializer's
    input); the columns above it are deliberately duplicated OUT of that
    JSON so the review queue and duplicate-detection can filter/sort/index
    on them without a JSON scan on every request or on every anonymous
    submit. They are derived server-side from the validated payload at
    submit time — never accepted from the client directly — so the two
    representations cannot disagree.

    `reference` is intentionally a computed property, not a stored column:
    a stored, sequential, human-facing reference would need the same
    MAX()-race handling students.Student._generate_student_number already
    has to work around; deriving it from the (already unique, already
    sequential) primary key sidesteps that entirely.
    """

    DRAFT, SUBMITTED, IN_REVIEW, APPROVED, REJECTED = (
        "draft", "submitted", "in_review", "approved", "rejected",
    )
    STATUS_CHOICES = [
        (DRAFT, "draft"),
        (SUBMITTED, "submitted"),
        (IN_REVIEW, "in_review"),
        (APPROVED, "approved"),
        (REJECTED, "rejected"),
    ]

    student_application_id = models.BigAutoField(primary_key=True)

    invite = models.ForeignKey(
        ApplicationInvite, on_delete=models.CASCADE, related_name="applications",
    )
    submission_uuid = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)

    # ── indexed identity — derived from payload_json server-side, see above ──
    lrn = models.CharField(max_length=20, null=True, blank=True, db_index=True)  # NOT unique here
    first_name = models.CharField(max_length=50, default="")
    last_name = models.CharField(max_length=50, default="", db_index=True)
    birth_date = models.DateField(null=True, blank=True, db_index=True)
    sex = models.CharField(max_length=10, null=True, blank=True)
    contact_email = models.EmailField(max_length=150, null=True, blank=True)
    contact_mobile = models.CharField(max_length=20, null=True, blank=True)

    # {student:{}, household:{}|null, guardians:[], siblings:[],
    #  previous_schools:[], documents:[]}  -- documents is a reserved, always
    # empty seam for v2 (see the plan's decision 6); nothing writes it in v1.
    payload_json = models.JSONField(default=dict, blank=True)

    # Bumped on every autosave; the draft PATCH endpoint uses an atomic
    # conditional UPDATE ... WHERE revision = %s so two tabs autosaving the
    # same draft can't silently clobber each other (see intake/services.py).
    revision = models.PositiveIntegerField(default=0)

    # Advisory only — see intake/duplicates.py. Never blocks a submission.
    duplicate_of_student_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    duplicate_matches_json = models.JSONField(default=list, blank=True)

    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=DRAFT, db_index=True,
    )
    submitted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    reviewed_by_user_id = models.BigIntegerField(null=True, blank=True)
    decided_by_user_id = models.BigIntegerField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(null=True, blank=True)
    created_student_id = models.BigIntegerField(null=True, blank=True, db_index=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "student_applications"
        ordering = ["-submitted_at", "-created_at"]
        indexes = [
            models.Index(fields=["status", "-submitted_at"]),
            models.Index(fields=["last_name", "first_name"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=~Q(status="approved") | Q(created_student_id__isnull=False),
                name="student_application_approved_has_student",
            ),
            models.CheckConstraint(
                condition=~Q(status="rejected") | (~Q(decision_note="") & Q(decision_note__isnull=False)),
                name="student_application_rejected_has_note",
            ),
        ]

    @property
    def reference(self):
        year = (self.submitted_at or self.created_at).year
        return f"APP-{year}-{self.student_application_id:05d}"
