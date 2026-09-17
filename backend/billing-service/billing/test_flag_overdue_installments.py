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
from datetime import date, datetime, timezone as dt_timezone
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command

# 1:00 AM on 17 Sep in Manila, when the scheduled job runs (the LAN task's
# default and Railway's 17:00 UTC cron). In UTC it is still 16 Sep.
ONE_AM_MANILA = datetime(2026, 9, 16, 17, 0, tzinfo=dt_timezone.utc)


@patch("billing.management.commands.flag_overdue_installments.InvoiceInstallment.objects.filter")
def test_flags_only_pending_and_partially_paid_installments_past_due_date(mock_filter):
    mock_filter.return_value.exclude.return_value.update.return_value = 3
    out = StringIO()

    call_command("flag_overdue_installments", stdout=out)

    mock_filter.assert_called_once()
    _, kwargs = mock_filter.call_args
    assert kwargs["status__in"] == ("pending", "partially_paid")
    assert "due_date__lt" in kwargs
    mock_filter.return_value.exclude.return_value.update.assert_called_once_with(status="overdue")
    assert "Flagged 3 installment(s) as overdue." in out.getvalue()


@patch("billing.management.commands.flag_overdue_installments.InvoiceInstallment.objects.filter")
def test_installments_on_a_void_invoice_are_left_alone(mock_filter):
    """Voiding an invoice is a status flip on the parent and never touches its
    installments, which stay "pending". Without this exclusion those rows kept
    ageing into "overdue", so a cancelled invoice grew overdue installments
    that both the invoice detail tab and the guardian ledger showed as owed."""
    mock_filter.return_value.exclude.return_value.update.return_value = 0
    out = StringIO()

    call_command("flag_overdue_installments", stdout=out)

    mock_filter.return_value.exclude.assert_called_once_with(invoice__status="void")


@patch("billing.management.commands.flag_overdue_installments.InvoiceInstallment.objects.filter")
def test_reports_zero_when_nothing_is_overdue(mock_filter):
    mock_filter.return_value.exclude.return_value.update.return_value = 0
    out = StringIO()

    call_command("flag_overdue_installments", stdout=out)

    assert "Flagged 0 installment(s) as overdue." in out.getvalue()


@patch("django.utils.timezone.now", return_value=ONE_AM_MANILA)
@patch("billing.management.commands.flag_overdue_installments.InvoiceInstallment.objects.filter")
def test_cutoff_is_the_school_calendar_day_not_utc(mock_filter, _now):
    """An installment due on the 16th is overdue by the 1 AM run on the 17th.
    The cutoff used to be the UTC date (the 16th), so it waited another day."""
    mock_filter.return_value.exclude.return_value.update.return_value = 0

    call_command("flag_overdue_installments", stdout=StringIO())

    _, kwargs = mock_filter.call_args
    assert kwargs["due_date__lt"] == date(2026, 9, 17)
