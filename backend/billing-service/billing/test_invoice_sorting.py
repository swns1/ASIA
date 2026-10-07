"""
Sorting the invoice list by amount and by balance.

Both are worked out from an invoice's items, discounts and payments, not
stored, so OrderingFilter used to drop `?ordering=balance` as an unknown field
and the list stayed newest first under the "Balance" label. They're now
annotated on the list's queryset, the way the serializer works them out.

No test database here (billing's models are `managed = False`), so these check
the SQL the queryset would run, which builds without one.
"""
from billing.models import StudentInvoice
from billing.views import StudentInvoiceViewSet, with_amounts


def test_the_list_can_be_sorted_by_amount_and_balance():
    assert {"net_amount", "balance"} <= set(StudentInvoiceViewSet.ordering_fields)


def test_balance_is_items_less_discounts_less_payments():
    qs = with_amounts(StudentInvoice.objects.all()).order_by("-balance")
    sql = str(qs.query)

    assert {"net_amount", "balance"} <= set(qs.query.annotations)
    # Totals from each table: items, discounts and payments.
    for table in ("student_invoice_items", "student_invoice_discounts", "student_payments"):
        assert table in sql
    # An invoice with nothing paid or discounted counts it as 0, not as a null
    # that would sort the invoice to one end.
    assert "COALESCE(" in sql
    assert "ORDER BY" in sql and sql.rstrip().endswith("DESC")
