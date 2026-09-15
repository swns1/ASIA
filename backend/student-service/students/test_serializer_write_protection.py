"""
Regression tests for two fields that must never be client-writable
(QA audit findings).

Both were consequences of `fields = "__all__"` on a model carrying a field
that means something to the authorization or compliance layer, and neither had
any test holding them down.

1. StudentRequirementSubmission.is_submitted
   This table is served by TWO serializers in two services -- this one and
   enrollment-service/requirements/serializers.py -- and only the other copy
   marked the status fields read-only. So a client could POST
   {"student": N, "requirement_type": M, "is_submitted": true} here with no
   file attached and satisfy the enrollment completeness gate, which tests
   is_submitted alone. The document requirement was defeatable by asking the
   other port.

2. Guardian.user_id
   The single key guardian-portal scoping uses: guardian_student_ids() in
   enrollment-, billing- and student-service all resolve a login account to
   the students it may see through guardians.user_id. Writable, it let anyone
   with guardian write access point an arbitrary account at an arbitrary
   student, handing over that child's grades, attendance, invoices and
   uploaded documents. Linking belongs to guardian_provisioning.py, which
   validates the target.

Asserted against serializer field metadata, so no database is required --
student-service cannot build a test database (see intake/test_invites.py).
"""
from students.serializers import (
    GuardianSerializer,
    StudentRequirementSubmissionSerializer,
)


# ── Requirement submissions ──────────────────────────────────────────────────

def test_is_submitted_is_read_only():
    """The gate's entire meaning rests on this field reflecting a stored file."""
    field = StudentRequirementSubmissionSerializer().fields["is_submitted"]
    assert field.read_only is True


def test_submission_status_fields_are_read_only():
    fields = StudentRequirementSubmissionSerializer().fields
    for name in ("image_url", "submitted_at", "created_at", "updated_at"):
        assert fields[name].read_only is True, f"{name} must not be client-writable"


def test_this_serializer_matches_its_enrollment_service_twin():
    """
    The two copies write the same table; a field locked in one and open in the
    other is the bug this whole file exists for. Only the status fields are
    compared -- the two serializers legitimately differ elsewhere (field
    naming, the student FK vs a bare id).
    """
    fields = StudentRequirementSubmissionSerializer().fields
    must_be_read_only = {
        "is_submitted",
        "image_url",
        "submitted_at",
        "created_at",
        "updated_at",
    }
    open_fields = {n for n in must_be_read_only if not fields[n].read_only}
    assert not open_fields, f"writable here but locked in enrollment-service: {open_fields}"


def test_a_file_is_still_writable():
    """The legitimate path -- upload a document -- must keep working; create()
    is what sets is_submitted, off the back of a validated file."""
    field = StudentRequirementSubmissionSerializer().fields["file"]
    assert field.write_only is True
    assert field.read_only is False


# ── Guardians ────────────────────────────────────────────────────────────────

def test_guardian_user_id_is_read_only():
    field = GuardianSerializer().fields["user_id"]
    assert field.read_only is True


def test_guardian_contact_fields_are_still_editable():
    """Read-only must apply to the account link alone -- registrars still need
    to correct names, numbers and the primary-contact flag."""
    fields = GuardianSerializer().fields
    for name in ("full_name", "mobile_number", "is_primary_contact"):
        assert fields[name].read_only is False, f"{name} should remain editable"
