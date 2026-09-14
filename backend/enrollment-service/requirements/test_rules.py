"""
Tests for requirements/rules.py — who owes which documents.

No @pytest.mark.django_db anywhere: this service cannot build a test database
(attendance.AttendanceRecord holds a real FK onto the unmanaged Enrollment
table — see ai/test_risk_assessment.py's docstring). That constraint is the
reason rules.py is pure functions over duck-typed arguments, so the rules get
real coverage instead of none.
"""
from types import SimpleNamespace

import pytest

from .rules import (
    ENTRY_GRADES,
    ENTRY_STATUSES,
    SCHOOL_LEVELS,
    applies_to,
    derive_entry_status,
    missing_required,
    split_missing,
)

ALL_LEVELS = list(SCHOOL_LEVELS)
ALL_STATUSES = list(ENTRY_STATUSES)


def req(id_, *, required=True, levels=None, statuses=None):
    return SimpleNamespace(
        requirement_type_id=id_,
        requirement_name=f"Doc {id_}",
        is_required=required,
        applies_to_levels=ALL_LEVELS if levels is None else levels,
        applies_to_entry_statuses=ALL_STATUSES if statuses is None else statuses,
    )


# ── derive_entry_status ──────────────────────────────────────────────────


@pytest.mark.parametrize("grade", sorted(ENTRY_GRADES))
def test_entry_grade_with_no_history_is_new(grade):
    assert derive_entry_status(has_prior_enrollment=False, grade_level=grade) == "new"


@pytest.mark.parametrize("grade", ["Grade 2", "Grade 6", "Grade 7", "Grade 11"])
def test_above_entry_grade_with_no_history_is_a_transferee(grade):
    """A learner starting above Grade 1 with no record here came from somewhere."""
    assert derive_entry_status(has_prior_enrollment=False, grade_level=grade) == "transferee"


def test_prior_enrollment_beats_everything():
    """
    The Grade 7 promotee vs the Grade 7 walk-in — the distinction the whole
    rule exists for. Our own Grade 6 learner moving up owes no Good Moral,
    because we already hold their records.
    """
    assert derive_entry_status(
        has_prior_enrollment=True, grade_level="Grade 7",
    ) == "continuing"
    assert derive_entry_status(
        has_prior_enrollment=False, grade_level="Grade 7",
    ) == "transferee"


def test_a_continuing_learner_stays_continuing_even_if_transfer_in_is_ticked():
    assert derive_entry_status(
        has_prior_enrollment=True, is_transfer_in=True, grade_level="Grade 4",
    ) == "continuing"


def test_transfer_in_declaration_overrides_an_entry_grade():
    """A Grade 1 walk-in from another school is still a transferee if declared."""
    assert derive_entry_status(
        has_prior_enrollment=False, is_transfer_in=True, grade_level="Grade 1",
    ) == "transferee"


def test_missing_grade_level_falls_back_to_new():
    assert derive_entry_status(has_prior_enrollment=False, grade_level=None) == "new"


# ── applies_to ───────────────────────────────────────────────────────────


def test_scoping_by_level_and_status():
    good_moral = req(1, levels=["elementary", "junior_highschool", "senior_highschool"],
                     statuses=["transferee"])
    assert applies_to(good_moral, school_level="junior_highschool", entry_status="transferee")
    assert not applies_to(good_moral, school_level="junior_highschool", entry_status="continuing")
    assert not applies_to(good_moral, school_level="kindergarten", entry_status="transferee")


@pytest.mark.parametrize("levels,statuses", [
    ([], ALL_STATUSES),
    (ALL_LEVELS, []),
    ([], []),
])
def test_an_unsatisfiable_rule_fails_open(levels, statuses):
    """
    A requirement nobody can satisfy must not be able to wedge a registrar out
    of activating an enrollment. Under-gating is recoverable; a hard block with
    no override is not.
    """
    assert not applies_to(req(1, levels=levels, statuses=statuses),
                          school_level="elementary", entry_status="new")


@pytest.mark.parametrize("missing", [
    SimpleNamespace(requirement_type_id=1, is_required=True,
                    applies_to_levels=None, applies_to_entry_statuses=None),
    SimpleNamespace(requirement_type_id=1, is_required=True),  # attributes absent entirely
])
def test_null_or_absent_applicability_fails_open(missing):
    """
    Same rule for a NULL column or a row read before the columns existed —
    `applies_to` reads through getattr precisely so neither raises.
    """
    assert not applies_to(missing, school_level="elementary", entry_status="new")


def test_unresolvable_placement_fails_open():
    assert not applies_to(req(1), school_level=None, entry_status="new")
    assert not applies_to(req(1), school_level="elementary", entry_status=None)


# ── split_missing / missing_required ─────────────────────────────────────


def test_submitted_documents_are_never_missing():
    types = [req(1), req(2)]
    required, optional = split_missing(types, {1, 2},
                                       school_level="elementary", entry_status="new")
    assert required == [] and optional == []


def test_optional_documents_are_reported_but_never_gate():
    types = [req(1, required=True), req(2, required=False)]
    required, optional = split_missing(types, set(),
                                       school_level="elementary", entry_status="new")
    assert [r.requirement_type_id for r in required] == [1]
    assert [r.requirement_type_id for r in optional] == [2]
    assert [r.requirement_type_id for r in missing_required(
        types, set(), school_level="elementary", entry_status="new")] == [1]


def test_a_non_applicable_document_is_not_reported_at_all():
    """NCAE is scoped to senior high — an elementary learner never sees it."""
    ncae = req(1, required=False, levels=["senior_highschool"], statuses=["new", "transferee"])
    required, optional = split_missing([ncae], set(),
                                       school_level="elementary", entry_status="new")
    assert required == [] and optional == []


def test_the_real_catalogue_shape():
    """
    The seeded rule, end to end: a continuing elementary learner owes the two
    universal documents; a junior-high transferee owes four.
    """
    catalogue = [
        req(1, required=True),                                      # psa birth cert
        req(2, required=True),                                      # health record
        req(3, required=True, levels=["elementary", "junior_highschool", "senior_highschool"],
            statuses=["transferee"]),                               # form 137/138
        req(4, required=True, levels=["elementary", "junior_highschool", "senior_highschool"],
            statuses=["transferee"]),                               # good moral
        req(5, required=False),                                     # recommendation letter
    ]

    continuing = missing_required(catalogue, set(),
                                  school_level="elementary", entry_status="continuing")
    assert [r.requirement_type_id for r in continuing] == [1, 2]

    transferee = missing_required(catalogue, set(),
                                  school_level="junior_highschool", entry_status="transferee")
    assert [r.requirement_type_id for r in transferee] == [1, 2, 3, 4]

    kinder = missing_required(catalogue, set(),
                              school_level="kindergarten", entry_status="new")
    assert [r.requirement_type_id for r in kinder] == [1, 2]


def test_ordering_is_preserved():
    types = [req(3), req(1), req(2)]
    required, _ = split_missing(types, set(),
                                school_level="elementary", entry_status="new")
    assert [r.requirement_type_id for r in required] == [3, 1, 2]
