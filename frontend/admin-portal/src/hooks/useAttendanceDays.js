// useAttendanceDays — saved attendance per day, from
// GET /dashboard/attendance-days/ (api/enrollmentApi.getAttendanceDays).
// Used by the Academic Calendar (a month's counts, and the picked day with
// its sections) and the homes' day stepper (one past day).
//
//   const att = useAttendanceDays({ year, from, to, enabled });
//   att.byDate["2026-10-12"]  // { attended, enrolled, rate, sections_taken, ... }
//   att.loading, att.failed, att.reload()
//   att.schoolYear            // the year the server counted (`year` or, with
//                             // none given, the one the dates fall in)
//
// `year` may be left out: the server then picks the registered year the
// dates fall in (the calendar asks this way). Nothing is asked while
// `enabled` is false or a bound is missing. Only the answer for the range
// now asked is returned, so stepping quickly through days never shows one
// day's numbers under another's date.

import { useEffect, useMemo, useState } from "react";

import { getAttendanceDays } from "../api/enrollmentApi";

const EMPTY = [];

export default function useAttendanceDays({ year, from, to, enabled = true }) {
  const key = enabled && from && to ? `${year ?? ""}|${from}|${to}` : null;
  const [answer, setAnswer] = useState({ key: null, days: EMPTY, schoolYear: null, failed: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    getAttendanceDays({ ...(year ? { school_year: year } : {}), date_from: from, date_to: to })
      .then((data) => {
        if (!cancelled) setAnswer({ key, days: data?.days ?? EMPTY, schoolYear: data?.school_year ?? null, failed: false });
      })
      .catch(() => { if (!cancelled) setAnswer({ key, days: EMPTY, schoolYear: null, failed: true }); });
    return () => { cancelled = true; };
  }, [key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps -- key holds year/from/to

  const current = key !== null && answer.key === key;
  const days = current ? answer.days : EMPTY;
  const byDate = useMemo(() => Object.fromEntries(days.map((d) => [d.date, d])), [days]);
  return {
    days,
    byDate,
    schoolYear: current ? answer.schoolYear : null,
    loading: key !== null && !current,
    failed: current && answer.failed,
    reload: () => setAttempt((n) => n + 1),
  };
}
