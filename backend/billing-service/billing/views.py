from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from accounts.permissions import HasRole

BILLING_ROLES = {"super_admin", "admin", "accounting"}

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
    permission_classes = [HasRole]
    required_roles = BILLING_ROLES
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
    permission_classes = [HasRole]
    required_roles = BILLING_ROLES
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
    permission_classes = [HasRole]
    required_roles = BILLING_ROLES
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
    permission_classes = [HasRole]
    required_roles = BILLING_ROLES
    filter_backends = (DjangoFilterBackend, OrderingFilter)
    filterset_fields = ("status", "payment_plan", "enrollment_id")
    ordering_fields = ("invoice_id", "invoice_date", "due_date")
    ordering = ("-invoice_id",)

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        term = self.request.query_params.get("search", "").strip()
        if term:
            from django.db.models import Q
            from .enrollment_mirror import EnrollmentMirror, StudentMirror
            matched_student_ids = (
                StudentMirror.objects
                .filter(
                    Q(first_name__icontains=term) |
                    Q(last_name__icontains=term) |
                    Q(middle_name__icontains=term) |
                    Q(lrn__icontains=term)
                )
                .values_list("student_id", flat=True)
            )
            matched_enrollment_ids = (
                EnrollmentMirror.objects
                .filter(student_id__in=matched_student_ids)
                .values_list("enrollment_id", flat=True)
            )
            queryset = queryset.filter(
                Q(invoice_no__icontains=term) |
                Q(enrollment_id__in=matched_enrollment_ids)
            )
        return queryset

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

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """
        GET /api/invoices/summary/
        Returns real aggregate counts across ALL invoices (not just the current page).
        Accepts the same status/payment_plan/enrollment_id filter params as the list view.
        """
        qs = StudentInvoice.objects.all()
        enrollment_id = request.query_params.get("enrollment_id")
        payment_plan  = request.query_params.get("payment_plan")
        if enrollment_id:
            qs = qs.filter(enrollment_id=enrollment_id)
        if payment_plan:
            qs = qs.filter(payment_plan=payment_plan)

        from django.db.models import Count
        counts = qs.values("status").annotate(n=Count("invoice_id"))
        result = {"unpaid": 0, "partially_paid": 0, "paid": 0, "void": 0, "total": 0}
        for row in counts:
            s = row["status"]
            if s in result:
                result[s] = row["n"]
            result["total"] += row["n"]
        return Response(result)

    @action(detail=False, methods=["get"], url_path="financial-summary")
    def financial_summary(self, request):
        """
        GET /api/invoices/financial-summary/?school_year=2024-2025

        Returns aggregate monetary totals for non-void invoices in a school year:
          gross_billed   — sum of all invoice line items
          total_discounts — sum of all discount amounts applied
          net_billed     — gross minus discounts
          total_collected — sum of all payments received
          outstanding    — net_billed minus total_collected
          invoice_count  — number of non-void invoices
        """
        from django.db.models import Sum
        from .enrollment_mirror import EnrollmentMirror

        school_year = request.query_params.get("school_year")

        invoice_qs = StudentInvoice.objects.exclude(status="void")

        if school_year:
            enr_ids = (
                EnrollmentMirror.objects
                .filter(school_year=school_year)
                .values_list("enrollment_id", flat=True)
            )
            invoice_qs = invoice_qs.filter(enrollment_id__in=enr_ids)

        from django.db.models import Count
        invoice_ids = invoice_qs.values_list("invoice_id", flat=True)

        gross = (
            StudentInvoiceItem.objects
            .filter(invoice_id__in=invoice_ids)
            .aggregate(total=Sum("amount"))["total"] or Decimal("0")
        )
        discounts = (
            StudentInvoiceDiscount.objects
            .filter(invoice_id__in=invoice_ids)
            .aggregate(total=Sum("amount"))["total"] or Decimal("0")
        )
        collected = (
            StudentPayment.objects
            .filter(invoice_id__in=invoice_ids)
            .aggregate(total=Sum("amount_paid"))["total"] or Decimal("0")
        )

        net = gross - discounts
        outstanding = net - collected
        count = invoice_qs.aggregate(n=Count("invoice_id"))["n"] or 0

        return Response({
            "school_year":      school_year or "all",
            "invoice_count":    count,
            "gross_billed":     f"{gross:.2f}",
            "total_discounts":  f"{discounts:.2f}",
            "net_billed":       f"{net:.2f}",
            "total_collected":  f"{collected:.2f}",
            "outstanding":      f"{outstanding:.2f}",
        })

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


    @action(detail=False, methods=["get"], url_path="student-ledger")
    def student_ledger(self, request):
        """
        GET /api/invoices/student-ledger/?student_id=X

        Returns all invoices for a student across all school years, grouped by
        school year. Each invoice includes its items, payments, and totals.
        Also returns cross-year totals (total billed, total paid, total balance).
        """
        from django.db.models import Sum
        from .enrollment_mirror import EnrollmentMirror
        from .serializers import StudentInvoiceSerializer

        student_id = request.query_params.get("student_id")
        if not student_id:
            return Response({"detail": "student_id is required."}, status=400)

        try:
            student_id = int(student_id)
        except ValueError:
            return Response({"detail": "student_id must be an integer."}, status=400)

        # Fetch all enrollment IDs for this student via mirror
        enrollment_rows = (
            EnrollmentMirror.objects
            .filter(student_id=student_id)
            .values("enrollment_id", "school_year", "grade_level", "school_level", "enrollment_status")
            .order_by("-school_year", "-enrollment_id")
        )

        enrollment_map = {r["enrollment_id"]: r for r in enrollment_rows}
        enrollment_ids = list(enrollment_map.keys())

        if not enrollment_ids:
            return Response({
                "student_id":     student_id,
                "school_years":   [],
                "total_billed":   "0.00",
                "total_paid":     "0.00",
                "total_balance":  "0.00",
            })

        invoices_qs = (
            StudentInvoice.objects
            .filter(enrollment_id__in=enrollment_ids)
            .prefetch_related("items", "discounts", "payments", "installments")
            .order_by("-invoice_date", "-invoice_id")
        )

        # Serialize and annotate each invoice with computed totals
        serializer = StudentInvoiceSerializer(invoices_qs, many=True)
        invoices_data = serializer.data

        # Group by school year using the enrollment mirror
        year_map = {}
        for inv in invoices_data:
            eid = inv["enrollment_id"]
            enr = enrollment_map.get(eid, {})
            sy  = enr.get("school_year", "Unknown")

            if sy not in year_map:
                year_map[sy] = {
                    "school_year":       sy,
                    "grade_level":       enr.get("grade_level", ""),
                    "school_level":      enr.get("school_level", ""),
                    "enrollment_status": enr.get("enrollment_status", ""),
                    "enrollment_id":     eid,
                    "invoices":          [],
                    "year_billed":       Decimal("0"),
                    "year_paid":         Decimal("0"),
                }

            net    = Decimal(str(inv.get("net_amount",   0) or 0))
            paid   = Decimal(str(inv.get("total_paid",   0) or 0))
            year_map[sy]["invoices"].append(inv)
            year_map[sy]["year_billed"] += net
            year_map[sy]["year_paid"]   += paid

        # Convert Decimals to strings for JSON and compute balance
        school_years = []
        total_billed  = Decimal("0")
        total_paid    = Decimal("0")

        for sy in sorted(year_map.keys(), reverse=True):
            entry = year_map[sy]
            billed  = entry["year_billed"]
            paid    = entry["year_paid"]
            balance = billed - paid
            total_billed += billed
            total_paid   += paid
            school_years.append({
                "school_year":       entry["school_year"],
                "grade_level":       entry["grade_level"],
                "school_level":      entry["school_level"],
                "enrollment_status": entry["enrollment_status"],
                "enrollment_id":     entry["enrollment_id"],
                "invoices":          entry["invoices"],
                "year_billed":       f"{billed:.2f}",
                "year_paid":         f"{paid:.2f}",
                "year_balance":      f"{balance:.2f}",
            })

        return Response({
            "student_id":    student_id,
            "school_years":  school_years,
            "total_billed":  f"{total_billed:.2f}",
            "total_paid":    f"{total_paid:.2f}",
            "total_balance": f"{total_billed - total_paid:.2f}",
        })


# ── Payments ─────────────────────────────────────────────────────────────────

class StudentPaymentViewSet(viewsets.ModelViewSet):
    """
    /api/payments/                            GET, POST
    /api/payments/{id}/                       GET

    On POST: creates the payment row AND calls apply_payment() to distribute
    across installments and update invoice status.

    Supported query params (GET list):
      payment_method        — cash | gcash | bank_transfer | card | check | others
      date_from             — YYYY-MM-DD  (payment_date >=)
      date_to               — YYYY-MM-DD  (payment_date <=)
      amount_min            — decimal     (amount_paid >=)
      amount_max            — decimal     (amount_paid <=)
      search                — student name substring (via invoice_detail)
      ordering              — payment_date | amount_paid | -payment_date | -amount_paid
    """
    serializer_class = StudentPaymentSerializer
    permission_classes = [HasRole]
    required_roles = BILLING_ROLES
    filter_backends = (DjangoFilterBackend, SearchFilter, OrderingFilter)
    filterset_fields = ("invoice", "payment_method")
    search_fields = ("invoice__enrollment_id",)
    ordering_fields = ("payment_date", "amount_paid", "payment_id")
    ordering = ("-payment_id",)

    def get_queryset(self):
        qs = StudentPayment.objects.all().order_by("-payment_id")
        params = self.request.query_params

        date_from  = params.get("date_from")
        date_to    = params.get("date_to")
        amount_min = params.get("amount_min")
        amount_max = params.get("amount_max")
        student    = params.get("student_name", "").strip()

        if date_from:
            qs = qs.filter(payment_date__gte=date_from)
        if date_to:
            qs = qs.filter(payment_date__lte=date_to)
        if amount_min:
            try:
                qs = qs.filter(amount_paid__gte=Decimal(amount_min))
            except Exception:
                pass
        if amount_max:
            try:
                qs = qs.filter(amount_paid__lte=Decimal(amount_max))
            except Exception:
                pass
        if student:
            # student_name lives in a cross-service call (not a DB column), so we
            # match against invoice_no as a practical proxy until the name is
            # denormalized onto the invoice model.
            qs = qs.filter(invoice__invoice_no__icontains=student)

        return qs

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
    Overdue installments are auto-flagged on every read.
    """
    queryset = InvoiceInstallment.objects.all().order_by("invoice_id", "sequence")
    serializer_class = InvoiceInstallmentSerializer
    permission_classes = [HasRole]
    required_roles = BILLING_ROLES
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("invoice", "status")

    def _flag_overdue(self):
        today = timezone.now().date()
        InvoiceInstallment.objects.filter(
            due_date__lt=today,
            status__in=("pending", "partially_paid"),
        ).update(status="overdue")

    def list(self, request, *args, **kwargs):
        self._flag_overdue()
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        self._flag_overdue()
        return super().retrieve(request, *args, **kwargs)