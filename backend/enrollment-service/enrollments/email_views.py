import logging
import smtplib

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsAdminRegistrarOrReadOnly
from shared.resilience import is_transient_error, retry_with_backoff

from .models import EmailDeliveryFailure, Enrollment

logger = logging.getLogger(__name__)


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


def _guardian_contact(student_id):
    """(name, email) of the guardian to write to -- the primary contact first,
    else any guardian with an address -- or None."""
    from accounts.guardian_mirror import GuardianMirror

    for g in GuardianMirror.objects.filter(student_id=student_id).order_by(
        "-is_primary_contact", "guardian_id",
    ):
        email = (g.email_address or "").strip()
        if email:
            return g.full_name, email
    return None


def _render(student_name, school_level, grade_level, section, school_year, guardian_name=None):
    """Plain-text and HTML bodies. Every value is escaped before it goes into
    the HTML — the student's name is free text typed at intake.

    Addressed to the guardian when there is one to write to, else to the
    learner themselves."""
    rows = [
        ("School Level", school_level),
        ("Grade Level", grade_level),
        ("Section", section),
        ("School Year", school_year),
    ]
    greeting = guardian_name or student_name
    whose_text = f"the enrollment of {student_name}" if guardian_name else "your enrollment"
    whose_html = (
        f"the enrollment of <strong>{escape(student_name)}</strong>" if guardian_name
        else "your enrollment"
    )

    text = "\n".join([
        f"Dear {greeting},",
        "",
        f"We are pleased to inform you that {whose_text} at South Lakes "
        f"Integrated School has been successfully processed for the {school_year} "
        "school year.",
        "",
        *(f"{label}: {value or '—'}" for label, value in rows),
        "",
        "Please keep this email for your records. If you have any questions, "
        "feel free to contact our Registrar's office.",
        "",
        "South Lakes Integrated School · Registrar's Office",
    ])

    table_rows = "".join(
        f"""
                  <tr>
                    <td style="color:#7a5050;padding:6px 0;width:40%;">{label}</td>
                    <td style="color:#1a0a0a;font-weight:600;">{escape(value or "—")}</td>
                  </tr>"""
        for label, value in rows
    )

    html = f"""
            <div style="font-family:'DM Sans',sans-serif;max-width:560px;margin:0 auto;background:#fff8f6;border:1px solid #fde2de;border-radius:16px;padding:36px;">
              <div style="text-align:center;margin-bottom:28px;">
                <h1 style="font-family:Georgia,serif;color:#1a0a0a;font-size:26px;margin:0 0 6px;">
                  South Lakes Integrated School
                </h1>
                <p style="color:#7a5050;font-size:13px;margin:0;">Enrollment Confirmation</p>
              </div>

              <p style="color:#1a0a0a;font-size:15px;">Dear <strong>{escape(greeting)}</strong>,</p>

              <p style="color:#4a3a3a;font-size:14px;line-height:1.7;">
                We are pleased to inform you that {whose_html} at
                <strong>South Lakes Integrated School</strong> has been successfully
                processed for the <strong>{escape(school_year or "")}</strong> school year.
              </p>

              <div style="background:#ffffff;border:1px solid #fde2de;border-radius:12px;padding:20px 24px;margin:24px 0;">
                <table style="width:100%;font-size:13px;border-collapse:collapse;">{table_rows}
                </table>
              </div>

              <p style="color:#4a3a3a;font-size:14px;line-height:1.7;">
                Please keep this email for your records. If you have any questions,
                feel free to contact our Registrar's office.
              </p>

              <p style="color:#7a5050;font-size:13px;margin-top:32px;border-top:1px solid #fde2de;padding-top:20px;">
                South Lakes Integrated School · Registrar's Office
              </p>
            </div>
        """
    return text, html


@api_view(["POST"])
@permission_classes([IsAdminRegistrarOrReadOnly])
def send_enrollment_email(request):
    # Only enrollment_id is trusted from the client -- every other field is
    # derived server-side from the DB record. Previously this endpoint sent
    # whatever student_name/student_email/etc the client posted, verbatim,
    # to an address the client also chose -- any authenticated role could
    # trigger an official-looking email to an arbitrary address.
    enrollment_id = request.data.get("enrollment_id")
    if not enrollment_id:
        return Response({"detail": "enrollment_id is required."}, status=400)
    try:
        enrollment_id = int(enrollment_id)
    except (TypeError, ValueError):
        return Response({"detail": "enrollment_id must be a whole number."}, status=400)

    enrollment = (
        Enrollment.objects.select_related("student")
        .filter(pk=enrollment_id)
        .first()
    )
    if not enrollment:
        return Response({"detail": "Enrollment not found."}, status=404)

    # It says the enrollment "has been successfully processed", which is only
    # true once it is Enrolled -- a pending or cancelled row used to get it too.
    if enrollment.enrollment_status != "enrolled":
        return Response(
            {"detail": "Only an enrolled learner gets a confirmation.", "code": "not_enrolled"},
            status=409,
        )

    # To the family, not only the learner: most learners are children with no
    # address of their own (99 of 238 had one), so the confirmation mostly
    # went nowhere even when a guardian's email was on file.
    student = enrollment.student
    guardian = _guardian_contact(enrollment.student_id)
    recipients = []
    for address in ([guardian[1]] if guardian else []) + [(student.email or "").strip()]:
        if address and address.lower() not in (r.lower() for r in recipients):
            recipients.append(address)
    if not recipients:
        return Response(
            {"detail": "No email address on file for this learner or their guardian.",
             "code": "no_recipient"},
            status=400,
        )

    # Not a delivery failure: nothing was attempted, so nothing is logged for
    # follow-up. The school simply hasn't set up a mailbox (see .env.example).
    if not email_configured():
        return Response(
            {"detail": "Email is not configured on the server, so no confirmation was sent."},
            status=503,
        )

    student_name = " ".join(
        filter(None, [student.first_name, student.middle_name, student.last_name])
    ).strip() or "Student"
    school_year = enrollment.school_year
    subject = f"Enrollment Confirmation – {school_year}"
    text, html = _render(
        student_name,
        enrollment.get_school_level_display(),
        enrollment.grade_level,
        enrollment.section,
        school_year,
        guardian_name=guardian[0] if guardian else None,
    )

    message = EmailMultiAlternatives(
        subject=subject,
        body=text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=recipients,
    )
    message.attach_alternative(html, "text/html")

    try:
        retry_with_backoff(
            message.send,
            attempts=3,
            is_transient=is_transient_send_error,
            label="email",
        )
        return Response({"success": True, "sent_to": recipients})
    except Exception as e:
        logger.exception("Enrollment email to %s failed after retries", ", ".join(recipients))
        EmailDeliveryFailure.objects.create(
            to_email=recipients[0],
            subject=subject,
            context={"enrollment_id": enrollment_id, "recipients": recipients},
            error_message=str(e),
        )
        return Response(
            {"detail": "The confirmation email could not be sent. It has been logged for follow-up."},
            status=502,
        )
