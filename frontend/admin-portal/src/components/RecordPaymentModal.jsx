import { useState, useEffect } from "react";
import toast from "react-hot-toast";

import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Alert from "./ui/Alert";
import Skeleton from "./ui/Skeleton";
import { StatusBadge } from "./ui/Badge";
import { Field, Input, Textarea } from "./FormField";
import { INVOICE_STATUS_MAP } from "../constants/statusMaps";
import { PAYMENT_METHODS } from "../constants/paymentMethods";
import { todayISO } from "../utils/format";

import {
  getInvoice as _getInvoice,
  getInvoices as _getInvoices,
  createPayment as _createPayment,
} from "../api/billingApi";
const getInvoice    = (id)  => _getInvoice(id);
const getInvoices   = (p={})=> _getInvoices(p);
const createPayment = (p)   => _createPayment(p);

// The chosen payment method's colours, from its tone (constants/paymentMethods):
// token classes, so they follow the theme. Complete strings, as Tailwind needs.
const METHOD_ON = {
  success: "border-success-500 bg-success-50 text-success-500",
  info:    "border-info-500 bg-info-50 text-info-500",
  accent:  "border-accent-500 bg-accent-50 text-accent-500",
  warning: "border-warning-500 bg-warning-50 text-warning-500",
  muted:   "border-muted-500 bg-muted-50 text-muted-500",
};

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;

/**
 * Shared Record Payment modal used by both PaymentsPage and InvoicesPage.
 *
 * Props:
 *   preloadedInvoiceId  — number | null   pre-select an invoice (locks the selector)
 *   onClose             — () => void
 *   onSaved             — () => void       called after a successful save
 */
export default function RecordPaymentModal({ preloadedInvoiceId, onClose, onSaved }) {
  const [invoiceSearch,  setInvoiceSearch]  = useState("");
  const [invoiceResults, setInvoiceResults] = useState([]);
  const [searching,      setSearching]      = useState(false);
  const [invoice,        setInvoice]        = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [dropdownOpen,   setDropdownOpen]   = useState(false);

  const [form, setForm] = useState({
    amount_paid:      "",
    payment_method:   "cash",
    payment_date:     todayISO(),
    reference_number: "",
    notes:            "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  useEffect(() => {
    if (!preloadedInvoiceId) return;
    setLoadingInvoice(true);
    getInvoice(preloadedInvoiceId)
      .then(setInvoice)
      // Without this the modal fell back to the invoice search as if nothing
      // had been chosen, and the cashier had no idea the one they picked failed.
      .catch((e) => setError(e.message || "Couldn't load this invoice. Close and try again."))
      .finally(() => setLoadingInvoice(false));
  }, [preloadedInvoiceId]);

  useEffect(() => {
    if (!invoiceSearch.trim()) { setInvoiceResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await getInvoices({ search: invoiceSearch, page_size: 20 });
        setInvoiceResults(Array.isArray(data) ? data : data?.results ?? []);
      } catch { setInvoiceResults([]); }
      finally   { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [invoiceSearch]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!invoice) { setError("Select an invoice."); return; }
    const netAmount = parseFloat(invoice.net_amount ?? 0);
    const totalPaid = parseFloat(invoice.total_paid ?? 0);
    const balance   = parseFloat(invoice.balance ?? (netAmount - totalPaid));
    if (!form.amount_paid || parseFloat(form.amount_paid) <= 0) {
      setError("Amount must be greater than 0."); return;
    }
    if (parseFloat(form.amount_paid) > balance + 0.01) {
      setError(`Amount exceeds remaining balance of ${fmt(balance)}.`); return;
    }
    setSaving(true); setError("");
    try {
      await createPayment({
        invoice:          invoice.invoice_id,
        amount_paid:      parseFloat(form.amount_paid),
        payment_method:   form.payment_method,
        payment_date:     form.payment_date,
        reference_number: form.reference_number.trim() || null,
        notes:            form.notes.trim() || null,
      });
      toast.success("Payment recorded.");
      onSaved();
      onClose();
    } catch (e) {
      const msg = e.message || "Failed to record payment.";
      setError(msg);
      toast.error(msg);
    }
    finally     { setSaving(false); }
  };


  const balance    = invoice ? parseFloat(invoice.balance ?? 0) : 0;
  const en         = invoice?.enrollment_detail;

  return (
    <Modal
      onClose={onClose}
      size="md"
      showClose
      loading={saving}
      icon="ti-cash"
      title="Record Payment"
      description="Apply a payment to an invoice"
      // A part-filled payment form shouldn't be lost to a stray backdrop click.
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button icon="ti-cash" loading={saving} disabled={!invoice} onClick={handleSave}>
            {saving ? "Recording…" : "Record Payment"}
          </Button>
        </div>
      }
    >
      <div>
          {error && <Alert variant="error" className="mb-3.5">{error}</Alert>}

          {/* Invoice selector */}
          <div className="mb-4">
            <div className="mb-1.5 block text-xs font-bold uppercase tracking-[0.07em] text-neutral-700">Invoice <span className="text-brand-600">*</span></div>
            {loadingInvoice ? <Skeleton height={52} /> : invoice ? (
              <div className="rounded-lg border-[1.5px] border-brand-border-soft bg-brand-50 px-4 py-3.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-[monospace] text-[13px] font-bold text-neutral-900">{invoice.invoice_no}</span>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={invoice.status} map={INVOICE_STATUS_MAP} size="sm" />
                    {!preloadedInvoiceId && (
                      <button
                        type="button"
                        onClick={() => setInvoice(null)}
                        className="cursor-pointer rounded-[7px] border border-brand-border-soft bg-transparent px-2 py-1 text-[11px] text-neutral-700"
                      >
                        Change
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-[13px] font-semibold text-neutral-900">{en?.student_name ?? `Enrollment #${invoice.enrollment_id}`}</div>
                <div className="mt-0.5 text-[11px] text-neutral-500">{en?.grade_level} · {en?.section} · S.Y. {en?.school_year}</div>
                <div className="mt-3 grid grid-cols-[1fr_1fr_1fr] gap-2.5">
                  {[
                    { label:"Total Due",  val:fmt(invoice.net_amount ?? 0), tone:"text-neutral-900" },
                    { label:"Total Paid", val:fmt(invoice.total_paid ?? 0), tone:"text-success-500" },
                    { label:"Balance",    val:fmt(balance),                  tone:balance > 0 ? "text-error-600" : "text-success-500" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-md border border-neutral-200 bg-surface px-2 py-2.5 text-center">
                      <div className={`text-[14px] font-bold ${s.tone}`}>{s.val}</div>
                      <div className="mt-[3px] text-[10.5px] uppercase tracking-[0.06em] text-neutral-500">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="flex h-11 items-center gap-2.5 rounded-md border-[1.5px] border-brand-border-soft bg-surface px-3.5">
                  <i className="ti ti-search text-[14px] text-neutral-500" aria-hidden="true" />
                  <input placeholder="Search by invoice number or student name…" value={invoiceSearch}
                    onChange={(e) => { setInvoiceSearch(e.target.value); setDropdownOpen(true); }}
                    onFocus={() => setDropdownOpen(true)}
                    className="flex-1 border-none bg-transparent text-[13px] text-neutral-900 outline-none" />
                  {searching && <i className="ti ti-loader-2 animate-spin text-[13px] text-brand-600" aria-hidden="true" />}
                </div>
                {dropdownOpen && invoiceSearch && (
                  <div className="absolute inset-x-0 top-full z-[1000] mt-1.5 max-h-[220px] overflow-y-auto rounded-md border border-brand-border-soft bg-surface-raised shadow-lg dark:shadow-float-dark">
                    {invoiceResults.length === 0 && !searching && <div className="p-4 text-center text-[13px] text-neutral-500">No invoices found.</div>}
                    {invoiceResults.map((inv) => {
                      if (inv.status === "void" || inv.status === "paid") return null;
                      const en = inv.enrollment_detail;
                      return (
                        <div key={inv.invoice_id} onClick={() => { setInvoice(inv); setDropdownOpen(false); setInvoiceSearch(""); }}
                          className="cursor-pointer border-b border-neutral-200/70 px-3.5 py-2.5 transition-colors hover:bg-brand-50">
                          <div className="flex items-center justify-between">
                            <span className="font-[monospace] text-[12px] font-bold text-neutral-900">{inv.invoice_no}</span>
                            <StatusBadge status={inv.status} map={INVOICE_STATUS_MAP} size="sm" />
                          </div>
                          <div className="mt-0.5 text-[12px] text-neutral-800">{en?.student_name ?? `Enrollment #${inv.enrollment_id}`} · {fmt(inv.balance ?? 0)} remaining</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment method */}
          <div className="mb-4">
            <div className="mb-1.5 block text-xs font-bold uppercase tracking-[0.07em] text-neutral-700">Payment Method <span className="text-brand-600">*</span></div>
            <div className="grid grid-cols-[repeat(3,1fr)] gap-2">
              {PAYMENT_METHODS.map((pm) => {
                const active = form.payment_method === pm.value;
                return (
                  <button key={pm.value} type="button" aria-pressed={active} onClick={() => setF("payment_method", pm.value)}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border-[1.5px] px-3 py-2.5 transition-all duration-150 ${
                      active ? METHOD_ON[pm.tone] ?? METHOD_ON.muted : "border-neutral-500 bg-surface"
                    }`}>
                    <i className={`ti ${pm.icon} text-[14px] ${active ? "" : "text-neutral-600"}`} aria-hidden="true" />
                    <span className={`text-[12px] ${active ? "font-bold" : "font-medium text-neutral-700"}`}>{pm.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount + date */}
          <div className="mb-3.5 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
            <Field label="Amount Paid" required>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-neutral-500">₱</span>
                <Input type="number" min="0.01" step="0.01"
                  max={invoice ? parseFloat(invoice.balance ?? (parseFloat(invoice.net_amount ?? 0) - parseFloat(invoice.total_paid ?? 0))) : undefined}
                  value={form.amount_paid} onChange={(e) => setF("amount_paid", e.target.value)}
                  placeholder="0.00" className="pl-[26px] text-right" />
              </div>
              {invoice && balance > 0 && (
                <div className="mt-[5px] flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setF("amount_paid", String(balance))}
                    className="cursor-pointer rounded-[6px] border-none bg-brand-100 px-2.5 py-[3px] text-[11px] font-semibold text-brand-600">
                    Full balance {fmt(balance)}
                  </button>
                  {invoice.installments?.length > 0 && (() => {
                    const next    = invoice.installments.find((i) => i.status !== "paid" && i.status !== "voided");
                    if (!next) return null;
                    const nextBal = parseFloat(next.amount) - parseFloat(next.amount_paid);
                    return (
                      <button type="button" onClick={() => setF("amount_paid", String(nextBal))}
                        className="cursor-pointer rounded-[6px] border-none bg-info-50 px-2.5 py-[3px] text-[11px] font-semibold text-info-500">
                        Next installment {fmt(nextBal)}
                      </button>
                    );
                  })()}
                </div>
              )}
            </Field>
            <Field label="Payment Date" required>
              <Input type="date" value={form.payment_date} onChange={(e) => setF("payment_date", e.target.value)} />
            </Field>
          </div>

          {/* Reference + notes */}
          <Field label="Reference Number">
            <Input value={form.reference_number} onChange={(e) => setF("reference_number", e.target.value)} placeholder="Transaction ID, check no., etc." />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => setF("notes", e.target.value)} placeholder="Optional remarks…" rows={2} />
          </Field>
      </div>
    </Modal>
  );
}
