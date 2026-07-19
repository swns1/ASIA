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
