"""
python manage.py flag_overdue_installments

Marks every InvoiceInstallment past its due_date (still "pending" or
"partially_paid") as "overdue".

This used to run as a side effect of InvoiceInstallmentViewSet.list()/
retrieve() -- i.e. every GET, including a guardian viewing their own child's
installments, triggered an unscoped UPDATE across every installment in the
school, contending with concurrent payment processing (StudentPaymentViewSet
locks the invoice row via select_for_update -- see billing/views.py). A read
endpoint should not have that side effect.

Whether an installment is overdue is purely a function of wall-clock time,
which is exactly what a scheduled job is for -- this command is meant to be
run periodically (daily is plenty; overdue status only needs to be roughly
current, not real-time) via cron / Windows Task Scheduler / whatever the
eventual deployment uses. There is currently no scheduler wired up anywhere
in this project (no Celery, no cron config) -- until one runs this on a
schedule, installments will stay "pending" past their due date rather than
flipping to "overdue" until this command is next run by hand. See the
README's deployment notes.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from billing.models import InvoiceInstallment


class Command(BaseCommand):
    help = "Marks InvoiceInstallments past their due_date as overdue."

    def handle(self, *args, **options):
        today = timezone.now().date()
        updated = InvoiceInstallment.objects.filter(
            due_date__lt=today,
            status__in=("pending", "partially_paid"),
        ).update(status="overdue")
        self.stdout.write(f"Flagged {updated} installment(s) as overdue.")
