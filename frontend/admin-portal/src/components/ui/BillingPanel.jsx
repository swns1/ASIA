import { motion, AnimatePresence } from "framer-motion";

import Card from "./Card";
import Button from "./Button";
import Skeleton from "./Skeleton";
import Sparkline from "../charts/Sparkline";

// BillingPanel — the dashboard's money block, as one panel rather than four
// stat cards.
//
// Net Billed, Collected and Outstanding are not three independent metrics:
// collected + outstanding = net_billed, and the collection rate is just
// collected ÷ net_billed. Rendering them as four peer tiles hid that identity
// and spent half the metric strip restating one fact. Here the three figures
// sit in one row and the rate is drawn as the proportion of a single bar, so
// the relationship is visible without a fourth tile asserting it.
//
// The amount-visibility toggle and the school-year filter live in the header
// because they govern every figure in the block. As per-card controls they
// were ambiguous — the eye sat on "Collection Rate" but blurred all four.

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Whole pesos — the bar legend restates figures already given in full above,
// so centavos there are noise.
const pesoShort = (n) =>
  `₱${Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

export default function BillingPanel({
  summary,
  loading = false,
  schoolYear,
  filterYear,
  onFilterYearChange,
  schoolYearOptions = [],
  showAmounts = true,
  onToggleAmounts,
  showFilters = false,
  onToggleFilters,
  onOpenInvoices,
  className = "",
}) {
  const net = parseFloat(summary?.net_billed ?? 0);
  const collected = parseFloat(summary?.total_collected ?? 0);
  const outstanding = parseFloat(summary?.outstanding ?? 0);
  const invoiceCount = summary?.invoice_count ?? 0;

  const collectionPct = net > 0 ? Math.min(100, Math.round((collected / net) * 100)) : 0;

  // Blurring is a presentation concern only — the figures are still in the DOM,
  // so this hides them from someone glancing at the screen, not from anyone
  // inspecting it. `select-none` stops a blurred value being copied by drag.
  const hideStyle = {
    filter: showAmounts ? "none" : "blur(8px)",
    userSelect: showAmounts ? "auto" : "none",
  };

  const cells = [
    {
      key: "net_billed",
      label: "Net Billed",
      value: net,
      dot: "bg-neutral-400",
      tone: "text-neutral-900",
      link: "/invoices",
    },
    {
      key: "total_collected",
      label: "Collected",
      value: collected,
      dot: "bg-success-dot",
      tone: "text-success-500",
      link: "/invoices?status=paid",
      // Only collections have a real month-by-month history behind them
      // (Payment.payment_date). net_billed is a balance and outstanding is
      // derived from it, so neither has a series to draw.
      series: (summary?.collections_series ?? []).map((m) => Number(m.cumulative)),
    },
    {
      key: "outstanding",
      label: "Outstanding",
      value: outstanding,
      dot: "bg-error-dot",
      tone: "text-error-500",
      link: "/invoices?status=unpaid",
    },
  ];

  return (
    <Card padding="none" className={`overflow-hidden ${className}`}>
      <div className="flex items-center gap-2.5 border-b border-neutral-200 px-5 py-3.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-info-50">
          <i className="ti ti-receipt text-[14px] text-info-500" aria-hidden="true" />
        </div>
        <span className="flex-1 text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500">
          Billing · S.Y. {filterYear ?? schoolYear}
        </span>

        {!loading && net > 0 && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              collectionPct >= 80
                ? "bg-success-50 text-success-500"
                : collectionPct >= 50
                  ? "bg-warning-50 text-warning-500"
                  : "bg-error-50 text-error-500"
            }`}
            style={hideStyle}
          >
            {collectionPct}% collected
          </span>
        )}

        <div className="flex gap-1">
          {filterYear && (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon="ti-x"
              title="Reset to current school year"
              aria-label="Reset to current school year"
              onClick={() => onFilterYearChange?.(null)}
            />
          )}
          <Button
            variant={showAmounts ? "secondary" : "ghost"}
            size="sm"
            iconOnly
            icon={showAmounts ? "ti-eye" : "ti-eye-off"}
            title={showAmounts ? "Hide amounts" : "Show amounts"}
            aria-label={showAmounts ? "Hide financial amounts" : "Show financial amounts"}
            aria-pressed={!showAmounts}
            onClick={onToggleAmounts}
          />
          <Button
            variant={filterYear ? "secondary" : "ghost"}
            size="sm"
            iconOnly
            icon="ti-adjustments-horizontal"
            title="Filter by school year"
            aria-label="Filter by school year"
            aria-expanded={showFilters}
            onClick={onToggleFilters}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="overflow-hidden border-b border-neutral-200"
          >
            <div className="px-5 py-3">
              <label className="sr-only" htmlFor="billing-year">School year</label>
              <select
                id="billing-year"
                value={filterYear ?? ""}
                onChange={(e) => onFilterYearChange?.(e.target.value || null)}
                className="focus-ring w-full cursor-pointer rounded-sm border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 outline-none sm:max-w-[220px]"
              >
                <option value="">Current ({schoolYear})</option>
                {schoolYearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 sm:grid-cols-3">
        {cells.map((cell) => (
          <div
            key={cell.key}
            className="border-b border-neutral-200 px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cell.dot}`} aria-hidden="true" />
              {cell.label}
            </div>

            {loading ? (
              <Skeleton height={22} width="70%" variant="pulse" className="mt-2" />
            ) : (
              <div className="mt-2 flex items-end gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpenInvoices?.(cell.link)}
                  className={`focus-ring rounded-sm text-left text-xl font-bold tracking-[-0.02em] transition-colors hover:text-brand-600 ${cell.tone}`}
                  style={hideStyle}
                >
                  {peso(cell.value)}
                </button>
                {cell.series?.length > 0 && (
                  <Sparkline values={cell.series} className={showAmounts ? "" : "blur-[6px]"} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* The collection rate, drawn rather than stated. Hidden while loading
          and when nothing is billed — a full-width empty track would read as
          0% collected, which is not the same as "nothing to collect". */}
      {!loading && net > 0 && (
        <>
          <div
            className="mx-5 flex h-2.5 overflow-hidden rounded-full bg-neutral-200"
            role="img"
            aria-label={`${collectionPct}% collected, ${100 - collectionPct}% outstanding`}
          >
            <div
              className={`h-full transition-[width] duration-500 ${showAmounts ? "bg-success-dot" : "bg-neutral-400"}`}
              style={{ width: `${showAmounts ? collectionPct : 50}%` }}
            />
            <div
              className={`h-full transition-[width] duration-500 ${showAmounts ? "bg-error-dot" : "bg-neutral-300"}`}
              style={{ width: `${showAmounts ? 100 - collectionPct : 50}%` }}
            />
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pb-4 pt-2.5 text-xs text-neutral-500"
            style={hideStyle}
          >
            <span>
              {pesoShort(collected)} collected of {pesoShort(net)} billed
            </span>
            {outstanding > 0 && (
              <span className="font-semibold text-error-500">
                {pesoShort(outstanding)} outstanding across {invoiceCount.toLocaleString()}{" "}
                {invoiceCount === 1 ? "invoice" : "invoices"}
              </span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
