"""
Targeted tests for grades/views.py's _scope_to_student_records — the
role-based queryset-scoping helper shared by GradeViewSet and
NarrativeReportViewSet.get_queryset. DB-free: it operates on whatever
queryset-like object it's handed, so a MagicMock stands in fine.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from grades.views import _scope_to_student_records


def _user(role, user_id=1):
    return SimpleNamespace(role=role, user_id=user_id, is_authenticated=True)


def test_teacher_scoped_to_own_students():
    mock_qs = MagicMock()
    mock_qs.filter.return_value = "filtered"
    with patch("grades.views.teacher_student_ids", return_value={1, 2, 3}):
        result = _scope_to_student_records(mock_qs, _user("teacher"))
    mock_qs.filter.assert_called_once_with(enrollment__student_id__in={1, 2, 3})
    assert result == "filtered"


def test_guardian_scoped_to_own_children():
    mock_qs = MagicMock()
    mock_qs.filter.return_value = "filtered"
    with patch("grades.views.guardian_student_ids", return_value={7}):
        result = _scope_to_student_records(mock_qs, _user("guardian"))
    mock_qs.filter.assert_called_once_with(enrollment__student_id__in={7})
    assert result == "filtered"


def test_staff_role_unaffected():
    mock_qs = MagicMock()
    result = _scope_to_student_records(mock_qs, _user("admin"))
    mock_qs.filter.assert_not_called()
    assert result is mock_qs


def test_custom_path_override():
    mock_qs = MagicMock()
    mock_qs.filter.return_value = "filtered"
    with patch("grades.views.guardian_student_ids", return_value={7}):
        result = _scope_to_student_records(
            mock_qs, _user("guardian"), path="invoice__enrollment__student_id"
        )
    mock_qs.filter.assert_called_once_with(invoice__enrollment__student_id__in={7})
    assert result == "filtered"
