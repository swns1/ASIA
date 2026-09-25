"""
Intake regressions from the student-service QA pass (2026-09-25): requests
that answered 500 for the caller's mistake, and the kiosk session that was
never renewed. DB-free -- see intake/test_invites.py.
"""
import uuid
from contextlib import nullcontext
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core import signing
from django.test import RequestFactory
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound

from . import services
from .invites import SESSION_SALT, issue_session_token
from .models import ApplicationInvite, StudentApplication
from .views import ApplyDraftView

factory = RequestFactory()


def _invite():
    return ApplicationInvite(
        invite_id=uuid.uuid4(), applicant_first_name="Juan", applicant_last_name="Dela Cruz",
        issued_by_user_id=1, expires_at=timezone.now() + timedelta(days=1),
    )


def _draft(invite, revision=3):
    application = StudentApplication(
        student_application_id=1, status=StudentApplication.DRAFT, revision=revision, payload_json={},
    )
    application.invite = invite
    return application


class TestMissingApplication:
    """approve/reject on an id that doesn't exist raised DoesNotExist -> 500."""

    @pytest.mark.parametrize("call", [
        lambda: services.approve_application(999, actor=None),
        lambda: services.reject_application(999, actor=None, note="x"),
    ])
    def test_is_a_404(self, call):
        with patch("intake.services.transaction.atomic", return_value=nullcontext()), \
                patch("intake.services.StudentApplication.objects.select_for_update") as sfu:
            sfu.return_value.get.side_effect = StudentApplication.DoesNotExist
            with pytest.raises(NotFound):
                call()


class TestDraftAutosave:
    def _patch(self, invite, application, body):
        token = issue_session_token(invite, application)
        request = factory.patch(
            f"/api/apply/{invite.pk}/draft/", data=body,
            content_type="application/json", HTTP_X_APPLICANT_TOKEN=token,
        )
        with patch("intake.invites.StudentApplication.objects.select_related") as select_related, \
                patch("intake.views.StudentApplication.objects.filter") as objects_filter, \
                patch("intake.views.StudentApplication.objects.get") as objects_get:
            select_related.return_value.get.return_value = application
            objects_filter.return_value.update.return_value = 1
            objects_get.return_value = _draft(invite, revision=application.revision + 1)
            response = ApplyDraftView.as_view()(request, invite_id=invite.pk)
        return response, objects_filter

    def test_a_payload_that_is_not_an_object_is_a_400(self):
        invite = _invite()
        response, objects_filter = self._patch(invite, _draft(invite), {"revision": 3, "payload": ["x"]})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        objects_filter.assert_not_called()

    def test_a_non_numeric_revision_is_a_400(self):
        invite = _invite()
        response, _ = self._patch(invite, _draft(invite), {"revision": "abc", "payload": {}})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_null_lists_are_saved_as_empty_rather_than_crashing(self):
        invite = _invite()
        response, objects_filter = self._patch(
            invite, _draft(invite), {"revision": 3, "payload": {"guardians": None, "siblings": "x"}},
        )
        assert response.status_code == status.HTTP_200_OK
        saved = objects_filter.return_value.update.call_args.kwargs["payload_json"]
        assert saved["guardians"] == [] and saved["siblings"] == []

    def test_every_save_hands_back_a_fresh_session_token(self):
        """Without renewal the session ended two hours after the code was
        entered, however recently the applicant had saved."""
        invite = _invite()
        response, _ = self._patch(invite, _draft(invite), {"revision": 3, "payload": {}})
        assert response.status_code == status.HTTP_200_OK
        claims = signing.loads(response.data["token"], salt=SESSION_SALT)
        assert claims["invite_id"] == str(invite.pk)
