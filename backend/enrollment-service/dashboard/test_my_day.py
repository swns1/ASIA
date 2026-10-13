"""
dashboard/my_day.py -- what a teacher's home says per section they advise.

Pure functions over plain rows, as teachers_today.py's tests are: today's
saved attendance (partly marked counts as taken, with who is left), this
period's grades per subject and narrative ratings, Senior High measured by
its semester, and nothing to measure when a grade has no subjects.
"""
from types import SimpleNamespace

import pytest
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from accounts.permissions import HasRole

from dashboard.my_day import shape_my_day
from dashboard.views import MyDayView

factory = APIRequestFactory()

PERIOD = {
    "key": "2nd_quarter", "label": "2nd Quarter", "due_date": "2026-11-20",
    "semester": "1st_semester", "semester_label": "1st Semester", "semester_due_date": "2026-11-20",
    "source": "calendar",
}
G5 = {"advisory_id": 62, "school_level": "elementary", "grade_level": "Grade 5", "section": "Silang", "strand": None}
G11 = {"advisory_id": 63, "school_level": "senior_highschool", "grade_level": "Grade 11", "section": "ABM-A", "strand": "ABM"}
SUBJECTS = [
    {"subject_id": 1, "subject_code": "ENG5", "subject_name": "English 5", "school_level": "elementary",
     "grade_level": "Grade 5", "strand": None, "semester": None},
    {"subject_id": 2, "subject_code": "MATH5", "subject_name": "Math 5", "school_level": "elementary",
     "grade_level": "Grade 5", "strand": None, "semester": None},
    {"subject_id": 3, "subject_code": "OC11", "subject_name": "Oral Communication", "school_level": "senior_highschool",
     "grade_level": "Grade 11", "strand": None, "semester": "1st"},
    {"subject_id": 4, "subject_code": "RW11", "subject_name": "Reading and Writing", "school_level": "senior_highschool",
     "grade_level": "Grade 11", "strand": None, "semester": "2nd"},
]


def _shape(advisories=(G5,), rosters=None, attendance=None, graded=None, narratives=None, category_ids=(9, 10)):
    return shape_my_day(
        advisories=list(advisories),
        rosters=rosters or {62: [101, 102], 63: [201]},
        attendance=attendance or {},
        subjects=SUBJECTS,
        graded=graded or {},
        narratives=narratives or {},
        category_ids=list(category_ids),
        period=PERIOD,
        no_classes=None,
    )


def test_attendance_not_taken_until_a_mark_is_saved():
    s = _shape()["sections"][0]
    assert s["attendance"] == {"taken": False, "marked": 0, "unmarked": 2,
                               "present": 0, "late": 0, "absent": 0, "excused": 0}


def test_a_partly_marked_day_is_taken_and_says_who_is_left():
    s = _shape(attendance={62: {"P": 1}})["sections"][0]
    assert (s["attendance"]["taken"], s["attendance"]["unmarked"], s["attendance"]["present"]) == (True, 1, 1)


def test_grades_count_this_quarter_per_subject():
    s = _shape(graded={"2nd_quarter": {(101, 1), (102, 1), (101, 2)}, "1st_quarter": {(102, 2)}})["sections"][0]
    g = s["grades"]
    assert (g["period"], g["label"], g["due_date"], g["done"], g["expected"], g["complete"]) == \
        ("2nd_quarter", "2nd Quarter", "2026-11-20", 3, 4, False)
    assert [(r["subject_name"], r["done"], r["expected"], r["complete"]) for r in g["subjects"]] == \
        [("English 5", 2, 2, True), ("Math 5", 1, 2, False)]


def test_senior_high_is_measured_by_its_semester_and_only_its_subjects():
    s = _shape(advisories=[G11], graded={"1st_semester": {(201, 3)}})["sections"][0]
    assert s["grades"]["period"] == "1st_semester"
    assert [r["subject_name"] for r in s["grades"]["subjects"]] == ["Oral Communication"]
    assert s["grades"]["complete"] is True
    assert s["narrative"]["period"] == "1st_semester"


def test_narrative_counts_every_active_category():
    s = _shape(narratives={"2nd_quarter": {(101, 9), (101, 10), (102, 9)}})["sections"][0]
    assert (s["narrative"]["done"], s["narrative"]["expected"]) == (3, 4)


def test_nothing_to_measure_without_subjects_or_categories():
    g7 = {**G5, "advisory_id": 70, "grade_level": "Grade 7"}
    s = _shape(advisories=[g7], rosters={70: [1]}, category_ids=())["sections"][0]
    assert s["grades"] is None
    assert s["narrative"] is None


def test_a_teacher_with_no_section_gets_an_empty_list():
    assert _shape(advisories=[])["sections"] == []


def _allowed(role):
    request = Request(factory.get("/api/dashboard/my-day/"))
    request.user = SimpleNamespace(role=role, user_id=25, is_authenticated=True)
    return HasRole().has_permission(request, MyDayView())


@pytest.mark.parametrize("role", ["super_admin", "admin", "registrar", "accounting", "guardian"])
def test_teachers_only(role):
    assert not _allowed(role)


def test_a_teacher_may_ask():
    assert _allowed("teacher")
