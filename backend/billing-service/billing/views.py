from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import mixins, viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter

from accounts.permissions import (
    BILLING_ROLES,
    HasRole,
    IsBillingStaffOrOwnerGuardianReadOnly,
    guardian_enrollment_ids,
)

from .models import (
    FeeSchedule, FeeScheduleItem,
    StudentInvoice, StudentInvoiceItem, StudentInvoiceDiscount,
    StudentPayment, InvoiceInstallment, DiscountType,
)
from .serializers import (
    FeeScheduleSerializer, FeeScheduleItemSerializer,
    StudentInvoiceSerializer, StudentInvoiceItemSerializer, StudentInvoiceDiscountSerializer,
    StudentPaymentSerializer, InvoiceInstallmentSerializer, DiscountTypeSerializer,
    SYSTEM_DISCOUNT_CODES, enrollment_details_for, invoice_details_for,
)
from .services import (
    AlreadyInvoiced,
    generate_invoice_for_enrollment,
    recalculate_invoices_for_schedule,
    reissue_invoice,
    apply_payment,
    close_out_invoice_for_transfer,
    compute_discount_waterfall,
)
from shared import school_year as school_year_rules

PAYMENT_PLANS = {"monthly", "quarterly", "semi_annual", "annual"}


def _parse_date(value):
    """Parse a 'YYYY-MM-DD' string into a date; returns None if missing/invalid."""
    if not value:
        return None
    from datetime import date
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _strict_date_param(params, name):
    """A YYYY-MM-DD query parameter, or None when absent. A malformed one is a
    400 naming the parameter; handed straight to a date filter it raised a
    Django ValidationError and answered 500."""
    raw = params.get(name)
    if not raw:
        return None
    parsed = _parse_date(raw)
    if parsed is None:
        raise ValidationError({name: "Use a date in the form YYYY-MM-DD."})
    return parsed


def _pk_or_404(pk):
    from django.http import Http404
    try:
        return int(pk)
    except (TypeError, ValueError):
        raise Http404


# ── Fee schedules ────────────────────────────────────────────────────────────

class FeeScheduleViewSet(viewsets.ModelViewSet):
    """
    /api/fee-schedules/                       GET, POST
    /api/fee-schedules/{id}/                  GET, PATCH, DELETE
    /api/fee-schedules/{id}/recalculate/      POST  — recalc this schedule's unpaid invoices
    /api/fee-schedules/copy-year/             POST  — copy one year's schedules into another

    Each schedule belongs to one school year (?school_year= filters).
    """
    queryset = FeeSchedule.objects.prefetch_related("items").all().order_by("school_level", "grade_level")
    serializer_class = FeeScheduleSerializer
    permission_classes = [HasRole]
    required_roles = BILLING_ROLES
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("school_level", "grade_level", "is_active", "school_year")

    @action(detail=True, methods=["post"], url_path="recalculate")
    def recalculate(self, request, pk=None):
        result = recalculate_invoices_for_schedule(_pk_or_404(pk))
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="copy-year")
    def copy_year(self, request):
        """
        POST /api/fee-schedules/copy-year/  {from_school_year, to_school_year}

        Starts next year's price list from this year's: every schedule, with
        its items, that the target year doesn't have yet. Grades the target
        year already has are left alone and counted as skipped.
        """
        try:
            source = school_year_rules.normalize(request.data.get("from_school_year"))
            target = school_year_rules.normalize(request.data.get("to_school_year"))
        except school_year_rules.InvalidSchoolYear as exc:
            return Response({"detail": str(exc)}, status=400)
        if source == target:
            return Response({"detail": "Choose two different school years."}, status=400)

        created = skipped = 0
        with transaction.atomic():
            for schedule in FeeSchedule.objects.filter(school_year=source).prefetch_related("items"):
                if FeeSchedule.objects.filter(
                    school_level=schedule.school_level, grade_level=schedule.grade_level, school_year=target,
                ).exists():
                    skipped += 1
                    continue
                copy = FeeSchedule.objects.create(
                    school_level=schedule.school_level, grade_level=schedule.grade_level,
                    school_year=target, is_active=schedule.is_active, notes=schedule.notes,
                )
                FeeScheduleItem.objects.bulk_create([
                    FeeScheduleItem(
                        fee_schedule=copy, item_category=item.item_category,
                        item_name=item.item_name, amount=item.amount, sort_order=item.sort_order,
                    )
                    for item in schedule.items.all()
                ])
                created += 1
        return Response(
            {"created": created, "skipped_existing": skipped},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class FeeScheduleItemViewSet(viewsets.ModelViewSet):
    """
    /api/fee-schedule-items/                  GET, POST
    /api/fee-schedule-items/{id}/             GET, PATCH, DELETE

    On any write operation, automatically triggers recalculation of the
    parent schedule's invoices that have no payments yet; the outcome comes
    back as `recalculation` on create/update so the page can say how many
    invoices kept their original amounts.
    """
    queryset = FeeScheduleItem.objects.all()
    serializer_class = FeeScheduleItemSerializer
    permission_classes = [HasRole]
    required_roles = BILLING_ROLES
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("fee_schedule", "item_category")

    recalculation = None

    # Atomic with the recalculation: an item saved but its invoices left
    # un-rebuilt (the recalculation failing) is the one outcome that can't be
    # read back from either.
    @transaction.atomic
    def perform_create(self, serializer):
        item = serializer.save()
        self.recalculation = recalculate_invoices_for_schedule(item.fee_schedule_id)

    @transaction.atomic
    def perform_update(self, serializer):
        item = serializer.save()
        self.recalculation = recalculate_invoices_for_schedule(item.fee_schedule_id)

    @transaction.atomic
    def perform_destroy(self, instance):
        sid = instance.fee_schedule_id
        instance.delete()
        self.recalculation = recalculate_invoices_for_schedule(sid)

    def _with_recalculation(self, response):
        if isinstance(response.data, dict) and self.recalculation is not None:
            response.data["recalculation"] = self.recalculation
        return response

    def create(self, request, *args, **kwargs):
        return self._with_recalculation(super().create(request, *args, **kwargs))

    def update(self, request, *args, **kwargs):
        return self._with_recalculation(super().update(request, *args, **kwargs))


# ── Discount types ───────────────────────────────────────────────────────────

class DiscountTypeViewSet(viewsets.ModelViewSet):
    queryset = DiscountType.objects.all().order_by("discount_name")
    serializer_class = DiscountTypeSerializer
    permission_classes = [HasRole]
    required_roles = BILLING_ROLES
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("discount_mode",)

    def destroy(self, request, *args, **kwargs):
        # The plan and Early Bird rows are looked up by code when invoices are
        # built; deleting one silently turned that discount off for everyone.
        instance = self.get_object()
        if instance.discount_code in SYSTEM_DISCOUNT_CODES:
            return Response(
                {"detail": f"{instance.discount_name} is used by the invoice calculation. Set it to 0% instead of deleting it."},
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)


# ── Cross-service lookups ────────────────────────────────────────────────────
#
# Neither an invoice nor a payment carries a student name or a school year:
# both live in enrollment-service's tables, which billing reads read-only
# through the mirrors. Every caller that wants to filter on one of them has to
# resolve it to a set of enrollment_ids first, so those two resolutions live
# here once rather than being re-derived per view.

def enrollment_ids_for_school_year(school_year):
    """enrollment_ids belonging to one school year, or None for "all years"."""
    year = (school_year or "").strip()
    if not year:
        return None

    from .enrollment_mirror import EnrollmentMirror

    return (
        EnrollmentMirror.objects
        .filter(school_year=year)
        .values_list("enrollment_id", flat=True)
    )


def enrollment_ids_matching_student(term):
    """enrollment_ids whose student matches `term` by name or LRN.

    Returns None for a blank term so callers can tell "no filter asked for"
    apart from "filter asked for, nothing matched" — the latter must yield an
    empty result, not an unfiltered one.
    """
    term = (term or "").strip()
    if not term:
        return None

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
    return (
        EnrollmentMirror.objects
        .filter(student_id__in=matched_student_ids)
        .values_list("enrollment_id", flat=True)
    )


# ── Invoices ─────────────────────────────────────────────────────────────────

def scope_invoices_to_school_year(queryset, school_year):
    """
    Narrow an invoice queryset to one school year.

    An invoice has no school year of its own — only `enrollment_id`. The year
    lives on enrollments, which this service reads through EnrollmentMirror
    (managed=False). Both the list view and /summary/ must scope identically or
    the page's stat tiles would report different totals than the rows beneath
    them, so the join lives here once rather than in each caller.

    A blank or missing `school_year` returns the queryset untouched, which is
    what renders the "All years" view.
    """
    enrollment_ids = enrollment_ids_for_school_year(school_year)
    if enrollment_ids is None:
        return queryset
    return queryset.filter(enrollment_id__in=enrollment_ids)


def school_years_with_invoices():
    """
    The school years that actually have at least one invoice, newest first.

    Deliberately not scoped by the caller's active year filter: this feeds the
    page's year picker, so narrowing it to the selected year would collapse the
    picker to a single option and strand the user there.
    """
    from .enrollment_mirror import EnrollmentMirror

    enrollment_ids = StudentInvoice.objects.values_list("enrollment_id", flat=True)
    years = (
        EnrollmentMirror.objects
        .filter(enrollment_id__in=enrollment_ids)
        .values_list("school_year", flat=True)
        .distinct()
    )
    return sorted({y for y in years if y}, reverse=True)


def payment_counts_by_school_year():
    """
    How many payments fall in each school year, keyed by year.

    A payment is two hops from a year — payment -> invoice -> enrollment — and
    the middle hop is a cross-service id rather than a real FK, so this walks
    it explicitly rather than annotating over a join.
    """
    from .enrollment_mirror import EnrollmentMirror

    # invoice_id -> enrollment_id for every invoice that has been paid against.
    invoice_enrollments = dict(
        StudentInvoice.objects
        .filter(invoice_id__in=StudentPayment.objects.values_list("invoice_id", flat=True))
        .values_list("invoice_id", "enrollment_id")
    )
    year_by_enrollment = dict(
        EnrollmentMirror.objects
        .filter(enrollment_id__in=set(invoice_enrollments.values()))
        .values_list("enrollment_id", "school_year")
    )

    counts = {}
    for invoice_id in StudentPayment.objects.values_list("invoice_id", flat=True):
        enrollment_id = invoice_enrollments.get(invoice_id)
        year = year_by_enrollment.get(enrollment_id)
        if year:
            counts[year] = counts.get(year, 0) + 1
    return counts


class StudentInvoiceViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    /api/invoices/                            GET
    /api/invoices/{id}/                       GET
    /api/invoices/generate/                   POST — generate invoice for an enrollment
        body: { enrollment_id, payment_plan }
    /api/invoices/{id}/void/                  POST — void an invoice with no payments
    /api/invoices/{id}/reissue/               POST — void and rebuild, moving payments
    /api/invoices/{id}/breakdown/             GET — full discount waterfall breakdown

    Not a ModelViewSet, for the same reason payments aren't: the generic
    POST/PATCH/DELETE bypassed every rule an invoice lives by. PATCH could mark
    an invoice paid with nothing paid, or change its plan without touching its
    discounts or installments; DELETE took the invoice's payments with it.
    Every change now goes through an action that keeps those consistent.
    """
    queryset = (
        StudentInvoice.objects
        .prefetch_related("items", "discounts", "installments", "payments")
        .all()
        .order_by("-invoice_id")
    )
    serializer_class = StudentInvoiceSerializer
    permission_classes = [IsBillingStaffOrOwnerGuardianReadOnly]
    # The two billing steps that are part of a registrar's own work: invoicing
    # a learner they've just enrolled, and closing out one they've transferred
    # out. See accounts.permissions.BILLING_ROLES.
    registrar_actions = {"generate", "close_out_transfer"}
    owner_enrollment_id_field = "enrollment_id"
    filter_backends = (DjangoFilterBackend, OrderingFilter)
    filterset_fields = ("status", "payment_plan", "enrollment_id")
    ordering_fields = ("invoice_id", "invoice_date", "due_date")
    ordering = ("-invoice_id",)

    def get_queryset(self):
        qs = super().get_queryset()
        # Guardians only ever see invoices for their own child(ren)'s
        # enrollments; an unlinked guardian gets an empty list (fail closed).
        if getattr(self.request.user, "role", None) == "guardian":
            qs = qs.filter(enrollment_id__in=guardian_enrollment_ids(self.request.user))
        return qs

    def get_serializer(self, *args, **kwargs):
        # One lookup for the whole page's student details, not one per row.
        if kwargs.get("many") and args:
            instances = list(args[0])
            context = kwargs.setdefault("context", self.get_serializer_context())
            context["enrollment_details"] = enrollment_details_for(i.enrollment_id for i in instances)
            args = (instances, *args[1:])
        return super().get_serializer(*args, **kwargs)

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)

        # school_year can't go in `filterset_fields`: it isn't a column on
        # StudentInvoice. It lives on enrollments, which billing reads through
        # EnrollmentMirror — the same cross-service hop financial_summary makes.
        queryset = scope_invoices_to_school_year(
            queryset, self.request.query_params.get("school_year")
        )

        term = self.request.query_params.get("search", "").strip()
        if term:
            from django.db.models import Q

            queryset = queryset.filter(
                Q(invoice_no__icontains=term) |
                Q(enrollment_id__in=enrollment_ids_matching_student(term))
            )
        return queryset

    @action(detail=False, methods=["post"], url_path="generate")
    def generate(self, request):
        """
        POST /api/invoices/generate/
        body: { enrollment_id, payment_plan, effective_date? }

        effective_date is optional — pass it for a mid-year transfer-in
        student so the installment schedule is prorated to start from that
        date instead of the normal full school year (see
        generate_installment_schedule_prorated()).
        """
        enrollment_id = request.data.get("enrollment_id")
        payment_plan  = request.data.get("payment_plan", "monthly")
        if not enrollment_id:
            return Response({"detail": "enrollment_id required."}, status=400)
        if payment_plan not in PAYMENT_PLANS:
            return Response({"detail": "Invalid payment_plan."}, status=400)

        effective_date = None
        if request.data.get("effective_date"):
            effective_date = _parse_date(request.data.get("effective_date"))
            if effective_date is None:
                return Response({"detail": "effective_date must be a valid date (YYYY-MM-DD)."}, status=400)

        # Parsed before the try below: int() raises ValueError too, so a
        # non-numeric enrollment_id was caught by the same handler and echoed
        # Python's own "invalid literal for int() with base 10: 'abc'" back to
        # the user as if it were a billing error.
        try:
            enrollment_id = int(enrollment_id)
        except (TypeError, ValueError):
            return Response({"detail": "enrollment_id must be an integer."}, status=400)

        try:
            invoice = generate_invoice_for_enrollment(enrollment_id, payment_plan, effective_date=effective_date)
        except AlreadyInvoiced as e:
            return Response(
                {
                    "detail": str(e),
                    "code": "already_invoiced",
                    "invoice_id": e.invoice.invoice_id,
                    "invoice_no": e.invoice.invoice_no,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        ser = StudentInvoiceSerializer(invoice)
        return Response(ser.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="void")
    def void(self, request, pk=None):
        """
        POST /api/invoices/{id}/void/

        Only for an invoice nobody has paid against. Voiding one with payments
        stranded the money: the replacement asked for the whole year again,
        collections dropped by what had been paid, and the ledger counted both
        invoices. That case is a re-issue, which carries the payments across.
        """
        invoice = self.get_object()
        with transaction.atomic():
            invoice = StudentInvoice.objects.select_for_update().get(pk=invoice.pk)
            if invoice.status == "void":
                return Response({"detail": f"{invoice.invoice_no} is already void."}, status=400)
            paid = StudentPayment.objects.filter(invoice_id=invoice.pk).aggregate(t=Sum("amount_paid"))["t"]
            if paid:
                return Response(
                    {
                        "detail": (
                            f"{invoice.invoice_no} has \u20b1{paid:,.2f} in payments, so voiding it would lose "
                            "track of that money. Re-issue it instead: the payments move to the new invoice."
                        ),
                        "code": "invoice_has_payments",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            invoice.status = "void"
            invoice.save(update_fields=["status"])
        return Response(StudentInvoiceSerializer(invoice).data)

    @action(detail=True, methods=["post"], url_path="reissue")
    def reissue(self, request, pk=None):
        """
        POST /api/invoices/{id}/reissue/  {payment_plan, effective_date?}

        Voids the invoice and builds its replacement from the current fee
        schedule with the chosen plan, moving every payment across -- how a
        bill is corrected or a family changes payment plan.
        """
        invoice = self.get_object()
        payment_plan = request.data.get("payment_plan") or invoice.payment_plan
        if payment_plan not in PAYMENT_PLANS:
            return Response({"detail": "Invalid payment_plan."}, status=400)
        effective_date = None
        if request.data.get("effective_date"):
            effective_date = _parse_date(request.data.get("effective_date"))
            if effective_date is None:
                return Response({"detail": "effective_date must be a valid date (YYYY-MM-DD)."}, status=400)
        try:
            old, new = reissue_invoice(invoice.pk, payment_plan, effective_date=effective_date)
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        return Response(
            {"voided_invoice_no": old.invoice_no, "invoice": StudentInvoiceSerializer(new).data},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="close-out-transfer")
    def close_out_transfer(self, request, pk=None):
        """
        POST /api/invoices/{id}/close-out-transfer/
        body: { effective_date }

        Voids installments due after effective_date (or caps them to
        whatever was already pre-paid), leaving installments already due
        untouched. Called by the frontend right after a transfer-out action
        on the matching enrollment — see EnrollmentDetailPage's Transfer Out
        flow, which calls this after enrollment-service's /transfer-out/.
        """
        effective_date = _parse_date(request.data.get("effective_date"))
        if effective_date is None:
            return Response(
                {"detail": "effective_date is required and must be a valid date (YYYY-MM-DD)."},
                status=400,
            )
        # Same reason as generate() above — int() on the URL pk raises
        # ValueError, which the handler below would have echoed verbatim.
        try:
            invoice_id = int(pk)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid invoice id."}, status=400)

        try:
            invoice = close_out_invoice_for_transfer(invoice_id, effective_date)
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        ser = StudentInvoiceSerializer(invoice)
        return Response(ser.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """
        GET /api/invoices/summary/?school_year=2025-2026

        Returns real aggregate counts across ALL invoices (not just the current page).
        Accepts the same status/payment_plan/enrollment_id/school_year filter params
        as the list view — these counts drive the page's stat tiles, so they must be
        scoped exactly as the list is or the tiles would contradict the rows below.

        `school_years` lists every year that has invoices, for the year picker. It
        is intentionally not scoped by the active filter: narrowing it would leave
        the picker showing only the year already selected.
        """
        if getattr(request.user, "role", None) == "guardian":
            return Response({"detail": "You do not have access to this record."}, status=403)
        qs = StudentInvoice.objects.all()
        enrollment_id = request.query_params.get("enrollment_id")
        payment_plan  = request.query_params.get("payment_plan")
        if enrollment_id:
            try:
                qs = qs.filter(enrollment_id=int(enrollment_id))
            except (TypeError, ValueError):
                return Response({"enrollment_id": ["Must be a whole number."]}, status=400)
        if payment_plan:
            qs = qs.filter(payment_plan=payment_plan)
        qs = scope_invoices_to_school_year(qs, request.query_params.get("school_year"))

        from django.db.models import Count
        counts = qs.values("status").annotate(n=Count("invoice_id"))
        result = {"unpaid": 0, "partially_paid": 0, "paid": 0, "void": 0, "total": 0}
        for row in counts:
            s = row["status"]
            if s in result:
                result[s] = row["n"]
            result["total"] += row["n"]
        result["school_years"] = school_years_with_invoices()
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

        if getattr(request.user, "role", None) == "guardian":
            return Response({"detail": "You do not have access to this record."}, status=403)

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

        # Collections grouped by month, for the dashboard's trend chart. The
        # totals above are balances as of now and cannot show how the school
        # got there; StudentPayment.payment_date is the only real time axis in
        # billing, so the series is derived from the same invoice scope rather
        # than a separate query path that could drift out of agreement with it.
        from django.db.models.functions import TruncMonth
        from .services import shape_collections_series

        series_rows = (
            StudentPayment.objects
            .filter(invoice_id__in=invoice_ids)
            .annotate(month=TruncMonth("payment_date"))
            .values("month")
            .annotate(collected=Sum("amount_paid"))
            .order_by("month")
        )

        return Response({
            "school_year":        school_year or "all",
            "invoice_count":      count,
            "gross_billed":       f"{gross:.2f}",
            "total_discounts":    f"{discounts:.2f}",
            "net_billed":         f"{net:.2f}",
            "total_collected":    f"{collected:.2f}",
            "outstanding":        f"{outstanding:.2f}",
            "collections_series": shape_collections_series(series_rows),
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
        voucher_amount = sum(
            (Decimal(d.amount) for d in invoice.discounts.all()
             if d.description and d.description.startswith("Voucher")),
            Decimal("0"),
        )
        eb_amount = sum(
            (Decimal(d.amount) for d in invoice.discounts.all()
             if d.discount_type and d.discount_type.discount_code == "EARLY_BIRD"),
            Decimal("0"),
        )

        result = compute_discount_waterfall(
            raw_tuition=tuition,
            raw_misc=misc,
            raw_other=other,
            voucher_amount=voucher_amount,
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

        # Guardians may only pull the ledger for their own child(ren).
        if getattr(request.user, "role", None) == "guardian":
            from accounts.permissions import guardian_student_ids
            if student_id not in guardian_student_ids(request.user):
                return Response({"detail": "You do not have access to this record."}, status=403)

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
        invoices = list(invoices_qs)
        serializer = StudentInvoiceSerializer(
            invoices, many=True,
            context={"enrollment_details": enrollment_details_for(i.enrollment_id for i in invoices)},
        )
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

            year_map[sy]["invoices"].append(inv)
            # A void invoice stays listed as history but owes nothing. Counting
            # it doubled "billed" after every void and re-issue -- in the
            # parent portal too, which shows this ledger's balance.
            if inv.get("status") == "void":
                continue
            net    = Decimal(str(inv.get("net_amount",   0) or 0))
            paid   = Decimal(str(inv.get("total_paid",   0) or 0))
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

class StudentPaymentViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    /api/payments/                            GET, POST
    /api/payments/{id}/                       GET

    On POST: creates the payment row AND calls apply_payment() to distribute
    across installments and update invoice status.

    Deliberately NOT a ModelViewSet: payments are append-only.

    It used to be one, which exposed PUT/PATCH/DELETE that this docstring
    never claimed and nothing in the UI ever called. Those routes were a
    money-integrity hole rather than a feature: the overpayment guard and
    apply_payment() both live in perform_create(), so editing a payment's
    amount or deleting it changed the recorded total while leaving every
    installment allocation and the parent invoice's status exactly as the
    original amount had left them — an invoice could read "paid" on the
    strength of a payment that had since been reduced or removed.
    apply_payment() distributes an amount incrementally and cannot be run
    backwards, so honouring an edit would mean recomputing the whole
    allocation from scratch.

    A correction is therefore a new, explicit record — a reversing payment, or
    voiding the invoice and re-issuing — not an in-place edit. That also keeps
    the audit trail truthful about what was collected and when.

    Supported query params (GET list):
      payment_method        — cash | gcash | bank_transfer | card | check | others
      date_from             — YYYY-MM-DD  (payment_date >=)
      date_to               — YYYY-MM-DD  (payment_date <=)
      amount_min            — decimal     (amount_paid >=)
      amount_max            — decimal     (amount_paid <=)
      search                — student name / LRN / invoice no. substring
      student_name          — alias of `search`, kept for existing callers
      school_year           — YYYY-YYYY   (via invoice -> enrollment)
      ordering              — payment_date | amount_paid | -payment_date | -amount_paid
    """
    serializer_class = StudentPaymentSerializer
    permission_classes = [HasRole]
    required_roles = BILLING_ROLES
    # No SearchFilter: `search` is handled in _apply_filters() so the list and
    # /summary/ resolve it identically. Leaving it in the backends would ALSO
    # apply it as an icontains against invoice__enrollment_id — an integer
    # column — and the two filters AND together, so every name search returned
    # nothing.
    filter_backends = (DjangoFilterBackend, OrderingFilter)
    filterset_fields = ("invoice", "payment_method")
    ordering_fields = ("payment_date", "amount_paid", "payment_id")
    ordering = ("-payment_id",)

    def _apply_filters(self, qs, params):
        """Date/amount/student filtering shared by the list and the summary.

        Kept in one place so the per-method totals can never be scoped
        differently from the rows they sit above — the summary deliberately
        skips `payment_method`, since each tile reports its own method.
        """
        date_from  = _strict_date_param(params, "date_from")
        date_to    = _strict_date_param(params, "date_to")
        amount_min = params.get("amount_min")
        amount_max = params.get("amount_max")
        # `search` is the name the shared FilterBar sends; `student_name` is
        # kept as an alias so existing callers of this endpoint don't break.
        student    = (params.get("search") or params.get("student_name") or "").strip()
        school_year = params.get("school_year")

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
            # Previously this matched invoice_no as a stand-in for the student
            # name, so typing a name found nothing — the one thing the field
            # was for. The name lives in enrollment-service's tables, which
            # billing reads through the mirrors; resolving it to enrollment_ids
            # is the same hop the invoice list already makes.
            from django.db.models import Q

            qs = qs.filter(
                Q(invoice__invoice_no__icontains=student) |
                Q(invoice__enrollment_id__in=enrollment_ids_matching_student(student))
            )

        # A payment has no school year of its own, and neither does its
        # invoice — it is two hops away, on the enrollment.
        enrollment_ids = enrollment_ids_for_school_year(school_year)
        if enrollment_ids is not None:
            qs = qs.filter(invoice__enrollment_id__in=enrollment_ids)

        return qs

    def get_queryset(self):
        qs = StudentPayment.objects.all().order_by("-payment_id")
        return self._apply_filters(qs, self.request.query_params)

    def get_serializer(self, *args, **kwargs):
        # One lookup for the page's student names, not one per payment.
        if kwargs.get("many") and args:
            instances = list(args[0])
            context = kwargs.setdefault("context", self.get_serializer_context())
            context["invoice_details"] = invoice_details_for(p.invoice_id for p in instances)
            args = (instances, *args[1:])
        return super().get_serializer(*args, **kwargs)

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """
        GET /api/payments/summary/

        Per-method totals across ALL matching payments, not just the current
        page. Honours the same date/amount/student filters as the list, but
        ignores `payment_method` — the tiles show what each method collected,
        so selecting one must not zero out the others.
        """
        from django.db.models import Sum

        qs = self._apply_filters(StudentPayment.objects.all(), request.query_params)
        rows = qs.values("payment_method").annotate(total=Sum("amount_paid"))

        result = {m: 0 for m, _ in StudentPayment.PAYMENT_METHOD_CHOICES}
        grand = 0
        for row in rows:
            amount = float(row["total"] or 0)
            if row["payment_method"] in result:
                result[row["payment_method"]] = amount
            grand += amount

        result["total"] = grand

        # The year picker's list and its per-year counts, deliberately NOT
        # scoped by the active school_year — narrowing them would collapse the
        # picker to the one year already selected and strand the user there
        # (same reasoning as school_years_with_invoices for invoices).
        #
        # These count PAYMENTS per year. The frontend previously had to blank
        # the picker's counts out, because the only numbers available were the
        # enrollment counts from the global context — "2025-2026 · 68" beside a
        # payments filter reads as 68 payments, not 68 enrolments.
        result["year_counts"] = payment_counts_by_school_year()
        result["school_years"] = sorted(result["year_counts"], reverse=True)
        return Response(result)

    @transaction.atomic
    def perform_create(self, serializer):
        if not serializer.validated_data.get("payment_date"):
            serializer.validated_data["payment_date"] = timezone.localdate()

        # ── Guard: prevent overpayment ──
        # Locked here, before the balance read below, not just later inside
        # apply_payment() -- two concurrent payments against the same
        # invoice used to both read the same (soon-stale) balance, both
        # pass this check, and both get applied, overpaying the invoice.
        # Decimal throughout too: the balance below is already computed
        # correctly in Decimal by the serializer; converting it to float
        # for the comparison was pointless precision loss on money math.
        invoice_id = serializer.validated_data["invoice"].invoice_id
        invoice    = StudentInvoice.objects.select_for_update().get(invoice_id=invoice_id)

        # ── Guard: a voided invoice is not collectable ──
        # Voiding is a status flip on the parent and nothing else, so the
        # balance below -- computed from items minus discounts, which never
        # look at status -- still reads as money owed. The overpayment guard
        # therefore let the payment through, and apply_payment() finished by
        # setting the invoice to "paid"/"partially_paid", silently un-voiding
        # it. A correction against a voided invoice is a re-issue, not a
        # payment.
        from rest_framework.exceptions import ValidationError
        if invoice.status == "void":
            raise ValidationError({
                "invoice": (
                    f"Invoice {invoice.invoice_no} is void and cannot take payments. "
                    f"Re-issue it first if this student still owes."
                )
            })

        from .serializers import StudentInvoiceSerializer
        inv_data   = StudentInvoiceSerializer(invoice).data
        net_amount = Decimal(inv_data.get("net_amount", 0))
        total_paid = Decimal(inv_data.get("total_paid", 0))
        balance    = net_amount - total_paid
        amount     = Decimal(serializer.validated_data["amount_paid"])

        if amount > balance + Decimal("0.01"):
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

    Overdue installments are flagged by a separate scheduled command
    (`python manage.py flag_overdue_installments`), not as a side effect of
    reading this endpoint. It used to run inline in list()/retrieve(), which
    meant every GET -- including a guardian viewing their own child's
    installments -- triggered an unscoped write across every installment in
    the school. See that command's docstring for why, and for the
    scheduling this now depends on.
    """
    queryset = InvoiceInstallment.objects.all().order_by("invoice_id", "sequence")
    serializer_class = InvoiceInstallmentSerializer
    permission_classes = [IsBillingStaffOrOwnerGuardianReadOnly]
    owner_enrollment_id_field = "invoice__enrollment_id"
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("invoice", "status")

    def get_queryset(self):
        qs = super().get_queryset()
        # Guardians only ever see installments for their own child(ren)'s
        # invoices; an unlinked guardian gets an empty list (fail closed).
        if getattr(self.request.user, "role", None) == "guardian":
            qs = qs.filter(invoice__enrollment_id__in=guardian_enrollment_ids(self.request.user))
        return qs