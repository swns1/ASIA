"""
What a grade, observed-values mark, score or attendance record may be written
against -- the enrollment-service QA pass (2026-09-26).

Probes against the real database accepted each of these:
- a grade on a cancelled enrollment, and a 70 marked "passed";
- an observed-values mark with a senior high period on an elementary row;
- a 2nd-semester grade on a learner's 1st-semester enrollment;
- attendance dated 2031 on a 2026-2027 roster;
- a negative score, which the database then refused with a 500.

Also here, because they are the same kind of rule: who may be a section
adviser, who may open a learner's document checklist, and what deleting an
in-use record answers.
"""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.db.models import RestrictedError
from rest_framework import serializers as drf_serializers
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from attendance.serializers import attendance_problem
from enrollment_service.deletes import InUseDeleteMixin
from enrollments.fake_orm import FakeQuerySet
from enrollments.serializers import SectionAdvisorySerializer
from grades.serializers import GradeSerializer, period_problem
from grading.serializers import ScoreEntrySerializer

factory = APIRequestFactory()


def enrollment(status="enrolled", level="elementary", grade="Grade 4", semester=None,
               year="2026-2027", strand=None):
    return SimpleNamespace(
        enrollment_id=7, pk=7, enrollment_status=status, school_level=level,
        grade_level=grade, semester=semester, school_year=year, strand=strand,
    )


def subject(level="elementary", grade="Grade 4", semester=None, strand=None, template=1):
    return SimpleNamespace(
        subject_id=3, subject_name="Mathematics", school_level=level, grade_level=grade,
        semester=semester, strand=strand, grading_template_id=template,
    )


# ── periods ─────────────────────────────────────────────────────────────────

def test_a_senior_high_row_takes_only_its_own_semester():
    first_sem = enrollment(level="senior_highschool", grade="Grade 11", semester="1st")
    assert period_problem(first_sem, "1st_semester") is None
    assert period_problem(first_sem, "2nd_semester")
    assert period_problem(first_sem, "1st_quarter")


def test_other_levels_take_quarters():
    assert period_problem(enrollment(), "3rd_quarter") is None
    assert period_problem(enrollment(), "1st_semester")
    assert period_problem(enrollment(), "banana")


# ── grades ──────────────────────────────────────────────────────────────────

def grade_validate(attrs, instance=None):
    serializer = GradeSerializer()
    serializer.instance = instance
    with patch("grades.serializers.Grade.objects", new=FakeQuerySet([])):
        return serializer.validate(dict(attrs))


def test_no_grades_on_a_cancelled_enrollment():
    with pytest.raises(drf_serializers.ValidationError) as exc:
        grade_validate({"enrollment": enrollment(status="cancelled"), "subject": subject(),
                        "grading_period": "1st_quarter", "numeric_grade": Decimal("88")})
    assert "enrollment" in exc.value.detail


def test_completed_rows_can_still_be_corrected():
    attrs = grade_validate({"enrollment": enrollment(status="completed"), "subject": subject(),
                            "grading_period": "4th_quarter", "numeric_grade": Decimal("88")})
    assert attrs["remarks"] == "passed"


@pytest.mark.parametrize("value,sent,expected", [
    ("70", "passed", "failed"),
    ("75", None, "passed"),
    ("90", "failed", "passed"),
    ("70", "incomplete", "incomplete"),
    ("88", "dropped", "dropped"),
])
def test_passed_or_failed_follows_the_number(value, sent, expected):
    attrs = grade_validate({"enrollment": enrollment(), "subject": subject(),
                            "grading_period": "1st_quarter", "numeric_grade": Decimal(value),
                            "remarks": sent})
    assert attrs["remarks"] == expected


def test_a_senior_high_subject_belongs_to_one_semester():
    first_sem = enrollment(level="senior_highschool", grade="Grade 11", semester="1st", strand="STEM")
    second_sem_subject = subject(level="senior_highschool", grade="Grade 11", semester="2nd")
    with pytest.raises(drf_serializers.ValidationError) as exc:
        grade_validate({"enrollment": first_sem, "subject": second_sem_subject,
                        "grading_period": "1st_semester", "numeric_grade": Decimal("85")})
    assert "subject" in exc.value.detail


def test_a_strand_subject_belongs_to_its_strand():
    abm = enrollment(level="senior_highschool", grade="Grade 11", semester="1st", strand="ABM")
    stem_subject = subject(level="senior_highschool", grade="Grade 11", semester="1st", strand="STEM")
    with pytest.raises(drf_serializers.ValidationError):
        grade_validate({"enrollment": abm, "subject": stem_subject,
                        "grading_period": "1st_semester", "numeric_grade": Decimal("85")})


# ── scores ──────────────────────────────────────────────────────────────────

def score_validate(**attrs):
    base = {"enrollment": enrollment(), "subject": subject(),
            "grading_component": SimpleNamespace(grading_template_id=1),
            "grading_period": "1st_quarter", "score": Decimal("8"), "max_score": Decimal("10")}
    base.update(attrs)
    return ScoreEntrySerializer().validate(base)


@pytest.mark.parametrize("attrs,field", [
    ({"score": Decimal("-20")}, "score"),
    ({"max_score": Decimal("0"), "score": Decimal("0")}, "max_score"),
    ({"grading_period": "banana"}, "grading_period"),
    ({"subject": subject(grade="Grade 12", level="senior_highschool", semester="1st")}, "subject"),
    ({"grading_component": SimpleNamespace(grading_template_id=9)}, "grading_component"),
    ({"enrollment": enrollment(status="pending")}, "enrollment"),
])
def test_score_entry_is_refused_with_a_reason(attrs, field):
    with pytest.raises(drf_serializers.ValidationError) as exc:
        score_validate(**attrs)
    assert field in exc.value.detail


def test_a_valid_score_passes():
    assert score_validate()["score"] == Decimal("8")


# ── attendance ──────────────────────────────────────────────────────────────

@patch("attendance.serializers.timezone.localdate", return_value=date(2026, 9, 26))
def test_attendance_rules(_today):
    assert attendance_problem(enrollment(), date(2026, 9, 25)) is None
    assert "hasn't happened" in attendance_problem(enrollment(), date(2026, 9, 27))
    assert attendance_problem(enrollment(year="2024-2025"), date(2026, 9, 25))
    assert attendance_problem(enrollment(status="cancelled"), date(2026, 9, 25))


# ── advisers ────────────────────────────────────────────────────────────────

def _users_row(result):
    connection = MagicMock()
    connection.cursor.return_value.__enter__.return_value.fetchone.return_value = result
    return patch("django.db.connection", connection)


@pytest.mark.parametrize("result,message", [
    (None, "No user account"),
    (("guardian", True), "must be a teacher"),
    (("teacher", False), "deactivated"),
])
def test_an_adviser_is_an_active_teacher(result, message):
    with _users_row(result):
        with pytest.raises(drf_serializers.ValidationError) as exc:
            SectionAdvisorySerializer().validate_teacher_user_id(987654)
    assert message in str(exc.value.detail)


def test_an_active_teacher_can_advise():
    with _users_row(("teacher", True)):
        assert SectionAdvisorySerializer().validate_teacher_user_id(34) == 34


# ── the document checklist ──────────────────────────────────────────────────

def _summary(role, student_id=151, *, teacher_roster=frozenset()):
    from requirements.views import StudentRequirementSubmissionViewSet

    request = Request(factory.get(f"/api/student-requirement-submissions/summary/?student_id={student_id}"))
    request.user = SimpleNamespace(role=role, user_id=5, is_authenticated=True)
    view = StudentRequirementSubmissionViewSet()
    view.request, view.format_kwarg = request, None
    with patch("requirements.views.teacher_student_ids", return_value=set(teacher_roster)), \
         patch("requirements.views.RequirementType.objects.filter", return_value=[]), \
         patch("requirements.views.StudentRequirementSubmission.objects.filter") as subs:
        subs.return_value.select_related.return_value = []
        return view.summary(request)


def test_accounting_cannot_open_a_learners_documents():
    assert _summary("accounting").status_code == 403


def test_a_teacher_sees_only_their_own_learners_documents():
    assert _summary("teacher", teacher_roster={9}).status_code == 403
    assert _summary("teacher", student_id=9, teacher_roster={9}).status_code == 200


def test_registrar_still_can():
    assert _summary("registrar").status_code == 200


def test_a_non_numeric_student_id_is_a_400():
    assert _summary("registrar", student_id="abc").status_code == 400


# ── deleting something still in use ─────────────────────────────────────────

class _Deleting(InUseDeleteMixin):
    in_use_message = "In use."

    def __init__(self, error=None):
        self.error = error

    def get_object(self):
        return object()

    def perform_destroy(self, instance):
        if self.error:
            raise self.error


@patch("enrollment_service.deletes.transaction.atomic", MagicMock())
def test_an_in_use_delete_is_a_409_not_a_500():
    response = _Deleting(RestrictedError("restricted", set())).destroy(None)
    assert response.status_code == 409
    assert response.data == {"detail": "In use.", "code": "in_use"}


@patch("enrollment_service.deletes.transaction.atomic", MagicMock())
def test_a_free_delete_goes_through():
    assert _Deleting().destroy(None).status_code == 204
