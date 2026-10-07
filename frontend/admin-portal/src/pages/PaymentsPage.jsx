import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import useYearFilter from "../hooks/useYearFilter";
import { useSchoolYear } from "../context/SchoolYearContext";
import { useState, useEffect, useCallback, useRef } from "react";
import RecordPaymentModal from "../components/RecordPaymentModal";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Pagination from "../components/Pagination";
import StatusBand from "../components/ui/StatusBand";
import FilterMenu from "../components/ui/FilterMenu";
import RangeMenu from "../components/ui/RangeMenu";
import SearchField from "../components/ui/SearchField";
import SchoolYearMenu from "../components/ui/SchoolYearMenu";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
import { seriesDot } from "../constants/statusTones";

import { getPayments as _getPayments, getPaymentSummary } from "../api/billingApi";
import { fmtDate } from "../utils/format";
import { amountRangeLabel, dateRangeLabel, datePresets } from "../utils/ranges";
import { PAYMENT_METHODS, PAYMENT_METHOD_MAP as PM } from "../constants/paymentMethods";
const getPayments = (p = {}) => _getPayments(p);

// ── Constants ─────────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: "-payment_date", label: "Newest first" },
  { value: "payment_date",  label: "Oldest first" },
  { value: "-amount_paid",  label: "Largest first" },
  { value: "amount_paid",   label: "Smallest first" },
];
const DEFAULT_SORT = "-payment_date";

// A method keeps its colour whatever the filters do: it's handed out by the
// method's place in PAYMENT_METHODS, never by how much it collected.
const METHOD_DOT = Object.fromEntries(PAYMENT_METHODS.map((m, i) => [m.value, seriesDot(i)]));

// Long enough that a word is finished, short enough that the list keeps up.
// The same wait as the other list pages.
const SEARCH_DEBOUNCE_MS = 300;

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
// The band's figures are whole pesos: centavos across six methods made the
// legend twice as long without saying anything the table doesn't.
const wholePesos = (n) => `₱${Math.round(Number(n) || 0).toLocaleString("en-PH")}`;

// Not sortable here: the Sort menu drives the API's `ordering`.
const TABLE_COLUMNS = [
  { key: "student",   label: "Student",   width: "24%" },
  { key: "invoice",   label: "Invoice",   width: "15%" },
  { key: "date",      label: "Date",      width: "12%" },
  { key: "amount",    label: "Amount",    width: "12%", align: "right" },
  { key: "method",    label: "Method",    width: "13%" },
  { key: "reference", label: "Reference", width: "11%" },
  { key: "notes",     label: "Notes",     width: "13%" },
];

// ════════════════════════════════════════════════════════════════════════════════
export default function PaymentsPage() {
  usePageTitle("Payments");
  const navigate    = useNavigate();
  const [searchParams] = useSearchParams();
  const isFirstRender = useIsFirstRender();
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
  const [sortField,    setSortField]    = useState(DEFAULT_SORT);
  const [search,       setSearch]       = useState("");
  const searchRef = useRef(null);
  // Opens on the current school year, the way Enrollments and Grades do —
  // opening on "All years" made this the one year-scoped page that started
  // unscoped, and left its picker sitting grey while theirs read as active.
  const { currentYear } = useSchoolYear();
  const [yearFilter,   setYearFilter, yearIsDefault] = useYearFilter();

  const hasActiveFilters = methodFilter !== "all" || dateFrom || dateTo || amountMin || amountMax ||
    sortField !== DEFAULT_SORT || search.trim() !== "" || !yearIsDefault;

  const buildParams = (p = 1, overrides = {}) => {
    const f = { methodFilter, dateFrom, dateTo, amountMin, amountMax, sortField, search, yearFilter, ...overrides };
    const params = { page: p, ordering: f.sortField };
    if (f.methodFilter !== "all") params.payment_method = f.methodFilter;
    if (f.dateFrom)  params.date_from  = f.dateFrom;
    if (f.dateTo)    params.date_to    = f.dateTo;
    if (f.amountMin) params.amount_min = f.amountMin;
    if (f.amountMax) params.amount_max = f.amountMax;
    if (f.search?.trim()) params.search = f.search.trim();
    if (f.yearFilter) params.school_year = f.yearFilter;
    return params;
  };

  // The band reports per-method totals for the year, dates and amounts. It
  // drops page and ordering, the method itself -- scoping it to one method
  // would zero out the other five -- and the search, which narrows only the
  // rows, as on the other list pages.
  const buildSummaryParams = (overrides = {}) => {
    const params = buildParams(1, overrides);
    delete params.page;
    delete params.ordering;
    delete params.payment_method;
    delete params.search;
    return params;
  };

  // A failed load must be distinguishable from an empty result — this used to
  // swallow the error and fall through to "No payments found · Record the
  // first payment", which during an outage reads as a fresh install.
  const [loadError, setLoadError] = useState(null);
  // Separate from `loading` so the band only reads "—" on the very first
  // load, not on every filter change and page.
  const [tilesLoading, setTilesLoading] = useState(true);
  const [methodTotals, setMethodTotals] = useState({});

  // Only the newest request may fill the page: filters fire requests back to
  // back, and an older one landing last showed its list and totals under the
  // newer filter's labels.
  const fetchSeq = useRef(0);
  // The year the newest request asked for — see the year effect below.
  const requestedYear = useRef(yearFilter);
  const fetchPayments = useCallback(async (p = 1, overrides = {}) => {
    const seq = ++fetchSeq.current;
    requestedYear.current = overrides.yearFilter ?? yearFilter;
    setLoading(true);
    setLoadError(null);
    try {
      const [data, summary] = await Promise.all([
        getPayments(buildParams(p, overrides)),
        getPaymentSummary(buildSummaryParams(overrides)),
      ]);
      if (seq !== fetchSeq.current) return;
      setPayments(Array.isArray(data) ? data : data?.results ?? []);
      setPageMeta({ count: data.count ?? 0, next: data.next, previous: data.previous });
      setPage(p);
      setMethodTotals(summary ?? {});
      setTilesLoading(false);
    } catch (e) {
      if (seq !== fetchSeq.current) return;
      console.error(e);
      setLoadError(e);
      setPayments([]);
      setPageMeta({ count: 0, next: null, previous: null });
    }
    finally { if (seq === fetchSeq.current) setLoading(false); }
  // buildParams/buildSummaryParams are rebuilt every render from exactly the
  // filters listed here; naming them would recreate this callback per render.
  }, [methodFilter, dateFrom, dateTo, amountMin, amountMax, sortField, search, yearFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // The current year can arrive from School Settings after the first load, and
  // the filter follows it until someone picks a year. Reload when that happens
  // — moving the picker alone kept the first load's list and totals under a
  // label naming a different year. Changes that already fetched with their
  // year (the picker, Clear filters) are skipped rather than fetched twice.
  useEffect(() => {
    if (yearFilter === requestedYear.current) return;
    fetchPayments(1);
  }, [yearFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount and on an explicit refresh only; filter changes fetch themselves.
  useEffect(() => {
    fetchPayments();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search as you type, once typing pauses. Every other control fetches on
  // change, which is right for a click but wrong for a text field. Skipped
  // on first render, where the effect above already loads page 1.
  const searchDebounce = useRef(null);
  const searchMounted  = useRef(false);
  useEffect(() => {
    if (!searchMounted.current) { searchMounted.current = true; return; }
    searchDebounce.current = setTimeout(() => fetchPayments(1), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(searchDebounce.current);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearFilters = () => {
    setMethodFilter("all");
    setDateFrom(""); setDateTo("");
    setAmountMin(""); setAmountMax("");
    setSortField(DEFAULT_SORT);
    setSearch(""); setYearFilter(null); // back to the current school year
    fetchPayments(1, { methodFilter:"all", dateFrom:"", dateTo:"", amountMin:"", amountMax:"", sortField: DEFAULT_SORT, search:"", yearFilter: currentYear });
    searchRef.current?.focus();
  };

  const totalPages = Math.ceil(pageMeta.count / 20);

  // What the band counts: the year, and the dates and amounts when set.
  const bandCaption = [
    `collected in ${yearFilter ? `S.Y. ${yearFilter}` : "all school years"}`,
    (dateFrom || dateTo) && dateRangeLabel(dateFrom, dateTo),
    (amountMin || amountMax) && `payments of ${amountRangeLabel(amountMin, amountMax).replace(/^(At least|Up to)/, (w) => w.toLowerCase())}`,
  ].filter(Boolean).join(" · ");

  const methodMeta = PM[methodFilter];

  return (
    <>
      <PageHeader
        title="Payments"
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

      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">

        {/* ── What came in, by method, and the method filter ──
            The school year sits in the band because its totals are counted
            for it; its years are the ones with payments. */}
        <StatusBand
          total={tilesLoading ? undefined : methodTotals.total}
          caption={bandCaption}
          format={wholePesos}
          aside={
            <SchoolYearMenu
              value={yearFilter}
              onChange={(v) => { setYearFilter(v); fetchPayments(1, { yearFilter: v }); }}
              years={methodTotals.school_years ?? []}
            />
          }
          options={[
            { value: "all", label: "All", count: tilesLoading ? undefined : methodTotals.total },
            ...PAYMENT_METHODS.map((m) => ({
              value: m.value,
              label: m.label,
              count: tilesLoading ? undefined : (methodTotals[m.value] ?? 0),
              dot: METHOD_DOT[m.value],
            })),
          ]}
          value={methodFilter}
          allValue="all"
          onChange={(v) => { setMethodFilter(v); fetchPayments(1, { methodFilter: v }); }}
          label="Filter by payment method"
        />

        {/* ── Toolbar: search, the filter menus, Clear ──
            The menus open to the right edge, where the pills sit. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField
            id="payment-search"
            label="Search payments by student name, LRN, or invoice number"
            placeholder="Search by student name, LRN, or invoice no.…"
            inputRef={searchRef}
            value={search}
            onChange={setSearch}
            onEnter={() => fetchPayments(1)}
            onClear={() => setSearch("")}
          />

          {/* Dates and amounts commit together on Apply: a half-typed range
              would refetch on every keystroke. */}
          <RangeMenu
            label="Date"
            valueLabel={dateRangeLabel(dateFrom, dateTo)}
            active={Boolean(dateFrom || dateTo)}
            fields={[
              { key: "from", label: "From", type: "date", value: dateFrom },
              { key: "to",   label: "To",   type: "date", value: dateTo },
            ]}
            presets={datePresets()}
            onApply={({ from, to }) => {
              setDateFrom(from); setDateTo(to);
              fetchPayments(1, { dateFrom: from, dateTo: to });
            }}
          />

          <RangeMenu
            label="Amount"
            valueLabel={amountRangeLabel(amountMin, amountMax)}
            active={Boolean(amountMin || amountMax)}
            fields={[
              { key: "min", label: "At least", type: "number", value: amountMin, prefix: "₱" },
              { key: "max", label: "Up to",    type: "number", value: amountMax, prefix: "₱" },
            ]}
            onApply={({ min, max }) => {
              setAmountMin(min); setAmountMax(max);
              fetchPayments(1, { amountMin: min, amountMax: max });
            }}
          />

          <FilterMenu
            label="Sort"
            valueLabel={SORT_OPTIONS.find((o) => o.value === sortField)?.label ?? "Newest first"}
            active={sortField !== DEFAULT_SORT}
            options={SORT_OPTIONS}
            value={sortField}
            onChange={(v) => { setSortField(v); fetchPayments(1, { sortField: v }); }}
            align="end"
            menuWidth={180}
          />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="focus-ring flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-error-600 transition-colors duration-150 hover:bg-brand-100"
            >
              <i className="ti ti-filter-off text-[14px]" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>

        {/* ── Payments table ── */}
        <motion.div
          initial={isFirstRender ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.1 : 0 }}
        >
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-baseline gap-2.5 border-b border-neutral-200 px-5 py-4">
              <h2 className="text-md font-bold text-neutral-900">
                {methodMeta ? `${methodMeta.label} payments` : "All payments"}
              </h2>
              {!loading && !loadError && (
                <span className="text-sm text-neutral-500 tabular-nums">{pageMeta.count.toLocaleString()}</span>
              )}
            </div>
            <Table
              headerVariant="quiet"
              columns={TABLE_COLUMNS}
              loading={loading}
              error={loadError}
              onRetry={() => fetchPayments(page)}
              errorSubject="payments"
              isEmpty={payments.length === 0}
              empty={{
                icon: "ti-cash",
                title: hasActiveFilters ? "No payments match these filters" : "No payments yet",
                subtitle: hasActiveFilters
                  ? "Try a different search, or clear the filters."
                  : "Record the first payment to get started.",
                action: hasActiveFilters ? (
                  <Button variant="secondary" size="sm" icon="ti-filter-off" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
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
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                          style={{ background: pal.bg, color: pal.color }}
                          aria-hidden="true"
                        >
                          {name ? initialsFrom(name) : <i className="ti ti-user text-[14px]" />}
                        </div>
                        <span className="truncate text-[13px] font-semibold text-neutral-900">
                          {name ?? <span className="font-normal italic text-neutral-500">Unknown</span>}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <button
                        type="button"
                        onClick={() => navigate(`/invoices?selected=${p.invoice}`)}
                        className="focus-ring whitespace-nowrap rounded-sm font-mono text-[12px] font-semibold text-brand-600 underline transition-colors hover:text-brand-700"
                      >
                        {invNo}
                      </button>
                    </TableCell>

                    <TableCell>
                      <span className="whitespace-nowrap text-sm text-neutral-800">{fmtDate(p.payment_date)}</span>
                    </TableCell>

                    <TableCell align="right">
                      <span className="whitespace-nowrap text-[13px] font-bold text-neutral-900 tabular-nums">{fmt(p.amount_paid)}</span>
                    </TableCell>

                    {/* The same dot as the band's legend. */}
                    <TableCell>
                      <span className="inline-flex items-center gap-2 text-sm text-neutral-800">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${METHOD_DOT[p.payment_method] ?? METHOD_DOT.others}`} aria-hidden="true" />
                        {mc.label}
                      </span>
                    </TableCell>

                    <TableCell>
                      {p.reference_number
                        ? <span className="block max-w-[150px] truncate font-mono text-[12px] text-neutral-800" title={p.reference_number}>{p.reference_number}</span>
                        : <span className="text-sm italic text-neutral-500">—</span>}
                    </TableCell>

                    <TableCell>
                      {p.notes
                        ? <span className="block max-w-[180px] truncate text-sm text-neutral-700" title={p.notes}>{p.notes}</span>
                        : <span className="text-sm italic text-neutral-500">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </Table>
          </Card>
        </motion.div>

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
