"""
Tests for grading.deped.summarize_subjects -- the one reduction of a learner's
Grade rows into a per-learning-area outcome for the year.

The defect these exist for: the report card and promotion each had their own
answer to "did this learner pass this subject". The report card averaged the
subject across its grading periods; promotion looked for ANY period whose
recorded remark was "failed" or "incomplete". So a learner who failed the
first quarter and recovered to an 84 average was printed as Passed on their own
report card and then refused promotion by the same system, in the same school
year -- and DO 8 s.2015 sets the Final Grade for a learning area as the mean of
its quarters, which makes the report card's reading the correct one.

No @pytest.mark.django_db: per ai/test_risk_assessment.py, a real test database
can't be built in this service (attendance.AttendanceRecord holds an FK onto an
unmanaged Enrollment). summarize_subjects is duck-typed over anything carrying
.subject / .numeric_grade / .remarks for exactly that reason.
"""
from decimal import Decimal
from types import SimpleNamespace

import pytest

from grading.deped import PASSING_GRADE, general_average, summarize_subjects


def subject(subject_id, name):
    return SimpleNamespace(subject_id=subject_id, subject_name=name)


def grade(subj, numeric_grade, remarks=None):
    return SimpleNamespace(subject=subj, numeric_grade=numeric_grade, remarks=remarks)


MATH = subject(1, "Mathematics")
SCIENCE = subject(2, "Science")


# -- the regression -----------------------------------------------------------

def test_one_failed_quarter_does_not_fail_the_year():
    """
    The exact case promotion used to block on: Q1 failed and recorded as such,
    then three recovering quarters. The Final Grade is the mean of the four,
    which passes.
    """
    outcomes = summarize_subjects([
        grade(MATH, Decimal("70"), "failed"),
        grade(MATH, Decimal("88"), "passed"),
        grade(MATH, Decimal("90"), "passed"),
        grade(MATH, Decimal("88"), "passed"),
    ])

    assert outcomes[MATH.subject_id]["average"] == Decimal("84.00")
    assert outcomes[MATH.subject_id]["remarks"] == "passed"


def test_a_subject_that_fails_on_the_year_still_fails():
    """The converse has to hold too, or the fix has simply stopped failing
    anyone. A passing quarter does not rescue a failing year."""
    outcomes = summarize_subjects([
        grade(MATH, Decimal("78"), "passed"),
        grade(MATH, Decimal("68"), "failed"),
        grade(MATH, Decimal("70"), "failed"),
        grade(MATH, Decimal("72"), "failed"),
    ])

    assert outcomes[MATH.subject_id]["average"] == Decimal("72.00")
    assert outcomes[MATH.subject_id]["remarks"] == "failed"


# -- the precedence rule ------------------------------------------------------

@pytest.mark.parametrize("recorded", ["dropped", "incomplete"])
def test_a_recorded_remark_survives_a_passing_average(recorded):
    """A score cannot express either of these -- a subject dropped mid-quarter
    can still average 88 -- so a teacher's mark outranks the average."""
    outcomes = summarize_subjects([
        grade(MATH, Decimal("88"), recorded),
        grade(MATH, Decimal("88"), "passed"),
    ])
    assert outcomes[MATH.subject_id]["remarks"] == recorded


def test_dropped_outranks_incomplete():
    """Dropping is terminal; an incomplete is a subject still awaiting its
    mark."""
    outcomes = summarize_subjects([
        grade(MATH, Decimal("88"), "incomplete"),
        grade(MATH, Decimal("88"), "dropped"),
    ])
    assert outcomes[MATH.subject_id]["remarks"] == "dropped"


def test_a_subject_with_no_numeric_grade_is_uncomputed_not_failed():
    """None in, None out. Reporting "failed" for a subject nobody has encoded
    yet would invent a result the school has not reached."""
    outcomes = summarize_subjects([grade(MATH, None, None)])
    assert outcomes[MATH.subject_id]["average"] is None
    assert outcomes[MATH.subject_id]["remarks"] is None


def test_the_passing_line_is_inclusive():
    outcomes = summarize_subjects([grade(MATH, Decimal(PASSING_GRADE), None)])
    assert outcomes[MATH.subject_id]["remarks"] == "passed"


# -- grouping -----------------------------------------------------------------

def test_subjects_are_reduced_independently():
    outcomes = summarize_subjects([
        grade(MATH, Decimal("90"), None),
        grade(MATH, Decimal("80"), None),
        grade(SCIENCE, Decimal("70"), None),
        grade(SCIENCE, Decimal("72"), None),
    ])

    assert outcomes[MATH.subject_id]["average"] == Decimal("85.00")
    assert outcomes[MATH.subject_id]["remarks"] == "passed"
    assert outcomes[SCIENCE.subject_id]["average"] == Decimal("71.00")
    assert outcomes[SCIENCE.subject_id]["remarks"] == "failed"
    assert outcomes[MATH.subject_id]["periods"] == 2


def test_periods_without_a_numeric_grade_do_not_drag_the_average_down():
    """An unencoded quarter is absent from the mean, not a zero in it."""
    outcomes = summarize_subjects([
        grade(MATH, Decimal("90"), None),
        grade(MATH, None, None),
    ])
    assert outcomes[MATH.subject_id]["average"] == Decimal("90.00")
    assert outcomes[MATH.subject_id]["periods"] == 2


def test_empty_input_reduces_to_nothing():
    assert summarize_subjects([]) == {}


# -- general average ----------------------------------------------------------

def test_general_average_is_a_whole_number_across_learning_areas():
    outcomes = summarize_subjects([
        grade(MATH, Decimal("85"), None),
        grade(SCIENCE, Decimal("90"), None),
    ])
    averages = [o["average"] for o in outcomes.values()]
    assert general_average(averages) == 88  # 87.5 rounds half-up


def test_general_average_ignores_uncomputed_subjects():
    assert general_average([Decimal("90"), None, Decimal("80")]) == 85
    assert general_average([None, None]) is None
