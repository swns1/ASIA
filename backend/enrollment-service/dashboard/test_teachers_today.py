"""
Tests for the admin home's "Teachers today" card.

Pure functions only, matching test_dashboard.py: most models here are
`managed = False`, so there is no test database. Roles go through HasRole with
APIRequestFactory + SimpleNamespace, and the calendar serializer's rules are
exercised through validate() on the branches that never reach the database.
"""
from datetime import date
from types import SimpleNamespace

import pytest
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from academic_calendar.serializers import CalendarEventSerializer
from accounts.permissions import HasRole
from dashboard.teachers_today import (
    current_grading_period,
    expected_subjects,
    no_classes_today,
    section_key,
    shape_teachers_today,
)
from dashboard.views import TEACHERS_TODAY_ROLES, TeachersTodayView

factory = APIRequestFactory()

QUARTER_EVENTS = [
    {"grading_period": "1st_quarter", "start_date": date(2026, 6, 15), "end_date": date(2026, 8, 21)},
    {"grading_period": "2nd_quarter", "start_date": date(2026, 8, 24), "end_date": date(2026, 10, 23)},
    {"grading_period": "3rd_quarter", "start_date": date(2026, 11, 2), "end_date": date(2027, 1, 22)},
    {"grading_period": "4th_quarter", "start_date": date(2027, 1, 25), "end_date": date(2027, 4, 9)},
]


# ── current_grading_period ──────────────────────────────────────────────────
class TestCurrentGradingPeriod:
    def test_quarter_in_progress_comes_from_the_calendar(self):
        p = current_grading_period(QUARTER_EVENTS, date(2026, 9, 25))
        assert p["key"] == "2nd_quarter"
        assert p["due_date"] == "2026-10-23"
        assert p["source"] == "calendar"

    def test_between_quarters_stays_on_the_one_that_just_ended(self):
        # Oct 26 – Oct 30 is the break; teachers are finishing Q2 grades.
        p = current_grading_period(QUARTER_EVENTS, date(2026, 10, 28))
        assert p["key"] == "2nd_quarter"

    def test_before_the_first_quarter_starts_uses_the_earliest(self):
        p = current_grading_period(QUARTER_EVENTS, date(2026, 6, 1))
        assert p["key"] == "1st_quarter"

    def test_semester_and_its_due_date_follow_the_quarter(self):
        p = current_grading_period(QUARTER_EVENTS, date(2026, 7, 1))
        assert p["semester"] == "1st_semester"
        # The 1st semester closes when the 2nd quarter does.
        assert p["semester_due_date"] == "2026-10-23"

        p = current_grading_period(QUARTER_EVENTS, date(2026, 12, 1))
        assert p["semester"] == "2nd_semester"
        assert p["semester_due_date"] == "2027-04-09"

    def test_no_calendar_falls_back_to_latest_quarter_with_grades(self):
        p = current_grading_period([], date(2026, 9, 25), graded_quarters={"1st_quarter", "2nd_quarter"})
        assert p["key"] == "2nd_quarter"
        assert p["due_date"] is None
        assert p["semester_due_date"] is None
        assert p["source"] == "grades"

    def test_nothing_at_all_defaults_to_first_quarter(self):
        p = current_grading_period([], date(2026, 9, 25))
        assert p["key"] == "1st_quarter"
        assert p["source"] == "default"

    def test_semester_due_is_unknown_when_its_closing_quarter_is_missing(self):
        p = current_grading_period(QUARTER_EVENTS[:1], date(2026, 7, 1))
        assert p["due_date"] == "2026-08-21"
        assert p["semester_due_date"] is None


# ── no_classes_today ────────────────────────────────────────────────────────
class TestNoClassesToday:
    def test_weekend(self):
        assert no_classes_today(date(2026, 9, 26), []) == {"label": "Saturday"}

    def test_holiday_on_a_weekday(self):
        events = [{"event_type": "holiday", "title": "National Heroes Day"}]
        assert no_classes_today(date(2026, 8, 31), events) == {"label": "National Heroes Day"}

    def test_an_ordinary_event_does_not_cancel_classes(self):
        events = [{"event_type": "event", "title": "Foundation Day"}]
        assert no_classes_today(date(2026, 9, 25), events) is None


# ── expected_subjects ───────────────────────────────────────────────────────
SUBJECTS = [
    {"subject_id": 1, "school_level": "elementary", "grade_level": "Grade 3", "strand": None, "semester": None},
    {"subject_id": 2, "school_level": "elementary", "grade_level": "Grade 3", "strand": None, "semester": None},
    {"subject_id": 3, "school_level": "elementary", "grade_level": "Grade 4", "strand": None, "semester": None},
    {"subject_id": 10, "school_level": "senior_highschool", "grade_level": "Grade 11", "strand": None, "semester": "1st"},
    {"subject_id": 11, "school_level": "senior_highschool", "grade_level": "Grade 11", "strand": "STEM", "semester": "1st"},
    {"subject_id": 12, "school_level": "senior_highschool", "grade_level": "Grade 11", "strand": "ABM", "semester": "1st"},
    {"subject_id": 13, "school_level": "senior_highschool", "grade_level": "Grade 11", "strand": "STEM", "semester": "2nd"},
]


class TestExpectedSubjects:
    def test_below_senior_high_is_every_subject_for_the_grade(self):
        assert expected_subjects("elementary", "Grade 3", None, SUBJECTS, "2nd_quarter") == {1, 2}

    def test_senior_high_keeps_its_strand_and_semester(self):
        got = expected_subjects("senior_highschool", "Grade 11", "stem", SUBJECTS, "1st_semester")
        assert got == {10, 11}

    def test_senior_high_second_semester(self):
        got = expected_subjects("senior_highschool", "Grade 11", "STEM", SUBJECTS, "2nd_semester")
        assert got == {13}


# ── shape_teachers_today ────────────────────────────────────────────────────
G3_RIZAL = section_key("elementary", "Grade 3", "Rizal", None)
G3_MABINI = section_key("elementary", "Grade 3", "Mabini", "")
G11_STEM = section_key("senior_highschool", "Grade 11", "A", "STEM")
G4_EMPTY = section_key("elementary", "Grade 4", "Luna", None)


def _shape(**overrides):
    period = current_grading_period(QUARTER_EVENTS, date(2026, 9, 25))
    args = dict(
        sections={G3_RIZAL: [1, 2], G3_MABINI: [3], G11_STEM: [4]},
        advisers={G3_RIZAL: ["Ana Lim"]},
        attendance_rows=[
            {"key": G3_RIZAL, "status": "P", "n": 1},
            {"key": G3_RIZAL, "status": "L", "n": 1},
        ],
        subjects=SUBJECTS,
        graded={
            "2nd_quarter": {(1, 1), (1, 2), (2, 1), (2, 2), (3, 1)},
            "1st_semester": {(4, 10), (4, 11)},
        },
        period=period,
        no_classes=None,
    )
    args.update(overrides)
    return shape_teachers_today(**args)


class TestShapeTeachersToday:
    def test_a_missing_strand_is_one_section_not_two(self):
        assert section_key("elementary", "Grade 3", "Rizal", None) == \
               section_key("elementary", "Grade 3", "Rizal", "")

    def test_attendance_taken_per_section(self):
        out = _shape()
        by = {(s["grade_level"], s["section"]): s for s in out["sections"]}
        assert by[("Grade 3", "Rizal")]["attendance_taken"] is True
        assert by[("Grade 3", "Mabini")]["attendance_taken"] is False
        assert out["attendance"]["sections_taken"] == 1
        assert out["attendance"]["sections_total"] == 3

    def test_rate_counts_late_as_attended(self):
        out = _shape(attendance_rows=[
            {"key": G3_RIZAL, "status": "P", "n": 6},
            {"key": G3_RIZAL, "status": "L", "n": 2},
            {"key": G3_RIZAL, "status": "A", "n": 2},
            {"key": G3_RIZAL, "status": "E", "n": 5},
        ])
        # (6 + 2) / (6 + 2 + 2); excused leaves the denominator.
        assert out["attendance"]["rate"] == 0.8

    def test_no_records_means_no_rate_not_zero(self):
        assert _shape(attendance_rows=[])["attendance"]["rate"] is None

    def test_grades_complete_only_when_every_student_has_every_subject(self):
        out = _shape()
        by = {(s["grade_level"], s["section"]): s for s in out["sections"]}
        rizal = by[("Grade 3", "Rizal")]["grades"]
        assert (rizal["done"], rizal["expected"], rizal["complete"]) == (4, 4, True)
        mabini = by[("Grade 3", "Mabini")]["grades"]
        assert (mabini["done"], mabini["expected"], mabini["complete"]) == (1, 2, False)

    def test_senior_high_is_measured_by_semester(self):
        out = _shape()
        stem = next(s for s in out["sections"] if s["school_level"] == "senior_highschool")
        assert stem["grades"]["period"] == "1st_semester"
        assert stem["grades"]["due_date"] == "2026-10-23"
        assert stem["grades"]["complete"] is True

    def test_grades_summary(self):
        out = _shape()
        assert out["grades"] == {"sections_complete": 2, "sections_total": 3}

    def test_a_grade_with_no_subjects_counts_on_neither_side(self):
        out = _shape(sections={G3_RIZAL: [1, 2], G4_EMPTY: [9]},
                     subjects=[s for s in SUBJECTS if s["subject_id"] != 3])
        luna = next(s for s in out["sections"] if s["section"] == "Luna")
        assert luna["grades"] is None
        assert out["grades"]["sections_total"] == 1

    def test_advisers_and_no_adviser(self):
        out = _shape()
        by = {(s["grade_level"], s["section"]): s for s in out["sections"]}
        assert by[("Grade 3", "Rizal")]["advisers"] == ["Ana Lim"]
        assert by[("Grade 3", "Mabini")]["advisers"] == []

    def test_sections_run_in_school_order(self):
        out = _shape(sections={
            G11_STEM: [4],
            section_key("elementary", "Grade 10", "X", None): [5],
            G3_RIZAL: [1],
        })
        assert [s["grade_level"] for s in out["sections"]] == ["Grade 3", "Grade 10", "Grade 11"]

    def test_attendance_for_an_unknown_section_is_ignored(self):
        stray = section_key("elementary", "Grade 6", "Ghost", None)
        out = _shape(attendance_rows=[{"key": stray, "status": "P", "n": 30}])
        assert out["attendance"]["sections_taken"] == 0
        assert out["attendance"]["present"] == 0


# ── roles ───────────────────────────────────────────────────────────────────
def _allowed(role):
    request = Request(factory.get("/api/dashboard/teachers-today/"))
    request.user = SimpleNamespace(role=role, user_id=1, is_authenticated=True)
    return HasRole().has_permission(request, TeachersTodayView())


@pytest.mark.parametrize("role", ["super_admin", "admin"])
def test_admins_can_read_it(role):
    assert _allowed(role)


@pytest.mark.parametrize("role", ["registrar", "teacher", "accounting", "guardian"])
def test_other_roles_cannot(role):
    assert not _allowed(role)


def test_role_set_is_exactly_the_admins():
    assert TEACHERS_TODAY_ROLES == {"super_admin", "admin"}


# ── calendar: grading period events ─────────────────────────────────────────
class TestGradingPeriodEvents:
    def test_other_event_types_drop_a_stray_quarter(self):
        data = {"school_year": "2026-2027", "event_type": "holiday", "grading_period": "2nd_quarter",
                "start_date": date(2026, 8, 31), "end_date": date(2026, 8, 31)}
        assert CalendarEventSerializer().validate(data)["grading_period"] is None

    def test_a_grading_period_needs_its_quarter(self):
        data = {"school_year": "2026-2027", "event_type": "grading_period",
                "start_date": date(2026, 8, 24), "end_date": date(2026, 10, 23)}
        with pytest.raises(serializers.ValidationError) as exc:
            CalendarEventSerializer().validate(data)
        assert "grading_period" in exc.value.detail
