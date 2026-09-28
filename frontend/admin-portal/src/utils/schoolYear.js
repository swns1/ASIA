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
 * Those forms offer the years an admin has set up and not archived: the
 * context's `entryYears`. Next year is offerable before anyone is enrolled in
 * it because an admin registers it as "upcoming" first — which replaces the
 * old trick of inventing next year from the current year's label, a year the
 * database would now refuse because nobody set it up.
 *
 * @param {string[]} entryYears   registered, unarchived years (context)
 * @param {string}   [keep]       a value to keep offerable even if it's no
 *                                longer an entry year — an existing record's
 *                                own year, when editing it
 */
export function yearOptionsForEntry(entryYears = [], keep) {
  const all = new Set(entryYears.filter(Boolean));
  if (keep) all.add(keep);
  return [...all].sort().reverse();
}
