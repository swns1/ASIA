"""
Regression tests for the audit-attribution bug: EnrollmentViewSet's
_save_override_audit / _log_internal_move_if_changed used to read
getattr(self.request.user, "id", None) -- the stub User model's primary key
field is user_id, not id, so this was always None and both
EnrollmentOverride.overridden_by and EnrollmentTransfer.initiated_by
(non-nullable IntegerFields) silently fell through to the "or 0" fallback
for every real request. Fixed to check user_id first, matching the pattern
already used correctly elsewhere in this file (SectionAdvisoryViewSet.my_sections,
_resolve_teacher_user_id).

DB-free: EnrollmentOverride.objects.update_or_create and
EnrollmentTransfer.objects.create are mocked so these don't depend on
`enrollments`/`enrollment_overrides`/`enrollment_transfers` existing in a
fresh pytest-django test database (most of this app's models are
managed=False -- see enrollments/models.py).
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from enrollments.views import EnrollmentViewSet


def _view_with_user(user_id):
    view = EnrollmentViewSet()
    view.request = SimpleNamespace(user=SimpleNamespace(user_id=user_id, role="registrar"))
    return view


def _serializer(reason=""):
    return SimpleNamespace(_progression_override_reason=reason)


@patch("enrollments.views.EnrollmentOverride.objects.update_or_create")
def test_save_override_audit_attributes_the_real_user_id(mock_update_or_create):
    view = _view_with_user(42)
    enrollment = SimpleNamespace(enrollment_id=1)

    view._save_override_audit(_serializer("needs the extra unit"), enrollment)

    mock_update_or_create.assert_called_once_with(
        enrollment=enrollment,
        defaults={
            "override_reason": "needs the extra unit",
            "overridden_by": 42,
        },
    )


@patch("enrollments.views.EnrollmentOverride.objects.update_or_create")
def test_save_override_audit_falls_back_to_zero_only_if_truly_unresolvable(mock_update_or_create):
    """The "or 0" fallback should be a last resort, not the normal path it
    used to be for every request."""
    view = EnrollmentViewSet()
    view.request = SimpleNamespace(user=SimpleNamespace())  # no user_id, no id at all
    enrollment = SimpleNamespace(enrollment_id=1)

    view._save_override_audit(_serializer(), enrollment)

    assert mock_update_or_create.call_args.kwargs["defaults"]["overridden_by"] == 0


@patch("enrollments.views.EnrollmentTransfer.objects.create")
def test_internal_move_logged_with_the_real_user_id(mock_create):
    view = _view_with_user(7)
    enrollment = SimpleNamespace(grade_level="10", school_level="jhs", section="A", strand=None)
    before = {"grade_level": "9", "school_level": "jhs", "strand": None, "section": "A"}

    view._log_internal_move_if_changed(_serializer("promoted"), before, enrollment)

    mock_create.assert_called_once()
    assert mock_create.call_args.kwargs["initiated_by"] == 7


@patch("enrollments.views.EnrollmentTransfer.objects.create")
def test_internal_move_not_logged_when_nothing_tracked_changed(mock_create):
    view = _view_with_user(7)
    enrollment = SimpleNamespace(grade_level="9", section="A", strand=None, school_level="jhs")
    before = {"grade_level": "9", "school_level": "jhs", "strand": None, "section": "A"}

    view._log_internal_move_if_changed(_serializer(), before, enrollment)

    mock_create.assert_not_called()
