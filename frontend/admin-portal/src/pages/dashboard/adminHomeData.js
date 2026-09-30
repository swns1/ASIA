// Plain helpers behind AdminHome: wording, dates and the attention queue.
// Kept out of the component file so it only exports components (fast refresh)
// and so these can be tested on their own.

import { LEVEL_LABELS, LEVEL_SHORT_LABELS } from "../../constants/schoolLevels";

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

// A section's name on a tile, where "Grade 3 · Rizal" won't fit: "3-Rizal",
// "K-Sunflower", "N-Rose". Senior High adds its strand unless the section's
// own name already carries it: "11-STEM-A", not "11-STEM-STEM-A".
export function sectionShortName(s) {
  const grade = /^Grade (\d+)$/.exec(s.grade_level ?? "")?.[1] ?? String(s.grade_level ?? "").charAt(0);
  const strand = s.strand && !String(s.section).toUpperCase().includes(s.strand.toUpperCase()) ? s.strand : null;
  return [grade, strand, s.section].filter(Boolean).join("-");
}

// Sections grouped by school level, youngest first, each level keeping the
// order the server listed its sections in.
export function sectionsByLevel(sections) {
  return Object.keys(LEVEL_LABELS)
    .map((level) => ({
      level,
      label: LEVEL_SHORT_LABELS[level],
      sections: sections.filter((s) => s.school_level === level),
    }))
    .filter((group) => group.sections.length);
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

// How far `now` moved from `before`: the difference and its size as a
// percentage of `before`, to one decimal. Null when either year has no figure
// -- nothing to compare isn't the same as no change. `pct` is null when
// `before` is zero.
export function yearChange(now, before) {
  if (now == null || before == null) return null;
  const a = Number(now);
  const b = Number(before);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  // Whole centavos: money arrives as strings like "540666.40", and float
  // subtraction would otherwise leave a stray 0.0000001 reading as a change.
  const diff = Math.round((a - b) * 100) / 100;
  return { diff, pct: b ? Math.round((Math.abs(diff) * 1000) / b) / 10 : null };
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

// ── Months ──────────────────────────────────────────────────────────────────
// Spelled out rather than taken from toLocaleDateString, whose short form of
// September is "Sep" in some locales and "Sept" in others.
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

// Weeks grouped by the month each starts in, for an axis that names a month
// once across its weeks instead of dating every week.
export function monthSpans(weeks) {
  return weeks.reduce((spans, w) => {
    const key = w.week.slice(0, 7);
    const last = spans[spans.length - 1];
    if (last?.key === key) last.span += 1;
    else spans.push({ key, label: MONTH_ABBR[Number(key.slice(5, 7)) - 1], span: 1 });
    return spans;
  }, []);
}

// ── Collection pace ─────────────────────────────────────────────────────────

/**
 * Each year's share of its net billing collected by the end of each month of
 * the school year, from the financial summary's `collections_series`.
 *
 * Months run June to March, DepEd's calendar, and on into April or May if
 * either year collected then. The two years line up by month, so this
 * September is read against last September. Money paid before June (at
 * enrollment) counts from June, where the line starts.
 *
 * Only finished months get a figure: this month is still collecting, and half
 * a month against last year's whole one would always read as behind.
 *
 * Null when this year has nothing billed. `latest` is the last finished month
 * with a figure this year, or null while none has finished.
 */
export function collectionPace(year, current, previous, today) {
  const start = Number(String(year).slice(0, 4));
  const net = (summary) => Number(summary?.net_billed ?? 0);
  if (!(net(current) > 0)) return null;

  // Months since June of `from`: 0 is June, 9 is March.
  const monthsSince = (from, y, m) => (y - from) * 12 + (m - 6);
  const series = (summary, from) => (summary?.collections_series ?? []).map((row) => {
    const [y, m] = row.month.split("-").map(Number);
    return { at: monthsSince(from, y, m), cumulative: Number(row.cumulative) };
  });
  const cur = series(current, start);
  const prev = net(previous) > 0 ? series(previous, start - 1) : null;
  const end = Math.min(11, Math.max(9, ...cur.map((r) => r.at), ...(prev ?? []).map((r) => r.at)));
  const lastFinished = (from) => monthsSince(from, today.getFullYear(), today.getMonth() + 1) - 1;

  // The running total at the last month on or before `at` (the series is
  // oldest first), as a share of that year's net billing.
  const shareBy = (rows, summary, at) =>
    (rows.reduce((sum, r) => (r.at <= at ? r.cumulative : sum), 0) * 100) / net(summary);

  const months = Array.from({ length: end + 1 }, (_, at) => ({
    key: at,
    short: MONTH_ABBR[(5 + at) % 12],
    name: MONTH_NAMES[(5 + at) % 12],
    now: at <= lastFinished(start) ? shareBy(cur, current, at) : null,
    before: prev && at <= lastFinished(start - 1) ? shareBy(prev, previous, at) : null,
  }));
  const latest = months.findLast((m) => m.now != null) ?? null;
  // Last year's final figure, once its last month is over.
  const lastYearFinal = prev && lastFinished(start - 1) >= end ? months[end].before : null;
  return { months, latest, lastYearFinal };
}
