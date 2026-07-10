import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useCallback } from "react";
import AppLayout from "../components/AppLayout";
import RecordPaymentModal from "../components/RecordPaymentModal";
import EmptyState from "../components/EmptyState";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import { getPayments as _getPayments } from "../api/billingApi";
const getPayments = (p = {}) => _getPayments(p);

// ── Constants ─────────────────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { value:"cash",          label:"Cash",          icon:"ti-cash",          color:"#2e6b0d", bg:"#e8f5e0" },
  { value:"gcash",         label:"GCash",         icon:"ti-device-mobile", color:"#1455a0", bg:"#e3f0fd" },
  { value:"bank_transfer", label:"Bank Transfer", icon:"ti-building-bank", color:"#7c3aed", bg:"#f0e8fd" },
  { value:"card",          label:"Card",          icon:"ti-credit-card",   color:"#d97706", bg:"#fdf5e8" },
  { value:"check",         label:"Check",         icon:"ti-file-text",     color:"#854f0b", bg:"#faeeda" },
  { value:"others",        label:"Others",        icon:"ti-dots",          color:"#5c5752", bg:"#f0ede8" },
];
const PM = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m]));

const SORT_OPTIONS = [
  { value:"-payment_date", label:"Date ↓" },
  { value:"payment_date",  label:"Date ↑" },
  { value:"-amount_paid",  label:"Amount ↓" },
  { value:"amount_paid",   label:"Amount ↑" },
];

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

// ════════════════════════════════════════════════════════════════════════════════
export default function PaymentsPage() {
  usePageTitle("Payments");
  const navigate    = useNavigate();
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

  const hasDateOrAmount  = dateFrom || dateTo || amountMin || amountMax;
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

  const totalPages = Math.ceil(pageMeta.count / 20);

  const methodTotals = Object.fromEntries(
    PAYMENT_METHODS.map((pm) => [
      pm.value,
      payments.filter((p) => p.payment_method === pm.value).reduce((s, p) => s + parseFloat(p.amount_paid), 0),
    ])
  );

  const filterLabel = {
    fontSize:10, fontWeight:700, color:"#c0a0a0",
    textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4,
    display:"block",
  };
  const filterInput = {
    border:"1.5px solid #f0e4e4", borderRadius:8, padding:"6px 10px",
    fontSize:12, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a",
    background:"#fffbfb", outline:"none", height:34, boxSizing:"border-box",
  };

  const isFirstRender = useIsFirstRender();

  return (
    <AppLayout>

      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <div style={{ background:"white", borderBottom:"1px solid #f5eaea", padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" }}>
        <motion.div
          initial={isFirstRender ? { opacity:0, y:-8 } : false}
          animate={{ opacity:1, y:0 }}
          transition={{ duration:0.22, ease:[0.4,0,0.2,1] }}
        >
          <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a" }}>Payments</div>
          <div style={{ fontSize:11.5, color:"#b09090", marginTop:1 }}>
            {loading ? "Loading…" : `${pageMeta.count} transaction${pageMeta.count !== 1 ? "s" : ""} · ${fmt(totalCollected)} this page`}
          </div>
        </motion.div>

        <motion.div
          initial={isFirstRender ? { opacity:0, y:-8 } : false}
          animate={{ opacity:1, y:0 }}
          transition={{ duration:0.22, ease:[0.4,0,0.2,1], delay:0.05 }}
          style={{ display:"flex", gap:10 }}
        >
          <motion.button
            onClick={() => navigate("/invoices")}
            whileHover={{ borderColor:"#fca5a5", color:"#e03131" }}
            whileTap={{ scale:0.96 }}
            transition={{ duration:0.12 }}
            style={{ display:"inline-flex", alignItems:"center", gap:6, background:"white", color:"#7a5050", border:"1.5px solid #f0e4e4", borderRadius:10, padding:"8px 16px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
          >
            <i className="ti ti-receipt" style={{ fontSize:13 }} />View Invoices
          </motion.button>
          <motion.button
            onClick={() => setShowModal(true)}
            whileHover={{ scale:1.02, boxShadow:"0 6px 20px rgba(46,107,13,0.32)" }}
            whileTap={{ scale:0.96 }}
            transition={{ duration:0.12 }}
            style={{ display:"inline-flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#2e6b0d,#256009)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(46,107,13,0.26)" }}
          >
            <i className="ti ti-cash" style={{ fontSize:15 }} />Record Payment
          </motion.button>
        </motion.div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 28px", display:"flex", flexDirection:"column", gap:14 }}>

        {/* ── Method stat cards ──────────────────────────────────────────── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:10 }}>
          {PAYMENT_METHODS.map((pm) => {
            const isActive = methodFilter === pm.value;
            const total    = methodTotals[pm.value];
            return (
              <motion.div
                key={pm.value}
                onClick={() => {
                  const next = isActive ? "all" : pm.value;
                  setMethodFilter(next);
                  fetchPayments(1, { methodFilter: next });
                }}
                whileHover={{ boxShadow: isActive ? `0 6px 20px ${pm.color}28` : "0 6px 20px rgba(0,0,0,0.08)" }}
                whileTap={{ scale:0.97 }}
                style={{
                  borderRadius:14, padding:"14px 16px", border:`1.5px solid ${isActive ? pm.color : "#f5eaea"}`,
                  cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,0.04)",
                  background: isActive ? pm.bg : "#ffffff",
                  transition:"border-color 0.15s ease, background-color 0.15s ease",
                }}
              >
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <div style={{ width:30, height:30, borderRadius:8, background: isActive ? "white" : pm.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"background 0.15s" }}>
                    <i className={`ti ${pm.icon}`} style={{ fontSize:14, color:pm.color }} />
                  </div>
                  <span style={{ fontSize:11.5, fontWeight:600, color: isActive ? pm.color : "#7a5050" }}>{pm.label}</span>
                </div>
                {loading
                  ? <Sk w="80%" h={14} />
                  : <div style={{ fontSize:15, fontWeight:700, color: isActive ? pm.color : (total > 0 ? "#1a0a0a" : "#c0a0a0"), letterSpacing:"-0.01em" }}>{fmt(total)}</div>
                }
              </motion.div>
            );
          })}
        </div>

        {/* ── Total collected card ───────────────────────────────────────── */}
        {/* <div style={{ background:"linear-gradient(135deg,#2e6b0d,#256009)", borderRadius:14, padding:"16px 22px", display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:"0 4px 20px rgba(46,107,13,0.22)" }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.65)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:3 }}>
              {methodFilter !== "all" ? `${PM[methodFilter]?.label ?? ""} · This Page` : "Total Collected · This Page"}
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>
              {loading ? "Loading…" : `${pageMeta.count} transaction${pageMeta.count !== 1 ? "s" : ""}`}
            </div>
          </div>
          {loading
            ? <Sk w={120} h={28} r={6} />
            : <div style={{ fontSize:28, fontWeight:800, color:"white", letterSpacing:"-0.02em" }}>{fmt(totalCollected)}</div>
          }
        </div> */}

        {/* ── Filter panel ───────────────────────────────────────────────── */}
        <div style={{ background:"white", borderRadius:14, border:"1px solid #f5eaea", padding:"16px 20px", boxShadow:"0 2px 8px rgba(224,49,49,0.04)", display:"flex", flexDirection:"column", gap:0 }}>
          {/* Method chips */}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#c0a0a0", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Payment Method</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
              {[{ value:"all", label:"All", color:"#e03131", bg:"#fff0f0" }, ...PAYMENT_METHODS.map((m) => ({ value:m.value, label:m.label, color:m.color, bg:m.bg, icon:m.icon }))].map((m) => {
                const active = methodFilter === m.value;
                return (
                  <motion.button key={m.value}
                    whileTap={{ scale:0.96 }}
                    onClick={() => { setMethodFilter(m.value); fetchPayments(1, { methodFilter:m.value }); }}
                    style={{
                      display:"inline-flex", alignItems:"center", gap:6, height:32, padding:"0 14px", borderRadius:99,
                      fontSize:12, fontWeight:600, border:`1.5px solid ${active ? m.color : "#f0e4e4"}`,
                      cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                      background: active ? m.bg : "#ffffff",
                      color: active ? m.color : "#9a7070",
                      transition:"border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease",
                    }}
                  >
                    {m.icon && <i className={`ti ${m.icon}`} style={{ fontSize:11 }} />}
                    {m.label}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height:1, background:"#f5eaea", margin:"4px 0 12px" }} />

          {/* Sort chips + date toggle + clear */}
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#c0a0a0", textTransform:"uppercase", letterSpacing:"0.08em", marginRight:2 }}>Sort</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
              {SORT_OPTIONS.map((opt) => {
                const active = sortField === opt.value;
                return (
                  <motion.button key={opt.value}
                    whileTap={{ scale:0.96 }}
                    onClick={() => { setSortField(opt.value); fetchPayments(1, { sortField:opt.value }); }}
                    style={{
                      display:"inline-flex", alignItems:"center", gap:6, height:32, padding:"0 14px", borderRadius:99,
                      fontSize:12, fontWeight:600, border:`1.5px solid ${active ? "#e03131" : "#f0e4e4"}`,
                      cursor:"pointer", fontFamily:"'DM Sans',sans-serif",
                      background: active ? "#fff0f0" : "#ffffff",
                      color: active ? "#e03131" : "#9a7070",
                      transition:"border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease",
                    }}
                  >
                    {opt.label}
                  </motion.button>
                );
              })}
            </div>

            <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
              {/* Date/amount toggle */}
              <motion.button
                onClick={() => setFiltersOpen((v) => !v)}
                whileTap={{ scale:0.96 }}
                style={{
                  display:"inline-flex", alignItems:"center", gap:5, height:32, padding:"0 12px",
                  border:`1.5px solid ${filtersOpen || hasDateOrAmount ? "#e03131" : "#f0e4e4"}`,
                  borderRadius:99, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", whiteSpace:"nowrap",
                  background: filtersOpen || hasDateOrAmount ? "#fff0f0" : "#ffffff",
                  color: filtersOpen || hasDateOrAmount ? "#e03131" : "#7a5050",
                  transition:"border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease",
                }}
              >
                <i className="ti ti-calendar-search" style={{ fontSize:12 }} />
                Date / Amount{hasDateOrAmount ? " •" : ""}
                <motion.i
                  className={`ti ti-chevron-${filtersOpen ? "up" : "down"}`}
                  animate={{ rotate: filtersOpen ? 180 : 0 }}
                  transition={{ duration:0.18 }}
                  style={{ fontSize:11 }}
                />
              </motion.button>

              {/* Clear all */}
              <AnimatePresence>
                {hasActiveFilters && (
                  <motion.button
                    initial={{ opacity:0, scale:0.88 }}
                    animate={{ opacity:1, scale:1 }}
                    exit={{ opacity:0, scale:0.88 }}
                    transition={{ duration:0.14 }}
                    whileTap={{ scale:0.93 }}
                    onClick={() => { clearFilters(); fetchPayments(1, { methodFilter:"all", dateFrom:"", dateTo:"", amountMin:"", amountMax:"", sortField:"-payment_date" }); }}
                    style={{ height:32, padding:"0 14px", border:"1.5px solid #fca5a5", borderRadius:99, background:"white", color:"#b91c1c", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", display:"inline-flex", alignItems:"center", gap:5 }}
                  >
                    <i className="ti ti-filter-off" style={{ fontSize:12 }} />Clear
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Expanded date/amount panel */}
          <AnimatePresence initial={false}>
            {filtersOpen && (
              <motion.div
                key="date-amount-panel"
                initial={{ height:0, opacity:0, marginTop:0 }}
                animate={{ height:"auto", opacity:1, marginTop:14 }}
                exit={{ height:0, opacity:0, marginTop:0 }}
                transition={{ duration:0.22, ease:"easeInOut" }}
                style={{ overflow:"hidden" }}
              >
                <div style={{ paddingTop:14, borderTop:"1px solid #f5eaea", display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
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
                  {/* Quick date presets */}
                  <div>
                    <label style={filterLabel}>Quick</label>
                    <div style={{ display:"flex", gap:6 }}>
                      {[
                        { label:"Today",      fn:() => { const d=new Date().toISOString().slice(0,10); setDateFrom(d); setDateTo(d); } },
                        { label:"This Month", fn:() => { const now=new Date(); setDateFrom(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`); setDateTo(new Date().toISOString().slice(0,10)); } },
                        { label:"Last Month", fn:() => { const now=new Date(); const y=now.getMonth()===0?now.getFullYear()-1:now.getFullYear(); const m=now.getMonth()===0?12:now.getMonth(); const last=new Date(now.getFullYear(),now.getMonth(),0).getDate(); setDateFrom(`${y}-${String(m).padStart(2,"0")}-01`); setDateTo(`${y}-${String(m).padStart(2,"0")}-${last}`); } },
                      ].map((q) => (
                        <motion.button key={q.label} type="button" onClick={q.fn}
                          whileHover={{ borderColor:"#e03131", color:"#e03131" }}
                          whileTap={{ scale:0.96 }}
                          transition={{ duration:0.12 }}
                          style={{ height:34, padding:"0 10px", border:"1px solid #f0e4e4", borderRadius:8, background:"white", color:"#7a5050", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                        >
                          {q.label}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                  <motion.button
                    onClick={() => fetchPayments(1)}
                    whileHover={{ scale:1.02, boxShadow:"0 6px 16px rgba(224,49,49,0.30)" }}
                    whileTap={{ scale:0.97 }}
                    transition={{ duration:0.12 }}
                    style={{ height:34, padding:"0 18px", border:"none", borderRadius:8, background:"linear-gradient(135deg,#e03131,#c01a1a)", color:"white", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", marginLeft:"auto", boxShadow:"0 3px 10px rgba(224,49,49,0.22)" }}
                  >
                    Apply
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
              {loading ? (
                Array.from({ length:8 }).map((_, i) => (
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
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon="ti-cash"
                      iconBg="#e8f5e0"
                      iconColor="#2e6b0d"
                      title="No payments found"
                      subtitle={hasActiveFilters ? "Try adjusting your filters." : "Record the first payment to get started."}
                      action={!hasActiveFilters && (
                        <motion.button
                          onClick={() => setShowModal(true)}
                          whileHover={{ scale:1.02, boxShadow:"0 6px 16px rgba(46,107,13,0.30)" }}
                          whileTap={{ scale:0.97 }}
                          transition={{ duration:0.12 }}
                          style={{ marginTop:4, display:"inline-flex", alignItems:"center", gap:7, background:"linear-gradient(135deg,#2e6b0d,#256009)", color:"white", border:"none", borderRadius:10, padding:"10px 20px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(46,107,13,0.26)" }}
                        >
                          <i className="ti ti-cash" style={{ fontSize:14 }} />Record Payment
                        </motion.button>
                      )}
                    />
                  </td>
                </tr>
              ) : (
                <AnimatePresence mode="popLayout" initial={false}>
                  {payments.map((p) => {
                    const name  = p.invoice_detail?.student_name || null;
                    const invNo = p.invoice_detail?.invoice_no   || `#${p.invoice}`;
                    const mc    = PM[p.payment_method] ?? PM.others;
                    const pal   = avatarPalette(name);
                    return (
                      <motion.tr
                        key={p.payment_id}
                        initial={{ opacity:0, x:-10 }}
                        animate={{ opacity:1, x:0 }}
                        exit={{ opacity:0, x:-10 }}
                        transition={{ duration:0.18, ease:"easeOut" }}
                        style={{ borderBottom:"1px solid #f9f0f0", backgroundColor:"white", transition:"background-color 0.12s ease" }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor="#fffbfb"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor="white"}
                      >
                        {/* Student */}
                        <td style={{ padding:"11px 16px" }}>
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
                        <td style={{ padding:"11px 16px" }}>
                          <motion.button
                            onClick={() => navigate(`/invoices?selected=${p.invoice}`)}
                            whileHover={{ color:"#c01a1a" }}
                            transition={{ duration:0.12 }}
                            style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"monospace", fontSize:11.5, color:"#e03131", fontWeight:700, textDecoration:"underline", padding:0, whiteSpace:"nowrap" }}
                          >
                            {invNo}
                          </motion.button>
                        </td>

                        {/* Date */}
                        <td style={{ padding:"11px 16px", color:"#5a4a4a", whiteSpace:"nowrap" }}>
                          {fmtDate(p.payment_date)}
                        </td>

                        {/* Amount */}
                        <td style={{ padding:"11px 16px", fontWeight:700, color:"#2e6b0d", whiteSpace:"nowrap" }}>
                          {fmt(p.amount_paid)}
                        </td>

                        {/* Method */}
                        <td style={{ padding:"11px 16px" }}>
                          <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, padding:"3px 9px", borderRadius:99, background:mc.bg, color:mc.color, whiteSpace:"nowrap" }}>
                            <i className={`ti ${mc.icon}`} style={{ fontSize:11 }} />{mc.label}
                          </span>
                        </td>

                        {/* Reference */}
                        <td style={{ padding:"11px 16px", color:"#5a4a4a", fontFamily:"monospace", fontSize:11.5 }}>
                          {p.reference_number || <span style={{ color:"#d0b8b8" }}>—</span>}
                        </td>

                        {/* Notes */}
                        <td style={{ padding:"11px 16px", color:"#7a5050", fontSize:12, maxWidth:180 }}>
                          {p.notes
                            ? <span style={{ display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.notes}</span>
                            : <span style={{ color:"#d0b8b8" }}>—</span>}
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {!loading && pageMeta.count > 20 && (
            <div style={{ padding:"12px 16px", borderTop:"1px solid #f5eaea", background:"#fdfafa", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:12, color:"#b09090" }}>Page {page} of {totalPages} · {pageMeta.count} total</span>
              <div style={{ display:"flex", gap:6 }}>
                <motion.button
                  disabled={!pageMeta.previous}
                  onClick={() => fetchPayments(page - 1)}
                  whileHover={pageMeta.previous ? { borderColor:"#e03131", color:"#e03131" } : {}}
                  whileTap={pageMeta.previous ? { scale:0.93 } : {}}
                  transition={{ duration:0.12 }}
                  style={{ height:32, padding:"0 14px", border:"1px solid #f0e4e4", borderRadius:8, background:"white", display:"inline-flex", alignItems:"center", gap:5, cursor:pageMeta.previous ? "pointer" : "not-allowed", color:pageMeta.previous ? "#5a4a4a" : "#c0a0a0", fontSize:12, fontWeight:600, fontFamily:"'DM Sans',sans-serif", opacity:pageMeta.previous ? 1 : 0.5 }}
                >
                  <i className="ti ti-chevron-left" style={{ fontSize:13 }} />Prev
                </motion.button>
                <motion.button
                  disabled={!pageMeta.next}
                  onClick={() => fetchPayments(page + 1)}
                  whileHover={pageMeta.next ? { borderColor:"#e03131", color:"#e03131" } : {}}
                  whileTap={pageMeta.next ? { scale:0.93 } : {}}
                  transition={{ duration:0.12 }}
                  style={{ height:32, padding:"0 14px", border:"1px solid #f0e4e4", borderRadius:8, background:"white", display:"inline-flex", alignItems:"center", gap:5, cursor:pageMeta.next ? "pointer" : "not-allowed", color:pageMeta.next ? "#5a4a4a" : "#c0a0a0", fontSize:12, fontWeight:600, fontFamily:"'DM Sans',sans-serif", opacity:pageMeta.next ? 1 : 0.5 }}
                >
                  Next<i className="ti ti-chevron-right" style={{ fontSize:13 }} />
                </motion.button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Record Payment Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            key="record-payment-modal"
            initial={{ opacity:0 }}
            animate={{ opacity:1 }}
            exit={{ opacity:0 }}
            transition={{ duration:0.2 }}
          >
            <RecordPaymentModal
              preloadedInvoiceId={preloadedInvoiceId}
              onClose={() => setShowModal(false)}
              onSaved={() => { setShowModal(false); setRefreshKey((k) => k + 1); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

    </AppLayout>
  );
}
