"""
Tests for the concurrency guards in the plan's concurrency table: draft
autosave's optimistic-locking (revision), invite single-consumption at
submit, and approve's idempotency under a repeated call.

No @pytest.mark.django_db (see intake/test_invites.py's module docstring on
why this service's test database can't be built at all here) — so this
can't spin up real threads racing a real row lock the way a true
concurrency test would. What's tested instead is the actual mechanism each
guard relies on: that ApplyDraftView's conditional UPDATE is really
conditioned on the client's revision (not a blind overwrite), that
ApplySubmitView's invite-consumption UPDATE is really conditioned on
consumed_at IS NULL (not a blind overwrite), and that approve_application's
idempotency check actually short-circuits on a second call rather than
merely being intended to.
"""
import uuid
from contextlib import nullcontext
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.test import RequestFactory
from django.utils import timezone
from rest_framework import status

from .invites import issue_session_token
from .models import ApplicationInvite, StudentApplication
from .views import ApplyDraftView

factory = RequestFactory()


def _invite():
    return ApplicationInvite(
        invite_id=uuid.uuid4(),
        applicant_first_name="Juan", applicant_last_name="Dela Cruz",
        mode=ApplicationInvite.REMOTE, issued_by_user_id=1,
        expires_at=timezone.now() + timedelta(days=1),
    )


def _draft(invite, revision=3, payload=None):
    application = StudentApplication(
        student_application_id=1, status=StudentApplication.DRAFT,
        revision=revision, payload_json=payload or {},
    )
    application.invite = invite
    return application


class TestDraftOptimisticLocking:
    """ApplyDraftView.patch: two tabs autosaving the same draft must not
    silently clobber each other — see the plan's concurrency table."""

    def _patch_request(self, invite, application, revision, payload):
        token = issue_session_token(invite, application)
        return factory.patch(
            f"/api/apply/{invite.pk}/draft/",
            data={"revision": revision, "payload": payload},
            content_type="application/json",
            HTTP_X_APPLICANT_TOKEN=token,
        )

    def test_matching_revision_updates_and_returns_the_new_state(self):
        invite = _invite()
        application = _draft(invite, revision=3)
        request = self._patch_request(invite, application, revision=3, payload={"student": {"first_name": "Ana"}})

        with patch("intake.invites.StudentApplication.objects.select_related") as select_related, \
             patch("intake.views.StudentApplication.objects.filter") as objects_filter, \
             patch("intake.views.StudentApplication.objects.get") as objects_get:
            select_related.return_value.get.return_value = application
            objects_filter.return_value.update.return_value = 1  # one row matched pk+revision
            objects_get.return_value = _draft(invite, revision=4, payload={"student": {"first_name": "Ana"}})

            response = ApplyDraftView.as_view()(request, invite_id=invite.pk)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["revision"] == 4
        # The conditional UPDATE was actually conditioned on this exact
        # (pk, revision) pair — not a blind save().
        objects_filter.assert_called_once_with(pk=application.pk, revision=3)

    def test_stale_revision_is_rejected_with_409_and_current_state(self):
        """A second tab whose local revision has fallen behind must not
        overwrite what the first tab already saved."""
        invite = _invite()
        application = _draft(invite, revision=3)
        request = self._patch_request(invite, application, revision=3, payload={"student": {"first_name": "Ana"}})

        newer = _draft(invite, revision=5, payload={"student": {"first_name": "Jose"}})

        with patch("intake.invites.StudentApplication.objects.select_related") as select_related, \
             patch("intake.views.StudentApplication.objects.filter") as objects_filter, \
             patch("intake.views.StudentApplication.objects.get") as objects_get:
            select_related.return_value.get.return_value = application
            objects_filter.return_value.update.return_value = 0  # no row matched — revision moved on
            objects_get.return_value = newer

            response = ApplyDraftView.as_view()(request, invite_id=invite.pk)

        assert response.status_code == status.HTTP_409_CONFLICT
        # The client gets back what's actually stored, not what it tried to
        # save, so it can reload rather than silently losing the other
        # tab's edits.
        assert response.data["revision"] == 5
        assert response.data["payload"]["student"]["first_name"] == "Jose"

    def test_missing_revision_is_a_400_not_a_blind_write(self):
        invite = _invite()
        application = _draft(invite, revision=3)
        token = issue_session_token(invite, application)
        request = factory.patch(
            f"/api/apply/{invite.pk}/draft/",
            data={"payload": {"student": {"first_name": "Ana"}}},
            content_type="application/json",
            HTTP_X_APPLICANT_TOKEN=token,
        )
        with patch("intake.invites.StudentApplication.objects.select_related") as select_related, \
             patch("intake.views.StudentApplication.objects.filter") as objects_filter:
            select_related.return_value.get.return_value = application
            response = ApplyDraftView.as_view()(request, invite_id=invite.pk)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        objects_filter.assert_not_called()


class TestInviteSingleConsumption:
    """ApplySubmitView: the invite-consuming UPDATE must be conditioned on
    consumed_at IS NULL, not a blind write — see the plan's concurrency
    table ("same invite open in two tabs / two devices")."""

    def test_consumption_update_is_conditioned_on_not_already_consumed(self):
        from .test_submit import _draft as submit_draft
        from .test_submit import _invite as submit_invite
        from .views import ApplySubmitView

        invite = submit_invite()
        application = submit_draft(invite)
        token = issue_session_token(invite, application)
        request = factory.post(f"/api/apply/{invite.pk}/submit/", HTTP_X_APPLICANT_TOKEN=token)

        with patch("intake.invites.StudentApplication.objects.select_related") as select_related, \
             patch("intake.views.StudentApplication.objects.select_for_update") as select_for_update, \
             patch("intake.views.duplicates.find_matches", return_value=[]), \
             patch("intake.views.ApplicationInvite.objects.filter") as invite_filter, \
             patch("intake.views.transaction.atomic", return_value=nullcontext()):
            select_related.return_value.get.return_value = application
            select_for_update.return_value.get.return_value = application
            application.save = MagicMock()
            invite_filter.return_value.update = MagicMock(return_value=1)

            ApplySubmitView.as_view()(request, invite_id=invite.pk)

        invite_filter.assert_called_once_with(pk=invite.pk, consumed_at__isnull=True)


class TestApproveIdempotency:
    """A second approve() call — two registrars on the same queue, or a
    double-click — must not create a second student."""

    def test_second_call_returns_same_student_without_recreating(self):
        from contextlib import ExitStack

        from .models import StudentApplication
        from . import services
        from .test_approval import _application, _enter_approve_mocks

        application = _application()
        application.save = MagicMock()
        with ExitStack() as stack:
            bundle, _, _ = _enter_approve_mocks(stack, application)
            first_result, first_created = services.approve_application(1, actor=None)
            # Simulate the row as it would now read from the DB: approved.
            application.status = StudentApplication.APPROVED
            second_result, second_created = services.approve_application(1, actor=None)

        assert first_created is True
        assert second_created is False
        assert first_result.created_student_id == second_result.created_student_id
        bundle.assert_called_once()  # not called again on the second, idempotent call
