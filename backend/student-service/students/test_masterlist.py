"""
The Students masterlist, scoped by school year (2026-10-05).

- ?school_year= alone lists that year's learners, a closed year included, and
  ?section= narrows it to one class. Each learner listed carries `placement`.
- ?ordering=placement reads like a class list, and every ordering ends on
  student_id so a page boundary can't split ties two ways.
- ?unenrolled= follows shared.placement: active learners only, and a
  completed row holds the place. For last year it listed all 551 students.
- /counts/ counts each tile and chip inside every other filter that is on;
  the tiles used to read 551 whatever was picked.

No @pytest.mark.django_db -- this service's test database can't be built (see
intake/test_invites.py). Querysets are checked by their shape, and mocked
wherever a query would run.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from shared import placement
from students.models import Student
from students.serializers import PlacementMixin, StudentBillingSummarySerializer, StudentSerializer
from students.views import (
    StudentOrderingFilter,
    StudentViewSet,
    _filter_students,
    _placements,
    _school_year_param,
)

factory = APIRequestFactory()
MIRROR = "accounts.enrollment_mirror.EnrollmentMirror"


def _view(query="", action="list"):
    request = Request(factory.get(f"/api/students/?{query}"))
    request.user = SimpleNamespace(role="registrar", user_id=1, is_authenticated=True)
    view = StudentViewSet()
    view.request, view.action, view.format_kwarg, view.kwargs = request, action, None, {}
    return view


class TestYearParameters:
    def test_a_year_is_read_in_its_canonical_form(self):
        assert _school_year_param({"school_year": " 2026-2027 "}, "school_year") == "2026-2027"
        assert _school_year_param({"school_year": ""}, "school_year") is None
        assert _school_year_param({}, "school_year") is None

    def test_a_malformed_year_is_a_400_not_an_empty_list(self):
        with pytest.raises(serializers.ValidationError) as exc:
            _school_year_param({"unenrolled": "2026-27"}, "unenrolled")
        assert "unenrolled" in exc.value.detail


class TestYearRoll:
    def test_a_year_alone_lists_everyone_with_a_row_in_it_that_was_not_cancelled(self):
        with patch(MIRROR) as mirror:
            rows = _placements({"school_year": "2025-2026"})
        mirror.objects.filter.assert_called_once_with(school_year="2025-2026")
        mirror.objects.filter.return_value.exclude.assert_called_once_with(enrollment_status="cancelled")
        assert rows is mirror.objects.filter.return_value.exclude.return_value

    def test_a_section_narrows_it_to_one_class(self):
        with patch(MIRROR) as mirror:
            _placements({"school_year": "2026-2027", "grade_level": "Grade 7", "section": "Diamond"})
        chain = mirror.objects.filter.return_value.exclude.return_value
        chain.filter.assert_called_once_with(grade_level="Grade 7")
        chain.filter.return_value.filter.assert_called_once_with(section="Diamond")

    def test_no_placement_filter_no_lookup(self):
        with patch(MIRROR) as mirror:
            assert _placements({"status": "active"}) is None
        mirror.objects.filter.assert_not_called()

    def test_the_list_keeps_only_students_on_the_roll(self):
        base = MagicMock()
        base.filter.return_value = base
        with patch(MIRROR) as mirror:
            _filter_students(base, {"school_year": "2026-2027"})
        rows = mirror.objects.filter.return_value.exclude.return_value
        base.filter.assert_called_once_with(student_id__in=rows.values.return_value)


class TestNotEnrolled:
    def test_active_learners_with_no_place_that_year(self):
        base = MagicMock()
        base.filter.return_value = base
        with patch(MIRROR) as mirror:
            _filter_students(base, {"unenrolled": "2026-2027"})
        mirror.objects.filter.assert_called_once_with(school_year="2026-2027")
        year_rows = mirror.objects.filter.return_value
        (rule,), _ = year_rows.filter.call_args
        assert rule == placement.holds_place_q()
        year_rows.filter.return_value.values.assert_called_once_with("student_id")
        base.filter.assert_called_once_with(status="active")
        base.exclude.assert_called_once_with(student_id__in=year_rows.filter.return_value.values.return_value)


class TestSkippingAFilter:
    def test_counts_can_leave_one_filter_out(self):
        base = MagicMock()
        base.filter.return_value = base
        _filter_students(base, {"status": "active", "sex": "male"}, skip=("status",))
        base.filter.assert_called_once_with(sex="male")


class TestPlacementAnnotation:
    PLACEMENT = {
        "placement_school_year", "placement_grade_level", "placement_section",
        "placement_status", "placement_semester", "placement_rank",
    }

    def test_the_year_scoped_list_says_where_each_learner_is_placed(self):
        annotations = _view("school_year=2026-2027").get_queryset().query.annotations
        assert self.PLACEMENT <= set(annotations)
        # The "Last enrolled" column still has what it reads.
        assert "last_school_year" in annotations

    def test_it_is_read_from_the_rows_the_filters_matched(self):
        annotations = _view("school_year=2026-2027&section=Diamond").get_queryset().query.annotations
        section = annotations["placement_section"]
        inner = getattr(section, "query", section)
        where = str(inner.where)
        assert "'2026-2027'" in where and "'Diamond'" in where and "'cancelled'" in where
        assert inner.order_by == ("-enrollment_id",)

    def test_only_the_year_scoped_list_has_it(self):
        assert not self.PLACEMENT & set(_view("").get_queryset().query.annotations)
        retrieve = _view("school_year=2026-2027", action="retrieve").get_queryset()
        assert not self.PLACEMENT & set(retrieve.query.annotations)


class TestMasterlistOrdering:
    def _ordering(self, query, queryset):
        view = _view(query)
        return StudentOrderingFilter().get_ordering(view.request, queryset, view)

    def test_placement_reads_like_a_class_list(self):
        qs = _view("school_year=2026-2027").get_queryset()
        assert self._ordering("ordering=placement", qs) == [
            "placement_rank", "placement_section", "last_name", "first_name", "student_id",
        ]

    def test_reversed_it_reverses_every_key_but_the_tiebreak(self):
        qs = _view("school_year=2026-2027").get_queryset()
        assert self._ordering("ordering=-placement", qs) == [
            "-placement_rank", "-placement_section", "-last_name", "-first_name", "student_id",
        ]

    def test_without_a_year_it_falls_back_to_surname(self):
        qs = _view("").get_queryset()
        assert self._ordering("ordering=placement", qs) == ["last_name", "first_name", "student_id"]

    def test_surname_ties_are_broken_by_id(self):
        assert self._ordering("ordering=last_name", Student.objects.all()) == ["last_name", "student_id"]

    def test_an_id_ordering_is_left_as_asked(self):
        assert self._ordering("ordering=-student_id", Student.objects.all()) == ["-student_id"]

    def test_no_ordering_asked_none_added(self):
        assert self._ordering("", Student.objects.all()) is None


class _Probe(PlacementMixin):
    """The mixin on its own, so no model -- and no missing table -- is involved."""

    first_name = serializers.CharField()


class TestPlacementField:
    def test_reports_the_place_in_the_scoped_year(self):
        row = SimpleNamespace(
            first_name="Renz", placement_school_year="2026-2027", placement_grade_level="Grade 7",
            placement_section="Diamond", placement_status="pending", placement_semester=None,
        )
        assert _Probe(row).data["placement"] == {
            "school_year": "2026-2027",
            "grade_level": "Grade 7",
            "section": "Diamond",
            "enrollment_status": "pending",
            "semester": None,
        }

    def test_is_left_out_where_the_list_was_not_scoped_to_a_year(self):
        assert "placement" not in _Probe(SimpleNamespace(first_name="Renz")).data

    def test_both_student_serializers_carry_it(self):
        assert "placement" in StudentSerializer().fields
        assert "placement" in StudentBillingSummarySerializer().fields


class TestCounts:
    """Which filters each number is counted inside. The queries themselves
    were checked against the local database when this was written."""

    def _run(self, query):
        seen = []

        def record(queryset, params, skip=()):
            seen.append(dict(params))
            result = MagicMock()
            result.count.return_value = 0
            result.order_by.return_value.values.return_value.annotate.return_value = []
            return result

        view = _view(query, action="counts")
        with patch("students.views._filter_students", side_effect=record), \
             patch.object(StudentViewSet, "_visible", lambda self, qs, search=False: qs), \
             patch("students.views.Student") as student, \
             patch(MIRROR) as mirror:
            student.objects.all.return_value.count.return_value = 0
            grouped = mirror.objects.filter.return_value.exclude.return_value.order_by.return_value
            grouped.values.return_value.annotate.return_value = []
            response = view.counts(view.request)
        return response, seen

    def test_every_facet_is_counted_inside_the_other_filters(self):
        query = ("school_year=2026-2027&status=active&sex=male"
                 "&school_level=junior_highschool&grade_level=Grade 7&section=Diamond")
        response, seen = self._run(query)
        assert set(response.data) == {
            "status", "sex", "registered", "year_total", "enrollment",
            "school_level", "grade_level", "section",
        }
        on = {"school_year": "2026-2027", "status": "active", "sex": "male",
              "school_level": "junior_highschool", "grade_level": "Grade 7", "section": "Diamond"}

        def without(*keys):
            return {k: v for k, v in on.items() if k not in keys}

        expected = [
            without("status"),                                        # status tiles
            without("sex"),                                           # sex chips
            {"school_year": "2026-2027"},                             # the year's total
            without("school_level", "grade_level", "section"),        # Enrolled
            {**without("school_year", "school_level", "grade_level", "section"),
             "unenrolled": "2026-2027"},                              # Not enrolled
            without("school_level", "grade_level", "section"),        # per level
            without("grade_level", "section"),                        # per grade, in the level
            without("section"),                                       # per section, in the grade
        ]
        for params in expected:
            assert params in seen

    def test_without_a_year_only_status_and_sex(self):
        response, _ = self._run("search=cruz")
        assert set(response.data) == {"status", "sex", "registered"}

    def test_not_enrolled_still_reports_the_year(self):
        response, seen = self._run("unenrolled=2026-2027")
        assert {"year_total", "enrollment"} <= set(response.data)
        assert "school_level" not in response.data
        assert {"school_year": "2026-2027"} in seen
