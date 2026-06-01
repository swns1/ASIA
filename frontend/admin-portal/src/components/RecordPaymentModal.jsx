import { useState, useEffect } from "react";

import {
  getInvoice as _getInvoice,
  getInvoices as _getInvoices,
  createPayment as _createPayment,
} from "../api/billingApi";
const getInvoice    = (id)  => _getInvoice(id);
const getInvoices   = (p={})=> _getInvoices(p);
const createPayment = (p)   => _createPayment(p);

const PAYMENT_METHODS = [
  { value:"cash",          label:"Cash",          icon:"ti-cash",          color:"#2e6b0d", bg:"#e8f5e0" },
  { value:"gcash",         label:"GCash",         icon:"ti-device-mobile", color:"#1455a0", bg:"#e3f0fd" },
  { value:"bank_transfer", label:"Bank Transfer", icon:"ti-building-bank", color:"#7c3aed", bg:"#f0e8fd" },
  { value:"card",          label:"Card",          icon:"ti-credit-card",   color:"#d97706", bg:"#fdf5e8" },
  { value:"check",         label:"Check",         icon:"ti-file-text",     color:"#854f0b", bg:"#faeeda" },
  { value:"others",        label:"Others",        icon:"ti-dots",          color:"#5c5752", bg:"#f0ede8" },
];

const STATUS_META = {
  unpaid:         { label:"Unpaid",  color:"#a32d2d", bg:"#fde8e8" },
  partially_paid: { label:"Partial", color:"#854f0b", bg:"#faeeda" },
  paid:           { label:"Paid",    color:"#2e6b0d", bg:"#e8f5e0" },
  void:           { label:"Void",    color:"#5c5752", bg:"#f0ede8" },
};

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
const Sk  = ({ w="100%", h=14, r=6 }) => (
  <div style={{ width:w, height:h, borderRadius:r, background:"linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.6s ease-in-out infinite" }} />
);

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
    payment_date:     new Date().toISOString().slice(0, 10),
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
      .catch(() => {})
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
      onSaved();
      onClose();
    } catch (e) { setError(e.message || "Failed to record payment."); }
    finally     { setSaving(false); }
  };

  const inp = { width:"100%", border:"1.5px solid #fde2de", borderRadius:10, padding:"10px 14px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a", background:"#fffbfb", outline:"none", boxSizing:"border-box" };
  const lbl = { display:"block", fontSize:10.5, fontWeight:700, color:"#7a5050", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:6 };

  const balance    = invoice ? parseFloat(invoice.balance ?? 0) : 0;
  const en         = invoice?.enrollment_detail;
  const statusMeta = invoice ? STATUS_META[invoice.status] ?? STATUS_META.unpaid : null;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"white", borderRadius:20, width:540, maxHeight:"92vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(224,49,49,0.18)", animation:"slideUp 0.2s ease" }}>

        {/* Header */}
        <div style={{ padding:"22px 28px 18px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(to right,#fdfafa,white)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"#e8f5e0", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <i className="ti ti-cash" style={{ fontSize:18, color:"#2e6b0d" }} />
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:"#1a0a0a" }}>Record Payment</div>
              <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>Apply a payment to an invoice</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#c0a0a0", fontSize:20 }}><i className="ti ti-x" /></button>
        </div>

        <div style={{ padding:"22px 28px" }}>
          {error && (
            <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#b91c1c", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
              <i className="ti ti-alert-circle" style={{ fontSize:14 }} />{error}
            </div>
          )}

          {/* Invoice selector */}
          <div style={{ marginBottom:16 }}>
            <label style={lbl}>Invoice *</label>
            {loadingInvoice ? <Sk h={52} /> : invoice ? (
              <div style={{ padding:"14px 16px", border:"1.5px solid #fde2de", borderRadius:12, background:"#fff8f6" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a", fontFamily:"monospace" }}>{invoice.invoice_no}</span>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:"2px 7px", borderRadius:99, background:statusMeta.bg, color:statusMeta.color }}>{statusMeta.label}</span>
                    {!preloadedInvoiceId && (
                      <button onClick={() => setInvoice(null)} style={{ background:"transparent", border:"1px solid #fde2de", borderRadius:7, padding:"4px 8px", fontSize:11, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Change</button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{en?.student_name ?? `Enrollment #${invoice.enrollment_id}`}</div>
                <div style={{ fontSize:11, color:"#b09090", marginTop:2 }}>{en?.grade_level} · {en?.section} · S.Y. {en?.school_year}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:12 }}>
                  {[
                    { label:"Total Due",  val:fmt(invoice.net_amount ?? 0), color:"#1a0a0a" },
                    { label:"Total Paid", val:fmt(invoice.total_paid ?? 0), color:"#2e6b0d" },
                    { label:"Balance",    val:fmt(balance),                  color:balance > 0 ? "#a32d2d" : "#2e6b0d" },
                  ].map((s) => (
                    <div key={s.label} style={{ textAlign:"center", padding:"10px 8px", background:"white", borderRadius:10, border:"1px solid #f5eaea" }}>
                      <div style={{ fontSize:14, fontWeight:700, color:s.color }}>{s.val}</div>
                      <div style={{ fontSize:10.5, color:"#b09090", marginTop:3, textTransform:"uppercase", letterSpacing:"0.06em" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ position:"relative" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, background:"white", border:"1.5px solid #fde2de", borderRadius:10, padding:"0 14px", height:44 }}>
                  <i className="ti ti-search" style={{ fontSize:14, color:"#c0a0a0" }} />
                  <input placeholder="Search by invoice number or student name…" value={invoiceSearch}
                    onChange={(e) => { setInvoiceSearch(e.target.value); setDropdownOpen(true); }}
                    onFocus={() => setDropdownOpen(true)}
                    style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0a0a", outline:"none", fontFamily:"'DM Sans',sans-serif" }} />
                  {searching && <i className="ti ti-loader-2" style={{ fontSize:13, color:"#e03131", animation:"spin 1s linear infinite" }} />}
                </div>
                {dropdownOpen && invoiceSearch && (
                  <div style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:6, background:"white", borderRadius:10, border:"1px solid #fde2de", boxShadow:"0 12px 40px rgba(224,49,49,0.14)", maxHeight:220, overflowY:"auto", zIndex:1000 }}>
                    {invoiceResults.length === 0 && !searching && <div style={{ padding:"16px", textAlign:"center", color:"#b09090", fontSize:13 }}>No invoices found.</div>}
                    {invoiceResults.map((inv) => {
                      if (inv.status === "void" || inv.status === "paid") return null;
                      const sm = STATUS_META[inv.status] ?? STATUS_META.unpaid;
                      const en = inv.enrollment_detail;
                      return (
                        <div key={inv.invoice_id} onClick={() => { setInvoice(inv); setDropdownOpen(false); setInvoiceSearch(""); }}
                          style={{ padding:"10px 14px", cursor:"pointer", borderBottom:"1px solid #f9f0f0" }}
                          onMouseEnter={(e) => e.currentTarget.style.background="#fff8f6"}
                          onMouseLeave={(e) => e.currentTarget.style.background="transparent"}>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                            <span style={{ fontSize:12, fontWeight:700, color:"#1a0a0a", fontFamily:"monospace" }}>{inv.invoice_no}</span>
                            <span style={{ fontSize:10.5, fontWeight:700, padding:"2px 6px", borderRadius:99, background:sm.bg, color:sm.color }}>{sm.label}</span>
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
            <label style={lbl}>Payment Method *</label>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
              {PAYMENT_METHODS.map((pm) => {
                const active = form.payment_method === pm.value;
                return (
                  <button key={pm.value} type="button" onClick={() => setF("payment_method", pm.value)}
                    style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10, border:`1.5px solid ${active?pm.color:"#f0e4e4"}`, background:active?pm.bg:"white", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all .15s" }}>
                    <i className={`ti ${pm.icon}`} style={{ fontSize:14, color:active?pm.color:"#9a7070" }} />
                    <span style={{ fontSize:12, fontWeight:active?700:500, color:active?pm.color:"#7a5050" }}>{pm.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount + date */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
            <div>
              <label style={lbl}>Amount Paid *</label>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:13, color:"#b09090", fontWeight:600 }}>₱</span>
                <input type="number" min="0.01" step="0.01"
                  max={invoice ? parseFloat(invoice.balance ?? (parseFloat(invoice.net_amount ?? 0) - parseFloat(invoice.total_paid ?? 0))) : undefined}
                  value={form.amount_paid} onChange={(e) => setF("amount_paid", e.target.value)}
                  placeholder="0.00" style={{ ...inp, paddingLeft:26, textAlign:"right" }} />
              </div>
              {invoice && balance > 0 && (
                <div style={{ marginTop:5, display:"flex", gap:6, flexWrap:"wrap" }}>
                  <button type="button" onClick={() => setF("amount_paid", String(balance))}
                    style={{ fontSize:11, color:"#e03131", background:"#fff0f0", border:"none", borderRadius:6, padding:"3px 10px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
                    Full balance {fmt(balance)}
                  </button>
                  {invoice.installments?.length > 0 && (() => {
                    const next    = invoice.installments.find((i) => i.status !== "paid");
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
            </div>
            <div>
              <label style={lbl}>Payment Date *</label>
              <input type="date" value={form.payment_date} onChange={(e) => setF("payment_date", e.target.value)} style={inp} />
            </div>
          </div>

          {/* Reference + notes */}
          <div style={{ marginBottom:14 }}>
            <label style={lbl}>Reference Number</label>
            <input value={form.reference_number} onChange={(e) => setF("reference_number", e.target.value)} placeholder="Transaction ID, check no., etc." style={inp} />
          </div>
          <div>
            <label style={lbl}>Notes</label>
            <textarea value={form.notes} onChange={(e) => setF("notes", e.target.value)} placeholder="Optional remarks…" rows={2} style={{ ...inp, resize:"vertical" }} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"16px 28px 24px", display:"flex", justifyContent:"flex-end", gap:10, borderTop:"1px solid #f5eaea" }}>
          <button onClick={onClose} style={{ background:"transparent", color:"#9a7070", border:"1.5px solid #fde2de", borderRadius:50, padding:"9px 22px", fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !invoice}
            style={{ background:saving?"#e87474":"linear-gradient(135deg,#2e6b0d,#256009)", color:"white", border:"none", borderRadius:50, padding:"9px 24px", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:saving||!invoice?"not-allowed":"pointer", display:"inline-flex", alignItems:"center", gap:8, boxShadow:"0 4px 16px rgba(46,107,13,0.26)", opacity:!invoice?0.6:1 }}>
            {saving
              ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:"spin 1s linear infinite" }} />Recording…</>
              : <><i className="ti ti-cash" style={{ fontSize:13 }} />Record Payment</>}
          </button>
        </div>
      </div>
    </div>
  );
}
