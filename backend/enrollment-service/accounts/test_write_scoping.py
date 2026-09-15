"""
Create-path scoping for records that hang off an Enrollment.

DRF only calls has_object_permission on detail routes, so IsAdvisoryTeacherOrStaff
never saw a plain POST. That left POST /api/grades/, POST /api/attendance/ and
POST /api/narrative-reports/ open: any teacher could write a record for any
student in the school, even though the equivalent bulk and read paths were
correctly scoped.

Like the rest of this service's permission tests, these patch the ORM rather
than hitting a database -- Enrollment and SectionAdvisory are managed=False, so
a fresh pytest-django database has no tables for them.
"""
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from rest_framework.exceptions import PermissionDenied

from accounts.permissions import assert_teacher_may_write_enrollment

ROSTER = {101, 102, 103}


def _teacher(user_id=11):
    return SimpleNamespace(user_id=user_id, role="teacher")


@pytest.mark.parametrize("role", ["super_admin", "admin", "registrar"])
def test_staff_roles_are_not_narrowed(role):
    """Staff write for the whole school; the guard must not touch them."""
    staff = SimpleNamespace(user_id=1, role=role)
    # No patching: a staff role must short-circuit before any ORM access.
    assert_teacher_may_write_enrollment(staff, SimpleNamespace(student_id=999)) is None


def test_teacher_may_write_for_a_student_on_their_roster():
    with patch("accounts.permissions.teacher_student_ids", return_value=ROSTER):
        assert_teacher_may_write_enrollment(_teacher(), SimpleNamespace(student_id=102)) is None


def test_teacher_is_refused_for_a_student_outside_their_roster():
    with patch("accounts.permissions.teacher_student_ids", return_value=ROSTER):
        with pytest.raises(PermissionDenied):
            assert_teacher_may_write_enrollment(_teacher(), SimpleNamespace(student_id=999))


def test_teacher_with_no_advisory_is_refused_everything():
    """Fail closed: an unassigned teacher resolves to an empty roster."""
    with patch("accounts.permissions.teacher_student_ids", return_value=set()):
        with pytest.raises(PermissionDenied):
            assert_teacher_may_write_enrollment(_teacher(), SimpleNamespace(student_id=101))


def test_an_unresolvable_enrollment_is_refused_rather_than_allowed():
    """A bare id that matches no enrollment must not fall through to allow."""
    with patch("accounts.permissions.teacher_student_ids", return_value=ROSTER):
        with patch("enrollments.models.Enrollment") as enrollment_model:
            enrollment_model.objects.filter.return_value.values_list.return_value.first.return_value = None
            with pytest.raises(PermissionDenied):
                assert_teacher_may_write_enrollment(_teacher(), 4242)
