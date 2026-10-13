// useGradingCalendar — a school year's Grading Period events from the
// Academic Calendar (one per quarter), for utils/grading.js's
// currentQuarterKey / quarterEventOn.
//
// Asked once per year and kept for the session: every section of a year
// shares the same quarter dates, so opening one section after another
// mustn't fetch them again. A failed request isn't kept, so the next mount
// tries again; meanwhile the answer is [] (no dates), which callers already
// treat as "fall back to the first period".

import { useEffect, useState } from "react";
import { getCalendarEvents } from "../api/enrollmentApi";

const byYear = new Map();

function load(schoolYear) {
  if (!byYear.has(schoolYear)) {
    const request = getCalendarEvents({ school_year: schoolYear, event_type: "grading_period", page_size: 20 })
      .then((data) => (Array.isArray(data) ? data : data?.results ?? []))
      .catch(() => { byYear.delete(schoolYear); return []; });
    byYear.set(schoolYear, request);
  }
  return byYear.get(schoolYear);
}

/** The year's Grading Period events, or null while they load. */
export default function useGradingCalendar(schoolYear) {
  const [answer, setAnswer] = useState({ year: null, events: null });
  useEffect(() => {
    if (!schoolYear) return undefined;
    let live = true;
    load(schoolYear).then((events) => { if (live) setAnswer({ year: schoolYear, events }); });
    return () => { live = false; };
  }, [schoolYear]);
  return answer.year === schoolYear ? answer.events : null;
}

/** For tests: forget every year. */
export function resetGradingCalendar() {
  byYear.clear();
}
