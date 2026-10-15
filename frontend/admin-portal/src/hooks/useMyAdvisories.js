import { useEffect, useState } from "react";
import { getMySections } from "../api/enrollmentApi";

// The sections a teacher advises, every year's: { advisories, loading,
// failed }, each advisory as the server sends it (advisory_id, school_year,
// school_level, grade_level, section, ...) plus its roster's student_count.
// Null for anyone else, so a page can tell "not a
// teacher" from "a teacher with no sections".
//
// Pages that a teacher may only use for their own sections (School Forms,
// Analytics) offer only these, rather than every section in the school and a
// refusal from the server for all but theirs.
export default function useMyAdvisories(isTeacher) {
  const [state, setState] = useState({ advisories: [], loading: true, failed: false });
  useEffect(() => {
    if (!isTeacher) return undefined;
    let live = true;
    getMySections()
      .then((data) => {
        const rows = Array.isArray(data) ? data : data?.results ?? [];
        const advisories = rows.map((r) => ({ ...r.advisory, student_count: r.student_count }));
        if (live) setState({ advisories, loading: false, failed: false });
      })
      .catch(() => { if (live) setState({ advisories: [], loading: false, failed: true }); });
    return () => { live = false; };
  }, [isTeacher]);
  return isTeacher ? state : null;
}

// One year's advisories, for a page whose year is picked.
export function advisoriesIn(advised, schoolYear) {
  return (advised?.advisories ?? []).filter((a) => a.school_year === schoolYear);
}
