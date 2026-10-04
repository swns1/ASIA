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
from rest_framework.exceptions import NotFound

from students.models import PreviousSchool, Sibling
from students.serializers import (
    BulkGuardianSerializer,
    BulkHouseholdSerializer,
    BulkStudentSerializer,
)
from students.services import create_student_bundle

from . import duplicates
from .models import StudentApplication
from .serializers import (
    ALLOWED_APPLYING_FOR_FIELDS,
    ALLOWED_GUARDIAN_FIELDS,
    ALLOWED_HOUSEHOLD_FIELDS,
    ALLOWED_PREVIOUS_SCHOOL_FIELDS,
    ALLOWED_SIBLING_FIELDS,
    ALLOWED_STUDENT_FIELDS,
    ApplicantSubmissionSerializer,
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


def _locked_application(application_id):
    """The application, row-locked -- or a 404. A missing or malformed id used
    to escape as DoesNotExist/ValueError and answer 500."""
    try:
        return StudentApplication.objects.select_for_update().get(pk=application_id)
    except (StudentApplication.DoesNotExist, ValueError, TypeError):
        raise NotFound("That application doesn't exist.")


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


def _named(row, key):
    return isinstance(row, dict) and bool(str(row.get(key) or "").strip())


def _without_blank_rows(raw_payload):
    """Siblings and previous schools as the form leaves them, made valid.

    The age box is optional on the form but the serializer took its empty
    value ("") as a malformed number, so a family who added a sibling without
    knowing the age could not submit -- and was told only "A valid integer is
    required." An added-but-untouched row failed the same way on its blank
    name. A row without a name carries nothing worth keeping (approval never
    saved one), so it's dropped; a blank age is no age. Guardians are left
    alone: a nameless guardian may still hold a phone number, so that one is
    for the person filling the form to fix."""
    payload = dict(raw_payload)
    siblings = payload.get("siblings")
    if isinstance(siblings, list):
        payload["siblings"] = [
            {**s, "age": None if s.get("age") == "" else s.get("age")}
            for s in siblings if _named(s, "full_name")
        ]
    schools = payload.get("previous_schools")
    if isinstance(schools, list):
        payload["previous_schools"] = [p for p in schools if _named(p, "school_name")]
    return payload


def validated_payload(raw_payload):
    """`raw_payload` strictly validated, in its JSON-safe form (dates as
    strings). Raises ValidationError. The one check both an applicant's
    submit and a registrar's correction go through, so a corrected
    application is held to exactly what a submitted one was.

    ApplicantSubmissionSerializer declares only the five keys that go on to
    become real records, so `serializer.data` does not carry `applying_for`
    -- and taking it wholesale used to destroy the grade level the applicant
    chose. That key is the only piece of enrolment intent the form collects,
    and StudentApplicationsPage reads it back on approval to prefill the
    enrolment form. Re-whitelisted through the same allow-list the draft
    PATCH uses, so this is no more permissive than autosave. It cannot reach
    a student record: _whitelisted_bundle drops it before
    create_student_bundle."""
    if not isinstance(raw_payload, dict):
        raise serializers.ValidationError({"payload": "payload must be an object."})
    serializer = ApplicantSubmissionSerializer(data=_without_blank_rows(raw_payload))
    serializer.is_valid(raise_exception=True)
    payload = serializer.data
    applying_for = whitelist(raw_payload.get("applying_for"), ALLOWED_APPLYING_FOR_FIELDS)
    if applying_for:
        payload["applying_for"] = applying_for
    return payload


def store_payload(application, payload):
    """Puts a validated bundle (see validated_payload) on `application`,
    with the columns derived from it: the identity the review queue filters
    and sorts on, and the duplicate flags. Derived here, never taken from
    the client, so the payload and the columns can't disagree -- and in one
    place, so submit and a correction can't derive them differently.
    Doesn't save."""
    student = payload.get("student", {})
    matches = duplicates.find_matches(student, exclude_application_id=application.pk)

    application.payload_json = payload
    application.lrn = (student.get("lrn") or "").strip() or None
    application.first_name = student.get("first_name", "")
    application.last_name = student.get("last_name", "")
    application.birth_date = student.get("birth_date") or None
    application.sex = student.get("sex")
    application.contact_email = student.get("email") or application.invite.contact_email
    application.contact_mobile = student.get("mobile_number") or application.invite.contact_mobile
    application.duplicate_matches_json = matches
    application.duplicate_of_student_id = duplicates.strongest_student_id(matches)
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
        application = _locked_application(application_id)

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
        application = _locked_application(application_id)
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
