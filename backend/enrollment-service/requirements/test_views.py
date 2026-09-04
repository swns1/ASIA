"""
Tests for the requirements app's file-download wiring: the signed
download URL surfaced by the serializer and the summary() action, and the
file action that redeems the token.

shared/uploads.py's own logic (validate_upload, safe_save, token signing)
is exercised thoroughly in student-service/students/test_uploads.py -- both
services import the same module, so this file only covers what is specific
to enrollment-service: its own URL prefix, its own serializer/view wiring,
and the summary() action frontend actually calls (see requirementApi.js).

StudentRequirementSubmission is managed=False (no table in a fresh
pytest-django DB, same constraint documented in this app's models.py and
worked around the same way accounts/test_permissions.py does in this
service).
"""
from types import SimpleNamespace
from unittest.mock import patch

from django.test import override_settings
from rest_framework.permissions import AllowAny
from rest_framework.test import APIRequestFactory

from shared.uploads import make_download_token, safe_save
from requirements.models import StudentRequirementSubmission
from requirements.serializers import DOWNLOAD_PREFIX, StudentRequirementSubmissionSerializer
from requirements.views import StudentRequirementSubmissionViewSet

factory = APIRequestFactory()


def _submission(image_url="requirements/abc123.jpg", pk=9):
    return SimpleNamespace(student_requirement_submission_id=pk, image_url=image_url)


class TestSerializerImageUrl:
    def test_image_url_uses_this_services_own_hyphenated_prefix(self):
        """enrollment-service's router hyphenates the path
        (student-requirement-submissions); student-service's mirror uses
        underscores. A frontend page hitting the wrong service's prefix
        would 404, so this is worth pinning."""
        assert DOWNLOAD_PREFIX == "/api/student-requirement-submissions/"

    def test_image_url_is_a_signed_link_not_the_raw_storage_path(self):
        serializer = StudentRequirementSubmissionSerializer()
        result = serializer.get_image_url(_submission())
        assert result.startswith(DOWNLOAD_PREFIX)
        assert "token=" in result
        assert "abc123.jpg" not in result

    def test_no_url_when_nothing_submitted(self):
        serializer = StudentRequirementSubmissionSerializer()
        assert serializer.get_image_url(_submission(image_url=None)) is None

    def test_file_kind_reflects_the_stored_extension(self):
        serializer = StudentRequirementSubmissionSerializer()
        assert serializer.get_file_kind(_submission(image_url="requirements/x.pdf")) == "pdf"
        assert serializer.get_file_kind(_submission(image_url="requirements/x.jpg")) == "image"


class TestSummaryAction(object):
    """summary() is what RequirementsPage.jsx / StudentFormPage.jsx actually
    call (see frontend/src/api/requirementApi.js:fetchRequirementSummary) --
    it builds its response dict by hand rather than through the serializer,
    so it needs its own coverage that image_url/file_kind are wired the
    same way there too."""

    # These call the summary() bound method directly rather than going
    # through .as_view()/dispatch() -- summary()'s own logic (dict shape,
    # signed-url wiring) is what's under test here, not the permission
    # gate, which is already covered by IsAdminRegistrarOrReadOnly's own
    # tests in accounts/test_permissions.py. Going through dispatch() would
    # additionally require a real JWT, since this service's
    # DEFAULT_AUTHENTICATION_CLASSES is SingleSessionJWTAuthentication.
    # request.query_params requires a DRF Request, not the raw WSGIRequest
    # APIRequestFactory returns, hence initialize_request().

    def _drf_request(self, view_instance, raw_request):
        # ViewSetMixin.initialize_request() needs action_map, which .as_view()
        # normally builds for us -- set it by hand since we're deliberately
        # bypassing .as_view()/dispatch() (see class docstring above).
        view_instance.action_map = {"get": "summary"}
        return view_instance.initialize_request(raw_request)

    def test_missing_student_id_is_a_400(self):
        view_instance = StudentRequirementSubmissionViewSet()
        request = self._drf_request(view_instance, factory.get("/api/student-requirement-submissions/summary/"))
        response = view_instance.summary(request)
        assert response.status_code == 400

    def test_submitted_requirement_gets_a_signed_url_and_file_kind(self):
        req_type = SimpleNamespace(
            requirement_type_id=1,
            requirement_code="PSA",
            requirement_name="PSA Birth Certificate",
            description="",
        )
        sub = SimpleNamespace(
            requirement_type_id=1,
            is_submitted=True,
            image_url="requirements/xyz.pdf",
            remarks="",
            submitted_at=None,
            verified_at=None,
            student_requirement_submission_id=77,
        )

        view_instance = StudentRequirementSubmissionViewSet()
        request = self._drf_request(
            view_instance, factory.get("/api/student-requirement-submissions/summary/?student_id=1")
        )

        with patch("requirements.views.RequirementType.objects") as rt_objects, \
                patch("requirements.views.StudentRequirementSubmission.objects") as sub_objects:
            rt_objects.filter.return_value = [req_type]
            sub_objects.filter.return_value.select_related.return_value = [sub]
            response = view_instance.summary(request)

        assert response.status_code == 200
        row = response.data[0]
        assert row["submission_id"] == 77
        assert row["file_kind"] == "pdf"
        assert row["image_url"].startswith(DOWNLOAD_PREFIX)
        assert "xyz.pdf" not in row["image_url"]


class TestFileDownloadAction:
    """
    Deliberately no auth/permission classes on the action itself (see its
    docstring in views.py) -- it is reached from a plain img/iframe src,
    which can not attach an Authorization header. Access control is the
    signed token. The @action decorator's own authentication_classes=[]/
    permission_classes=[AllowAny] are only applied by the router at
    dispatch time, so tests calling .as_view() directly must pass the same
    kwargs the router would have supplied.
    """

    def _submission(self, tmp_path, pk=5):
        stored_value, _kind = safe_save(_fake_jpeg(), str(tmp_path))
        return SimpleNamespace(student_requirement_submission_id=pk, image_url=stored_value)

    def _view(self):
        return StudentRequirementSubmissionViewSet.as_view(
            {"get": "file"}, authentication_classes=[], permission_classes=[AllowAny]
        )

    def test_valid_token_streams_the_file(self, tmp_path):
        submission = self._submission(tmp_path)
        token = make_download_token(submission.student_requirement_submission_id)
        with override_settings(MEDIA_ROOT=str(tmp_path)):
            with patch.object(StudentRequirementSubmission.objects, "get", return_value=submission):
                request = factory.get(f"/api/student-requirement-submissions/5/file/?token={token}")
                response = self._view()(request, pk=5)
        assert response.status_code == 200

    def test_missing_token_is_forbidden(self, tmp_path):
        submission = self._submission(tmp_path)
        with override_settings(MEDIA_ROOT=str(tmp_path)):
            with patch.object(StudentRequirementSubmission.objects, "get", return_value=submission):
                request = factory.get("/api/student-requirement-submissions/5/file/")
                response = self._view()(request, pk=5)
        assert response.status_code == 403

    def test_token_for_a_different_submission_is_forbidden(self, tmp_path):
        submission = self._submission(tmp_path, pk=5)
        other_token = make_download_token(999)
        with override_settings(MEDIA_ROOT=str(tmp_path)):
            with patch.object(StudentRequirementSubmission.objects, "get", return_value=submission):
                request = factory.get(f"/api/student-requirement-submissions/5/file/?token={other_token}")
                response = self._view()(request, pk=5)
        assert response.status_code == 403

    def test_nonexistent_submission_is_not_found(self):
        with patch.object(
            StudentRequirementSubmission.objects, "get", side_effect=StudentRequirementSubmission.DoesNotExist
        ):
            request = factory.get("/api/student-requirement-submissions/999/file/?token=whatever")
            response = self._view()(request, pk=999)
        assert response.status_code == 404


def _fake_jpeg():
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile("doc.jpg", b"\xff\xd8\xff\xe0jpeg-bytes", content_type="image/jpeg")
