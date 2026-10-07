// ranges.js — the quick picks and pill labels for a RangeMenu, so a date or
// amount range reads the same on every page that filters by one (Payments,
// Scholarships).
import { fmtDate, localISODate, todayISO } from "./format";

/** Today, this month, last month and this year, as { from, to } picks. */
export function datePresets(now = new Date()) {
  const today = localISODate(now);
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastOfLast = new Date(now.getFullYear(), now.getMonth(), 0);
  return [
    { label: "Today",      values: { from: today, to: today } },
    { label: "This month", values: { from: localISODate(firstOfMonth), to: today } },
    { label: "Last month", values: { from: localISODate(firstOfLast), to: localISODate(lastOfLast) } },
    { label: "This year",  values: { from: `${now.getFullYear()}-01-01`, to: today } },
  ];
}

/** What a date range pill says: "Any", "Today", "From Jun 1, 2026", … */
export function dateRangeLabel(from, to) {
  if (!from && !to) return "Any";
  if (from && from === to) return from === todayISO() ? "Today" : fmtDate(from);
  if (from && to) return `${fmtDate(from)} – ${fmtDate(to)}`;
  return from ? `From ${fmtDate(from)}` : `Until ${fmtDate(to)}`;
}

const pesos = (v) => `₱${Number(v).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;

/** What an amount range pill says: "Any", "₱1,000 – ₱5,000", "At least ₱500". */
export function amountRangeLabel(min, max) {
  if (!min && !max) return "Any";
  if (min && max) return `${pesos(min)} – ${pesos(max)}`;
  return min ? `At least ${pesos(min)}` : `Up to ${pesos(max)}`;
}
