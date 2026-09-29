"""
Regression tests for the enrollment form's promotion gate in
EnrollmentSerializer.validate().

The defect: the gate blocked promotion when ANY grading period of the last
completed enrollment was marked failed or incomplete. Bulk promotion and the
eligibility report had already moved to the year outcome of each learning area
(grading.deped.summarize_subjects), so a learner who failed Q1 Math and passed
the year was promoted in bulk and reported eligible -- and then refused by the
enrollment form, for the same year, by the same system. The seeded Patrick
Jimenez (Grade 5, S.Y. 2025-2026) is exactly that learner.

Enrollment and Grade are managed=False and this service cannot build a test
database (see ai/test_risk_assessment.py), so the managers are mocked, same
convention as test_document_gate.py.
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from rest_framework import serializers as drf_serializers

from enrollments.serializers import EnrollmentSerializer

STUDENT = SimpleNamespace(student_id=115, pk=115)
MATH = SimpleNamespace(subject_id=1, subject_name="Mathematics 5")
SCIENCE = SimpleNamespace(subject_id=2, subject_name="Science 5")

LAST_COMPLETED = SimpleNamespace(
    enrollment_id=203, grade_level="Grade 5", semester=None,
    school_level="elementary", strand=None,
)


def grade(subject, value, remarks):
    return SimpleNamespace(subject=subject, numeric_grade=Decimal(value), remarks=remarks)


def _enrollment_filter(*args, **kwargs):
    """The duplicate guard (filters by school_year) finds nothing; the
    last-completed lookup finds LAST_COMPLETED."""
    qs = MagicMock()
    if "school_year" in kwargs:
        qs.exists.return_value = False
        qs.exclude.return_value = qs
    else:
        qs.order_by.return_value.first.return_value = LAST_COMPLETED
    return qs


def promote(grades, **attrs):
    """Create a pending Grade 6 enrollment for a learner whose last completed
    enrollment (Grade 5) carries `grades`. Pending, so the document gate --
    which only fires on activation -- stays out of it."""
    serializer = EnrollmentSerializer()
    serializer.instance = None
    data = dict(
        student=STUDENT, school_year="2026-2027", school_level="elementary",
        grade_level="Grade 6", section="Aguinaldo", enrollment_status="pending",
    )
    data.update(attrs)

    grade_manager = MagicMock()
    grade_manager.filter.return_value.select_related.return_value = list(grades)
    with patch("enrollments.serializers.Enrollment.objects.filter", side_effect=_enrollment_filter), \
         patch("grades.models.Grade.objects", grade_manager):
        return serializer.validate(data)


# ── the regression ───────────────────────────────────────────────────────


def test_a_failed_quarter_does_not_block_a_learner_who_passed_the_year():
    """Q1 Math 73 (failed), then 76, 78, 79: the Final Grade is 76.50, a pass."""
    result = promote([
        grade(MATH, "73", "failed"), grade(MATH, "76", "passed"),
        grade(MATH, "78", "passed"), grade(MATH, "79", "passed"),
        grade(SCIENCE, "82", "passed"),
    ])
    assert result["grade_level"] == "Grade 6"


# ── what still blocks ────────────────────────────────────────────────────


def test_a_subject_failed_on_the_year_still_blocks():
    with pytest.raises(drf_serializers.ValidationError) as exc:
        promote([
            grade(MATH, "70", "failed"), grade(MATH, "72", "failed"),
            grade(MATH, "74", "failed"), grade(MATH, "76", "passed"),
            grade(SCIENCE, "82", "passed"),
        ])
    message = str(exc.value)
    assert "Mathematics 5" in message
    assert "73.00" in message          # the year average, not a single quarter
    assert "Science 5" not in message


def test_an_incomplete_subject_still_blocks_whatever_its_average():
    """A teacher's "incomplete" wins over the numbers, as on the report card."""
    with pytest.raises(drf_serializers.ValidationError) as exc:
        promote([
            grade(MATH, "88", "passed"), grade(MATH, "90", "incomplete"),
        ])
    assert "Mathematics 5" in str(exc.value)


def test_retention_is_not_checked_for_failed_subjects():
    """Repeating the same grade is the answer to failing it, not blocked by it."""
    result = promote([grade(MATH, "70", "failed")], grade_level="Grade 5", section="Silang")
    assert result["grade_level"] == "Grade 5"


def test_an_override_skips_the_check():
    result = promote(
        [grade(MATH, "70", "failed")],
        progression_override=True, progression_override_reason="Passed the remedial class.",
    )
    assert result["grade_level"] == "Grade 6"
