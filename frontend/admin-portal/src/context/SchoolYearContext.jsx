import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getSchoolYears } from "../api/enrollmentApi";
import { isTokenValid, getCurrentUser } from "../utils/auth";
import { computeDefaultSchoolYear, buildSchoolYearOptions } from "../utils/schoolYear";

// A copy of the registry's current year, not anyone's pick: it lets pages open
// on the right year before the year list returns, and it is overwritten on
// every load, so it can't outlive a rollover.
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

// States a year can be entered into -- enrolled in, assigned advisers for,
// given calendar events. Archived years are read-only (enforced in a later
// phase), and a label with no state isn't registered at all.
const ENTRY_STATES = new Set(["current", "upcoming", "open"]);

// The school-year facts every year-scoped page shares, all from the school
// year registry (School Years page): the current year, the registered years,
// and each one's state. Which year a page is showing is that page's own state
// (hooks/useYearFilter), so nothing here is a selection.
export function SchoolYearProvider({ children }) {
  const [options, setOptions] = useState(() => buildSchoolYearOptions(initialCurrentYear()));
  // Per-year enrollment counts and states, keyed by year. Separate from
  // `options` so the consumers keep receiving a plain string array.
  const [yearCounts, setYearCounts] = useState({});
  const [yearStates, setYearStates] = useState({});
  // The current year: what every page's year filter opens on and the
  // "Current" group in the picker. It's the registry's; until that lands,
  // the last one seen, or on a first-ever visit a guess from the date.
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

    // One request: the registry answers both the year list and the current
    // year. School Settings used to be asked separately for the current year;
    // it now only mirrors the registry, so asking it too could only disagree.
    getSchoolYears().then((data) => {
      const current = data?.current?.trim();
      if (current) {
        // Cached only when the registry actually has a current year -- a
        // date guess (nothing registered yet) shouldn't outlive the guess.
        const registered = (data?.results ?? []).some(
          (r) => r.school_year === current && r.state === "current",
        );
        if (registered) cacheCurrent(current);
        setCurrentYear(current);
        setOptions((prev) => withYearIncluded(prev, current));
      }

      // Non-fatal: without a year list the computed window stays in place, so
      // the picker still works.
      const rows = data?.results ?? [];
      if (!rows.length) return;
      setYearCounts(Object.fromEntries(rows.map((r) => [r.school_year, r.count])));
      setYearStates(Object.fromEntries(rows.map((r) => [r.school_year, r.state ?? null])));
      setOptions(withYearIncluded(rows.map((r) => r.school_year), current));
    }).catch(() => {
      // Allow a retry on the next navigation rather than sticking with the
      // computed window for the whole session.
      fetched.current = false;
    });
  }, []);

  // After the School Years page creates a year or makes one current, every
  // picker needs the new list now, not on the next login.
  const refreshYears = useCallback(() => {
    fetched.current = false;
    ensureYears();
  }, [ensureYears]);

  // Years a form can file something under: registered and not archived.
  // Before the list loads nothing has a state, so the current year stands in.
  const entryYears = useMemo(() => {
    const known = options.filter((y) => ENTRY_STATES.has(yearStates[y]));
    return known.length ? known : [currentYear].filter(Boolean);
  }, [options, yearStates, currentYear]);

  useEffect(() => {
    ensureYears();
  }, [ensureYears]);

  return (
    <SchoolYearContext.Provider
      value={{ options, currentYear, yearCounts, yearStates, entryYears, ensureYears, refreshYears }}
    >
      {children}
    </SchoolYearContext.Provider>
  );
}

export function useSchoolYear() {
  const ctx = useContext(SchoolYearContext);
  if (!ctx) throw new Error("useSchoolYear must be used within a SchoolYearProvider");
  return ctx;
}
