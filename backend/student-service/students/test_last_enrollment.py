"""
The masterlist's "Last enrolled" column: where each student was last enrolled.

No @pytest.mark.django_db -- this service's test database can't be built (see
intake/test_invites.py). So these check the serializer contract on plain
objects, and the list view's query by its shape rather than by running it.
"""
from types import SimpleNamespace

from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from accounts.enrollment_mirror import EnrollmentMirror
from students.serializers import (
    LastEnrollmentMixin,
    StudentBillingSummarySerializer,
    StudentSerializer,
)
from students.views import StudentViewSet


class _Probe(LastEnrollmentMixin):
    """The mixin on its own, so no model -- and no missing table -- is involved."""

    first_name = serializers.CharField()


def annotated(**values):
    """A row as the list view hands it over: annotated, NULLs included."""
    row = {"first_name": "Renz", "last_school_year": None, "last_grade_level": None, "last_section": None}
    return SimpleNamespace(**{**row, **values})


class TestLastEnrollmentField:
    def test_reports_the_latest_enrollment(self):
        row = annotated(last_school_year="2025-2026", last_grade_level="Grade 6", last_section="Rizal")
        assert _Probe(row).data["last_enrollment"] == {
            "school_year": "2025-2026",
            "grade_level": "Grade 6",
            "section": "Rizal",
        }

    def test_is_null_for_a_student_never_enrolled(self):
        assert _Probe(annotated()).data["last_enrollment"] is None

    def test_is_left_out_where_nobody_looked_it_up(self):
        """Detail, create and update responses aren't annotated. Saying "never
        enrolled" there would be a guess, so the key is absent instead."""
        assert "last_enrollment" not in _Probe(SimpleNamespace(first_name="Renz")).data

    def test_both_student_serializers_carry_it(self):
        # accounting gets the reduced serializer, and can open the masterlist too.
        assert "last_enrollment" in StudentSerializer().fields
        assert "last_enrollment" in StudentBillingSummarySerializer().fields


def queryset_for(action):
    request = Request(APIRequestFactory().get("/api/students/"))
    request.user = SimpleNamespace(role="registrar", is_authenticated=True)
    view = StudentViewSet()
    view.request, view.action, view.format_kwarg = request, action, None
    return view.get_queryset()


class TestListAnnotation:
    def test_the_list_reads_the_latest_enrollment_that_was_not_cancelled(self):
        annotations = queryset_for("list").query.annotations
        assert {"last_school_year", "last_grade_level", "last_section"} <= set(annotations)

        # Once annotated, a Subquery is stored as its resolved inner Query.
        latest = getattr(annotations["last_school_year"], "query", annotations["last_school_year"])
        assert latest.model is EnrollmentMirror
        assert latest.order_by == ("-school_year", "-enrollment_id")
        where = str(latest.where)
        assert "NOT" in where and "enrollment_status" in where and "'cancelled'" in where

    def test_other_actions_skip_the_lookup(self):
        assert "last_school_year" not in queryset_for("retrieve").query.annotations
