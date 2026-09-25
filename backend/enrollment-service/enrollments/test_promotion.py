"""
Section promotion: who goes up, who stays, and closing the year first.

Three of these are regressions that shipped:

- Grade 11 -> 12 failed for every learner. The Grade 12 row was written with
  no semester, which the enrollments CHECK constraint rejects for senior high,
  and each learner was listed twice -- once per Grade 11 semester row.
- A learner with no grade rows at all was promoted: summarize_subjects([])
  finds no failed learning area, so "nothing recorded" passed.
- The per-learner enrollment form still refused anyone with a failed QUARTER,
  while Promote judged the year. The same learner was promoted in bulk and
  refused one at a time.

DB-free (this service cannot build a test database): the managers are swapped
for enrollments.fake_orm.FakeQuerySet, which evaluates the lookups for real.
"""
from contextlib import nullcontext
from itertools import count
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from rest_framework import serializers as drf_serializers
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments import promotion
from enrollments.fake_orm import FakeQuerySet
from enrollments.serializers import EnrollmentSerializer
from enrollments.views import EnrollmentViewSet

factory = APIRequestFactory()
_ids = count(1000)


def student(student_id, last="Cruz", first="Ana"):
    return SimpleNamespace(student_id=student_id, pk=student_id, last_name=last, first_name=first)


def enrollment(st, *, year="2025-2026", grade="Grade 4", section="Rizal",
               status="completed", semester=None, strand=None):
    e_id = next(_ids)
    return SimpleNamespace(
        enrollment_id=e_id, pk=e_id, student=st, student_id=st.student_id,
        school_year=year, grade_level=grade, section=section, strand=strand,
        semester=semester, enrollment_status=status,
    )


def subject(subject_id, name):
    return SimpleNamespace(subject_id=subject_id, subject_name=name)


MATH = subject(1, "Mathematics")
SCIENCE = subject(2, "Science")


def grade(enr, subj, value, remarks=None):
    return SimpleNamespace(
        enrollment_id=enr.enrollment_id, enrollment=enr, subject=subj,
        numeric_grade=value, remarks=remarks,
    )


class EnrollmentStore(FakeQuerySet):
    """Enrollment.objects: the fake queryset, plus create() recording rows."""

    def __init__(self, rows=()):
        super().__init__(rows)
        self.created = []

    def create(self, **kw):
        row = SimpleNamespace(**kw)
        row.enrollment_id = row.pk = next(_ids)
        row.student_id = kw["student"].student_id
        self.created.append(row)
        return row


def _post(action, data, role="registrar"):
    request = Request(factory.post("/api/enrollments/x/", data, format="json"))
    request._full_data = data
    request.user = SimpleNamespace(role=role, user_id=9, is_authenticated=True)
    view = EnrollmentViewSet()
    view.request = request
    view.format_kwarg = None
    return getattr(view, action)(request)


def _run(action, data, enrollments, grades):
    store = EnrollmentStore(enrollments)
    with patch("enrollments.views.Enrollment.objects", new=store), \
         patch("grades.models.Grade.objects", new=FakeQuerySet(grades)), \
         patch("enrollments.views.transaction.atomic", nullcontext):
        response = _post(action, data)
    return response, store


# ── pure rules ───────────────────────────────────────────────────────────────

def test_learner_with_no_grades_is_not_promoted():
    _, skip = promotion.assess([], from_grade_level="Grade 4", to_school_year="2026-2027")
    assert skip["kind"] == promotion.SKIP_NO_GRADES


def test_kindergarten_without_numeric_grades_is_still_promoted():
    """Kinder is assessed by checklist, not numeric grades."""
    _, skip = promotion.assess([], from_grade_level="Kindergarten", to_school_year="2026-2027")
    assert skip is None


def test_failing_a_quarter_but_passing_the_year_promotes():
    e = enrollment(student(1))
    grades = [
        grade(e, MATH, 70, "failed"), grade(e, MATH, 88), grade(e, MATH, 90), grade(e, MATH, 88),
    ]
    avg, skip = promotion.assess(grades, from_grade_level="Grade 4", to_school_year="2026-2027")
    assert skip is None
    assert avg == 84


def test_failing_the_year_is_skipped_as_failed():
    e = enrollment(student(1))
    _, skip = promotion.assess(
        [grade(e, MATH, 70), grade(e, SCIENCE, 85)],
        from_grade_level="Grade 4", to_school_year="2026-2027",
    )
    assert skip["kind"] == promotion.SKIP_FAILED
    assert "Mathematics" in skip["reason"]


def test_failed_learning_areas_matches_promote():
    e = enrollment(student(1))
    passed_year = [grade(e, MATH, 70, "failed"), grade(e, MATH, 90)]
    failed_year = [grade(e, SCIENCE, 72), grade(e, SCIENCE, 74)]
    assert promotion.failed_learning_areas(passed_year) == []
    assert promotion.failed_learning_areas(failed_year) == ["Science"]


def test_one_row_per_learner_keeps_the_newest():
    st = student(1)
    first = enrollment(st, semester="1st")
    second = enrollment(st, semester="2nd")
    assert promotion.one_per_student([first, second]) == [second]


# ── promote view ─────────────────────────────────────────────────────────────

G4 = {
    "from_school_year": "2025-2026", "from_grade_level": "Grade 4",
    "from_section": "Rizal", "to_school_year": "2026-2027",
}


def test_ungraded_learner_is_skipped_and_graded_learner_promoted():
    ana, ben = student(1, "Cruz", "Ana"), student(2, "Reyes", "Ben")
    e_ana, e_ben = enrollment(ana), enrollment(ben)
    response, store = _run("promote_confirm", G4, [e_ana, e_ben], [grade(e_ana, MATH, 88)])

    assert [c.student_id for c in store.created] == [1]
    assert response.data["skipped"][0]["kind"] == promotion.SKIP_NO_GRADES


def test_grade_11_promotes_once_with_semester_and_strand():
    ana = student(1)
    first = enrollment(ana, grade="Grade 11", section="STEM-A", semester="1st", strand="STEM")
    second = enrollment(ana, grade="Grade 11", section="STEM-A", semester="2nd", strand="STEM")
    grades = [grade(first, MATH, 85), grade(second, SCIENCE, 88)]

    response, store = _run("promote_confirm", {
        "from_school_year": "2025-2026", "from_grade_level": "Grade 11",
        "from_section": "STEM-A", "to_school_year": "2026-2027",
    }, [first, second], grades)

    assert response.status_code == 201
    assert len(store.created) == 1
    created = store.created[0]
    assert created.grade_level == "Grade 12"
    assert created.school_level == "senior_highschool"
    assert created.semester == "1st"
    assert created.strand == "STEM"


def test_grade_11_failure_in_first_semester_blocks_promotion():
    ana = student(1)
    first = enrollment(ana, grade="Grade 11", section="STEM-A", semester="1st", strand="STEM")
    second = enrollment(ana, grade="Grade 11", section="STEM-A", semester="2nd", strand="STEM")

    response, store = _run("promote_preview", {
        "from_school_year": "2025-2026", "from_grade_level": "Grade 11",
        "from_section": "STEM-A", "to_school_year": "2026-2027",
    }, [first, second], [grade(first, MATH, 70), grade(second, SCIENCE, 88)])

    assert response.data["to_promote"] == []
    assert response.data["to_skip"][0]["kind"] == promotion.SKIP_FAILED


def test_grade_11_without_a_completed_first_semester_is_skipped():
    ana = student(1)
    second = enrollment(ana, grade="Grade 11", section="STEM-A", semester="2nd", strand="STEM")

    response, _ = _run("promote_preview", {
        "from_school_year": "2025-2026", "from_grade_level": "Grade 11",
        "from_section": "STEM-A", "to_school_year": "2026-2027",
    }, [second], [grade(second, SCIENCE, 88)])

    assert response.data["to_skip"][0]["kind"] == promotion.SKIP_FIRST_SEMESTER


def test_preview_of_an_unclosed_section_lists_who_is_still_enrolled():
    """Nothing completed yet is the normal state at year end -- the preview
    says who to close rather than 404ing."""
    ana = student(1)
    response, _ = _run("promote_preview", G4, [enrollment(ana, status="enrolled")], [])

    assert response.status_code == 200
    assert response.data["to_promote"] == []
    assert [r["student_id"] for r in response.data["still_enrolled"]] == [1]


# ── closing the section's year ───────────────────────────────────────────────

def test_complete_section_closes_only_enrolled_rows_in_that_section():
    enrolled = enrollment(student(1), status="enrolled")
    pending = enrollment(student(2), status="pending")
    other_section = enrollment(student(3), status="enrolled", section="Mabini")

    response, _ = _run("complete_section", {
        "school_year": "2025-2026", "grade_level": "Grade 4", "section": "rizal",
    }, [enrolled, pending, other_section], [])

    assert response.data == {"completed": 1}
    assert enrolled.enrollment_status == "completed"
    assert pending.enrollment_status == "pending"
    assert other_section.enrollment_status == "enrolled"


def test_complete_section_requires_a_semester_for_senior_high():
    response, _ = _run("complete_section", {
        "school_year": "2025-2026", "grade_level": "Grade 11", "section": "STEM-A",
    }, [], [])
    assert response.status_code == 400


# ── the per-learner form asks the same question ─────────────────────────────

def _validate_next_grade(last, grades):

    attrs = {
        "student": last.student, "school_year": "2026-2027",
        "school_level": "elementary", "grade_level": "Grade 5",
        "section": "Rizal", "enrollment_status": "pending",
    }
    with patch("enrollments.serializers.Enrollment.objects", new=FakeQuerySet([last])), \
         patch("grades.models.Grade.objects", new=FakeQuerySet(grades)):
        return EnrollmentSerializer().validate(attrs)


def test_per_learner_path_promotes_a_learner_who_failed_only_a_quarter():
    last = enrollment(student(1))
    _validate_next_grade(last, [grade(last, MATH, 70, "failed"), grade(last, MATH, 90)])


def test_per_learner_path_still_refuses_a_learner_who_failed_the_year():
    last = enrollment(student(1))
    with pytest.raises(drf_serializers.ValidationError) as exc:
        _validate_next_grade(last, [grade(last, MATH, 72), grade(last, MATH, 74)])
    assert "Mathematics" in str(exc.value.detail["grade_level"])


# ── eligibility previews a repeat the way the serializer treats it ───────────

def _eligibility(last, grades, grade_level):
    request = Request(factory.get(
        f"/api/enrollments/eligibility/?student_id={last.student_id}"
        f"&school_level=elementary&grade_level={grade_level}"
    ))
    request.user = SimpleNamespace(role="registrar", user_id=9, is_authenticated=True)
    view = EnrollmentViewSet()
    view.request = request
    view.format_kwarg = None
    last.school_level = "elementary"
    with patch("enrollments.views.Enrollment.objects", new=FakeQuerySet([last])), \
         patch("grades.models.Grade.objects", new=FakeQuerySet(grades)), \
         patch("requirements.models.RequirementType.objects", new=FakeQuerySet([])), \
         patch("requirements.models.StudentRequirementSubmission.objects", new=FakeQuerySet([])):
        return view.eligibility(request).data


def test_repeating_a_failed_grade_needs_no_override():
    last = enrollment(student(1))
    failed_year = [grade(last, MATH, 72), grade(last, MATH, 74)]

    moving_up = _eligibility(last, failed_year, "Grade 5")
    repeating = _eligibility(last, failed_year, "Grade 4")

    assert moving_up["admin_override_required"] is True
    assert repeating["admin_override_required"] is False
    assert repeating["can_repeat"] is True
    assert repeating["blocking_reasons"]  # still reported, just not blocking
