"""
Core billing business logic.

The discount waterfall on TUITION ONLY:
    raw_tuition
    - vouchers (counted as scholarships in the scholarships section)
    - scholarship discount
    - payment plan discount (semi 3%, annual 5%)
    - early bird (5% if first 7 days of S.Y.)

Misc and Other categories are NOT discounted.
"""

from datetime import date, timedelta
from decimal import Decimal
from calendar import monthrange

from django.db import transaction
from django.utils import timezone

from .models import (
    FeeSchedule, FeeScheduleItem,
    StudentInvoice, StudentInvoiceItem, StudentInvoiceDiscount,
    InvoiceInstallment, DiscountType,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _last_day_of_month(year: int, month: int) -> date:
    return date(year, month, monthrange(year, month)[1])


def _generate_invoice_number(invoice_id: int) -> str:
    """Format: INV-YYYY-000001"""
    yr = timezone.now().year
    return f"INV-{yr}-{invoice_id:06d}"


def _get_school_settings():
    """Lazy import — avoids circular deps and works even if school_settings empty."""
    from school_settings.models import SchoolSetting
    return SchoolSetting.objects.first()


def _get_discount_type(code: str):
    return DiscountType.objects.filter(discount_code=code).first()


# ── Discount waterfall ───────────────────────────────────────────────────────

def _apply_pct(base: Decimal, pct: Decimal) -> Decimal:
    return (base * pct / Decimal("100")).quantize(Decimal("0.01"))


def compute_discount_waterfall(
    raw_tuition: Decimal,
    raw_misc: Decimal,
    raw_other: Decimal,
    *,
    voucher_amount: Decimal = Decimal("0"),
    scholarship_discount_amount: Decimal = Decimal("0"),
    payment_plan: str = "monthly",
    early_bird: bool = False,
):
    """
    Apply discounts to TUITION ONLY in this order:
        tuition - voucher - scholarship - payment_plan_discount - early_bird

    Returns dict with each step shown so the UI can display the breakdown.
    Misc and Other are added to net at the end, untouched.
    """
    raw_tuition = Decimal(raw_tuition or 0)
    raw_misc    = Decimal(raw_misc or 0)
    raw_other   = Decimal(raw_other or 0)

    breakdown = {"steps": []}

    after_voucher = max(raw_tuition - Decimal(voucher_amount or 0), Decimal("0"))
    breakdown["steps"].append({
        "label":       "Tuition",
        "before":      str(raw_tuition),
        "deduction":   str(Decimal(voucher_amount or 0)),
        "deduction_label": "Voucher",
        "after":       str(after_voucher),
    })

    after_scholarship = max(after_voucher - Decimal(scholarship_discount_amount or 0), Decimal("0"))
    breakdown["steps"].append({
        "label":       "After voucher",
        "before":      str(after_voucher),
        "deduction":   str(Decimal(scholarship_discount_amount or 0)),
        "deduction_label": "Scholarship",
        "after":       str(after_scholarship),
    })

    plan_pct_map = {
        "monthly":     Decimal("0"),
        "quarterly":   Decimal("0"),
        "semi_annual": _get_discount_pct("SEMI_ANNUAL_PLAN"),
        "annual":      _get_discount_pct("ANNUAL_PLAN"),
    }
    plan_pct = plan_pct_map.get(payment_plan, Decimal("0"))
    plan_deduction = _apply_pct(after_scholarship, plan_pct)
    after_plan = max(after_scholarship - plan_deduction, Decimal("0"))
    breakdown["steps"].append({
        "label":       "After scholarship",
        "before":      str(after_scholarship),
        "deduction":   str(plan_deduction),
        "deduction_label": f"Payment plan ({plan_pct}%)",
        "after":       str(after_plan),
    })

    eb_deduction = Decimal("0")
    if early_bird:
        eb_pct = _get_discount_pct("EARLY_BIRD")
        eb_deduction = _apply_pct(after_plan, eb_pct)
    after_eb = max(after_plan - eb_deduction, Decimal("0"))
    breakdown["steps"].append({
        "label":       "After payment plan",
        "before":      str(after_plan),
        "deduction":   str(eb_deduction),
        "deduction_label": "Early Bird (5%)" if early_bird else "Early Bird (not applied)",
        "after":       str(after_eb),
    })

    net_tuition = after_eb
    grand_total = net_tuition + raw_misc + raw_other

    return {
        "raw_tuition":          str(raw_tuition),
        "raw_misc":             str(raw_misc),
        "raw_other":            str(raw_other),
        "voucher_amount":       str(Decimal(voucher_amount or 0)),
        "scholarship_amount":   str(Decimal(scholarship_discount_amount or 0)),
        "plan_deduction":       str(plan_deduction),
        "early_bird_deduction": str(eb_deduction),
        "net_tuition":          str(net_tuition),
        "grand_total":          str(grand_total),
        "breakdown":            breakdown,
    }


def _get_discount_pct(code: str) -> Decimal:
    dt = _get_discount_type(code)
    if not dt:
        return Decimal("0")
    return Decimal(dt.discount_value)


# ── Installment schedule ─────────────────────────────────────────────────────

def generate_installment_schedule(grand_total: Decimal, payment_plan: str, sy_start: date):
    """
    Returns list of {sequence, due_date, amount} dicts.
    All due dates fall on END OF MONTH. SY starts in June by convention.
    """
    grand_total = Decimal(grand_total)
    sy_year     = sy_start.year

    if payment_plan == "monthly":
        # 10 installments — June through March (last day of each month)
        months = [(6, sy_year), (7, sy_year), (8, sy_year), (9, sy_year), (10, sy_year),
                  (11, sy_year), (12, sy_year), (1, sy_year + 1), (2, sy_year + 1), (3, sy_year + 1)]
        per_inst = (grand_total / Decimal("10")).quantize(Decimal("0.01"))
        rounding_adjust = grand_total - (per_inst * 10)
        installments = []
        for i, (m, y) in enumerate(months, start=1):
            amt = per_inst + rounding_adjust if i == len(months) else per_inst
            installments.append({"sequence": i, "due_date": _last_day_of_month(y, m), "amount": amt})
        return installments

    if payment_plan == "quarterly":
        # 4 installments — last day of August, November, February, May
        slots = [(8, sy_year), (11, sy_year), (2, sy_year + 1), (5, sy_year + 1)]
        per_inst = (grand_total / Decimal("4")).quantize(Decimal("0.01"))
        rounding_adjust = grand_total - (per_inst * 4)
        installments = []
        for i, (m, y) in enumerate(slots, start=1):
            amt = per_inst + rounding_adjust if i == len(slots) else per_inst
            installments.append({"sequence": i, "due_date": _last_day_of_month(y, m), "amount": amt})
        return installments

    if payment_plan == "semi_annual":
        # 2 installments — last day of October, March
        slots = [(10, sy_year), (3, sy_year + 1)]
        per_inst = (grand_total / Decimal("2")).quantize(Decimal("0.01"))
        rounding_adjust = grand_total - (per_inst * 2)
        installments = []
        for i, (m, y) in enumerate(slots, start=1):
            amt = per_inst + rounding_adjust if i == len(slots) else per_inst
            installments.append({"sequence": i, "due_date": _last_day_of_month(y, m), "amount": amt})
        return installments

    if payment_plan == "annual":
        return [{"sequence": 1, "due_date": _last_day_of_month(sy_year, 10), "amount": grand_total}]

    raise ValueError(f"Unknown payment plan: {payment_plan}")


# ── Invoice generation ───────────────────────────────────────────────────────

def _read_fee_schedule(school_level: str, grade_level: str):
    """Returns dict {tuition_total, misc_items[], other_items[], items[]} or None."""
    schedule = FeeSchedule.objects.filter(
        school_level=school_level,
        grade_level=grade_level,
        is_active=True,
    ).first()
    if not schedule:
        return None

    items = list(schedule.items.all())
    tuition_total = sum((Decimal(i.amount) for i in items if i.item_category == "tuition"), Decimal("0"))
    misc_total    = sum((Decimal(i.amount) for i in items if i.item_category == "misc"),    Decimal("0"))
    other_total   = sum((Decimal(i.amount) for i in items if i.item_category == "other"),   Decimal("0"))

    return {
        "schedule": schedule,
        "items": items,
        "tuition_total": tuition_total,
        "misc_total": misc_total,
        "other_total": other_total,
    }


def _is_early_bird(invoice_date: date) -> bool:
    settings = _get_school_settings()
    if not settings:
        return False
    days = settings.early_bird_days or 7
    cutoff = settings.sy_start_date + timedelta(days=days - 1)
    return settings.sy_start_date <= invoice_date <= cutoff


def _fetch_enrollment(enrollment_id: int):
    """
    The enrollment lives in the enrollments table (shared DB). Read it raw
    via Django's connection since our service doesn't define an Enrollment model.
    """
    from django.db import connection
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT enrollment_id, student_id, school_level, grade_level,
                   school_year, enrollment_status, enrollment_date
              FROM enrollments
             WHERE enrollment_id = %s
            """,
            [enrollment_id],
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "enrollment_id":     row[0],
            "student_id":        row[1],
            "school_level":      row[2],
            "grade_level":       row[3],
            "school_year":       row[4],
            "enrollment_status": row[5],
            "enrollment_date":   row[6],
        }


def _fetch_enrollment_scholarships(enrollment_id: int):
    """Returns list of {discount_mode, discount_value, scholarship_name}."""
    from django.db import connection
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT st.discount_mode, st.discount_value, st.scholarship_name
              FROM enrollment_scholarships es
              JOIN scholarship_types st ON st.scholarship_type_id = es.scholarship_type_id
             WHERE es.enrollment_id = %s
            """,
            [enrollment_id],
        )
        return [
            {"discount_mode": r[0], "discount_value": r[1], "scholarship_name": r[2]}
            for r in cur.fetchall()
        ]


def _scholarship_discount_on_tuition(tuition: Decimal, scholarships: list) -> Decimal:
    """Apply each scholarship as a deduction on the tuition base.
       (Vouchers are a special-case scholarship_code — kept simple for now.)"""
    deduction = Decimal("0")
    for s in scholarships:
        mode  = s["discount_mode"]
        value = Decimal(s["discount_value"])
        if mode == "percentage":
            deduction += _apply_pct(tuition, value)
        else:  # fixed_amount
            deduction += value
    # Cap at tuition amount
    return min(deduction, tuition)


@transaction.atomic
def generate_invoice_for_enrollment(enrollment_id: int, payment_plan: str = "monthly"):
    """
    Auto-generate an invoice for an enrollment. Idempotent — if an invoice
    already exists for this enrollment, returns the existing one.

    Returns the StudentInvoice instance.
    """
    # Idempotency check
    existing = StudentInvoice.objects.filter(enrollment_id=enrollment_id).exclude(status="void").first()
    if existing:
        return existing

    # 1) Fetch enrollment + fee schedule + scholarships
    enrollment = _fetch_enrollment(enrollment_id)
    if not enrollment:
        raise ValueError(f"Enrollment #{enrollment_id} not found.")

    fee_data = _read_fee_schedule(enrollment["school_level"], enrollment["grade_level"])
    if not fee_data:
        raise ValueError(
            f"No active fee schedule for {enrollment['school_level']} / {enrollment['grade_level']}."
        )

    scholarships = _fetch_enrollment_scholarships(enrollment_id)
    sch_deduction = _scholarship_discount_on_tuition(fee_data["tuition_total"], scholarships)

    # 2) Determine early bird eligibility
    today = timezone.now().date()
    eb = _is_early_bird(today)

    # 3) Run discount waterfall
    waterfall = compute_discount_waterfall(
        raw_tuition=fee_data["tuition_total"],
        raw_misc=fee_data["misc_total"],
        raw_other=fee_data["other_total"],
        voucher_amount=Decimal("0"),
        scholarship_discount_amount=sch_deduction,
        payment_plan=payment_plan,
        early_bird=eb,
    )

    # 4) Create invoice
    # Use uuid for placeholder to avoid unique constraint collisions
    import uuid
    placeholder = f"TEMP-{uuid.uuid4().hex[:12]}"
    invoice = StudentInvoice.objects.create(
        enrollment_id=enrollment_id,
        invoice_no=placeholder,
        status="unpaid",
        payment_plan=payment_plan,
    )
    invoice.invoice_no = _generate_invoice_number(invoice.invoice_id)
    invoice.save(update_fields=["invoice_no"])

    # 5) Create line items (one row per fee_schedule_item)
    for fsi in fee_data["items"]:
        StudentInvoiceItem.objects.create(
            invoice=invoice,
            description=f"[{fsi.get_item_category_display()}] {fsi.item_name}",
            amount=fsi.amount,
        )

    # 6) Create discount rows
    if sch_deduction > 0:
        StudentInvoiceDiscount.objects.create(
            invoice=invoice,
            description=f"Scholarship discount ({len(scholarships)} item{'s' if len(scholarships) != 1 else ''})",
            amount=sch_deduction,
        )

    plan_deduction = Decimal(waterfall["plan_deduction"])
    if plan_deduction > 0:
        plan_dt = _get_discount_type({
            "monthly":     "MONTHLY_PLAN",
            "quarterly":   "QUARTERLY_PLAN",
            "semi_annual": "SEMI_ANNUAL_PLAN",
            "annual":      "ANNUAL_PLAN",
        }[payment_plan])
        StudentInvoiceDiscount.objects.create(
            invoice=invoice,
            discount_type=plan_dt,
            description=plan_dt.discount_name if plan_dt else "Payment plan discount",
            amount=plan_deduction,
        )

    eb_deduction = Decimal(waterfall["early_bird_deduction"])
    if eb_deduction > 0:
        eb_dt = _get_discount_type("EARLY_BIRD")
        StudentInvoiceDiscount.objects.create(
            invoice=invoice,
            discount_type=eb_dt,
            description="Early Bird (first 7 days of S.Y.)",
            amount=eb_deduction,
        )

    # 7) Generate installments
    settings = _get_school_settings()
    sy_start = settings.sy_start_date if settings else date(today.year if today.month >= 6 else today.year - 1, 6, 1)
    schedule = generate_installment_schedule(Decimal(waterfall["grand_total"]), payment_plan, sy_start)
    for inst in schedule:
        InvoiceInstallment.objects.create(
            invoice=invoice,
            sequence=inst["sequence"],
            due_date=inst["due_date"],
            amount=inst["amount"],
            amount_paid=Decimal("0"),
            status="pending",
        )

    invoice.due_date = schedule[0]["due_date"] if schedule else None
    invoice.save(update_fields=["due_date"])

    return invoice


# ── Recalculation when fee schedule changes ──────────────────────────────────

@transaction.atomic
def recalculate_invoices_for_schedule(fee_schedule_id: int):
    """
    Called when a fee_schedule's items are edited.
    Finds all non-void invoices for enrollments at this (school_level, grade_level)
    and rebuilds their line items + discounts + installments.

    Already-paid amounts are preserved — installment.amount_paid stays as-is.
    """
    schedule = FeeSchedule.objects.filter(fee_schedule_id=fee_schedule_id).first()
    if not schedule:
        return {"updated": 0}

    fee_data = _read_fee_schedule(schedule.school_level, schedule.grade_level)
    if not fee_data:
        return {"updated": 0}

    # Find enrollments at this level/grade
    from django.db import connection
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT enrollment_id
              FROM enrollments
             WHERE school_level = %s AND grade_level = %s
            """,
            [schedule.school_level, schedule.grade_level],
        )
        enrollment_ids = [r[0] for r in cur.fetchall()]

    invoices = StudentInvoice.objects.filter(
        enrollment_id__in=enrollment_ids,
    ).exclude(status="void")

    updated_count = 0
    for inv in invoices:
        # Replace line items with new amounts
        inv.items.all().delete()
        for fsi in fee_data["items"]:
            StudentInvoiceItem.objects.create(
                invoice=inv,
                description=f"[{fsi.get_item_category_display()}] {fsi.item_name}",
                amount=fsi.amount,
            )

        # Recompute discounts (re-fetch scholarships, re-apply plan + early bird)
        scholarships = _fetch_enrollment_scholarships(inv.enrollment_id)
        sch_deduction = _scholarship_discount_on_tuition(fee_data["tuition_total"], scholarships)

        eb = _is_early_bird(inv.invoice_date) if inv.invoice_date else False

        waterfall = compute_discount_waterfall(
            raw_tuition=fee_data["tuition_total"],
            raw_misc=fee_data["misc_total"],
            raw_other=fee_data["other_total"],
            voucher_amount=Decimal("0"),
            scholarship_discount_amount=sch_deduction,
            payment_plan=inv.payment_plan,
            early_bird=eb,
        )

        # Replace discount rows
        inv.discounts.all().delete()
        if sch_deduction > 0:
            StudentInvoiceDiscount.objects.create(
                invoice=inv,
                description=f"Scholarship discount (recalculated)",
                amount=sch_deduction,
            )
        plan_deduction = Decimal(waterfall["plan_deduction"])
        if plan_deduction > 0:
            plan_dt = _get_discount_type({
                "monthly":     "MONTHLY_PLAN",
                "quarterly":   "QUARTERLY_PLAN",
                "semi_annual": "SEMI_ANNUAL_PLAN",
                "annual":      "ANNUAL_PLAN",
            }[inv.payment_plan])
            StudentInvoiceDiscount.objects.create(
                invoice=inv,
                discount_type=plan_dt,
                description=plan_dt.discount_name if plan_dt else "Payment plan",
                amount=plan_deduction,
            )
        eb_deduction = Decimal(waterfall["early_bird_deduction"])
        if eb_deduction > 0:
            eb_dt = _get_discount_type("EARLY_BIRD")
            StudentInvoiceDiscount.objects.create(
                invoice=inv,
                discount_type=eb_dt,
                description="Early Bird (recalculated)",
                amount=eb_deduction,
            )

        # Rebuild installments — preserve already-paid amounts proportionally
        new_total = Decimal(waterfall["grand_total"])
        already_paid = sum(
            (Decimal(i.amount_paid) for i in inv.installments.all()),
            Decimal("0"),
        )
        remaining = max(new_total - already_paid, Decimal("0"))

        # Rebuild from scratch
        inv.installments.all().delete()
        settings = _get_school_settings()
        sy_start = settings.sy_start_date if settings else date(timezone.now().year, 6, 1)
        schedule_data = generate_installment_schedule(new_total, inv.payment_plan, sy_start)

        # Distribute already_paid across installments in order
        paid_remaining = already_paid
        for inst in schedule_data:
            amt = Decimal(inst["amount"])
            paid_here = min(paid_remaining, amt)
            paid_remaining -= paid_here
            status = "paid" if paid_here >= amt else ("partially_paid" if paid_here > 0 else "pending")
            InvoiceInstallment.objects.create(
                invoice=inv,
                sequence=inst["sequence"],
                due_date=inst["due_date"],
                amount=amt,
                amount_paid=paid_here,
                status=status,
            )

        inv.recalculated_at = timezone.now()
        inv.due_date = schedule_data[0]["due_date"] if schedule_data else None

        # Update overall invoice status
        if remaining <= Decimal("0.01"):
            inv.status = "paid"
        elif already_paid > 0:
            inv.status = "partially_paid"
        else:
            inv.status = "unpaid"

        inv.save()
        updated_count += 1

    return {"updated": updated_count}


# ── Apply payment to invoice + installments ──────────────────────────────────

@transaction.atomic
def apply_payment(invoice_id: int, amount_paid: Decimal):
    """
    Distribute a payment across the invoice's installments in due-date order.
    Updates installment statuses and the parent invoice status.
    """
    invoice = StudentInvoice.objects.select_for_update().filter(invoice_id=invoice_id).first()
    if not invoice:
        raise ValueError(f"Invoice #{invoice_id} not found.")

    remaining = Decimal(amount_paid)
    for inst in invoice.installments.order_by("sequence"):
        if remaining <= 0:
            break
        outstanding = Decimal(inst.amount) - Decimal(inst.amount_paid)
        if outstanding <= 0:
            continue
        applied = min(remaining, outstanding)
        inst.amount_paid = Decimal(inst.amount_paid) + applied
        if Decimal(inst.amount_paid) >= Decimal(inst.amount):
            inst.status = "paid"
        else:
            inst.status = "partially_paid"
        inst.save(update_fields=["amount_paid", "status"])
        remaining -= applied

    # Update overall invoice status
    total_amt  = sum((Decimal(i.amount) for i in invoice.installments.all()), Decimal("0"))
    total_paid = sum((Decimal(i.amount_paid) for i in invoice.installments.all()), Decimal("0"))
    if total_paid >= total_amt:
        invoice.status = "paid"
    elif total_paid > 0:
        invoice.status = "partially_paid"
    else:
        invoice.status = "unpaid"
    invoice.save(update_fields=["status"])

    return invoice