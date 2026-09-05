"""
Tests for the flag_overdue_installments management command -- the
replacement for InvoiceInstallmentViewSet's old _flag_overdue(), which used
to run as a side effect of every GET to /api/installments/ (see the
command's own docstring for why that was wrong: unscoped, guardian-
triggered, contending with payment locks).

InvoiceInstallment is managed=False (mirrors the pgAdmin schema, see
billing/models.py), so there's no table in a fresh pytest-django test
database -- InvoiceInstallment.objects.filter(...).update(...) is mocked,
same convention as billing/test_services.py.
"""
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command


@patch("billing.management.commands.flag_overdue_installments.InvoiceInstallment.objects.filter")
def test_flags_only_pending_and_partially_paid_installments_past_due_date(mock_filter):
    mock_filter.return_value.update.return_value = 3
    out = StringIO()

    call_command("flag_overdue_installments", stdout=out)

    mock_filter.assert_called_once()
    _, kwargs = mock_filter.call_args
    assert kwargs["status__in"] == ("pending", "partially_paid")
    assert "due_date__lt" in kwargs
    mock_filter.return_value.update.assert_called_once_with(status="overdue")
    assert "Flagged 3 installment(s) as overdue." in out.getvalue()


@patch("billing.management.commands.flag_overdue_installments.InvoiceInstallment.objects.filter")
def test_reports_zero_when_nothing_is_overdue(mock_filter):
    mock_filter.return_value.update.return_value = 0
    out = StringIO()

    call_command("flag_overdue_installments", stdout=out)

    assert "Flagged 0 installment(s) as overdue." in out.getvalue()
