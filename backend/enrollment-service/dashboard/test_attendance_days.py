"""
dashboard/attendance_days.py -- each day's saved attendance, for the
calendar's day counts and the homes' day stepper.

Pure functions over plain rows, as teachers_today.py's tests are: late counts
as attended, excused leaves the rate, a part-marked section isn't taken, no
future days, holidays and weekends named, sections only when asked. Then who
may ask, and the parameters the view refuses before it reads anything.
"""
from datetime import date
from types import SimpleNamespace

import pytest
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.permissions import HasRole
from dashboard.attendance_days import MAX_DAYS, days_between, shape_attendance_days, year_for_dates
from dashboard.teachers_today import section_key
from dashboard.views import ATTENDANCE_DAY_ROLES, AttendanceDaysView

factory = APIRequestFactory()

MON = date(2026, 10, 12)
TUE = date(2026, 10, 13)
SAT = date(2026, 10, 17)
G5 = section_key("elementary", "Grade 5", "Silang", None)
G7 = section_key("junior_highschool", "Grade 7", "Rizal", "")
SECTIONS = {G5: [101, 102, 103], G7: [201, 202]}


def _row(day, key, status, n):
    return {"date": day, "key": key, "status": status, "n": n}


def _days(rows=(), dates=(MON,), events=(), **kw):
    return shape_attendance_days(
        dates=list(dates), sections=SECTIONS, attendance_rows=list(rows),
        no_class_events=list(events), **kw,
    )


class TestDaysBetween:
    def test_every_day_inclusive(self):
        assert days_between(MON, date(2026, 10, 14), today=SAT) == [MON, TUE, date(2026, 10, 14)]

    def test_stops_at_today(self):
        assert days_between(MON, SAT, today=TUE) == [MON, TUE]

    def test_a_range_wholly_in_the_future_is_empty(self):
        assert days_between(SAT, SAT, today=TUE) == []


class TestShapeAttendanceDays:
    def test_one_entry_per_day_in_order(self):
        assert [d["date"] for d in _days(dates=[MON, TUE])] == ["2026-10-12", "2026-10-13"]

    def test_late_counts_as_present_and_excused_leaves_the_rate(self):
        day = _days([
            _row(MON, G5, "P", 2), _row(MON, G5, "L", 1),
            _row(MON, G7, "A", 1), _row(MON, G7, "E", 1),
        ])[0]
        assert (day["present"], day["late"], day["absent"], day["excused"]) == (2, 1, 1, 1)
        assert day["attended"] == 3
        assert day["rate"] == 0.75  # 3 of 4: the excused learner is out of it

    def test_counts_against_every_learner_in_the_sections(self):
        day = _days([_row(MON, G5, "P", 3)])[0]
        assert (day["enrolled"], day["marked"], day["unmarked"]) == (5, 3, 2)

    def test_a_part_marked_section_isnt_taken(self):
        day = _days([_row(MON, G5, "P", 3), _row(MON, G7, "P", 1)])[0]
        assert (day["sections_taken"], day["sections_marked"], day["sections_total"]) == (1, 2, 2)

    def test_a_day_with_nothing_saved_has_no_rate_not_zero(self):
        day = _days()[0]
        assert day["rate"] is None
        assert day["marked"] == 0 and day["unmarked"] == 5

    def test_each_day_counts_only_its_own_rows(self):
        mon, tue = _days([_row(MON, G5, "P", 3), _row(TUE, G5, "A", 3)], dates=[MON, TUE])
        assert (mon["present"], mon["absent"]) == (3, 0)
        assert (tue["present"], tue["absent"]) == (0, 3)

    def test_marks_for_a_section_out_of_scope_are_ignored(self):
        other = section_key("elementary", "Grade 6", "Mabini", None)
        day = _days([_row(MON, other, "P", 30)])[0]
        assert day["marked"] == 0 and day["sections_marked"] == 0

    def test_weekend_and_holiday_say_why_there_are_no_classes(self):
        holiday = {"event_type": "holiday", "title": "National Heroes Day", "start_date": TUE, "end_date": TUE}
        mon, tue, sat = _days(dates=[MON, TUE, SAT], events=[holiday])
        assert mon["no_classes"] is None
        assert tue["no_classes"] == {"label": "National Heroes Day"}
        assert sat["no_classes"] == {"label": "Saturday"}

    def test_a_long_break_covers_every_day_it_spans(self):
        brk = {"event_type": "quarter_break", "title": "Quarter break", "start_date": MON, "end_date": TUE}
        assert [d["no_classes"] for d in _days(dates=[MON, TUE], events=[brk])] == [
            {"label": "Quarter break"}, {"label": "Quarter break"},
        ]

    def test_no_sections_unless_asked(self):
        assert "sections" not in _days()[0]

    def test_sections_in_school_order_with_their_own_marks(self):
        day = _days([_row(MON, G5, "P", 2), _row(MON, G5, "L", 1), _row(MON, G7, "A", 1)],
                    with_sections=True, advisory_ids={G5: 62})[0]
        g5, g7 = day["sections"]
        assert (g5["grade_level"], g7["grade_level"]) == ("Grade 5", "Grade 7")
        assert g5 == {
            "advisory_id": 62, "school_level": "elementary", "level_label": "Elementary",
            "grade_level": "Grade 5", "section": "Silang", "strand": None,
            "students": 3, "marked": 3, "unmarked": 0, "taken": True,
            "present": 2, "late": 1, "absent": 0, "excused": 0,
        }
        assert g7["advisory_id"] is None
        assert (g7["taken"], g7["unmarked"]) == (False, 1)

    def test_a_section_with_no_mark_is_listed_not_taken(self):
        day = _days(with_sections=True)[0]
        assert [s["taken"] for s in day["sections"]] == [False, False]

    def test_no_sections_at_all(self):
        day = shape_attendance_days(dates=[MON], sections={}, attendance_rows=[], no_class_events=[])[0]
        assert (day["enrolled"], day["sections_total"], day["rate"]) == (0, 0, None)


class TestYearForDates:
    YEARS = [
        {"label": "2025-2026", "start_date": date(2025, 6, 1), "end_date": date(2026, 3, 31)},
        {"label": "2026-2027", "start_date": date(2026, 6, 1), "end_date": date(2027, 3, 31)},
    ]

    def test_the_year_the_dates_fall_in(self):
        assert year_for_dates(MON, SAT, self.YEARS) == "2026-2027"

    def test_june_is_the_new_year_not_the_one_ending(self):
        # The calendar files June under the year ending; the registry starts
        # the next year on June 1.
        assert year_for_dates(date(2026, 6, 1), date(2026, 6, 30), self.YEARS) == "2026-2027"

    def test_a_month_straddling_a_start_takes_the_new_year(self):
        assert year_for_dates(date(2026, 5, 25), date(2026, 6, 5), self.YEARS) == "2026-2027"

    def test_the_break_between_years_has_none(self):
        assert year_for_dates(date(2026, 4, 1), date(2026, 4, 30), self.YEARS) is None


# ── roles ───────────────────────────────────────────────────────────────────
def _allowed(role):
    request = Request(factory.get("/api/dashboard/attendance-days/"))
    request.user = SimpleNamespace(role=role, user_id=1, is_authenticated=True)
    return HasRole().has_permission(request, AttendanceDaysView())


@pytest.mark.parametrize("role", ["super_admin", "admin", "registrar", "teacher"])
def test_staff_who_read_attendance_may_ask(role):
    assert _allowed(role)


@pytest.mark.parametrize("role", ["accounting", "guardian"])
def test_accounting_and_guardians_cannot(role):
    assert not _allowed(role)


def test_role_set_matches_who_reads_attendance():
    from accounts.permissions import GRADE_READ_ROLES
    assert ATTENDANCE_DAY_ROLES == GRADE_READ_ROLES


# ── parameters the view refuses before reading anything ───────────────────
def _get(**params):
    request = factory.get("/api/dashboard/attendance-days/", params)
    force_authenticate(request, user=SimpleNamespace(role="admin", user_id=1, pk=1, is_authenticated=True))
    return AttendanceDaysView.as_view()(request)


@pytest.mark.parametrize("params", [
    {"school_year": "", "date_from": "2026-10-01", "date_to": "2026-10-31"},            # empty year
    {"school_year": "2026-27", "date_from": "2026-10-01", "date_to": "2026-10-31"},     # bad year
    {"school_year": "2026-2027", "date_to": "2026-10-31"},                              # no start
    {"school_year": "2026-2027", "date_from": "Oct 1", "date_to": "2026-10-31"},        # not a date
    {"school_year": "2026-2027", "date_from": "2026-10-31", "date_to": "2026-10-01"},   # backwards
    {"school_year": "2026-2027", "date_from": "2026-06-01", "date_to": "2026-10-31"},   # too long
])
def test_bad_parameters_are_400(params):
    assert _get(**params).status_code == 400


def test_the_longest_range_allowed_is_two_months():
    assert MAX_DAYS == 62
