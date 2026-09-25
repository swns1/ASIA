import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import useYearFilter from "../hooks/useYearFilter";
import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import RecordPaymentModal from "../components/RecordPaymentModal";
import ConfirmModal from "../components/ConfirmModal";
import EmptyState from "../components/EmptyState";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { pageVariants } from "../utils/motion";

import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card, { StatCard, Panel } from "../components/ui/Card";
import Tabs from "../components/ui/Tabs";
import ChipGroup from "../components/ui/ChipGroup";
import FilterBar, { FilterRow } from "../components/ui/FilterBar";
import SchoolYearPicker from "../components/ui/SchoolYearPicker";
import ErrorState from "../components/ui/ErrorState";
import Pagination from "../components/Pagination";
import Badge, { StatusBadge } from "../components/ui/Badge";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Modal from "../components/ui/Modal";
import Skeleton from "../components/ui/Skeleton";
import { Select } from "../components/FormField";
import { INVOICE_STATUS_MAP } from "../constants/statusMaps";
import { paymentMethodMeta } from "../constants/paymentMethods";
import { useSchoolYear } from "../context/SchoolYearContext";

// ── API ───────────────────────────────────────────────────────────────────────
import {
  getInvoices as _getInvoices,
  getInvoice as _getInvoice,
  getInvoiceSummary as _getInvoiceSummary,
  generateInvoice as _generateInvoice,
  voidInvoice as _voidInvoice,
} from "../api/billingApi";
import { getEnrollments as _getEnrollments } from "../api/enrollmentApi";
import { fmtDate } from "../utils/format";

const getInvoices       = (p = {}) => _getInvoices(p);
const getInvoice        = (id)     => _getInvoice(id);
const getInvoiceSummary = (p = {}) => _getInvoiceSummary(p);
const generateInvoice   = (p)      => _generateInvoice(p);
const voidInvoice       = (id)     => _voidInvoice(id);
const getEnrollments    = (p = {}) => _getEnrollments(p);

// ── Constants ─────────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: "-invoice_id",   label: "Newest first" },
  { value: "invoice_id",    label: "Oldest first" },
  { value: "due_date",      label: "Due date ↑" },
  { value: "-due_date",     label: "Due date ↓" },
  { value: "net_amount",    label: "Amount ↑" },
  { value: "-net_amount",   label: "Amount ↓" },
  { value: "balance",       label: "Balance ↑" },
  { value: "-balance",      label: "Balance ↓" },
];

// `tone` names the shared palette entry; the bg/color literals stay for the
// inline plan pill on each list row until that moves to a shared Badge.
const PLAN_META = {
  monthly:     { label:"Monthly",     color:"#1455a0", bg:"#e3f0fd", tone:"info" },
  quarterly:   { label:"Quarterly",   color:"#2e6b0d", bg:"#e8f5e0", tone:"success" },
  semi_annual: { label:"Semi-Annual", color:"#7c3aed", bg:"#f0e8fd", tone:"accent" },
  annual:      { label:"Annual",      color:"#854f0b", bg:"#fdf5e8", tone:"warning" },
};

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
            <div style={{ display:"grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap:8 }}>
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
                    <div style={{ fontSize:11, color:active ? meta.color : "#8a6a6a", marginTop:2, opacity:0.85 }}>
                      {val === "monthly" ? "10 installments (Jun–Mar)" : val === "quarterly" ? "4 installments" : val === "semi_annual" ? "2 installments" : "1 installment"}
                      {discountNote}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

    </Modal>
  );
}

// ── Invoice Detail ────────────────────────────────────────────────────────────
function InvoiceDetail({ invoiceId, onVoided, onRecordPayment }) {
  const [hasAnimated, setHasAnimated] = useState(false);
  const [invoice,    setInvoice]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [voiding,    setVoiding]    = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
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
    catch (e) { toast.error(e?.response?.data?.error || e.message || "Failed to void invoice. Please try again."); }
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
            <div style={{ fontSize:12, color:"#8a6a6a", marginTop:4 }}>Issued {fmtDate(invoice.invoice_date)} · Next due: {fmtDate(invoice.due_date)}</div>
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
                icon="ti-ban"
                onClick={() => setShowVoidConfirm(true)}
              >
                Void
              </Button>
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

      {/* Void confirm modal */}
      <AnimatePresence>
        {showVoidConfirm && (
          <ConfirmModal
            icon="ti-ban"
            title="Void invoice?"
            message={<>This will mark invoice <strong>{invoice.invoice_no}</strong> as void. This cannot be undone.</>}
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

// ════════════════════════════════════════════════════════════════════════════
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
  const { currentYear } = useSchoolYear();
  const [yearFilter,   setYearFilter, yearIsDefault] = useYearFilter();

  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "all");
  const [planFilter,   setPlanFilter]   = useState("all");
  const [search,       setSearch]       = useState("");
  const [inputVal,     setInputVal]     = useState("");
  const [ordering,     setOrdering]     = useState("-invoice_id");
  const [page,         setPage]         = useState(1);
  const [pageMeta,     setPageMeta]     = useState({ count:0, next:null, previous:null });
  const [showGenModal,      setShowGenModal]      = useState(false);
  const [payModalInvoiceId, setPayModalInvoiceId] = useState(null);
  const [refreshKey,        setRefreshKey]        = useState(0);
  const [summary,           setSummary]           = useState({ unpaid:0, partially_paid:0, paid:0, void:0, total:0, school_years:[] });
  // Separate from `loading` so the stat tiles only skeleton on the very first
  // load. Sharing the list's flag made every chip click and page change blank
  // the tiles and jitter the layout, even though their numbers rarely change.
  const [countsLoading,     setCountsLoading]     = useState(true);

  const fetchInvoices = useCallback(async (
    p = 1,
    status = statusFilter,
    plan = planFilter,
    term = search,
    ord = ordering,
    year = yearFilter,
  ) => {
    setLoading(true);
    try {
      const params = { page: p, ordering: ord };
      if (status !== "all") params.status = status;
      if (plan   !== "all") params.payment_plan = plan;
      if (term.trim())      params.search = term.trim();
      if (year)             params.school_year = year;

      // The stat tiles read from /summary/, so it must carry the same year and
      // plan scoping as the list — otherwise the tiles would total a different
      // set of invoices than the rows beneath them.
      const summaryParams = {};
      if (plan !== "all") summaryParams.payment_plan = plan;
      if (year)           summaryParams.school_year = year;

      const [data, summaryData] = await Promise.all([
        getInvoices(params),
        getInvoiceSummary(summaryParams),
      ]);
      setInvoices(Array.isArray(data) ? data : data?.results ?? []);
      setPageMeta({ count: data.count ?? 0, next: data.next, previous: data.previous });
      setPage(p);
      setSummary(summaryData);
      setCountsLoading(false);
      setLoadError(null);
    } catch (e) {
      console.error(e);
      // Was swallowed — a failed load rendered as "No invoices found".
      setLoadError(e);
      setInvoices([]);
      setPageMeta({ count: 0, next: null, previous: null });
    }
    finally { setLoading(false); }
  }, [statusFilter, planFilter, search, ordering, yearFilter]);

  // The year is never empty on first render (useYearFilter starts from the
  // current year), so the first load no longer waits for it; if School
  // Settings then names a different year, the filter follows and this reloads.
  useEffect(() => {
    fetchInvoices(1, statusFilter, planFilter, "", "-invoice_id", yearFilter); // eslint-disable-line react-hooks/set-state-in-effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, yearFilter]);

  const handleSearch = () => {
    setSearch(inputVal);
    fetchInvoices(1, statusFilter, planFilter, inputVal, ordering, yearFilter);
  };

  const handleOrdering = (val) => {
    setOrdering(val);
    fetchInvoices(1, statusFilter, planFilter, search, val, yearFilter);
  };

  const handleYear = (val) => {
    setYearFilter(val);
    fetchInvoices(1, statusFilter, planFilter, search, ordering, val);
  };

  const handleClearAll = () => {
    setInputVal(""); setSearch("");
    setStatusFilter("all"); setPlanFilter("all");
    setOrdering("-invoice_id");
    // Clearing returns to the current school year, not to all-years: falling
    // back to every year would resurrect the mixed-year view this filter exists
    // to prevent.
    setYearFilter(null);
    fetchInvoices(1, "all", "all", "", "-invoice_id", currentYear);
  };

  const hasActiveFilters =
    search || statusFilter !== "all" || planFilter !== "all" ||
    ordering !== "-invoice_id" || !yearIsDefault;

  const totalPages = Math.ceil(pageMeta.count / 20);

  const isFirstRender = useIsFirstRender();

  const STAT_CARDS = [
    { label: "Unpaid",  statusKey: "unpaid",         value: summary.unpaid,         icon: "ti-alert-circle", tone: "error" },
    { label: "Partial", statusKey: "partially_paid", value: summary.partially_paid, icon: "ti-progress",     tone: "warning" },
    { label: "Paid",    statusKey: "paid",           value: summary.paid,           icon: "ti-circle-check", tone: "success" },
    { label: "Void",    statusKey: "void",           value: summary.void,           icon: "ti-ban",          tone: "muted" },
  ];

  // Tones come from the shared status map, so a chip lights up in the same
  // colour as the stat card and row badge for that status.
  const statusChipOptions = [
    { value: "all", label: "All", tone: "brand", count: countsLoading ? null : summary.total },
    ...["unpaid", "partially_paid", "paid", "void"].map((v) => ({
      value: v,
      label: INVOICE_STATUS_MAP[v]?.label ?? v,
      tone: INVOICE_STATUS_MAP[v]?.variant ?? "brand",
      // The chip's own status total, not the filtered row count — the same
      // number its stat card shows. The badge appearing is also what widens
      // the chip, which is what the layout spring animates.
      count: countsLoading ? null : summary[v],
    })),
  ];

  const planChipOptions = [
    { value: "all", label: "All", tone: "brand" },
    ...Object.entries(PLAN_META).map(([value, m]) => ({
      value,
      label: m.label,
      tone: m.tone,
    })),
  ];

  return (
    <>
      <PageHeader
        title="Invoices"
        icon="ti-receipt"
        subtitle={
          loading
            ? "Loading…"
            : `${summary.total} total · ${summary.unpaid} unpaid · ${summary.partially_paid} partial`
        }
        actions={
          <Button icon="ti-receipt" onClick={() => setShowGenModal(true)}>
            Generate Invoice
          </Button>
        }
      />

      {/* Content */}
      <motion.div
        className="flex-1 space-y-4 overflow-y-auto p-6"
        variants={pageVariants.container}
        initial={isFirstRender ? "hidden" : false}
        animate="visible"
      >
        {/* Stat tiles double as status filters */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {STAT_CARDS.map((s) => (
            <StatCard
              key={s.statusKey}
              label={s.label}
              value={s.value}
              icon={s.icon}
              iconTone={s.tone}
              layout="horizontal"
              loading={countsLoading}
              active={statusFilter === s.statusKey}
              onClick={() => {
                const next = statusFilter === s.statusKey ? "all" : s.statusKey;
                setStatusFilter(next);
                fetchInvoices(1, next, planFilter, search, ordering);
              }}
            />
          ))}
        </div>

        {/* Filters */}
        <FilterBar
          searchInputId="invoice-search"
          searchLabel="Search by invoice number"
          searchPlaceholder="Search by invoice number…"
          searchValue={inputVal}
          onSearchChange={setInputVal}
          onSearch={handleSearch}
          onClearSearch={() => { setInputVal(""); setSearch(""); fetchInvoices(1, statusFilter, planFilter, "", ordering, yearFilter); }}
          hasFilters={Boolean(hasActiveFilters)}
          onClearFilters={handleClearAll}
          // Years come from /summary/ — years that have *invoices*, which is not
          // the same set as years that have enrollments, so the context's list
          // would offer years with nothing to bill. The summary tallies by
          // status rather than by year, so these rows carry no per-year count.
          scope={
            <SchoolYearPicker
              value={yearFilter}
              onChange={handleYear}
              options={summary.school_years ?? []}
              counts={{}}
              allYearsCount={countsLoading ? undefined : summary.total}
            />
          }
          extraControls={
            <div className="shrink-0">
              <label htmlFor="invoice-sort" className="sr-only">Sort invoices</label>
              <Select
                id="invoice-sort"
                value={ordering}
                onChange={(e) => handleOrdering(e.target.value)}
                className="h-[42px] w-[170px] rounded-lg border-neutral-300 bg-white py-0 text-[13px] font-semibold"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
          }
        >
          <FilterRow label="Status">
            <ChipGroup
              label="Filter by status"
              options={statusChipOptions}
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); fetchInvoices(1, v, planFilter, search, ordering, yearFilter); }}
            />
          </FilterRow>

          <FilterRow label="Payment Plan">
            <ChipGroup
              label="Filter by payment plan"
              options={planChipOptions}
              value={planFilter}
              onChange={(v) => { setPlanFilter(v); fetchInvoices(1, statusFilter, v, search, ordering, yearFilter); }}
            />
          </FilterRow>
        </FilterBar>

        {/* Master / detail — stacks below lg, where a 360px + detail split has
            no room to breathe. */}
        <motion.div
          variants={pageVariants.item}
          className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]"
        >
          {/* Left: Invoice list */}
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="max-h-[calc(100vh-340px)] overflow-y-auto">
              {loading ? (
                Array.from({ length:8 }).map((_, i) => (
                  <div key={i} style={{ padding:"14px 16px", borderBottom:"1px solid #f9f0f0", display:"flex", flexDirection:"column", gap:8 }}>
                    <Skeleton width={140} height={14} /><Skeleton width={100} height={11} /><Skeleton width={80} height={11} />
                  </div>
                ))
              ) : loadError ? (
                <ErrorState
                  error={loadError}
                  subject="invoices"
                  onRetry={() => fetchInvoices(page, statusFilter, planFilter, search, ordering)}
                />
              ) : invoices.length === 0 ? (
                <EmptyState
                  icon="ti-receipt-off"
                  // A year with no invoices isn't "no invoices yet" — that
                  // reads as the school having none at all. Name the year, and
                  // offer the all-years view as the way out.
                  title={
                    hasActiveFilters ? "No invoices match these filters"
                      : yearFilter ? `No invoices for S.Y. ${yearFilter}`
                      : "No invoices yet"
                  }
                  subtitle={
                    hasActiveFilters ? "Try a different search or clear the filters."
                      : yearFilter ? "Generate one for this year, or view all years."
                      : "Generate the first invoice to get started."
                  }
                  action={
                    hasActiveFilters ? (
                      <Button variant="secondary" size="sm" icon="ti-filter-off" onClick={handleClearAll}>
                        Clear filters
                      </Button>
                    ) : yearFilter ? (
                      <Button variant="secondary" size="sm" icon="ti-calendar" onClick={() => handleYear("")}>
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
                <AnimatePresence mode="popLayout" initial={false}>
                  {invoices.map((inv) => {
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
                            {/* Overdue now reads as urgent (error-toned + clock
                                icon) rather than the old purple, which looked
                                like an unrelated category. */}
                            {isOverdue && (
                              <StatusBadge status="overdue" map={INVOICE_STATUS_MAP} size="sm" />
                            )}
                            <StatusBadge status={inv.status} map={INVOICE_STATUS_MAP} size="sm" />
                          </div>
                        </div>
                        <div style={{ fontSize:12, color:"#5a4a4a", fontWeight:600, marginBottom:2 }}>{en?.student_name ?? `Enrollment #${inv.enrollment_id}`}</div>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                            <span style={{ fontSize:10.5, fontWeight:600, padding:"1px 6px", borderRadius:99, background:pm.bg, color:pm.color }}>{pm.label}</span>
                            <span style={{ fontSize:11, color:"#8a6a6a" }}>{en?.grade_level ?? ""}</span>
                          </div>
                          <span style={{ fontSize:12, fontWeight:700, color: balance > 0 ? "#a32d2d" : "#2e6b0d" }}>{fmt(balance)} bal.</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>

            {/* Pagination — now the shared control, so it behaves and reads
                the same as every other list in the app. */}
            {!loading && !loadError && pageMeta.count > 20 && (
              <div className="border-t border-neutral-200 bg-white px-4 py-2.5">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  count={pageMeta.count}
                  hasPrevious={Boolean(pageMeta.previous)}
                  hasNext={Boolean(pageMeta.next)}
                  onPageChange={(p) => fetchInvoices(p, statusFilter, planFilter, search, ordering)}
                />
              </div>
            )}

            {/* Aggregate totals footer */}
            {!loading && invoices.length > 0 && (() => {
              const pageTotal    = invoices.reduce((s, i) => s + parseFloat(i.balance ?? 0), 0);
              const overdueCount = invoices.filter((i) => i.due_date && new Date(i.due_date) < new Date() && i.status !== "paid" && i.status !== "void").length;
              return (
                <div style={{ padding:"10px 16px", borderTop:"1px solid #f5eaea", background:"#fdfafa", display:"flex", gap:12, flexWrap:"wrap" }}>
                  <div style={{ fontSize:11, color:"#8a6a6a" }}>
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
              >
                <Card padding="none" className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-neutral-500">
                  <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-brand-100">
                    <i className="ti ti-receipt text-[22px] text-neutral-500" aria-hidden="true" />
                  </div>
                  <div className="text-sm font-semibold text-neutral-700">Select an invoice</div>
                  <div className="text-[13px]">Click an invoice on the left to view its details</div>
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
