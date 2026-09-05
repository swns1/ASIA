"""
Regression tests for StudentPaymentViewSet.perform_create's overpayment
guard. It used to read the invoice's balance with a plain .get() (no lock)
and compare it in float -- two separate bugs:

1. Lock ordering: two concurrent payments against the same invoice could
   both read the same (soon-stale) balance, both pass this check, and both
   get applied by apply_payment() -- overpaying the invoice. The row lock
   (select_for_update) now has to be acquired before the balance read, not
   only later inside apply_payment() (billing/services.py).
2. Decimal arithmetic: float(Decimal("30000.10")) - float(Decimal("30000.00"))
   is 0.09999999999854481, not 0.1 -- a real, demonstrated case (see the
   second test below) where the old float-based comparison incorrectly
   rejected a valid payment that exactly closed out an invoice's remaining
   balance.

perform_create is called via its .__wrapped__ attribute rather than
directly, to bypass its @transaction.atomic decorator (ContextDecorator
preserves __wrapped__) instead of exercising a real database connection.
StudentInvoice/AUTH_USER_MODEL are managed=False in this service (mirror
the pgAdmin schema) while django.contrib.admin's LogEntry is a real,
managed model with a hard FK onto AUTH_USER_MODEL -- the combination means
`create_test_db()` cannot build a fresh test database here at all, a known,
already-documented limitation (see enrollment-service/ai/test_risk_assessment.py's
module docstring for the same issue in a sibling service). All ORM calls
below are mocked regardless, same convention as billing/test_services.py.
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.exceptions import ValidationError

from billing.views import StudentPaymentViewSet

_perform_create = StudentPaymentViewSet.perform_create.__wrapped__


def _serializer_for(invoice_id, amount_paid):
    invoice = SimpleNamespace(invoice_id=invoice_id)
    serializer = MagicMock()
    serializer.validated_data = {
        "invoice": invoice,
        "amount_paid": amount_paid,
        "payment_date": "2026-01-15",
    }
    serializer.save.return_value = SimpleNamespace(invoice_id=invoice_id, amount_paid=amount_paid)
    return serializer


@patch("billing.views.apply_payment")
@patch("billing.serializers.StudentInvoiceSerializer")
@patch("billing.views.StudentInvoice.objects.select_for_update")
def test_overpayment_guard_locks_the_invoice_before_reading_balance(
    mock_select_for_update, mock_serializer_cls, mock_apply_payment
):
    mock_select_for_update.return_value.get.return_value = SimpleNamespace(invoice_id=1)
    mock_serializer_cls.return_value.data = {
        "net_amount": Decimal("1000.00"),
        "total_paid": Decimal("0.00"),
    }

    view = StudentPaymentViewSet()
    serializer = _serializer_for(1, Decimal("500.00"))

    _perform_create(view, serializer)

    mock_select_for_update.assert_called_once()
    mock_select_for_update.return_value.get.assert_called_once_with(invoice_id=1)
    mock_apply_payment.assert_called_once_with(1, Decimal("500.00"))


@patch("billing.views.apply_payment")
@patch("billing.serializers.StudentInvoiceSerializer")
@patch("billing.views.StudentInvoice.objects.select_for_update")
def test_a_payment_that_exactly_closes_the_balance_is_accepted(
    mock_select_for_update, mock_serializer_cls, mock_apply_payment
):
    mock_select_for_update.return_value.get.return_value = SimpleNamespace(invoice_id=1)
    mock_serializer_cls.return_value.data = {
        "net_amount": Decimal("30000.10"),
        "total_paid": Decimal("30000.00"),
    }

    view = StudentPaymentViewSet()
    serializer = _serializer_for(1, Decimal("0.11"))

    _perform_create(view, serializer)  # must not raise

    mock_apply_payment.assert_called_once_with(1, Decimal("0.11"))


@patch("billing.views.apply_payment")
@patch("billing.serializers.StudentInvoiceSerializer")
@patch("billing.views.StudentInvoice.objects.select_for_update")
def test_a_payment_that_exceeds_the_balance_is_still_rejected(
    mock_select_for_update, mock_serializer_cls, mock_apply_payment
):
    mock_select_for_update.return_value.get.return_value = SimpleNamespace(invoice_id=1)
    mock_serializer_cls.return_value.data = {
        "net_amount": Decimal("1000.00"),
        "total_paid": Decimal("900.00"),
    }

    view = StudentPaymentViewSet()
    serializer = _serializer_for(1, Decimal("150.00"))  # remaining balance is only 100.00

    with pytest.raises(ValidationError):
        _perform_create(view, serializer)

    mock_apply_payment.assert_not_called()
