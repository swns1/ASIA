import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSchoolYear } from "../context/SchoolYearContext";

// What `?school_year=` says for "All years" (see below).
export const ALL_YEARS_PARAM = "all";

/**
 * A page's school-year filter, so every year-scoped page follows the same
 * rules instead of each keeping its own copy of them:
 *
 * - It opens on the year in the page's link (`?school_year=`, which Dashboard
 *   cards use), otherwise on the current year from School Settings.
 * - Until someone picks a year it keeps tracking the current year, so a page
 *   that renders before School Settings has loaded still lands on it.
 * - A pick belongs to this page only. Nothing carries to other pages or
 *   survives leaving; every page opens on the current year again.
 *
 *   const [schoolYear, setSchoolYear, yearIsDefault] = useYearFilter();
 *   <FilterBar scope={<SchoolYearPicker value={schoolYear} onChange={setSchoolYear} />} />
 *
 * `""` means "All years". Pages that need one specific year (a calendar, a
 * scan) pass `{ allowAll: false }`, and an empty value falls back to the
 * current year. `setSchoolYear(null)` returns to the current year, which is
 * what "Clear filters" should do; `yearIsDefault` is true while the filter is
 * on the current year, so it can be left out of "filters are active".
 *
 * A link asks for All years with `?school_year=all` -- an empty value can't
 * say it, since that reads as "no year given". The Dashboard's "View all
 * students" uses it; a page that needs one year opens on the current one.
 *
 * @param {{ allowAll?: boolean }} [options]
 * @returns {[string, (year: string | null) => void, boolean]}
 */
export default function useYearFilter({ allowAll = true } = {}) {
  const { currentYear } = useSchoolYear();
  const [searchParams] = useSearchParams();
  // null until someone picks. Following the current year from here, rather
  // than copying it into state once, is what keeps a cold load from sticking
  // to the fallback year the context starts with.
  const [picked, setPicked] = useState(() => {
    const linked = searchParams.get("school_year");
    if (linked === ALL_YEARS_PARAM) return allowAll ? "" : null;
    return linked || null;
  });

  const year = picked === null || (!allowAll && !picked) ? currentYear : picked;
  const setYear = useCallback((next) => setPicked(next ?? null), []);

  return [year, setYear, year === currentYear];
}
