"""
Tests for send_enrollment_email() -- the enrollment confirmation, sent over
SMTP through django.core.mail.

Enrollment and EmailDeliveryFailure are mocked rather than hitting a real
database, same convention as the rest of this service's tests; mail goes to
Django's in-memory backend unless a test is about the SMTP transport itself.
"""
import smtplib
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

from django.core import mail
from django.test import override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from enrollments.email_views import is_transient_smtp_error, send_enrollment_email

factory = APIRequestFactory()

LOCMEM = "django.core.mail.backends.locmem.EmailBackend"
SMTP = "django.core.mail.backends.smtp.EmailBackend"


def _enrollment(email="parent@example.com", first_name="Juan"):
    student = SimpleNamespace(
        first_name=first_name, middle_name=None, last_name="Dela Cruz", email=email,
    )
    return SimpleNamespace(
        student=student,
        school_year="2026-2027",
        grade_level="Grade 7",
        section="Diamond",
        get_school_level_display=lambda: "Junior High School",
    )


@contextmanager
def _setup(enrollment):
    with patch("enrollments.email_views.Enrollment.objects") as objects, \
         patch("enrollments.email_views.EmailDeliveryFailure.objects") as failures, \
         patch("rest_framework.views.APIView.check_throttles"), \
         patch("shared.resilience.time.sleep"):
        objects.select_related.return_value.filter.return_value.first.return_value = enrollment
        yield failures


def _post(enrollment_id=5):
    request = factory.post(
        "/api/send-enrollment-email/", {"enrollment_id": enrollment_id}, format="json",
    )
    force_authenticate(request, user=SimpleNamespace(
        pk=1, user_id=1, role="registrar", is_authenticated=True,
    ))
    return send_enrollment_email(request)


@override_settings(EMAIL_BACKEND=LOCMEM, EMAIL_HOST_USER="school@example.com",
                   DEFAULT_FROM_EMAIL="SLIS <school@example.com>")
def test_sends_text_and_html_to_the_student():
    with _setup(_enrollment()):
        response = _post()

    assert response.status_code == 200
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.to == ["parent@example.com"]
    assert message.from_email == "SLIS <school@example.com>"
    assert message.subject == "Enrollment Confirmation – 2026-2027"
    assert "Grade 7" in message.body
    html, mimetype = message.alternatives[0]
    assert mimetype == "text/html"
    assert "Diamond" in html


@override_settings(EMAIL_BACKEND=LOCMEM, EMAIL_HOST_USER="school@example.com")
def test_student_name_is_escaped_in_the_html():
    with _setup(_enrollment(first_name='<script>alert("x")</script>')):
        _post()

    html, _ = mail.outbox[0].alternatives[0]
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


@override_settings(EMAIL_BACKEND=LOCMEM, EMAIL_HOST_USER="school@example.com")
def test_student_without_email_is_rejected():
    with _setup(_enrollment(email="")):
        response = _post()

    assert response.status_code == 400
    assert mail.outbox == []


@override_settings(EMAIL_BACKEND=SMTP, EMAIL_HOST_USER="")
def test_unconfigured_mailbox_answers_503_and_logs_nothing():
    with _setup(_enrollment()) as failures, \
         patch("enrollments.email_views.EmailMultiAlternatives.send") as send:
        response = _post()

    assert response.status_code == 503
    send.assert_not_called()
    failures.create.assert_not_called()


@override_settings(EMAIL_BACKEND=SMTP, EMAIL_HOST_USER="school@example.com")
def test_temporary_smtp_failure_is_retried_then_logged():
    busy = smtplib.SMTPResponseException(421, b"Service not available, try again later")
    with _setup(_enrollment()) as failures, \
         patch("enrollments.email_views.EmailMultiAlternatives.send", side_effect=busy) as send:
        response = _post()

    assert response.status_code == 502
    assert send.call_count == 3
    failures.create.assert_called_once()
    assert failures.create.call_args.kwargs["to_email"] == "parent@example.com"


@override_settings(EMAIL_BACKEND=SMTP, EMAIL_HOST_USER="school@example.com")
def test_rejected_login_is_not_retried():
    bad_login = smtplib.SMTPAuthenticationError(535, b"Username and Password not accepted")
    with _setup(_enrollment()) as failures, \
         patch("enrollments.email_views.EmailMultiAlternatives.send", side_effect=bad_login) as send:
        response = _post()

    assert response.status_code == 502
    assert send.call_count == 1
    failures.create.assert_called_once()


@override_settings(EMAIL_BACKEND=SMTP, EMAIL_HOST_USER="school@example.com")
def test_a_retry_that_succeeds_sends_once():
    with _setup(_enrollment()) as failures, \
         patch("enrollments.email_views.EmailMultiAlternatives.send",
               side_effect=[smtplib.SMTPServerDisconnected("dropped"), 1]) as send:
        response = _post()

    assert response.status_code == 200
    assert send.call_count == 2
    failures.create.assert_not_called()


def test_transient_classification():
    assert is_transient_smtp_error(TimeoutError())
    assert is_transient_smtp_error(ConnectionResetError())
    assert is_transient_smtp_error(smtplib.SMTPConnectError(421, b"busy"))
    assert is_transient_smtp_error(smtplib.SMTPResponseException(451, b"later"))
    assert not is_transient_smtp_error(smtplib.SMTPAuthenticationError(535, b"no"))
    assert not is_transient_smtp_error(smtplib.SMTPRecipientsRefused({}))
    assert not is_transient_smtp_error(ValueError())
