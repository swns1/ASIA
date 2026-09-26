"""
Create-path scoping for records that hang off an Enrollment.

DRF only calls has_object_permission on detail routes, so IsAdvisoryTeacherOrStaff
never saw a plain POST. That left POST /api/grades/, POST /api/attendance/,
POST /api/narrative-reports/ and POST /api/score-entries/ open: any teacher
could write a record for any student in the school, even though the equivalent
bulk and read paths were correctly scoped.

Score entries were the one this list missed on the first pass, and they are the
least obvious and not the least serious: compute_grade() turns them into the
transmuted grade printed on the report card and on SF9/SF10. The viewset-level
test below is what stops the next endpoint from being missed the same way.

Like the rest of this service's permission tests, these patch the ORM rather
than hitting a database -- Enrollment and SectionAdvisory are managed=False, so
a fresh pytest-django database has no tables for them.
"""
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from rest_framework.exceptions import PermissionDenied

from accounts.permissions import assert_teacher_may_write_enrollment

# Enrollment ids of the teacher's current sections. Checked by enrollment, not
# student: a learner's student id also covers every earlier year they spent
# here, and a teacher writing to those rewrote a colleague's final grades.
ROSTER = {101, 102, 103}


def _teacher(user_id=11):
    return SimpleNamespace(user_id=user_id, role="teacher")


@pytest.mark.parametrize("role", ["super_admin", "admin", "registrar"])
def test_staff_roles_are_not_narrowed(role):
    """Staff write for the whole school; the guard must not touch them."""
    staff = SimpleNamespace(user_id=1, role=role)
    # No patching: a staff role must short-circuit before any ORM access.
    assert_teacher_may_write_enrollment(staff, SimpleNamespace(enrollment_id=999)) is None


def test_teacher_may_write_to_an_enrollment_on_their_roster():
    with patch("accounts.permissions.teacher_enrollment_ids", return_value=ROSTER):
        assert_teacher_may_write_enrollment(_teacher(), SimpleNamespace(enrollment_id=102)) is None


def test_teacher_is_refused_an_enrollment_outside_their_roster():
    with patch("accounts.permissions.teacher_enrollment_ids", return_value=ROSTER):
        with pytest.raises(PermissionDenied):
            assert_teacher_may_write_enrollment(_teacher(), SimpleNamespace(enrollment_id=999))


def test_teacher_is_refused_their_own_learners_earlier_year():
    """Same learner (student 7), last year's row: not on this year's roster."""
    with patch("accounts.permissions.teacher_enrollment_ids", return_value=ROSTER):
        with pytest.raises(PermissionDenied):
            assert_teacher_may_write_enrollment(
                _teacher(), SimpleNamespace(enrollment_id=41, student_id=7),
            )


def test_teacher_with_no_advisory_is_refused_everything():
    """Fail closed: an unassigned teacher resolves to an empty roster."""
    with patch("accounts.permissions.teacher_enrollment_ids", return_value=set()):
        with pytest.raises(PermissionDenied):
            assert_teacher_may_write_enrollment(_teacher(), SimpleNamespace(enrollment_id=101))


def test_a_bare_enrollment_id_is_checked_too():
    with patch("accounts.permissions.teacher_enrollment_ids", return_value=ROSTER):
        assert_teacher_may_write_enrollment(_teacher(), 101) is None
        with pytest.raises(PermissionDenied):
            assert_teacher_may_write_enrollment(_teacher(), 4242)


def test_a_missing_enrollment_is_refused_rather_than_allowed():
    with patch("accounts.permissions.teacher_enrollment_ids", return_value=ROSTER):
        with pytest.raises(PermissionDenied):
            assert_teacher_may_write_enrollment(_teacher(), None)


# ── every enrollment-scoped create path is guarded ──────────────────────────

def test_no_enrollment_scoped_viewset_is_missing_its_create_guard():
    """The regression that actually happened, asserted structurally.

    Three viewsets were fixed by hand and a fourth (ScoreEntryViewSet) was
    missed, because nothing checked that the list was complete. Any viewset
    whose rows hang off an Enrollment and that accepts writes must define
    perform_create -- reading `owner_student_id_field` as the marker for "this
    is enrollment-scoped", which is the same attribute the permission class
    uses to find the owner.
    """
    from rest_framework import mixins

    from attendance.views import AttendanceViewSet
    from grades.views import GradeViewSet, NarrativeReportViewSet
    from grading.views import ScoreEntryViewSet

    writable = [
        AttendanceViewSet, GradeViewSet, NarrativeReportViewSet, ScoreEntryViewSet,
    ]
    for viewset in writable:
        assert issubclass(viewset, mixins.CreateModelMixin), viewset.__name__
        assert "perform_create" in viewset.__dict__, (
            f"{viewset.__name__} accepts POST for enrollment-scoped rows but "
            f"defines no perform_create, so assert_teacher_may_write_enrollment "
            f"never runs on the create path."
        )


def test_no_enrollment_scoped_viewset_is_missing_its_update_guard():
    """
    has_object_permission checks a record where it already is, so a PATCH
    that moved a grade or attendance record onto another learner's enrollment
    was never checked against where it went. ScoreEntryViewSet closed this
    first; the other three did not.
    """
    import inspect

    from attendance.views import AttendanceViewSet
    from grades.views import GradeViewSet, NarrativeReportViewSet
    from grading.views import ScoreEntryViewSet

    for viewset in (AttendanceViewSet, GradeViewSet, NarrativeReportViewSet, ScoreEntryViewSet):
        assert "perform_update" in viewset.__dict__, viewset.__name__
        source = inspect.getsource(viewset.perform_update)
        assert "assert_teacher_may_write_enrollment" in source, viewset.__name__


def test_score_entry_create_guard_calls_the_shared_rule():
    """ScoreEntryViewSet must use the same helper, not its own re-derivation."""
    import inspect

    from grading.views import ScoreEntryViewSet

    source = inspect.getsource(ScoreEntryViewSet.perform_create)
    assert "assert_teacher_may_write_enrollment" in source
