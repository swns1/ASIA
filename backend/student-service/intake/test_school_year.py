"""
Tests for the school year an application is for: chosen when the invite is
issued (defaulting to the current year, never an unregistered or archived
one), carried by reissue, inherited by the application at submit, and
filterable in the review queue.

No @pytest.mark.django_db — see intake/test_invites.py's module docstring.
The registry (school_years) is read through SchoolYearMirror, mocked here.
"""
import uuid
from contextlib import nullcontext
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.utils import timezone
from rest_framework import status
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from .invites import issue_session_token
from .models import ApplicationInvite, StudentApplication
from .serializers import ApplicationInviteIssueSerializer
from .views import ApplicationInviteViewSet, ApplySubmitView, StudentApplicationViewSet

factory = APIRequestFactory()
REGISTRAR = SimpleNamespace(role="registrar", user_id=3, is_authenticated=True)
NAMES = {"applicant_first_name": "Maria", "applicant_last_name": "Santos"}


def _years(current="2026-2027", registered=None):
    """A mocked registry: `registered` maps label → archived_at."""
    registered = registered if registered is not None else {"2026-2027": None, "2027-2028": None}
    objects = MagicMock()

    def filter_(**kwargs):
        qs = MagicMock()
        if kwargs.get("is_current"):
            qs.values_list.return_value.first.return_value = current
        else:
            label = kwargs["label"]
            qs.values.return_value.first.return_value = (
                {"archived_at": registered[label]} if label in registered else None
            )
        return qs

    objects.filter.side_effect = filter_
    return patch("accounts.enrollment_mirror.SchoolYearMirror.objects", objects)


def _validate(data, **registry):
    with _years(**registry):
        serializer = ApplicationInviteIssueSerializer(data={**NAMES, **data})
        valid = serializer.is_valid()
    return valid, serializer


# -- issuing ------------------------------------------------------------------

def test_an_invite_is_for_the_current_year_unless_told_otherwise():
    valid, serializer = _validate({})
    assert valid
    assert serializer.validated_data["school_year"] == "2026-2027"


def test_an_invite_can_be_for_next_year():
    valid, serializer = _validate({"school_year": "2027-2028"})
    assert valid
    assert serializer.validated_data["school_year"] == "2027-2028"


def test_an_invite_needs_a_registered_year_that_isnt_archived():
    valid, serializer = _validate({"school_year": "2031-2032"})
    assert not valid
    assert "isn't a registered school year" in str(serializer.errors["school_year"])

    valid, serializer = _validate(
        {"school_year": "2024-2025"}, registered={"2024-2025": timezone.now()},
    )
    assert not valid
    assert "archived" in str(serializer.errors["school_year"])


def test_with_no_current_year_the_year_must_be_picked():
    valid, serializer = _validate({}, current=None)
    assert not valid
    assert "No current school year" in str(serializer.errors["school_year"])


def test_issuing_stores_the_year_on_the_invite():
    request = factory.post("/api/application-invites/", {**NAMES, "school_year": "2027-2028"}, format="json")
    force_authenticate(request, user=REGISTRAR)
    with _years(), patch.object(ApplicationInvite, "save") as save:
        response = ApplicationInviteViewSet.as_view({"post": "create"})(request)
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["school_year"] == "2027-2028"
    save.assert_called_once()


def test_a_reissued_invite_keeps_the_year():
    old = ApplicationInvite(
        invite_id=uuid.uuid4(), school_year="2027-2028", issued_by_user_id=1,
        expires_at=timezone.now() + timedelta(days=1), **NAMES,
    )
    request = factory.post(f"/api/application-invites/{old.pk}/reissue/")
    force_authenticate(request, user=REGISTRAR)
    with patch("intake.views.get_object_or_404", return_value=old), \
         patch.object(ApplicationInvite, "save"):
        response = ApplicationInviteViewSet.as_view({"post": "reissue"})(request, pk=old.pk)
    assert response.data["school_year"] == "2027-2028"
    assert response.data["invite_id"] != str(old.pk)


# -- the application ----------------------------------------------------------

def test_an_older_draft_takes_the_invites_year_at_submit():
    invite = ApplicationInvite(
        invite_id=uuid.uuid4(), school_year="2027-2028", issued_by_user_id=1,
        expires_at=timezone.now() + timedelta(days=1), **NAMES,
    )
    application = StudentApplication(
        student_application_id=1, status=StudentApplication.DRAFT,
        payload_json={
            "student": {
                "first_name": "Juan", "last_name": "Dela Cruz", "sex": "male",
                "birth_date": "2015-06-01", "current_address": "x", "permanent_address": "x",
            },
            # Submission requires a parent or guardian.
            "guardians": [{"relationship": "mother", "full_name": "Maria Dela Cruz"}],
        },
    )
    application.invite = invite
    token = issue_session_token(invite, application)
    request = factory.post(f"/api/apply/{invite.pk}/submit/", HTTP_X_APPLICANT_TOKEN=token)

    with patch("intake.invites.StudentApplication.objects.select_related") as select_related, \
         patch("intake.views.StudentApplication.objects.select_for_update") as select_for_update, \
         patch("intake.duplicates.find_matches", return_value=[]), \
         patch("intake.views.ApplicationInvite.objects.filter"), \
         patch("intake.views.transaction.atomic", return_value=nullcontext()):
        select_related.return_value.get.return_value = application
        select_for_update.return_value.get.return_value = application
        application.save = MagicMock()
        response = ApplySubmitView.as_view()(request, invite_id=invite.pk)

    assert response.status_code == status.HTTP_201_CREATED
    assert application.school_year == "2027-2028"


def test_the_review_queue_filters_by_year():
    view = StudentApplicationViewSet()
    view.request = Request(factory.get("/api/student-applications/", {"school_year": "2027-2028"}))
    view.format_kwarg = None
    sql = str(view.get_queryset().query)
    assert '"student_applications"."school_year" = 2027-2028' in sql


# -- correcting the year ------------------------------------------------------

def _change_year(application, year):
    request = factory.patch(
        f"/api/student-applications/{application.pk}/school-year/", {"school_year": year}, format="json",
    )
    force_authenticate(request, user=REGISTRAR)
    with _years(registered={"2026-2027": None, "2027-2028": None, "2024-2025": timezone.now()}), \
         patch("intake.views.get_object_or_404"), \
         patch("intake.views.StudentApplication.objects.select_for_update") as locked, \
         patch("intake.views.transaction.atomic", return_value=nullcontext()):
        locked.return_value.get.return_value = application
        application.save = MagicMock()
        return StudentApplicationViewSet.as_view({"patch": "change_school_year"})(request, pk=application.pk)


def _application(status_=StudentApplication.IN_REVIEW):
    invite = ApplicationInvite(
        invite_id=uuid.uuid4(), school_year="2026-2027", issued_by_user_id=1,
        expires_at=timezone.now() + timedelta(days=1), **NAMES,
    )
    application = StudentApplication(
        student_application_id=5, status=status_, school_year="2026-2027", payload_json={},
    )
    application.invite = invite
    return application


def test_an_application_issued_for_the_wrong_year_can_be_corrected():
    application = _application()
    response = _change_year(application, "2027-2028")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["school_year"] == "2027-2028"
    application.save.assert_called_once_with(update_fields=["school_year", "updated_at"])


def test_only_to_an_open_registered_year():
    response = _change_year(_application(), "2024-2025")
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "archived" in str(response.data["school_year"])


def test_not_once_approved():
    application = _application(StudentApplication.APPROVED)
    application.created_student_id = 12
    response = _change_year(application, "2027-2028")
    assert response.status_code == status.HTTP_409_CONFLICT
    application.save.assert_not_called()
