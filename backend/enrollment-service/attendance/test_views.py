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
from unittest.mock import MagicMock

from attendance.views import AttendanceViewSet


def _view_with_user(user_id):
    view = AttendanceViewSet()
    view.request = SimpleNamespace(user=SimpleNamespace(user_id=user_id, role="teacher"))
    return view


def test_perform_create_attributes_the_real_user_id():
    view = _view_with_user(11)
    serializer = MagicMock()

    view.perform_create(serializer)

    serializer.save.assert_called_once_with(recorded_by=11)


def test_perform_update_attributes_the_real_user_id():
    view = _view_with_user(11)
    serializer = MagicMock()

    view.perform_update(serializer)

    serializer.save.assert_called_once_with(recorded_by=11)
