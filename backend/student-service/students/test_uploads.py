"""
Tests for shared/uploads.py (upload validation, safe storage, signed
download tokens) and their wiring into StudentRequirementSubmission's
serializer + the file-download action on
StudentRequirementSubmissionViewSet.

Closing the leak this replaces: uploaded documents used to be saved under
their caller-supplied filename and served back by Django's public
static(MEDIA_URL, ...) route with zero auth check, whenever DEBUG was on
(which was always -- DEBUG was hardcoded True in every service's settings).
These tests exist so a regression back to that state fails CI, not just a
manual check.

image_url/file_kind are only ever exercised through the serializer/view
here, not against a real StudentRequirementSubmission row -- the model is
managed=False (no table in a fresh pytest-django DB), same constraint every
other test file in this service works around (see test_ocr.py, this
service's test_permissions.py).
"""
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.permissions import AllowAny
from rest_framework.test import APIRequestFactory

from shared.uploads import (
    ALLOWED_EXTENSIONS,
    MAX_UPLOAD_BYTES,
    download_url,
    file_kind_for,
    make_download_token,
    resolve_stored_path,
    safe_save,
    validate_upload,
    verify_download_token,
)
from students.models import StudentRequirementSubmission
from students.serializers import DOWNLOAD_PREFIX, StudentRequirementSubmissionSerializer
from students.views import StudentRequirementSubmissionViewSet

factory = APIRequestFactory()


def _jpeg(name="doc.jpg", body=b"\xff\xd8\xff\xe0rest-of-a-jpeg"):
    return SimpleUploadedFile(name, body, content_type="image/jpeg")


def _pdf(name="doc.pdf", body=b"%PDF-1.4\n...rest of a pdf..."):
    return SimpleUploadedFile(name, body, content_type="application/pdf")


# -- validate_upload / safe_save ---------------------------------------------

class TestValidateUpload:
    def test_genuine_jpeg_passes(self):
        ext, kind = validate_upload(_jpeg())
        assert (ext, kind) == (".jpg", "image")

    def test_genuine_pdf_passes(self):
        ext, kind = validate_upload(_pdf())
        assert (ext, kind) == (".pdf", "pdf")

    def test_disallowed_extension_rejected(self):
        upload = SimpleUploadedFile("payload.html", b"<script>alert(1)</script>", content_type="text/html")
        with pytest.raises(ValidationError):
            validate_upload(upload)

    def test_disallowed_svg_rejected(self):
        # SVG is a plausible "it is just an image" request but is script-capable.
        upload = SimpleUploadedFile("x.svg", b"<svg onload=alert(1)></svg>", content_type="image/svg+xml")
        with pytest.raises(ValidationError):
            validate_upload(upload)

    def test_renamed_html_with_image_extension_rejected(self):
        """The core of the fix: extension alone is not enough. A file named
        .jpg whose contents are not a JPEG must be rejected, or an attacker
        can plant an HTML/script payload that later gets served back."""
        upload = SimpleUploadedFile(
            "innocent.jpg", b"<html><body>not a jpeg</body></html>", content_type="image/jpeg"
        )
        with pytest.raises(ValidationError):
            validate_upload(upload)

    def test_oversized_file_rejected(self):
        upload = SimpleUploadedFile("big.jpg", b"\xff\xd8\xff" + b"0" * 10, content_type="image/jpeg")
        upload.size = MAX_UPLOAD_BYTES + 1  # avoid actually allocating 10MB+ in the test
        with pytest.raises(ValidationError):
            validate_upload(upload)

    def test_every_allowed_extension_has_a_signature(self):
        # Guards against a future edit adding an extension without giving it
        # a magic-byte signature, which would silently accept any content.
        for ext, (kind, signatures) in ALLOWED_EXTENSIONS.items():
            assert signatures, f"{ext} has no magic-byte signature"


class TestSafeSave:
    def test_stores_under_a_random_name_not_the_original(self, tmp_path):
        stored_value, kind = safe_save(_jpeg(name="birth_certificate_juan_dela_cruz.jpg"), str(tmp_path))
        assert kind == "image"
        assert stored_value.startswith("requirements/")
        assert "birth_certificate_juan_dela_cruz" not in stored_value
        assert stored_value.endswith(".jpg")

    def test_saved_file_is_readable_back_at_the_returned_path(self, tmp_path):
        stored_value, _kind = safe_save(_pdf(), str(tmp_path))
        full_path = resolve_stored_path(str(tmp_path), stored_value)
        with open(full_path, "rb") as f:
            assert f.read().startswith(b"%PDF-")

    def test_invalid_upload_is_not_saved(self, tmp_path):
        with pytest.raises(ValidationError):
            safe_save(SimpleUploadedFile("x.exe", b"MZ\x90\x00"), str(tmp_path))
        req_dir = tmp_path / "requirements"
        assert not req_dir.exists() or not list(req_dir.iterdir())


class TestResolveStoredPath:
    def test_takes_only_the_basename(self, tmp_path):
        """A stored value is never client-controlled at read time (it comes
        from the DB), but this stays defence-in-depth: no matter what ends
        up in image_url, resolution can not walk outside media_root/requirements."""
        path = resolve_stored_path(str(tmp_path), "requirements/../../etc/passwd")
        assert path == str(tmp_path / "requirements" / "passwd")

    def test_handles_the_old_pre_signing_url_shape(self, tmp_path):
        # Rows written before this module existed stored a public media URL.
        path = resolve_stored_path(str(tmp_path), "/media/requirements/some-original-name.jpg")
        assert path == str(tmp_path / "requirements" / "some-original-name.jpg")


class TestFileKindFor:
    def test_recognises_each_allowed_extension(self):
        assert file_kind_for("requirements/x.jpg") == "image"
        assert file_kind_for("requirements/x.PNG") == "image"
        assert file_kind_for("requirements/x.pdf") == "pdf"

    def test_none_for_unrecognised_or_missing(self):
        assert file_kind_for("requirements/x.exe") is None
        assert file_kind_for(None) is None
        assert file_kind_for("") is None


# -- signed download tokens ---------------------------------------------------

class TestDownloadTokens:
    def test_valid_token_round_trips(self):
        token = make_download_token(42)
        assert verify_download_token(token, 42) is True

    def test_token_is_scoped_to_its_submission_id(self):
        """The whole point of signing the id into the token: a valid token
        for one document must not open a different one just because the
        pk in the URL was edited."""
        token = make_download_token(42)
        assert verify_download_token(token, 43) is False

    def test_missing_token_rejected(self):
        assert verify_download_token(None, 42) is False
        assert verify_download_token("", 42) is False

    def test_tampered_token_rejected(self):
        token = make_download_token(42)
        flipped = token[:-1] + ("0" if token[-1] != "0" else "1")
        assert verify_download_token(flipped, 42) is False

    def test_expired_token_rejected(self, monkeypatch):
        token = make_download_token(42)
        monkeypatch.setattr("shared.uploads._TOKEN_MAX_AGE", -1)
        assert verify_download_token(token, 42) is False


class TestDownloadUrl:
    def test_no_url_when_no_file(self):
        assert download_url("/api/x/", 1, has_file=False) is None

    def test_url_shape_when_file_present(self):
        url = download_url("/api/x/", 7, has_file=True)
        assert url.startswith("/api/x/7/file/?token=")


# -- serializer wiring --------------------------------------------------------

def _submission(image_url="requirements/abc123.jpg", pk=9):
    return SimpleNamespace(
        student_requirement_submission_id=pk,
        image_url=image_url,
    )


class TestSerializerImageUrl:
    def test_image_url_is_a_signed_download_link_not_a_raw_path(self):
        serializer = StudentRequirementSubmissionSerializer()
        result = serializer.get_image_url(_submission())
        assert result.startswith(DOWNLOAD_PREFIX)
        assert "token=" in result
        # The raw storage path must never reach the client -- that path is
        # an implementation detail, and leaking it would let a client guess
        # at unsigned static URLs again.
        assert "abc123.jpg" not in result

    def test_no_url_when_nothing_submitted(self):
        serializer = StudentRequirementSubmissionSerializer()
        assert serializer.get_image_url(_submission(image_url=None)) is None

    def test_file_kind_reflects_the_stored_extension(self):
        serializer = StudentRequirementSubmissionSerializer()
        assert serializer.get_file_kind(_submission(image_url="requirements/x.pdf")) == "pdf"
        assert serializer.get_file_kind(_submission(image_url="requirements/x.jpg")) == "image"


# -- the download action itself ------------------------------------------------

class TestFileDownloadAction:
    """
    The file action deliberately has no auth/permission classes (see its
    docstring in views.py) -- it is reached from a plain img/iframe src,
    which can not carry an Authorization header. All access control is the
    signed token, so these tests exercise the view function directly
    rather than through DRF's permission pipeline.
    """

    def _submission(self, tmp_path, content=b"\xff\xd8\xff\xe0jpeg-bytes", pk=5):
        stored_value, _kind = safe_save(_jpeg(body=content), str(tmp_path))
        return SimpleNamespace(student_requirement_submission_id=pk, image_url=stored_value)

    def test_valid_token_streams_the_file(self, tmp_path):
        submission = self._submission(tmp_path)
        token = make_download_token(submission.student_requirement_submission_id)

        with override_settings(MEDIA_ROOT=str(tmp_path)):
            with patch.object(StudentRequirementSubmission.objects, "get", return_value=submission):
                request = factory.get(f"/api/student_requirement_submissions/5/file/?token={token}")
                # The @action decorator's own authentication_classes=[]/
                # permission_classes=[AllowAny] only get applied when the
                # viewset is reached through the router (SimpleRouter passes
                # them as as_view() kwargs) -- replicate that here rather
                # than going through full URL routing.
                view = StudentRequirementSubmissionViewSet.as_view(
                    {"get": "file"}, authentication_classes=[], permission_classes=[AllowAny]
                )
                response = view(request, pk=5)

        assert response.status_code == 200

    def test_missing_token_is_forbidden(self, tmp_path):
        submission = self._submission(tmp_path)
        with override_settings(MEDIA_ROOT=str(tmp_path)):
            with patch.object(StudentRequirementSubmission.objects, "get", return_value=submission):
                request = factory.get("/api/student_requirement_submissions/5/file/")
                # The @action decorator's own authentication_classes=[]/
                # permission_classes=[AllowAny] only get applied when the
                # viewset is reached through the router (SimpleRouter passes
                # them as as_view() kwargs) -- replicate that here rather
                # than going through full URL routing.
                view = StudentRequirementSubmissionViewSet.as_view(
                    {"get": "file"}, authentication_classes=[], permission_classes=[AllowAny]
                )
                response = view(request, pk=5)
        assert response.status_code == 403

    def test_token_for_a_different_submission_is_forbidden(self, tmp_path):
        submission = self._submission(tmp_path, pk=5)
        other_token = make_download_token(999)
        with override_settings(MEDIA_ROOT=str(tmp_path)):
            with patch.object(StudentRequirementSubmission.objects, "get", return_value=submission):
                request = factory.get(f"/api/student_requirement_submissions/5/file/?token={other_token}")
                # The @action decorator's own authentication_classes=[]/
                # permission_classes=[AllowAny] only get applied when the
                # viewset is reached through the router (SimpleRouter passes
                # them as as_view() kwargs) -- replicate that here rather
                # than going through full URL routing.
                view = StudentRequirementSubmissionViewSet.as_view(
                    {"get": "file"}, authentication_classes=[], permission_classes=[AllowAny]
                )
                response = view(request, pk=5)
        assert response.status_code == 403

    def test_nonexistent_submission_is_not_found(self):
        with patch.object(
            StudentRequirementSubmission.objects, "get", side_effect=StudentRequirementSubmission.DoesNotExist
        ):
            request = factory.get("/api/student_requirement_submissions/999/file/?token=whatever")
            view = StudentRequirementSubmissionViewSet.as_view(
                {"get": "file"}, authentication_classes=[], permission_classes=[AllowAny]
            )
            response = view(request, pk=999)
        assert response.status_code == 404

    def test_no_file_on_record_is_not_found(self):
        submission = SimpleNamespace(student_requirement_submission_id=5, image_url=None)
        token = make_download_token(5)
        with patch.object(StudentRequirementSubmission.objects, "get", return_value=submission):
            request = factory.get(f"/api/student_requirement_submissions/5/file/?token={token}")
            view = StudentRequirementSubmissionViewSet.as_view(
                {"get": "file"}, authentication_classes=[], permission_classes=[AllowAny]
            )
            response = view(request, pk=5)
        assert response.status_code == 404
