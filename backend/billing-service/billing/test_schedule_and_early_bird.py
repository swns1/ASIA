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
    _split_voucher_and_scholarship,
    default_sy_start,
    early_bird_cutoff,
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


# -- Invoicing a school year other than the configured one --------------------

def configured(current="2026-2027", sy_start=date(2026, 6, 1), early_bird_days=7):
    return SimpleNamespace(
        current_school_year=current, sy_start_date=sy_start, early_bird_days=early_bird_days,
    )


def test_configured_year_opens_on_the_configured_date():
    assert sy_start_for("2026-2027", configured()) == date(2026, 6, 1)


@pytest.mark.parametrize("school_year,expected", [
    ("2027-2028", date(2027, 6, 1)),
    ("2025-2026", date(2025, 6, 1)),
])
def test_other_years_keep_the_opening_day_in_their_own_year(school_year, expected):
    """
    The defect: every invoice used settings.sy_start_date whatever year it was
    for, so next year's enrollments were billed on this year's calendar.
    """
    assert sy_start_for(school_year, configured()) == expected


def test_unreadable_school_year_falls_back_to_the_configured_date():
    assert sy_start_for("", configured()) == date(2026, 6, 1)
    assert sy_start_for(None, configured()) == date(2026, 6, 1)


def test_settings_without_a_named_year_are_read_as_their_start_dates_year():
    assert sy_start_for("2027-2028", settings_row(sy_start=date(2026, 8, 1))) == date(2027, 8, 1)


def test_unconfigured_calendar_opens_the_school_years_own_july():
    assert sy_start_for("2027-2028", None) == date(2027, 7, 1)


def test_a_29_february_opening_moves_to_the_28th():
    leap = configured(current="2028-2029", sy_start=date(2028, 2, 29))
    assert sy_start_for("2029-2030", leap) == date(2029, 2, 28)


def test_next_years_early_enroller_is_early_by_next_years_calendar():
    """Invoiced in February for the year opening in June: Early Bird. It was
    refused against this year's cutoff, which had passed eight months before."""
    assert early_bird_cutoff(configured(), "2027-2028") == date(2027, 6, 7)
    assert _is_early_bird(date(2027, 2, 10), "2027-2028", configured()) is True


def test_a_late_transferee_is_not_granted_next_years_early_bird():
    """With settings already moved to next year, a February transferee into
    the year still running was judged against next year's cutoff -- and with
    no lower bound on the window, granted a discount for enrolling late."""
    moved_on = configured(current="2027-2028", sy_start=date(2027, 6, 1))
    assert _is_early_bird(date(2027, 2, 10), "2026-2027", moved_on) is False


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
            patch.object(services, "_get_school_settings", return_value=configured()), \
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
