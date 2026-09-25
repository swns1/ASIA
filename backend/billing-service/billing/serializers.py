from decimal import Decimal

from django.db import connection
from django.utils import timezone
from rest_framework import serializers

from shared import school_year as school_year_rules

from .models import (
    FeeSchedule, FeeScheduleItem,
    StudentInvoice, StudentInvoiceItem, StudentInvoiceDiscount,
    StudentPayment, InvoiceInstallment, DiscountType,
)


# ── Fee schedules ────────────────────────────────────────────────────────────

class FeeScheduleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeeScheduleItem
        fields = (
            "fee_schedule_item_id",
            "fee_schedule",
            "item_category",
            "item_name",
            "amount",
            "sort_order",
        )
        read_only_fields = ("fee_schedule_item_id",)

    def validate_amount(self, value):
        # The column's CHECK (amount >= 0) turned a negative fee into a 500.
        if value < 0:
            raise serializers.ValidationError("A fee can't be negative.")
        return value


class FeeScheduleSerializer(serializers.ModelSerializer):
    items         = FeeScheduleItemSerializer(many=True, read_only=True)
    total_tuition = serializers.SerializerMethodField()
    total_misc    = serializers.SerializerMethodField()
    total_other   = serializers.SerializerMethodField()
    grand_total   = serializers.SerializerMethodField()

    class Meta:
        model = FeeSchedule
        fields = (
            "fee_schedule_id",
            "school_level",
            "grade_level",
            "school_year",
            "is_active",
            "notes",
            "updated_at",
            "items",
            "total_tuition",
            "total_misc",
            "total_other",
            "grand_total",
        )
        read_only_fields = ("fee_schedule_id", "updated_at")

    def validate_school_year(self, value):
        try:
            return school_year_rules.normalize(value)
        except school_year_rules.InvalidSchoolYear as exc:
            raise serializers.ValidationError(str(exc))

    def _sum_category(self, obj, cat):
        return sum((Decimal(i.amount) for i in obj.items.all() if i.item_category == cat), Decimal("0"))

    def get_total_tuition(self, obj): return self._sum_category(obj, "tuition")
    def get_total_misc(self, obj):    return self._sum_category(obj, "misc")
    def get_total_other(self, obj):   return self._sum_category(obj, "other")
    def get_grand_total(self, obj):
        return sum((Decimal(i.amount) for i in obj.items.all()), Decimal("0"))


# ── Discount types ───────────────────────────────────────────────────────────

# The discount types the invoice math looks up by code. Their value is always
# read as a percentage (services._get_discount_pct), so a fixed peso amount on
# one of them was applied as that many percent: P1,000 on ANNUAL_PLAN produced
# an invoice of -P241,500.
SYSTEM_DISCOUNT_CODES = {
    "MONTHLY_PLAN", "QUARTERLY_PLAN", "SEMI_ANNUAL_PLAN", "ANNUAL_PLAN", "EARLY_BIRD",
}


class DiscountTypeSerializer(serializers.ModelSerializer):
    is_system = serializers.SerializerMethodField()

    class Meta:
        model = DiscountType
        fields = (
            "discount_type_id",
            "discount_code",
            "discount_name",
            "discount_mode",
            "discount_value",
            "is_system",
        )
        read_only_fields = ("discount_type_id",)

    def get_is_system(self, obj):
        return obj.discount_code in SYSTEM_DISCOUNT_CODES

    def validate(self, attrs):
        instance = self.instance
        code = attrs.get("discount_code", getattr(instance, "discount_code", None))
        mode = attrs.get("discount_mode", getattr(instance, "discount_mode", None))
        value = attrs.get("discount_value", getattr(instance, "discount_value", None))

        if instance and instance.discount_code in SYSTEM_DISCOUNT_CODES and code != instance.discount_code:
            raise serializers.ValidationError(
                {"discount_code": "This code is used by the invoice calculation and can't be renamed."}
            )
        if code in SYSTEM_DISCOUNT_CODES and mode != "percentage":
            raise serializers.ValidationError(
                {"discount_mode": "Payment-plan and Early Bird discounts are percentages."}
            )
        # Both used to reach the table's CHECK constraints and come back as 500s.
        if value is not None and value < 0:
            raise serializers.ValidationError({"discount_value": "A discount can't be negative."})
        if mode == "percentage" and value is not None and value > 100:
            raise serializers.ValidationError({"discount_value": "A percentage can't be more than 100."})
        return attrs


# ── Invoice ──────────────────────────────────────────────────────────────────

class StudentInvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentInvoiceItem
        fields = ("invoice_item_id", "invoice", "billing_item_id", "description", "amount")
        read_only_fields = ("invoice_item_id",)


class StudentInvoiceDiscountSerializer(serializers.ModelSerializer):
    discount_type_detail = DiscountTypeSerializer(source="discount_type", read_only=True)

    class Meta:
        model = StudentInvoiceDiscount
        fields = (
            "invoice_discount_id",
            "invoice",
            "discount_type",
            "discount_type_detail",
            "description",
            "amount",
        )
        read_only_fields = ("invoice_discount_id",)


class InvoiceInstallmentSerializer(serializers.ModelSerializer):
    balance = serializers.SerializerMethodField()

    class Meta:
        model = InvoiceInstallment
        fields = (
            "installment_id",
            "invoice",
            "sequence",
            "due_date",
            "amount",
            "amount_paid",
            "balance",
            "status",
        )
        read_only_fields = ("installment_id",)

    def get_balance(self, obj):
        return Decimal(obj.amount) - Decimal(obj.amount_paid)


def enrollment_details_for(enrollment_ids):
    """{enrollment_id: {...student and class...}} in one query.

    Serializing a page of invoices used to run this lookup once per invoice,
    and the payment lookup below once per payment nested inside them: 132
    queries for a page of 20 invoices."""
    ids = sorted({int(i) for i in enrollment_ids if i is not None})
    if not ids:
        return {}
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT e.enrollment_id, e.school_year, e.grade_level, e.section, e.school_level,
                   s.first_name, s.middle_name, s.last_name, s.lrn
              FROM enrollments e
              LEFT JOIN students s ON s.student_id = e.student_id
             WHERE e.enrollment_id = ANY(%s)
            """,
            [ids],
        )
        return {row[0]: _enrollment_detail(row) for row in cur.fetchall()}


def _enrollment_detail(row):
    return {
        "enrollment_id": row[0],
        "school_year":   row[1],
        "grade_level":   row[2],
        "section":       row[3],
        "school_level":  row[4],
        "student_name":  " ".join(p for p in [row[5], row[6], row[7]] if p),
        "lrn":           row[8],
    }


def invoice_details_for(invoice_ids):
    """{invoice_id: {student_name, invoice_no}} in one query."""
    ids = sorted({int(i) for i in invoice_ids if i is not None})
    if not ids:
        return {}
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT i.invoice_id, s.first_name, s.middle_name, s.last_name, i.invoice_no
              FROM student_invoices i
              JOIN enrollments e ON e.enrollment_id = i.enrollment_id
              LEFT JOIN students s ON s.student_id = e.student_id
             WHERE i.invoice_id = ANY(%s)
            """,
            [ids],
        )
        return {
            row[0]: {"student_name": " ".join(p for p in row[1:4] if p), "invoice_no": row[4]}
            for row in cur.fetchall()
        }


class StudentPaymentSerializer(serializers.ModelSerializer):
    invoice_detail = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = StudentPayment
        fields = (
            "payment_id",
            "invoice",
            "invoice_detail",
            "payment_date",
            "amount_paid",
            "payment_method",
            "reference_number",
            "notes",
            "created_at",
        )
        read_only_fields = ("payment_id", "created_at", "invoice_detail")

    def validate_amount_paid(self, value):
        # student_payments CHECK (amount_paid > 0) made these a 500.
        if value <= 0:
            raise serializers.ValidationError("A payment must be more than zero.")
        return value

    def validate_payment_date(self, value):
        # A payment dated ahead lands in a month that hasn't happened yet on
        # the collections chart and in any date-range report.
        if value and value > timezone.localdate():
            raise serializers.ValidationError("A payment can't be dated in the future.")
        return value

    def get_invoice_detail(self, obj):
        cache = self.context.get("invoice_details")
        if cache is not None:
            return cache.get(obj.invoice_id)
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT s.first_name, s.middle_name, s.last_name, i.invoice_no
                  FROM student_invoices i
                  JOIN enrollments e ON e.enrollment_id = i.enrollment_id
                  LEFT JOIN students s ON s.student_id = e.student_id
                 WHERE i.invoice_id = %s
                """,
                [obj.invoice_id],
            )
            row = cur.fetchone()
            if not row:
                return None
            full_name = " ".join(p for p in [row[0], row[1], row[2]] if p)
            return {"student_name": full_name, "invoice_no": row[3]}


class PaymentOnInvoiceSerializer(serializers.ModelSerializer):
    """A payment shown inside its invoice: no invoice_detail, which would only
    repeat the invoice around it at the cost of a query per payment."""

    class Meta:
        model = StudentPayment
        fields = (
            "payment_id", "invoice", "payment_date", "amount_paid",
            "payment_method", "reference_number", "notes", "created_at",
        )
        read_only_fields = fields


class StudentInvoiceSerializer(serializers.ModelSerializer):
    """Output only. Invoices are created by generate/re-issue and change
    through their actions (payments, void, close-out); the generic PATCH that
    let a client mark one paid with no payment is gone."""
    items         = StudentInvoiceItemSerializer(many=True, read_only=True)
    discounts     = StudentInvoiceDiscountSerializer(many=True, read_only=True)
    installments  = InvoiceInstallmentSerializer(many=True, read_only=True)
    payments      = PaymentOnInvoiceSerializer(many=True, read_only=True)
    enrollment_detail = serializers.SerializerMethodField(read_only=True)
    # `due_date` is the FIRST installment's date and never moves, so it read
    # as overdue from July on for every open invoice (115 of 124 locally were
    # not behind at all). These two come from the installments themselves.
    next_due_date = serializers.SerializerMethodField()
    is_overdue    = serializers.SerializerMethodField()

    total_items     = serializers.SerializerMethodField()
    total_discounts = serializers.SerializerMethodField()
    net_amount      = serializers.SerializerMethodField()
    total_paid      = serializers.SerializerMethodField()
    balance         = serializers.SerializerMethodField()

    class Meta:
        model = StudentInvoice
        fields = (
            "invoice_id",
            "enrollment_id",
            "enrollment_detail",
            "invoice_no",
            "invoice_date",
            "status",
            "payment_plan",
            "due_date",
            "recalculated_at",
            "items",
            "discounts",
            "installments",
            "payments",
            "total_items",
            "total_discounts",
            "net_amount",
            "total_paid",
            "balance",
            "next_due_date",
            "is_overdue",
        )
        read_only_fields = fields

    def _unpaid_live_installments(self, obj):
        if obj.status == "void":
            return []
        return [
            i for i in obj.installments.all()
            if i.status != "voided" and Decimal(i.amount_paid) < Decimal(i.amount)
        ]

    def get_next_due_date(self, obj):
        dates = [i.due_date for i in self._unpaid_live_installments(obj)]
        return min(dates) if dates else None

    def get_is_overdue(self, obj):
        today = timezone.localdate()
        return any(i.due_date < today for i in self._unpaid_live_installments(obj))

    def get_total_items(self, obj):     return sum((Decimal(i.amount) for i in obj.items.all()), Decimal("0"))
    def get_total_discounts(self, obj): return sum((Decimal(d.amount) for d in obj.discounts.all()), Decimal("0"))
    def get_net_amount(self, obj):
        return self.get_total_items(obj) - self.get_total_discounts(obj)
    def get_total_paid(self, obj):      return sum((Decimal(p.amount_paid) for p in obj.payments.all()), Decimal("0"))
    def get_balance(self, obj):
        return self.get_net_amount(obj) - self.get_total_paid(obj)

    def get_enrollment_detail(self, obj):
        cache = self.context.get("enrollment_details")
        if cache is not None:
            return cache.get(obj.enrollment_id)
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT e.enrollment_id, e.school_year, e.grade_level, e.section, e.school_level,
                       s.first_name, s.middle_name, s.last_name, s.lrn
                  FROM enrollments e
                  LEFT JOIN students s ON s.student_id = e.student_id
                 WHERE e.enrollment_id = %s
                """,
                [obj.enrollment_id],
            )
            row = cur.fetchone()
            return _enrollment_detail(row) if row else None