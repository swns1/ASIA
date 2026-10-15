"""
Tests for the official receipt: its figures (billing/receipts.py), the
`receipt` block on GET /api/payments/{id}/, and the emailed copy
(POST /api/send-payment-receipt/, billing/email_views.py).

ORM calls are mocked, same convention as the rest of this service's tests
(see test_payment_overpayment_guard.py for why there is no test database);
mail goes to Django's in-memory backend.
"""
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core import mail
from django.test import override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from billing.email_views import SendPaymentReceiptView
from billing.receipts import amount_in_words, receipt_figures, receipt_no
from billing.serializers import StudentPaymentSerializer

factory = APIRequestFactory()
LOCMEM = "django.core.mail.backends.locmem.EmailBackend"
SMTP = "django.core.mail.backends.smtp.EmailBackend"


class _Rel(list):
    def all(self):
        return self


def _payment(payment_id, day, amount):
    return SimpleNamespace(
        payment_id=payment_id, payment_date=date(2026, 7, day),
        amount_paid=Decimal(amount), payment_method="gcash",
        reference_number="GC-<123>", notes=None, invoice_id=9, created_at=None,
        get_payment_method_display=lambda: "GCash",
    )


def _invoice_with(payments, total="10000.00", discount="1000.00"):
    invoice = SimpleNamespace(
        invoice_id=9, invoice_no="INV-2026-0009", enrollment_id=31,
        items=_Rel([SimpleNamespace(amount=Decimal(total))]),
        discounts=_Rel([SimpleNamespace(amount=Decimal(discount))]),
        payments=_Rel(payments),
    )
    for p in payments:
        p.invoice = invoice
    return invoice


# -- Amount in words ---------------------------------------------------------

@pytest.mark.parametrize("amount, words", [
    ("1.00", "One Peso Only"),
    ("0.00", "Zero Pesos Only"),
    ("0.29", "Zero Pesos and 29/100 Only"),
    ("21.00", "Twenty-One Pesos Only"),
    ("1250.50", "One Thousand Two Hundred Fifty Pesos and 50/100 Only"),
    ("1000000.00", "One Million Pesos Only"),
    ("2005300.05", "Two Million Five Thousand Three Hundred Pesos and 05/100 Only"),
    # The browser version this replaced broke above 999,999,999.
    ("1000000001.00", "One Billion One Pesos Only"),
])
def test_amount_in_words(amount, words):
    assert amount_in_words(Decimal(amount)) == words


def test_receipt_number_is_zero_padded():
    assert receipt_no(45) == "PAY-000045"


# -- Figures -----------------------------------------------------------------

def test_figures_count_only_payments_applied_before_this_one():
    """A receipt reprinted or resent later must not count later payments as
    "previously paid". Order is date, then id -- not id alone: #12 was
    recorded after #13 but dated earlier."""
    first, later_id_earlier_date, this, after = (
        _payment(10, 1, "2000.00"), _payment(13, 2, "500.00"),
        _payment(12, 5, "1500.00"), _payment(14, 20, "3000.00"),
    )
    _invoice_with([after, this, first, later_id_earlier_date])

    figures = receipt_figures(this)

    assert figures == {
        "receipt_no": "PAY-000012",
        "net_amount": "9000.00",
        "previously_paid": "2500.00",
        "this_payment": "1500.00",
        "balance_after": "5000.00",
        "amount_in_words": "One Thousand Five Hundred Pesos Only",
    }


def test_same_day_payments_order_by_id():
    a, b = _payment(20, 3, "100.00"), _payment(21, 3, "200.00")
    _invoice_with([b, a])
    assert receipt_figures(b)["previously_paid"] == "100.00"
    assert receipt_figures(a)["previously_paid"] == "0.00"


def test_balance_never_goes_negative():
    p = _payment(30, 1, "9500.00")
    _invoice_with([p])
    assert receipt_figures(p)["balance_after"] == "0.00"


def test_receipt_block_is_on_the_detail_route_only():
    p = _payment(40, 1, "100.00")
    _invoice_with([p])
    assert "receipt" in StudentPaymentSerializer.Meta.fields
    assert StudentPaymentSerializer(context={}).get_receipt(p) is None
    detail = StudentPaymentSerializer(context={"with_receipt": True}).get_receipt(p)
    assert detail["receipt_no"] == "PAY-000040"


def test_the_viewset_asks_for_the_receipt_on_retrieve_only():
    from billing.views import StudentPaymentViewSet

    def context_for(action):
        view = StudentPaymentViewSet(action=action, format_kwarg=None)
        view.request = None
        return view.get_serializer_context()

    assert context_for("retrieve")["with_receipt"] is True
    assert context_for("list")["with_receipt"] is False


# -- Emailed receipt ---------------------------------------------------------

DETAIL = {
    "student_name": "Juan <b>Dela</b> Cruz", "student_number": "2026-0031",
    "lrn": "123456789012", "grade_level": "Grade 7", "section": "Diamond",
    "school_year": "2026-2027",
}


@contextmanager
def _setup(payment, guardian=("Maria Dela Cruz", "maria@example.com"),
           student_email="Juan@Example.com"):
    with patch("billing.email_views.StudentPayment.objects") as payments, \
         patch("billing.email_views.EnrollmentMirror.objects") as enrollments, \
         patch("billing.email_views.StudentMirror.objects") as students, \
         patch("billing.email_views.GuardianMirror.objects"), \
         patch("billing.email_views.guardian_contact", return_value=guardian), \
         patch("billing.email_views.enrollment_details_for", return_value={31: DETAIL}), \
         patch("billing.email_views._get_school_settings",
               return_value=SimpleNamespace(school_name="South Lakes Integrated School",
                                            school_address="Biñan, Laguna")), \
         patch("billing.email_views.EmailDeliveryFailureMirror.objects") as failures, \
         patch("rest_framework.views.APIView.check_throttles"), \
         patch("shared.resilience.time.sleep"):
        payments.select_related.return_value.prefetch_related.return_value \
            .filter.return_value.first.return_value = payment
        enrollments.filter.return_value.values_list.return_value.first.return_value = 77
        students.filter.return_value.values_list.return_value.first.return_value = student_email
        yield failures


def _post(payment_id=12, role="accounting"):
    request = factory.post("/api/send-payment-receipt/", {"payment_id": payment_id}, format="json")
    force_authenticate(request, user=SimpleNamespace(
        pk=1, user_id=1, role=role, is_authenticated=True,
    ))
    return SendPaymentReceiptView.as_view()(request)


def _a_payment():
    first, this = _payment(10, 1, "2000.00"), _payment(12, 5, "1500.00")
    _invoice_with([first, this])
    return this


@override_settings(EMAIL_BACKEND=LOCMEM, EMAIL_HOST_USER="school@example.com",
                   DEFAULT_FROM_EMAIL="SLIS <school@example.com>")
def test_sends_the_receipt_to_guardian_and_learner():
    with _setup(_a_payment()) as failures:
        response = _post()

    assert response.status_code == 200
    assert response.data["sent_to"] == ["maria@example.com", "Juan@Example.com"]
    message = mail.outbox[0]
    assert message.to == ["maria@example.com", "Juan@Example.com"]
    assert message.from_email == "SLIS <school@example.com>"
    assert message.subject.startswith("Official Receipt PAY-000012")
    assert message.body.startswith("Dear Maria Dela Cruz,")
    assert "₱ 1,500.00" in message.body
    assert "Previously Paid: − ₱ 2,000.00" in message.body
    assert "Remaining Balance: ₱ 5,500.00" in message.body
    assert "July 5, 2026" in message.body
    html, mimetype = message.alternatives[0]
    assert mimetype == "text/html"
    assert "One Thousand Five Hundred Pesos Only" in html
    failures.filter.assert_called_once_with(context__payment_id=12, resolved_at__isnull=True)


@override_settings(EMAIL_BACKEND=LOCMEM, EMAIL_HOST_USER="school@example.com")
def test_free_text_is_escaped_in_the_html():
    with _setup(_a_payment()):
        _post()
    html, _ = mail.outbox[0].alternatives[0]
    assert "<b>Dela</b>" not in html and "&lt;b&gt;Dela&lt;/b&gt;" in html
    assert "GC-<123>" not in html and "GC-&lt;123&gt;" in html


@override_settings(EMAIL_BACKEND=LOCMEM, EMAIL_HOST_USER="school@example.com")
def test_without_a_guardian_it_is_addressed_to_the_learner():
    with _setup(_a_payment(), guardian=None):
        response = _post()
    assert response.data["sent_to"] == ["Juan@Example.com"]
    assert mail.outbox[0].body.startswith("Dear Juan <b>Dela</b> Cruz,")


@override_settings(EMAIL_BACKEND=LOCMEM, EMAIL_HOST_USER="school@example.com")
def test_no_address_on_file_is_a_400():
    with _setup(_a_payment(), guardian=None, student_email=None):
        response = _post()
    assert response.status_code == 400
    assert response.data["code"] == "no_recipient"
    assert mail.outbox == []


@override_settings(EMAIL_BACKEND=LOCMEM, EMAIL_HOST_USER="school@example.com")
def test_unknown_payment_is_a_404_and_bad_id_a_400():
    with _setup(None):
        assert _post(999).status_code == 404
        assert _post("abc").status_code == 400


@override_settings(EMAIL_BACKEND=SMTP, EMAIL_HOST_USER="")
def test_email_switched_off_answers_503_and_logs_nothing():
    """Until the school adds a mailbox, every payment's automatic send ends
    here; the frontend stays quiet on this code."""
    with _setup(_a_payment()) as failures, \
         patch("shared.mail.EmailMultiAlternatives.send") as send:
        response = _post()
    assert response.status_code == 503
    assert response.data["code"] == "email_not_configured"
    send.assert_not_called()
    failures.create.assert_not_called()


@override_settings(EMAIL_BACKEND=SMTP, EMAIL_HOST_USER="school@example.com")
def test_a_failed_send_is_logged_against_the_payment():
    import smtplib
    with _setup(_a_payment()) as failures, \
         patch("shared.mail.EmailMultiAlternatives.send",
               side_effect=smtplib.SMTPAuthenticationError(535, b"no")) as send:
        response = _post()
    assert response.status_code == 502
    assert send.call_count == 1
    kwargs = failures.create.call_args.kwargs
    assert kwargs["to_email"] == "maria@example.com"
    assert kwargs["context"] == {"payment_id": 12,
                                 "recipients": ["maria@example.com", "Juan@Example.com"]}
    failures.filter.assert_not_called()


@override_settings(EMAIL_BACKEND=LOCMEM, EMAIL_HOST_USER="school@example.com",
                   EMAIL_REDIRECT_TO="tester@example.com")
def test_redirect_sends_the_receipt_to_the_test_inbox_only():
    with _setup(_a_payment()):
        response = _post()
    assert mail.outbox[0].to == ["tester@example.com"]
    assert "maria@example.com" in mail.outbox[0].subject
    assert response.data["sent_to"] == ["tester@example.com"]


@override_settings(EMAIL_BACKEND=LOCMEM, EMAIL_HOST_USER="school@example.com")
@pytest.mark.parametrize("role", ["registrar", "teacher", "guardian"])
def test_only_billing_staff_can_send(role):
    with _setup(_a_payment()):
        response = _post(role=role)
    assert response.status_code == 403
    assert mail.outbox == []
