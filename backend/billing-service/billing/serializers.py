from decimal import Decimal
from rest_framework import serializers

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

    def _sum_category(self, obj, cat):
        return sum((Decimal(i.amount) for i in obj.items.all() if i.item_category == cat), Decimal("0"))

    def get_total_tuition(self, obj): return self._sum_category(obj, "tuition")
    def get_total_misc(self, obj):    return self._sum_category(obj, "misc")
    def get_total_other(self, obj):   return self._sum_category(obj, "other")
    def get_grand_total(self, obj):
        return sum((Decimal(i.amount) for i in obj.items.all()), Decimal("0"))


# ── Discount types ───────────────────────────────────────────────────────────

class DiscountTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscountType
        fields = (
            "discount_type_id",
            "discount_code",
            "discount_name",
            "discount_mode",
            "discount_value",
        )
        read_only_fields = ("discount_type_id",)


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


class StudentPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentPayment
        fields = (
            "payment_id",
            "invoice",
            "payment_date",
            "amount_paid",
            "payment_method",
            "reference_number",
            "notes",
            "created_at",
        )
        read_only_fields = ("payment_id", "created_at")


class StudentInvoiceSerializer(serializers.ModelSerializer):
    items         = StudentInvoiceItemSerializer(many=True, read_only=True)
    discounts     = StudentInvoiceDiscountSerializer(many=True, read_only=True)
    installments  = InvoiceInstallmentSerializer(many=True, read_only=True)
    payments      = StudentPaymentSerializer(many=True, read_only=True)
    enrollment_detail = serializers.SerializerMethodField(read_only=True)

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
        )
        read_only_fields = ("invoice_id", "invoice_no", "recalculated_at")

    def get_total_items(self, obj):     return sum((Decimal(i.amount) for i in obj.items.all()), Decimal("0"))
    def get_total_discounts(self, obj): return sum((Decimal(d.amount) for d in obj.discounts.all()), Decimal("0"))
    def get_net_amount(self, obj):
        return self.get_total_items(obj) - self.get_total_discounts(obj)
    def get_total_paid(self, obj):      return sum((Decimal(p.amount_paid) for p in obj.payments.all()), Decimal("0"))
    def get_balance(self, obj):
        return self.get_net_amount(obj) - self.get_total_paid(obj)

    def get_enrollment_detail(self, obj):
        from django.db import connection
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
            if not row:
                return None
            full_name = " ".join(p for p in [row[5], row[6], row[7]] if p)
            return {
                "enrollment_id": row[0],
                "school_year":   row[1],
                "grade_level":   row[2],
                "section":       row[3],
                "school_level":  row[4],
                "student_name":  full_name,
                "lrn":           row[8],
            }