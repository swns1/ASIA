"""
Tests for the applicant-facing submit path: field whitelisting (the
security-critical assertion — see intake/serializers.py's module docstring),
duplicate detection, and ApplySubmitView's response contract.

No @pytest.mark.django_db — see intake/test_invites.py's module docstring
for why this service's test database can't be built at all in this
environment. Student/Guardian/Household are also managed=False (no table
even if the DB *could* be built — see students/test_uploads.py), so
duplicate-detection tests mock Student.objects directly, and the view tests
mock every ORM call ApplySubmitView makes rather than hitting a real
database.
"""
import uuid
from contextlib import nullcontext
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from django.utils import timezone

import pytest
from django.test import RequestFactory
from rest_framework import status

from students.models import Student

from . import duplicates
from .invites import issue_session_token
from .models import ApplicationInvite, StudentApplication
from .serializers import ApplicantSubmissionSerializer
from .views import ApplySubmitView

factory = RequestFactory()


def _valid_student_payload(**overrides):
    payload = {
        "lrn": "123456789012",
        "first_name": "Juan",
        "last_name": "Dela Cruz",
        "sex": "male",
        "birth_date": "2015-06-01",
        "current_address": "123 Rizal St.",
        "permanent_address": "123 Rizal St.",
    }
    payload.update(overrides)
    return payload


# Every submission needs at least one guardian now (require_a_guardian), so
# a payload meant to be valid carries one.
PARENT = {"relationship": "mother", "full_name": "Maria Dela Cruz", "is_primary_contact": True}


# ── Field whitelisting — the security-critical assertion ──────────────────
#
# BulkStudentSerializer/BulkGuardianSerializer are exclude-based and would
# happily accept student_number, status, and guardians[].user_id if fed
# these keys directly (see intake/serializers.py's module docstring).
# ApplicantSubmissionSerializer is what stands between an applicant's raw
# JSON and that danger — these tests prove it actually drops those keys
# rather than merely being *intended* to.

class TestWhitelisting:
    def test_dangerous_student_fields_are_dropped(self):
        payload = {
            "guardians": [dict(PARENT)],
            "student": _valid_student_payload(
                student_number="2099-9999",  # would claim a permanent, unique id
                status="graduated",           # would falsify the record's state
            ),
        }
        serializer = ApplicantSubmissionSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors
        assert "student_number" not in serializer.data["student"]
        assert "status" not in serializer.data["student"]

    def test_dangerous_guardian_field_is_dropped(self):
        payload = {
            "student": _valid_student_payload(),
            "guardians": [{
                "relationship": "mother",
                "full_name": "Maria Dela Cruz",
                "user_id": 1,  # would attach this contact to an arbitrary login account
            }],
        }
        serializer = ApplicantSubmissionSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors
        assert "user_id" not in serializer.data["guardians"][0]

    def test_only_one_primary_guardian_allowed(self):
        payload = {
            "student": _valid_student_payload(),
            "guardians": [
                {"relationship": "mother", "full_name": "Maria", "is_primary_contact": True},
                {"relationship": "father", "full_name": "Jose", "is_primary_contact": True},
            ],
        }
        serializer = ApplicantSubmissionSerializer(data=payload)
        assert not serializer.is_valid()
        assert "guardians" in serializer.errors

    def test_lrn_is_optional(self):
        """Nursery/kindergarten applicants have no DepEd-assigned LRN yet —
        see the plan's decision 7."""
        payload = {"guardians": [dict(PARENT)], "student": _valid_student_payload(lrn="")}
        serializer = ApplicantSubmissionSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors

    def test_lrn_is_optional_when_null(self):
        payload = {"guardians": [dict(PARENT)], "student": _valid_student_payload(lrn=None)}
        serializer = ApplicantSubmissionSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors

    def test_twelve_digit_lrn_is_accepted(self):
        payload = {"guardians": [dict(PARENT)], "student": _valid_student_payload(lrn="136789012345")}
        serializer = ApplicantSubmissionSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors

    def test_malformed_lrn_is_rejected(self):
        """Optional is not the same as unvalidated. The 12-digit rule was
        enforced only in the browser, so a direct POST to this public
        endpoint could store a malformed national learner identifier."""
        for bad in ("13678", "1367890123456", "1367-8901-2345", "13678901234X"):
            payload = {"guardians": [dict(PARENT)], "student": _valid_student_payload(lrn=bad)}
            serializer = ApplicantSubmissionSerializer(data=payload)
            assert not serializer.is_valid(), bad
            assert "lrn" in serializer.errors["student"], bad

    def test_duplicate_email_does_not_block_submission(self):
        """A UniqueValidator here would 400 on a duplicate email — turning
        this public endpoint into an oracle for "does this email already
        belong to a student?" (see the ApplicantStudentSerializer docstring
        in intake/serializers.py). This test would fail loudly if that
        override were ever reverted, since nothing here touches a real
        `students` table for it to check against."""
        payload = {"guardians": [dict(PARENT)], "student": _valid_student_payload(email="taken@example.com")}
        serializer = ApplicantSubmissionSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors


# ── Duplicate detection: flag, never block ─────────────────────────────────

class TestFindMatches:
    def _fake_student(self, **kw):
        defaults = dict(
            student_id=1, student_number="2026-0001", lrn="123456789012",
            first_name="Juan", last_name="Dela Cruz", sex="male",
            birth_date=date(2015, 6, 1), current_address="x", permanent_address="x",
        )
        defaults.update(kw)
        return Student(**defaults)

    def test_lrn_match_is_strong(self):
        match = self._fake_student()
        with patch.object(Student, "objects") as student_manager, \
             patch.object(StudentApplication, "objects") as application_manager:
            student_manager.filter.return_value = [match]
            application_manager.filter.return_value.filter.return_value = []
            matches = duplicates.find_matches(_valid_student_payload())
        assert any(m["kind"] == "lrn" and m["strength"] == "strong" for m in matches)

    def test_no_match_returns_empty_list(self):
        with patch.object(Student, "objects") as student_manager, \
             patch.object(StudentApplication, "objects") as application_manager:
            student_manager.filter.return_value = []
            application_manager.filter.return_value.filter.return_value = []
            matches = duplicates.find_matches(_valid_student_payload(lrn=""))
        assert matches == []

    def test_strongest_student_id_prefers_strong_matches(self):
        matches = [
            {"kind": "surname_dob", "strength": "weak", "student_id": 9},
            {"kind": "lrn", "strength": "strong", "student_id": 5},
        ]
        assert duplicates.strongest_student_id(matches) == 5

    def test_strongest_student_id_ignores_pending_application_matches(self):
        """A strong match against another *application* must never set
        duplicate_of_student_id — that column names a real student, and
        conflating the two would point staff at the wrong record."""
        matches = [{"kind": "lrn_pending", "strength": "weak", "application_id": 7}]
        assert duplicates.strongest_student_id(matches) is None


# ── ApplySubmitView: response contract ──────────────────────────────────────

def _invite(pk=None):
    invite = ApplicationInvite(
        invite_id=pk or uuid.uuid4(),
        applicant_first_name="Juan", applicant_last_name="Dela Cruz",
        issued_by_user_id=1,
        expires_at=timezone.now() + timedelta(days=1),
    )
    return invite


def _draft(invite, application_id=1, payload=None):
    application = StudentApplication(
        student_application_id=application_id,
        status=StudentApplication.DRAFT,
        payload_json=payload or {"guardians": [dict(PARENT)], "student": _valid_student_payload()},
    )
    application.invite = invite
    return application


class TestApplySubmitView:
    def test_missing_token_is_rejected_before_any_db_access(self):
        invite = _invite()
        request = factory.post(f"/api/apply/{invite.pk}/submit/")
        response = ApplySubmitView.as_view()(request, invite_id=invite.pk)
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data["code"] == "applicant_token_invalid"

    def _post_with_token(self, invite, application):
        token = issue_session_token(invite, application)
        request = factory.post(f"/api/apply/{invite.pk}/submit/", HTTP_X_APPLICANT_TOKEN=token)
        return request

    def test_valid_submission_returns_reference_and_marks_submitted(self):
        invite = _invite()
        application = _draft(invite)
        request = self._post_with_token(invite, application)

        with patch("intake.invites.StudentApplication.objects.select_related") as select_related, \
             patch("intake.views.StudentApplication.objects.select_for_update") as select_for_update, \
             patch("intake.views.duplicates.find_matches", return_value=[]), \
             patch("intake.views.ApplicationInvite.objects.filter") as invite_filter, \
             patch("intake.views.transaction.atomic", return_value=nullcontext()):
            select_related.return_value.get.return_value = application
            select_for_update.return_value.get.return_value = application
            application.save = MagicMock()
            invite_filter.return_value.update = MagicMock(return_value=1)

            response = ApplySubmitView.as_view()(request, invite_id=invite.pk)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == StudentApplication.SUBMITTED
        assert response.data["reference"] == application.reference
        application.save.assert_called_once()

    def test_replay_after_submission_returns_200_not_a_new_row(self):
        """A double-tap or a retried request on flaky mobile data must not
        create a second application — see the plan's concurrency table."""
        invite = _invite()
        application = _draft(invite, payload={"guardians": [dict(PARENT)], "student": _valid_student_payload()})
        application.status = StudentApplication.SUBMITTED  # already submitted
        request = self._post_with_token(invite, application)

        with patch("intake.invites.StudentApplication.objects.select_related") as select_related, \
             patch("intake.views.StudentApplication.objects.select_for_update") as select_for_update, \
             patch("intake.views.transaction.atomic", return_value=nullcontext()):
            select_related.return_value.get.return_value = application
            select_for_update.return_value.get.return_value = application

            response = ApplySubmitView.as_view()(request, invite_id=invite.pk)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["reference"] == application.reference

    def test_response_is_identical_whether_or_not_a_duplicate_was_flagged(self):
        """See intake/duplicates.py's module docstring: the public submit
        response must never leak whether a match was found — that would
        make an unauthenticated endpoint answer "is this child already a
        student here?"."""
        def run(matches):
            invite = _invite()
            application = _draft(invite)
            request = self._post_with_token(invite, application)
            with patch("intake.invites.StudentApplication.objects.select_related") as select_related, \
                 patch("intake.views.StudentApplication.objects.select_for_update") as select_for_update, \
                 patch("intake.views.duplicates.find_matches", return_value=matches), \
                 patch("intake.views.ApplicationInvite.objects.filter") as invite_filter, \
                 patch("intake.views.transaction.atomic", return_value=nullcontext()):
                select_related.return_value.get.return_value = application
                select_for_update.return_value.get.return_value = application
                application.save = MagicMock()
                invite_filter.return_value.update = MagicMock(return_value=1)
                response = ApplySubmitView.as_view()(request, invite_id=invite.pk)
            return {k: v for k, v in response.data.items()}

        clean = run([])
        flagged = run([{"kind": "lrn", "strength": "strong", "student_id": 1,
                         "display_name": "x", "student_number": "y"}])
        assert clean.keys() == flagged.keys()
        assert set(clean) == {"reference", "status", "submitted_at"}


# ── applying_for — the one enrollment-shaped key in payload_json ──────────
#
# The kiosk asks what grade a family is enrolling into so the registrar
# isn't guessing at approval time. It rides in payload_json and must stay
# advisory: it is not student data, and an applicant must not be able to
# name their own section (that is the registrar's decision, and the
# `enrollments` table is read-only from this service —
# see accounts/enrollment_mirror.py).

class TestApplyingFor:
    def test_section_and_status_are_dropped(self):
        from .serializers import ALLOWED_APPLYING_FOR_FIELDS, whitelist

        cleaned = whitelist(
            {
                "grade_level": "Grade 11",
                "school_level": "senior_highschool",
                "strand": "STEM",
                "section": "Sampaguita",      # registrar's call, never the applicant's
                "enrollment_status": "enrolled",  # would skip the review it exists for
                "school_year": "2099-2100",
            },
            ALLOWED_APPLYING_FOR_FIELDS,
        )

        assert cleaned == {
            "grade_level": "Grade 11",
            "school_level": "senior_highschool",
            "strand": "STEM",
        }

    def _submit(self, invite, application):
        """Drives ApplySubmitView with every ORM call mocked, the same way
        TestApplySubmitView does — see this module's docstring for why there
        is no real database to hit."""
        token = issue_session_token(invite, application)
        request = factory.post(f"/api/apply/{invite.pk}/submit/", HTTP_X_APPLICANT_TOKEN=token)

        with patch("intake.invites.StudentApplication.objects.select_related") as select_related,              patch("intake.views.StudentApplication.objects.select_for_update") as select_for_update,              patch("intake.views.duplicates.find_matches", return_value=[]),              patch("intake.views.ApplicationInvite.objects.filter") as invite_filter,              patch("intake.views.transaction.atomic", return_value=nullcontext()):
            select_related.return_value.get.return_value = application
            select_for_update.return_value.get.return_value = application
            application.save = MagicMock()
            invite_filter.return_value.update = MagicMock(return_value=1)

            return ApplySubmitView.as_view()(request, invite_id=invite.pk)

    def test_survives_submission(self):
        """ApplicantSubmissionSerializer declares only the five record-shaped
        keys, so `serializer.data` drops applying_for — and submit assigns that
        over the whole payload. Without carrying it across, the grade level the
        family chose was destroyed at submit and the enrolment prefill the
        registrar gets on approval was silently always empty."""
        invite = _invite()
        application = _draft(invite, payload={
            "guardians": [dict(PARENT)],
            "student": _valid_student_payload(),
            "applying_for": {"grade_level": "Grade 7", "school_level": "junior_highschool"},
        })

        response = self._submit(invite, application)

        assert response.status_code == status.HTTP_201_CREATED
        assert application.payload_json["applying_for"] == {
            "grade_level": "Grade 7",
            "school_level": "junior_highschool",
        }
        # The student bundle still validated and survived alongside it.
        assert application.payload_json["student"]["first_name"] == "Juan"

    def test_submission_is_no_more_permissive_than_the_draft(self):
        """Carrying the key across must not become a hole: submit re-applies
        the same allow-list the draft PATCH uses, so a client that posts
        straight to submit cannot smuggle in a section or a status."""
        invite = _invite()
        application = _draft(invite, payload={
            "guardians": [dict(PARENT)],
            "student": _valid_student_payload(),
            "applying_for": {
                "grade_level": "Grade 11",
                "strand": "STEM",
                "section": "Sampaguita",          # registrar's call, never the applicant's
                "enrollment_status": "enrolled",  # would skip the review it exists for
            },
        })

        response = self._submit(invite, application)

        assert response.status_code == status.HTTP_201_CREATED
        assert application.payload_json["applying_for"] == {
            "grade_level": "Grade 11",
            "strand": "STEM",
        }

    def test_never_reaches_the_student_bundle(self):
        from .services import _whitelisted_bundle

        student, household, guardians, siblings, schools = _whitelisted_bundle({
            "student": {"first_name": "Juan", "last_name": "Dela Cruz"},
            "applying_for": {"grade_level": "Grade 7", "school_level": "junior_highschool"},
        })

        # approve_application builds the real Student from this bundle, so
        # anything applying_for leaked into here would become student data.
        assert "grade_level" not in student
        assert "school_level" not in student
        assert student == {"first_name": "Juan", "last_name": "Dela Cruz"}
        assert (household, guardians, siblings, schools) == (None, [], [], [])


class TestGuardianRule:
    """At least one guardian, one primary contact -- the same rule the counter
    form enforces (students.serializers.require_a_guardian)."""

    def test_a_submission_with_no_guardian_is_refused(self):
        serializer = ApplicantSubmissionSerializer(data={"student": _valid_student_payload()})
        assert not serializer.is_valid()
        assert "guardians" in serializer.errors

    def test_the_first_guardian_becomes_primary_when_none_is_marked(self):
        serializer = ApplicantSubmissionSerializer(data={
            "student": _valid_student_payload(),
            "guardians": [
                {"relationship": "mother", "full_name": "Maria", "is_primary_contact": False},
                {"relationship": "father", "full_name": "Jose"},
            ],
        })
        assert serializer.is_valid(), serializer.errors
        flags = [g.get("is_primary_contact", False) for g in serializer.validated_data["guardians"]]
        assert flags == [True, False]


class TestBlankEmail:
    """A blank email is stored as null. As \"\" it collided on students.email's
    unique index with the first student approved without one, and every later
    approval failed with a 500."""

    def test_blank_email_becomes_null(self):
        serializer = ApplicantSubmissionSerializer(
            data={"guardians": [dict(PARENT)], "student": _valid_student_payload(email="  ")}
        )
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["student"]["email"] is None
