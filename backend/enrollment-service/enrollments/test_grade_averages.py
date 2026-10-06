"""
EnrollmentViewSet.grade_averages() -- the pass/fail split behind the Grades
overview's status band.

The overview could only tell Passed from Failed for the page of learners it
had fetched, so a year-wide count needs the server. These pin that the count
goes through the list's own filters and role scoping (a teacher's numbers
cover only their advisory), and that a grading period narrows the grades
averaged. Querysets are mocked, as in the rest of this service's tests.
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from enrollments.views import EnrollmentViewSet

factory = APIRequestFactory()


def _user(role, user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


def _call(user, query):
    request = Request(factory.get(f"/api/enrollments/grade-averages/?{query}"))
    request.user = user
    view = EnrollmentViewSet()
    view.request = request
    view.format_kwarg = None
    return view, request


def _grades_mock(averages):
    """Grade.objects.filter(...) -> [.filter(period)] -> averages."""
    grades = MagicMock()
    grades.filter.return_value = grades
    chain = grades.order_by.return_value.values.return_value.annotate.return_value
    chain.values_list.return_value = averages
    return grades


def test_counts_through_the_lists_filters_and_scoping():
    view, request = _call(_user("registrar"), "school_year=2026-2027&enrollment_status__in=enrolled,completed")
    enrollments = MagicMock()
    enrollments.order_by.return_value = enrollments
    enrollments.count.return_value = 4
    grades = _grades_mock([Decimal("88"), Decimal("70"), Decimal("75")])

    with patch.object(EnrollmentViewSet, "get_queryset", return_value="scoped") as get_qs, \
         patch.object(EnrollmentViewSet, "filter_queryset", return_value=enrollments) as filter_qs, \
         patch("grades.models.Grade.objects.filter", return_value=grades):
        response = view.grade_averages(request)

    get_qs.assert_called_once_with()
    filter_qs.assert_called_once_with("scoped")
    assert response.status_code == 200
    assert response.data == {"learners": 4, "passed": 2, "failed": 1, "no_grades": 1}
    grades.filter.assert_not_called()  # no grading period asked for


def test_a_grading_period_narrows_the_grades_averaged():
    view, request = _call(_user("registrar"), "school_year=2026-2027&grading_period=1st_quarter")
    enrollments = MagicMock()
    enrollments.order_by.return_value = enrollments
    enrollments.count.return_value = 1
    grades = _grades_mock([Decimal("74")])

    with patch.object(EnrollmentViewSet, "filter_queryset", return_value=enrollments), \
         patch.object(EnrollmentViewSet, "get_queryset", return_value="scoped"), \
         patch("grades.models.Grade.objects.filter", return_value=grades):
        response = view.grade_averages(request)

    grades.filter.assert_called_once_with(grading_period="1st_quarter")
    assert response.data == {"learners": 1, "passed": 0, "failed": 1, "no_grades": 0}


def test_a_teachers_count_covers_only_their_advisory():
    """get_queryset is the list's own: a teacher is narrowed to their roster."""
    view, _ = _call(_user("teacher"), "school_year=2026-2027")
    base = MagicMock()
    with patch("enrollments.views.teacher_student_ids", return_value={5, 6}), \
         patch("rest_framework.viewsets.ModelViewSet.get_queryset", return_value=base):
        view.get_queryset()
    base.filter.assert_called_once_with(student_id__in={5, 6})
