"""
Regression tests for the billing QA pass (2026-09-25).

Each class is one finding; what used to happen is in its docstring. DB-free,
mocked at the model boundary like the rest of this service's tests -- the
behaviour against real data was checked separately on the local database.
"""
from contextlib import nullcontext
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.urls import Resolver404, resolve
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from billing import services
from billing.enrollment_mirror import ScholarshipTypeMirror
from billing.serializers import (
    DiscountTypeSerializer,
    FeeScheduleItemSerializer,
    StudentInvoiceSerializer,
    StudentPaymentSerializer,
)
from billing.views import StudentInvoiceViewSet, _strict_date_param
from school_settings.serializers import SchoolSettingSerializer
from school_settings.views import SchoolSettingViewSet


# The service functions are @transaction.atomic, bound at import; tests call
# them through .__wrapped__ (as test_apply_payment_void does) and patch the
# inner `with transaction.atomic()` blocks with this.
def _no_atomic(module="billing.services"):
    return patch(f"{module}.transaction.atomic", return_value=nullcontext())


# ── 1. Invoicing a scholar ───────────────────────────────────────────────────

def test_the_scholarship_mirror_carries_the_code_the_voucher_split_reads():
    """Missing, every invoice for a learner with a scholarship was a 500."""
    field = ScholarshipTypeMirror._meta.get_field("scholarship_code")
    assert field.column == "scholarship_code"


# ── 3. One invoice per student per school year ───────────────────────────────

ENROLLMENT = {
    "enrollment_id": 20, "student_id": 7, "school_level": "senior_highschool",
    "grade_level": "Grade 11", "school_year": "2026-2027", "enrollment_status": "enrolled",
}


class TestOneInvoicePerYear:
    """A senior high learner has an enrollment per semester, and each used to
    get a full-year invoice: the year billed twice."""

    def _generate(self, existing=None, enrollment=None):
        with _no_atomic(), \
                patch.object(services, "_fetch_enrollment", return_value=dict(enrollment or ENROLLMENT)), \
                patch.object(services, "_lock_student_year"), \
                patch.object(services, "live_invoice_for_student_year", return_value=existing) as lookup, \
                patch.object(services, "_build_invoice_for_enrollment", return_value="NEW") as build:
            return services.generate_invoice_for_enrollment.__wrapped__(20, "monthly"), lookup, build

    def test_a_second_semester_is_refused_when_the_year_is_already_invoiced(self):
        existing = SimpleNamespace(invoice_no="INV-2026-000330", invoice_id=330,
                                   get_payment_plan_display=lambda: "Monthly")
        with pytest.raises(services.AlreadyInvoiced) as exc:
            self._generate(existing=existing)
        assert "INV-2026-000330" in str(exc.value)
        assert "re-issue" in str(exc.value)

    def test_the_check_is_by_student_and_year_not_enrollment(self):
        _, lookup, build = self._generate()
        lookup.assert_called_once_with(7, "2026-2027")
        build.assert_called_once()

    @pytest.mark.parametrize("state", ["cancelled", "transferred_out"])
    def test_an_enrollment_nobody_attends_is_not_invoiced(self, state):
        with pytest.raises(ValueError, match="can't be invoiced"):
            self._generate(enrollment=dict(ENROLLMENT, enrollment_status=state))

    def test_already_invoiced_is_a_value_error_so_the_seed_skips_it(self):
        assert issubclass(services.AlreadyInvoiced, ValueError)


# ── 4. Closing out a transfer twice ──────────────────────────────────────────

def test_close_out_never_waives_an_already_voided_installment_again():
    invoice = MagicMock()
    invoice.installments.filter.return_value.exclude.return_value = []
    invoice.installments.exclude.return_value = []
    with _no_atomic(), patch.object(services.StudentInvoice, "objects") as objects, \
            patch.object(services.StudentInvoiceDiscount, "objects") as discounts:
        objects.select_for_update.return_value.filter.return_value.first.return_value = invoice
        services.close_out_invoice_for_transfer.__wrapped__(1, date(2026, 10, 31))
    invoice.installments.filter.return_value.exclude.assert_called_once_with(status="voided")
    discounts.create.assert_not_called()


# ── 2 & 8. Void and re-issue ─────────────────────────────────────────────────

class TestReissue:
    """Voiding stranded the payments on the void invoice; re-issue carries
    them to the replacement and is also how a family changes plan."""

    def _old(self, status="partially_paid"):
        old = MagicMock(invoice_id=5, invoice_no="INV-2026-000005", status=status,
                        enrollment_id=20, invoice_date=date(2026, 5, 1))
        old.installments.filter.return_value.exists.return_value = False
        old.discounts.filter.return_value.exists.return_value = False
        return old

    def _run(self, old, payments):
        new = MagicMock(pk=9, invoice_id=9, invoice_no="INV-2026-000009")
        with _no_atomic(), \
                patch.object(services.StudentInvoice, "objects") as invoices, \
                patch.object(services.StudentPayment, "objects") as payment_objects, \
                patch.object(services, "_fetch_enrollment", return_value=dict(ENROLLMENT)), \
                patch.object(services, "_lock_student_year"), \
                patch.object(services, "_build_invoice_for_enrollment", return_value=new) as build, \
                patch.object(services, "apply_payment") as apply:
            invoices.select_for_update.return_value.filter.return_value.first.return_value = old
            payment_objects.filter.return_value.order_by.return_value = payments
            result = services.reissue_invoice.__wrapped__(5, "annual")
        return result, build, apply, invoices

    def test_payments_move_to_the_new_invoice_and_are_applied_to_it(self):
        old = self._old()
        p1 = MagicMock(amount_paid=Decimal("30000"), notes=None)
        p2 = MagicMock(amount_paid=Decimal("6800"), notes="OR 1182")
        (voided, new), build, apply, invoices = self._run(old, [p1, p2])

        assert old.status == "void"
        assert p1.invoice is new and p2.invoice is new
        assert "Moved from INV-2026-000005" in p1.notes
        assert p2.notes.startswith("OR 1182 · Moved from")
        apply.assert_called_once_with(9, Decimal("36800"))

    def test_the_original_date_decides_early_bird_and_stays_on_the_new_invoice(self):
        old = self._old()
        _, build, _, invoices = self._run(old, [])
        assert build.call_args.kwargs["early_bird_on"] == date(2026, 5, 1)
        invoices.filter.return_value.update.assert_called_once_with(invoice_date=date(2026, 5, 1))

    def test_the_chosen_plan_is_used(self):
        _, build, _, _ = self._run(self._old(), [])
        assert build.call_args.args[1] == "annual"

    def test_a_void_invoice_cannot_be_reissued(self):
        with pytest.raises(ValueError, match="already void"):
            self._run(self._old(status="void"), [])

    def test_a_transfer_close_out_cannot_be_reissued(self):
        old = self._old()
        old.installments.filter.return_value.exists.return_value = True
        with pytest.raises(ValueError, match="closed out for a transfer"):
            self._run(old, [])


class TestInvoiceRoutes:
    """PATCH could mark an invoice paid with nothing paid or change its plan
    without its discounts; DELETE took its payments with it."""

    def test_no_generic_create_update_or_delete(self):
        for name in ("create", "update", "partial_update", "destroy"):
            assert not hasattr(StudentInvoiceViewSet, name), name

    @pytest.mark.parametrize("path,action", [
        ("/api/invoices/5/void/", "void"),
        ("/api/invoices/5/reissue/", "reissue"),
    ])
    def test_void_and_reissue_are_posts(self, path, action):
        assert resolve(path).func.actions == {"post": action}


# ── 5. Fee edits and paid invoices ───────────────────────────────────────────

def test_recalculation_leaves_invoices_with_payments_as_billed():
    """Adding one fee item turned fully paid invoices back into money owed."""
    schedule = SimpleNamespace(school_level="elementary", grade_level="Grade 4", school_year="2026-2027")
    paid_invoice = MagicMock(invoice_id=1)
    cursor = MagicMock()
    cursor.fetchall.return_value = [(20,)]
    with _no_atomic(), \
            patch.object(services.FeeSchedule, "objects") as schedules, \
            patch.object(services, "_read_fee_schedule", return_value={"items": [], "tuition_total": 0, "misc_total": 0, "other_total": 0}) as read, \
            patch.object(services, "_get_school_settings", return_value=None), \
            patch("django.db.connection") as connection, \
            patch.object(services.StudentInvoice, "objects") as invoices, \
            patch.object(services.StudentPayment, "objects") as payments:
        schedules.filter.return_value.first.return_value = schedule
        connection.cursor.return_value.__enter__.return_value = cursor
        invoices.filter.return_value.exclude.return_value = [paid_invoice]
        payments.filter.return_value.exists.return_value = True
        result = services.recalculate_invoices_for_schedule.__wrapped__(3)

    assert result["skipped_with_payments"] == 1 and result["updated"] == 0
    paid_invoice.items.all.return_value.delete.assert_not_called()
    read.assert_called_once_with("elementary", "Grade 4", "2026-2027")
    assert cursor.execute.call_args.args[1][2] == "2026-2027"


# ── 7. Next due date / overdue ───────────────────────────────────────────────

class TestNextDue:
    """invoice.due_date is the first installment and never moves, so every
    open invoice read as overdue from July on."""

    def _invoice(self, installments, status="partially_paid"):
        inv = MagicMock(status=status)
        inv.installments.all.return_value = installments
        return inv

    def _inst(self, days_from_today, amount="1000", paid="0", status="pending"):
        return SimpleNamespace(due_date=timezone.localdate() + timedelta(days=days_from_today),
                               amount=Decimal(amount), amount_paid=Decimal(paid), status=status)

    def test_paid_up_installments_are_neither_next_nor_overdue(self):
        inv = self._invoice([self._inst(-60, paid="1000", status="paid"), self._inst(30)])
        ser = StudentInvoiceSerializer()
        assert ser.get_next_due_date(inv) == timezone.localdate() + timedelta(days=30)
        assert ser.get_is_overdue(inv) is False

    def test_an_unpaid_installment_in_the_past_is_overdue(self):
        inv = self._invoice([self._inst(-5, paid="400", status="partially_paid"), self._inst(30)])
        assert StudentInvoiceSerializer().get_is_overdue(inv) is True

    def test_voided_installments_and_void_invoices_owe_nothing(self):
        ser = StudentInvoiceSerializer()
        assert ser.get_is_overdue(self._invoice([self._inst(-5, status="voided")])) is False
        assert ser.get_next_due_date(self._invoice([self._inst(-5)], status="void")) is None


# ── 10 & 12. Input that used to reach a CHECK constraint as a 500 ────────────

class TestInputChecks:
    def test_payment_must_be_more_than_zero(self):
        with pytest.raises(ValidationError):
            StudentPaymentSerializer().validate_amount_paid(Decimal("0"))
        with pytest.raises(ValidationError):
            StudentPaymentSerializer().validate_amount_paid(Decimal("-100"))

    def test_payment_cannot_be_dated_ahead(self):
        with pytest.raises(ValidationError):
            StudentPaymentSerializer().validate_payment_date(timezone.localdate() + timedelta(days=1))
        assert StudentPaymentSerializer().validate_payment_date(timezone.localdate())

    def test_fee_cannot_be_negative(self):
        with pytest.raises(ValidationError):
            FeeScheduleItemSerializer().validate_amount(Decimal("-500"))

    @pytest.mark.parametrize("attrs", [
        {"discount_code": "X", "discount_mode": "percentage", "discount_value": Decimal("150")},
        {"discount_code": "X", "discount_mode": "fixed_amount", "discount_value": Decimal("-1")},
        # Read as a percentage by the invoice math, so P1,000 became 1,000%.
        {"discount_code": "ANNUAL_PLAN", "discount_mode": "fixed_amount", "discount_value": Decimal("1000")},
    ])
    def test_bad_discounts_are_refused(self, attrs):
        with pytest.raises(ValidationError):
            DiscountTypeSerializer().validate(attrs)

    def test_a_system_discount_code_cannot_be_renamed(self):
        ser = DiscountTypeSerializer(instance=SimpleNamespace(
            discount_code="EARLY_BIRD", discount_mode="percentage", discount_value=Decimal("5")))
        with pytest.raises(ValidationError):
            ser.validate({"discount_code": "EB"})

    def test_a_malformed_date_filter_is_a_400(self):
        with pytest.raises(ValidationError):
            _strict_date_param({"date_from": "abc"}, "date_from")
        assert _strict_date_param({}, "date_from") is None


class TestSchoolSettings:
    def test_school_year_must_be_real(self):
        with pytest.raises(ValidationError):
            SchoolSettingSerializer().validate_current_school_year("banana")

    def test_the_year_must_end_after_it_starts(self):
        with pytest.raises(ValidationError):
            SchoolSettingSerializer().validate({"sy_start_date": date(2026, 6, 1), "sy_end_date": date(2020, 1, 1)})

    def test_the_settings_row_cannot_be_created_or_deleted(self):
        assert not hasattr(SchoolSettingViewSet, "destroy")
        assert not hasattr(SchoolSettingViewSet, "create")


def test_admin_is_not_mounted():
    with pytest.raises(Resolver404):
        resolve("/admin/")
