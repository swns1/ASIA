from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import (
    FeeSchedule, FeeScheduleItem,
    StudentInvoice, StudentInvoiceItem, StudentInvoiceDiscount,
    StudentPayment, InvoiceInstallment, DiscountType,
)
from .serializers import (
    FeeScheduleSerializer, FeeScheduleItemSerializer,
    StudentInvoiceSerializer, StudentInvoiceItemSerializer, StudentInvoiceDiscountSerializer,
    StudentPaymentSerializer, InvoiceInstallmentSerializer, DiscountTypeSerializer,
)
from .services import (
    generate_invoice_for_enrollment,
    recalculate_invoices_for_schedule,
    apply_payment,
    compute_discount_waterfall,
)


# ── Fee schedules ────────────────────────────────────────────────────────────

class FeeScheduleViewSet(viewsets.ModelViewSet):
    """
    /api/fee-schedules/                       GET, POST
    /api/fee-schedules/{id}/                  GET, PATCH, DELETE
    /api/fee-schedules/{id}/recalculate/      POST  — recalc all invoices for this level
    """
    queryset = FeeSchedule.objects.prefetch_related("items").all()
    serializer_class = FeeScheduleSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("school_level", "grade_level", "is_active")

    @action(detail=True, methods=["post"], url_path="recalculate")
    def recalculate(self, request, pk=None):
        result = recalculate_invoices_for_schedule(int(pk))
        return Response(result, status=status.HTTP_200_OK)


class FeeScheduleItemViewSet(viewsets.ModelViewSet):
    """
    /api/fee-schedule-items/                  GET, POST
    /api/fee-schedule-items/{id}/             GET, PATCH, DELETE

    On any write operation, automatically triggers recalculation of all
    affected invoices for the parent fee schedule.
    """
    queryset = FeeScheduleItem.objects.all()
    serializer_class = FeeScheduleItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("fee_schedule", "item_category")

    def perform_create(self, serializer):
        item = serializer.save()
        recalculate_invoices_for_schedule(item.fee_schedule_id)

    def perform_update(self, serializer):
        item = serializer.save()
        recalculate_invoices_for_schedule(item.fee_schedule_id)

    def perform_destroy(self, instance):
        sid = instance.fee_schedule_id
        instance.delete()
        recalculate_invoices_for_schedule(sid)


# ── Discount types ───────────────────────────────────────────────────────────

class DiscountTypeViewSet(viewsets.ModelViewSet):
    queryset = DiscountType.objects.all().order_by("discount_name")
    serializer_class = DiscountTypeSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("discount_mode",)


# ── Invoices ─────────────────────────────────────────────────────────────────

class StudentInvoiceViewSet(viewsets.ModelViewSet):
    """
    /api/invoices/                            GET, POST
    /api/invoices/{id}/                       GET, PATCH, DELETE
    /api/invoices/generate/                   POST — generate invoice for an enrollment
        body: { enrollment_id, payment_plan }
    /api/invoices/{id}/breakdown/             GET — full discount waterfall breakdown
    """
    queryset = (
        StudentInvoice.objects
        .prefetch_related("items", "discounts", "installments", "payments")
        .all()
        .order_by("-invoice_id")
    )
    serializer_class = StudentInvoiceSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("status", "payment_plan", "enrollment_id")

    @action(detail=False, methods=["post"], url_path="generate")
    def generate(self, request):
        enrollment_id = request.data.get("enrollment_id")
        payment_plan  = request.data.get("payment_plan", "monthly")
        if not enrollment_id:
            return Response({"detail": "enrollment_id required."}, status=400)
        if payment_plan not in {"monthly", "quarterly", "semi_annual", "annual"}:
            return Response({"detail": "Invalid payment_plan."}, status=400)
        try:
            invoice = generate_invoice_for_enrollment(int(enrollment_id), payment_plan)
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        ser = StudentInvoiceSerializer(invoice)
        return Response(ser.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="breakdown")
    def breakdown(self, request, pk=None):
        """Return the discount waterfall as a step-by-step breakdown for the UI."""
        invoice = self.get_object()

        items = list(invoice.items.all())
        tuition = sum((Decimal(i.amount) for i in items if "Tuition" in i.description), Decimal("0"))
        misc    = sum((Decimal(i.amount) for i in items if "Miscellaneous" in i.description), Decimal("0"))
        other   = sum((Decimal(i.amount) for i in items if "Other" in i.description), Decimal("0"))

        # Pull discount amounts back out of the rows
        sch_amount = sum(
            (Decimal(d.amount) for d in invoice.discounts.all()
             if d.description and "Scholarship" in d.description),
            Decimal("0"),
        )
        # Note: voucher amounts could be embedded in scholarships; future improvement
        eb_amount = sum(
            (Decimal(d.amount) for d in invoice.discounts.all()
             if d.discount_type and d.discount_type.discount_code == "EARLY_BIRD"),
            Decimal("0"),
        )

        result = compute_discount_waterfall(
            raw_tuition=tuition,
            raw_misc=misc,
            raw_other=other,
            voucher_amount=Decimal("0"),
            scholarship_discount_amount=sch_amount,
            payment_plan=invoice.payment_plan,
            early_bird=eb_amount > 0,
        )
        return Response(result)


# ── Payments ─────────────────────────────────────────────────────────────────

class StudentPaymentViewSet(viewsets.ModelViewSet):
    """
    /api/payments/                            GET, POST
    /api/payments/{id}/                       GET

    On POST: creates the payment row AND calls apply_payment() to distribute
    across installments and update invoice status.
    """
    queryset = StudentPayment.objects.all().order_by("-payment_id")
    serializer_class = StudentPaymentSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("invoice", "payment_method")

    @transaction.atomic
    def perform_create(self, serializer):
        if not serializer.validated_data.get("payment_date"):
            serializer.validated_data["payment_date"] = timezone.now().date()

        # ── Guard: prevent overpayment ──
        invoice_id = serializer.validated_data["invoice"].invoice_id
        invoice    = StudentInvoice.objects.get(invoice_id=invoice_id)
        from .serializers import StudentInvoiceSerializer
        inv_data   = StudentInvoiceSerializer(invoice).data
        net_amount = float(inv_data.get("net_amount", 0))
        total_paid = float(inv_data.get("total_paid", 0))
        balance    = net_amount - total_paid
        amount     = float(serializer.validated_data["amount_paid"])

        if amount > balance + 0.01:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({
                "amount_paid": f"Payment of ₱{amount:,.2f} exceeds remaining balance of ₱{balance:,.2f}."
            })

        payment = serializer.save()
        apply_payment(payment.invoice_id, payment.amount_paid)


# ── Installments ─────────────────────────────────────────────────────────────

class InvoiceInstallmentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/installments/                        GET
    /api/installments/{id}/                   GET

    Read-only — installments are generated automatically.
    """
    queryset = InvoiceInstallment.objects.all().order_by("invoice_id", "sequence")
    serializer_class = InvoiceInstallmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("invoice", "status")