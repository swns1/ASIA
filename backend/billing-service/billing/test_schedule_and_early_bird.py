"""
Regressions for the calendar and discount-routing defects in billing/services.py.

All of these were invisible while the school happened to open in June, which is
the month the module had hardcoded. They are tested against an August-opening
school year precisely because that is where the old code diverged.

Pure functions only -- no database. generate_installment_schedule() takes its
sy_start as an argument, and _is_early_bird() reads the singleton settings row
through _get_school_settings(), which is patched.
"""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from billing import services
from billing.services import (
    _is_early_bird,
    _fetch_enrollment_scholarships,
    _split_voucher_and_scholarship,
    default_sy_start,
    early_bird_cutoff,
    earns_early_bird,
    generate_installment_schedule,
    generate_installment_schedule_prorated,
    sy_start_for,
)


def settings_row(sy_start=date(2025, 8, 1), early_bird_days=7):
    return SimpleNamespace(sy_start_date=sy_start, early_bird_days=early_bird_days)


# -- Early bird ---------------------------------------------------------------

@patch("billing.services._get_school_settings", return_value=settings_row())
def test_early_bird_applies_to_a_family_invoiced_months_ahead(_s):
    """
    The defect: the window was `sy_start <= invoice_date <= cutoff`, so an
    invoice generated in March for an August school year fell BELOW it and was
    refused. Enrollment approval is when invoices are generated, and that
    happens months before classes open -- so the discount was unreachable for
    every family it was meant to reward.
    """
    assert _is_early_bird(date(2025, 3, 14)) is True


@patch("billing.services._get_school_settings", return_value=settings_row())
def test_early_bird_still_applies_on_the_cutoff_day(_s):
    assert _is_early_bird(date(2025, 8, 7)) is True


@patch("billing.services._get_school_settings", return_value=settings_row())
def test_early_bird_stops_after_the_cutoff(_s):
    assert _is_early_bird(date(2025, 8, 8)) is False


@patch("billing.services._get_school_settings",
       return_value=settings_row(early_bird_days=30))
def test_early_bird_window_follows_the_configured_days(_s):
    assert early_bird_cutoff() == date(2025, 8, 30)
    assert _is_early_bird(date(2025, 8, 30)) is True
    assert _is_early_bird(date(2025, 8, 31)) is False


@patch("billing.services._get_school_settings", return_value=None)
def test_early_bird_is_refused_when_the_calendar_is_unconfigured(_s):
    """No configured school year means no window to be early for. Failing
    closed is deliberate: the alternative grants a discount off a guessed
    date."""
    assert early_bird_cutoff() is None
    assert _is_early_bird(date(2025, 3, 14)) is False


# -- Installment calendar -----------------------------------------------------

def test_monthly_schedule_starts_in_the_month_the_school_opens():
    """
    The defect: months were hardcoded June-March and only `sy_start.year` was
    read. An August school year was handed a June and a July installment --
    both already past on the day the invoice was generated, and both duly
    picked up by `manage.py flag_overdue_installments`.
    """
    schedule = generate_installment_schedule(Decimal("10000"), "monthly", date(2025, 8, 1))

    assert len(schedule) == 10
    assert schedule[0]["due_date"] == date(2025, 8, 31)
    assert schedule[-1]["due_date"] == date(2026, 5, 31)
    assert all(inst["due_date"] >= date(2025, 8, 1) for inst in schedule)


def test_monthly_schedule_still_runs_june_to_march_for_a_june_school():
    """The old hardcoded calendar was not wrong, only fixed. A June-opening
    school must land exactly where it always did."""
    schedule = generate_installment_schedule(Decimal("10000"), "monthly", date(2025, 6, 1))

    assert schedule[0]["due_date"] == date(2025, 6, 30)
    assert schedule[-1]["due_date"] == date(2026, 3, 31)


@pytest.mark.parametrize(
    "plan,count",
    [("monthly", 10), ("quarterly", 4), ("semi_annual", 2), ("annual", 1)],
)
def test_every_plan_sums_to_the_grand_total(plan, count):
    """A total that does not survive being split is a billing error. The
    rounding remainder has to land somewhere; it is parked on the last
    installment."""
    total = Decimal("10000.07")  # deliberately indivisible by 10, 4 and 2
    schedule = generate_installment_schedule(total, plan, date(2025, 8, 1))

    assert len(schedule) == count
    assert sum(inst["amount"] for inst in schedule) == total


def test_annual_is_due_in_the_opening_month_not_late_in_the_year():
    """
    The defect: annual carries the largest discount of the four plans but sat
    on a fixed end-of-October due date -- LATER than the first five monthly
    installments. The school was paying 5% for a settlement that arrived after
    half the monthly payers had already settled.
    """
    annual = generate_installment_schedule(Decimal("10000"), "annual", date(2025, 8, 1))
    monthly = generate_installment_schedule(Decimal("10000"), "monthly", date(2025, 8, 1))

    assert annual[0]["due_date"] == date(2025, 8, 31)
    assert annual[0]["due_date"] <= monthly[0]["due_date"]


def test_quarterly_slots_step_three_months_from_the_opening():
    schedule = generate_installment_schedule(Decimal("10000"), "quarterly", date(2025, 8, 1))
    assert [inst["due_date"] for inst in schedule] == [
        date(2025, 8, 31), date(2025, 11, 30), date(2026, 2, 28), date(2026, 5, 31),
    ]


def test_unknown_plan_is_rejected():
    with pytest.raises(ValueError, match="Unknown payment plan"):
        generate_installment_schedule(Decimal("10000"), "fortnightly", date(2025, 8, 1))


def test_prorated_schedule_drops_past_slots_and_keeps_the_full_total():
    """A transfer-in is not discounted for arriving late; only the schedule is
    compressed into what is left of the year."""
    schedule = generate_installment_schedule_prorated(
        Decimal("10000"), "monthly", date(2025, 8, 1), date(2025, 12, 15)
    )

    assert all(inst["due_date"] >= date(2025, 12, 15) for inst in schedule)
    assert sum(inst["amount"] for inst in schedule) == Decimal("10000")
    assert [inst["sequence"] for inst in schedule] == list(range(1, len(schedule) + 1))


def test_prorated_schedule_falls_back_when_every_slot_has_passed():
    schedule = generate_installment_schedule_prorated(
        Decimal("10000"), "monthly", date(2025, 8, 1), date(2030, 1, 1)
    )
    assert len(schedule) == 1
    assert sum(inst["amount"] for inst in schedule) == Decimal("10000")


# -- School year start month --------------------------------------------------

def test_default_sy_start_cuts_at_july_like_the_rest_of_the_app():
    """
    The defect: this module cut at June while enrollments.views.school_years()
    and the frontend's computeDefaultSchoolYear() both cut at July, so a
    student enrolled in June was filed under one school year by the registrar
    and a different one by billing.
    """
    assert default_sy_start(date(2026, 6, 30)) == date(2025, 7, 1)
    assert default_sy_start(date(2026, 7, 1)) == date(2026, 7, 1)


# -- The enrollment's own school year ------------------------------------------

@patch("billing.services.configured_dates", return_value=(date(2026, 8, 3), date(2027, 5, 28)))
def test_installments_count_from_the_enrollments_own_year(_d):
    """
    The defect: every invoice built its installments from School Settings'
    sy_start_date -- the CURRENT year's -- so a family enrolled early for
    2026-2027 got 2025-2026's due dates (Aug 2025 to May 2026, all before
    their year began).
    """
    assert sy_start_for("2026-2027") == date(2026, 8, 3)


@patch("billing.services.configured_dates", return_value=None)
def test_an_unregistered_year_starts_july_first_of_its_own_year(_d):
    """Not today's year: an unset-up 2027-2028 still counts from 2027."""
    assert sy_start_for("2027-2028") == date(2027, 7, 1)


@patch("billing.services.configured_dates", return_value=None)
def test_no_usable_year_falls_back_to_today(_d):
    assert sy_start_for("", today=date(2026, 9, 1)) == date(2026, 7, 1)


@patch("billing.services._get_school_settings", return_value=settings_row(sy_start=date(2025, 6, 1)))
def test_early_bird_counts_from_the_enrollments_year_when_given(_s):
    """The window length is the school's setting; the start is the
    enrollment's year, not the current year's start from settings."""
    assert early_bird_cutoff(sy_start=date(2026, 8, 3)) == date(2026, 8, 9)
    assert _is_early_bird(date(2026, 8, 9), date(2026, 8, 3)) is True
    assert _is_early_bird(date(2026, 8, 10), date(2026, 8, 3)) is False


# Current year 2026-2027 opens 2026-06-01 (School Settings); the invoice
# belongs to 2025-2026, which opened 2025-06-01 (the registry).
@patch("billing.services.configured_dates", return_value=(date(2025, 6, 1), date(2026, 3, 31)))
@patch("billing.services._get_school_settings", return_value=settings_row(sy_start=date(2026, 6, 1)))
def test_an_older_invoice_is_judged_by_its_own_years_window(_s, _d):
    """
    The defect: recalculation asked _is_early_bird(invoice_date) with no start,
    so the window was the CURRENT year's (cutoff 2026-06-07) and every
    2025-2026 invoice -- all dated in 2025 -- earned Early Bird when that
    year's fees were edited, including families invoiced after their own
    year's window had closed.
    """
    assert earns_early_bird(date(2025, 6, 9), "2025-2026") is False
    assert earns_early_bird(date(2025, 6, 7), "2025-2026") is True


@patch("billing.services.configured_dates", return_value=None)
@patch("billing.services._get_school_settings", return_value=settings_row(sy_start=date(2026, 6, 1)))
def test_a_year_with_no_dates_earns_no_early_bird(_s, _d):
    """No registered start, no window -- not the current year's by default."""
    assert earns_early_bird(date(2025, 5, 1), "2025-2026") is False


def test_an_undated_invoice_earns_no_early_bird():
    assert earns_early_bird(None, "2025-2026") is False


def test_next_years_invoice_is_scheduled_on_next_years_calendar():
    """
    End to end through _build_invoice_for_enrollment, with the database
    patched out: a Grade 4 learner enrolled for 2027-2028, invoiced on
    10 February 2027 while settings still name 2026-2027. Eight of the ten
    monthly installments used to be dated before the invoice itself.
    """
    enrollment = {
        "enrollment_id": 20, "student_id": 5, "school_level": "elementary",
        "grade_level": "Grade 4", "school_year": "2027-2028", "enrollment_status": "enrolled",
    }
    fee_data = {"items": [], "tuition_total": Decimal("10000"),
                "misc_total": Decimal("0"), "other_total": Decimal("0")}
    early_bird = SimpleNamespace(discount_value=Decimal("5"), discount_name="Early Bird")

    with patch.object(services, "_read_fee_schedule", return_value=fee_data), \
            patch.object(services, "_fetch_enrollment_scholarships", return_value=[]), \
            patch.object(services, "_get_school_settings", return_value=settings_row(sy_start=date(2026, 6, 1))), \
            patch.object(services, "configured_dates", return_value=(date(2027, 6, 1), date(2028, 3, 31))), \
            patch.object(services, "_get_discount_type",
                         side_effect=lambda code: early_bird if code == "EARLY_BIRD" else None), \
            patch.object(services.timezone, "localdate", return_value=date(2027, 2, 10)), \
            patch.object(services.StudentInvoice, "objects") as invoices, \
            patch.object(services.StudentInvoiceItem, "objects"), \
            patch.object(services.StudentInvoiceDiscount, "objects") as discounts, \
            patch.object(services.InvoiceInstallment, "objects") as installments:
        invoices.create.return_value = MagicMock(invoice_id=7)
        services._build_invoice_for_enrollment(enrollment, "monthly")

    due_dates = [c.kwargs["due_date"] for c in installments.create.call_args_list]
    assert due_dates[0] == date(2027, 6, 30)
    assert due_dates[-1] == date(2028, 3, 31)
    assert all(d > date(2027, 2, 10) for d in due_dates)

    discount_rows = [c.kwargs["description"] for c in discounts.create.call_args_list]
    assert any(d.startswith("Early Bird (invoiced on or before 2027-06-07)") for d in discount_rows)


# -- Scholarships as the database hands them over -----------------------------

def test_scholarship_rows_carry_the_code_the_voucher_split_reads():
    """
    The defect: _fetch_enrollment_scholarships read
    `scholarship_type.scholarship_code`, but ScholarshipTypeMirror had no such
    field -- so generating or recalculating the invoice of ANY learner with a
    scholarship raised AttributeError. The other tests here hand the split
    plain dicts and never touched the mirror, which is how it went unseen.

    Real (unsaved) mirror instances, so a field missing from the mirror fails
    here rather than in front of a cashier.
    """
    from billing.enrollment_mirror import EnrollmentScholarshipMirror, ScholarshipTypeMirror

    esc = ScholarshipTypeMirror(
        scholarship_type_id=1, scholarship_code="ESC", discount_mode="fixed_amount",
        scholarship_name="Education Service Contracting (ESC)", discount_value=Decimal("14000"),
    )
    honor = ScholarshipTypeMirror(
        scholarship_type_id=3, scholarship_code="HONOR", discount_mode="percentage",
        scholarship_name="Academic Excellence Award", discount_value=Decimal("10"),
    )
    rows = [
        EnrollmentScholarshipMirror(enrollment_id=207, scholarship_type=esc),
        EnrollmentScholarshipMirror(enrollment_id=207, scholarship_type=honor),
    ]

    with patch("billing.enrollment_mirror.EnrollmentScholarshipMirror") as mirror:
        mirror.objects.filter.return_value.select_related.return_value = rows
        scholarships = _fetch_enrollment_scholarships(207)

    assert [s["scholarship_code"] for s in scholarships] == ["ESC", "HONOR"]
    voucher, scholarship = _split_voucher_and_scholarship(Decimal("23000"), scholarships)
    assert voucher == Decimal("14000")        # ESC lands in the voucher stage
    assert scholarship == Decimal("900.00")   # 10% of what the voucher left


# -- Voucher vs scholarship ---------------------------------------------------

def test_government_vouchers_are_separated_from_school_scholarships():
    """
    The defect: both waterfall stages existed, but every caller passed
    voucher_amount=0 and funnelled subsidies through the scholarship stage --
    so the voucher line on a family's breakdown was always zero, and an ESC
    grant was reported as a school award the school had not made.
    """
    voucher, scholarship = _split_voucher_and_scholarship(
        Decimal("10000"),
        [
            {"scholarship_code": "ESC_JHS", "discount_mode": "fixed_amount",
             "discount_value": Decimal("9000"), "scholarship_name": "ESC"},
            {"scholarship_code": "HONOR_ROLL", "discount_mode": "percentage",
             "discount_value": Decimal("50"), "scholarship_name": "Academic"},
        ],
    )

    assert voucher == Decimal("9000")
    # 50% is taken on what the voucher left, not on raw tuition -- the order
    # the module docstring has always described.
    assert scholarship == Decimal("500")


def test_combined_deduction_never_exceeds_tuition():
    voucher, scholarship = _split_voucher_and_scholarship(
        Decimal("10000"),
        [
            {"scholarship_code": "VOUCHER_SHS", "discount_mode": "fixed_amount",
             "discount_value": Decimal("8000"), "scholarship_name": "SHS Voucher"},
            {"scholarship_code": "FULL_RIDE", "discount_mode": "fixed_amount",
             "discount_value": Decimal("99000"), "scholarship_name": "Full"},
        ],
    )
    assert voucher + scholarship == Decimal("10000")


def test_a_plain_scholarship_is_not_mistaken_for_a_voucher():
    voucher, scholarship = _split_voucher_and_scholarship(
        Decimal("10000"),
        [{"scholarship_code": "SIBLING_DISCOUNT", "discount_mode": "percentage",
          "discount_value": Decimal("10"), "scholarship_name": "Sibling"}],
    )
    assert voucher == Decimal("0")
    assert scholarship == Decimal("1000")
