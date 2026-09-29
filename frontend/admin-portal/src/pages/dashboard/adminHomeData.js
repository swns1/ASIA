// Plain helpers behind AdminHome: wording, dates and the attention queue.
// Kept out of the component file so it only exports components (fast refresh)
// and so these can be tested on their own.

import { LEVEL_LABELS } from "../../constants/schoolLevels";

export const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function greeting(now) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// "2026-10-23" is a calendar date, not an instant. `new Date("2026-10-23")`
// reads it as UTC midnight, which is the day before in some time zones.
function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysUntil(iso, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseDate(iso) - today) / 86_400_000);
}

export function dueLine(iso, now) {
  if (!iso) return null;
  const days = daysUntil(iso, now);
  const date = parseDate(iso).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });
  if (days > 1)   return { text: `Due ${date} · ${days} days left`, late: false };
  if (days === 1) return { text: `Due tomorrow, ${date}`, late: false };
  if (days === 0) return { text: "Due today", late: false };
  return { text: `Was due ${date} · ${plural(-days, "day")} ago`, late: true };
}

export function sectionName(s) {
  return [s.grade_level, s.strand, s.section].filter(Boolean).join(" · ");
}

// Adds the page's year to a list-page link that doesn't carry one.
export function withYear(link, year) {
  if (!year || /[?&]school_year=/.test(link)) return link;
  return `${link}${link.includes("?") ? "&" : "?"}school_year=${encodeURIComponent(year)}`;
}

// Every link carries the school year its count came from, because the list
// pages open on the year in their link.
export function attentionRows(data, schoolYear) {
  const sy = encodeURIComponent(schoolYear ?? "");
  return [
    {
      id: "pending", count: data.pending, icon: "ti-clipboard-list", tone: "warning", action: "Review",
      text: (n) => `${plural(n, "enrollment")} waiting for your approval`,
      to: `/enrollments?enrollment_status=pending&school_year=${sy}`,
    },
    {
      id: "applications", count: data.applications, icon: "ti-user-plus", tone: "info", action: "Review",
      text: (n) => `${plural(n, "new application")} to look over`,
      to: "/student-applications",
    },
    {
      id: "unpaid", count: data.unpaid, icon: "ti-receipt-off", tone: "error", action: "View",
      text: (n) => `${plural(n, "invoice")} with no payment yet`,
      to: `/invoices?status=unpaid&school_year=${sy}`,
    },
    {
      id: "overdue", count: data.overdue, icon: "ti-clock-exclamation", tone: "error", action: "View",
      text: (n) => `${plural(n, "invoice")} with a payment past due`,
      to: `/invoices?overdue=1&school_year=${sy}`,
    },
  ].filter((r) => r.count > 0);
}

// ── This year vs last year ──────────────────────────────────────────────────

// How far `now` moved from `before`: the difference and its size as a whole
// percentage of `before`. Null when either year has no figure -- nothing to
// compare isn't the same as no change. `pct` is null when `before` is zero.
export function yearChange(now, before) {
  if (now == null || before == null) return null;
  const a = Number(now);
  const b = Number(before);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  // Whole centavos: money arrives as strings like "540666.40", and float
  // subtraction would otherwise leave a stray 0.0000001 reading as a change.
  const diff = Math.round((a - b) * 100) / 100;
  return { diff, pct: b ? Math.round((Math.abs(diff) * 100) / b) : null };
}

// Chart rows for learners by school level, in the school's own order. A level
// with nobody in either year is left out, as on Compare School Years. Without
// a previous year every row's `previous` is null, which draws this year alone.
export function levelRows(current = {}, previous = null) {
  return Object.keys(LEVEL_LABELS)
    .map((level) => ({
      key: level,
      label: LEVEL_LABELS[level],
      current: current?.[level] ?? 0,
      previous: previous ? previous[level] ?? 0 : null,
    }))
    .filter((row) => row.current || row.previous);
}
