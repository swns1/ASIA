"""
A senior high report card covers the school year, not one semester row.

Each semester is its own enrollment, and report_card() read only the row it
was asked for: a Grade 11 learner's 2nd-semester card listed three subjects
and left the 1st semester's off. DepEd's senior high SF9 reports both
semesters, each with a General Average for the semester.

DB-free: the managers are swapped for enrollments.fake_orm.FakeQuerySet.
"""
from types import SimpleNamespace
from unittest.mock import patch

from enrollments.fake_orm import FakeQuerySet
from enrollments.report_views import senior_high_year_rows, shs_semester_summary


def row(e_id, semester, status, *, year="2026-2027", grade="Grade 11", student_id=7):
    return SimpleNamespace(
        enrollment_id=e_id, pk=e_id, student_id=student_id, school_year=year,
        school_level="senior_highschool", grade_level=grade, semester=semester,
        enrollment_status=status,
    )


def test_the_year_is_both_semester_rows():
    first, second = row(10, "1st", "completed"), row(11, "2nd", "enrolled")
    others = [
        row(9, "1st", "cancelled"),                        # never attended
        row(8, "2nd", "completed", year="2025-2026"),      # another year
        row(12, "1st", "completed", grade="Grade 12"),     # another grade
        row(13, "1st", "completed", student_id=99),        # another learner
    ]
    with patch("enrollments.report_views.Enrollment.objects", new=FakeQuerySet([first, second, *others])):
        assert senior_high_year_rows(second) == [first, second]


def test_the_row_asked_for_is_always_on_its_own_card():
    pending = row(11, "2nd", "pending")
    with patch("enrollments.report_views.Enrollment.objects", new=FakeQuerySet([pending])):
        assert senior_high_year_rows(pending) == [pending]


def test_each_semester_has_its_general_average_and_the_year_their_mean():
    subjects = [
        {"semester": "1st_semester", "average": 84.0},
        {"semester": "1st_semester", "average": 86.0},
        {"semester": "2nd_semester", "average": 88.0},
    ]
    semesters, year = shs_semester_summary(subjects, [row(10, "1st", "completed"), row(11, "2nd", "enrolled")])
    assert [(s["key"], s["enrollment_id"], s["general_average"]) for s in semesters] == [
        ("1st_semester", 10, 85), ("2nd_semester", 11, 88),
    ]
    # The mean of the semesters (85, 88), not of the subjects (86).
    assert year == 87


def test_a_semester_not_yet_enrolled_is_empty_not_missing():
    semesters, year = shs_semester_summary(
        [{"semester": "1st_semester", "average": 84.0}], [row(10, "1st", "enrolled")],
    )
    second = semesters[1]
    assert (second["enrollment_id"], second["general_average"]) == (None, None)
    assert year == 84
