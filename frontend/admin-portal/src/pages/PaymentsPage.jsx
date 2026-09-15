import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback } from "react";
import RecordPaymentModal from "../components/RecordPaymentModal";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card, { StatCard } from "../components/ui/Card";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Pagination from "../components/Pagination";
import Badge from "../components/ui/Badge";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
import ChipGroup from "../components/ui/ChipGroup";
import FilterBar, { FilterRow } from "../components/ui/FilterBar";

import { getPayments as _getPayments, getPaymentSummary } from "../api/billingApi";
import { fmtDate } from "../utils/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_MAP as PM } from "../constants/paymentMethods";
const getPayments = (p = {}) => _getPayments(p);

// ── Constants ─────────────────────────────────────────────────────────────────
// `tone` names the shared palette entry each method already used — every one
// of these colours was an exact match for an existing token, so the tiles and
// chips now theme from tokens.css instead of per-page literals. The bg/color
// literals stay for the inline method pill on each table row until that moves
// to a shared Badge.

const SORT_OPTIONS = [
  { value:"-payment_date", label:"Date ↓" },
  { value:"payment_date",  label:"Date ↑" },
  { value:"-amount_paid",  label:"Amount ↓" },
  { value:"amount_paid",   label:"Amount ↑" },
];

const fmt     = (n) => `₱${parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;

// Columns for the payments table. Not sortable here — ordering is driven by
// the Sort chip row in the filter bar, which maps to the API's `ordering`.
const TABLE_COLUMNS = [
  { key: "student",   label: "Student" },
  { key: "invoice",   label: "Invoice" },
  { key: "date",      label: "Date" },
  { key: "amount",    label: "Amount" },
  { key: "method",    label: "Method" },
  { key: "reference", label: "Reference" },
  { key: "notes",     label: "Notes" },
];

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

  // The tiles report per-method totals, so their request carries the date and
  // amount filters but drops page, ordering and the method itself — scoping it
  // to one method would zero out the other five tiles.
  const buildSummaryParams = (overrides = {}) => {
    const params = buildParams(1, overrides);
    delete params.page;
    delete params.ordering;
    delete params.payment_method;
    return params;
  };

  // A failed load must be distinguishable from an empty result — this used to
  // swallow the error and fall through to "No payments found · Record the
  // first payment", which during an outage reads as a fresh install.
  const [loadError, setLoadError] = useState(null);
  // Separate from `loading` so the method tiles only skeleton on the very
  // first load. Sharing the list's flag made them blank on every chip click
  // and page change, jittering the layout each time.
  const [tilesLoading, setTilesLoading] = useState(true);
  const [methodTotals, setMethodTotals] = useState({});

  const fetchPayments = useCallback(async (p = 1, overrides = {}) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [data, summary] = await Promise.all([
        getPayments(buildParams(p, overrides)),
        getPaymentSummary(buildSummaryParams(overrides)),
      ]);
      setPayments(Array.isArray(data) ? data : data?.results ?? []);
      setPageMeta({ count: data.count ?? 0, next: data.next, previous: data.previous });
      setPage(p);
      setMethodTotals(summary ?? {});
      setTilesLoading(false);
    } catch (e) {
      console.error(e);
      setLoadError(e);
      setPayments([]);
      setPageMeta({ count: 0, next: null, previous: null });
    }
    finally { setLoading(false); }
  }, [methodFilter, dateFrom, dateTo, amountMin, amountMax, sortField]);

  useEffect(() => {
    fetchPayments();
  }, [refreshKey]);

  const totalPages = Math.ceil(pageMeta.count / 20);


  const filterLabel = {
    fontSize:10, fontWeight:700, color:"#8a6a6a",
    textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4,
    display:"block",
  };
  const filterInput = {
    border:"1.5px solid #f0e4e4", borderRadius:8, padding:"6px 10px",
    fontSize:12, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a",
    background:"#fffbfb", outline:"none", height:34, boxSizing:"border-box",
  };


  return (
    <>

      <PageHeader
        title="Payments"
        icon="ti-cash"
        subtitle={loading ? "Loading…" : `${pageMeta.count} transaction${pageMeta.count !== 1 ? "s" : ""} · ${fmt(totalCollected)} this page`}
        actions={
          <>
            <Button variant="secondary" icon="ti-receipt" onClick={() => navigate("/invoices")}>
              View Invoices
            </Button>
            <Button icon="ti-cash" onClick={() => setShowModal(true)}>
              Record Payment
            </Button>
          </>
        }
      />

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 28px", display:"flex", flexDirection:"column", gap:14 }}>

        {/* ── Method stat cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {PAYMENT_METHODS.map((pm) => {
            const isActive = methodFilter === pm.value;
            return (
              <StatCard
                key={pm.value}
                label={pm.label}
                value={fmt(methodTotals[pm.value])}
                icon={pm.icon}
                iconTone={pm.tone}
                layout="horizontal"
                loading={tilesLoading}
                active={isActive}
                onClick={() => {
                  const next = isActive ? "all" : pm.value;
                  setMethodFilter(next);
                  fetchPayments(1, { methodFilter: next });
                }}
              />
            );
          })}
        </div>

        {/* ── Filter panel ───────────────────────────────────────────────── */}
        <FilterBar
          hasFilters={hasActiveFilters}
          onClearFilters={() => {
            clearFilters();
            fetchPayments(1, { methodFilter:"all", dateFrom:"", dateTo:"", amountMin:"", amountMax:"", sortField:"-payment_date" });
          }}
          advanced={
            <>
              <div>
                <label htmlFor="pay-date-from" style={filterLabel}>Date from</label>
                <input id="pay-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...filterInput, minWidth:140 }} />
              </div>
              <div>
                <label htmlFor="pay-date-to" style={filterLabel}>Date to</label>
                <input id="pay-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...filterInput, minWidth:140 }} />
              </div>
              <div>
                <label htmlFor="pay-amount-min" style={filterLabel}>Min amount</label>
                <div style={{ position:"relative" }}>
                  <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"#8a6a6a", fontWeight:600 }}>₱</span>
                  <input id="pay-amount-min" type="number" min="0" step="0.01" value={amountMin} onChange={(e) => setAmountMin(e.target.value)}
                    placeholder="0.00" style={{ ...filterInput, paddingLeft:22, minWidth:100 }} />
                </div>
              </div>
              <div>
                <label htmlFor="pay-amount-max" style={filterLabel}>Max amount</label>
                <div style={{ position:"relative" }}>
                  <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", fontSize:12, color:"#8a6a6a", fontWeight:600 }}>₱</span>
                  <input id="pay-amount-max" type="number" min="0" step="0.01" value={amountMax} onChange={(e) => setAmountMax(e.target.value)}
                    placeholder="0.00" style={{ ...filterInput, paddingLeft:22, minWidth:100 }} />
                </div>
              </div>
              <div>
                <span style={filterLabel}>Quick</span>
                <div style={{ display:"flex", gap:6 }}>
                  {[
                    { label:"Today",      fn:() => { const d=new Date().toISOString().slice(0,10); setDateFrom(d); setDateTo(d); } },
                    { label:"This Month", fn:() => { const now=new Date(); setDateFrom(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`); setDateTo(new Date().toISOString().slice(0,10)); } },
                    { label:"Last Month", fn:() => { const now=new Date(); const y=now.getMonth()===0?now.getFullYear()-1:now.getFullYear(); const m=now.getMonth()===0?12:now.getMonth(); const last=new Date(now.getFullYear(),now.getMonth(),0).getDate(); setDateFrom(`${y}-${String(m).padStart(2,"0")}-01`); setDateTo(`${y}-${String(m).padStart(2,"0")}-${last}`); } },
                  ].map((q) => (
                    <motion.button key={q.label} type="button" onClick={q.fn}
                      whileHover={{ borderColor:"#e03131", color:"#c92a2a" }}
                      whileTap={{ scale:0.96 }}
                      transition={{ duration:0.12 }}
                      style={{ height:34, padding:"0 10px", border:"1px solid #f0e4e4", borderRadius:8, background:"white", color:"#7a5050", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                    >
                      {q.label}
                    </motion.button>
                  ))}
                </div>
              </div>
              {/* Date and amount are the one group that isn't applied on
                  change — typing a partial range would refetch on every
                  keystroke, so they commit together. */}
              <motion.button
                onClick={() => fetchPayments(1)}
                whileHover={{ scale:1.02, boxShadow:"0 6px 16px rgba(224,49,49,0.30)" }}
                whileTap={{ scale:0.97 }}
                transition={{ duration:0.12 }}
                style={{ height:34, padding:"0 18px", border:"none", borderRadius:8, background:"linear-gradient(135deg,#e03131,#c01a1a)", color:"white", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", marginLeft:"auto", boxShadow:"0 3px 10px rgba(224,49,49,0.22)" }}
              >
                Apply
              </motion.button>
            </>
          }
          advancedLabel="Date / Amount"
          advancedIcon="ti-calendar-search"
          advancedActive={hasDateOrAmount}
        >
          <FilterRow label="Payment Method">
            <ChipGroup
              label="Filter by payment method"
              value={methodFilter}
              onChange={(v) => { setMethodFilter(v); fetchPayments(1, { methodFilter:v }); }}
              options={[
                { value:"all", label:"All", tone:"brand" },
                ...PAYMENT_METHODS.map((m) => ({ value:m.value, label:m.label, icon:m.icon, tone:m.tone })),
              ]}
            />
          </FilterRow>

          <FilterRow label="Sort">
            <ChipGroup
              label="Sort payments"
              value={sortField}
              onChange={(v) => { setSortField(v); fetchPayments(1, { sortField:v }); }}
              options={SORT_OPTIONS.map((o) => ({ value:o.value, label:o.label, tone:"brand" }))}
            />
          </FilterRow>
        </FilterBar>

        {/* ── Payments table ──────────────────────────────────────────────── */}
        <Card padding="none" className="overflow-hidden">
          <Table
            columns={TABLE_COLUMNS}
            loading={loading}
            error={loadError}
            onRetry={() => fetchPayments(page)}
            errorSubject="payments"
            isEmpty={payments.length === 0}
            empty={{
              icon: "ti-cash",
              title: "No payments found",
              subtitle: hasActiveFilters
                ? "Try adjusting your filters."
                : "Record the first payment to get started.",
              action: !hasActiveFilters && (
                <Button size="sm" icon="ti-cash" onClick={() => setShowModal(true)}>
                  Record Payment
                </Button>
              ),
            }}
          >
            {payments.map((p) => {
              const name  = p.invoice_detail?.student_name || null;
              const invNo = p.invoice_detail?.invoice_no   || `#${p.invoice}`;
              const mc    = PM[p.payment_method] ?? PM.others;
              const pal   = getAvatarPalette(name ?? "");
              return (
                <TableRow key={p.payment_id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] text-xs font-bold"
                        style={{ background: pal.bg, color: pal.color }}
                        aria-hidden="true"
                      >
                        {name ? initialsFrom(name) : <i className="ti ti-user text-[15px]" />}
                      </div>
                      <span className="whitespace-nowrap text-sm font-semibold text-neutral-900">
                        {name ?? <span className="font-normal italic text-neutral-500">Unknown</span>}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <button
                      type="button"
                      onClick={() => navigate(`/invoices?selected=${p.invoice}`)}
                      className="focus-ring whitespace-nowrap rounded-sm font-mono text-xs font-bold text-brand-600 underline transition-colors hover:text-brand-700"
                    >
                      {invNo}
                    </button>
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-neutral-700">
                    {fmtDate(p.payment_date)}
                  </TableCell>

                  <TableCell className="whitespace-nowrap font-bold text-success-600">
                    {fmt(p.amount_paid)}
                  </TableCell>

                  <TableCell>
                    <Badge variant={mc.tone} icon={mc.icon} size="sm">
                      {mc.label}
                    </Badge>
                  </TableCell>

                  <TableCell className="font-mono text-xs text-neutral-700">
                    {p.reference_number || <span className="text-neutral-500">—</span>}
                  </TableCell>

                  <TableCell className="max-w-[180px] text-xs text-neutral-700">
                    {p.notes
                      ? <span className="block truncate">{p.notes}</span>
                      : <span className="text-neutral-500">—</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </Table>
        </Card>

        {!loading && !loadError && pageMeta.count > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            count={pageMeta.count}
            hasPrevious={Boolean(pageMeta.previous)}
            hasNext={Boolean(pageMeta.next)}
            onPageChange={(p) => fetchPayments(p)}
          />
        )}


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

    </>
  );
}
