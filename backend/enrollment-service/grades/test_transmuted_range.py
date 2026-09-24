"""
Tests for the DO 8 floor on grades.GradeSerializer.numeric_grade.

The defect these exist for: this column holds a TRANSMUTED grade -- the number
printed on the report card and on SF9/SF10 -- but the serializer accepted
anything from 0 to 100. Only one of the two write paths transmuted:

  * GradesPage posts `computation.final_grade` from the grading calculator,
    which is transmuted.
  * The section quick-entry grid on My Sections posts whatever the teacher
    types into the cell (enrollments.views.section_grades).

So a learner could still be recorded as 40 -- the precise defect
grading/deped.py was written to end, and which its module docstring already
describes in the past tense. The floor belongs on the serializer because both
paths go through it; putting it in one of the two clients leaves the other one
open.

No @pytest.mark.django_db: validate_numeric_grade is a plain method and is
exercised directly, which is what lets this run in a service whose test
database cannot be built (see ai/test_risk_assessment.py).
"""
from decimal import Decimal

import pytest
from rest_framework import serializers

from grading.deped import HIGHEST_TRANSMUTED_GRADE, LOWEST_TRANSMUTED_GRADE
from grades.serializers import GradeSerializer


def validate(value):
    return GradeSerializer().validate_numeric_grade(value)


# -- the regression -----------------------------------------------------------

def test_an_untransmuted_score_is_refused():
    """The number from deped.py's own docstring. Before the floor, this was
    stored verbatim and printed on a report card."""
    with pytest.raises(serializers.ValidationError):
        validate(Decimal("40"))


def test_the_refusal_says_what_to_do_about_it():
    """A teacher who typed a raw score into the quick-entry grid needs to be
    told where the transmuted one comes from, not just that 40 is wrong."""
    with pytest.raises(serializers.ValidationError) as exc:
        validate(Decimal("40"))
    message = str(exc.value)
    assert "transmuted" in message.lower()
    assert "calculator" in message.lower()


@pytest.mark.parametrize("value", ["0", "59", "59.99", "-1"])
def test_everything_below_the_do8_floor_is_refused(value):
    with pytest.raises(serializers.ValidationError):
        validate(Decimal(value))


# -- what must still be accepted ----------------------------------------------

@pytest.mark.parametrize("value", ["60", "75", "84", "99", "100"])
def test_valid_transmuted_grades_pass(value):
    assert validate(Decimal(value)) == Decimal(value)


def test_the_band_edges_are_inclusive():
    assert validate(Decimal(LOWEST_TRANSMUTED_GRADE)) == Decimal(LOWEST_TRANSMUTED_GRADE)
    assert validate(Decimal(HIGHEST_TRANSMUTED_GRADE)) == Decimal(HIGHEST_TRANSMUTED_GRADE)


def test_above_one_hundred_is_still_refused():
    with pytest.raises(serializers.ValidationError):
        validate(Decimal("101"))


def test_none_is_refused_as_required():
    with pytest.raises(serializers.ValidationError):
        validate(None)
