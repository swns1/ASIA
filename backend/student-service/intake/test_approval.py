"""
Tests for intake/services.py: transition(), approve_application(),
reject_application().

No @pytest.mark.django_db (see intake/test_invites.py's module docstring).
create_student_bundle is patched rather than exercised for real —
students/households/guardians are managed=False (no table exists even when
the test DB *can* be built), the same workaround
students/test_uploads.py's docstring documents. Patching it here is also
exactly the seam the extraction in students/services.py was for: it lets
approve_application's own logic (idempotency, re-whitelisting, the
siblings/previous_schools writes bulk-create doesn't handle, the advisory
lock) be tested without needing a real students table at all.

approve_application/reject_application open `with transaction.atomic():`
rather than using the `@transaction.atomic` decorator specifically so that
can be mocked out here too — a decorator binds its Atomic instance once, at
import time, which a test-time patch can't reach.
"""
from contextlib import ExitStack
from unittest.mock import MagicMock, patch

import pytest
from rest_framework import serializers

from students.models import Student

from . import services
from .models import StudentApplication

APPLICATION_ID = 1


def _application(status=StudentApplication.SUBMITTED, **overrides):
    application = StudentApplication(
        student_application_id=APPLICATION_ID,
        status=status,
        payload_json={
            "student": {
                "lrn": "123456789012", "first_name": "Juan", "last_name": "Dela Cruz",
                "sex": "male", "birth_date": "2015-06-01",
                "current_address": "x", "permanent_address": "x",
            },
            "household": None,
            "guardians": [],
            "siblings": [{"full_name": "Ana Dela Cruz", "age": 10}],
            "previous_schools": [{"school_name": "ABC Elementary", "school_address": "y"}],
        },
    )
    for key, value in overrides.items():
        setattr(application, key, value)
    return application


def _cursor_cm():
    """A connection.cursor() context manager stand-in — approve_application
    runs one raw SQL statement (the advisory lock) through it."""
    cm = MagicMock()
    cm.__enter__.return_value = MagicMock()
    cm.__exit__.return_value = False
    return cm


class _PassthroughSerializer:
    """A stand-in for BulkStudentSerializer/BulkHouseholdSerializer/
    BulkGuardianSerializer that skips real validation entirely.

    Why not just mock Student.objects instead: BulkStudentSerializer's
    lrn/student_number/email fields each carry an auto-attached
    UniqueValidator (it's exclude-based — see Flag A), and DRF resolves
    that validator's queryset from Student._default_manager, which Django's
    metaclass binds once at model-definition time — NOT the same thing as
    the `objects` class attribute mock.patch can intercept via setattr, so
    patching `Student.objects` silently does nothing to it. Patching these
    three serializer classes at the point services.py imports them sidesteps
    the real validators entirely, which is correct for these tests anyway:
    they exist to test approve_application's own logic (idempotency,
    re-whitelisting, the siblings/previous_schools writes bulk-create
    doesn't handle), not DRF's built-in uniqueness checking.
    """
    def __init__(self, data):
        self.initial_data = data
        self.validated_data = dict(data) if data else {}

    def is_valid(self, raise_exception=False):
        return True


def _enter_approve_mocks(stack, application, create_student_bundle_return=None):
    """Enters every context approve_application needs into `stack` (an open
    ExitStack) and returns the (bundle, sibling_bc, school_bc) mocks."""
    student = Student(
        student_id=42, student_number="2026-0001", lrn="123456789012",
        first_name="Juan", last_name="Dela Cruz", sex="male",
    )
    default_return = create_student_bundle_return or (student, None, [])

    stack.enter_context(patch("intake.services.transaction.atomic", return_value=_NullCtx()))
    select_for_update = stack.enter_context(patch("intake.services.StudentApplication.objects.select_for_update"))
    select_for_update.return_value.get.return_value = application
    stack.enter_context(patch("intake.services.BulkStudentSerializer", new=_PassthroughSerializer))
    stack.enter_context(patch("intake.services.BulkHouseholdSerializer", new=_PassthroughSerializer))
    stack.enter_context(patch("intake.services.BulkGuardianSerializer", new=_PassthroughSerializer))
    bundle = stack.enter_context(patch("intake.services.create_student_bundle", return_value=default_return))
    sibling_bc = stack.enter_context(patch("intake.services.Sibling.objects.bulk_create"))
    school_bc = stack.enter_context(patch("intake.services.PreviousSchool.objects.bulk_create"))
    stack.enter_context(patch("intake.services.connection.cursor", return_value=_cursor_cm()))
    return bundle, sibling_bc, school_bc


class _NullCtx:
    def __enter__(self):
        return None

    def __exit__(self, *exc_info):
        return False


class TestTransition:
    def test_submitted_to_in_review_is_allowed(self):
        application = _application(status=StudentApplication.SUBMITTED)
        application.save = MagicMock()
        services.transition(application, StudentApplication.IN_REVIEW)
        assert application.status == StudentApplication.IN_REVIEW

    def test_draft_to_in_review_is_rejected(self):
        application = _application(status=StudentApplication.DRAFT)
        with pytest.raises(services.InvalidTransition):
            services.transition(application, StudentApplication.IN_REVIEW)

    def test_approved_is_terminal(self):
        application = _application(status=StudentApplication.APPROVED)
        with pytest.raises(services.InvalidTransition):
            services.transition(application, StudentApplication.IN_REVIEW)

    def test_rejected_can_be_reopened_to_in_review(self):
        """A wrongly-rejected family must be recoverable before they're
        turned away at the counter — see the plan's status table."""
        application = _application(status=StudentApplication.REJECTED)
        application.save = MagicMock()
        services.transition(application, StudentApplication.IN_REVIEW)
        assert application.status == StudentApplication.IN_REVIEW


class TestApproveApplication:
    def test_happy_path_creates_bundle_and_marks_approved(self):
        application = _application()
        application.save = MagicMock()
        with ExitStack() as stack:
            bundle, sibling_bc, school_bc = _enter_approve_mocks(stack, application)
            result, created = services.approve_application(APPLICATION_ID, actor=None)

        assert created is True
        assert result.status == StudentApplication.APPROVED
        assert result.created_student_id == 42
        bundle.assert_called_once()
        sibling_bc.assert_called_once()
        school_bc.assert_called_once()

    def test_bundle_is_re_whitelisted_even_though_input_was_already_clean(self):
        """The stored payload_json already went through ApplicantSubmissionSerializer
        at submit time, but approve_application must not rely on that —
        overrides come from a registrar and get merged in before this
        second whitelist pass runs. This proves the pass happens at all by
        checking the exact dict shape create_student_bundle receives."""
        application = _application()
        application.payload_json["student"]["status"] = "graduated"  # simulates a payload that slipped through
        application.save = MagicMock()
        with ExitStack() as stack:
            bundle, _, _ = _enter_approve_mocks(stack, application)
            services.approve_application(APPLICATION_ID, actor=None)

        called_with = bundle.call_args[0][0]
        assert "status" not in called_with["student"]

    def test_already_approved_is_idempotent_and_does_not_recreate(self):
        application = _application(status=StudentApplication.APPROVED, created_student_id=42)
        with patch("intake.services.transaction.atomic", return_value=_NullCtx()), \
             patch("intake.services.StudentApplication.objects.select_for_update") as select_for_update, \
             patch("intake.services.create_student_bundle") as bundle:
            select_for_update.return_value.get.return_value = application
            result, created = services.approve_application(APPLICATION_ID, actor=None)

        assert created is False
        assert result.created_student_id == 42
        bundle.assert_not_called()

    def test_approving_a_draft_is_rejected(self):
        application = _application(status=StudentApplication.DRAFT)
        with patch("intake.services.transaction.atomic", return_value=_NullCtx()), \
             patch("intake.services.StudentApplication.objects.select_for_update") as select_for_update:
            select_for_update.return_value.get.return_value = application
            with pytest.raises(serializers.ValidationError):
                services.approve_application(APPLICATION_ID, actor=None)

    def test_overrides_supply_the_missing_lrn(self):
        """LRN is the one field the registrar is structurally required to
        supply if the applicant didn't — students.lrn is NOT NULL."""
        application = _application()
        application.payload_json["student"]["lrn"] = ""
        application.save = MagicMock()
        with ExitStack() as stack:
            bundle, _, _ = _enter_approve_mocks(stack, application)
            services.approve_application(
                APPLICATION_ID, actor=None, overrides={"student": {"lrn": "999999999999"}},
            )

        called_with = bundle.call_args[0][0]
        assert called_with["student"]["lrn"] == "999999999999"


class TestRejectApplication:
    def test_requires_a_note(self):
        # No note is a 400 before the row lock is even taken — see
        # reject_application's early return — so this needs no mocking.
        with pytest.raises(serializers.ValidationError):
            services.reject_application(APPLICATION_ID, actor=None, note="   ")

    def test_rejecting_an_already_decided_application_fails(self):
        application = _application(status=StudentApplication.APPROVED)
        with patch("intake.services.transaction.atomic", return_value=_NullCtx()), \
             patch("intake.services.StudentApplication.objects.select_for_update") as select_for_update:
            select_for_update.return_value.get.return_value = application
            with pytest.raises(serializers.ValidationError):
                services.reject_application(APPLICATION_ID, actor=None, note="Incomplete household info.")

    def test_happy_path_records_the_note(self):
        application = _application(status=StudentApplication.SUBMITTED)
        application.save = MagicMock()
        with patch("intake.services.transaction.atomic", return_value=_NullCtx()), \
             patch("intake.services.StudentApplication.objects.select_for_update") as select_for_update:
            select_for_update.return_value.get.return_value = application
            result = services.reject_application(APPLICATION_ID, actor=None, note="Incomplete household info.")

        assert result.status == StudentApplication.REJECTED
        assert result.decision_note == "Incomplete household info."
