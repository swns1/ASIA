import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getVisibleNavGroups } from "../utils/navigation";
import { clearAuthSession } from "../utils/auth";

// ── API ───────────────────────────────────────────────────────────────────────
const BILLING_API = "http://localhost:8002/api";

function getToken() { return sessionStorage.getItem("access_token") || ""; }

async function apiCall(method, url, body = null) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
  const opts = { method, headers };
  if (body && method !== "GET") opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) { const e = await res.text(); throw new Error(`${res.status}: ${e}`); }
  if (method === "DELETE") return null;
  return res.json();
}

const getPayments   = (p = {}) => apiCall("GET",  `${BILLING_API}/payments/?${new URLSearchParams(p)}`);
const getInvoices   = (p = {}) => apiCall("GET",  `${BILLING_API}/invoices/?${new URLSearchParams(p)}`);
const getInvoice    = (id)     => apiCall("GET",  `${BILLING_API}/invoices/${id}/`);
const createPayment = (p)      => apiCall("POST", `${BILLING_API}/payments/`, p);

// ── NAV ───────────────────────────────────────────────────────────────────────
const NAV = [
  { section: "Main", items: [
    { label: "Dashboard",   icon: "ti-layout-dashboard", path: "/dashboard"   },
    { label: "Students",    icon: "ti-users",             path: "/students"    },
    { label: "Enrollments", icon: "ti-clipboard-list",    path: "/enrollments" },
    { label: "Subjects",    icon: "ti-book",              path: "/subjects"    },
    { label: "Grades",      icon: "ti-chart-bar",         path: "/grades"      },
  ]},
  { section: "Finance", items: [
    { label: "Invoices",     icon: "ti-receipt",  path: "/invoices"     },
    { label: "Payments",     icon: "ti-cash",     path: "/payments"     },
    { label: "Scholarships", icon: "ti-discount", path: "/scholarships" },
  ]},
  { section: "Settings", items: [
    { label: "Users",             icon: "ti-user-cog",         path: "/users"             },
    { label: "School Settings",   icon: "ti-settings",         path: "/settings"          },
    { label: "Grading Templates", icon: "ti-report-analytics", path: "/grading-templates" },
    { label: "Scholarship Types", icon: "ti-discount",         path: "/scholarship-types" },
    { label: "Fee Schedules",     icon: "ti-cash",             path: "/fee-schedules"     },
  ]},
];

// ── Constants ─────────────────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { value:"cash",          label:"Cash",          icon:"ti-cash",          color:"#2e6b0d", bg:"#e8f5e0" },
  { value:"gcash",         label:"GCash",         icon:"ti-device-mobile", color:"#1455a0", bg:"#e3f0fd" },
  { value:"bank_transfer", label:"Bank Transfer", icon:"ti-building-bank", color:"#7c3aed", bg:"#f0e8fd" },
  { value:"card",          label:"Card",          icon:"ti-credit-card",   color:"#d97706", bg:"#fdf5e8" },
  { value:"check",         label:"Check",         icon:"ti-file-text",     color:"#854f0b", bg:"#faeeda" },
  { value:"others",        label:"Others",        icon:"ti-dots",          color:"#5c5752", bg:"#f0ede8" },
];

const STATUS_META = {
  unpaid:         { label:"Unpaid",   color:"#a32d2d", bg:"#fde8e8" },
  partially_paid: { label:"Partial",  color:"#854f0b", bg:"#faeeda" },
  paid:           { label:"Paid",     color:"#2e6b0d", bg:"#e8f5e0" },
  void:           { label:"Void",     color:"#5c5752", bg:"#f0ede8" },
};

const PLAN_META = {
  monthly:     { label:"Monthly",     color:"#1455a0", bg:"#e3f0fd" },
  quarterly:   { label:"Quarterly",   color:"#2e6b0d", bg:"#e8f5e0" },
  semi_annual: { label:"Semi-Annual", color:"#7c3aed", bg:"#f0e8fd" },
  annual:      { label:"Annual",      color:"#d97706", bg:"#fdf5e8" },
};

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-PH", { month:"short", day:"numeric", year:"numeric" }) : "—";

const Sk = ({ w="100%", h=14, r=6 }) => (
  <div style={{ width:w, height:h, borderRadius:r, background:"linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.6s ease-in-out infinite" }} />
);

function LogoutModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"white", borderRadius:20, padding:"32px 36px", width:380, boxShadow:"0 24px 64px rgba(224,49,49,0.18)", display:"flex", flexDirection:"column", alignItems:"center", gap:14, animation:"slideUp 0.2s ease" }}>
        <div style={{ width:56, height:56, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <i className="ti ti-logout" style={{ fontSize:24, color:"#e03131" }} />
        </div>
        <div style={{ fontSize:17, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>Log out?</div>
        <div style={{ fontSize:13, color:"#7a5050", textAlign:"center", lineHeight:1.7 }}>You'll be returned to the login page. Any unsaved changes will be lost.</div>
        <div style={{ display:"flex", gap:10, width:"100%" }}>
          <button onClick={onCancel} style={{ flex:1, height:42, border:"1.5px solid #f0e0e0", borderRadius:10, background:"white", fontSize:13, color:"#7a5050", cursor:"pointer", fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>Stay</button>
          <button onClick={onConfirm} style={{ flex:1, height:42, border:"none", borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", fontSize:13, color:"white", cursor:"pointer", fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>Yes, logout</button>
        </div>
      </div>
    </div>
  );
}

// ── Record Payment Modal ──────────────────────────────────────────────────────
function RecordPaymentModal({ preloadedInvoiceId, onClose, onSaved }) {
  const [invoiceSearch,  setInvoiceSearch]  = useState("");
  const [invoiceResults, setInvoiceResults] = useState([]);
  const [searching,      setSearching]      = useState(false);
  const [invoice,        setInvoice]        = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [open,           setOpen]           = useState(false);

  const [form, setForm] = useState({
    amount_paid:      "",
    payment_method:   "cash",
    payment_date:     new Date().toISOString().slice(0, 10),
    reference_number: "",
    notes:            "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  // Pre-load invoice if navigated from invoices page
  useEffect(() => {
    if (!preloadedInvoiceId) return;
    setLoadingInvoice(true);
    getInvoice(preloadedInvoiceId)
      .then((inv) => setInvoice(inv))
      .catch(() => {})
      .finally(() => setLoadingInvoice(false));
  }, [preloadedInvoiceId]);

  // Search invoices
  useEffect(() => {
    if (!invoiceSearch.trim()) { setInvoiceResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await getInvoices({ search: invoiceSearch, page_size: 20 });
        setInvoiceResults(Array.isArray(data) ? data : data?.results ?? []);
      } catch { setInvoiceResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [invoiceSearch]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!invoice)                { setError("Select an invoice."); return; }
    if (!form.amount_paid || parseFloat(form.amount_paid) <= 0) { setError("Amount must be greater than 0."); return; }
    const balance = parseFloat(invoice.balance ?? 0);
    if (parseFloat(form.amount_paid) > balance + 0.01) { setError(`Amount exceeds balance of ${fmt(balance)}.`); return; }
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
    finally { setSaving(false); }
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
              <div style={{ fontSize:15, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>Record Payment</div>
              <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>Apply a payment to an invoice</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#c0a0a0", fontSize:20 }}><i className="ti ti-x" /></button>
        </div>

        <div style={{ padding:"22px 28px" }}>
          {error && <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#b91c1c", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}><i className="ti ti-alert-circle" style={{ fontSize:14 }} />{error}</div>}

          {/* Invoice selector */}
          <div style={{ marginBottom:16 }}>
            <label style={lbl}>Invoice *</label>
            {loadingInvoice ? <Sk h={52} /> :
             invoice ? (
              <div style={{ padding:"14px 16px", border:"1.5px solid #fde2de", borderRadius:12, background:"#fff8f6" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a", fontFamily:"monospace" }}>{invoice.invoice_no}</span>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:"2px 7px", borderRadius:99, background:statusMeta.bg, color:statusMeta.color }}>{statusMeta.label}</span>
                    {!preloadedInvoiceId && <button onClick={() => setInvoice(null)} style={{ background:"transparent", border:"1px solid #fde2de", borderRadius:7, padding:"4px 8px", fontSize:11, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Change</button>}
                  </div>
                </div>
                <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{en?.student_name ?? `Enrollment #${invoice.enrollment_id}`}</div>
                <div style={{ fontSize:11, color:"#b09090", marginTop:2 }}>{en?.grade_level} · {en?.section} · S.Y. {en?.school_year}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:12 }}>
                  {[
                    { label:"Total Due",     val:fmt(invoice.net_amount ?? 0),  color:"#1a0a0a" },
                    { label:"Total Paid",    val:fmt(invoice.total_paid ?? 0),  color:"#2e6b0d" },
                    { label:"Balance",       val:fmt(balance),                   color: balance > 0 ? "#a32d2d" : "#2e6b0d" },
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
                    onChange={(e) => { setInvoiceSearch(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0a0a", outline:"none", fontFamily:"'DM Sans',sans-serif" }} />
                  {searching && <i className="ti ti-loader-2" style={{ fontSize:13, color:"#e03131", animation:"spin 1s linear infinite" }} />}
                </div>
                {open && invoiceSearch && (
                  <div style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:6, background:"white", borderRadius:10, border:"1px solid #fde2de", boxShadow:"0 12px 40px rgba(224,49,49,0.14)", maxHeight:220, overflowY:"auto", zIndex:1000 }}>
                    {invoiceResults.length === 0 && !searching && <div style={{ padding:"16px", textAlign:"center", color:"#b09090", fontSize:13 }}>No invoices found.</div>}
                    {invoiceResults.map((inv) => {
                      const sm = STATUS_META[inv.status] ?? STATUS_META.unpaid;
                      if (inv.status === "void" || inv.status === "paid") return null;
                      const en = inv.enrollment_detail;
                      return (
                        <div key={inv.invoice_id} onClick={() => { setInvoice(inv); setOpen(false); setInvoiceSearch(""); }}
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
                <input type="number" min="0.01" step="0.01" max={balance} value={form.amount_paid}
                  onChange={(e) => setF("amount_paid", e.target.value)}
                  placeholder="0.00"
                  style={{ ...inp, paddingLeft:26, textAlign:"right" }} />
              </div>
              {invoice && balance > 0 && (
                <div style={{ marginTop:5, display:"flex", gap:6 }}>
                  <button type="button" onClick={() => setF("amount_paid", String(balance))}
                    style={{ fontSize:11, color:"#e03131", background:"#fff0f0", border:"none", borderRadius:6, padding:"3px 10px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
                    Full balance {fmt(balance)}
                  </button>
                  {invoice.installments && invoice.installments.length > 0 && (() => {
                    const next = invoice.installments.find((i) => i.status !== "paid");
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
            {saving ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:"spin 1s linear infinite" }} />Recording…</> : <><i className="ti ti-cash" style={{ fontSize:13 }} />Record Payment</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function PaymentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preloadedInvoiceId = searchParams.get("invoice") ? parseInt(searchParams.get("invoice")) : null;

  const [payments,      setPayments]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [page,          setPage]          = useState(1);
  const [pageMeta,      setPageMeta]      = useState({ count:0, next:null, previous:null });
  const [methodFilter,  setMethodFilter]  = useState("all");
  const [showModal,     setShowModal]     = useState(Boolean(preloadedInvoiceId));
  const [showLogout,    setShowLogout]    = useState(false);
  const [refreshKey,    setRefreshKey]    = useState(0);

  // Totals
  const totalCollected = payments.reduce((s, p) => s + parseFloat(p.amount_paid), 0);

  const fetchPayments = useCallback(async (p = 1, method = methodFilter) => {
    setLoading(true);
    try {
      const params = { page: p };
      if (method !== "all") params.payment_method = method;
      const data = await getPayments(params);
      setPayments(Array.isArray(data) ? data : data?.results ?? []);
      setPageMeta({ count: data.count ?? 0, next: data.next, previous: data.previous });
      setPage(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [methodFilter]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchPayments();
  }, [refreshKey]);

  const totalPages = Math.ceil(pageMeta.count / 20);

  const methodColors = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, { color:m.color, bg:m.bg, icon:m.icon }]));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes rowIn   { from{opacity:0;transform:translateX(-4px)} to{opacity:1;transform:translateX(0)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }
        .nav-item { transition:background 0.12s,color 0.12s; }
        .nav-item:hover { background:#fff4f4 !important; color:#e03131 !important; }
        .nav-active { background:#fff0f0 !important; color:#e03131 !important; font-weight:600 !important; }
        .pay-row { transition:background 0.12s; }
        .pay-row:hover td { background:#fff8f6 !important; }
        .chip-btn { display:flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:99px;border:1.5px solid #f0e4e4;background:white;font-size:11.5px;color:#9a7070;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;transition:all 0.14s; }
        .chip-btn:hover { border-color:#fca5a5;color:#e03131;background:#fff8f6; }
        .chip-btn.active { background:#fff0f0;border-color:#e03131;color:#e03131;font-weight:700; }
      `}</style>

      <div style={{ display:"flex", height:"100vh", background:"#fdf8f6", fontFamily:"'DM Sans',sans-serif", overflow:"hidden" }}>

        {/* Sidebar */}
        <aside style={{ width:224, flexShrink:0, background:"white", borderRight:"1px solid #f5eaea", display:"flex", flexDirection:"column", boxShadow:"2px 0 12px rgba(224,49,49,0.04)" }}>
          <div style={{ padding:"22px 18px 18px", borderBottom:"1px solid #f5eaea" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 12px rgba(224,49,49,0.3)" }}>
                <i className="ti ti-school" style={{ fontSize:17, color:"white" }} />
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>South Lakes IS</div>
                <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>Admin Portal</div>
              </div>
            </div>
          </div>
          <nav style={{ flex:1, padding:"14px 10px", display:"flex", flexDirection:"column", gap:2, overflowY:"auto" }}>
            {getVisibleNavGroups(NAV).map((group) => (
              <div key={group.section} style={{ marginBottom:6 }}>
                <div style={{ fontSize:9.5, color:"#cdb0b0", letterSpacing:"0.1em", textTransform:"uppercase", padding:"10px 10px 4px", fontWeight:600 }}>{group.section}</div>
                {group.items.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <div key={item.path} className={`nav-item${active?" nav-active":""}`}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:9, fontSize:13, color:active?"#e03131":"#7a5a5a", cursor:"pointer" }}
                      onClick={() => navigate(item.path)} role="button" tabIndex={0}
                      onKeyDown={(e) => e.key==="Enter" && navigate(item.path)}>
                      <i className={`ti ${item.icon}`} style={{ fontSize:16, width:20, textAlign:"center" }} />
                      {item.label}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>
          <div style={{ padding:"14px 10px", borderTop:"1px solid #f5eaea" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px", borderRadius:10, background:"#fff8f6" }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#fde8e8,#fca5a5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#e03131", flexShrink:0 }}>SA</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>Super Admin</div>
                <div style={{ fontSize:11, color:"#b09090" }}>super_admin</div>
              </div>
              <button title="Logout" onClick={() => setShowLogout(true)}
                style={{ width:30, height:30, border:"1px solid #f0e4e4", borderRadius:8, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#c09090", transition:"all 0.12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background="#fff0f0"; e.currentTarget.style.color="#e03131"; e.currentTarget.style.borderColor="#fca5a5"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background="white"; e.currentTarget.style.color="#c09090"; e.currentTarget.style.borderColor="#f0e4e4"; }}>
                <i className="ti ti-logout" style={{ fontSize:14 }} />
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Topbar */}
          <div style={{ background:"white", borderBottom:"1px solid #f5eaea", padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>Payments</div>
              <div style={{ fontSize:11.5, color:"#b09090", marginTop:1 }}>
                {loading ? "Loading…" : `${pageMeta.count} transactions · ${fmt(totalCollected)} collected this page`}
              </div>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => navigate("/invoices")}
                style={{ display:"inline-flex", alignItems:"center", gap:6, background:"white", color:"#7a5050", border:"1.5px solid #f0e4e4", borderRadius:10, padding:"8px 16px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.14s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor="#fca5a5"; e.currentTarget.style.color="#e03131"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor="#f0e4e4"; e.currentTarget.style.color="#7a5050"; }}>
                <i className="ti ti-receipt" style={{ fontSize:13 }} />View Invoices
              </button>
              <button onClick={() => setShowModal(true)}
                style={{ display:"inline-flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#2e6b0d,#256009)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(46,107,13,0.26)" }}>
                <i className="ti ti-cash" style={{ fontSize:15 }} />Record Payment
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Method totals */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,minmax(0,1fr))", gap:10 }}>
              {PAYMENT_METHODS.map((pm) => {
                const total = payments.filter((p) => p.payment_method === pm.value).reduce((s, p) => s + parseFloat(p.amount_paid), 0);
                return (
                  <div key={pm.value} style={{ background:"white", borderRadius:12, border:"1px solid #f5eaea", padding:"12px 14px", boxShadow:"0 2px 8px rgba(224,49,49,0.04)", textAlign:"center" }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:pm.bg, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 8px" }}>
                      <i className={`ti ${pm.icon}`} style={{ fontSize:15, color:pm.color }} />
                    </div>
                    {loading ? <Sk w={60} h={14} /> : <div style={{ fontSize:13, fontWeight:700, color:pm.color }}>{fmt(total)}</div>}
                    <div style={{ fontSize:10.5, color:"#b09090", marginTop:3, textTransform:"uppercase", letterSpacing:"0.05em" }}>{pm.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Method filter + table */}
            <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}>

              {/* Filter row */}
              <div style={{ padding:"12px 18px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <span style={{ fontSize:10.5, color:"#cdb0b0", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", marginRight:4 }}>Method</span>
                <button className={`chip-btn${methodFilter==="all"?" active":""}`} onClick={() => { setMethodFilter("all"); fetchPayments(1, "all"); }}>All</button>
                {PAYMENT_METHODS.map((pm) => (
                  <button key={pm.value} className={`chip-btn${methodFilter===pm.value?" active":""}`}
                    onClick={() => { setMethodFilter(pm.value); fetchPayments(1, pm.value); }}>
                    <i className={`ti ${pm.icon}`} style={{ fontSize:11 }} />{pm.label}
                  </button>
                ))}
              </div>

              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:"#fdfafa" }}>
                    {["Date","Invoice","Student","Amount","Method","Reference","Notes"].map((h) => (
                      <th key={h} style={{ textAlign:"left", fontSize:10.5, fontWeight:600, color:"#c0a0a0", padding:"12px 18px", borderBottom:"1px solid #f5eaea", textTransform:"uppercase", letterSpacing:"0.07em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>
                          {[80,100,130,80,70,90,80].map((w, j) => (
                            <td key={j} style={{ padding:"12px 18px", borderBottom:"1px solid #f9f0f0" }}><Sk w={w} h={13} /></td>
                          ))}
                        </tr>
                      ))
                    : payments.length === 0
                      ? <tr><td colSpan={7} style={{ textAlign:"center", padding:"56px", color:"#b09090", fontSize:13, fontStyle:"italic" }}>No payments recorded yet.</td></tr>
                      : payments.map((p, idx) => {
                          const mc = methodColors[p.payment_method] ?? { color:"#5c5752", bg:"#f0ede8", icon:"ti-dots" };
                          return (
                            <tr key={p.payment_id} className="pay-row" style={{ animation:`rowIn 0.18s ease both`, animationDelay:`${idx*15}ms` }}>
                              <td style={{ padding:"11px 18px", borderBottom:"1px solid #f9f0f0", color:"#5a4a4a", whiteSpace:"nowrap" }}>{fmtDate(p.payment_date)}</td>
                              <td style={{ padding:"11px 18px", borderBottom:"1px solid #f9f0f0" }}>
                                <button onClick={() => navigate(`/invoices?selected=${p.invoice}`)}
                                  style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"monospace", fontSize:12, color:"#e03131", fontWeight:700, textDecoration:"underline", padding:0 }}>
                                  #{p.invoice}
                                </button>
                              </td>
                              <td style={{ padding:"11px 18px", borderBottom:"1px solid #f9f0f0", color:"#1a0a0a", fontSize:12 }}>
                                {p.invoice_detail?.student_name ?? "—"}
                              </td>
                              <td style={{ padding:"11px 18px", borderBottom:"1px solid #f9f0f0", fontWeight:700, color:"#2e6b0d" }}>{fmt(p.amount_paid)}</td>
                              <td style={{ padding:"11px 18px", borderBottom:"1px solid #f9f0f0" }}>
                                <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, padding:"3px 8px", borderRadius:99, background:mc.bg, color:mc.color }}>
                                  <i className={`ti ${mc.icon}`} style={{ fontSize:11 }} />
                                  {p.payment_method.replace("_", " ")}
                                </span>
                              </td>
                              <td style={{ padding:"11px 18px", borderBottom:"1px solid #f9f0f0", color:"#5a4a4a", fontFamily:"monospace", fontSize:12 }}>{p.reference_number || "—"}</td>
                              <td style={{ padding:"11px 18px", borderBottom:"1px solid #f9f0f0", color:"#7a5050", fontSize:12 }}>{p.notes || "—"}</td>
                            </tr>
                          );
                        })
                  }
                </tbody>
              </table>

              {/* Pagination */}
              {!loading && pageMeta.count > 20 && (
                <div style={{ padding:"12px 18px", borderTop:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#fdfafa" }}>
                  <span style={{ fontSize:12, color:"#b09090" }}>Page {page} of {totalPages} · {pageMeta.count} total</span>
                  <div style={{ display:"flex", gap:4 }}>
                    <button disabled={!pageMeta.previous} onClick={() => fetchPayments(page - 1)}
                      style={{ width:30, height:30, border:"1px solid #f0e4e4", borderRadius:8, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070" }}>
                      <i className="ti ti-chevron-left" style={{ fontSize:13 }} />
                    </button>
                    <button disabled={!pageMeta.next} onClick={() => fetchPayments(page + 1)}
                      style={{ width:30, height:30, border:"1px solid #f0e4e4", borderRadius:8, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070" }}>
                      <i className="ti ti-chevron-right" style={{ fontSize:13 }} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <RecordPaymentModal
          preloadedInvoiceId={preloadedInvoiceId}
          onClose={() => setShowModal(false)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {showLogout && (
        <LogoutModal
          onConfirm={() => { clearAuthSession(); navigate("/"); }}
          onCancel={() => setShowLogout(false)}
        />
      )}
    </>
  );
}
