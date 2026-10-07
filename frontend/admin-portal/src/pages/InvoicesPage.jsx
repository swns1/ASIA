import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import useYearFilter from "../hooks/useYearFilter";
import { useState, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import RecordPaymentModal from "../components/RecordPaymentModal";
import ConfirmModal from "../components/ConfirmModal";
import EmptyState from "../components/EmptyState";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { pageVariants } from "../utils/motion";

import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card, { Panel } from "../components/ui/Card";
import Tabs from "../components/ui/Tabs";
import StatusBand from "../components/ui/StatusBand";
import FilterMenu from "../components/ui/FilterMenu";
import SearchField from "../components/ui/SearchField";
import SchoolYearMenu from "../components/ui/SchoolYearMenu";
import ErrorState from "../components/ui/ErrorState";
import Pagination from "../components/Pagination";
import Badge, { StatusBadge, StatusDot } from "../components/ui/Badge";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Modal from "../components/ui/Modal";
import Skeleton from "../components/ui/Skeleton";
import { INVOICE_STATUS_MAP } from "../constants/statusMaps";
import { STATUS_TEXT } from "../constants/statusTones";
import { paymentMethodMeta } from "../constants/paymentMethods";

// ── API ───────────────────────────────────────────────────────────────────────
import {
  getInvoices as _getInvoices,
  getInvoice as _getInvoice,
  getInvoiceSummary as _getInvoiceSummary,
  generateInvoice as _generateInvoice,
  voidInvoice as _voidInvoice,
  reissueInvoice as _reissueInvoice,
  getDiscountTypes as _getDiscountTypes,
} from "../api/billingApi";
import { getEnrollments as _getEnrollments } from "../api/enrollmentApi";
import { fmtDate } from "../utils/format";

const getInvoices       = (p = {}) => _getInvoices(p);
const getInvoice        = (id)     => _getInvoice(id);
const getInvoiceSummary = (p = {}) => _getInvoiceSummary(p);
const generateInvoice   = (p)      => _generateInvoice(p);
const voidInvoice       = (id)     => _voidInvoice(id);
const reissueInvoice    = (id, p)  => _reissueInvoice(id, p);
const getEnrollments    = (p = {}) => _getEnrollments(p);

// ── Constants ─────────────────────────────────────────────────────────────────
// Amount and balance are worked out on the server (billing.views.with_amounts);
// they used to be offered here and silently ignored.
const SORT_OPTIONS = [
  { value: "-invoice_id",   label: "Newest first" },
  { value: "invoice_id",    label: "Oldest first" },
  { value: "-balance",      label: "Largest balance" },
  { value: "balance",       label: "Smallest balance" },
  { value: "-net_amount",   label: "Largest amount" },
  { value: "net_amount",    label: "Smallest amount" },
  { value: "due_date",      label: "Earliest due date" },
  { value: "-due_date",     label: "Latest due date" },
];
const DEFAULT_ORDERING = "-invoice_id";

// The band's legend, in the order the bar draws them.
const STATUS_FILTERS = ["unpaid", "partially_paid", "paid", "void"];

const DUE_FILTERS = [
  { value: "",        label: "Any" },
  { value: "overdue", label: "A payment is past due" },
];

// Long enough that a word is finished, short enough that the list keeps up.
// The same wait as the other list pages.
const SEARCH_DEBOUNCE_MS = 300;

// `tone` names the shared palette entry; the bg/color literals stay for the
// inline plan pill on each list row until that moves to a shared Badge.
const PLAN_META = {
  monthly:     { label:"Monthly",     color:"#1455a0", bg:"#e3f0fd", tone:"info" },
  quarterly:   { label:"Quarterly",   color:"#2e6b0d", bg:"#e8f5e0", tone:"success" },
  semi_annual: { label:"Semi-Annual", color:"#7c3aed", bg:"#f0e8fd", tone:"accent" },
  annual:      { label:"Annual",      color:"#854f0b", bg:"#fdf5e8", tone:"warning" },
};

const PLAN_FILTERS = [
  { value: "", label: "Any" },
  ...Object.entries(PLAN_META).map(([value, m]) => ({ value, label: m.label })),
];

// Detail-panel tables. Neither is sortable — both render a short, already
// ordered list (installments by sequence, payments by date).
const INSTALLMENT_COLUMNS = [
  { key: "sequence", label: "#" },
  { key: "due_date", label: "Due Date" },
  { key: "amount",   label: "Amount" },
  { key: "paid",     label: "Paid" },
  { key: "balance",  label: "Balance" },
  { key: "status",   label: "Status" },
];

const PAYMENT_COLUMNS = [
  { key: "date",      label: "Date" },
  { key: "amount",    label: "Amount" },
  { key: "method",    label: "Method" },
  { key: "receipt",   label: "" },
  { key: "reference", label: "Reference" },
  { key: "notes",     label: "Notes" },
];

const fmt     = (n) => `₱${parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;


const PLAN_INSTALLMENTS = {
  monthly: "10 installments (Jun–Mar)",
  quarterly: "4 installments",
  semi_annual: "2 installments",
  annual: "1 installment",
};
const PLAN_DISCOUNT_CODE = { semi_annual: "SEMI_ANNUAL_PLAN", annual: "ANNUAL_PLAN" };

/** The plan-discount percentages as configured, keyed by plan. The labels used
 *  to hardcode 3% and 5%, which stop being true the moment the rate is edited. */
function usePlanRates() {
  const [rates, setRates] = useState({ semi_annual: 3, annual: 5 });
  useEffect(() => {
    let cancelled = false;
    _getDiscountTypes()
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : data?.results ?? [];
        const byCode = Object.fromEntries(rows.map((r) => [r.discount_code, Number(r.discount_value)]));
        setRates((prev) => {
          const next = { ...prev };
          for (const [plan, code] of Object.entries(PLAN_DISCOUNT_CODE)) {
            if (byCode[code] !== undefined) next[plan] = byCode[code];
          }
          return next;
        });
      })
      .catch(() => { /* keep the defaults */ });
    return () => { cancelled = true; };
  }, []);
  return rates;
}

function PlanChoice({ plan, onChange }) {
  const rates = usePlanRates();
  return (
    <div style={{ display:"grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap:8 }}>
      {Object.entries(PLAN_META).map(([val, meta]) => {
        const active = plan === val;
        const pct = rates[val];
        const discountNote = pct ? ` · ${pct}% off tuition` : "";
        return (
          <motion.button key={val} type="button" onClick={() => onChange(val)}
            aria-pressed={active}
            animate={{
              borderColor:    active ? meta.color : "#f0e4e4",
              backgroundColor: active ? meta.bg   : "#ffffff",
            }}
            whileHover={{ scale:1.01 }}
            whileTap={{ scale:0.98 }}
            transition={{ duration:0.15, ease:"easeOut" }}
            style={{ padding:"12px 14px", borderRadius:12, border:"1.5px solid", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textAlign:"left" }}>
            <div style={{ fontSize:13, fontWeight:700, color:active ? meta.color : "#1a0a0a" }}>{meta.label}</div>
            <div style={{ fontSize:11, color:active ? meta.color : "#8a6a6a", marginTop:2, opacity:0.85 }}>
              {PLAN_INSTALLMENTS[val]}{discountNote}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ── Generate Invoice Modal ────────────────────────────────────────────────────
function GenerateModal({ onClose, onGenerated, onOpenExisting }) {
  const [search,      setSearch]      = useState("");
  const [enrollments, setEnrollments] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [plan,        setPlan]        = useState("monthly");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");
  // The student's live invoice for the year, when Generate finds one: one
  // invoice per student per year, so the way forward is to open (or re-issue) it.
  const [existing,    setExisting]    = useState(null);
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
    setSaving(true); setError(""); setExisting(null);
    try {
      const inv = await generateInvoice({ enrollment_id: selected.enrollment_id, payment_plan: plan });
      onGenerated(inv);
      onClose();
    } catch (e) {
      const data = e?.response?.data;
      if (data?.code === "already_invoiced") setExisting({ id: data.invoice_id, no: data.invoice_no });
      setError(data?.detail || e.message || "Failed to generate.");
    }
    finally { setSaving(false); }
  };

  return (
    <Modal
      onClose={onClose}
      size="md"
      showClose
      loading={saving}
      icon="ti-receipt"
      title="Generate Invoice"
      description="Auto-creates invoice from fee schedule + scholarships"
      // A picked enrollment and plan shouldn't be lost to a stray backdrop click.
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button icon="ti-receipt" loading={saving} onClick={handleGenerate}>
            {saving ? "Generating…" : "Generate Invoice"}
          </Button>
        </div>
      }
    >

        <div style={{ padding:"22px 28px" }}>
          {error && (
            <motion.div
              initial={{ opacity:0, y:-6 }}
              animate={{ opacity:1, y:0 }}
              style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#b91c1c", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}
            >
              <i className="ti ti-alert-circle" style={{ fontSize:14 }} />
              <span style={{ flex:1 }}>{error}</span>
              {existing && (
                <Button size="sm" variant="secondary" onClick={() => { onOpenExisting?.(existing.id); onClose(); }}>
                  Open {existing.no}
                </Button>
              )}
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
                <i className="ti ti-clipboard-list" style={{ fontSize:16, color:"#c92a2a" }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{selected.student_name ?? `Enrollment #${selected.enrollment_id}`}</div>
                  <div style={{ fontSize:11, color:"#8a6a6a", marginTop:1 }}>S.Y. {selected.school_year} · {selected.grade_level} · {selected.section}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background:"transparent", border:"1px solid #fde2de", borderRadius:7, padding:"5px 10px", fontSize:12, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Change</button>
              </motion.div>
            ) : (
              <div style={{ position:"relative" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, background:"white", border:"1.5px solid #fde2de", borderRadius:10, padding:"0 14px", height:44 }}>
                  <i className="ti ti-search" style={{ fontSize:14, color:"#8a6a6a" }} />
                  <input placeholder="Search by student name, LRN, or grade…" value={search}
                    onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0a0a", outline:"none", fontFamily:"'DM Sans',sans-serif" }} />
                  {loading && <i className="ti ti-loader-2" style={{ fontSize:13, color:"#c92a2a", animation:"spin 1s linear infinite" }} />}
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
                      {enrollments.length === 0 && !loading && <div style={{ padding:"16px", textAlign:"center", color:"#8a6a6a", fontSize:13 }}>No enrolled students found.</div>}
                      {enrollments.map((en) => (
                        <div key={en.enrollment_id} onClick={() => { setSelected(en); setOpen(false); setSearch(""); }}
                          className="flex cursor-pointer items-center gap-2.5 border-b border-neutral-200/70 px-3.5 py-2.5 transition-colors hover:bg-brand-50">
                          <i className="ti ti-clipboard-list" style={{ fontSize:14, color:"#c92a2a" }} />
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{en.student_name ?? `Enrollment #${en.enrollment_id}`}</div>
                            <div style={{ fontSize:11, color:"#8a6a6a" }}>S.Y. {en.school_year} · {en.grade_level} · {en.section}</div>
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
            <PlanChoice plan={plan} onChange={setPlan} />
          </div>
        </div>

    </Modal>
  );
}

// ── Re-issue Invoice Modal ────────────────────────────────────────────────────
// Voiding an invoice someone has paid against stranded the payments: the new
// invoice asked for the whole year again and the ledger counted both. Re-issue
// voids it and builds the corrected one with the payments carried across --
// it is also how a family changes payment plan.
function ReissueModal({ invoice, onClose, onReissued }) {
  const [plan,   setPlan]   = useState(invoice.payment_plan);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const paid = parseFloat(invoice.total_paid ?? 0);

  const handleReissue = async () => {
    setSaving(true); setError("");
    try {
      const res = await reissueInvoice(invoice.invoice_id, { payment_plan: plan });
      toast.success(
        paid > 0
          ? `Re-issued as ${res.invoice.invoice_no}. ${fmt(paid)} in payments moved across.`
          : `Re-issued as ${res.invoice.invoice_no}.`,
      );
      onReissued(res.invoice);
      onClose();
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Could not re-issue this invoice.");
    } finally { setSaving(false); }
  };

  return (
    <Modal
      onClose={onClose}
      size="md"
      showClose
      loading={saving}
      icon="ti-refresh"
      title={`Re-issue ${invoice.invoice_no}`}
      description="Voids this invoice and issues a corrected one from the current fee schedule."
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button icon="ti-refresh" loading={saving} onClick={handleReissue}>
            {saving ? "Re-issuing…" : "Re-issue invoice"}
          </Button>
        </div>
      }
    >
      <div style={{ padding:"18px 24px", display:"flex", flexDirection:"column", gap:14 }}>
        {error && (
          <div role="alert" style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#b91c1c" }}>{error}</div>
        )}
        <div style={{ fontSize:13, color:"#5a4a4a", lineHeight:1.5 }}>
          {paid > 0
            ? <>The <strong>{fmt(paid)}</strong> already paid moves to the new invoice, with each payment keeping its date and reference.</>
            : <>Nothing has been paid on this invoice yet.</>}{" "}
          The original invoice date is kept, so an Early Bird discount already earned still applies.
        </div>
        <div>
          <div style={{ fontSize:10.5, fontWeight:700, color:"#7a5050", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:8 }}>Payment Plan</div>
          <PlanChoice plan={plan} onChange={setPlan} />
        </div>
      </div>
    </Modal>
  );
}

// ── Invoice Detail ────────────────────────────────────────────────────────────
function InvoiceDetail({ invoiceId, onVoided, onReissued, onRecordPayment }) {
  const [hasAnimated, setHasAnimated] = useState(false);
  const [invoice,    setInvoice]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [voiding,    setVoiding]    = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [showReissue, setShowReissue] = useState(false);
  const [tab,        setTab]        = useState("breakdown");

  useEffect(() => {
    setLoading(true); setInvoice(null);
    setHasAnimated(false);
    getInvoice(invoiceId)
      .then(setInvoice)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const handleVoid = async () => {
    setVoiding(true);
    try { await voidInvoice(invoiceId); toast.success("Invoice voided."); onVoided(); }
    catch (e) { toast.error(e?.response?.data?.detail || e.message || "Failed to void invoice. Please try again."); }
    finally { setVoiding(false); setShowVoidConfirm(false); }
  };

  const isFirst = !hasAnimated;
  if (!loading && invoice && isFirst) setHasAnimated(true);

  if (loading) return (
    <div style={{ padding:"24px", display:"flex", flexDirection:"column", gap:14 }}>
      <Skeleton height={60} /><Skeleton height={200} /><Skeleton height={120} />
    </div>
  );

  if (!invoice) return (
    <div style={{ padding:"40px", textAlign:"center", color:"#8a6a6a", fontSize:13, fontStyle:"italic" }}>Failed to load invoice.</div>
  );

  const en         = invoice.enrollment_detail;
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
      <motion.div variants={pageVariants.item}>
        <Card padding="md">
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <span style={{ fontSize:18, fontWeight:700, color:"#1a0a0a" }}>{invoice.invoice_no}</span>
              <StatusBadge status={invoice.status} map={INVOICE_STATUS_MAP} size="sm" />
              <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:99, background:planMeta.bg, color:planMeta.color }}>{planMeta.label}</span>
              {invoice.recalculated_at && <span style={{ fontSize:10, color:"#8a6a6a", fontStyle:"italic" }}>Recalculated {fmtDate(invoice.recalculated_at)}</span>}
            </div>
            {en && (
              <div style={{ fontSize:13, color:"#5a4a4a" }}>
                <span style={{ fontWeight:600 }}>{en.student_name}</span>
                <span style={{ color:"#8a6a6a" }}> · LRN {en.lrn} · {en.grade_level} · {en.section} · S.Y. {en.school_year}</span>
              </div>
            )}
            <div style={{ fontSize:12, color:"#8a6a6a", marginTop:4 }}>
              Issued {fmtDate(invoice.invoice_date)}
              {invoice.status !== "void" && (
                invoice.next_due_date
                  ? <> · Next due: <span style={{ color: invoice.is_overdue ? "#c92a2a" : undefined, fontWeight: invoice.is_overdue ? 700 : undefined }}>{fmtDate(invoice.next_due_date)}{invoice.is_overdue ? " (overdue)" : ""}</span></>
                  : <> · Nothing left to pay</>
              )}
            </div>
          </div>
          {invoice.status !== "void" && (
            <div style={{ display:"flex", gap:8 }}>
              <Button size="sm" icon="ti-cash" onClick={() => onRecordPayment(invoiceId)}>
                Record Payment
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon="ti-printer"
                onClick={() => window.open(`/print/invoice/${invoiceId}`, "_blank")}
              >
                Print
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon="ti-refresh"
                onClick={() => setShowReissue(true)}
              >
                Re-issue
              </Button>
              {/* Void only while nothing has been paid: voiding a paid-into
                  invoice stranded the money. Re-issue carries it across. */}
              {totalPaid === 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon="ti-ban"
                  onClick={() => setShowVoidConfirm(true)}
                >
                  Void
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Balance bar */}
        <div style={{ marginTop:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
            <div>
              <span style={{ fontSize:11, color:"#8a6a6a" }}>Total paid </span>
              <span style={{ fontSize:14, fontWeight:700, color:"#2e6b0d" }}>{fmt(totalPaid)}</span>
              <span style={{ fontSize:11, color:"#8a6a6a" }}> of {fmt(netAmount)}</span>
            </div>
            <div>
              <span style={{ fontSize:11, color:"#8a6a6a" }}>Balance </span>
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
        </Card>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={pageVariants.item}>
        <Tabs
          variant="pill"
          tabs={TABS.map((t) => (
            t.id === "payments"
              ? { ...t, count: invoice.payments?.length || undefined }
              : t
          ))}
          value={tab}
          onChange={setTab}
        />
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
              { key:"tuition", items:tuitionItems, label:"Tuition Fees",        color:"#c92a2a", bg:"#fff0f0", note:"Discounts applied below" },
              { key:"misc",    items:miscItems,    label:"Miscellaneous Fees",   color:"#1455a0", bg:"#e3f0fd", note:"No discount" },
              { key:"other",   items:otherItems,   label:"Other Fees",           color:"#2e6b0d", bg:"#e8f5e0", note:"No discount" },
            ].filter((g) => g.items.length > 0).map((group) => (
              <Card key={group.key} padding="none" className="overflow-hidden">
                {/* Header stays inline: the tint encodes the fee category
                    (tuition / misc / other), which Panel's neutral header
                    doesn't model. The chrome around it comes from Card. */}
                <div style={{ background:group.bg }} className="flex items-center justify-between border-b border-neutral-200/70 px-[18px] py-3">
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
              </Card>
            ))}

            {(invoice.discounts ?? []).length > 0 && (
              <Card padding="none" className="overflow-hidden">
                <div className="border-b border-neutral-200/70 bg-warning-50 px-[18px] py-3">
                  <span className="text-[13px] font-bold text-warning-700">Discounts Applied to Tuition</span>
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
              </Card>
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
          >
            <Card padding="none" className="overflow-hidden">
              <Table
                columns={INSTALLMENT_COLUMNS}
                isEmpty={(invoice.installments ?? []).length === 0}
                empty={{
                  icon: "ti-calendar-off",
                  title: "No installments",
                  subtitle: "This invoice has no installment schedule.",
                  withAvatar: false,
                }}
              >
                {(invoice.installments ?? []).map((inst) => {
                  const bal = parseFloat(inst.amount) - parseFloat(inst.amount_paid);
                  return (
                    <TableRow key={inst.installment_id}>
                      <TableCell className="text-neutral-500">{inst.sequence}</TableCell>
                      <TableCell className="font-semibold text-neutral-900">{fmtDate(inst.due_date)}</TableCell>
                      <TableCell className="text-neutral-900">{fmt(inst.amount)}</TableCell>
                      <TableCell className="font-semibold text-success-600">{fmt(inst.amount_paid)}</TableCell>
                      <TableCell className={`font-semibold ${bal > 0 ? "text-error-600" : "text-success-600"}`}>
                        {fmt(bal)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={inst.status} map={INVOICE_STATUS_MAP} size="sm" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Table>
            </Card>
          </motion.div>
        )}

        {tab === "payments" && (() => {
          const payments     = invoice.payments ?? [];
          const totalPaidAmt = payments.reduce((s, p) => s + parseFloat(p.amount_paid), 0);
          return (
            <motion.div
              key="payments"
              initial={{ opacity:0, y:8 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:-8 }}
              transition={{ duration:0.18, ease:"easeOut" }}
            >
              <Panel
                padding="none"
                className="overflow-hidden"
                title={`${payments.length} payment${payments.length !== 1 ? "s" : ""} · ${fmt(totalPaidAmt)} collected`}
                action={
                  invoice.status !== "void" && balance > 0 ? (
                    <Button size="sm" icon="ti-plus" onClick={() => onRecordPayment(invoiceId)}>
                      Record Payment
                    </Button>
                  ) : invoice.status !== "void" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success-600">
                      <i className="ti ti-circle-check text-xs" aria-hidden="true" />Fully paid
                    </span>
                  ) : null
                }
              >

              {payments.length === 0 ? (
                <div style={{ padding:"40px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:"#e8f5e0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <i className="ti ti-cash" style={{ fontSize:20, color:"#2e6b0d" }} />
                  </div>
                  <div style={{ fontSize:13, color:"#8a6a6a", fontStyle:"italic" }}>No payments recorded yet.</div>
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
                  <Table columns={PAYMENT_COLUMNS}>
                    {payments.map((p) => {
                      const mc = paymentMethodMeta(p.payment_method);
                      return (
                        <TableRow key={p.payment_id}>
                          <TableCell className="text-neutral-900">{fmtDate(p.payment_date)}</TableCell>
                          <TableCell className="font-bold text-success-600">{fmt(p.amount_paid)}</TableCell>
                          <TableCell>
                            <Badge variant={mc.tone} icon={mc.icon} size="sm">
                              {mc.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon="ti-receipt"
                              onClick={() => window.open(`/print/receipt/${p.payment_id}`, "_blank")}
                            >
                              Receipt
                            </Button>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-neutral-700">
                            {p.reference_number || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-neutral-700">{p.notes || "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </Table>
                  <div className="flex justify-end gap-5 border-t border-neutral-200 bg-neutral-50 px-[18px] py-2.5">
                    <span className="text-xs text-neutral-500">Total collected</span>
                    <span className="text-[13px] font-bold text-success-600">{fmt(totalPaidAmt)}</span>
                  </div>
                </>
              )}
              </Panel>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {showReissue && (
          <ReissueModal
            invoice={invoice}
            onClose={() => setShowReissue(false)}
            onReissued={(created) => onReissued?.(created)}
          />
        )}
      </AnimatePresence>

      {/* Void confirm modal */}
      <AnimatePresence>
        {showVoidConfirm && (
          <ConfirmModal
            icon="ti-ban"
            title="Void invoice?"
            message={<>This will mark invoice <strong>{invoice.invoice_no}</strong> as void. Nothing has been paid on it. This cannot be undone.</>}
            confirmLabel="Yes, void"
            loading={voiding}
            onConfirm={handleVoid}
            onCancel={() => setShowVoidConfirm(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/// ════════════════════════════════════════════════════════════════════════════
export default function InvoicesPage() {
  usePageTitle("Invoices");
  const [searchParams] = useSearchParams();

  const [invoices,     setInvoices]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState(null);
  const [selectedId,   setSelectedId]   = useState(() => {
    const p = searchParams.get("selected");
    return p ? parseInt(p) : null;
  });
  // Invoices open on the current school year, so this page and the dashboard
  // can't disagree about which year "now" is; a `school_year` in the link wins,
  // so a deep link keeps pointing at the year it named. "" is the explicit
  // all-years view — the escape hatch for chasing an older balance.
  const [yearFilter,   setYearFilter, yearIsDefault] = useYearFilter();

  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "all");
  const [planFilter,   setPlanFilter]   = useState("");
  // "Only invoices with a payment past due" — reached from the admin home's
  // overdue count, which links here with ?overdue=1. Overdue is flagged on
  // installments, not on the invoice's status, so it's its own menu.
  const [overdueOnly,  setOverdueOnly]  = useState(() => ["1", "true"].includes(searchParams.get("overdue")));
  const [search,       setSearch]       = useState("");
  const [inputVal,     setInputVal]     = useState("");
  const [ordering,     setOrdering]     = useState(DEFAULT_ORDERING);
  const [page,         setPage]         = useState(1);
  const [pageMeta,     setPageMeta]     = useState({ count:0, next:null, previous:null });
  const [showGenModal,      setShowGenModal]      = useState(false);
  const [payModalInvoiceId, setPayModalInvoiceId] = useState(null);
  const [refreshKey,        setRefreshKey]        = useState(0);
  const searchRef = useRef(null);

  // Only the newest request may fill the list: typing and filters fire
  // requests back to back, and an older one landing last showed its rows
  // under the newer filter.
  const fetchSeq = useRef(0);
  const fetchInvoices = useCallback(async (p = 1) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const params = { page: p, ordering };
      if (statusFilter !== "all") params.status = statusFilter;
      if (planFilter)             params.payment_plan = planFilter;
      if (search.trim())          params.search = search.trim();
      if (yearFilter)             params.school_year = yearFilter;
      if (overdueOnly)            params.overdue = "true";
      const data = await getInvoices(params);
      if (seq !== fetchSeq.current) return;
      setInvoices(Array.isArray(data) ? data : data?.results ?? []);
      setPageMeta({ count: data.count ?? 0, next: data.next, previous: data.previous });
      setPage(p);
    } catch (e) {
      if (seq !== fetchSeq.current) return;
      console.error(e);
      // Was swallowed — a failed load rendered as "No invoices found".
      setLoadError(e);
      setInvoices([]);
      setPageMeta({ count: 0, next: null, previous: null });
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [statusFilter, planFilter, search, ordering, yearFilter, overdueOnly]);

  // Any filter, another year, or a change made here (a payment, a void) is
  // another list: back to its first page.
  useEffect(() => { fetchInvoices(1); }, [fetchInvoices, refreshKey]); // eslint-disable-line react-hooks/set-state-in-effect

  // The band's numbers, from /summary/: the year, plan and past-due filter,
  // like the list, but not the status (each count is its own status) or the
  // search, which narrows only the rows, as on the other list pages. Kept
  // with the scope it was counted for, so a stale answer never shows.
  const scopeKey = JSON.stringify({ yearFilter, planFilter, overdueOnly, refreshKey });
  const [summary, setSummary] = useState({ key: null, data: null });
  // The year menu lists years that have invoices, which the summary reports;
  // kept across scopes so the menu doesn't empty while the next one loads.
  const [invoiceYears, setInvoiceYears] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const { yearFilter: year, planFilter: plan, overdueOnly: overdue } = JSON.parse(scopeKey);
    const params = {};
    if (plan)    params.payment_plan = plan;
    if (year)    params.school_year = year;
    if (overdue) params.overdue = "true";
    getInvoiceSummary(params)
      .then((d) => {
        if (cancelled) return;
        setSummary({ key: scopeKey, data: d });
        setInvoiceYears(d?.school_years ?? []);
      })
      // Non-critical: the band reads "—" and the list still works.
      .catch(() => { if (!cancelled) setSummary({ key: scopeKey, data: null }); });
    return () => { cancelled = true; };
  }, [scopeKey]);
  const counts = summary.key === scopeKey ? summary.data : null;

  // Search as you type: the box applies itself once typing pauses. Every
  // other filter is state the fetch above reads, so Enter only skips the wait.
  useEffect(() => {
    if (inputVal === search) return;
    const timer = setTimeout(() => setSearch(inputVal), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputVal, search]);

  // The current year is where the page opens, so it isn't a filter to clear.
  const hasActiveFilters =
    search || statusFilter !== "all" || planFilter || overdueOnly ||
    ordering !== DEFAULT_ORDERING || !yearIsDefault;
  // What narrows the list. The year doesn't: every visit opens on one.
  const narrowed = search || statusFilter !== "all" || planFilter || overdueOnly;

  const handleClearAll = () => {
    setInputVal(""); setSearch("");
    setStatusFilter("all"); setPlanFilter("");
    setOverdueOnly(false);
    setOrdering(DEFAULT_ORDERING);
    // Clearing returns to the current school year, not to all-years: falling
    // back to every year would resurrect the mixed-year view this filter exists
    // to prevent.
    setYearFilter(null);
    searchRef.current?.focus();
  };

  const totalPages = Math.ceil(pageMeta.count / 20);
  const isFirstRender = useIsFirstRender();

  // What the band counts: the year, and the plan and past-due filter when set.
  const bandCaption = [
    `invoice${counts?.total === 1 ? "" : "s"} in ${yearFilter ? `S.Y. ${yearFilter}` : "all school years"}`,
    planFilter && `${PLAN_META[planFilter]?.label} plan`,
    overdueOnly && "with a payment past due",
  ].filter(Boolean).join(" · ");

  const statusMeta = INVOICE_STATUS_MAP[statusFilter];

  return (
    <>
      <PageHeader
        title="Invoices"
        actions={
          <Button icon="ti-receipt" onClick={() => setShowGenModal(true)}>
            Generate Invoice
          </Button>
        }
      />

      {/* Content */}
      <motion.div
        className="flex-1 space-y-4 overflow-y-auto px-7 py-6"
        variants={pageVariants.container}
        initial={isFirstRender ? "hidden" : false}
        animate="visible"
      >
        {/* ── Where the year's invoices stand, and the status filter ──
            The school year sits in the band because its numbers are counted
            for it; its years are the ones with invoices. */}
        <StatusBand
          total={counts?.total}
          caption={bandCaption}
          aside={<SchoolYearMenu value={yearFilter} onChange={setYearFilter} years={invoiceYears} />}
          options={[
            { value: "all", label: "All", count: counts?.total },
            ...STATUS_FILTERS.map((s) => ({
              value: s,
              label: INVOICE_STATUS_MAP[s].label,
              count: counts?.[s],
              variant: INVOICE_STATUS_MAP[s].variant,
            })),
          ]}
          value={statusFilter}
          allValue="all"
          onChange={setStatusFilter}
        />

        {/* ── Toolbar: search, the filter menus, Clear ──
            The menus open to the right edge, where the pills sit. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField
            id="invoice-search"
            label="Search invoices by number or student name"
            placeholder="Search invoice no. or student name…"
            inputRef={searchRef}
            value={inputVal}
            onChange={setInputVal}
            onEnter={() => setSearch(inputVal)}
            onClear={() => { setInputVal(""); setSearch(""); }}
          />

          <FilterMenu
            label="Plan"
            valueLabel={PLAN_META[planFilter]?.label ?? "Any"}
            active={Boolean(planFilter)}
            options={PLAN_FILTERS}
            value={planFilter}
            onChange={setPlanFilter}
            align="end"
            menuWidth={180}
          />

          <FilterMenu
            label="Due"
            valueLabel={overdueOnly ? "Past due" : "Any"}
            active={overdueOnly}
            options={DUE_FILTERS}
            value={overdueOnly ? "overdue" : ""}
            onChange={(v) => setOverdueOnly(v === "overdue")}
            align="end"
            menuWidth={240}
          />

          <FilterMenu
            label="Sort"
            valueLabel={SORT_OPTIONS.find((o) => o.value === ordering)?.label ?? "Newest first"}
            active={ordering !== DEFAULT_ORDERING}
            options={SORT_OPTIONS}
            value={ordering}
            onChange={setOrdering}
            align="end"
            menuWidth={200}
          />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearAll}
              className="focus-ring flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-error-600 transition-colors duration-150 hover:bg-brand-100"
            >
              <i className="ti ti-filter-off text-[14px]" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>

        {/* Master / detail — stacks below lg, where a 360px + detail split has
            no room to breathe. */}
        <motion.div
          variants={pageVariants.item}
          className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]"
        >
          {/* Left: Invoice list */}
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-baseline gap-2.5 border-b border-neutral-200 px-4 py-3.5">
              <h2 className="text-md font-bold text-neutral-900">
                {statusMeta ? `${statusMeta.label} invoices` : "All invoices"}
              </h2>
              {!loading && !loadError && (
                <span className="text-sm text-neutral-500 tabular-nums">{pageMeta.count.toLocaleString()}</span>
              )}
            </div>

            <div className="max-h-[calc(100vh-380px)] min-h-[200px] overflow-y-auto">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-2 border-b border-neutral-200/70 px-4 py-3.5">
                    <Skeleton width={140} height={14} /><Skeleton width={100} height={11} /><Skeleton width={80} height={11} />
                  </div>
                ))
              ) : loadError ? (
                <ErrorState error={loadError} subject="invoices" onRetry={() => fetchInvoices(page)} />
              ) : invoices.length === 0 ? (
                <EmptyState
                  icon="ti-receipt-off"
                  // A year with no invoices isn't "no invoices yet" — that
                  // reads as the school having none at all. Name the year, and
                  // offer the all-years view as the way out.
                  title={
                    narrowed ? "No invoices match these filters"
                      : yearFilter ? `No invoices for S.Y. ${yearFilter}`
                      : "No invoices yet"
                  }
                  subtitle={
                    narrowed ? "Try a different search or clear the filters."
                      : yearFilter ? "Generate one for this year, or view all years."
                      : "Generate the first invoice to get started."
                  }
                  action={
                    narrowed ? (
                      <Button variant="secondary" size="sm" icon="ti-filter-off" onClick={handleClearAll}>
                        Clear filters
                      </Button>
                    ) : yearFilter ? (
                      <Button variant="secondary" size="sm" icon="ti-calendar" onClick={() => setYearFilter("")}>
                        View all years
                      </Button>
                    ) : (
                      <Button size="sm" icon="ti-receipt" onClick={() => setShowGenModal(true)}>
                        Generate Invoice
                      </Button>
                    )
                  }
                />
              ) : (
                invoices.map((inv) => {
                  const isSelected = selectedId === inv.invoice_id;
                  const en = inv.enrollment_detail;
                  const balance = parseFloat(inv.balance ?? 0);
                  // From the installments (server-side), not invoice.due_date:
                  // that is the first installment's date and never moves, so
                  // every open invoice read as overdue from July on.
                  const isOverdue = Boolean(inv.is_overdue);
                  return (
                    <button
                      key={inv.invoice_id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedId(inv.invoice_id)}
                      className={`focus-ring flex w-full flex-col gap-1 border-b border-l-[3px] border-b-neutral-200/70 px-4 py-3 text-left transition-colors duration-150 ${
                        isSelected ? "border-l-brand-500 bg-brand-50" : "border-l-transparent bg-white hover:bg-brand-50"
                      }`}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="font-mono text-[12px] font-semibold text-neutral-900">{inv.invoice_no}</span>
                        <span className="flex items-center gap-2.5">
                          {isOverdue && (
                            <span className={`text-[12px] font-semibold ${STATUS_TEXT.error}`}>
                              {INVOICE_STATUS_MAP.overdue.label}
                            </span>
                          )}
                          <StatusDot status={inv.status} map={INVOICE_STATUS_MAP} />
                        </span>
                      </span>
                      <span className="truncate text-[13px] font-semibold text-neutral-900">
                        {en?.student_name ?? `Enrollment #${inv.enrollment_id}`}
                      </span>
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="truncate text-[11.5px] text-neutral-500">
                          {[PLAN_META[inv.payment_plan]?.label ?? "Monthly", en?.grade_level].filter(Boolean).join(" · ")}
                        </span>
                        <span className={`whitespace-nowrap text-[12.5px] font-bold tabular-nums ${balance > 0 ? "text-neutral-900" : "text-success-600"}`}>
                          {fmt(balance)} <span className="font-medium text-neutral-500">bal.</span>
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Pagination — the shared control, so it behaves and reads the
                same as every other list in the app. */}
            {!loading && !loadError && pageMeta.count > 20 && (
              <div className="border-t border-neutral-200 bg-white px-4 py-2.5">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  count={pageMeta.count}
                  hasPrevious={Boolean(pageMeta.previous)}
                  hasNext={Boolean(pageMeta.next)}
                  onPageChange={(p) => fetchInvoices(p)}
                />
              </div>
            )}

            {/* What this page of invoices still has to collect. */}
            {!loading && invoices.length > 0 && (() => {
              const pageTotal    = invoices.reduce((s, i) => s + parseFloat(i.balance ?? 0), 0);
              const overdueCount = invoices.filter((i) => i.is_overdue).length;
              return (
                <div className="flex flex-wrap gap-3 border-t border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[11.5px] text-neutral-500">
                  <span>
                    <span className="font-semibold text-neutral-900 tabular-nums">{fmt(pageTotal)}</span> outstanding this page
                  </span>
                  {overdueCount > 0 && (
                    <span className={`font-semibold ${STATUS_TEXT.error}`}>{overdueCount} overdue</span>
                  )}
                </div>
              );
            })()}
          </Card>

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
                  onReissued={(created) => { setSelectedId(created.invoice_id); setRefreshKey((k) => k + 1); }}
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
              >
                <Card padding="none" className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
                  <i className="ti ti-receipt text-[24px] text-neutral-500" aria-hidden="true" />
                  <div className="text-sm font-semibold text-neutral-700">Select an invoice</div>
                  <div className="text-[12.5px] text-neutral-500">Pick one from the list to see its installments and payments.</div>
                </Card>
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
            onOpenExisting={(id) => setSelectedId(id)}
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
    </>
  );
}
