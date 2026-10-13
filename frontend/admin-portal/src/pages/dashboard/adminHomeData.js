// Plain helpers behind AdminHome: wording, dates and the attention queue.
// Kept out of the component file so it only exports components (fast refresh)
// and so these can be tested on their own.

import { LEVEL_LABELS, LEVEL_SHORT_LABELS } from "../../constants/schoolLevels";
import { PERIOD_LABEL, quarterEventOn } from "../../utils/grading";
import { fmtLongDay, localISODate } from "../../utils/format";

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

/**
 * The label of the quarter `now` falls in, from the Academic Calendar's
 * Grading Period events (utils/grading.js), or null on a day between quarters
 * or a calendar without them. The admin home gets the same label from the
 * teachers-today endpoint, which other roles can't read.
 */
export function quarterOn(events, now) {
  const hit = quarterEventOn(events, now);
  return hit ? PERIOD_LABEL[hit.grading_period] ?? hit.title ?? null : null;
}

export function dueLine(iso, now) {
  if (!iso) return null;
  const days = daysUntil(iso, now);
  const date = fmtLongDay(parseDate(iso));
  if (days > 1)   return { text: `Due ${date} · ${days} days left`, late: false };
  if (days === 1) return { text: `Due tomorrow, ${date}`, late: false };
  if (days === 0) return { text: "Due today", late: false };
  return { text: `Was due ${date} · ${plural(-days, "day")} ago`, late: true };
}

/**
 * Teachers today's due lines. Grades below Senior High are due when the
 * quarter ends; Senior High grades by semester, so its are due when the
 * semester does (teachers_today.py). A school with both gets a labelled line
 * for each. Only sections with subjects count, and only calendar dates: a
 * period guessed from grades has no due date.
 */
export function gradesDue(period, sections, now) {
  if (period?.source !== "calendar") return [];
  const graded = sections.filter((s) => s.grades);
  const shs = graded.some((s) => s.school_level === "senior_highschool");
  const rest = graded.some((s) => s.school_level !== "senior_highschool");
  const both = shs && rest;
  return [
    rest && { ...dueLine(period.due_date, now), label: both ? period.label : null },
    shs && { ...dueLine(period.semester_due_date, now), label: both ? `Senior High ${period.semester_label}` : null },
  ].filter((d) => d?.text);
}

export function sectionName(s) {
  return [s.grade_level, s.strand, s.section].filter(Boolean).join(" · ");
}

// My Sections opened on one section's tab (TeacherSectionsPage reads
// ?school_year=&section=&tab=&period=&subject=), for the teacher's home.
export function mySectionsLink(year, advisoryId, tab, { period, subject } = {}) {
  const q = new URLSearchParams({ school_year: year, section: String(advisoryId), tab });
  if (period) q.set("period", period);
  if (subject) q.set("subject", String(subject));
  return `/my-sections?${q.toString()}`;
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

// The teacher's "Coming up": today and the next COMING_UP_DAYS days, as local
// calendar dates. One window for the request and the list, so the list can't
// ask for days it wasn't sent. Asked for by date, not by school year: near a
// year's end the window runs into the next one's opening days.
export const COMING_UP_DAYS = 45;

export function comingUpWindow(now = new Date()) {
  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + COMING_UP_DAYS);
  return { from: localISODate(now), to: localISODate(until) };
}

// Two cards to a row on a home page: two equal columns while both get 420px
// or more, one column below that -- and never three, however wide the screen.
// Cards in a row stretch to the taller one's height.
export const TWO_UP = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(420px,calc(50%_-_8px))),1fr))] gap-4";

/**
 * Settles every request in `parts` ({ key: promise }) and answers
 * `{ data, failed }`: each fulfilled value by its key, and the keys that
 * failed. One failed request shouldn't blank a home page, but it must not
 * pass silently either: a missing count would read as "nothing to do".
 */
export async function settleAll(parts, label = "Home") {
  const keys = Object.keys(parts);
  const results = await Promise.allSettled(Object.values(parts));
  const data = {};
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") data[keys[i]] = r.value;
    else {
      failed.push(keys[i]);
      console.error(`${label}: ${keys[i]} failed`, r.reason);
    }
  });
  return { data, failed };
}

// Adds the page's year to a list-page link that doesn't carry one.
export function withYear(link, year) {
  if (!year || /[?&]school_year=/.test(link)) return link;
  return `${link}${link.includes("?") ? "&" : "?"}school_year=${encodeURIComponent(year)}`;
}

// What's waiting on the admin (the bell's queues) is in ./attention.js,
// shared with the staff dashboard.

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
