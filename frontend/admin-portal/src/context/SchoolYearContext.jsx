import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getSchoolSettings } from "../api/billingApi";
import { getSchoolYears } from "../api/enrollmentApi";
import { isTokenValid, getCurrentUser } from "../utils/auth";
import { computeDefaultSchoolYear, buildSchoolYearOptions } from "../utils/schoolYear";

const STORAGE_KEY = "selected_school_year";
const SchoolYearContext = createContext(null);

function readPersisted() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function persist(year) {
  try {
    localStorage.setItem(STORAGE_KEY, year);
  } catch {
    /* storage unavailable (e.g. private browsing) — selection just won't survive reload */
  }
}

// Extends `options` to include `year` if missing, instead of recentering the
// whole list around it — keeps a persisted or hand-picked year selectable even
// when it isn't in the fetched set.
function withYearIncluded(options, year) {
  if (!year || options.includes(year)) return options;
  return [...options, year].sort().reverse();
}

export function SchoolYearProvider({ children }) {
  const [schoolYear, setSchoolYearState] = useState(readPersisted);
  const [options, setOptions] = useState(() =>
    withYearIncluded(buildSchoolYearOptions(computeDefaultSchoolYear()), readPersisted())
  );
  // Per-year enrollment counts, keyed by year. Separate from `options` so the
  // existing consumers keep receiving a plain string array.
  const [yearCounts, setYearCounts] = useState({});
  // The year the backend considers current — drives the "Current" group in the
  // picker. Falls back to the computed one until the fetch lands.
  const [currentYear, setCurrentYear] = useState(() => computeDefaultSchoolYear());
  const fetchedDefault = useRef(false);
  const fetchedYears = useRef(false);

  // Only used to seed a default the *first* time (no persisted user choice
  // yet) — never overrides a selection already made this session or before.
  const ensureDefault = useCallback(() => {
    if (fetchedDefault.current || schoolYear || !isTokenValid()) return;
    fetchedDefault.current = true;

    // Guardians never see the school-year picker — their portal is scoped to
    // their own children's enrollments, not filtered by a year — so there is
    // nothing here for them to seed and no reason to spend a request on it.
    // (Reads of /api/school-settings/ are no longer admin/accounting-only;
    // they were, which is why every other role quietly ended up on the
    // computed fallback below instead of the configured school year.)
    if (getCurrentUser()?.role === "guardian") {
      const fallback = computeDefaultSchoolYear();
      setSchoolYearState((prev) => prev || fallback);
      persist(fallback);
      return;
    }

    getSchoolSettings()
      .then((s) => {
        const backendYear = s?.current_school_year?.trim();
        const resolved = backendYear || computeDefaultSchoolYear();
        setSchoolYearState((prev) => prev || resolved);
        persist(resolved);
      })
      .catch(() => {
        const fallback = computeDefaultSchoolYear();
        setSchoolYearState((prev) => prev || fallback);
        persist(fallback);
      });
  }, [schoolYear]);

  useEffect(() => {
    ensureDefault();
  }, [ensureDefault]);

  // The year list is fetched on its own, not chained behind ensureDefault():
  // that function returns early once a year is already chosen (the common case
  // for any returning user, since the choice is persisted), which would leave
  // the picker permanently showing the computed fallback instead of real years.
  useEffect(() => {
    if (fetchedYears.current || !isTokenValid()) return;
    if (getCurrentUser()?.role === "guardian") return; // no picker for guardians
    fetchedYears.current = true;

    getSchoolYears()
      .then((data) => {
        const rows = data?.results ?? [];
        if (!rows.length) return;
        if (data.current) setCurrentYear(data.current);
        setYearCounts(Object.fromEntries(rows.map((r) => [r.school_year, r.count])));
        setOptions(withYearIncluded(rows.map((r) => r.school_year), readPersisted()));
      })
      // Non-fatal: the computed window stays in place so the picker still works.
      .catch(() => {});
  }, []);

  const setSchoolYear = useCallback((year) => {
    setSchoolYearState(year);
    persist(year);
    setOptions((prev) => withYearIncluded(prev, year));
  }, []);

  return (
    <SchoolYearContext.Provider value={{ schoolYear, setSchoolYear, options, currentYear, yearCounts, ensureDefault }}>
      {children}
    </SchoolYearContext.Provider>
  );
}

export function useSchoolYear() {
  const ctx = useContext(SchoolYearContext);
  if (!ctx) throw new Error("useSchoolYear must be used within a SchoolYearProvider");
  return ctx;
}
