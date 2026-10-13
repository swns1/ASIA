"""
EnrollmentScholarshipViewSet.get_queryset -- who reads which awards.

A teacher reads only their own learners' awards (teacher_student_ids, the
scope of their grades and attendance); every other role keeps the list as it
was. Querysets are mocked, as in the rest of this service's tests.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from scholarships.views import EnrollmentScholarshipViewSet

factory = APIRequestFactory()


def _view(role):
    request = Request(factory.get("/api/enrollment-scholarships/"))
    request.user = SimpleNamespace(role=role, user_id=25, is_authenticated=True)
    view = EnrollmentScholarshipViewSet()
    view.request = request
    view.format_kwarg = None
    return view


def _scoped(role, ids=frozenset({1, 2})):
    base = MagicMock(name="awards")
    base.filter.return_value = "teacher's awards"
    with patch("rest_framework.viewsets.ModelViewSet.get_queryset", return_value=base), \
         patch("scholarships.views.teacher_student_ids", return_value=ids) as roster:
        return _view(role).get_queryset(), base, roster


def test_a_teacher_reads_only_their_own_learners_awards():
    qs, base, roster = _scoped("teacher")
    assert qs == "teacher's awards"
    base.filter.assert_called_once_with(enrollment__student_id__in={1, 2})
    roster.assert_called_once()


def test_a_teacher_with_no_section_reads_none():
    _, base, _ = _scoped("teacher", ids=set())
    base.filter.assert_called_once_with(enrollment__student_id__in=set())


@pytest.mark.parametrize("role", ["super_admin", "admin", "registrar", "accounting"])
def test_staff_keep_the_whole_list(role):
    qs, base, roster = _scoped(role)
    assert qs is base
    base.filter.assert_not_called()
    roster.assert_not_called()
