"""
Tests for ai.services._school_year_bounds -- the outer clamp on a grading
period's attendance window.

The defect these exist for: the bounds were whole calendar years, Jan 1 of the
opening year to Dec 31 of the closing one. `resolve_period_window` derives the
inner boundaries from the school's own `quarter_break` events, but the FIRST
quarter opens at the lower clamp and the LAST closes at the upper one -- so
with breaks configured, S.Y. 2025-2026 still produced:

    1st_quarter   2025-01-01 -> 2025-08-25   (236 days, opening five months
                                              before the school year did)
    4th_quarter   2026-01-28 -> 2026-12-31   (337 days, closing nine months
                                              after it ended)

Those windows are reported to the UI as the period a figure covers, and two
calendar years is wide enough to span a learner's *previous* enrollment -- safe
only because attendance is filtered by enrollment id before the date window is
applied. The docstring argued the wide clamp "degrades to the previous
full-year behavior", which holds for `overall` and not for the quarters.

No @pytest.mark.django_db: per test_risk_assessment.py, this service cannot
build a test database. `_school_year_bounds` reads school_settings through a
cursor, which is patched here.
"""
from datetime import date
from unittest.mock import patch

import pytest

from ai.services import _school_year_bounds


def no_settings():
    """Patch the settings lookup to find nothing configured."""
    return patch("ai.services._configured_sy_dates", return_value=None)


def configured(start, end):
    return patch("ai.services._configured_sy_dates", return_value=(start, end))


# -- the regression -----------------------------------------------------------

def test_bounds_are_the_academic_year_not_two_calendar_years():
    with no_settings():
        lo, hi = _school_year_bounds("2025-2026")

    assert (lo, hi) == (date(2025, 6, 1), date(2026, 3, 31))
    # The old behaviour, stated explicitly so a regression is unmistakable.
    assert lo != date(2025, 1, 1)
    assert hi != date(2026, 12, 31)


def test_the_window_is_under_a_year_wide():
    """Two calendar years is long enough to span a learner's previous
    enrollment. One academic year cannot."""
    with no_settings():
        lo, hi = _school_year_bounds("2025-2026")
    assert (hi - lo).days < 366


# -- the school's own calendar wins -------------------------------------------

def test_configured_school_dates_take_precedence():
    """A school that opens in August is not a school that opens in June, and
    school_settings is where that is recorded."""
    with configured(date(2025, 8, 18), date(2026, 5, 29)):
        assert _school_year_bounds("2025-2026") == (date(2025, 8, 18), date(2026, 5, 29))


def test_falls_back_to_the_convention_when_unconfigured():
    with no_settings():
        assert _school_year_bounds("2030-2031") == (date(2030, 6, 1), date(2031, 3, 31))


def test_a_failed_settings_read_does_not_take_scoring_down():
    """_configured_sy_dates swallows database errors and answers None. The
    risk model must still produce a window rather than raising."""
    with patch("ai.services._configured_sy_dates", side_effect=None, return_value=None):
        assert _school_year_bounds("2025-2026")[0] == date(2025, 6, 1)


# -- malformed input ----------------------------------------------------------

@pytest.mark.parametrize("bad", ["", "2025", "not-a-year", None, "2025-26-27"])
def test_unparseable_school_years_return_no_bounds(bad):
    """None, None is the caller's signal to fall back, not a crash."""
    with no_settings():
        assert _school_year_bounds(bad) == (None, None)
