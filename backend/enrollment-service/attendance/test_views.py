"""
Regression tests for the audit-attribution bug in AttendanceViewSet:
perform_create/perform_update used to read
getattr(self.request, "user_id", None) -- self.request (the DRF Request
object) has no user_id attribute at all, only self.request.user does, so
AttendanceRecord.recorded_by was silently None for every attendance record
ever saved through the single-record endpoints. Fixed to read
self.request.user.user_id, matching the pattern already used correctly
elsewhere in this service.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.exceptions import PermissionDenied

from attendance.views import AttendanceViewSet


def _view_with_user(user_id, role="teacher"):
    view = AttendanceViewSet()
    view.request = SimpleNamespace(user=SimpleNamespace(user_id=user_id, role=role))
    return view


def test_perform_create_attributes_the_real_user_id():
    view = _view_with_user(11)
    serializer = MagicMock()

    # The roster guard is exercised by its own tests below; this one is only
    # about recorded_by attribution, and resolving a roster would need the DB.
    with patch("attendance.views.assert_teacher_may_write_enrollment"):
        view.perform_create(serializer)

    serializer.save.assert_called_once_with(recorded_by=11)


def test_perform_create_is_refused_for_a_student_outside_the_teachers_roster():
    """
    has_object_permission never runs on create, so POST /api/attendance/ used
    to let any teacher record attendance for any student in the school. The
    bulk action already guarded this; the single-record path did not.
    """
    view = _view_with_user(11)
    serializer = MagicMock()

    with patch(
        "attendance.views.assert_teacher_may_write_enrollment",
        side_effect=PermissionDenied("nope"),
    ):
        with pytest.raises(PermissionDenied):
            view.perform_create(serializer)

    serializer.save.assert_not_called()


def test_perform_update_attributes_the_real_user_id():
    view = _view_with_user(11)
    serializer = MagicMock()

    # The destination guard has its own test below.
    with patch("attendance.views.assert_teacher_may_write_enrollment"):
        view.perform_update(serializer)

    serializer.save.assert_called_once_with(recorded_by=11)


def test_perform_update_checks_where_the_record_is_moving_to():
    """A PATCH onto another learner's enrollment is checked against that one."""
    view = _view_with_user(11)
    serializer = MagicMock()
    elsewhere = SimpleNamespace(enrollment_id=999)
    serializer.validated_data = {"enrollment": elsewhere}

    with patch("attendance.views.assert_teacher_may_write_enrollment",
               side_effect=PermissionDenied()) as guard:
        with pytest.raises(PermissionDenied):
            view.perform_update(serializer)

    assert guard.call_args.args[1] is elsewhere
    serializer.save.assert_not_called()
