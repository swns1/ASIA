"""
`?overdue=true` on the invoice list and its summary.

No test database here (billing's models are `managed = False`), so the filter
is checked against a stand-in queryset that records what was asked of it.
"""
import pytest

from billing.views import filter_overdue


class RecordingQuerySet:
    def __init__(self):
        self.calls = []

    def filter(self, **kwargs):
        self.calls.append(("filter", kwargs))
        return self

    def distinct(self):
        self.calls.append(("distinct", {}))
        return self


@pytest.mark.parametrize("flag", ["true", "1", "True"])
def test_on_keeps_invoices_with_an_overdue_installment(flag):
    qs = RecordingQuerySet()
    filter_overdue(qs, flag)
    # distinct() matters: an invoice with two late installments would
    # otherwise be listed, and counted, twice.
    assert qs.calls == [("filter", {"installments__status": "overdue"}), ("distinct", {})]


@pytest.mark.parametrize("flag", [None, "", "false", "0"])
def test_off_leaves_the_queryset_alone(flag):
    qs = RecordingQuerySet()
    assert filter_overdue(qs, flag) is qs
    assert qs.calls == []
