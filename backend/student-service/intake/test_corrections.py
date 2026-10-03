"""
Staff correcting a submitted application before deciding it
(PATCH /api/student-applications/{id}/details/), and the form's optional
sibling age and untouched rows no longer failing a submit.

No @pytest.mark.django_db -- see intake/test_invites.py's module docstring.
The row lock and the duplicate check are mocked, as in test_school_year.py.
"""
import uuid
from contextlib import nullcontext
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.test import APIRequestFactory, force_authenticate

from . import duplicates, services
from .models import ApplicationInvite, StudentApplication
from .views import StudentApplicationViewSet

factory = APIRequestFactory()
REGISTRAR = SimpleNamespace(role="registrar", user_id=3, is_authenticated=True)
TEACHER = SimpleNamespace(role="teacher", user_id=9, is_authenticated=True)


def _bundle(**student):
    return {
        "student": {
            "lrn": "", "first_name": "Juan", "last_name": "Dela Cruz", "sex": "male",
            "birth_date": "2015-06-01", "current_address": "x", "permanent_address": "x",
            **student,
        },
        "household": {"parent_marital_status": "", "living_arrangement": "",
                      "is_4ps_beneficiary": False, "four_ps_id": ""},
        "guardians": [{"relationship": "mother", "full_name": "Maria Dela Cruz",
                       "is_primary_contact": True}],
        "siblings": [],
        "previous_schools": [],
        "applying_for": {"school_level": "junior_highschool", "grade_level": "Grade 7", "strand": ""},
    }


def _application(status_=StudentApplication.IN_REVIEW, revision=2):
    invite = ApplicationInvite(
        invite_id=uuid.uuid4(), applicant_first_name="Juan", applicant_last_name="Dela Cruz",
        contact_email="family@example.com", school_year="2026-2027", issued_by_user_id=1,
        expires_at=timezone.now() + timedelta(days=1),
    )
    application = StudentApplication(
        student_application_id=5, status=status_, revision=revision, school_year="2026-2027",
        first_name="Jaun", last_name="Dela Cruz", payload_json=_bundle(first_name="Jaun"),
    )
    application.invite = invite
    application.save = MagicMock()
    return application


def _correct(application, body, user=REGISTRAR, matches=()):
    request = factory.patch(
        f"/api/student-applications/{application.pk}/details/", body, format="json",
    )
    force_authenticate(request, user=user)
    with patch("intake.views.get_object_or_404"), \
         patch("intake.views.StudentApplication.objects.select_for_update") as locked, \
         patch("intake.duplicates.find_matches", return_value=list(matches)) as find_matches, \
         patch("intake.views.transaction.atomic", return_value=nullcontext()):
        locked.return_value.get.return_value = application
        response = StudentApplicationViewSet.as_view({"patch": "details"})(request, pk=application.pk)
    return response, locked, find_matches


# -- correcting ---------------------------------------------------------------

def test_a_misspelled_name_is_corrected_and_the_queue_columns_follow():
    application = _application()
    response, _, _ = _correct(application, {
        "revision": 2, "payload": _bundle(first_name="Juan", lrn="123456789012"),
    })

    assert response.status_code == status.HTTP_200_OK
    assert response.data["first_name"] == "Juan"
    assert response.data["lrn"] == "123456789012"
    assert response.data["payload_json"]["student"]["first_name"] == "Juan"
    # The grade the family chose survives the correction -- it's what the
    # enrolment form is prefilled with on approval.
    assert response.data["payload_json"]["applying_for"]["grade_level"] == "Grade 7"
    assert response.data["revision"] == 3
    saved = application.save.call_args.kwargs["update_fields"]
    assert {"payload_json", "first_name", "lrn", "revision", "updated_at"} <= set(saved)


def test_duplicates_are_rechecked_without_matching_itself():
    application = _application()
    strong = {"kind": "lrn", "strength": "strong", "student_id": 41,
              "display_name": "Juan Dela Cruz", "student_number": "2026-0041"}
    response, _, find_matches = _correct(
        application, {"revision": 2, "payload": _bundle(lrn="123456789012")}, matches=[strong],
    )

    assert response.status_code == status.HTTP_200_OK
    assert find_matches.call_args.kwargs["exclude_application_id"] == application.pk
    assert response.data["duplicate_of_student_id"] == 41


def test_a_correction_is_validated_like_a_submission():
    application = _application()
    response, locked, _ = _correct(application, {"revision": 2, "payload": _bundle(first_name="")})

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "first_name" in response.data["student"]
    locked.return_value.get.assert_not_called()
    application.save.assert_not_called()


def test_a_correction_still_needs_a_guardian():
    payload = _bundle()
    payload["guardians"] = []
    response, _, _ = _correct(_application(), {"revision": 2, "payload": payload})
    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_someone_elses_save_in_between_is_a_conflict_not_an_overwrite():
    application = _application(revision=4)
    response, _, _ = _correct(application, {"revision": 2, "payload": _bundle()})

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.data["code"] == "stale_revision"
    application.save.assert_not_called()


@pytest.mark.parametrize("status_", [StudentApplication.APPROVED, StudentApplication.REJECTED])
def test_not_once_decided(status_):
    application = _application(status_)
    application.created_student_id = 12
    response, _, _ = _correct(application, {"revision": 2, "payload": _bundle()})

    assert response.status_code == status.HTTP_409_CONFLICT
    application.save.assert_not_called()


def test_revision_is_required():
    response, _, _ = _correct(_application(), {"payload": _bundle()})
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "revision" in response.data


def test_only_staff_who_review_applications_can_correct_them():
    application = _application()
    response, _, _ = _correct(application, {"revision": 2, "payload": _bundle()}, user=TEACHER)
    assert response.status_code == status.HTTP_403_FORBIDDEN
    application.save.assert_not_called()


# -- the form's optional fields -----------------------------------------------

def test_a_sibling_without_an_age_no_longer_fails_the_submission():
    payload = _bundle()
    payload["siblings"] = [{"full_name": "Ana Dela Cruz", "age": ""}, {"full_name": "Ben", "age": "9"}]
    result = services.validated_payload(payload)
    assert [(s["full_name"], s["age"]) for s in result["siblings"]] == [("Ana Dela Cruz", None), ("Ben", 9)]


def test_rows_added_but_never_filled_in_are_dropped():
    payload = _bundle()
    payload["siblings"] = [{"full_name": "  ", "age": ""}]
    payload["previous_schools"] = [{"school_name": "", "school_address": ""}]
    result = services.validated_payload(payload)
    assert result["siblings"] == [] and result["previous_schools"] == []


def test_a_named_school_still_needs_its_address():
    payload = _bundle()
    payload["previous_schools"] = [{"school_name": "ABC Elementary", "school_address": ""}]
    with pytest.raises(serializers.ValidationError):
        services.validated_payload(payload)


def test_find_matches_leaves_the_application_itself_out():
    with patch("intake.duplicates.Student.objects") as students, \
         patch("intake.duplicates.StudentApplication.objects") as applications:
        students.filter.return_value = []
        pending = applications.filter.return_value
        pending.exclude.return_value.filter.return_value = []
        duplicates.find_matches(_bundle(lrn="123456789012")["student"], exclude_application_id=5)
    pending.exclude.assert_called_once_with(pk=5)
