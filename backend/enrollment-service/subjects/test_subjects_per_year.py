"""
Tests for subjects per school year: a subject is made for one registered year
and stays there, its code is unique within that year, grades and score
entries only use their enrollment's year's subjects, an archived year's
subjects are locked, and an earlier year's curriculum carries over.

No database (see enrollments/test_school_years.py): the ORM is mocked.
"""
from contextlib import nullcontext
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from rest_framework import serializers
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.archive import YearArchived
from enrollments.models import SchoolYear
from enrollments.views import SchoolYearViewSet
from grades.serializers import GradeSerializer
from grading.serializers import ScoreEntrySerializer
from subjects.models import Subject
from subjects.serializers import SubjectSerializer
from subjects.views import SubjectViewSet

factory = APIRequestFactory()


# ── Year and code ────────────────────────────────────────────────────────────
def _validate(attrs, instance=None, registered=True, clash=False):
    serializer = SubjectSerializer(instance=instance)
    with patch("enrollments.models.SchoolYear.objects") as years, \
         patch("subjects.serializers.Subject.objects") as subjects:
        years.filter.return_value.exists.return_value = registered
        found = subjects.filter.return_value
        found.exclude.return_value.exists.return_value = clash
        found.exists.return_value = clash
        result = serializer._validate_year_and_code(dict(attrs))
    return result, subjects


def test_a_new_subject_needs_a_year():
    with pytest.raises(serializers.ValidationError) as err:
        _validate({"subject_code": "MATH-7"})
    assert "school_year" in err.value.detail


def test_a_new_subject_needs_a_registered_year():
    with pytest.raises(serializers.ValidationError) as err:
        _validate({"school_year": "2030-2031", "subject_code": "MATH-7"}, registered=False)
    assert "hasn't been set up" in str(err.value.detail["school_year"])


def test_a_code_is_unique_within_its_year_any_capitalisation():
    with pytest.raises(serializers.ValidationError) as err:
        _validate({"school_year": "2026-2027", "subject_code": " math-7 "}, clash=True)
    assert str(err.value.detail["subject_code"]) == "S.Y. 2026-2027 already has a subject coded math-7."


def test_the_same_code_in_another_year_is_fine():
    attrs, subjects = _validate({"school_year": "2026-2027", "subject_code": "MATH-7"})
    assert attrs["school_year"] == "2026-2027"
    subjects.filter.assert_called_with(school_year="2026-2027", subject_code__iexact="MATH-7")


def test_a_subject_stays_in_its_year():
    existing = Subject(subject_id=1, school_year="2025-2026", subject_code="MATH-7")
    with pytest.raises(serializers.ValidationError) as err:
        _validate({"school_year": "2026-2027"}, instance=existing)
    assert "stays in its school year" in str(err.value.detail["school_year"])


def test_renaming_a_code_checks_its_own_year_but_not_itself():
    existing = Subject(subject_id=1, school_year="2025-2026", subject_code="MATH-7")
    attrs, subjects = _validate({"subject_code": "MATH-7A"}, instance=existing)
    assert attrs["subject_code"] == "MATH-7A"
    subjects.filter.assert_called_with(school_year="2025-2026", subject_code__iexact="MATH-7A")
    subjects.filter.return_value.exclude.assert_called_with(pk=1)


# ── Archived years are locked ────────────────────────────────────────────────
def test_an_archived_years_subjects_cant_be_added():
    view = SubjectViewSet()
    serializer = MagicMock(validated_data={"school_year": "2024-2025"})
    with patch("enrollments.archive.archived_among", return_value={"2024-2025"}):
        with pytest.raises(YearArchived):
            view.perform_create(serializer)
    serializer.save.assert_not_called()


def test_an_archived_years_subjects_cant_be_deleted():
    view = SubjectViewSet()
    instance = MagicMock(school_year="2024-2025", school_year_id=None)
    with patch("enrollments.archive.archived_among", return_value={"2024-2025"}):
        with pytest.raises(YearArchived):
            view.perform_destroy(instance)
    instance.delete.assert_not_called()


# ── Grades and scores use their enrollment's year's subjects ─────────────────
def _enrollment(year="2025-2026"):
    return SimpleNamespace(school_year=year, school_level="junior_highschool", grade_level="Grade 7")


def _subject(year):
    return SimpleNamespace(school_year=year, school_level="junior_highschool", grade_level="Grade 7",
                           subject_name="Mathematics 7")


def test_a_grade_cant_use_another_years_subject():
    with patch("grades.serializers.Grade.objects"):
        with pytest.raises(serializers.ValidationError) as err:
            GradeSerializer().validate({
                "enrollment": _enrollment("2025-2026"), "subject": _subject("2026-2027"),
                "grading_period": "1st_quarter",
            })
    assert "S.Y. 2026-2027 subject" in str(err.value.detail["subject"])


def test_a_grade_on_its_own_years_subject_is_fine():
    with patch("grades.serializers.Grade.objects") as grades:
        grades.filter.return_value.exists.return_value = False
        attrs = GradeSerializer().validate({
            "enrollment": _enrollment("2025-2026"), "subject": _subject("2025-2026"),
            "grading_period": "1st_quarter",
        })
    assert attrs["subject"].school_year == "2025-2026"


def test_a_score_cant_use_another_years_subject():
    with pytest.raises(serializers.ValidationError) as err:
        ScoreEntrySerializer().validate({
            "enrollment": _enrollment("2025-2026"), "subject": _subject("2026-2027"),
            "score": 8, "max_score": 10,
        })
    assert "S.Y. 2026-2027 subject" in str(err.value.detail["subject"])


# ── Carry-over ───────────────────────────────────────────────────────────────
def _year(label, pk):
    first = int(label[:4])
    return SchoolYear(school_year_id=pk, label=label,
                      start_date=date(first, 6, 1), end_date=date(first + 1, 3, 31))


def _row(code, name, grade="Grade 7", template=3):
    return Subject(subject_code=code, subject_name=name, school_level="junior_highschool",
                   grade_level=grade, strand=None, semester=None, grading_template_id=template,
                   school_year="2025-2026")


def _carry(body, source_subjects=(), target_codes=()):
    source, target = _year("2025-2026", 1), _year("2026-2027", 2)
    request = Request(factory.post("/api/school-years/2026-2027/carry-over/", body, format="json"),
                      parsers=[JSONParser()])
    request.user = SimpleNamespace(role="admin", user_id=1, is_authenticated=True)
    view = SchoolYearViewSet()
    view.request, view.format_kwarg, view.action = request, None, "carry_over"
    view.kwargs = {"label": "2026-2027"}

    def subject_filter(school_year):
        qs = MagicMock()
        if school_year == "2025-2026":
            qs.order_by.return_value = list(source_subjects)
        else:
            qs.values_list.return_value = list(target_codes)
        return qs

    with patch.object(view, "get_object", return_value=target), \
         patch("enrollments.views.SchoolYear.objects") as years, \
         patch("subjects.models.Subject.objects") as subjects, \
         patch("enrollments.views.transaction.atomic", return_value=nullcontext()):
        years.filter.return_value.first.return_value = source
        subjects.filter.side_effect = subject_filter
        response = view.carry_over(request, label="2026-2027")
    return response, subjects


def test_carry_over_copies_the_curriculum_and_skips_codes_already_here():
    response, subjects = _carry(
        {"from": "2025-2026", "parts": ["subjects"]},
        source_subjects=[_row("MATH-7", "Mathematics 7"), _row("SCI-7", "Science 7")],
        target_codes=["math-7"],
    )
    assert response.status_code == 200
    result = response.data["subjects"]
    assert [r["subject_code"] for r in result["copied"]] == ["SCI-7"]
    assert [r["subject_code"] for r in result["skipped"]] == ["MATH-7"]
    assert "grading_template_id" not in result["copied"][0]

    [created] = subjects.bulk_create.call_args.args[0]
    assert (created.school_year, created.subject_code, created.grading_template_id) == ("2026-2027", "SCI-7", 3)


def test_carry_over_dry_run_writes_nothing():
    response, subjects = _carry(
        {"from": "2025-2026", "parts": ["subjects"], "dry_run": True},
        source_subjects=[_row("MATH-7", "Mathematics 7")],
    )
    assert [r["subject_code"] for r in response.data["subjects"]["copied"]] == ["MATH-7"]
    subjects.bulk_create.assert_not_called()
