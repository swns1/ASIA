"""
Which documents a learner actually owes before an enrollment can be activated.

Before this module, the answer was "all of them, from everyone": the gate in
enrollments/serializers.py demanded every `is_active=True` requirement type,
because the table had no way to distinguish "this document is in our
catalogue" from "you cannot enrol without it". A Grade 1 new entrant was
asked for a Form 137, an NCAE result, an ESC transferee certificate and an
Alien Certificate of Registration.

Two things decide it now — `is_required` (does a missing copy block), and the
two applicability lists (is this learner even asked for it).

Deliberately pure functions over duck-typed arguments. Neither of this
service's test databases can be built (attendance.AttendanceRecord holds a
real FK onto the unmanaged Enrollment table — see ai/test_risk_assessment.py),
so the only way this logic gets real test coverage is if it never touches the
ORM. `applies_to` takes anything with the three attributes, so a test passes a
SimpleNamespace. Same reasoning as enrollments/report_views.py::_subject_remarks.
"""

SCHOOL_LEVELS = (
    "nursery", "kindergarten", "elementary",
    "junior_highschool", "senior_highschool",
)

ENTRY_STATUSES = ("new", "transferee", "continuing")

# The grades a learner can start at without having attended school before.
# Anyone entering above these without a record here came from somewhere else,
# by definition — which is what makes the derivation below safe.
ENTRY_GRADES = frozenset({"Nursery", "Kindergarten", "Grade 1"})


def derive_entry_status(*, has_prior_enrollment, is_transfer_in=False, grade_level=None):
    """
    "new" / "transferee" / "continuing" for one enrollment.

    Deliberately derived rather than stored. The alternative signals were all
    worse:

    - `previous_schools` rows look like the obvious answer and are not: the
      seed data alone gives 42 of 52 students one, including day care and
      preschool entries for the nursery cohort ("Little Stars Day Care
      Center"). "Has a previous school" is near-universal and says nothing
      about transferring. It is also not modelled in this service at all.
    - A new `student_type` column would have to be filled in correctly by
      whoever creates the record, for every existing row, to be worth
      anything.

    Prior enrollment plus grade level is already recorded, already correct,
    and already how the eligibility endpoint computes `is_new_student`. The
    registrar's own "Transfer In" declaration refines it.

    Note this is genuinely right, not just convenient: a Grade 7 entrant with
    no record here derives as `transferee` and owes Good Moral, while a Grade 7
    learner promoted from our own Grade 6 derives as `continuing` and does not
    — which is DepEd practice, because the school already holds their records.

    `has_prior_enrollment` MUST exclude the row being validated. On a
    pending -> enrolled activation the row already exists, so a caller that
    forgets classifies every activation as `continuing` and silently disables
    the transferee rules on the exact path the gate exists for.
    """
    if has_prior_enrollment:
        return "continuing"
    if is_transfer_in:
        return "transferee"
    if grade_level and grade_level not in ENTRY_GRADES:
        return "transferee"
    return "new"


def applies_to(req_type, *, school_level, entry_status):
    """
    Is this requirement asked of this learner at all?

    `req_type` is duck-typed: anything carrying `applies_to_levels` and
    `applies_to_entry_statuses`.

    Fails OPEN in every uncertain case — an empty applicability list, or a
    school level we cannot resolve. A requirement nobody can satisfy must not
    be able to wedge a registrar out of activating an enrollment, and the
    column CHECK constraints already make an empty list unreachable through
    normal writes. Under-gating is recoverable; a registrar who cannot enrol a
    student and has no override is not.
    """
    levels = getattr(req_type, "applies_to_levels", None) or []
    statuses = getattr(req_type, "applies_to_entry_statuses", None) or []
    if not levels or not statuses:
        return False
    if school_level is None or entry_status is None:
        return False
    return school_level in levels and entry_status in statuses


def split_missing(req_types, submitted_ids, *, school_level, entry_status):
    """
    (required_missing, optional_missing) for one learner's placement.

    `req_types` is any iterable of requirement types — callers pass the active
    ones. `submitted_ids` is a set of requirement_type_id the student has
    already submitted. Both lists are returned in the order given, so callers
    keep whatever ordering the queryset applied.

    Optional-but-missing is returned rather than discarded because the
    eligibility report shows it: a registrar wants to see that a transferee
    still owes a clearance even though it will not block them.
    """
    required_missing, optional_missing = [], []
    for rt in req_types:
        if rt.requirement_type_id in submitted_ids:
            continue
        if not applies_to(rt, school_level=school_level, entry_status=entry_status):
            continue
        if getattr(rt, "is_required", False):
            required_missing.append(rt)
        else:
            optional_missing.append(rt)
    return required_missing, optional_missing


def missing_required(req_types, submitted_ids, *, school_level, entry_status):
    """Just the blocking half of split_missing — what the gate acts on."""
    required_missing, _ = split_missing(
        req_types, submitted_ids,
        school_level=school_level, entry_status=entry_status,
    )
    return required_missing
