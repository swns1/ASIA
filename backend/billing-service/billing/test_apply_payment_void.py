"""
Regression tests for apply_payment()'s handling of voided installments, and
for the early-bird label in the discount breakdown (QA audit findings).

close_out_invoice_for_transfer() marks the periods a transferred-out family no
longer owes as "voided", but deliberately leaves `amount` intact so the
original schedule stays auditable. apply_payment() iterated every installment
with no status filter, so a later payment:

  1. was allocated into those voided rows -- taking money for months the
     student did not attend, and
  2. flipped them back to "paid"/"partially_paid", silently undoing the
     close-out,

and its invoice-status recomputation summed voided amounts too, re-inflating
what the family appeared to owe. close_out already excluded them when it
computed the same total, and its comment claimed parity with apply_payment
that did not exist.

StudentInvoice/InvoiceInstallment are managed=False in this service (they
mirror the pgAdmin schema), so there is no test table to write to -- the
invoice and its installment manager are faked here, same convention as
billing/test_services.py.
"""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from billing.services import apply_payment, compute_discount_waterfall

# Called through .__wrapped__ to bypass @transaction.atomic (ContextDecorator
# preserves it) instead of opening a real connection -- same technique as
# billing/test_payment_overpayment_guard.py.
_apply_payment = apply_payment.__wrapped__


class FakeInstallment(SimpleNamespace):
    def save(self, update_fields=None):  # the real rows are DB-backed
        self.saved = True


class FakeInstallmentQS:
    """Supports the small slice of the queryset API apply_payment uses:
    .exclude(status=...), .order_by(...), and iteration."""

    def __init__(self, rows):
        self._rows = rows

    def exclude(self, **kwargs):
        status = kwargs.get("status")
        return FakeInstallmentQS([r for r in self._rows if r.status != status])

    def order_by(self, *fields):
        return FakeInstallmentQS(
            sorted(self._rows, key=lambda r: (r.due_date, r.sequence))
        )

    def __iter__(self):
        return iter(self._rows)


def _invoice(rows):
    inv = SimpleNamespace(
        invoice_id=1,
        status="unpaid",
        installments=FakeInstallmentQS(rows),
        saved_fields=None,
    )
    inv.save = lambda update_fields=None: setattr(inv, "saved_fields", update_fields)
    return inv


def _rows():
    """Two live installments, then one voided by a transfer-out close-out.
    The voided row keeps its original amount, which is exactly what made it
    look collectable."""
    return [
        FakeInstallment(sequence=1, due_date=date(2026, 6, 30), amount=Decimal("1000"),
                        amount_paid=Decimal("0"), status="pending"),
        FakeInstallment(sequence=2, due_date=date(2026, 7, 31), amount=Decimal("1000"),
                        amount_paid=Decimal("0"), status="pending"),
        FakeInstallment(sequence=3, due_date=date(2026, 8, 31), amount=Decimal("1000"),
                        amount_paid=Decimal("0"), status="voided"),
    ]


def _run(rows, amount):
    inv = _invoice(rows)
    with patch("billing.services.StudentInvoice.objects.select_for_update") as sfu:
        sfu.return_value.filter.return_value.first.return_value = inv
        _apply_payment(1, amount)
    return inv


class TestApplyPaymentSkipsVoidedInstallments:
    def test_a_voided_installment_never_receives_money(self):
        rows = _rows()
        # More than the two live rows can absorb: the surplus must NOT spill
        # into the voided third one.
        _run(rows, Decimal("2500"))

        live_a, live_b, voided = rows
        assert live_a.amount_paid == Decimal("1000")
        assert live_b.amount_paid == Decimal("1000")
        assert voided.amount_paid == Decimal("0")

    def test_a_voided_installment_keeps_its_status(self):
        rows = _rows()
        _run(rows, Decimal("2500"))
        assert rows[2].status == "voided"

    def test_invoice_reads_paid_once_the_live_installments_are_covered(self):
        """The whole point of the close-out: the waived months are not owed,
        so covering what is left must settle the invoice. Counting the voided
        row kept it at 'partially_paid' forever."""
        rows = _rows()
        inv = _run(rows, Decimal("2000"))
        assert inv.status == "paid"

    def test_a_partial_payment_still_reads_partially_paid(self):
        rows = _rows()
        inv = _run(rows, Decimal("500"))
        assert inv.status == "partially_paid"
        assert rows[0].status == "partially_paid"

    def test_allocation_follows_due_date_order(self):
        """Documented behaviour, previously ordered by sequence alone."""
        rows = _rows()
        rows[0].due_date = date(2026, 9, 30)  # first by sequence, last by date
        _run(rows, Decimal("1000"))
        assert rows[1].amount_paid == Decimal("1000")
        assert rows[0].amount_paid == Decimal("0")


class TestEarlyBirdLabel:
    @patch("billing.services._get_discount_pct", return_value=Decimal("7"))
    def test_the_label_states_the_rate_actually_applied(self, _pct):
        """The rate comes from the EARLY_BIRD DiscountType row, so a hardcoded
        '5%' told families a different number from the one deducted the moment
        an admin edited it."""
        result = compute_discount_waterfall(
            raw_tuition=Decimal("10000"),
            raw_misc=Decimal("0"),
            raw_other=Decimal("0"),
            payment_plan="monthly",
            early_bird=True,
        )
        label = result["breakdown"]["steps"][-1]["deduction_label"]
        assert "7" in label
        assert "5%" not in label
        assert Decimal(result["early_bird_deduction"]) == Decimal("700.00")

    @patch("billing.services._get_discount_pct", return_value=Decimal("5"))
    def test_not_applied_is_still_spelled_out(self, _pct):
        result = compute_discount_waterfall(
            raw_tuition=Decimal("10000"),
            raw_misc=Decimal("0"),
            raw_other=Decimal("0"),
            payment_plan="monthly",
            early_bird=False,
        )
        assert result["breakdown"]["steps"][-1]["deduction_label"] == "Early Bird (not applied)"
        assert Decimal(result["early_bird_deduction"]) == Decimal("0")
