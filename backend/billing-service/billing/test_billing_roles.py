"""
Who may touch money in billing.

An earlier fix put the registrar into BILLING_ROLES everywhere, to make the
viewsets agree with each other. They agreed, but on the wrong answer: a
registrar could record payments, add fee items and create a 100% discount
type through the API while the app showed them none of billing. A
registrar's own work needs exactly two billing actions -- invoicing a learner
they enroll and closing out one they transfer out -- plus reading.
"""
from accounts.permissions import BILLING_READ_ROLES, BILLING_ROLES
from billing.views import (
    DiscountTypeViewSet,
    FeeScheduleItemViewSet,
    FeeScheduleViewSet,
    StudentInvoiceViewSet,
    StudentPaymentViewSet,
)


def test_money_is_handled_by_admin_and_accounting():
    assert BILLING_ROLES == {"super_admin", "admin", "accounting"}
    assert BILLING_READ_ROLES == BILLING_ROLES | {"registrar"}


def test_fees_discounts_and_payments_are_not_open_to_registrars():
    for viewset in (FeeScheduleViewSet, FeeScheduleItemViewSet, DiscountTypeViewSet, StudentPaymentViewSet):
        assert "registrar" not in viewset.required_roles, viewset.__name__


def test_registrars_get_only_the_invoice_actions_their_work_needs():
    assert StudentInvoiceViewSet.registrar_actions == {"generate", "close_out_transfer"}
