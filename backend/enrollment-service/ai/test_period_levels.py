"""
Reading each school level at its own grading period, and grades for a period
still being encoded.

The defects these exist for, found on the real Tier 7 data (2026-10-06):

- Senior high is graded by semester, never by quarter, so every quarter check
  left out all 77 Grade 11-12 learners -- and a semester check found them only
  once the semester's grade was posted, in November.
- Only posted grades were read, so a check of the quarter in progress (318
  learners with 2nd-quarter scores encoded, none posted) found nobody.
- A semester's attendance was counted over the whole school year.

No @pytest.mark.django_db: per test_risk_assessment.py, this service cannot
build a test database. The rules are pure functions, tested directly; the
calendar read in resolve_period_window is patched.
"""
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from ai.risk_views import _summarize
from ai.services import (
    SENIOR_HIGH,
    period_for_level,
    previous_period_for_level,
    resolve_period_window,
    running_grades,
    score_students,
)
from grading.deped import initial_grade_from, transmute


# ── Which period each level is read at ─────────────────────────────────────────

@pytest.mark.parametrize("period,shs,others", [
    ("1st_quarter", "1st_semester", "1st_quarter"),
    ("2nd_quarter", "1st_semester", "2nd_quarter"),
    ("3rd_quarter", "2nd_semester", "3rd_quarter"),
    ("4th_quarter", "2nd_semester", "4th_quarter"),
    ("1st_semester", "1st_semester", None),
    ("2nd_semester", "2nd_semester", None),
    ("overall", "overall", "overall"),
])
def test_senior_high_is_read_at_the_semester_a_quarter_falls_in(period, shs, others):
    assert period_for_level(period, SENIOR_HIGH) == shs
    assert period_for_level(period, "junior_highschool") == others


@pytest.mark.parametrize("period,shs,others", [
    ("1st_quarter", None, None),
    ("2nd_quarter", None, "1st_quarter"),          # same 1st semester: nothing earlier
    ("3rd_quarter", "1st_semester", "2nd_quarter"),
    ("4th_quarter", None, "3rd_quarter"),          # same 2nd semester
    ("2nd_semester", "1st_semester", None),
    ("1st_semester", None, None),
    ("overall", None, None),
])
def test_each_level_trends_against_its_own_previous_period(period, shs, others):
    assert previous_period_for_level(period, SENIOR_HIGH) == shs
    assert previous_period_for_level(period, "elementary") == others


# ── The running grade ──────────────────────────────────────────────────────────

def _totals(*rows):
    return [
        {"enrollment_id": 1, "subject_id": 7, "grading_period": "1st_semester",
         "grading_component_id": cid, "total": Decimal(total), "possible": Decimal(possible)}
        for cid, total, possible in rows
    ]


WEIGHTS = {1: Decimal("25.00"), 2: Decimal("50.00"), 3: Decimal("25.00")}  # SHS core: WW / PT / QA


def test_running_grade_is_the_gradebooks_formula():
    # WW 40/50 = 80%, PT 90/100 = 90%; QA not encoded yet -- pending, not zero.
    grades = running_grades(_totals((1, "40", "50"), (2, "90", "100")), WEIGHTS)
    expected = transmute(initial_grade_from([(25, Decimal(80)), (50, Decimal(90))]))
    assert grades == {(1, 7, "1st_semester"): float(expected)}
    # Renormalised over the 75 points encoded: (20 + 45) / 75 = 86.67, not 65.
    assert initial_grade_from([(25, Decimal(80)), (50, Decimal(90)), (25, None)]) == Decimal("86.67")


def test_a_zero_point_assessment_is_left_out():
    assert running_grades(_totals((1, "0", "0")), WEIGHTS) == {}


def test_running_grades_are_kept_apart_per_subject_and_period():
    rows = _totals((1, "45", "50")) + [
        {"enrollment_id": 1, "subject_id": 8, "grading_period": "1st_semester",
         "grading_component_id": 1, "total": Decimal("20"), "possible": Decimal("50")},
    ]
    grades = running_grades(rows, WEIGHTS)
    assert set(grades) == {(1, 7, "1st_semester"), (1, 8, "1st_semester")}
    assert grades[(1, 7, "1st_semester")] > grades[(1, 8, "1st_semester")]


# ── Semester attendance windows ────────────────────────────────────────────────

BREAKS = [
    (date(2026, 8, 24), date(2026, 8, 28)),
    (date(2026, 11, 23), date(2026, 11, 27)),   # the semestral break
    (date(2027, 1, 25), date(2027, 1, 29)),
]


def _calendar(breaks):
    fake = MagicMock()
    fake.objects.filter.return_value.order_by.return_value.values_list.return_value = breaks
    return patch("academic_calendar.models.CalendarEvent", fake)


def _window(period, breaks=BREAKS):
    with _calendar(breaks), patch(
        "ai.services._configured_sy_dates", return_value=(date(2026, 6, 1), date(2027, 3, 31)),
    ):
        return resolve_period_window("2026-2027", period)


def test_a_semester_is_counted_over_its_own_two_quarters():
    first = _window("1st_semester")
    assert (first["from"], first["to"], first["source"]) == (date(2026, 6, 1), date(2026, 11, 23), "calendar")
    second = _window("2nd_semester")
    assert (second["from"], second["to"], second["source"]) == (date(2026, 11, 27), date(2027, 3, 31), "calendar")


def test_quarters_keep_their_windows():
    assert (_window("1st_quarter")["from"], _window("1st_quarter")["to"]) == (date(2026, 6, 1), date(2026, 8, 24))
    assert (_window("4th_quarter")["from"], _window("4th_quarter")["to"]) == (date(2027, 1, 29), date(2027, 3, 31))


def test_a_quarter_without_its_closing_break_falls_back_instead_of_running_to_march():
    window = _window("2nd_quarter", breaks=BREAKS[:1])
    assert window["source"] == "full_year"


# ── Signals a period makes possible ────────────────────────────────────────────

def _student(previous_period):
    return {
        "grade": 85.0, "failing_subjects": [], "attendance_rate": 0.97,
        "total_school_days": 60, "absent_days": 2, "grade_delta": float("nan"),
        "previous_period": previous_period, "avg_narrative": 2.5, "narrative_ratings": ["SO"],
    }


def test_every_signal_a_first_quarter_student_can_have_is_a_full_picture():
    scored = score_students({1: _student(previous_period=None)})[1]
    assert (scored["signals_present"], scored["signals_possible"]) == (3, 3)
    assert scored["data_confidence"] == "complete"


def test_a_missing_trend_still_counts_when_a_previous_period_exists():
    scored = score_students({1: _student(previous_period="1st_quarter")})[1]
    assert (scored["signals_present"], scored["signals_possible"]) == (3, 4)
    assert scored["data_confidence"] == "partial"


# ── "Why they're flagged" counts the flagged ───────────────────────────────────

def test_reasons_are_counted_among_flagged_students_only():
    rows = [
        {"risk_level": "high", "reasons": [{"code": "chronic_absence"}, {"code": "behavior_concern"}]},
        {"risk_level": "moderate", "reasons": [{"code": "behavior_concern"}]},
        {"risk_level": "low", "reasons": [{"code": "frequent_absence"}]},
    ]
    summary = _summarize(rows)
    assert {r["code"]: r["count"] for r in summary["by_reason"]} == {
        "chronic_absence": 1, "behavior_concern": 1,
    }
    assert summary["flagged_count"] == 1
