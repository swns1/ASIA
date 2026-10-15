"""
POST /api/send-payment-receipt/   {"payment_id": 45}

Emails the official receipt for one payment to the family. Fired by the
Record Payment modal right after a payment is saved, and by "Email receipt"
on the receipt page for a resend. Recording the payment never waits on it.

A top-level route like enrollment-service's /api/send-enrollment-email/,
not /api/payments/{id}/send-receipt/: the audit log names an action by the
first path segment, so under payments/ a send would be logged as
"Recorded payment".
"""
import logging

from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import BILLING_ROLES, HasRole
from shared.mail import email_configured, guardian_contact, send_email, unique_addresses

from .enrollment_mirror import EmailDeliveryFailureMirror, EnrollmentMirror, StudentMirror
from .guardian_mirror import GuardianMirror
from .models import StudentPayment
from .receipts import receipt_figures, render_receipt_email
from .serializers import enrollment_details_for
from .services import _get_school_settings

logger = logging.getLogger(__name__)


def _recipients(enrollment_id):
    """(guardian_name or None, [addresses]): the primary guardian's address
    first, then the learner's own, each once."""
    student_id = (
        EnrollmentMirror.objects.filter(pk=enrollment_id)
        .values_list("student_id", flat=True).first()
    )
    if student_id is None:
        return None, []
    guardian = guardian_contact(GuardianMirror.objects.filter(student_id=student_id))
    student_email = (
        StudentMirror.objects.filter(pk=student_id).values_list("email", flat=True).first()
    )
    return (
        guardian[0] if guardian else None,
        unique_addresses(guardian[1] if guardian else None, student_email),
    )


class SendPaymentReceiptView(APIView):
    permission_classes = [HasRole]
    required_roles = BILLING_ROLES

    def post(self, request):
        # Only payment_id is trusted from the client; the content and the
        # addresses are derived here.
        try:
            payment_id = int(request.data.get("payment_id"))
        except (TypeError, ValueError):
            return Response({"detail": "payment_id must be a whole number."}, status=400)

        payment = (
            StudentPayment.objects.select_related("invoice")
            .prefetch_related("invoice__items", "invoice__discounts", "invoice__payments")
            .filter(pk=payment_id)
            .first()
        )
        if not payment:
            return Response({"detail": "Payment not found."}, status=404)

        enrollment_id = payment.invoice.enrollment_id
        guardian_name, recipients = _recipients(enrollment_id)
        if not recipients:
            return Response(
                {"detail": "No email address on file for this learner or their guardian.",
                 "code": "no_recipient"},
                status=400,
            )

        # Not a delivery failure: nothing was attempted, so nothing is logged.
        if not email_configured():
            return Response(
                {"detail": "Email is not configured on the server, so no receipt was sent.",
                 "code": "email_not_configured"},
                status=503,
            )

        settings_row = _get_school_settings()
        subject, text, html = render_receipt_email(
            payment=payment,
            figures=receipt_figures(payment),
            detail=enrollment_details_for([enrollment_id]).get(enrollment_id),
            school_name=getattr(settings_row, "school_name", None) or "South Lakes Integrated School",
            school_address=getattr(settings_row, "school_address", None) or "",
            guardian_name=guardian_name,
        )

        try:
            sent_to = send_email(subject=subject, text=text, html=html, to=recipients)
        except Exception as e:
            logger.exception("Receipt email to %s failed after retries", ", ".join(recipients))
            EmailDeliveryFailureMirror.objects.create(
                to_email=recipients[0],
                subject=subject[:200],
                context={"payment_id": payment_id, "recipients": recipients},
                error_message=str(e),
            )
            return Response(
                {"detail": "The receipt email could not be sent. It has been logged for follow-up."},
                status=502,
            )

        # Earlier failures for this payment are settled by this send.
        EmailDeliveryFailureMirror.objects.filter(
            context__payment_id=payment_id, resolved_at__isnull=True,
        ).update(resolved_at=timezone.now())
        return Response({"success": True, "sent_to": sent_to})
