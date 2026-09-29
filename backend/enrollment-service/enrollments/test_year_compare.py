"""
Tests for comparing school years: what each number counts
(enrollments/year_compare.py) and who may ask (SchoolYearViewSet.compare).

No database (see test_school_years.py): build() takes plain rows, and the
view is tested with the queries patched out.
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments import year_compare
from enrollments.views import SchoolYearViewSet

factory = APIRequestFactory()


def _row(enrollment_id, student_id, status="enrolled", level="elementary"):
    return {"enrollment_id": enrollment_id, "student_id": student_id,
            "school_level": level, "enrollment_status": status}


def _grade(student_id, subject_id, grade, remarks=None):
    return {"student_id": student_id, "subject_id": subject_id,
            "numeric_grade": Decimal(str(grade)), "remarks": remarks}


def _build(labels, registered=None, enrollments=None, grades=None, attendance=None,
           sections=None, advisories=None, scholarships=None):
    return year_compare.build(
        labels, set(registered or labels), enrollments or {}, grades or {}, attendance or {},
        sections or {}, advisories or {}, scholarships or {},
    )["years"]


# ── Learners ─────────────────────────────────────────────────────────────────
def test_a_senior_high_learner_with_two_semester_rows_counts_once():
    rows = [_row(1, 10, "completed", "senior_highschool"), _row(2, 10, "enrolled", "senior_highschool")]
    enrollment = year_compare.summarize_enrollment(rows)
    assert enrollment["learners"] == 1
    assert enrollment["by_level"]["senior_highschool"] == 1


def test_pending_and_cancelled_are_not_learners():
    rows = [_row(1, 10), _row(2, 11, "pending"), _row(3, 12, "cancelled"), _row(4, 13, "transferred_out")]
    enrollment = year_compare.summarize_enrollment(rows)
    assert enrollment["learners"] == 2          # 10 and 13
    assert enrollment["pending"] == 1
    assert enrollment["transferred_out"] == 1


def test_a_learner_is_counted_in_the_level_of_their_latest_row():
    rows = [_row(1, 10, "transferred_out", "elementary"), _row(5, 10, "enrolled", "junior_highschool")]
    by_level = year_compare.summarize_enrollment(rows)["by_level"]
    assert by_level["junior_highschool"] == 1
    assert by_level["elementary"] == 0


def test_new_and_returning_compare_with_the_year_before():
    years = _build(
        ["2026-2027"], registered={"2025-2026", "2026-2027"},
        enrollments={
            "2025-2026": [_row(1, 10, "completed"), _row(2, 11, "cancelled")],
            "2026-2027": [_row(3, 10), _row(4, 11), _row(5, 12)],
        },
    )
    enrollment = years[0]["enrollment"]
    assert enrollment["returning"] == 1         # 11's last-year row was cancelled
    assert enrollment["new"] == 2


def test_no_year_before_means_unknown_not_all_new():
    years = _build(["2026-2027"], enrollments={"2026-2027": [_row(1, 10)]})
    assert years[0]["enrollment"]["returning"] is None
    assert years[0]["enrollment"]["new"] is None


def test_came_back_counts_only_learners_who_stayed_to_the_end():
    years = _build(
        ["2025-2026"], registered={"2025-2026", "2026-2027"},
        enrollments={
            "2025-2026": [_row(1, 10, "completed"), _row(2, 11, "completed"), _row(3, 12, "transferred_out")],
            "2026-2027": [_row(4, 10, "pending"), _row(5, 12), _row(6, 11, "cancelled")],
        },
    )
    assert years[0]["enrollment"]["came_back"] == {"count": 1, "of": 2}


def test_came_back_is_unknown_without_a_next_year():
    years = _build(["2025-2026"], enrollments={"2025-2026": [_row(1, 10, "completed")]})
    assert years[0]["enrollment"]["came_back"] is None


# ── Grades and attendance ───────────────────────────────────────────────────
def test_general_average_follows_deped_subject_means():
    # Learner 10: math (70+80)/2 = 75, science 90 -> GA round(82.5) = 83.
    # Learner 11: math 85 -> GA 85. Mean of the two: 84.0.
    grades = [_grade(10, 1, 70), _grade(10, 1, 80), _grade(10, 2, 90), _grade(11, 1, 85)]
    academics = year_compare.summarize_grades(grades)
    assert academics["graded_learners"] == 2
    assert academics["general_average"] == 84.0
    assert academics["passed_all"] == 2         # 10 recovered to 75 in math


def test_passed_all_needs_every_subject_passed_on_the_year():
    grades = [_grade(10, 1, 80), _grade(10, 2, 70), _grade(11, 1, 90, remarks="incomplete")]
    assert year_compare.summarize_grades(grades)["passed_all"] == 0


def test_no_grades_is_no_average():
    assert year_compare.summarize_grades([]) == {
        "graded_learners": 0, "general_average": None, "passed_all": 0,
    }


def test_attendance_rate_counts_late_as_present_and_excused_against():
    assert year_compare.attendance_rate({"P": 90, "L": 5, "A": 3, "E": 2}) == 95.0
    assert year_compare.attendance_rate({}) is None


def test_build_fills_every_part_for_each_year_oldest_first():
    years = _build(
        ["2025-2026", "2026-2027"],
        sections={"2026-2027": 12},
        advisories={"2026-2027": {"sections": 10, "advisers": 9}},
        scholarships={"2025-2026": 4},
        attendance={"2026-2027": {"P": 3, "A": 1}},
    )
    assert [y["label"] for y in years] == ["2025-2026", "2026-2027"]
    assert years[0]["sections"] == {"total": 0, "with_adviser": 0, "advisers": 0}
    assert years[1]["sections"] == {"total": 12, "with_adviser": 10, "advisers": 9}
    assert years[0]["scholarships"] == {"awarded": 4}
    assert years[1]["academics"]["attendance_rate"] == 75.0


# ── The endpoint ─────────────────────────────────────────────────────────────
def _compare(query, role="admin", registered=("2024-2025", "2025-2026", "2026-2027")):
    request = Request(factory.get(f"/api/school-years/compare/{query}"))
    request.user = SimpleNamespace(role=role, user_id=1, is_authenticated=True)
    view = SchoolYearViewSet()
    view.request, view.format_kwarg, view.action = request, None, "compare"
    with patch("enrollments.views.SchoolYear.objects") as years, \
         patch("enrollments.views.year_compare.gather", return_value={"years": []}) as gather:
        years.values_list.return_value = list(registered)
        response = view.compare(request)
    return response, gather


def test_compare_reads_the_years_oldest_first_and_normalized():
    response, gather = _compare("?years=2026-2027,2024-2025,%202026-2027")
    assert response.status_code == 200
    labels, registered = gather.call_args.args
    assert labels == ["2024-2025", "2026-2027"]
    assert "2025-2026" in registered


def test_compare_is_admin_only():
    response, gather = _compare("?years=2025-2026", role="registrar")
    assert response.status_code == 403
    gather.assert_not_called()


def test_compare_needs_a_year():
    response, gather = _compare("")
    assert response.status_code == 400
    gather.assert_not_called()


def test_compare_refuses_an_unregistered_year():
    response, _ = _compare("?years=2025-2026,2019-2020")
    assert response.status_code == 400
    assert "2019-2020" in response.data["detail"]


def test_compare_refuses_a_malformed_year():
    response, _ = _compare("?years=2025-26")
    assert response.status_code == 400


def test_compare_caps_the_number_of_years():
    registered = [f"{y}-{y + 1}" for y in range(2020, 2027)]
    response, gather = _compare("?years=" + ",".join(registered), registered=registered)
    assert response.status_code == 400
    gather.assert_not_called()
