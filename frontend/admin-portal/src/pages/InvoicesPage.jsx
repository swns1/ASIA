import { useState, useEffect, useCallback } from "react";
import AppLayout from "../components/AppLayout";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";


// ── API ───────────────────────────────────────────────────────────────────────
const BILLING_API    = "http://localhost:8002/api";
const ENROLLMENT_API = "http://localhost:8003/api";

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

const getInvoices     = (p = {}) => apiCall("GET",  `${BILLING_API}/invoices/?${new URLSearchParams(p)}`);
const getInvoice      = (id)     => apiCall("GET",  `${BILLING_API}/invoices/${id}/`);
const getBreakdown    = (id)     => apiCall("GET",  `${BILLING_API}/invoices/${id}/breakdown/`);
const generateInvoice = (p)      => apiCall("POST", `${BILLING_API}/invoices/generate/`, p);
const voidInvoice     = (id)     => apiCall("PATCH",`${BILLING_API}/invoices/${id}/`, { status: "void" });
const getEnrollments  = (p = {}) => apiCall("GET",  `${ENROLLMENT_API}/enrollments/?${new URLSearchParams(p)}`);

// ── NAV ───────────────────────────────────────────────────────────────────────

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_META = {
  unpaid:         { label:"Unpaid",         color:"#a32d2d", bg:"#fde8e8" },
  partially_paid: { label:"Partial",        color:"#854f0b", bg:"#faeeda" },
  paid:           { label:"Paid",           color:"#2e6b0d", bg:"#e8f5e0" },
  void:           { label:"Void",           color:"#5c5752", bg:"#f0ede8" },
};

const PLAN_META = {
  monthly:     { label:"Monthly",     color:"#1455a0", bg:"#e3f0fd" },
  quarterly:   { label:"Quarterly",   color:"#2e6b0d", bg:"#e8f5e0" },
  semi_annual: { label:"Semi-Annual", color:"#7c3aed", bg:"#f0e8fd" },
  annual:      { label:"Annual",      color:"#d97706", bg:"#fdf5e8" },
};

const CATEGORY_META = {
  tuition: { label:"Tuition",       color:"#e03131" },
  misc:    { label:"Miscellaneous", color:"#1455a0" },
  other:   { label:"Other",         color:"#2e6b0d" },
};

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-PH", { month:"short", day:"numeric", year:"numeric" }) : "—";

const Sk = ({ w="100%", h=14, r=6 }) => (
  <div style={{ width:w, height:h, borderRadius:r, background:"linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.6s ease-in-out infinite" }} />
);


// ── Generate Invoice Modal ────────────────────────────────────────────────────
function GenerateModal({ onClose, onGenerated }) {
  const [search,      setSearch]      = useState("");
  const [enrollments, setEnrollments] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [plan,        setPlan]        = useState("monthly");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");
  const [open,        setOpen]        = useState(false);

  useEffect(() => {
    if (!search.trim()) { setEnrollments([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await getEnrollments({ search, enrollment_status: "enrolled", page_size: 30 });
        setEnrollments(Array.isArray(data) ? data : data?.results ?? []);
      } catch { setEnrollments([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const handleGenerate = async () => {
    if (!selected) { setError("Select an enrollment."); return; }
    setSaving(true); setError("");
    try {
      const inv = await generateInvoice({ enrollment_id: selected.enrollment_id, payment_plan: plan });
      onGenerated(inv);
      onClose();
    } catch (e) { setError(e.message || "Failed to generate."); }
    finally { setSaving(false); }
  };

  const inp = { width:"100%", border:"1.5px solid #fde2de", borderRadius:10, padding:"10px 14px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a", background:"#fffbfb", outline:"none", boxSizing:"border-box" };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"white", borderRadius:20, width:500, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(224,49,49,0.18)", animation:"slideUp 0.2s ease" }}>
        <div style={{ padding:"22px 28px 18px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(to right,#fdfafa,white)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <i className="ti ti-receipt" style={{ fontSize:18, color:"#e03131" }} />
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:"#1a0a0a"}}>Generate Invoice</div>
              <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>Auto-creates invoice from fee schedule + scholarships</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#c0a0a0", fontSize:20 }}><i className="ti ti-x" /></button>
        </div>
        <div style={{ padding:"22px 28px" }}>
          {error && <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#b91c1c", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}><i className="ti ti-alert-circle" style={{ fontSize:14 }} />{error}</div>}

          {/* Search enrollment */}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:10.5, fontWeight:700, color:"#7a5050", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:6 }}>Enrollment *</label>
            {selected ? (
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", border:"1.5px solid #fde2de", borderRadius:10, background:"#fff8f6" }}>
                <i className="ti ti-clipboard-list" style={{ fontSize:16, color:"#e03131" }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{selected.student_name ?? `Enrollment #${selected.enrollment_id}`}</div>
                  <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>S.Y. {selected.school_year} · {selected.grade_level} · {selected.section}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background:"transparent", border:"1px solid #fde2de", borderRadius:7, padding:"5px 10px", fontSize:12, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Change</button>
              </div>
            ) : (
              <div style={{ position:"relative" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, background:"white", border:"1.5px solid #fde2de", borderRadius:10, padding:"0 14px", height:44 }}>
                  <i className="ti ti-search" style={{ fontSize:14, color:"#c0a0a0" }} />
                  <input placeholder="Search by student name, LRN, or grade…" value={search}
                    onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0a0a", outline:"none", fontFamily:"'DM Sans',sans-serif" }} />
                  {loading && <i className="ti ti-loader-2" style={{ fontSize:13, color:"#e03131", animation:"spin 1s linear infinite" }} />}
                </div>
                {open && search && (
                  <div style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:6, background:"white", borderRadius:10, border:"1px solid #fde2de", boxShadow:"0 12px 40px rgba(224,49,49,0.14)", maxHeight:220, overflowY:"auto", zIndex:1000 }}>
                    {enrollments.length === 0 && !loading && <div style={{ padding:"16px", textAlign:"center", color:"#b09090", fontSize:13 }}>No enrolled students found.</div>}
                    {enrollments.map((en) => (
                      <div key={en.enrollment_id} onClick={() => { setSelected(en); setOpen(false); setSearch(""); }}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", cursor:"pointer", borderBottom:"1px solid #f9f0f0" }}
                        onMouseEnter={(e) => e.currentTarget.style.background="#fff8f6"}
                        onMouseLeave={(e) => e.currentTarget.style.background="transparent"}>
                        <i className="ti ti-clipboard-list" style={{ fontSize:14, color:"#e03131" }} />
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{en.student_name ?? `Enrollment #${en.enrollment_id}`}</div>
                          <div style={{ fontSize:11, color:"#b09090" }}>S.Y. {en.school_year} · {en.grade_level} · {en.section}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment plan */}
          <div style={{ marginBottom:6 }}>
            <label style={{ display:"block", fontSize:10.5, fontWeight:700, color:"#7a5050", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:8 }}>Payment Plan *</label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {Object.entries(PLAN_META).map(([val, meta]) => {
                const active = plan === val;
                const discountNote = val === "semi_annual" ? " · 3% off tuition" : val === "annual" ? " · 5% off tuition" : "";
                return (
                  <button key={val} type="button" onClick={() => setPlan(val)}
                    style={{ padding:"12px 14px", borderRadius:12, border:`1.5px solid ${active?meta.color:"#f0e4e4"}`, background:active?meta.bg:"white", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textAlign:"left", transition:"all .15s" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:active?meta.color:"#1a0a0a" }}>{meta.label}</div>
                    <div style={{ fontSize:11, color:active?meta.color:"#b09090", marginTop:2, opacity:0.85 }}>
                      {val === "monthly" ? "10 installments (Jun–Mar)" : val === "quarterly" ? "4 installments" : val === "semi_annual" ? "2 installments" : "1 installment"}
                      {discountNote}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ padding:"16px 28px 24px", display:"flex", justifyContent:"flex-end", gap:10, borderTop:"1px solid #f5eaea" }}>
          <button onClick={onClose} style={{ background:"transparent", color:"#9a7070", border:"1.5px solid #fde2de", borderRadius:50, padding:"9px 22px", fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>Cancel</button>
          <button onClick={handleGenerate} disabled={saving}
            style={{ background:saving?"#e87474":"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:50, padding:"9px 24px", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:saving?"not-allowed":"pointer", display:"inline-flex", alignItems:"center", gap:8, boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}>
            {saving ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:"spin 1s linear infinite" }} />Generating…</> : <><i className="ti ti-receipt" style={{ fontSize:13 }} />Generate Invoice</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Invoice Detail ────────────────────────────────────────────────────────────
function InvoiceDetail({ invoiceId, onVoided }) {
  const navigate = useNavigate();
  const [invoice,    setInvoice]    = useState(null);
  const [breakdown,  setBreakdown]  = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [voiding,    setVoiding]    = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [tab,        setTab]        = useState("breakdown");

  useEffect(() => {
    setLoading(true); setInvoice(null); setBreakdown(null);
    Promise.all([getInvoice(invoiceId), getBreakdown(invoiceId)])
      .then(([inv, bd]) => { setInvoice(inv); setBreakdown(bd); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const handleVoid = async () => {
    setVoiding(true);
    try { await voidInvoice(invoiceId); onVoided(); }
    catch (e) { console.error(e); }
    finally { setVoiding(false); setShowVoidConfirm(false); }
  };

  if (loading) return (
    <div style={{ padding:"24px", display:"flex", flexDirection:"column", gap:14 }}>
      <Sk h={60} /><Sk h={200} /><Sk h={120} />
    </div>
  );

  if (!invoice) return (
    <div style={{ padding:"40px", textAlign:"center", color:"#b09090", fontSize:13, fontStyle:"italic" }}>Failed to load invoice.</div>
  );

  const en         = invoice.enrollment_detail;
  const statusMeta = STATUS_META[invoice.status] ?? STATUS_META.unpaid;
  const planMeta   = PLAN_META[invoice.payment_plan] ?? PLAN_META.monthly;
  const totalPaid  = parseFloat(invoice.total_paid ?? 0);
  const balance    = parseFloat(invoice.balance ?? 0);
  const netAmount  = parseFloat(invoice.net_amount ?? 0);
  const paidPct    = netAmount > 0 ? Math.min((totalPaid / netAmount) * 100, 100) : 0;

  const tuitionItems = (invoice.items ?? []).filter((i) => i.description.includes("[Tuition]"));
  const miscItems    = (invoice.items ?? []).filter((i) => i.description.includes("[Miscellaneous]") || i.description.includes("[Misc]"));
  const otherItems   = (invoice.items ?? []).filter((i) => i.description.includes("[Other]"));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Header */}
      <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"18px 22px", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <span style={{ fontSize:18, fontWeight:700, color:"#1a0a0a"}}>{invoice.invoice_no}</span>
              <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:99, background:statusMeta.bg, color:statusMeta.color }}>{statusMeta.label}</span>
              <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:99, background:planMeta.bg, color:planMeta.color }}>{planMeta.label}</span>
              {invoice.recalculated_at && <span style={{ fontSize:10, color:"#b09090", fontStyle:"italic" }}>Recalculated {fmtDate(invoice.recalculated_at)}</span>}
            </div>
            {en && (
              <div style={{ fontSize:13, color:"#5a4a4a" }}>
                <span style={{ fontWeight:600 }}>{en.student_name}</span>
                <span style={{ color:"#b09090" }}> · LRN {en.lrn} · {en.grade_level} · {en.section} · S.Y. {en.school_year}</span>
              </div>
            )}
            <div style={{ fontSize:12, color:"#b09090", marginTop:4 }}>Issued {fmtDate(invoice.invoice_date)} · Next due: {fmtDate(invoice.due_date)}</div>
          </div>
          {invoice.status !== "void" && (
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => navigate(`/payments?invoice=${invoiceId}`)}
                style={{ display:"inline-flex", alignItems:"center", gap:6, background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 14px rgba(224,49,49,0.26)" }}>
                <i className="ti ti-cash" style={{ fontSize:13 }} />Record Payment
              </button>
              <button onClick={() => setShowVoidConfirm(true)}
                style={{ display:"inline-flex", alignItems:"center", gap:6, background:"white", color:"#9a7070", border:"1px solid #f0e4e4", borderRadius:10, padding:"8px 14px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                <i className="ti ti-ban" style={{ fontSize:13 }} />Void
              </button>
            </div>
          )}
        </div>

        {/* Balance bar */}
        <div style={{ marginTop:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
            <div>
              <span style={{ fontSize:11, color:"#b09090" }}>Total paid </span>
              <span style={{ fontSize:14, fontWeight:700, color:"#2e6b0d" }}>{fmt(totalPaid)}</span>
              <span style={{ fontSize:11, color:"#b09090" }}> of {fmt(netAmount)}</span>
            </div>
            <div>
              <span style={{ fontSize:11, color:"#b09090" }}>Balance </span>
              <span style={{ fontSize:14, fontWeight:700, color: balance > 0 ? "#a32d2d" : "#2e6b0d" }}>{fmt(balance)}</span>
            </div>
          </div>
          <div style={{ height:8, borderRadius:99, background:"#f0e8e8", overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${paidPct}%`, background:"linear-gradient(to right,#e03131,#c92a2a)", borderRadius:99, transition:"width 0.4s" }} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:2, background:"white", borderRadius:12, border:"1px solid #f5eaea", padding:5, alignSelf:"flex-start" }}>
        {[{ id:"breakdown", label:"Fee Breakdown", icon:"ti-list" }, { id:"installments", label:"Installments", icon:"ti-calendar" }, { id:"payments", label:"Payments", icon:"ti-cash" }].map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display:"inline-flex", alignItems:"center", gap:6, height:34, padding:"0 16px", borderRadius:8, border:"none", background:active?"linear-gradient(135deg,#e03131,#c92a2a)":"transparent", color:active?"white":"#9a7070", fontSize:12, fontWeight:active?700:500, fontFamily:"'DM Sans',sans-serif", cursor:"pointer", transition:"all 0.14s", whiteSpace:"nowrap" }}>
              <i className={`ti ${t.icon}`} style={{ fontSize:13 }} />{t.label}
              {t.id === "payments" && (invoice.payments?.length ?? 0) > 0 && <span style={{ fontSize:10, fontWeight:700, background:active?"rgba(255,255,255,0.3)":"#f0e8e8", color:active?"white":"#e03131", borderRadius:99, padding:"1px 6px" }}>{invoice.payments.length}</span>}
            </button>
          );
        })}
      </div>

      {/* Tab: Breakdown */}
      {tab === "breakdown" && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {/* Fee items by category */}
          {[
            { key:"tuition", items:tuitionItems, label:"Tuition Fees", color:"#e03131", bg:"#fff0f0", note:"Discounts applied below" },
            { key:"misc",    items:miscItems,    label:"Miscellaneous Fees", color:"#1455a0", bg:"#e3f0fd", note:"No discount" },
            { key:"other",   items:otherItems,   label:"Other Fees", color:"#2e6b0d", bg:"#e8f5e0", note:"No discount" },
          ].filter((g) => g.items.length > 0).map((group) => (
            <div key={group.key} style={{ background:"white", borderRadius:14, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 8px rgba(224,49,49,0.04)" }}>
              <div style={{ padding:"12px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", justifyContent:"space-between", background:group.bg }}>
                <span style={{ fontSize:13, fontWeight:700, color:group.color }}>{group.label}</span>
                <span style={{ fontSize:11, color:group.color, opacity:0.7, fontStyle:"italic" }}>{group.note}</span>
              </div>
              {group.items.map((item) => (
                <div key={item.invoice_item_id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 18px", borderBottom:"1px solid #f9f0f0", fontSize:13 }}>
                  <span style={{ color:"#1a0a0a" }}>{item.description.replace(/^\[.*?\]\s*/, "")}</span>
                  <span style={{ fontWeight:600, color:"#1a0a0a" }}>{fmt(item.amount)}</span>
                </div>
              ))}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 18px", background:"#fdfafa" }}>
                <span style={{ fontSize:12, fontWeight:700, color:"#1a0a0a" }}>Subtotal</span>
                <span style={{ fontSize:13, fontWeight:700, color:group.color }}>{fmt(group.items.reduce((s, i) => s + parseFloat(i.amount), 0))}</span>
              </div>
            </div>
          ))}

          {/* Discount waterfall */}
          {(invoice.discounts ?? []).length > 0 && (
            <div style={{ background:"white", borderRadius:14, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 8px rgba(224,49,49,0.04)" }}>
              <div style={{ padding:"12px 18px", borderBottom:"1px solid #f9f0f0", background:"#fdf5e8" }}>
                <span style={{ fontSize:13, fontWeight:700, color:"#854f0b" }}>Discounts Applied to Tuition</span>
              </div>
              {invoice.discounts.map((d) => (
                <div key={d.invoice_discount_id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 18px", borderBottom:"1px solid #f9f0f0", fontSize:13 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <i className="ti ti-discount" style={{ fontSize:13, color:"#854f0b" }} />
                    <span style={{ color:"#1a0a0a" }}>{d.description}</span>
                  </div>
                  <span style={{ fontWeight:600, color:"#854f0b" }}>− {fmt(d.amount)}</span>
                </div>
              ))}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 18px", background:"#fdfafa" }}>
                <span style={{ fontSize:12, fontWeight:700, color:"#1a0a0a" }}>Total Discounts</span>
                <span style={{ fontSize:13, fontWeight:700, color:"#854f0b" }}>− {fmt(invoice.total_discounts ?? 0)}</span>
              </div>
            </div>
          )}

          {/* Grand total */}
          <div style={{ background:"linear-gradient(135deg,#e03131,#c92a2a)", borderRadius:14, padding:"18px 22px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.7)", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.07em" }}>Net Amount Due</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", marginTop:2 }}>After all discounts · {planMeta.label} plan</div>
            </div>
            <div style={{ fontSize:28, fontWeight:700, color:"white" }}>{fmt(netAmount)}</div>
          </div>
        </div>
      )}

      {/* Tab: Installments */}
      {tab === "installments" && (
        <div style={{ background:"white", borderRadius:14, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 8px rgba(224,49,49,0.04)" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ background:"#fdfafa" }}>
                {["#","Due Date","Amount","Paid","Balance","Status"].map((h) => (
                  <th key={h} style={{ textAlign:"left", fontSize:10.5, fontWeight:600, color:"#c0a0a0", padding:"12px 18px", borderBottom:"1px solid #f5eaea", textTransform:"uppercase", letterSpacing:"0.07em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(invoice.installments ?? []).map((inst) => {
                const stMeta = { pending:STATUS_META.unpaid, partially_paid:STATUS_META.partially_paid, paid:STATUS_META.paid, overdue:{ label:"Overdue", color:"#7c3aed", bg:"#f0e8fd" } }[inst.status] ?? STATUS_META.unpaid;
                const bal = parseFloat(inst.amount) - parseFloat(inst.amount_paid);
                return (
                  <tr key={inst.installment_id} style={{ borderBottom:"1px solid #f9f0f0" }}
                    onMouseEnter={(e) => { Array.from(e.currentTarget.cells).forEach((c) => c.style.background="#fff8f6"); }}
                    onMouseLeave={(e) => { Array.from(e.currentTarget.cells).forEach((c) => c.style.background=""); }}>
                    <td style={{ padding:"11px 18px", color:"#b09090" }}>{inst.sequence}</td>
                    <td style={{ padding:"11px 18px", fontWeight:600, color:"#1a0a0a" }}>{fmtDate(inst.due_date)}</td>
                    <td style={{ padding:"11px 18px", color:"#1a0a0a" }}>{fmt(inst.amount)}</td>
                    <td style={{ padding:"11px 18px", color:"#2e6b0d", fontWeight:600 }}>{fmt(inst.amount_paid)}</td>
                    <td style={{ padding:"11px 18px", color: bal > 0 ? "#a32d2d" : "#2e6b0d", fontWeight:600 }}>{fmt(bal)}</td>
                    <td style={{ padding:"11px 18px" }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:"3px 8px", borderRadius:99, background:stMeta.bg, color:stMeta.color }}>{stMeta.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Payments */}
      {tab === "payments" && (
        <div style={{ background:"white", borderRadius:14, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 8px rgba(224,49,49,0.04)" }}>
          {(invoice.payments ?? []).length === 0 ? (
            <div style={{ padding:"40px", textAlign:"center", color:"#b09090", fontSize:13, fontStyle:"italic" }}>No payments recorded yet.</div>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#fdfafa" }}>
                  {["Date","Amount","Method","Reference","Notes"].map((h) => (
                    <th key={h} style={{ textAlign:"left", fontSize:10.5, fontWeight:600, color:"#c0a0a0", padding:"12px 18px", borderBottom:"1px solid #f5eaea", textTransform:"uppercase", letterSpacing:"0.07em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((p) => (
                  <tr key={p.payment_id} style={{ borderBottom:"1px solid #f9f0f0" }}
                    onMouseEnter={(e) => { Array.from(e.currentTarget.cells).forEach((c) => c.style.background="#fff8f6"); }}
                    onMouseLeave={(e) => { Array.from(e.currentTarget.cells).forEach((c) => c.style.background=""); }}>
                    <td style={{ padding:"11px 18px", color:"#1a0a0a" }}>{fmtDate(p.payment_date)}</td>
                    <td style={{ padding:"11px 18px", fontWeight:700, color:"#2e6b0d" }}>{fmt(p.amount_paid)}</td>
                    <td style={{ padding:"11px 18px" }}>
                      <span style={{ fontSize:11, fontWeight:600, padding:"3px 8px", borderRadius:6, background:"#e3f0fd", color:"#1455a0" }}>{p.payment_method}</span>
                    </td>
                    <td style={{ padding:"11px 18px", color:"#5a4a4a", fontFamily:"monospace", fontSize:12 }}>{p.reference_number || "—"}</td>
                    <td style={{ padding:"11px 18px", color:"#7a5050", fontSize:12 }}>{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Void confirm */}
      {showVoidConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)" }}>
          <div style={{ background:"white", borderRadius:20, padding:"32px 36px", width:380, boxShadow:"0 24px 64px rgba(224,49,49,0.18)", display:"flex", flexDirection:"column", alignItems:"center", gap:14, animation:"slideUp 0.2s ease" }}>
            <div style={{ width:56, height:56, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <i className="ti ti-ban" style={{ fontSize:24, color:"#e03131" }} />
            </div>
            <div style={{ fontSize:17, fontWeight:700, color:"#1a0a0a"}}>Void Invoice?</div>
            <div style={{ fontSize:13, color:"#7a5050", textAlign:"center", lineHeight:1.7 }}>This will mark invoice <strong>{invoice.invoice_no}</strong> as void. This cannot be undone.</div>
            <div style={{ display:"flex", gap:10, width:"100%" }}>
              <button onClick={() => setShowVoidConfirm(false)} style={{ flex:1, height:42, border:"1.5px solid #f0e0e0", borderRadius:10, background:"white", fontSize:13, color:"#7a5050", cursor:"pointer", fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
              <button onClick={handleVoid} disabled={voiding} style={{ flex:1, height:42, border:"none", borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", fontSize:13, color:"white", cursor:"pointer", fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>
                {voiding ? "Voiding…" : "Yes, void"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function InvoicesPage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [invoices,      setInvoices]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [selectedId,    setSelectedId]    = useState(null);
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [planFilter,    setPlanFilter]    = useState("all");
  const [page,          setPage]          = useState(1);
  const [pageMeta,      setPageMeta]      = useState({ count:0, next:null, previous:null });
  const [showGenModal,  setShowGenModal]  = useState(false);
  const [refreshKey,    setRefreshKey]    = useState(0);

  const fetchInvoices = useCallback(async (p = 1, status = statusFilter, plan = planFilter) => {
    setLoading(true);
    try {
      const params = { page: p };
      if (status !== "all") params.status = status;
      if (plan   !== "all") params.payment_plan = plan;
      const data = await getInvoices(params);
      setInvoices(Array.isArray(data) ? data : data?.results ?? []);
      setPageMeta({ count: data.count ?? 0, next: data.next, previous: data.previous });
      setPage(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [statusFilter, planFilter]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchInvoices();
  }, [refreshKey]);

  const totalPages = Math.ceil(pageMeta.count / 20);

  const unpaidCount   = invoices.filter((i) => i.status === "unpaid").length;
  const partialCount  = invoices.filter((i) => i.status === "partially_paid").length;

  const paidCount = invoices.filter((i) => i.status === "paid").length;
  const voidCount = invoices.filter((i) => i.status === "void").length;

  return (
    <AppLayout>

          {/* Topbar */}
          <div style={{ background:"white", borderBottom:"1px solid #f5eaea", padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a"}}>Invoices</div>
              <div style={{ fontSize:11.5, color:"#b09090", marginTop:1 }}>
                {loading ? "Loading…" : `${pageMeta.count} total · ${unpaidCount} unpaid · ${partialCount} partial`}
              </div>
            </div>
            <button onClick={() => setShowGenModal(true)}
              style={{ display:"inline-flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}>
              <i className="ti ti-receipt" style={{ fontSize:15 }} />Generate Invoice
            </button>
          </div>

          {/* Content */}
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Stat cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:12 }}>
              {[
                { label:"Unpaid",   value:unpaidCount,  icon:"ti-clock",        color:STATUS_META.unpaid.color,         bg:STATUS_META.unpaid.bg         },
                { label:"Partial",  value:partialCount, icon:"ti-clock-half-2", color:STATUS_META.partially_paid.color, bg:STATUS_META.partially_paid.bg },
                { label:"Paid",     value:paidCount,    icon:"ti-circle-check", color:STATUS_META.paid.color,           bg:STATUS_META.paid.bg           },
                { label:"Void",     value:voidCount,    icon:"ti-ban",          color:STATUS_META.void.color,           bg:STATUS_META.void.bg           },
              ].map((s) => (
                <div key={s.label} style={{ background:"white", borderRadius:14, padding:"16px 20px", border:"1px solid #f5eaea", display:"flex", alignItems:"center", gap:14, boxShadow:"0 2px 12px rgba(224,49,49,0.06)" }}>
                  <div style={{ width:42, height:42, borderRadius:12, background:s.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <i className={`ti ${s.icon}`} style={{ fontSize:18, color:s.color }} />
                  </div>
                  <div>
                    {loading ? <Sk w={40} h={20} r={4} /> : <div style={{ fontSize:22, fontWeight:700, color:"#1a0a0a", lineHeight:1 }}>{s.value}</div>}
                    <div style={{ fontSize:11, color:"#a07878", marginTop:4, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.06em" }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"14px 18px", boxShadow:"0 2px 16px rgba(224,49,49,0.06)", display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap", alignItems:"center" }}>
                <span style={{ fontSize:10.5, color:"#cdb0b0", letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:600, marginRight:4 }}>Status</span>
                {["all",...Object.keys(STATUS_META)].map((s) => (
                  <button key={s} className={`chip-btn${statusFilter===s?" active":""}`}
                    onClick={() => { setStatusFilter(s); fetchInvoices(1, s, planFilter); }}>
                    {s === "all" ? "All" : STATUS_META[s].label}
                  </button>
                ))}
              </div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap", alignItems:"center" }}>
                <span style={{ fontSize:10.5, color:"#cdb0b0", letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:600, marginRight:4 }}>Plan</span>
                {["all",...Object.keys(PLAN_META)].map((p) => (
                  <button key={p} className={`chip-btn${planFilter===p?" active":""}`}
                    onClick={() => { setPlanFilter(p); fetchInvoices(1, statusFilter, p); }}>
                    {p === "all" ? "All" : PLAN_META[p].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Master / detail */}
            <div style={{ display:"grid", gridTemplateColumns: selectedId ? "360px 1fr" : "1fr", gap:16, alignItems:"flex-start" }}>

              {/* Left: Invoice list */}
              <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}>
                <div style={{ overflowY:"auto", maxHeight:"calc(100vh - 340px)" }}>
                  {loading ? Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} style={{ padding:"14px 16px", borderBottom:"1px solid #f9f0f0", display:"flex", flexDirection:"column", gap:8 }}>
                      <Sk w={140} h={14} /><Sk w={100} h={11} /><Sk w={80} h={11} />
                    </div>
                  )) : invoices.length === 0 ? (
                    <div style={{ padding:"48px 16px", textAlign:"center" }}>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                        <div style={{ width:52, height:52, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <i className="ti ti-receipt-off" style={{ fontSize:22, color:"#e08080" }} />
                        </div>
                        <div style={{ fontSize:14, color:"#7a5050", fontWeight:600 }}>No invoices found</div>
                        <div style={{ fontSize:12, color:"#b09090" }}>Try adjusting your filters</div>
                      </div>
                    </div>
                  ) : invoices.map((inv, idx) => {
                    const sm = STATUS_META[inv.status] ?? STATUS_META.unpaid;
                    const pm = PLAN_META[inv.payment_plan] ?? PLAN_META.monthly;
                    const isSelected = selectedId === inv.invoice_id;
                    const en = inv.enrollment_detail;
                    return (
                      <div key={inv.invoice_id}
                        style={{ padding:"13px 16px", borderBottom:"1px solid #f9f0f0", cursor:"pointer", background:isSelected?"#fff8f6":"white", borderLeft:`3px solid ${isSelected?"#e03131":"transparent"}`, transition:"all 0.12s", animation:`rowIn 0.18s ease both`, animationDelay:`${idx*20}ms` }}
                        onClick={() => setSelectedId(inv.invoice_id)}
                        onMouseEnter={(e) => { if(!isSelected) e.currentTarget.style.background="#fff8f6"; }}
                        onMouseLeave={(e) => { if(!isSelected) e.currentTarget.style.background="white"; }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:"#1a0a0a", fontFamily:"monospace" }}>{inv.invoice_no}</span>
                          <span style={{ fontSize:10.5, fontWeight:700, padding:"2px 7px", borderRadius:99, background:sm.bg, color:sm.color }}>{sm.label}</span>
                        </div>
                        <div style={{ fontSize:12, color:"#5a4a4a", fontWeight:600, marginBottom:2 }}>{en?.student_name ?? `Enrollment #${inv.enrollment_id}`}</div>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                            <span style={{ fontSize:10.5, fontWeight:600, padding:"1px 6px", borderRadius:99, background:pm.bg, color:pm.color }}>{pm.label}</span>
                            <span style={{ fontSize:11, color:"#b09090" }}>{en?.grade_level ?? ""}</span>
                          </div>
                          <span style={{ fontSize:12, fontWeight:700, color:"#1a0a0a" }}>{fmt(inv.balance ?? 0)} bal.</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {!loading && pageMeta.count > 20 && (
                  <div style={{ padding:"10px 16px", borderTop:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#fdfafa" }}>
                    <span style={{ fontSize:12, color:"#b09090" }}>Page {page} of {totalPages} · {pageMeta.count} total</span>
                    <div style={{ display:"flex", gap:4 }}>
                      <button disabled={!pageMeta.previous} onClick={() => fetchInvoices(page - 1)}
                        style={{ width:30, height:30, border:"1px solid #f0e4e4", borderRadius:8, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070" }}>
                        <i className="ti ti-chevron-left" style={{ fontSize:13 }} />
                      </button>
                      <button disabled={!pageMeta.next} onClick={() => fetchInvoices(page + 1)}
                        style={{ width:30, height:30, border:"1px solid #f0e4e4", borderRadius:8, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070" }}>
                        <i className="ti ti-chevron-right" style={{ fontSize:13 }} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Detail */}
              {selectedId ? (
                <InvoiceDetail key={`${selectedId}-${refreshKey}`} invoiceId={selectedId}
                  onVoided={() => { setSelectedId(null); setRefreshKey((k) => k + 1); }} />
              ) : !loading && invoices.length > 0 ? (
                <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"56px 24px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, color:"#b09090", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}>
                  <div style={{ width:52, height:52, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <i className="ti ti-receipt" style={{ fontSize:22, color:"#e08080" }} />
                  </div>
                  <div style={{ fontSize:14, fontWeight:600, color:"#7a5050" }}>Select an invoice</div>
                  <div style={{ fontSize:13 }}>Click an invoice on the left to view its details</div>
                </div>
              ) : null}
            </div>
          </div>

      {showGenModal && (
        <GenerateModal onClose={() => setShowGenModal(false)}
          onGenerated={(inv) => { setRefreshKey((k) => k + 1); setSelectedId(inv.invoice_id); }} />
      )}
    </AppLayout>
  );
}
