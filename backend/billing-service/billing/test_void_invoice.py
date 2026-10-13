"""
A void invoice's installments are voided with it (2026-10-13).

Voiding, re-issuing and a transfer close-out that leaves nothing owed each
flipped only the invoice's status. Its installments stayed pending -- or paid,
once a re-issue had moved the payments to the replacement -- so the parent
portal, which reads the schedule, listed a cancelled bill as Overdue: 225
such rows on the local database, across 33 invoices of children whose
guardians have portal accounts. services.void_invoice() is now the only way
an invoice becomes void, and the last test here keeps it that way.

DB-free, mocked at the model boundary like the rest of this service's tests.
"""
import ast
from contextlib import nullcontext
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, patch

from billing import services

BILLING = Path(services.__file__).parent


def _no_atomic():
    return patch("billing.services.transaction.atomic", return_value=nullcontext())


def test_voiding_voids_every_live_installment():
    invoice = MagicMock(status="unpaid")
    services.void_invoice(invoice)

    assert invoice.status == "void"
    invoice.save.assert_called_once_with(update_fields=["status"])
    invoice.installments.exclude.assert_called_once_with(status="voided")
    invoice.installments.exclude.return_value.update.assert_called_once_with(status="voided")


def test_a_reissue_voids_the_original_through_void_invoice():
    old = MagicMock(invoice_id=5, invoice_no="INV-2026-000005", status="partially_paid",
                    enrollment_id=20, invoice_date=date(2026, 5, 1))
    old.installments.filter.return_value.exists.return_value = False
    old.discounts.filter.return_value.exists.return_value = False
    new = MagicMock(pk=9, invoice_id=9, invoice_no="INV-2026-000009")
    enrollment = {"enrollment_id": 20, "student_id": 7, "enrollment_status": "enrolled"}
    with _no_atomic(), \
            patch.object(services.StudentInvoice, "objects") as invoices, \
            patch.object(services.StudentPayment, "objects") as payments, \
            patch.object(services, "_fetch_enrollment", return_value=enrollment), \
            patch.object(services, "_ensure_billable"), \
            patch.object(services, "_lock_student_year"), \
            patch.object(services, "_build_invoice_for_enrollment", return_value=new), \
            patch.object(services, "apply_payment"), \
            patch.object(services, "void_invoice", wraps=services.void_invoice) as void:
        invoices.select_for_update.return_value.filter.return_value.first.return_value = old
        payments.filter.return_value.order_by.return_value = []
        services.reissue_invoice.__wrapped__(5, "annual")

    void.assert_called_once_with(old)
    old.installments.exclude.return_value.update.assert_called_once_with(status="voided")


def test_a_close_out_that_leaves_nothing_owed_voids_through_void_invoice():
    invoice = MagicMock(status="unpaid")
    invoice.installments.filter.return_value.exclude.return_value = []
    invoice.installments.exclude.return_value = []   # nothing live is left
    with _no_atomic(), \
            patch.object(services.StudentInvoice, "objects") as objects, \
            patch.object(services.StudentInvoiceDiscount, "objects"), \
            patch.object(services, "void_invoice") as void:
        objects.select_for_update.return_value.filter.return_value.first.return_value = invoice
        services.close_out_invoice_for_transfer.__wrapped__(1, date(2026, 10, 31))

    void.assert_called_once_with(invoice)


def _void_writes(tree):
    """(function, line) of each place a status is SET to "void": an
    assignment to `.status`, or status="void" passed to a write."""
    writes = []

    def walk(node, func):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            func = node.name
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant) and node.value.value == "void":
            if any(isinstance(t, ast.Attribute) and t.attr == "status" for t in node.targets):
                writes.append((func, node.lineno))
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) \
                and node.func.attr in {"update", "create", "get_or_create", "update_or_create"}:
            for kw in node.keywords:
                if kw.arg == "status" and isinstance(kw.value, ast.Constant) and kw.value.value == "void":
                    writes.append((func, node.lineno))
        for child in ast.iter_child_nodes(node):
            walk(child, func)

    walk(tree, None)
    return writes


def test_nothing_but_void_invoice_sets_an_invoice_void():
    stray = []
    for path in sorted(BILLING.rglob("*.py")):
        if path.name.startswith("test_") or "migrations" in path.parts:
            continue
        for func, line in _void_writes(ast.parse(path.read_text())):
            if not (path.name == "services.py" and func == "void_invoice"):
                stray.append(f"{path.relative_to(BILLING)}:{line} in {func}()")
    assert not stray, (
        "Only services.void_invoice() may make an invoice void; it voids the "
        "installments too. Call it instead at: " + ", ".join(stray)
    )


def test_the_guard_sees_both_ways_of_writing_void():
    writes = _void_writes(ast.parse(
        "def a(i):\n    i.status = 'void'\n"
        "def b(qs):\n    qs.update(status='void')\n"
        "def c(qs):\n    qs.filter(status='void')\n"   # a read, not a write
    ))
    assert writes == [("a", 2), ("b", 4)]
