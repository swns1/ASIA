"""
Outbound email for every service: the one place a message is built and sent.

Enrollment confirmations (enrollment-service) and payment receipts
(billing-service) both go through send_email(), so they share one retry
policy, one "is email set up?" rule and one development safety valve:

    EMAIL_REDIRECT_TO=you@example.com

While that is set, every message goes to that one inbox instead of its real
recipients, with the intended addresses named in the subject. The local
database holds hundreds of seeded guardian addresses at real mail domains,
so turning email on for testing without it would write to strangers.

Each service's tests assert that nothing outside this module constructs or
sends a message, so a new email can't bypass the redirect.
"""
import smtplib

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from shared.resilience import is_transient_error, retry_with_backoff


def is_transient_smtp_error(exc: Exception) -> bool:
    """
    True for SMTP failures worth another attempt: a dropped or refused
    connection, a timeout, or a 4xx reply (the server's own "try again
    later"). A 5xx reply — a rejected login (535) or a refused recipient —
    fails the same way on every attempt, so it is raised immediately.
    """
    if isinstance(exc, (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError)):
        return True
    if isinstance(exc, smtplib.SMTPResponseException):
        return 400 <= exc.smtp_code < 500
    if isinstance(exc, smtplib.SMTPException):
        return False
    # socket timeouts and connection resets surface as OSError subclasses.
    return isinstance(exc, (TimeoutError, ConnectionError))


def is_transient_send_error(exc: Exception) -> bool:
    """SMTP rules for the SMTP backend, shared.resilience's HTTP rules
    (timeouts, connection errors, 429/5xx) for the HTTPS backend."""
    return is_transient_smtp_error(exc) or is_transient_error(exc)


def email_configured() -> bool:
    """False when the chosen backend has no credentials, so nothing would
    be sent. Backends that don't deliver anywhere (console, locmem) count
    as configured."""
    backend = settings.EMAIL_BACKEND
    if backend.endswith("smtp.EmailBackend"):
        return bool(settings.EMAIL_HOST_USER)
    if backend.endswith("BrevoEmailBackend"):
        return bool(getattr(settings, "BREVO_API_KEY", ""))
    return True


def unique_addresses(*addresses) -> list:
    """The non-blank addresses in order, each once (case-insensitively)."""
    out = []
    for address in addresses:
        address = (address or "").strip()
        if address and address.lower() not in (a.lower() for a in out):
            out.append(address)
    return out


def guardian_contact(guardians):
    """(name, email) of the guardian to write to -- the primary contact first,
    else any guardian with an address -- or None.

    `guardians` is a queryset over the `guardians` table already narrowed to
    one learner; each service has its own mirror model of that table."""
    for g in guardians.order_by("-is_primary_contact", "guardian_id"):
        email = (g.email_address or "").strip()
        if email:
            return g.full_name, email
    return None


def send_email(*, subject: str, text: str, html: str, to: list) -> list:
    """
    Send a plain-text + HTML message, retrying temporary failures, and
    return the addresses it actually went to. Raises when it could not be
    sent, so the caller can log the failure for follow-up.

    Callers check email_configured() first: an unconfigured backend is "not
    set up", not a delivery failure.
    """
    redirect = (getattr(settings, "EMAIL_REDIRECT_TO", "") or "").strip()
    if redirect:
        subject = f"[TEST → {', '.join(to)}] {subject}"
        to = [redirect]

    message = EmailMultiAlternatives(
        subject=subject,
        body=text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=to,
    )
    message.attach_alternative(html, "text/html")
    retry_with_backoff(
        message.send,
        attempts=3,
        is_transient=is_transient_send_error,
        label="email",
    )
    return to
