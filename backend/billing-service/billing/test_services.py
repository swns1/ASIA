"""
Tests for the discount waterfall in billing/services.py — the core tuition
math for invoice generation. compute_discount_waterfall() always queries
DiscountType via _get_discount_pct() to build its internal plan_pct_map
(even for payment plans that don't use a DB-backed percentage), so it's
mocked here rather than hitting a real database.
"""
from decimal import Decimal
from unittest.mock import patch

from billing.services import compute_discount_waterfall


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
