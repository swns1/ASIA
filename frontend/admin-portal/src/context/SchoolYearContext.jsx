import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getSchoolSettings } from "../api/billingApi";
import { getSchoolYears } from "../api/enrollmentApi";
import { isTokenValid, getCurrentUser } from "../utils/auth";
import { computeDefaultSchoolYear, buildSchoolYearOptions } from "../utils/schoolYear";

// A copy of School Settings' current year, not anyone's pick: it lets pages
// open on the right year before the settings request returns, and it is
// overwritten from settings on every load, so it can't outlive a rollover.
const CURRENT_KEY = "current_school_year";
// Where the old sidebar selector kept its pick. That pick outranked School
// Settings for good, so after a rollover every returning user kept opening on
// last year; it is cleared rather than read.
const LEGACY_PICK_KEY = "selected_school_year";
const SchoolYearContext = createContext(null);

function readCachedCurrent() {
  try {
    return localStorage.getItem(CURRENT_KEY) || "";
  } catch {
    return "";
  }
}

function cacheCurrent(year) {
  try {
    localStorage.setItem(CURRENT_KEY, year);
  } catch {
    /* storage unavailable — the first paint just uses the computed year */
  }
}

function clearLegacyPick() {
  try {
    localStorage.removeItem(LEGACY_PICK_KEY);
  } catch {
    /* storage unavailable — then there is nothing stored to clear either */
  }
}

function initialCurrentYear() {
  return readCachedCurrent() || computeDefaultSchoolYear();
}

// Extends `options` to include `year` if missing, instead of recentering the
// whole list around it — keeps the current year selectable even before any
// enrollment exists for it.
function withYearIncluded(options, year) {
  if (!year || options.includes(year)) return options;
  return [...options, year].sort().reverse();
}

// The school-year facts every year-scoped page shares: the current year and
// the years worth offering. Which year a page is showing is that page's own
// state (hooks/useYearFilter), so nothing here is a selection.
export function SchoolYearProvider({ children }) {
  const [options, setOptions] = useState(() => buildSchoolYearOptions(initialCurrentYear()));
  // Per-year enrollment counts, keyed by year. Separate from `options` so the
  // consumers keep receiving a plain string array.
  const [yearCounts, setYearCounts] = useState({});
  // The current year: what every page's year filter opens on and the
  // "Current" group in the picker. The configured settings year wins, then the
  // enrollment service's date-based one; until either lands it's the last
  // settings year seen, or the computed fallback.
  const [currentYear, setCurrentYear] = useState(initialCurrentYear);
  const fetched = useRef(false);

  useEffect(() => {
    clearLegacyPick();
  }, []);

  // Retried from AppLayout: this provider mounts on the login page, before
  // there is a token to fetch with.
  const ensureYears = useCallback(() => {
    if (fetched.current || !isTokenValid()) return;
    // Guardians never see a year picker — their portal is scoped to their own
    // children's enrollments, not filtered by a year — so there is nothing to
    // spend a request on.
    if (getCurrentUser()?.role === "guardian") return;
    fetched.current = true;

    // Each request fails on its own. The year list failing used to discard the
    // settings year with it, and the current year was only applied when the
    // list had rows -- so a school with no enrollments yet never got it.
    Promise.all([
      getSchoolYears().catch(() => null),
      getSchoolSettings().catch(() => null),
    ]).then(([data, settings]) => {
      const configured = settings?.current_school_year?.trim();
      if (configured) cacheCurrent(configured);
      const current = configured || data?.current;
      if (current) {
        setCurrentYear(current);
        setOptions((prev) => withYearIncluded(prev, current));
      }

      // Non-fatal: without a year list the computed window stays in place, so
      // the picker still works.
      const rows = data?.results ?? [];
      if (!rows.length) return;
      setYearCounts(Object.fromEntries(rows.map((r) => [r.school_year, r.count])));
      setOptions(withYearIncluded(rows.map((r) => r.school_year), current));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    ensureYears();
  }, [ensureYears]);

  return (
    <SchoolYearContext.Provider value={{ options, currentYear, yearCounts, ensureYears }}>
      {children}
    </SchoolYearContext.Provider>
  );
}

export function useSchoolYear() {
  const ctx = useContext(SchoolYearContext);
  if (!ctx) throw new Error("useSchoolYear must be used within a SchoolYearProvider");
  return ctx;
}
