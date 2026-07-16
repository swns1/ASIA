import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getSchoolSettings } from "../api/billingApi";
import { isTokenValid } from "../utils/auth";
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

export function SchoolYearProvider({ children }) {
  const [schoolYear, setSchoolYearState] = useState(readPersisted);
  const [options, setOptions] = useState(() =>
    buildSchoolYearOptions(readPersisted() || computeDefaultSchoolYear())
  );
  const fetchedDefault = useRef(false);

  // Only used to seed a default the *first* time (no persisted user choice
  // yet) — never overrides a selection already made this session or before.
  const ensureDefault = useCallback(() => {
    if (fetchedDefault.current || schoolYear || !isTokenValid()) return;
    fetchedDefault.current = true;
    getSchoolSettings()
      .then((s) => {
        const backendYear = s?.current_school_year?.trim();
        const resolved = backendYear || computeDefaultSchoolYear();
        setOptions(buildSchoolYearOptions(resolved));
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

  const setSchoolYear = useCallback((year) => {
    setSchoolYearState(year);
    persist(year);
    setOptions((prev) => (prev.includes(year) ? prev : buildSchoolYearOptions(year)));
  }, []);

  return (
    <SchoolYearContext.Provider value={{ schoolYear, setSchoolYear, options, ensureDefault }}>
      {children}
    </SchoolYearContext.Provider>
  );
}

export function useSchoolYear() {
  const ctx = useContext(SchoolYearContext);
  if (!ctx) throw new Error("useSchoolYear must be used within a SchoolYearProvider");
  return ctx;
}
