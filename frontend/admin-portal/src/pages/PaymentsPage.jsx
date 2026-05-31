import { useState, useEffect, useCallback } from "react";
import AppLayout from "../components/AppLayout";
import RecordPaymentModal from "../components/RecordPaymentModal";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";

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
const getPayments = (p = {}) => apiCall("GET", `${BILLING_API}/payments/?${new URLSearchParams(p)}`);

// ── Constants ──────────────────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { value:"cash",          label:"Cash",          icon:"ti-cash",          color:"#2e6b0d", bg:"#e8f5e0" },
  { value:"gcash",         label:"GCash",         icon:"ti-device-mobile", color:"#1455a0", bg:"#e3f0fd" },
  { value:"bank_transfer", label:"Bank Transfer", icon:"ti-building-bank", color:"#7c3aed", bg:"#f0e8fd" },
  { value:"card",          label:"Card",          icon:"ti-credit-card",   color:"#d97706", bg:"#fdf5e8" },
  { value:"check",         label:"Check",         icon:"ti-file-text",     color:"#854f0b", bg:"#faeeda" },
  { value:"others",        label:"Others",        icon:"ti-dots",          color:"#5c5752", bg:"#f0ede8" },
];
const PM = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m]));

const fmt     = (n) => `₱${parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-PH", { month:"short", day:"numeric", year:"numeric" }) : "—";

const Sk = ({ w="100%", h=14, r=6 }) => (
  <div style={{ width:w, height:h, borderRadius:r, background:"linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.6s ease-in-out infinite" }} />
);

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic avatar color from name
const AVATAR_PALETTES = [
  { bg:"#fde8e8", color:"#a32d2d" },
  { bg:"#e3f0fd", color:"#1455a0" },
  { bg:"#e8f5e0", color:"#2e6b0d" },
  { bg:"#f0e8fd", color:"#7c3aed" },
  { bg:"#faeeda", color:"#854f0b" },
  { bg:"#fdf5e8", color:"#d97706" },
];
function avatarPalette(name) {
  if (!name) return AVATAR_PALETTES[0];
  const code = name.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  return AVATAR_PALETTES[code % AVATAR_PALETTES.length];
}

// ── Table row ─────────────────────────────────────────────────────────────────
// Rendered inside a <tbody> — not a standalone component.
// Keeps all columns fixed-width so amount/method/reference never jump.

// ════════════════════════════════════════════════════════════════════════════════
export default function PaymentsPage() {
  const navigate    = useNavigate();
  const currentUser = getCurrentUser();
  const [searchParams] = useSearchParams();
  const preloadedInvoiceId = searchParams.get("invoice") ? parseInt(searchParams.get("invoice")) : null;

  const [payments,   setPayments]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [pageMeta,   setPageMeta]   = useState({ count:0, next:null, previous:null });
  const [showModal,  setShowModal]  = useState(Boolean(preloadedInvoiceId));
  const [refreshKey, setRefreshKey] = useState(0);

  // Filters
  const [methodFilter, setMethodFilter] = useState("all");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [amountMin,    setAmountMin]    = useState("");
  const [amountMax,    setAmountMax]    = useState("");
  const [sortField,    setSortField]    = useState("-payment_date");
  const [filtersOpen,  setFiltersOpen]  = useState(false);

  const hasDateOrAmount = dateFrom || dateTo || amountMin || amountMax;
  const hasActiveFilters = methodFilter !== "all" || hasDateOrAmount || sortField !== "-payment_date";

  const clearFilters = () => {
    setMethodFilter("all");
    setDateFrom(""); setDateTo("");
    setAmountMin(""); setAmountMax("");
    setSortField("-payment_date");
  };

  const totalCollected = payments.reduce((s, p) => s + parseFloat(p.amount_paid), 0);

  const buildParams = (p = 1, overrides = {}) => {
    const f = { methodFilter, dateFrom, dateTo, amountMin, amountMax, sortField, ...overrides };
    const params = { page: p, ordering: f.sortField };
    if (f.methodFilter !== "all") params.payment_method = f.methodFilter;
    if (f.dateFrom)  params.date_from  = f.dateFrom;
    if (f.dateTo)    params.date_to    = f.dateTo;
    if (f.amountMin) params.amount_min = f.amountMin;
    if (f.amountMax) params.amount_max = f.amountMax;
    return params;
  };

  const fetchPayments = useCallback(async (p = 1, overrides = {}) => {
    setLoading(true);
    try {
      const data = await getPayments(buildParams(p, overrides));
      setPayments(Array.isArray(data) ? data : data?.results ?? []);
      setPageMeta({ count: data.count ?? 0, next: data.next, previous: data.previous });
      setPage(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [methodFilter, dateFrom, dateTo, amountMin, amountMax, sortField]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchPayments();
  }, [refreshKey]);

  const totalPages  = Math.ceil(pageMeta.count / 20);

  // Per-method totals from current page
  const methodTotals = Object.fromEntries(
    PAYMENT_METHODS.map((pm) => [
      pm.value,
      payments.filter((p) => p.payment_method === pm.value).reduce((s, p) => s + parseFloat(p.amount_paid), 0),
    ])
  );

  // ── Shared input / label styles used in filters ────────────────────────────
  const filterInput = {
    border:"1.5px solid #f0e4e4", borderRadius:8, padding:"6px 10px",
    fontSize:12, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a",
    background:"#fffbfb", outline:"none", height:34, boxSizing:"border-box",
  };
  const filterLabel = {
    fontSize:10, fontWeight:700, color:"#c0a0a0",
    textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4,
    display:"block",
  };

  return (
    <AppLayout>

      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <div style={{ background:"white", borderBottom:"1px solid #f5eaea", padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a" }}>Payments</div>
          <div style={{ fontSize:11.5, color:"#b09090", marginTop:1 }}>
            {loading ? "Loading…" : `${pageMeta.count} transaction${pageMeta.count !== 1 ? "s" : ""} · ${fmt(totalCollected)} this page`}
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

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 28px", display:"flex", flexDirection:"column", gap:14 }}>

        {/* ── Summary strip ──────────────────────────────────────────────── */}
        <div style={{ background:"white", borderRadius:14, border:"1px solid #f5eaea", padding:"16px 20px", boxShadow:"0 2px 8px rgba(224,49,49,0.04)", display:"grid", gridTemplateColumns:"repeat(6,1fr) 2px 1fr", alignItems:"center", gap:0 }}>
          {PAYMENT_METHODS.map((pm) => (
            <div key={pm.value} style={{ textAlign:"center", padding:"0 12px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginBottom:6 }}>
                <div style={{ width:28, height:28, borderRadius:8, background:pm.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <i className={`ti ${pm.icon}`} style={{ fontSize:14, color:pm.color }} />
                </div>
                <span style={{ fontSize:11.5, fontWeight:600, color:"#7a5050" }}>{pm.label}</span>
              </div>
              {loading
                ? <Sk w="80%" h={13} />
                : <div style={{ fontSize:13, fontWeight:700, color: methodTotals[pm.value] > 0 ? pm.color : "#c0a0a0" }}>{fmt(methodTotals[pm.value])}</div>
              }
            </div>
          ))}
          {/* Divider */}
          <div style={{ background:"#f0e8e8", height:"100%", margin:"0 8px" }} />
          {/* Total */}
          <div style={{ paddingLeft:16 }}>
            <div style={{ fontSize:10.5, fontWeight:700, color:"#c0a0a0", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:5 }}>Total collected</div>
            {loading ? <Sk w={100} h={18} /> : <div style={{ fontSize:20, fontWeight:800, color:"#1a0a0a", letterSpacing:"-0.01em" }}>{fmt(totalCollected)}</div>}
          </div>
        </div>

        {/* ── Filter bar ─────────────────────────────────────────────────── */}
        <div style={{ background:"white", borderRadius:14, border:"1px solid #f5eaea", boxShadow:"0 2px 8px rgba(224,49,49,0.04)" }}>

          {/* Top row */}
          <div style={{ padding:"10px 16px", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>

            {/* Method chips */}
            <button
              className={`chip-btn${methodFilter==="all"?" active":""}`}
              onClick={() => { setMethodFilter("all"); fetchPayments(1, { methodFilter:"all" }); }}>
              All
            </button>
            {PAYMENT_METHODS.map((pm) => (
              <button key={pm.value}
                className={`chip-btn${methodFilter===pm.value?" active":""}`}
                onClick={() => { setMethodFilter(pm.value); fetchPayments(1, { methodFilter:pm.value }); }}>
                <i className={`ti ${pm.icon}`} style={{ fontSize:11 }} />{pm.label}
              </button>
            ))}

            <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
              {/* Sort */}
              <div style={{ display:"flex", alignItems:"center", gap:5, background:"#fdfafa", border:"1px solid #f0e4e4", borderRadius:8, padding:"4px 10px 4px 8px", height:32 }}>
                <i className="ti ti-arrows-sort" style={{ fontSize:12, color:"#c0a0a0" }} />
                <select value={sortField}
                  onChange={(e) => { setSortField(e.target.value); fetchPayments(1, { sortField:e.target.value }); }}
                  style={{ border:"none", background:"transparent", fontSize:12, color:"#5a4a4a", fontWeight:600, fontFamily:"'DM Sans',sans-serif", outline:"none", cursor:"pointer" }}>
                  <option value="-payment_date">Date ↓</option>
                  <option value="payment_date">Date ↑</option>
                  <option value="-amount_paid">Amount ↓</option>
                  <option value="amount_paid">Amount ↑</option>
                </select>
              </div>

              {/* Date/amount filter toggle */}
              <button onClick={() => setFiltersOpen((v) => !v)}
                style={{ display:"inline-flex", alignItems:"center", gap:5, height:32, padding:"0 12px", border:`1.5px solid ${filtersOpen||hasDateOrAmount?"#e03131":"#f0e4e4"}`, borderRadius:8, background:filtersOpen||hasDateOrAmount?"#fff0f0":"white", color:filtersOpen||hasDateOrAmount?"#e03131":"#7a5050", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", whiteSpace:"nowrap" }}>
                <i className="ti ti-calendar-search" style={{ fontSize:12 }} />
                Date / Amount{hasDateOrAmount?" •":""}
                <i className={`ti ti-chevron-${filtersOpen?"up":"down"}`} style={{ fontSize:11 }} />
              </button>

              {hasActiveFilters && (
                <button onClick={() => { clearFilters(); fetchPayments(1, { methodFilter:"all", dateFrom:"", dateTo:"", amountMin:"", amountMax:"", sortField:"-payment_date" }); }}
                  style={{ height:32, padding:"0 10px", border:"1px solid #f0e4e4", borderRadius:8, background:"white", color:"#9a7070", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Expanded date/amount row */}
          {filtersOpen && (
            <div style={{ padding:"12px 16px 14px", borderTop:"1px solid #f9f0f0", display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
              <div>
                <label style={filterLabel}>Date from</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...filterInput, minWidth:140 }} />
              </div>
              <div>
                <label style={filterLabel}>Date to</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...filterInput, minWidth:140 }} />
              </div>
              <div>
                <label style={filterLabel}>Min amount</label>
                <div style={{ position:"relative" }}>
                  <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"#c0a0a0", fontWeight:600 }}>₱</span>
                  <input type="number" min="0" step="0.01" value={amountMin} onChange={(e) => setAmountMin(e.target.value)}
                    placeholder="0.00" style={{ ...filterInput, paddingLeft:22, minWidth:100 }} />
                </div>
              </div>
              <div>
                <label style={filterLabel}>Max amount</label>
                <div style={{ position:"relative" }}>
                  <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"#c0a0a0", fontWeight:600 }}>₱</span>
                  <input type="number" min="0" step="0.01" value={amountMax} onChange={(e) => setAmountMax(e.target.value)}
                    placeholder="0.00" style={{ ...filterInput, paddingLeft:22, minWidth:100 }} />
                </div>
              </div>
              {/* Quick presets */}
              <div>
                <label style={filterLabel}>Quick</label>
                <div style={{ display:"flex", gap:6 }}>
                  {[
                    { label:"Today",      fn:() => { const d=new Date().toISOString().slice(0,10); setDateFrom(d); setDateTo(d); } },
                    { label:"This Month", fn:() => { const now=new Date(); setDateFrom(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`); setDateTo(new Date().toISOString().slice(0,10)); } },
                    { label:"Last Month", fn:() => { const now=new Date(); const y=now.getMonth()===0?now.getFullYear()-1:now.getFullYear(); const m=now.getMonth()===0?12:now.getMonth(); const last=new Date(now.getFullYear(),now.getMonth(),0).getDate(); setDateFrom(`${y}-${String(m).padStart(2,"0")}-01`); setDateTo(`${y}-${String(m).padStart(2,"0")}-${last}`); } },
                  ].map((q) => (
                    <button key={q.label} type="button" onClick={q.fn}
                      style={{ height:34, padding:"0 10px", border:"1px solid #f0e4e4", borderRadius:8, background:"white", color:"#7a5050", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => fetchPayments(1)}
                style={{ height:34, padding:"0 18px", border:"none", borderRadius:8, background:"linear-gradient(135deg,#e03131,#c01a1a)", color:"white", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", marginLeft:"auto", boxShadow:"0 3px 10px rgba(224,49,49,0.22)" }}>
                Apply
              </button>
            </div>
          )}
        </div>

        {/* ── Payments table ──────────────────────────────────────────────── */}
        <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ background:"#fdfafa" }}>
                {["Student","Invoice","Date","Amount","Method","Reference","Notes"].map((h) => (
                  <th key={h} style={{ textAlign:"left", fontSize:10.5, fontWeight:600, color:"#c0a0a0", padding:"12px 16px", borderBottom:"1px solid #f5eaea", textTransform:"uppercase", letterSpacing:"0.07em", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length:8 }).map((_, i) => (
                    <tr key={i}>
                      {[160, 90, 90, 80, 90, 100, 110].map((w, j) => (
                        <td key={j} style={{ padding:"13px 16px", borderBottom:"1px solid #f9f0f0" }}>
                          {j === 0
                            ? <div style={{ display:"flex", alignItems:"center", gap:10 }}><div style={{ width:34, height:34, borderRadius:9, background:"#f5eaea", flexShrink:0 }} /><div style={{ display:"flex", flexDirection:"column", gap:6 }}><Sk w={120} h={12} /><Sk w={70} h={10} /></div></div>
                            : <Sk w={w} h={12} />}
                        </td>
                      ))}
                    </tr>
                  ))
                : payments.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} style={{ padding:"64px 24px", textAlign:"center" }}>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
                          <div style={{ width:52, height:52, borderRadius:14, background:"#e8f5e0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <i className="ti ti-cash" style={{ fontSize:24, color:"#2e6b0d" }} />
                          </div>
                          <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a" }}>No payments found</div>
                          <div style={{ fontSize:13, color:"#b09090" }}>
                            {hasActiveFilters ? "Try adjusting your filters." : "Record the first payment to get started."}
                          </div>
                          {!hasActiveFilters && (
                            <button onClick={() => setShowModal(true)}
                              style={{ marginTop:4, display:"inline-flex", alignItems:"center", gap:7, background:"linear-gradient(135deg,#2e6b0d,#256009)", color:"white", border:"none", borderRadius:10, padding:"10px 20px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(46,107,13,0.26)" }}>
                              <i className="ti ti-cash" style={{ fontSize:14 }} />Record Payment
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                  : payments.map((p, idx) => {
                      const name  = p.invoice_detail?.student_name || null;
                      const invNo = p.invoice_detail?.invoice_no   || `#${p.invoice}`;
                      const mc    = PM[p.payment_method] ?? PM.others;
                      const pal   = avatarPalette(name);
                      return (
                        <tr key={p.payment_id}
                          style={{ animation:`rowIn 0.18s ease both`, animationDelay:`${idx*15}ms` }}
                          onMouseEnter={(e) => Array.from(e.currentTarget.cells).forEach((c) => c.style.background="#fffbfb")}
                          onMouseLeave={(e) => Array.from(e.currentTarget.cells).forEach((c) => c.style.background="")}>

                          {/* Student */}
                          <td style={{ padding:"11px 16px", borderBottom:"1px solid #f9f0f0" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <div style={{ width:34, height:34, borderRadius:9, background:pal.bg, color:pal.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>
                                {name ? initials(name) : <i className="ti ti-user" style={{ fontSize:15 }} />}
                              </div>
                              <span style={{ fontSize:13, fontWeight:600, color:"#1a0a0a", whiteSpace:"nowrap" }}>
                                {name ?? <span style={{ color:"#b09090", fontStyle:"italic", fontWeight:400 }}>Unknown</span>}
                              </span>
                            </div>
                          </td>

                          {/* Invoice */}
                          <td style={{ padding:"11px 16px", borderBottom:"1px solid #f9f0f0" }}>
                            <button onClick={() => navigate(`/invoices?selected=${p.invoice}`)}
                              style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"monospace", fontSize:11.5, color:"#e03131", fontWeight:700, textDecoration:"underline", padding:0, whiteSpace:"nowrap" }}>
                              {invNo}
                            </button>
                          </td>

                          {/* Date */}
                          <td style={{ padding:"11px 16px", borderBottom:"1px solid #f9f0f0", color:"#5a4a4a", whiteSpace:"nowrap" }}>
                            {fmtDate(p.payment_date)}
                          </td>

                          {/* Amount */}
                          <td style={{ padding:"11px 16px", borderBottom:"1px solid #f9f0f0", fontWeight:700, color:"#2e6b0d", whiteSpace:"nowrap" }}>
                            {fmt(p.amount_paid)}
                          </td>

                          {/* Method */}
                          <td style={{ padding:"11px 16px", borderBottom:"1px solid #f9f0f0" }}>
                            <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, padding:"3px 9px", borderRadius:99, background:mc.bg, color:mc.color, whiteSpace:"nowrap" }}>
                              <i className={`ti ${mc.icon}`} style={{ fontSize:11 }} />{mc.label}
                            </span>
                          </td>

                          {/* Reference */}
                          <td style={{ padding:"11px 16px", borderBottom:"1px solid #f9f0f0", color:"#5a4a4a", fontFamily:"monospace", fontSize:11.5 }}>
                            {p.reference_number || <span style={{ color:"#d0b8b8" }}>—</span>}
                          </td>

                          {/* Notes */}
                          <td style={{ padding:"11px 16px", borderBottom:"1px solid #f9f0f0", color:"#7a5050", fontSize:12, maxWidth:180 }}>
                            {p.notes
                              ? <span style={{ display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.notes}</span>
                              : <span style={{ color:"#d0b8b8" }}>—</span>}
                          </td>
                        </tr>
                      );
                    })
              }
            </tbody>
          </table>

          {/* Pagination */}
          {!loading && pageMeta.count > 20 && (
            <div style={{ padding:"12px 16px", borderTop:"1px solid #f5eaea", background:"#fdfafa", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:12, color:"#b09090" }}>Page {page} of {totalPages} · {pageMeta.count} total</span>
              <div style={{ display:"flex", gap:6 }}>
                <button disabled={!pageMeta.previous} onClick={() => fetchPayments(page - 1)}
                  style={{ height:32, padding:"0 14px", border:"1px solid #f0e4e4", borderRadius:8, background:"white", display:"inline-flex", alignItems:"center", gap:5, cursor:pageMeta.previous?"pointer":"not-allowed", color:pageMeta.previous?"#5a4a4a":"#c0a0a0", fontSize:12, fontWeight:600, fontFamily:"'DM Sans',sans-serif", opacity:pageMeta.previous?1:0.5 }}>
                  <i className="ti ti-chevron-left" style={{ fontSize:13 }} />Prev
                </button>
                <button disabled={!pageMeta.next} onClick={() => fetchPayments(page + 1)}
                  style={{ height:32, padding:"0 14px", border:"1px solid #f0e4e4", borderRadius:8, background:"white", display:"inline-flex", alignItems:"center", gap:5, cursor:pageMeta.next?"pointer":"not-allowed", color:pageMeta.next?"#5a4a4a":"#c0a0a0", fontSize:12, fontWeight:600, fontFamily:"'DM Sans',sans-serif", opacity:pageMeta.next?1:0.5 }}>
                  Next<i className="ti ti-chevron-right" style={{ fontSize:13 }} />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {showModal && (
        <RecordPaymentModal
          preloadedInvoiceId={preloadedInvoiceId}
          onClose={() => setShowModal(false)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </AppLayout>
  );
}
