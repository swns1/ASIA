"""
Shared upload validation and signed-download support for student documents
(PSA birth certificates, Form 137s, good-moral certificates, etc.).

Both student-service (students/serializers.py) and enrollment-service
(requirements/serializers.py) save into the same media/requirements/ shape
but are otherwise independent Django projects with no shared model base, so
this validation + signing logic lives here rather than being duplicated
twice and drifting.

Why signed download tokens instead of just requiring a Bearer token on the
download endpoint: the document is displayed via plain <img>/<iframe> tags
in the SPA, which cannot attach an Authorization header. The alternative to
a signed URL is JS-side blob fetching (fetch + object URL) at every render
site, which would mean touching two 1,000+ line page components and firing
one authenticated request per thumbnail. A short-lived, submission-scoped
signed token — the same pattern S3/GCS presigned URLs use — gets the same
security property (only someone who already made an authenticated,
authorized API call can ever get a working link, and the link is useless
within minutes) without either cost.
"""
import os
import uuid

from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

# extension -> (file "kind" the frontend uses to pick an <img> vs. other
# renderer, magic-byte signatures the actual content must start with).
# Deliberately small and explicit — trusting the browser-supplied
# content-type or the client's filename is how a renamed .html gets served
# back as a "document".
_JPEG_SIGS = (b"\xff\xd8\xff",)
_PNG_SIGS = (b"\x89PNG\r\n\x1a\n",)
_PDF_SIGS = (b"%PDF-",)

ALLOWED_EXTENSIONS = {
    ".jpg": ("image", _JPEG_SIGS),
    ".jpeg": ("image", _JPEG_SIGS),
    ".png": ("image", _PNG_SIGS),
    ".pdf": ("pdf", _PDF_SIGS),
}

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB — matches students/ocr/views.py's scan cap

_SIGNER_SALT = "requirement-document-download"
_TOKEN_MAX_AGE = 300  # 5 minutes: long enough to load a page of thumbnails,
                       # short enough that a token leaked via browser history,
                       # a Referer header, or a proxy log is worthless soon after.


def validate_upload(upload):
    """
    Raises django.core.exceptions.ValidationError (DRF serializers turn this
    into a 400) unless `upload` is a real file of an allowed type under the
    size cap. Checks the extension AND the first bytes, so a .html or .svg
    renamed to end in .jpg is rejected, not just filtered by suffix.

    Returns (extension, file_kind) on success.
    """
    if upload.size > MAX_UPLOAD_BYTES:
        raise ValidationError(
            f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
        )

    ext = os.path.splitext(upload.name or "")[1].lower()
    entry = ALLOWED_EXTENSIONS.get(ext)
    if not entry:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise ValidationError(f"Unsupported file type '{ext or '(none)'}'. Allowed: {allowed}.")

    kind, signatures = entry
    head = upload.read(16)
    upload.seek(0)
    if not any(head.startswith(sig) for sig in signatures):
        raise ValidationError(
            f"This file's contents don't match a {ext} file. Please upload a genuine document."
        )
    return ext, kind


def safe_save(upload, media_root, subdir="requirements"):
    """
    Validates `upload` (raises ValidationError if it fails) and saves it
    under a random UUID filename — never the caller-supplied name — so an
    uploaded document can't be used to plant a guessable or attacker-chosen
    filename underneath the app's own origin.

    Returns (stored_value, file_kind). stored_value is what should be saved
    into the image_url column: "requirements/<uuid>.<ext>", relative to
    media_root.
    """
    ext, kind = validate_upload(upload)

    location = os.path.join(media_root, subdir)
    os.makedirs(location, exist_ok=True)
    fs = FileSystemStorage(location=location)
    filename = fs.save(f"{uuid.uuid4().hex}{ext}", upload)
    return f"{subdir}/{filename}", kind


def resolve_stored_path(media_root, stored_value, subdir="requirements"):
    """
    Maps an image_url column value back to an absolute filesystem path
    under media_root/subdir. Handles both the new "requirements/<uuid>.ext"
    shape and the older "/media/requirements/<original-name>" shape written
    before this module existed — both end in "<subdir>/<name>", and taking
    just the basename works for either and can never walk outside subdir
    regardless of what the stored value contains.
    """
    filename = os.path.basename(stored_value or "")
    return os.path.join(media_root, subdir, filename)


def file_kind_for(stored_value):
    """Best-effort file kind from a stored value's extension, for rows
    saved before file_kind was tracked separately. None if unrecognised."""
    ext = os.path.splitext(stored_value or "")[1].lower()
    entry = ALLOWED_EXTENSIONS.get(ext)
    return entry[0] if entry else None


def make_download_token(submission_id):
    """A short-lived token proving the holder was allowed, at mint time, to
    see this specific submission's document."""
    return TimestampSigner(salt=_SIGNER_SALT).sign(str(submission_id))


def download_url(url_prefix, submission_id, has_file):
    """Builds the signed download URL a serializer/view should hand back as
    image_url. `url_prefix` differs between services (enrollment-service
    hyphenates its router path, student-service uses underscores) — pass
    the service's own prefix rather than hardcoding one here."""
    if not has_file:
        return None
    token = make_download_token(submission_id)
    return f"{url_prefix}{submission_id}/file/?token={token}"


def verify_download_token(token, submission_id):
    """True iff `token` was minted for this exact submission_id and hasn't
    expired. False (never raises) for anything else — missing, expired,
    tampered, or minted for a different submission."""
    if not token:
        return False
    try:
        value = TimestampSigner(salt=_SIGNER_SALT).unsign(token, max_age=_TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return False
    return value == str(submission_id)
