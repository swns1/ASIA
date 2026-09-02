"""
Tests for the discount waterfall in billing/services.py — the core tuition
math for invoice generation. compute_discount_waterfall() always queries
DiscountType via _get_discount_pct() to build its internal plan_pct_map
(even for payment plans that don't use a DB-backed percentage), so it's
mocked here rather than hitting a real database.
"""
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from billing.services import compute_discount_waterfall, shape_collections_series


@patch("billing.services._get_discount_pct", return_value=Decimal("0"))
def test_waterfall_no_discounts_leaves_tuition_untouched(_mock_pct):
    result = compute_discount_waterfall(
        raw_tuition=Decimal("10000"),
        raw_misc=Decimal("500"),
        raw_other=Decimal("200"),
        payment_plan="monthly",
    )

    assert Decimal(result["net_tuition"]) == Decimal("10000")
    assert Decimal(result["grand_total"]) == Decimal("10700")


@patch("billing.services._get_discount_pct", return_value=Decimal("0"))
def test_waterfall_applies_voucher_then_scholarship_in_order(_mock_pct):
    result = compute_discount_waterfall(
        raw_tuition=Decimal("10000"),
        raw_misc=Decimal("0"),
        raw_other=Decimal("0"),
        voucher_amount=Decimal("1000"),
        scholarship_discount_amount=Decimal("2000"),
        payment_plan="monthly",
    )

    steps = result["breakdown"]["steps"]
    assert Decimal(steps[0]["after"]) == Decimal("9000")  # 10000 - 1000 voucher
    assert Decimal(steps[1]["after"]) == Decimal("7000")  # 9000 - 2000 scholarship
    assert Decimal(result["net_tuition"]) == Decimal("7000")


def test_waterfall_early_bird_discounts_tuition_only_not_misc_or_other():
    """Misc and Other categories are documented as never discounted."""

    def fake_pct(code):
        return {"EARLY_BIRD": Decimal("5")}.get(code, Decimal("0"))

    with patch("billing.services._get_discount_pct", side_effect=fake_pct):
        result = compute_discount_waterfall(
            raw_tuition=Decimal("10000"),
            raw_misc=Decimal("500"),
            raw_other=Decimal("300"),
            payment_plan="monthly",
            early_bird=True,
        )

    # 5% of 10000 tuition = 500 deducted
    assert Decimal(result["net_tuition"]) == Decimal("9500")
    # misc/other pass through untouched and are only added at the end
    assert Decimal(result["grand_total"]) == Decimal("10300")


# ── shape_collections_series ─────────────────────────────────────────────────
# Pure shaping over the rows TruncMonth emits — no database, same style as the
# waterfall tests above.

def _row(year, month, amount):
    return {"month": date(year, month, 1), "collected": Decimal(amount)}


def test_collections_series_is_oldest_first():
    series = shape_collections_series([
        _row(2025, 3, "300"), _row(2025, 1, "100"), _row(2025, 2, "200"),
    ])
    assert [e["month"] for e in series] == ["2025-01", "2025-02", "2025-03"]


def test_collections_series_fills_gap_months_with_zero():
    # March is missing from the rows entirely. It must still occupy its slot,
    # otherwise the line runs straight from February to April and reads as
    # steady collection through a month when nothing was actually paid.
    series = shape_collections_series([_row(2025, 2, "200"), _row(2025, 4, "400")])
    assert [e["month"] for e in series] == ["2025-02", "2025-03", "2025-04"]
    assert series[1]["collected"] == "0.00"


def test_collections_series_cumulative_runs_through_empty_months():
    series = shape_collections_series([_row(2025, 1, "100"), _row(2025, 3, "300")])
    assert [e["cumulative"] for e in series] == ["100.00", "100.00", "400.00"]


def test_collections_series_crosses_a_year_boundary():
    series = shape_collections_series([_row(2024, 11, "100"), _row(2025, 2, "200")])
    assert [e["month"] for e in series] == ["2024-11", "2024-12", "2025-01", "2025-02"]


def test_collections_series_amounts_are_two_dp_strings():
    # The frontend formats pesos from these and must not inherit float error.
    series = shape_collections_series([_row(2025, 1, "1234.5")])
    assert series[0]["collected"] == "1234.50"
    assert isinstance(series[0]["cumulative"], str)


def test_collections_series_handles_a_null_sum():
    # Sum() returns None for a month whose only payment rows were removed.
    series = shape_collections_series([{"month": date(2025, 1, 1), "collected": None}])
    assert series[0]["collected"] == "0.00"


def test_collections_series_empty_input_is_empty():
    assert shape_collections_series([]) == []
