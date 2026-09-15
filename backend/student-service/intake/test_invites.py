"""
Tests for intake/invites.py: the access-code gate and the applicant
session token (X-Applicant-Token) it mints.

No @pytest.mark.django_db here: this service's test database can't be
built at all in this environment — django.contrib.admin's own
admin.0001_initial migration ALTERs django_admin_log to add a foreign key
to `users`, which is owned by identity-service and has no migration here
(see students/test_uploads.py's docstring for the same, already-documented
constraint on managed=False model tables, and
student_service/test_audit.py's docstring, which names this exact
limitation directly). ApplicationInvite/StudentApplication ARE
Django-managed with a real migration (unlike the students/households/
guardians mirrors), so this isn't about them specifically — it's that no
app in this service can get a real test database session at all here.

Everything below therefore builds model instances directly (never .save()),
which works because ApplicationInvite's primary key is a UUID assigned
client-side (default=uuid.uuid4) rather than a DB-assigned serial, and
mocks the one place a real query would otherwise be needed
(StudentApplication.objects.select_related(...).get(...) inside
verify_session_token).
"""
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.test import override_settings
from django.utils import timezone

from shared.uploads import make_download_token

from .invites import (
    DEFAULT_TTL_SECONDS,
    InvalidApplicantToken,
    generate_access_code,
    issue_session_token,
    verify_session_token,
)
from .models import ApplicationInvite, StudentApplication


def _make_invite(**overrides):
    invite = ApplicationInvite(
        applicant_first_name="Maria",
        applicant_last_name="Santos",
        contact_email="maria@example.com",
        issued_by_user_id=1,
        expires_at=timezone.now() + timedelta(days=3),
    )
    for key, value in overrides.items():
        setattr(invite, key, value)
    invite.set_access_code("ABCD1234")
    return invite


def _make_draft(invite, application_id=1, status=StudentApplication.DRAFT):
    application = StudentApplication(
        student_application_id=application_id, status=status, payload_json={},
    )
    application.invite = invite  # set directly — avoids a real FK lookup
    return application


def _patched_lookup(application):
    """Patches the exact query verify_session_token performs so it returns
    `application` for a matching (pk, invite_id) and raises DoesNotExist
    otherwise — a stand-in for the real query this environment can't run."""

    def get(pk=None, invite_id=None):
        if str(pk) == str(application.pk) and str(invite_id) == str(application.invite.pk):
            return application
        raise StudentApplication.DoesNotExist

    return patch(
        "intake.invites.StudentApplication.objects.select_related",
        return_value=type("Q", (), {"get": staticmethod(get)})(),
    )


class TestAccessCode:
    def test_correct_code_passes_and_resets_attempts(self):
        invite = _make_invite()
        invite.code_attempts = 3
        assert invite.check_access_code("ABCD1234") is True
        assert invite.code_attempts == 0

    def test_wrong_code_fails_and_increments_attempts(self):
        invite = _make_invite()
        assert invite.check_access_code("WRONGCODE") is False
        assert invite.code_attempts == 1
        assert invite.locked_at is None

    def test_locks_after_max_attempts(self):
        invite = _make_invite()
        for _ in range(ApplicationInvite.MAX_CODE_ATTEMPTS):
            invite.check_access_code("nope")
        assert invite.is_locked is True

    def test_locked_invite_rejects_even_the_correct_code(self):
        invite = _make_invite()
        invite.locked_at = timezone.now()
        assert invite.check_access_code("ABCD1234") is False

    def test_generated_code_avoids_ambiguous_characters(self):
        alphabet_bans = set("0O1IL")
        for _ in range(200):
            code = generate_access_code()
            assert len(code) == 8
            assert not (set(code) & alphabet_bans)


class TestInviteState:
    def test_is_usable_true_for_fresh_invite(self):
        assert _make_invite().is_usable is True

    def test_is_usable_false_when_revoked(self):
        assert _make_invite(revoked_at=timezone.now()).is_usable is False

    def test_is_usable_false_when_expired(self):
        assert _make_invite(expires_at=timezone.now() - timedelta(seconds=1)).is_usable is False

    def test_is_usable_false_when_consumed(self):
        assert _make_invite(consumed_at=timezone.now()).is_usable is False


class TestSessionToken:
    def test_round_trip(self):
        invite = _make_invite()
        application = _make_draft(invite)
        token = issue_session_token(invite, application)
        with _patched_lookup(application):
            resolved = verify_session_token(token, invite_id=invite.pk)
        assert resolved.pk == application.pk

    def test_missing_token_rejected(self):
        invite = _make_invite()
        with pytest.raises(InvalidApplicantToken):
            verify_session_token("", invite_id=invite.pk)

    def test_tampered_token_rejected(self):
        invite = _make_invite()
        application = _make_draft(invite)
        token = issue_session_token(invite, application)
        with pytest.raises(InvalidApplicantToken):
            verify_session_token(token + "x", invite_id=invite.pk)

    def test_token_for_a_different_invite_id_is_rejected_without_querying(self):
        """The invite_id embedded in the token must match the URL's
        invite_id before any lookup happens — this is checked without
        the (mocked) DB query even being reachable, so no patch is needed
        here: a mismatch is fatal before that point."""
        invite = _make_invite()
        application = _make_draft(invite)
        token = issue_session_token(invite, application)
        other_invite = _make_invite()
        with pytest.raises(InvalidApplicantToken):
            verify_session_token(token, invite_id=other_invite.pk)

    def test_expired_token_rejected(self):
        invite = _make_invite()
        application = _make_draft(invite)
        with override_settings(APPLICANT_SESSION_TTL_SECONDS=-1):
            token = issue_session_token(invite, application)
            with pytest.raises(InvalidApplicantToken):
                verify_session_token(token, invite_id=invite.pk)

    def test_token_for_a_no_longer_draft_application_rejected(self):
        """Once submitted, the token that authorized drafting must stop
        working — otherwise a leaked token could keep re-editing an
        application after a registrar has started reviewing it."""
        invite = _make_invite()
        application = _make_draft(invite, status=StudentApplication.SUBMITTED)
        token = issue_session_token(invite, application)
        with _patched_lookup(application):
            with pytest.raises(InvalidApplicantToken):
                verify_session_token(token, invite_id=invite.pk)

    def test_token_rejected_when_invite_revoked_after_issue(self):
        invite = _make_invite()
        application = _make_draft(invite)
        token = issue_session_token(invite, application)
        invite.revoked_at = timezone.now()
        with _patched_lookup(application):
            with pytest.raises(InvalidApplicantToken):
                verify_session_token(token, invite_id=invite.pk)

    def test_a_token_minted_for_document_downloads_is_rejected_here(self):
        """The applicant-session salt must differ from
        shared/uploads.py's _SIGNER_SALT — both derive from the same
        SECRET_KEY (shared across all four services), so the salt is the
        only thing that scopes a signed value to one purpose. A token
        minted for one must never verify against the other."""
        foreign_token = make_download_token(12345)
        invite = _make_invite()
        with pytest.raises(InvalidApplicantToken):
            verify_session_token(foreign_token, invite_id=invite.pk)

    def test_default_ttl_is_positive(self):
        assert DEFAULT_TTL_SECONDS > 0
