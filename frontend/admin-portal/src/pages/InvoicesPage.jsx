import { useState, useEffect, useCallback, useRef } from "react";
import AppLayout from "../components/AppLayout";
import RecordPaymentModal from "../components/RecordPaymentModal";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";
import { motion, AnimatePresence } from "framer-motion";
import { pageVariants, listVariants, modalVariants, springTransition } from "../utils/motion";

// ── API ───────────────────────────────────────────────────────────────────────
import {
  getInvoices as _getInvoices,
  getInvoice as _getInvoice,
  getInvoiceBreakdown as _getBreakdown,
  getInvoiceSummary as _getInvoiceSummary,
  generateInvoice as _generateInvoice,
  voidInvoice as _voidInvoice,
} from "../api/billingApi";
import { getEnrollments as _getEnrollments } from "../api/enrollmentApi";

const getInvoices       = (p = {}) => _getInvoices(p);
const getInvoice        = (id)     => _getInvoice(id);
const getBreakdown      = (id)     => _getBreakdown(id);
const getInvoiceSummary = (p = {}) => _getInvoiceSummary(p);
const generateInvoice   = (p)      => _generateInvoice(p);
const voidInvoice       = (id)     => _voidInvoice(id);
const getEnrollments    = (p = {}) => _getEnrollments(p);

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

const fmt     = (n) => `₱${parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
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

  return (
    <div style={{ position:"fixed", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:999 }}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity:0 }}
        animate={{ opacity:1 }}
        exit={{ opacity:0 }}
        transition={{ duration:0.18 }}
        onClick={onClose}
        style={{ position:"absolute", inset:0, background:"rgba(26,10,10,0.4)", backdropFilter:"blur(4px)" }}
      />
      {/* Dialog */}
      <motion.div
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={springTransition}
        style={{ position:"relative", background:"white", borderRadius:20, width:500, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(224,49,49,0.18)" }}
      >
        <div style={{ padding:"22px 28px 18px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(to right,#fdfafa,white)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <i className="ti ti-receipt" style={{ fontSize:18, color:"#e03131" }} />
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:"#1a0a0a" }}>Generate Invoice</div>
              <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>Auto-creates invoice from fee schedule + scholarships</div>
            </div>
          </div>
          <motion.button
            onClick={onClose}
            whileHover={{ scale:1.1, color:"#e03131" }}
            whileTap={{ scale:0.9 }}
            transition={{ duration:0.12 }}
            style={{ background:"none", border:"none", cursor:"pointer", color:"#c0a0a0", fontSize:20, display:"flex", alignItems:"center" }}
          >
            <i className="ti ti-x" />
          </motion.button>
        </div>

        <div style={{ padding:"22px 28px" }}>
          {error && (
            <motion.div
              initial={{ opacity:0, y:-6 }}
              animate={{ opacity:1, y:0 }}
              style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#b91c1c", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}
            >
              <i className="ti ti-alert-circle" style={{ fontSize:14 }} />{error}
            </motion.div>
          )}

          {/* Search enrollment */}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:10.5, fontWeight:700, color:"#7a5050", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:6 }}>Enrollment *</label>
            {selected ? (
              <motion.div
                initial={{ opacity:0, scale:0.97 }}
                animate={{ opacity:1, scale:1 }}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", border:"1.5px solid #fde2de", borderRadius:10, background:"#fff8f6" }}
              >
                <i className="ti ti-clipboard-list" style={{ fontSize:16, color:"#e03131" }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{selected.student_name ?? `Enrollment #${selected.enrollment_id}`}</div>
                  <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>S.Y. {selected.school_year} · {selected.grade_level} · {selected.section}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background:"transparent", border:"1px solid #fde2de", borderRadius:7, padding:"5px 10px", fontSize:12, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Change</button>
              </motion.div>
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
                <AnimatePresence>
                  {open && search && (
                    <motion.div
                      initial={{ opacity:0, y:-6 }}
                      animate={{ opacity:1, y:0 }}
                      exit={{ opacity:0, y:-6 }}
                      transition={{ duration:0.14 }}
                      style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:6, background:"white", borderRadius:10, border:"1px solid #fde2de", boxShadow:"0 12px 40px rgba(224,49,49,0.14)", maxHeight:220, overflowY:"auto", zIndex:1000 }}
                    >
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
                    </motion.div>
                  )}
                </AnimatePresence>
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
                  <motion.button key={val} type="button" onClick={() => setPlan(val)}
                    animate={{
                      borderColor:    active ? meta.color : "#f0e4e4",
                      backgroundColor: active ? meta.bg   : "#ffffff",
                    }}
                    whileHover={{ scale:1.01 }}
                    whileTap={{ scale:0.98 }}
                    transition={{ duration:0.15, ease:"easeOut" }}
                    style={{ padding:"12px 14px", borderRadius:12, border:"1.5px solid", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textAlign:"left" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:active ? meta.color : "#1a0a0a" }}>{meta.label}</div>
                    <div style={{ fontSize:11, color:active ? meta.color : "#b09090", marginTop:2, opacity:0.85 }}>
                      {val === "monthly" ? "10 installments (Jun–Mar)" : val === "quarterly" ? "4 installments" : val === "semi_annual" ? "2 installments" : "1 installment"}
                      {discountNote}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ padding:"16px 28px 24px", display:"flex", justifyContent:"flex-end", gap:10, borderTop:"1px solid #f5eaea" }}>
          <motion.button
            onClick={onClose}
            whileHover={{ borderColor:"#e03131", color:"#e03131" }}
            whileTap={{ scale:0.97 }}
            transition={{ duration:0.12 }}
            style={{ background:"transparent", color:"#9a7070", border:"1.5px solid #fde2de", borderRadius:50, padding:"9px 22px", fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}
          >Cancel</motion.button>
          <motion.button
            onClick={handleGenerate}
            disabled={saving}
            whileHover={saving ? {} : { scale:1.02, boxShadow:"0 6px 20px rgba(224,49,49,0.35)" }}
            whileTap={saving ? {} : { scale:0.97 }}
            transition={{ duration:0.12 }}
            style={{ background:saving ? "#e87474" : "linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:50, padding:"9px 24px", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:saving ? "not-allowed" : "pointer", display:"inline-flex", alignItems:"center", gap:8, boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}
          >
            {saving ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:"spin 1s linear infinite" }} />Generating…</> : <><i className="ti ti-receipt" style={{ fontSize:13 }} />Generate Invoice</>}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Invoice Detail ────────────────────────────────────────────────────────────
function InvoiceDetail({ invoiceId, onVoided, onRecordPayment }) {
  const hasAnimated = useRef(false);
  const [invoice,    setInvoice]    = useState(null);
  const [breakdown,  setBreakdown]  = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [voiding,    setVoiding]    = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [tab,        setTab]        = useState("breakdown");

  useEffect(() => {
    setLoading(true); setInvoice(null); setBreakdown(null);
    hasAnimated.current = false;
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

  const isFirst = !hasAnimated.current;
  if (!loading && invoice && isFirst) hasAnimated.current = true;

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

  const TABS = [
    { id:"breakdown",    label:"Fee Breakdown", icon:"ti-list"     },
    { id:"installments", label:"Installments",  icon:"ti-calendar" },
    { id:"payments",     label:"Payments",      icon:"ti-cash"     },
  ];

  return (
    <motion.div
      variants={pageVariants.container}
      initial="hidden"
      animate="visible"
      style={{ display:"flex", flexDirection:"column", gap:14 }}
    >
      {/* Header */}
      <motion.div variants={pageVariants.item} style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"18px 22px", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <span style={{ fontSize:18, fontWeight:700, color:"#1a0a0a" }}>{invoice.invoice_no}</span>
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
              <motion.button
                onClick={() => onRecordPayment(invoiceId)}
                whileHover={{ scale:1.02, boxShadow:"0 6px 18px rgba(224,49,49,0.32)" }}
                whileTap={{ scale:0.96 }}
                transition={{ duration:0.12 }}
                style={{ display:"inline-flex", alignItems:"center", gap:6, background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 14px rgba(224,49,49,0.26)" }}
              >
                <i className="ti ti-cash" style={{ fontSize:13 }} />Record Payment
              </motion.button>
              <motion.button
                onClick={() => setShowVoidConfirm(true)}
                whileHover={{ borderColor:"#e03131", color:"#e03131" }}
                whileTap={{ scale:0.96 }}
                transition={{ duration:0.12 }}
                style={{ display:"inline-flex", alignItems:"center", gap:6, background:"white", color:"#9a7070", border:"1px solid #f0e4e4", borderRadius:10, padding:"8px 14px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
              >
                <i className="ti ti-ban" style={{ fontSize:13 }} />Void
              </motion.button>
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
            <motion.div
              initial={{ width:"0%" }}
              animate={{ width:`${paidPct}%` }}
              transition={{ type:"spring", stiffness:60, damping:18, delay:0.2 }}
              style={{ height:"100%", background:"linear-gradient(to right,#e03131,#c92a2a)", borderRadius:99 }}
            />
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={pageVariants.item} style={{ display:"flex", gap:2, background:"white", borderRadius:12, border:"1px solid #f5eaea", padding:5, alignSelf:"flex-start", position:"relative" }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <motion.button
              key={t.id}
              onClick={() => setTab(t.id)}
              whileHover={active ? {} : { color:"#e03131" }}
              whileTap={{ scale:0.97 }}
              transition={{ duration:0.12 }}
              style={{ display:"inline-flex", alignItems:"center", gap:6, height:34, padding:"0 16px", borderRadius:8, border:"none", background:"transparent", color:active ? "white" : "#9a7070", fontSize:12, fontWeight:active ? 700 : 500, fontFamily:"'DM Sans',sans-serif", cursor:"pointer", position:"relative", zIndex:1, whiteSpace:"nowrap" }}
            >
              {active && (
                <motion.div
                  layoutId="invoice-tab-pill"
                  transition={{ type:"spring", stiffness:380, damping:34 }}
                  style={{ position:"absolute", inset:0, borderRadius:8, background:"linear-gradient(135deg,#e03131,#c92a2a)", zIndex:-1 }}
                />
              )}
              <i className={`ti ${t.icon}`} style={{ fontSize:13, position:"relative" }} />
              <span style={{ position:"relative" }}>{t.label}</span>
              {t.id === "payments" && (invoice.payments?.length ?? 0) > 0 && (
                <span style={{ fontSize:10, fontWeight:700, background:active ? "rgba(255,255,255,0.3)" : "#f0e8e8", color:active ? "white" : "#e03131", borderRadius:99, padding:"1px 6px", position:"relative" }}>
                  {invoice.payments.length}
                </span>
              )}
            </motion.button>
          );
        })}
      </motion.div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {tab === "breakdown" && (
          <motion.div
            key="breakdown"
            initial={{ opacity:0, y:8 }}
            animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, y:-8 }}
            transition={{ duration:0.18, ease:"easeOut" }}
            style={{ display:"flex", flexDirection:"column", gap:12 }}
          >
            {[
              { key:"tuition", items:tuitionItems, label:"Tuition Fees",        color:"#e03131", bg:"#fff0f0", note:"Discounts applied below" },
              { key:"misc",    items:miscItems,    label:"Miscellaneous Fees",   color:"#1455a0", bg:"#e3f0fd", note:"No discount" },
              { key:"other",   items:otherItems,   label:"Other Fees",           color:"#2e6b0d", bg:"#e8f5e0", note:"No discount" },
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

            <div style={{ background:"linear-gradient(135deg,#e03131,#c92a2a)", borderRadius:14, padding:"18px 22px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.7)", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.07em" }}>Net Amount Due</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", marginTop:2 }}>After all discounts · {planMeta.label} plan</div>
              </div>
              <div style={{ fontSize:28, fontWeight:700, color:"white" }}>{fmt(netAmount)}</div>
            </div>
          </motion.div>
        )}

        {tab === "installments" && (
          <motion.div
            key="installments"
            initial={{ opacity:0, y:8 }}
            animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, y:-8 }}
            transition={{ duration:0.18, ease:"easeOut" }}
            style={{ background:"white", borderRadius:14, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 8px rgba(224,49,49,0.04)" }}
          >
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
          </motion.div>
        )}

        {tab === "payments" && (() => {
          const payments     = invoice.payments ?? [];
          const totalPaidAmt = payments.reduce((s, p) => s + parseFloat(p.amount_paid), 0);
          const pmColors     = Object.fromEntries(
            [
              { value:"cash",          color:"#2e6b0d", bg:"#e8f5e0", icon:"ti-cash"          },
              { value:"gcash",         color:"#1455a0", bg:"#e3f0fd", icon:"ti-device-mobile"  },
              { value:"bank_transfer", color:"#7c3aed", bg:"#f0e8fd", icon:"ti-building-bank"  },
              { value:"card",          color:"#d97706", bg:"#fdf5e8", icon:"ti-credit-card"    },
              { value:"check",         color:"#854f0b", bg:"#faeeda", icon:"ti-file-text"      },
              { value:"others",        color:"#5c5752", bg:"#f0ede8", icon:"ti-dots"           },
            ].map((m) => [m.value, m])
          );
          return (
            <motion.div
              key="payments"
              initial={{ opacity:0, y:8 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:-8 }}
              transition={{ duration:0.18, ease:"easeOut" }}
              style={{ background:"white", borderRadius:14, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 8px rgba(224,49,49,0.04)" }}
            >
              <div style={{ padding:"12px 18px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#fdfafa" }}>
                <span style={{ fontSize:12, fontWeight:600, color:"#7a5050" }}>
                  {payments.length} payment{payments.length !== 1 ? "s" : ""} · {fmt(totalPaidAmt)} collected
                </span>
                {invoice.status !== "void" && balance > 0 && (
                  <motion.button
                    onClick={() => onRecordPayment(invoiceId)}
                    whileHover={{ scale:1.03, boxShadow:"0 4px 12px rgba(46,107,13,0.28)" }}
                    whileTap={{ scale:0.96 }}
                    transition={{ duration:0.12 }}
                    style={{ display:"inline-flex", alignItems:"center", gap:6, height:30, padding:"0 12px", border:"none", borderRadius:8, background:"linear-gradient(135deg,#2e6b0d,#256009)", color:"white", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 3px 10px rgba(46,107,13,0.22)" }}
                  >
                    <i className="ti ti-plus" style={{ fontSize:11 }} />Record Payment
                  </motion.button>
                )}
                {invoice.status !== "void" && balance <= 0 && (
                  <span style={{ fontSize:11, fontWeight:700, color:"#2e6b0d", display:"inline-flex", alignItems:"center", gap:4 }}>
                    <i className="ti ti-circle-check" style={{ fontSize:12 }} />Fully paid
                  </span>
                )}
              </div>

              {payments.length === 0 ? (
                <div style={{ padding:"40px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:"#e8f5e0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <i className="ti ti-cash" style={{ fontSize:20, color:"#2e6b0d" }} />
                  </div>
                  <div style={{ fontSize:13, color:"#b09090", fontStyle:"italic" }}>No payments recorded yet.</div>
                  {invoice.status !== "void" && (
                    <motion.button
                      onClick={() => onRecordPayment(invoiceId)}
                      whileHover={{ scale:1.03 }}
                      whileTap={{ scale:0.96 }}
                      transition={{ duration:0.12 }}
                      style={{ marginTop:4, display:"inline-flex", alignItems:"center", gap:6, height:34, padding:"0 16px", border:"none", borderRadius:8, background:"linear-gradient(135deg,#2e6b0d,#256009)", color:"white", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                    >
                      <i className="ti ti-cash" style={{ fontSize:12 }} />Record First Payment
                    </motion.button>
                  )}
                </div>
              ) : (
                <>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead>
                      <tr style={{ background:"#fdfafa" }}>
                        {["Date","Amount","Method","Reference","Notes"].map((h) => (
                          <th key={h} style={{ textAlign:"left", fontSize:10.5, fontWeight:600, color:"#c0a0a0", padding:"12px 18px", borderBottom:"1px solid #f5eaea", textTransform:"uppercase", letterSpacing:"0.07em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => {
                        const mc = pmColors[p.payment_method] ?? pmColors.others;
                        return (
                          <tr key={p.payment_id} style={{ borderBottom:"1px solid #f9f0f0" }}
                            onMouseEnter={(e) => { Array.from(e.currentTarget.cells).forEach((c) => c.style.background="#fff8f6"); }}
                            onMouseLeave={(e) => { Array.from(e.currentTarget.cells).forEach((c) => c.style.background=""); }}>
                            <td style={{ padding:"11px 18px", color:"#1a0a0a" }}>{fmtDate(p.payment_date)}</td>
                            <td style={{ padding:"11px 18px", fontWeight:700, color:"#2e6b0d" }}>{fmt(p.amount_paid)}</td>
                            <td style={{ padding:"11px 18px" }}>
                              <span style={{ fontSize:11, fontWeight:600, padding:"3px 8px", borderRadius:99, background:mc.bg, color:mc.color, display:"inline-flex", alignItems:"center", gap:4 }}>
                                <i className={`ti ${mc.icon}`} style={{ fontSize:11 }} />
                                {p.payment_method.replace("_", " ")}
                              </span>
                            </td>
                            <td style={{ padding:"11px 18px", color:"#5a4a4a", fontFamily:"monospace", fontSize:12 }}>{p.reference_number || "—"}</td>
                            <td style={{ padding:"11px 18px", color:"#7a5050", fontSize:12 }}>{p.notes || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ padding:"10px 18px", borderTop:"1px solid #f5eaea", background:"#fdfafa", display:"flex", justifyContent:"flex-end", gap:20 }}>
                    <span style={{ fontSize:12, color:"#b09090" }}>Total collected</span>
                    <span style={{ fontSize:13, fontWeight:700, color:"#2e6b0d" }}>{fmt(totalPaidAmt)}</span>
                  </div>
                </>
              )}
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Void confirm modal */}
      <AnimatePresence>
        {showVoidConfirm && (
          <div style={{ position:"fixed", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:999 }}>
            <motion.div
              initial={{ opacity:0 }}
              animate={{ opacity:1 }}
              exit={{ opacity:0 }}
              transition={{ duration:0.18 }}
              onClick={() => setShowVoidConfirm(false)}
              style={{ position:"absolute", inset:0, background:"rgba(26,10,10,0.4)", backdropFilter:"blur(4px)" }}
            />
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={springTransition}
              style={{ position:"relative", background:"white", borderRadius:20, padding:"32px 36px", width:380, boxShadow:"0 24px 64px rgba(224,49,49,0.18)", display:"flex", flexDirection:"column", alignItems:"center", gap:14 }}
            >
              <div style={{ width:56, height:56, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <i className="ti ti-ban" style={{ fontSize:24, color:"#e03131" }} />
              </div>
              <div style={{ fontSize:17, fontWeight:700, color:"#1a0a0a" }}>Void Invoice?</div>
              <div style={{ fontSize:13, color:"#7a5050", textAlign:"center", lineHeight:1.7 }}>
                This will mark invoice <strong>{invoice.invoice_no}</strong> as void. This cannot be undone.
              </div>
              <div style={{ display:"flex", gap:10, width:"100%" }}>
                <motion.button
                  onClick={() => setShowVoidConfirm(false)}
                  whileHover={{ borderColor:"#e03131", color:"#e03131" }}
                  whileTap={{ scale:0.97 }}
                  transition={{ duration:0.12 }}
                  style={{ flex:1, height:42, border:"1.5px solid #f0e0e0", borderRadius:10, background:"white", fontSize:13, color:"#7a5050", cursor:"pointer", fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}
                >Cancel</motion.button>
                <motion.button
                  onClick={handleVoid}
                  disabled={voiding}
                  whileHover={voiding ? {} : { scale:1.02, boxShadow:"0 6px 18px rgba(224,49,49,0.32)" }}
                  whileTap={voiding ? {} : { scale:0.97 }}
                  transition={{ duration:0.12 }}
                  style={{ flex:1, height:42, border:"none", borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", fontSize:13, color:"white", cursor:"pointer", fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}
                >
                  {voiding ? "Voiding…" : "Yes, void"}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function InvoicesPage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [searchParams] = useSearchParams();
  const hasAnimated = useRef(false);

  const [invoices,     setInvoices]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedId,   setSelectedId]   = useState(() => {
    const p = searchParams.get("selected");
    return p ? parseInt(p) : null;
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter,   setPlanFilter]   = useState("all");
  const [page,         setPage]         = useState(1);
  const [pageMeta,     setPageMeta]     = useState({ count:0, next:null, previous:null });
  const [showGenModal,      setShowGenModal]      = useState(false);
  const [payModalInvoiceId, setPayModalInvoiceId] = useState(null);
  const [refreshKey,        setRefreshKey]        = useState(0);
  const [summary,           setSummary]           = useState({ unpaid:0, partially_paid:0, paid:0, void:0, total:0 });

  const fetchInvoices = useCallback(async (p = 1, status = statusFilter, plan = planFilter) => {
    setLoading(true);
    try {
      const params = { page: p };
      if (status !== "all") params.status = status;
      if (plan   !== "all") params.payment_plan = plan;

      const summaryParams = {};
      if (plan !== "all") summaryParams.payment_plan = plan;

      const [data, summaryData] = await Promise.all([
        getInvoices(params),
        getInvoiceSummary(summaryParams),
      ]);
      setInvoices(Array.isArray(data) ? data : data?.results ?? []);
      setPageMeta({ count: data.count ?? 0, next: data.next, previous: data.previous });
      setPage(p);
      setSummary(summaryData);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [statusFilter, planFilter]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchInvoices();
  }, [refreshKey]);

  const totalPages = Math.ceil(pageMeta.count / 20);

  const isFirstRender = !hasAnimated.current;
  if (isFirstRender) hasAnimated.current = true;

  const STAT_CARDS = [
    { label:"Unpaid",  statusKey:"unpaid",         value:summary.unpaid,         icon:"ti-clock",        ...STATUS_META.unpaid         },
    { label:"Partial", statusKey:"partially_paid", value:summary.partially_paid, icon:"ti-clock-half-2", ...STATUS_META.partially_paid },
    { label:"Paid",    statusKey:"paid",            value:summary.paid,           icon:"ti-circle-check", ...STATUS_META.paid           },
    { label:"Void",    statusKey:"void",            value:summary.void,           icon:"ti-ban",          ...STATUS_META.void           },
  ];

  return (
    <AppLayout>
      {/* Topbar */}
      <div style={{ background:"white", borderBottom:"1px solid #f5eaea", padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" }}>
        <motion.div
          initial={isFirstRender ? { opacity:0, y:-8 } : false}
          animate={{ opacity:1, y:0 }}
          transition={{ duration:0.22, ease:[0.4,0,0.2,1] }}
        >
          <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a" }}>Invoices</div>
          <div style={{ fontSize:11.5, color:"#b09090", marginTop:1 }}>
            {loading ? "Loading…" : `${summary.total} total · ${summary.unpaid} unpaid · ${summary.partially_paid} partial`}
          </div>
        </motion.div>
        <motion.button
          onClick={() => setShowGenModal(true)}
          initial={isFirstRender ? { opacity:0, y:-8 } : false}
          animate={{ opacity:1, y:0 }}
          transition={{ duration:0.22, ease:[0.4,0,0.2,1], delay:0.05 }}
          whileHover={{ scale:1.02, boxShadow:"0 6px 20px rgba(224,49,49,0.35)" }}
          whileTap={{ scale:0.96 }}
          style={{ display:"inline-flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}
        >
          <i className="ti ti-receipt" style={{ fontSize:15 }} />Generate Invoice
        </motion.button>
      </div>

      {/* Content */}
      <motion.div
        style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 }}
        variants={pageVariants.container}
        initial={isFirstRender ? "hidden" : false}
        animate="visible"
      >
        {/* Stat cards */}
        <motion.div
          variants={listVariants.container}
          initial={isFirstRender ? "hidden" : false}
          animate="visible"
          style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:12 }}
        >
          {STAT_CARDS.map((s) => {
            const isActive = statusFilter === s.statusKey;
            return (
              <motion.div
                key={s.label}
                variants={listVariants.item}
                onClick={() => { const next = isActive ? "all" : s.statusKey; setStatusFilter(next); fetchInvoices(1, next, planFilter); }}
                whileHover={{ y:-2, boxShadow: isActive ? `0 8px 24px ${s.color}28` : "0 6px 20px rgba(224,49,49,0.10)", borderColor: s.color }}
                whileTap={{ scale:0.97 }}
                animate={{ borderColor: isActive ? s.color : "#f5eaea", backgroundColor: isActive ? s.bg : "#ffffff" }}
                transition={{ duration:0.15, ease:"easeOut" }}
                style={{ borderRadius:14, padding:"16px 20px", border:"1.5px solid", display:"flex", alignItems:"center", gap:14, boxShadow:"0 2px 12px rgba(224,49,49,0.06)", cursor:"pointer" }}
              >
                <div style={{ width:42, height:42, borderRadius:12, background:isActive ? "white" : s.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"background 0.15s" }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize:18, color:s.color }} />
                </div>
                <div>
                  {loading ? <Sk w={40} h={20} r={4} /> : <div style={{ fontSize:22, fontWeight:700, color: isActive ? s.color : "#1a0a0a", lineHeight:1 }}>{s.value}</div>}
                  <div style={{ fontSize:11, color: isActive ? s.color : "#a07878", marginTop:4, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.06em" }}>{s.label}</div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Filter panel */}
        <motion.div
          variants={pageVariants.item}
          style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"16px 20px", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", display:"flex", flexDirection:"column", gap:12 }}
        >
          {/* Status chips */}
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"#c0a0a0", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Status</div>
            <motion.div layout style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
              {[
                { value:"all",          label:"All",     bg:"#fff0f0", color:"#e03131" },
                { value:"unpaid",       ...STATUS_META.unpaid },
                { value:"partially_paid", ...STATUS_META.partially_paid },
                { value:"paid",         ...STATUS_META.paid  },
                { value:"void",         ...STATUS_META.void  },
              ].map((s) => {
                const active = statusFilter === s.value;
                return (
                  <motion.button key={s.value}
                    layout
                    initial={false}
                    animate={{
                      backgroundColor: active ? s.bg    : "#ffffff",
                      color:           active ? s.color : "#9a7070",
                      borderColor:     active ? s.color : "#f0e4e4",
                    }}
                    transition={{ layout:{ type:"spring", stiffness:400, damping:36 }, duration:0.18, ease:"easeOut" }}
                    whileTap={{ scale:0.96 }}
                    onClick={() => { setStatusFilter(s.value); fetchInvoices(1, s.value, planFilter); }}
                    style={{ display:"inline-flex", alignItems:"center", gap:6, height:32, padding:"0 14px", borderRadius:99, fontSize:12, fontWeight:600, border:"1.5px solid", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                  >
                    {s.label}
                  </motion.button>
                );
              })}
            </motion.div>
          </div>

          {/* Plan chips */}
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"#c0a0a0", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Payment Plan</div>
            <motion.div layout style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
              {[
                { value:"all",         label:"All",         bg:"#fff0f0", color:"#e03131" },
                { value:"monthly",     ...PLAN_META.monthly     },
                { value:"quarterly",   ...PLAN_META.quarterly   },
                { value:"semi_annual", ...PLAN_META.semi_annual },
                { value:"annual",      ...PLAN_META.annual      },
              ].map((p) => {
                const active = planFilter === p.value;
                return (
                  <motion.button key={p.value}
                    layout
                    initial={false}
                    animate={{
                      backgroundColor: active ? p.bg    : "#ffffff",
                      color:           active ? p.color : "#9a7070",
                      borderColor:     active ? p.color : "#f0e4e4",
                    }}
                    transition={{ layout:{ type:"spring", stiffness:400, damping:36 }, duration:0.18, ease:"easeOut" }}
                    whileTap={{ scale:0.96 }}
                    onClick={() => { setPlanFilter(p.value); fetchInvoices(1, statusFilter, p.value); }}
                    style={{ display:"inline-flex", alignItems:"center", gap:6, height:32, padding:"0 14px", borderRadius:99, fontSize:12, fontWeight:600, border:"1.5px solid", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                  >
                    {p.label}
                  </motion.button>
                );
              })}
            </motion.div>
          </div>
        </motion.div>

        {/* Master / detail */}
        <motion.div
          variants={pageVariants.item}
          style={{ display:"grid", gridTemplateColumns:"360px 1fr", gap:16, alignItems:"flex-start" }}
        >
          {/* Left: Invoice list */}
          <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}>
            <div style={{ overflowY:"auto", maxHeight:"calc(100vh - 340px)" }}>
              {loading ? (
                Array.from({ length:8 }).map((_, i) => (
                  <div key={i} style={{ padding:"14px 16px", borderBottom:"1px solid #f9f0f0", display:"flex", flexDirection:"column", gap:8 }}>
                    <Sk w={140} h={14} /><Sk w={100} h={11} /><Sk w={80} h={11} />
                  </div>
                ))
              ) : invoices.length === 0 ? (
                <motion.div
                  initial={{ opacity:0 }}
                  animate={{ opacity:1 }}
                  style={{ padding:"48px 16px", textAlign:"center" }}
                >
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                    <div style={{ width:52, height:52, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <i className="ti ti-receipt-off" style={{ fontSize:22, color:"#e08080" }} />
                    </div>
                    <div style={{ fontSize:14, color:"#7a5050", fontWeight:600 }}>No invoices found</div>
                    <div style={{ fontSize:12, color:"#b09090" }}>Try adjusting your filters</div>
                  </div>
                </motion.div>
              ) : (
                <AnimatePresence mode="popLayout" initial={false}>
                  {invoices.map((inv) => {
                    const sm = STATUS_META[inv.status] ?? STATUS_META.unpaid;
                    const pm = PLAN_META[inv.payment_plan] ?? PLAN_META.monthly;
                    const isSelected = selectedId === inv.invoice_id;
                    const en = inv.enrollment_detail;
                    const balance = parseFloat(inv.balance ?? 0);
                    const isOverdue = inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== "paid" && inv.status !== "void";
                    return (
                      <motion.div
                        key={inv.invoice_id}
                        initial={{ opacity:0, x:-10 }}
                        animate={{ opacity:1, x:0 }}
                        exit={{ opacity:0, x:-10 }}
                        transition={{ duration:0.18, ease:"easeOut" }}
                        style={{ padding:"13px 16px", borderBottom:"1px solid #f9f0f0", cursor:"pointer", background:isSelected ? "#fff8f6" : "white", borderLeft:`3px solid ${isSelected ? "#e03131" : isOverdue ? "#7c3aed" : "transparent"}` }}
                        onClick={() => setSelectedId(inv.invoice_id)}
                        whileHover={{ backgroundColor: isSelected ? "#fff8f6" : "#fff4f4" }}
                      >
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:"#1a0a0a", fontFamily:"monospace" }}>{inv.invoice_no}</span>
                          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                            {isOverdue && <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:99, background:"#f0e8fd", color:"#7c3aed" }}>Overdue</span>}
                            <span style={{ fontSize:10.5, fontWeight:700, padding:"2px 7px", borderRadius:99, background:sm.bg, color:sm.color }}>{sm.label}</span>
                          </div>
                        </div>
                        <div style={{ fontSize:12, color:"#5a4a4a", fontWeight:600, marginBottom:2 }}>{en?.student_name ?? `Enrollment #${inv.enrollment_id}`}</div>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                            <span style={{ fontSize:10.5, fontWeight:600, padding:"1px 6px", borderRadius:99, background:pm.bg, color:pm.color }}>{pm.label}</span>
                            <span style={{ fontSize:11, color:"#b09090" }}>{en?.grade_level ?? ""}</span>
                          </div>
                          <span style={{ fontSize:12, fontWeight:700, color: balance > 0 ? "#a32d2d" : "#2e6b0d" }}>{fmt(balance)} bal.</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>

            {/* Pagination */}
            {!loading && pageMeta.count > 20 && (
              <div style={{ padding:"10px 16px", borderTop:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#fdfafa" }}>
                <span style={{ fontSize:12, color:"#b09090" }}>Page {page} of {totalPages} · {pageMeta.count} total</span>
                <div style={{ display:"flex", gap:4 }}>
                  <motion.button
                    disabled={!pageMeta.previous}
                    onClick={() => fetchInvoices(page - 1)}
                    whileHover={pageMeta.previous ? { borderColor:"#e03131", color:"#e03131" } : {}}
                    whileTap={pageMeta.previous ? { scale:0.93 } : {}}
                    transition={{ duration:0.12 }}
                    style={{ width:30, height:30, border:"1px solid #f0e4e4", borderRadius:8, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:pageMeta.previous ? "pointer" : "not-allowed", color:"#9a7070", opacity:pageMeta.previous ? 1 : 0.4 }}
                  >
                    <i className="ti ti-chevron-left" style={{ fontSize:13 }} />
                  </motion.button>
                  <motion.button
                    disabled={!pageMeta.next}
                    onClick={() => fetchInvoices(page + 1)}
                    whileHover={pageMeta.next ? { borderColor:"#e03131", color:"#e03131" } : {}}
                    whileTap={pageMeta.next ? { scale:0.93 } : {}}
                    transition={{ duration:0.12 }}
                    style={{ width:30, height:30, border:"1px solid #f0e4e4", borderRadius:8, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:pageMeta.next ? "pointer" : "not-allowed", color:"#9a7070", opacity:pageMeta.next ? 1 : 0.4 }}
                  >
                    <i className="ti ti-chevron-right" style={{ fontSize:13 }} />
                  </motion.button>
                </div>
              </div>
            )}

            {/* Aggregate totals footer */}
            {!loading && invoices.length > 0 && (() => {
              const pageTotal    = invoices.reduce((s, i) => s + parseFloat(i.balance ?? 0), 0);
              const overdueCount = invoices.filter((i) => i.due_date && new Date(i.due_date) < new Date() && i.status !== "paid" && i.status !== "void").length;
              return (
                <div style={{ padding:"10px 16px", borderTop:"1px solid #f5eaea", background:"#fdfafa", display:"flex", gap:12, flexWrap:"wrap" }}>
                  <div style={{ fontSize:11, color:"#b09090" }}>
                    <span style={{ fontWeight:600, color:"#1a0a0a" }}>{fmt(pageTotal)}</span> outstanding this page
                  </div>
                  {overdueCount > 0 && (
                    <div style={{ fontSize:11, color:"#7c3aed", fontWeight:600 }}>
                      <i className="ti ti-alert-triangle" style={{ fontSize:11, marginRight:3 }} />{overdueCount} overdue
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Right: Detail panel */}
          <AnimatePresence mode="wait">
            {selectedId ? (
              <motion.div
                key={`detail-${selectedId}`}
                initial={{ opacity:0, x:16 }}
                animate={{ opacity:1, x:0 }}
                exit={{ opacity:0, x:16 }}
                transition={{ duration:0.22, ease:"easeOut" }}
              >
                <InvoiceDetail
                  key={`${selectedId}-${refreshKey}`}
                  invoiceId={selectedId}
                  onVoided={() => { setSelectedId(null); setRefreshKey((k) => k + 1); }}
                  onRecordPayment={(id) => setPayModalInvoiceId(id)}
                  onPaymentSaved={() => setRefreshKey((k) => k + 1)}
                />
              </motion.div>
            ) : !loading && invoices.length > 0 ? (
              <motion.div
                key="empty-detail"
                initial={{ opacity:0 }}
                animate={{ opacity:1 }}
                exit={{ opacity:0 }}
                transition={{ duration:0.18 }}
                style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"56px 24px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, color:"#b09090", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}
              >
                <div style={{ width:52, height:52, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <i className="ti ti-receipt" style={{ fontSize:22, color:"#e08080" }} />
                </div>
                <div style={{ fontSize:14, fontWeight:600, color:"#7a5050" }}>Select an invoice</div>
                <div style={{ fontSize:13 }}>Click an invoice on the left to view its details</div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* Generate modal */}
      <AnimatePresence>
        {showGenModal && (
          <GenerateModal
            onClose={() => setShowGenModal(false)}
            onGenerated={(inv) => { setRefreshKey((k) => k + 1); setSelectedId(inv.invoice_id); }}
          />
        )}
      </AnimatePresence>

      {/* Record payment modal */}
      {payModalInvoiceId && (
        <RecordPaymentModal
          preloadedInvoiceId={payModalInvoiceId}
          onClose={() => setPayModalInvoiceId(null)}
          onSaved={() => { setPayModalInvoiceId(null); setRefreshKey((k) => k + 1); }}
        />
      )}
    </AppLayout>
  );
}
