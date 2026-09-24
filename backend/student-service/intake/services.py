"""
State transitions and the approve/reject actions for StudentApplication.

approve_application is the one place a public-influenced payload turns into
real students/households/guardians/siblings/previous_schools rows — see the
module docstring in intake/serializers.py for why every field is
re-whitelisted here even though it was already whitelisted at submit time.
"""
from django.db import connection, transaction
from django.utils import timezone
from rest_framework import serializers

from students.models import PreviousSchool, Sibling
from students.serializers import (
    BulkGuardianSerializer,
    BulkHouseholdSerializer,
    BulkStudentSerializer,
)
from students.services import create_student_bundle

from .models import StudentApplication
from .serializers import (
    ALLOWED_GUARDIAN_FIELDS,
    ALLOWED_HOUSEHOLD_FIELDS,
    ALLOWED_PREVIOUS_SCHOOL_FIELDS,
    ALLOWED_SIBLING_FIELDS,
    ALLOWED_STUDENT_FIELDS,
    whitelist,
)


class InvalidTransition(serializers.ValidationError):
    """Raised for any state change that doesn't make sense given the
    application's current status — a 400, not a 500, since it's the
    caller's request that was invalid, not a server fault."""


# The application lifecycle, in one place.
#
# SUBMITTED -> APPROVED/REJECTED are here because they are what actually
# happens: a registrar opening an application and deciding on it in one sitting
# never passes through IN_REVIEW. The table used to omit those two edges while
# approve_application/reject_application assigned `status` by hand and never
# called transition() at all -- so the declared state machine forbade the
# commonest path in the system and nothing noticed, because nothing enforced
# it. Both functions now route through here, which is what makes this table
# the lifecycle rather than a description of one.
VALID_EDGES = {
    StudentApplication.DRAFT:     {StudentApplication.SUBMITTED},
    StudentApplication.SUBMITTED: {
        StudentApplication.IN_REVIEW,
        StudentApplication.APPROVED,
        StudentApplication.REJECTED,
    },
    StudentApplication.IN_REVIEW: {StudentApplication.APPROVED, StudentApplication.REJECTED},
    StudentApplication.REJECTED:  {StudentApplication.IN_REVIEW},
    # APPROVED is terminal: it has created real student rows.
    StudentApplication.APPROVED:  set(),
}


def can_transition(from_status, to_status):
    """Whether `from_status -> to_status` is a legal edge."""
    return to_status in VALID_EDGES.get(from_status, set())


def transition(application, to_status, *, actor=None):
    """Moves `application` to `to_status`, validating the edge is legal.
    Callers must already hold a row lock (select_for_update) if the
    transition needs to be race-safe — this function only checks legality,
    it doesn't lock."""
    valid_edges = VALID_EDGES
    allowed = valid_edges.get(application.status, set())
    if to_status not in allowed:
        raise InvalidTransition(
            f"Cannot move an application from '{application.status}' to '{to_status}'."
        )
    application.status = to_status
    if to_status == StudentApplication.IN_REVIEW and application.reviewed_by_user_id is None:
        application.reviewed_by_user_id = getattr(actor, "user_id", None) or getattr(actor, "id", None)
    application.save(update_fields=["status", "reviewed_by_user_id", "updated_at"])
    return application


def _whitelisted_bundle(payload):
    """Re-derives a StudentBulkCreateSerializer-shaped dict from
    `payload_json`, dropping any key outside the allowlists regardless of
    whether it originated from the applicant or a registrar's override —
    see intake/serializers.py's module docstring."""
    student = whitelist(payload.get("student"), ALLOWED_STUDENT_FIELDS)
    household_raw = payload.get("household")
    household = whitelist(household_raw, ALLOWED_HOUSEHOLD_FIELDS) if household_raw else None
    guardians = [whitelist(g, ALLOWED_GUARDIAN_FIELDS) for g in payload.get("guardians", [])]
    siblings = [whitelist(s, ALLOWED_SIBLING_FIELDS) for s in payload.get("siblings", [])]
    previous_schools = [
        whitelist(p, ALLOWED_PREVIOUS_SCHOOL_FIELDS) for p in payload.get("previous_schools", [])
    ]
    return student, household, guardians, siblings, previous_schools


def _deep_merge_payload(base, overrides):
    if not overrides:
        return base
    merged = dict(base)
    if "student" in overrides:
        merged["student"] = {**base.get("student", {}), **overrides["student"]}
    if "household" in overrides:
        # Merged field-by-field like `student`, not replaced. Both are single
        # dicts describing one thing, and replacing this one meant a registrar
        # correcting a single household field -- a misspelled barangay, say --
        # silently blanked every other field the applicant had filled in.
        # The lists below stay replace-semantics on purpose: there is no
        # identity to merge rows on, so a partial list can only mean "this is
        # now the list".
        base_household = base.get("household") or {}
        merged["household"] = {**base_household, **(overrides["household"] or {})}
    for key in ("guardians", "siblings", "previous_schools"):
        if key in overrides:
            merged[key] = overrides[key]
    return merged


def approve_application(application_id, *, actor, overrides=None):
    """Creates the real student/household/guardians/siblings/previous_schools
    rows for an application and marks it approved. Idempotent: calling this
    twice on an already-approved application is a no-op that returns the
    same created_student_id rather than creating a second student — see the
    plan's concurrency table ("two registrars approve the same application").

    Returns (application, created: bool). `created=False` means this call
    found the application already approved and did nothing.

    Uses `with transaction.atomic():` rather than the `@transaction.atomic`
    decorator deliberately — matching students/views.py::bulk_create's own
    style. A decorator binds its Atomic instance once, at import time, which
    is not just a style choice here: it's what lets the whole block be
    exercised in this service's tests, which mock `transaction.atomic` at
    call time (see intake/test_approval.py's module docstring on why this
    service's test database can't be built at all).
    """
    with transaction.atomic():
        application = StudentApplication.objects.select_for_update().get(pk=application_id)

        if application.status == StudentApplication.APPROVED:
            return application, False

        if not can_transition(application.status, StudentApplication.APPROVED):
            raise InvalidTransition(
                {"status": f"Cannot approve an application that is '{application.status}'."}
            )

        merged_payload = _deep_merge_payload(application.payload_json, overrides)
        student_data, household_data, guardians_data, siblings_data, schools_data = (
            _whitelisted_bundle(merged_payload)
        )

        student_ser = BulkStudentSerializer(data=student_data)
        student_ser.is_valid(raise_exception=True)
        household_ser = None
        if household_data:
            household_ser = BulkHouseholdSerializer(data=household_data)
            household_ser.is_valid(raise_exception=True)
        guardian_sers = [BulkGuardianSerializer(data=g) for g in guardians_data]
        for gs in guardian_sers:
            gs.is_valid(raise_exception=True)

        validated_bundle = {
            "student": student_ser.validated_data,
            "household": household_ser.validated_data if household_ser else None,
            "guardians": [gs.validated_data for gs in guardian_sers],
        }

        # Serializing this away narrows, but does not close, the window on
        # students.Student._generate_student_number's read-then-write race
        # (it has its own retry loop, but two transactions can both see a
        # number free before either commits). An advisory lock scoped to
        # this one concern serialises concurrent approvals without taking a
        # table lock — see the plan's security item D. hashtext() is
        # deterministic per Postgres session for a given string, so every
        # approve call contends on the same lock id.
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(hashtext('students.student_number'))")

        student, household, guardians = create_student_bundle(validated_bundle)

        Sibling.objects.bulk_create([
            Sibling(student=student, full_name=s["full_name"], age=s.get("age"))
            for s in siblings_data if (s.get("full_name") or "").strip()
        ])
        PreviousSchool.objects.bulk_create([
            PreviousSchool(student=student, school_name=p["school_name"], school_address=p.get("school_address", ""))
            for p in schools_data if (p.get("school_name") or "").strip()
        ])

        application.status = StudentApplication.APPROVED
        application.created_student_id = student.pk
        application.decided_by_user_id = getattr(actor, "user_id", None) or getattr(actor, "id", None)
        application.decided_at = timezone.now()
        application.save(update_fields=["status", "created_student_id", "decided_by_user_id", "decided_at", "updated_at"])


        return application, True


def reject_application(application_id, *, actor, note):
    if not (note or "").strip():
        raise serializers.ValidationError({"decision_note": "A reason is required to reject an application."})

    with transaction.atomic():
        application = StudentApplication.objects.select_for_update().get(pk=application_id)
        if not can_transition(application.status, StudentApplication.REJECTED):
            raise InvalidTransition(
                {"status": f"Cannot reject an application that is '{application.status}'."}
            )

        application.status = StudentApplication.REJECTED
        application.decision_note = note.strip()
        application.decided_by_user_id = getattr(actor, "user_id", None) or getattr(actor, "id", None)
        application.decided_at = timezone.now()
        application.save(update_fields=["status", "decision_note", "decided_by_user_id", "decided_at", "updated_at"])
        return application
