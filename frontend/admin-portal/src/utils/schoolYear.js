// Centralized "school year" helpers. Previously every page reimplemented its
// own current-year formula with drifting cutoff months (May/July/August) —
// this is the single source of truth those pages now read from, seeded by
// the global SchoolYearContext.

// School year runs July 1 – June 30 (matches EventModal's syMin/syMax in
// AcademicCalendarPage.jsx): before July, we're still in the tail end of the
// previous year's calendar (e.g. March 2026 is still S.Y. 2025-2026).
export function computeDefaultSchoolYear(today = new Date()) {
  const y = today.getFullYear();
  return today.getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// "2025-2026" -> "2026-2027". Promote carries a class into exactly this year;
// the server refuses any other.
export function followingSchoolYear(year) {
  const start = parseInt(String(year).slice(0, 4), 10);
  return Number.isNaN(start) ? "" : `${start + 1}-${start + 2}`;
}

export function buildSchoolYearOptions(centerYear, { past = 3, future = 1 } = {}) {
  const center = parseInt(String(centerYear).slice(0, 4), 10) || new Date().getFullYear();
  const length = past + future + 1;
  return Array.from({ length }, (_, i) => {
    const y = center + future - i;
    return `${y}-${y + 1}`;
  });
}


// ── Picker presentation ──────────────────────────────────────────────────────
//
// How ui/SchoolYearPicker groups the years it offers. Kept here rather than in
// the component so any other year control groups them the same way: the same
// year sitting under "Recent" in one and "Earlier" in another would be one
// dataset telling two stories.

// How many non-current years stay in "Recent" before the rest fall into
// "Earlier". A school gains one year per year, so this only ever grows slowly;
// the grouping exists to make the list scannable, not to hide data.
export const RECENT_YEARS = 4;

/**
 * Group years so the one you're working in is first, recent history next, and
 * the long tail still reachable without a second click. Empty groups are
 * dropped, so a school with two years on file sees almost no grouping rather
 * than three headers over one entry each.
 *
 * @param {string[]} options      every year to offer, newest first
 * @param {string}   currentYear  the year treated as "Current"
 * @returns {Array<[string, string[]]>} [groupLabel, years] pairs, in order
 */
export function groupYears(options, currentYear) {
  const rest = options.filter((y) => y !== currentYear);
  return [
    ["Current", options.filter((y) => y === currentYear)],
    ["Recent", rest.slice(0, RECENT_YEARS)],
    ["Earlier", rest.slice(RECENT_YEARS)],
  ].filter(([, years]) => years.length > 0);
}

/**
 * The year list for a form that ENROLLS INTO a year, rather than filtering
 * years that already have data — an enrollment form, or a promotion's target.
 *
 * Those forms need next year before it exists in any record (you enrol for
 * September in March), so the real list alone would leave the year you
 * actually want unofferable. They previously each built a rolling window off
 * `new Date()` instead — 4 years in one place, 5 in another, on the same page
 * — which ignored the real data entirely and went stale exactly the way the
 * old sidebar window did.
 *
 * @param {string[]} options      years that exist in the data
 * @param {string}   currentYear  the active year
 */
export function yearOptionsForEntry(options = [], currentYear) {
  const base = currentYear || computeDefaultSchoolYear();
  const startYear = parseInt(String(base).slice(0, 4), 10);
  const next = Number.isNaN(startYear) ? null : `${startYear + 1}-${startYear + 2}`;

  const all = new Set(options.filter(Boolean));
  all.add(base);
  if (next) all.add(next);
  return [...all].sort().reverse();
}
