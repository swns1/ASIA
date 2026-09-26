"""
The enrollment-service QA pass (2026-09-26): each test is one finding that a
rolled-back probe against the real database showed going wrong.

- An edit could move an enrollment to any status, so Pending -> Cancelled ->
  Enrolled walked past the document check Pending -> Enrolled enforces.
- An edit could hand an enrollment (grades, attendance, invoice) to another
  student, or move it to another school year with no reason and no trace.
- DELETE cascaded a learner's grades and attendance away.
- A cancelled application made a walk-in "continuing" at the document check.
- Promote accepted any target year, including the same one and "next year".
- The per-learner Grade 11 -> 12 check read one semester of two, and Grade 12
  2nd semester could be entered straight after Grade 11.
- The API took contradictory placements: elementary Grade 11, "Grade 99".
- Transfer-in could be recorded any number of times, on any row, any date.

DB-free: managers are swapped for enrollments.fake_orm.FakeQuerySet.
"""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from rest_framework import serializers as drf_serializers
from rest_framework.exceptions import MethodNotAllowed, ValidationError
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments import rules
from enrollments.fake_orm import FakeQuerySet
from enrollments.serializers import EnrollmentSerializer
from enrollments.views import EnrollmentViewSet
from shared import school_year

factory = APIRequestFactory()


def student(student_id=42):
    return SimpleNamespace(student_id=student_id, pk=student_id)


ANA = student(42)
BEN = student(43)


def row(e_id, st, *, year, status, grade, level, semester=None, strand=None):
    return SimpleNamespace(
        enrollment_id=e_id, pk=e_id, student=st, student_id=st.student_id,
        school_year=year, enrollment_status=status, grade_level=grade,
        school_level=level, semester=semester, strand=strand, section="Rizal",
    )


def grade(enrollment, name, value, subject_id=None):
    return SimpleNamespace(
        enrollment=enrollment, enrollment_id=enrollment.enrollment_id,
        subject=SimpleNamespace(subject_id=subject_id or hash(name) % 1000, subject_name=name),
        numeric_grade=Decimal(value), remarks=None,
    )


def validate(attrs, *, instance=None, rows=(), grades=(), submitted=(), catalogue=()):
    serializer = EnrollmentSerializer()
    serializer.instance = instance
    with patch("enrollments.serializers.Enrollment.objects", new=FakeQuerySet(rows)), \
         patch("grades.models.Grade.objects", new=FakeQuerySet(grades)), \
         patch("requirements.models.RequirementType.objects.filter", return_value=list(catalogue)), \
         patch("requirements.models.StudentRequirementSubmission.objects.filter") as subs:
        subs.return_value.values_list.return_value = list(submitted)
        return serializer.validate(dict(attrs))


# ── the shared rules ────────────────────────────────────────────────────────

@pytest.mark.parametrize("old,new", [
    ("pending", "enrolled"), ("pending", "cancelled"), ("enrolled", "completed"),
    ("enrolled", "cancelled"), ("cancelled", "pending"), ("completed", "enrolled"),
])
def test_allowed_status_changes(old, new):
    assert rules.status_change_problem(old, new) is None


@pytest.mark.parametrize("old,new", [
    ("cancelled", "enrolled"), ("completed", "pending"), ("transferred_out", "enrolled"),
    ("enrolled", "transferred_out"), ("enrolled", "pending"),
])
def test_refused_status_changes(old, new):
    assert rules.status_change_problem(old, new)


def test_cancelled_to_enrolled_says_to_go_through_pending():
    assert "Pending first" in rules.status_change_problem("cancelled", "enrolled")


@pytest.mark.parametrize("level,grade_level,strand,field", [
    ("elementary", "Grade 11", "STEM", "school_level"),
    ("senior_highschool", "Grade 3", None, "school_level"),
    ("senior_highschool", "Grade 11", "", "strand"),
    ("elementary", "Grade 99", None, "grade_level"),
])
def test_contradictory_placements(level, grade_level, strand, field):
    problems = rules.placement_problems(school_level=level, grade_level=grade_level, strand=strand)
    assert field in problems


def test_consistent_placements():
    assert rules.placement_problems(school_level="elementary", grade_level="Grade 4", strand=None) == {}
    assert rules.placement_problems(
        school_level="senior_highschool", grade_level="Grade 12", strand="ABM",
    ) == {}


def test_school_year_window():
    assert rules.date_outside_school_year(date(2031, 2, 28), "2026-2027")
    assert rules.date_outside_school_year(date(2025, 12, 1), "2026-2027")
    assert rules.date_outside_school_year(date(2026, 9, 25), "2026-2027") is None
    assert rules.date_outside_school_year(date(2027, 3, 31), "2026-2027") is None


def test_following_school_year():
    assert school_year.following("2025-2026") == "2026-2027"
    with pytest.raises(school_year.InvalidSchoolYear):
        school_year.following("next year")


# ── what an edit may change ─────────────────────────────────────────────────

def test_cancelled_cannot_jump_back_to_enrolled():
    """The route around the document check: cancel, then enroll."""
    instance = row(500, ANA, year="2026-2027", status="cancelled", grade="Nursery", level="nursery")
    with pytest.raises(drf_serializers.ValidationError) as exc:
        validate({"enrollment_status": "enrolled"}, instance=instance)
    assert "enrollment_status" in exc.value.detail


def test_transferred_out_is_set_only_by_its_action():
    instance = row(500, ANA, year="2026-2027", status="enrolled", grade="Grade 4", level="elementary")
    with pytest.raises(drf_serializers.ValidationError) as exc:
        validate({"enrollment_status": "transferred_out"}, instance=instance)
    assert "Transfer Out" in str(exc.value.detail)


def test_the_learner_on_an_enrollment_cannot_be_changed():
    instance = row(500, ANA, year="2024-2025", status="completed", grade="Grade 2", level="elementary")
    with pytest.raises(drf_serializers.ValidationError) as exc:
        validate({"student": BEN}, instance=instance)
    assert "student" in exc.value.detail


def test_resending_the_same_learner_is_fine():
    """The edit form sends the whole record back, student included."""
    instance = row(500, ANA, year="2026-2027", status="enrolled", grade="Grade 4", level="elementary")
    attrs = validate({"student": ANA, "section": "Luna"}, instance=instance)
    assert attrs["student"] is ANA


def test_moving_school_year_needs_an_override_and_a_reason():
    instance = row(500, ANA, year="2024-2025", status="completed", grade="Grade 2", level="elementary")
    with pytest.raises(drf_serializers.ValidationError) as exc:
        validate({"school_year": "2023-2024"}, instance=instance)
    assert "school_year" in str(exc.value.detail)

    attrs = validate(
        {"school_year": "2023-2024", "progression_override": True,
         "progression_override_reason": "Typed into the wrong year"},
        instance=instance,
    )
    assert attrs["school_year"] == "2023-2024"


def test_a_contradictory_placement_is_refused_on_create():
    with pytest.raises(drf_serializers.ValidationError) as exc:
        validate({
            "student": ANA, "school_year": "2026-2027", "school_level": "elementary",
            "grade_level": "Grade 11", "section": "X", "strand": "STEM",
            "enrollment_status": "pending",
        })
    assert "school_level" in exc.value.detail


# ── the document check counts only years actually attended ──────────────────

GOOD_MORAL = SimpleNamespace(
    requirement_type_id=3, requirement_name="Certificate of Good Moral", is_required=True,
    applies_to_levels=["junior_highschool"], applies_to_entry_statuses=["transferee"],
)


def test_a_cancelled_application_does_not_make_a_walk_in_continuing():
    old = row(90, ANA, year="2026-2027", status="cancelled", grade="Grade 7", level="junior_highschool")
    with pytest.raises(drf_serializers.ValidationError) as exc:
        validate({
            "student": ANA, "school_year": "2026-2027", "school_level": "junior_highschool",
            "grade_level": "Grade 7", "section": "Rizal", "enrollment_status": "enrolled",
        }, rows=[old], catalogue=[GOOD_MORAL])
    assert "transferee" in str(exc.value.detail)
    assert "Good Moral" in str(exc.value.detail)


def test_a_completed_year_still_makes_a_learner_continuing():
    last_year = row(80, ANA, year="2025-2026", status="completed", grade="Grade 6", level="elementary")
    grades = [grade(last_year, "Mathematics", "88")]
    attrs = validate({
        "student": ANA, "school_year": "2026-2027", "school_level": "junior_highschool",
        "grade_level": "Grade 7", "section": "Rizal", "enrollment_status": "enrolled",
    }, rows=[last_year], grades=grades, catalogue=[GOOD_MORAL])
    assert attrs["grade_level"] == "Grade 7"


# ── moving up is judged the way Promote judges it ──────────────────────────

def _g11_year(first_sem_math):
    first = row(1, ANA, year="2025-2026", status="completed", grade="Grade 11",
                level="senior_highschool", semester="1st", strand="STEM")
    second = row(2, ANA, year="2025-2026", status="completed", grade="Grade 11",
                 level="senior_highschool", semester="2nd", strand="STEM")
    grades = [
        grade(first, "General Mathematics", first_sem_math, subject_id=1),
        grade(second, "Personal Development", "88", subject_id=2),
    ]
    return [first, second], grades


def _g12(semester="1st"):
    return {
        "student": ANA, "school_year": "2026-2027", "school_level": "senior_highschool",
        "grade_level": "Grade 12", "section": "Luna", "strand": "STEM",
        "semester": semester, "enrollment_status": "pending",
    }


def test_a_failed_first_semester_subject_blocks_grade_12():
    """Only the 2nd semester used to be read, so this learner went through."""
    rows, grades = _g11_year(first_sem_math="70")
    with pytest.raises(drf_serializers.ValidationError) as exc:
        validate(_g12(), rows=rows, grades=grades)
    assert "General Mathematics" in str(exc.value.detail)


def test_a_passed_grade_11_year_moves_up():
    rows, grades = _g11_year(first_sem_math="84")
    assert validate(_g12(), rows=rows, grades=grades)["grade_level"] == "Grade 12"


def test_grade_12_opens_with_its_first_semester():
    rows, grades = _g11_year(first_sem_math="84")
    with pytest.raises(drf_serializers.ValidationError) as exc:
        validate(_g12(semester="2nd"), rows=rows, grades=grades)
    assert "semester" in exc.value.detail


def test_no_grades_recorded_is_not_a_pass():
    last_year = row(80, ANA, year="2025-2026", status="completed", grade="Grade 4", level="elementary")
    with pytest.raises(drf_serializers.ValidationError) as exc:
        validate({
            "student": ANA, "school_year": "2026-2027", "school_level": "elementary",
            "grade_level": "Grade 5", "section": "Rizal", "enrollment_status": "pending",
        }, rows=[last_year])
    assert "no final grades" in str(exc.value.detail)


def test_kindergarten_moves_up_without_numeric_grades():
    last_year = row(80, ANA, year="2025-2026", status="completed", grade="Kindergarten", level="kindergarten")
    attrs = validate({
        "student": ANA, "school_year": "2026-2027", "school_level": "elementary",
        "grade_level": "Grade 1", "section": "Rizal", "enrollment_status": "pending",
    }, rows=[last_year])
    assert attrs["grade_level"] == "Grade 1"


# ── views ───────────────────────────────────────────────────────────────────

def _view(method, path, data=None, *, role="registrar", user_id=1):
    maker = getattr(factory, method)
    request = Request(maker(path, data or {}, format="json"))
    if data is not None:
        request._full_data = data
    request.user = SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)
    view = EnrollmentViewSet()
    view.request = request
    view.format_kwarg = None
    view.kwargs = {}
    return view, request


def test_enrollments_cannot_be_deleted():
    view, request = _view("delete", "/api/enrollments/5/")
    with pytest.raises(MethodNotAllowed) as exc:
        view.destroy(request, pk=5)
    assert "Cancel" in str(exc.value.detail)


@pytest.mark.parametrize("to_year", ["2025-2026", "2031-2032", "next year"])
def test_promote_only_into_the_following_year(to_year):
    body = {"from_school_year": "2025-2026", "from_grade_level": "Grade 4",
            "from_section": "Rizal", "to_school_year": to_year}
    view, request = _view("post", "/api/enrollments/promote/confirm/", body)
    with patch("enrollments.views.Enrollment.objects", new=FakeQuerySet([])):
        response = view.promote_confirm(request)
    assert response.status_code == 400


def test_eligibility_rejects_a_non_numeric_student_id():
    view, request = _view("get", "/api/enrollments/eligibility/?student_id=abc")
    with pytest.raises(ValidationError):
        view.eligibility(request)


def _transfer_in(enrollment, body, existing=()):
    view, request = _view("post", f"/api/enrollments/{enrollment.pk}/transfer-in/", body)
    with patch.object(EnrollmentViewSet, "get_object", return_value=enrollment), \
         patch("enrollments.views.EnrollmentTransfer.objects") as transfers:
        transfers.filter.return_value.exists.return_value = bool(existing)
        response = view.transfer_in(request, pk=enrollment.pk)
    return response, transfers


def test_transfer_in_is_refused_on_a_closed_year():
    old = row(208, ANA, year="2024-2025", status="completed", grade="Grade 2", level="elementary")
    response, transfers = _transfer_in(old, {"effective_date": "2024-07-01"})
    assert response.status_code == 409
    transfers.create.assert_not_called()


def test_transfer_in_is_recorded_once():
    new = row(600, ANA, year="2026-2027", status="pending", grade="Grade 7", level="junior_highschool")
    response, transfers = _transfer_in(new, {"effective_date": "2026-08-01"}, existing=[1])
    assert response.status_code == 409
    transfers.create.assert_not_called()


def test_transfer_in_date_must_fall_in_the_school_year():
    new = row(600, ANA, year="2026-2027", status="pending", grade="Grade 7", level="junior_highschool")
    response, transfers = _transfer_in(new, {"effective_date": "2030-01-01"})
    assert response.status_code == 400
    transfers.create.assert_not_called()
