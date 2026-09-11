"""
DepEd Order No. 8, s. 2015 grade computation.

These pin the three rules the service previously got wrong: transmutation
(absent entirely), the Percentage Score formula (unweighted mean of
per-assessment percentages), and missing components (silently scored 0).
"""
from decimal import Decimal
from types import SimpleNamespace

import pytest

from grading.deped import (
    LOWEST_TRANSMUTED_GRADE,
    PASSING_GRADE,
    TRANSMUTATION_TABLE,
    descriptor,
    general_average,
    percentage_score,
    transmute,
)


def entry(score, max_score):
    return SimpleNamespace(score=score, max_score=max_score)


# ── Transmutation ────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "initial,expected",
    [
        (100, 100),
        (99.99, 99),
        (98.40, 99),
        (98.39, 98),
        (85.60, 91),
        (75.00, 84),
        (74.40, 84),
        (74.39, 83),
        (60.00, 75),
        (59.99, 74),
        (40.00, 70),
        (4.00, 61),
        (3.99, 60),
        (0, 60),
    ],
)
def test_transmutation_matches_the_published_table(initial, expected):
    assert transmute(initial) == expected


def test_the_floor_is_60_not_0():
    """
    The whole point of the table: no learner is recorded below 60. An Initial
    Grade of 40 used to be reported as 40.
    """
    for initial in (0, 1, 10, 25, 39.9):
        assert transmute(initial) >= LOWEST_TRANSMUTED_GRADE


def test_an_initial_grade_just_under_75_is_a_pass_after_transmutation():
    """
    This is the regression that mattered most. 74.99 transmutes to 84, which
    is comfortably a pass -- the service used to apply the 75 line to the raw
    initial grade and record it as Failed.
    """
    transmuted = transmute(74.99)
    assert transmuted == 84
    assert transmuted >= PASSING_GRADE


def test_the_initial_grade_that_actually_fails_is_far_lower():
    """A pass needs an Initial Grade of 60; below that transmutes under 75."""
    assert transmute(60.00) == PASSING_GRADE
    assert transmute(59.99) < PASSING_GRADE


def test_nothing_encoded_stays_uncomputed_rather_than_becoming_60():
    assert transmute(None) is None


def test_every_band_is_reachable_and_ordered():
    """The table must be strictly descending, or a lookup returns a wrong band."""
    bounds = [b for b, _ in TRANSMUTATION_TABLE]
    grades = [g for _, g in TRANSMUTATION_TABLE]
    assert bounds == sorted(bounds, reverse=True)
    assert grades == sorted(grades, reverse=True)
    assert len(set(grades)) == len(grades)


# ── Percentage Score ─────────────────────────────────────────────────────────

def test_percentage_score_weights_by_assessment_size():
    """
    DO 8: (sum of raw / sum of highest possible) x 100.

    A perfect 5-point seatwork and a failed 50-point test is NOT 50%. The old
    unweighted mean of percentages said 50; the correct figure is 10/55.
    """
    ps = percentage_score([entry(5, 5), entry(5, 50)])
    assert ps == pytest.approx(Decimal("10") / Decimal("55") * 100, abs=0.01)
    assert ps < 50  # the old formula returned exactly 50


def test_percentage_score_is_none_when_nothing_is_encoded():
    """None means 'not yet encoded' and must never be coerced to zero."""
    assert percentage_score([]) is None


def test_zero_point_assessments_do_not_divide_by_zero():
    assert percentage_score([entry(0, 0)]) is None
    assert percentage_score([entry(8, 10), entry(0, 0)]) == pytest.approx(80)


def test_a_perfect_set_is_100():
    assert percentage_score([entry(25, 25), entry(50, 50)]) == pytest.approx(100)


# ── Descriptors ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "grade,expected",
    [
        (100, "Outstanding"),
        (90, "Outstanding"),
        (89, "Very Satisfactory"),
        (85, "Very Satisfactory"),
        (84, "Satisfactory"),
        (80, "Satisfactory"),
        (79, "Fairly Satisfactory"),
        (75, "Fairly Satisfactory"),
        (74, "Did Not Meet Expectations"),
        (60, "Did Not Meet Expectations"),
    ],
)
def test_descriptor_bands(grade, expected):
    assert descriptor(grade) == expected


def test_descriptor_boundary_aligns_with_the_passing_mark():
    """Fairly Satisfactory starts exactly where a pass starts."""
    assert descriptor(PASSING_GRADE) == "Fairly Satisfactory"
    assert descriptor(PASSING_GRADE - 1) == "Did Not Meet Expectations"


# ── General average ──────────────────────────────────────────────────────────

def test_general_average_is_an_unweighted_mean_reported_whole():
    assert general_average([90, 85, 80]) == 85


def test_general_average_rounds_half_up():
    assert general_average([85, 86]) == 86


def test_general_average_ignores_subjects_with_no_grade():
    assert general_average([90, None, 80]) == 85
    assert general_average([None, None]) is None
