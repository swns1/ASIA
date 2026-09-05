"""
Regression test: billing/views.py used to define its own local
BILLING_ROLES = {"super_admin", "admin", "accounting"} (no "registrar"),
which shadowed the real one imported from accounts.permissions
(BILLING_ROLES = {"super_admin", "admin", "accounting", "registrar"}) --
same name, different set, and the local one silently won for
FeeScheduleViewSet, FeeScheduleItemViewSet, DiscountTypeViewSet and
StudentPaymentViewSet. A registrar could therefore GET /api/invoices/ (via
IsBillingStaffOrOwnerGuardianReadOnly, which uses the real set) but was
403'd on /api/payments/, /api/fee-schedules/ and /api/discount-types/ --
two different role sets under one name, inconsistent across endpoints in
the same service.
"""
from accounts.permissions import BILLING_ROLES as REAL_BILLING_ROLES
from billing.views import BILLING_ROLES as VIEWS_BILLING_ROLES
from billing.views import (
    DiscountTypeViewSet,
    FeeScheduleItemViewSet,
    FeeScheduleViewSet,
    StudentPaymentViewSet,
)


def test_views_no_longer_shadow_the_real_billing_roles():
    assert VIEWS_BILLING_ROLES is REAL_BILLING_ROLES
    assert "registrar" in VIEWS_BILLING_ROLES


def test_the_four_previously_inconsistent_viewsets_now_allow_registrar():
    for viewset in (
        FeeScheduleViewSet,
        FeeScheduleItemViewSet,
        DiscountTypeViewSet,
        StudentPaymentViewSet,
    ):
        assert "registrar" in viewset.required_roles, viewset.__name__
