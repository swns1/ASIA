"""
Tests for shared.school_year -- the canonical form of a school year string.

The defect these exist for: `school_year` is the partition key for the whole
system (enrollments, section_advisories, grades, attendance, school_settings;
billing matches it in raw SQL across the service boundary) and it was an
unvalidated varchar(20). A single "2025-26", a trailing space, or an
"SY 2025-2026" pasted out of a spreadsheet raised nothing -- it split one
school year into two that no query ever rejoined, invisibly, because every
screen filters to one year at a time and each half looks complete from inside
itself.
"""
from datetime import date

import pytest

from shared.school_year import (
    InvalidSchoolYear,
    current,
    is_valid,
    normalize,
)


def test_a_canonical_school_year_passes_through_unchanged():
    assert normalize("2025-2026") == "2025-2026"


def test_surrounding_whitespace_is_stripped():
    """Whitespace is a paste artefact, not a decision by whoever typed it --
    and it is the failure mode most likely to reach the database unnoticed,
    since it is invisible on screen."""
    assert normalize("  2025-2026\n") == "2025-2026"


@pytest.mark.parametrize(
    "bad",
    [
        "2025-26",        # the spreadsheet abbreviation
        "SY2025-2026",    # prefixed
        "SY 2025-2026",
        "2025/2026",      # slash
        "2025",           # one year
        "2025-2026-2027",
        "",
        "   ",
        "abcd-efgh",
    ],
)
def test_non_canonical_forms_are_rejected_rather_than_guessed(bad):
    """Guessing what "2025-26" meant is how one year quietly becomes two.
    Every one of these raises instead."""
    with pytest.raises(InvalidSchoolYear):
        normalize(bad)


def test_none_is_rejected():
    with pytest.raises(InvalidSchoolYear):
        normalize(None)


def test_a_span_of_more_than_one_year_is_rejected():
    """2025-2027 is well-formed and still not a school year. The message names
    the correction rather than only the fault."""
    with pytest.raises(InvalidSchoolYear, match="2025-2026"):
        normalize("2025-2027")


def test_a_backwards_span_is_rejected():
    with pytest.raises(InvalidSchoolYear):
        normalize("2026-2025")


def test_is_valid_mirrors_normalize_without_raising():
    assert is_valid("2025-2026") is True
    assert is_valid("2025-26") is False
    assert is_valid(None) is False


# -- the July cutoff ----------------------------------------------------------

def test_current_cuts_at_july_like_the_rest_of_the_app():
    """
    This has to agree with enrollments.views.school_years(), the frontend's
    computeDefaultSchoolYear(), and billing.services.default_sy_start(). While
    billing cut at June instead, a student enrolled in June was filed under one
    school year by the registrar and a different one by billing.
    """
    assert current(date(2026, 6, 30)) == "2025-2026"
    assert current(date(2026, 7, 1)) == "2026-2027"
    assert current(date(2026, 12, 31)) == "2026-2027"


def test_current_returns_something_normalize_accepts():
    assert normalize(current(date(2026, 3, 1))) == current(date(2026, 3, 1))
