"""
Applicant session tokens: the code gate at /api/apply/{invite_id}/verify/
trades a correct access code for a short-lived signed token
(X-Applicant-Token) that the draft/submit endpoints require.

Uses django.core.signing (TimestampSigner under the hood — the same
primitive shared/uploads.py uses for signed document-download links) with a
dedicated salt so a token minted here can never be replayed against that
endpoint or vice versa. SECRET_KEY is identical across all four services
(see .env.example), so the salt is the only thing that scopes a signed value
to *this* purpose.
"""
from django.conf import settings
from django.core import signing
from django.utils import timezone

from .models import ApplicationInvite, StudentApplication

SESSION_SALT = "applicant-form-session"
DEFAULT_TTL_SECONDS = 2 * 3600  # 2 hours, renewed on every autosave


class InvalidApplicantToken(Exception):
    """Covers every way a token can fail to authorize a request: missing,
    tampered, expired, or pointing at an invite/application that is no
    longer usable. Callers don't need to distinguish which — they all
    render the same "please ask a staff member" screen."""


def session_ttl_seconds():
    return int(getattr(settings, "APPLICANT_SESSION_TTL_SECONDS", DEFAULT_TTL_SECONDS))


def issue_session_token(invite, application):
    """Mints a token scoping the holder to exactly one invite + one draft
    application. Re-issued (not just re-validated) on every autosave by the
    view layer so an applicant who keeps working never hits the TTL."""
    return signing.dumps(
        {
            "v": 1,
            "invite_id": str(invite.pk),
            "application_id": application.pk,
        },
        salt=SESSION_SALT,
    )


def verify_session_token(raw, *, invite_id, require_draft=True):
    """Returns the StudentApplication the token authorizes, or raises
    InvalidApplicantToken. `invite_id` (from the URL) must match the token's
    own claim — a token minted for one invite must not authorize another.

    `require_draft` gates further editing once an application has moved
    past DRAFT — used by ApplyDraftView so a leaked/reused token can't keep
    re-editing an application after it's been submitted (or claimed for
    review). ApplySubmitView passes require_draft=False: a POST /submit/
    replay (double-tap, a retry on flaky mobile data) must still resolve to
    the SAME application so the view can return its existing result
    idempotently, rather than being rejected here before the view ever
    gets a chance to do that — see the plan's concurrency table."""
    if not raw:
        raise InvalidApplicantToken("missing")

    try:
        data = signing.loads(raw, salt=SESSION_SALT, max_age=session_ttl_seconds())
    except signing.BadSignature:  # also covers SignatureExpired, a subclass
        raise InvalidApplicantToken("bad_signature")

    if str(data.get("invite_id")) != str(invite_id):
        raise InvalidApplicantToken("invite_mismatch")

    try:
        application = StudentApplication.objects.select_related("invite").get(
            pk=data.get("application_id"), invite_id=data.get("invite_id"),
        )
    except (StudentApplication.DoesNotExist, ValueError, TypeError):
        raise InvalidApplicantToken("unknown_application")

    if require_draft and application.status != StudentApplication.DRAFT:
        raise InvalidApplicantToken("application_not_draft")

    invite = application.invite
    if invite.is_revoked or invite.is_expired:
        raise InvalidApplicantToken("invite_no_longer_usable")

    return application


def code_gate_alphabet():
    # Unambiguous when read aloud or handwritten: no 0/O, no 1/I/L.
    return "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_access_code(length=8):
    import secrets

    alphabet = code_gate_alphabet()
    return "".join(secrets.choice(alphabet) for _ in range(length))
