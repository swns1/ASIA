"""
`?has_balance=true` / `?has_payments=true` on the invoice list and summary.

The Billing panel's Outstanding and Collected figures used to link to
`status=unpaid` and `status=paid`. A partly paid invoice counts toward both
figures but is neither, so each list held only part of its figure.

No test database here (billing's models are `managed = False`), so the outer
filter is checked against a stand-in queryset and the inner one as SQL.
"""
import pytest

from billing.views import filter_money


class RecordingQuerySet:
    def __init__(self):
        self.calls = []

    def filter(self, **kwargs):
        self.calls.append(kwargs)
        return self


def _inner_sql(qs):
    [kwargs] = qs.calls
    return str(kwargs["invoice_id__in"].query)


@pytest.mark.parametrize("flag", ["true", "1"])
def test_has_balance_keeps_live_invoices_still_owing(flag):
    qs = RecordingQuerySet()
    filter_money(qs, {"has_balance": flag})
    sql = _inner_sql(qs)
    assert "void" in sql          # a void invoice owes nothing
    assert "> 0" in sql           # balance above zero: unpaid and partly paid alike
    assert "status" in sql and "'unpaid'" not in sql


def test_has_payments_keeps_live_invoices_with_any_payment():
    qs = RecordingQuerySet()
    filter_money(qs, {"has_payments": "true"})
    sql = _inner_sql(qs)
    assert "void" in sql
    assert "EXISTS" in sql
    assert "'paid'" not in sql    # partly paid ones count too


@pytest.mark.parametrize("params", [{}, {"has_balance": "false"}, {"has_payments": ""}])
def test_off_leaves_the_queryset_alone(params):
    qs = RecordingQuerySet()
    assert filter_money(qs, params) is qs
    assert qs.calls == []
