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
          <div style={{ marginBottom:16 }}>
            <div className="mb-1.5 block text-xs font-bold uppercase tracking-[0.07em] text-neutral-700">Invoice <span className="text-brand-600">*</span></div>
            {loadingInvoice ? <Skeleton height={52} /> : invoice ? (
              <div style={{ padding:"14px 16px", border:"1.5px solid #fde2de", borderRadius:12, background:"#fff8f6" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a", fontFamily:"monospace" }}>{invoice.invoice_no}</span>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <StatusBadge status={invoice.status} map={INVOICE_STATUS_MAP} size="sm" />
                    {!preloadedInvoiceId && (
                      <button onClick={() => setInvoice(null)} style={{ background:"transparent", border:"1px solid #fde2de", borderRadius:7, padding:"4px 8px", fontSize:11, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Change</button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{en?.student_name ?? `Enrollment #${invoice.enrollment_id}`}</div>
                <div style={{ fontSize:11, color:"#8a6a6a", marginTop:2 }}>{en?.grade_level} · {en?.section} · S.Y. {en?.school_year}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:12 }}>
                  {[
                    { label:"Total Due",  val:fmt(invoice.net_amount ?? 0), color:"#1a0a0a" },
                    { label:"Total Paid", val:fmt(invoice.total_paid ?? 0), color:"#2e6b0d" },
                    { label:"Balance",    val:fmt(balance),                  color:balance > 0 ? "#a32d2d" : "#2e6b0d" },
                  ].map((s) => (
                    <div key={s.label} style={{ textAlign:"center", padding:"10px 8px", background:"white", borderRadius:10, border:"1px solid #f5eaea" }}>
                      <div style={{ fontSize:14, fontWeight:700, color:s.color }}>{s.val}</div>
                      <div style={{ fontSize:10.5, color:"#8a6a6a", marginTop:3, textTransform:"uppercase", letterSpacing:"0.06em" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ position:"relative" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, background:"white", border:"1.5px solid #fde2de", borderRadius:10, padding:"0 14px", height:44 }}>
                  <i className="ti ti-search" style={{ fontSize:14, color:"#8a6a6a" }} />
                  <input placeholder="Search by invoice number or student name…" value={invoiceSearch}
                    onChange={(e) => { setInvoiceSearch(e.target.value); setDropdownOpen(true); }}
                    onFocus={() => setDropdownOpen(true)}
                    style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0a0a", outline:"none", fontFamily:"'DM Sans',sans-serif" }} />
                  {searching && <i className="ti ti-loader-2" style={{ fontSize:13, color:"#c92a2a", animation:"spin 1s linear infinite" }} />}
                </div>
                {dropdownOpen && invoiceSearch && (
                  <div style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:6, background:"white", borderRadius:10, border:"1px solid #fde2de", boxShadow:"0 12px 40px rgba(224,49,49,0.14)", maxHeight:220, overflowY:"auto", zIndex:1000 }}>
                    {invoiceResults.length === 0 && !searching && <div style={{ padding:"16px", textAlign:"center", color:"#8a6a6a", fontSize:13 }}>No invoices found.</div>}
                    {invoiceResults.map((inv) => {
                      if (inv.status === "void" || inv.status === "paid") return null;
                      const en = inv.enrollment_detail;
                      return (
                        <div key={inv.invoice_id} onClick={() => { setInvoice(inv); setDropdownOpen(false); setInvoiceSearch(""); }}
                          className="cursor-pointer border-b border-neutral-200/70 px-3.5 py-2.5 transition-colors hover:bg-brand-50">
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                            <span style={{ fontSize:12, fontWeight:700, color:"#1a0a0a", fontFamily:"monospace" }}>{inv.invoice_no}</span>
                            <StatusBadge status={inv.status} map={INVOICE_STATUS_MAP} size="sm" />
                          </div>
                          <div style={{ fontSize:12, color:"#5a4a4a", marginTop:2 }}>{en?.student_name ?? `Enrollment #${inv.enrollment_id}`} · {fmt(inv.balance ?? 0)} remaining</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment method */}
          <div style={{ marginBottom:16 }}>
            <div className="mb-1.5 block text-xs font-bold uppercase tracking-[0.07em] text-neutral-700">Payment Method <span className="text-brand-600">*</span></div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
              {PAYMENT_METHODS.map((pm) => {
                const active = form.payment_method === pm.value;
                return (
                  <button key={pm.value} type="button" onClick={() => setF("payment_method", pm.value)}
                    style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10, border:`1.5px solid ${active?pm.color:"#8a6a6a"}`, background:active?pm.bg:"white", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all .15s" }}>
                    <i className={`ti ${pm.icon}`} style={{ fontSize:14, color:active?pm.color:"#855c5c" }} />
                    <span style={{ fontSize:12, fontWeight:active?700:500, color:active?pm.color:"#7a5050" }}>{pm.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount + date */}
          <div style={{ display:"grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap:12, marginBottom:14 }}>
            <Field label="Amount Paid" required>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:13, color:"#8a6a6a", fontWeight:600 }}>₱</span>
                <Input type="number" min="0.01" step="0.01"
                  max={invoice ? parseFloat(invoice.balance ?? (parseFloat(invoice.net_amount ?? 0) - parseFloat(invoice.total_paid ?? 0))) : undefined}
                  value={form.amount_paid} onChange={(e) => setF("amount_paid", e.target.value)}
                  placeholder="0.00" className="pl-[26px] text-right" />
              </div>
              {invoice && balance > 0 && (
                <div style={{ marginTop:5, display:"flex", gap:6, flexWrap:"wrap" }}>
                  <button type="button" onClick={() => setF("amount_paid", String(balance))}
                    style={{ fontSize:11, color:"#c92a2a", background:"#fff0f0", border:"none", borderRadius:6, padding:"3px 10px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
                    Full balance {fmt(balance)}
                  </button>
                  {invoice.installments?.length > 0 && (() => {
                    const next    = invoice.installments.find((i) => i.status !== "paid" && i.status !== "voided");
                    if (!next) return null;
                    const nextBal = parseFloat(next.amount) - parseFloat(next.amount_paid);
                    return (
                      <button type="button" onClick={() => setF("amount_paid", String(nextBal))}
                        style={{ fontSize:11, color:"#1455a0", background:"#e3f0fd", border:"none", borderRadius:6, padding:"3px 10px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
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
