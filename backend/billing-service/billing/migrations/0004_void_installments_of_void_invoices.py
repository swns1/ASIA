"""A void invoice's installments are voided with it.

Voiding an invoice and re-issuing one used to flip only the invoice's
status, leaving its installments pending (or paid, after the re-issue moved
the payments to the replacement), and the parent portal listed them as
Overdue. services.void_invoice() now voids them; this brings the rows
already written that way into line.

Data only: invoice_installments is managed=False (schema.sql owns it), and
the status column already allows "voided". Nothing to undo -- the old
statuses described no money owed or paid on a cancelled invoice.
"""
from django.db import migrations

FORWARD = """
UPDATE invoice_installments i
   SET status = 'voided'
  FROM student_invoices v
 WHERE v.invoice_id = i.invoice_id
   AND v.status = 'void'
   AND i.status <> 'voided';
"""


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0003_fee_schedule_school_year"),
    ]

    operations = [
        migrations.RunSQL(FORWARD, reverse_sql=migrations.RunSQL.noop),
    ]
