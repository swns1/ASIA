"""
Applicant-facing serializers for the student information form, and the
field allowlists that make it safe to eventually feed this payload into
students.serializers.BulkStudentSerializer / BulkGuardianSerializer.

SECURITY — read before touching this file: BulkStudentSerializer and
BulkGuardianSerializer (students/serializers.py) are built with `exclude`,
not `fields`. That is fine when the only caller is a staff member through
the counter form, but exclude-based serializers silently accept ANY field
the model has that isn't in the exclude list — including
Student.student_number (server-generates only `if not self.student_number`,
so a client-supplied one wins), Student.status, and Guardian.user_id (which
links a guardian contact record to a `role=guardian` LOGIN ACCOUNT).

Everything below therefore uses an explicit `fields = (...)` allowlist, and
the same field-name sets are re-exported for intake/services.py to use a
second time when it re-derives an approve-time payload from
`payload_json` — because that JSON is part public-submitted, part
registrar-edited, and neither half should be trusted to have stayed within
these bounds by construction alone.
"""
from rest_framework import serializers

from students.models import Guardian, Household, Sibling, PreviousSchool, Student
from students.serializers import require_a_guardian
from students.validators import blank_to_none, validate_lrn_format


# ── Re-derivable allowlists (used again in intake/services.py at approve time) ──

ALLOWED_STUDENT_FIELDS = frozenset({
    "lrn", "first_name", "middle_name", "last_name", "suffix",
    "age", "sex", "religion", "birth_date", "email", "mobile_number",
    "current_address", "permanent_address",
})
ALLOWED_HOUSEHOLD_FIELDS = frozenset({
    "parent_marital_status", "living_arrangement", "is_4ps_beneficiary", "four_ps_id",
})
ALLOWED_GUARDIAN_FIELDS = frozenset({
    "relationship", "full_name", "occupation", "email_address",
    "mobile_number", "is_primary_contact",
})
ALLOWED_SIBLING_FIELDS = frozenset({"full_name", "age"})
ALLOWED_PREVIOUS_SCHOOL_FIELDS = frozenset({"school_name", "school_address"})

# What the family says they are enrolling into. Deliberately NOT part of the
# student bundle: none of these are columns on `students`, and _whitelisted_bundle
# never looks at this key, so approving an application can't turn them into
# student data. It is advisory input for the registrar, who creates the real
# Enrollment in enrollment-service afterwards (that table is read-only from
# this service — see accounts/enrollment_mirror.py). `section` is absent on
# purpose: it depends on class sizes, so only the registrar can decide it.
ALLOWED_APPLYING_FOR_FIELDS = frozenset({"school_level", "grade_level", "strand"})


def whitelist(data, allowed_fields):
    """Drops every key not in `allowed_fields`. Never raises — an applicant
    or a stray client key is silently ignored rather than erroring, since
    the whole point is that these keys must never reach the model layer,
    not that submission should fail because of them."""
    if not isinstance(data, dict):
        return {}
    return {k: v for k, v in data.items() if k in allowed_fields}


# ── Submission-time serializers (explicit fields — never `exclude`) ──

class ApplicantStudentSerializer(serializers.ModelSerializer):
    # Overridden to make it optional: the model's own `lrn` has no
    # null=True/blank=True (a real Student row must have one), but a
    # nursery/kindergarten applicant has not been assigned one by DepEd
    # yet — see the plan's decision 7. Absence is resolved by the registrar
    # at approval, not enforced here.
    #
    # Both `lrn` and `email` are also overridden to plain (non-model) fields
    # for a second reason: ModelSerializer auto-attaches a UniqueValidator
    # to any field mapped from a `unique=True` model column, which would
    # run a `Student.objects.filter(...)` query — and reject with a 400 —
    # during is_valid() on this PUBLIC, unauthenticated endpoint. That is
    # precisely the anonymous-enumeration oracle the plan's decision 8
    # deliberately avoids for `lrn` ("does this email/LRN already belong to
    # a student here?", answered for free, no login required) — it would
    # just be an unguarded copy of the same hole on a different field.
    # Duplicate emails are surfaced to the registrar via intake/duplicates.py
    # instead, and only become a real, correctly-blocking uniqueness check
    # at approval time through BulkStudentSerializer (staff-only).
    lrn = serializers.CharField(
        max_length=20, required=False, allow_blank=True, allow_null=True,
        validators=[validate_lrn_format],
    )
    email = serializers.EmailField(max_length=150, required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = Student
        fields = tuple(sorted(ALLOWED_STUDENT_FIELDS))

    def validate_email(self, value):
        # Stored as null, not "": students.email is unique, and a blank string
        # carried through to approval collided with the first student saved
        # without one. See students.validators.BlankEmailAsNullMixin.
        return blank_to_none(value)


class ApplicantHouseholdSerializer(serializers.ModelSerializer):
    class Meta:
        model = Household
        fields = tuple(sorted(ALLOWED_HOUSEHOLD_FIELDS))

    def validate(self, attrs):
        # Mirrors HouseholdSerializer.validate (students/serializers.py) —
        # duplicated rather than imported because that serializer is bound
        # to the staff-facing `fields = "__all__"` shape.
        if attrs.get("four_ps_id") == "":
            attrs["four_ps_id"] = None
        is_4ps = attrs.get("is_4ps_beneficiary", False)
        four_ps_id = attrs.get("four_ps_id")
        if is_4ps and not (four_ps_id and str(four_ps_id).strip()):
            raise serializers.ValidationError("four_ps_id is required when is_4ps_beneficiary is True.")
        if not is_4ps and four_ps_id:
            raise serializers.ValidationError("four_ps_id must be empty when is_4ps_beneficiary is False.")
        return attrs


class ApplicantGuardianSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guardian
        fields = tuple(sorted(ALLOWED_GUARDIAN_FIELDS))


class ApplicantSiblingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sibling
        fields = tuple(sorted(ALLOWED_SIBLING_FIELDS))


class ApplicantPreviousSchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = PreviousSchool
        fields = tuple(sorted(ALLOWED_PREVIOUS_SCHOOL_FIELDS))


class ApplicantSubmissionSerializer(serializers.Serializer):
    """The shape both the draft PATCH and the final submit accept. Matches
    StudentBulkCreateSerializer's top-level shape so intake/services.py can
    approve an application by feeding (a re-whitelisted version of) this
    straight into it."""
    student = ApplicantStudentSerializer()
    household = ApplicantHouseholdSerializer(required=False, allow_null=True)
    guardians = ApplicantGuardianSerializer(many=True, required=False, default=list)
    siblings = ApplicantSiblingSerializer(many=True, required=False, default=list)
    previous_schools = ApplicantPreviousSchoolSerializer(many=True, required=False, default=list)

    def validate_guardians(self, value):
        # Same rule as the counter form: at least one guardian, one primary.
        return require_a_guardian(value)


# ── Staff-facing serializers (issuing invites, reviewing applications) ──
# These are read/managed by authenticated staff only (see intake/views.py's
# permission classes), so they use "__all__"/model-native shapes rather than
# the hand-picked allowlists above -- there is no untrusted-input concern
# here the way there is for the applicant-facing serializers.

from .models import ApplicationInvite, StudentApplication  # noqa: E402 — grouped by audience, not import position


class ApplicationInviteIssueSerializer(serializers.Serializer):
    """Input for POST /api/application-invites/ — what a staff member fills
    in to issue a new invite."""
    applicant_first_name = serializers.CharField(max_length=50)
    applicant_last_name = serializers.CharField(max_length=50)
    # 150 is the column width; without it a longer address passed validation
    # and failed at the database as a 500.
    contact_email = serializers.EmailField(max_length=150, required=False, allow_null=True, allow_blank=True)
    contact_mobile = serializers.CharField(max_length=20, required=False, allow_null=True, allow_blank=True)


class ApplicationInviteSerializer(serializers.ModelSerializer):
    """Read shape for the invite list/detail — never includes
    access_code_hash, and there is no field anywhere that exposes the
    plaintext code after the moment it's issued (see ApplicationInviteViewSet.create)."""
    applicant_full_name = serializers.ReadOnlyField()
    is_usable = serializers.ReadOnlyField()
    is_locked = serializers.ReadOnlyField()
    is_expired = serializers.ReadOnlyField()
    is_revoked = serializers.ReadOnlyField()
    is_consumed = serializers.ReadOnlyField()

    class Meta:
        model = ApplicationInvite
        fields = (
            "invite_id", "applicant_first_name", "applicant_last_name", "applicant_full_name",
            "contact_email", "contact_mobile",
            "issued_by_user_id", "issued_at", "expires_at", "revoked_at",
            "consumed_at", "consumed_by_application_id", "code_attempts",
            "is_usable", "is_locked", "is_expired", "is_revoked", "is_consumed",
        )
        read_only_fields = fields


class StudentApplicationListSerializer(serializers.ModelSerializer):
    """Row shape for the review queue table — light enough to page through
    without pulling every application's full payload_json."""
    reference = serializers.ReadOnlyField()
    invite_issued_by_user_id = serializers.IntegerField(source="invite.issued_by_user_id", read_only=True)

    class Meta:
        model = StudentApplication
        fields = (
            "student_application_id", "reference", "status",
            "first_name", "last_name", "lrn", "birth_date",
            "submitted_at", "decided_at",
            "duplicate_of_student_id",
            "invite_issued_by_user_id",
        )
        read_only_fields = fields


class StudentApplicationDetailSerializer(StudentApplicationListSerializer):
    """Full shape for the review modal — the parent's confirmed payload plus
    provenance, so the same ReviewStep the applicant saw can be rendered
    from it on the staff side."""

    class Meta(StudentApplicationListSerializer.Meta):
        fields = StudentApplicationListSerializer.Meta.fields + (
            "payload_json", "duplicate_matches_json",
            "reviewed_by_user_id", "decided_by_user_id", "decision_note",
            "created_student_id", "created_at", "updated_at",
        )
        read_only_fields = fields


class ApplicationApproveSerializer(serializers.Serializer):
    """Input for POST .../approve/ — overrides merged onto the stored
    payload before it's re-whitelisted and validated (see
    intake/services.py::approve_application). LRN is the one field the
    registrar is structurally required to supply if the applicant didn't —
    students.lrn is NOT NULL at the database level."""
    student = serializers.DictField(required=False)
    household = serializers.DictField(required=False, allow_null=True)
    guardians = serializers.ListField(required=False)
    siblings = serializers.ListField(required=False)
    previous_schools = serializers.ListField(required=False)


class ApplicationRejectSerializer(serializers.Serializer):
    decision_note = serializers.CharField()
