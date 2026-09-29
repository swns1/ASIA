import { useCallback, useEffect, useState } from "react";
import { getSections } from "../api/enrollmentApi";

// The sections of one grade in one school year, for a placement picker.
//
// Cached per (year, grade) for the session: the enrollment form, the adviser
// form and Promote all ask for the same few lists, and a section list changes
// rarely. Anything that changes sections calls invalidateSections() so the
// next picker sees the change.
const cache = new Map();

export function invalidateSections() {
  cache.clear();
}

function load(schoolYear, gradeLevel) {
  const key = `${schoolYear}|${gradeLevel}`;
  if (!cache.has(key)) {
    const request = getSections({ school_year: schoolYear, grade_level: gradeLevel })
      .then((data) => (Array.isArray(data) ? data : data?.results ?? []))
      .catch((error) => {
        cache.delete(key); // a failure isn't worth remembering
        throw error;
      });
    cache.set(key, request);
  }
  return cache.get(key);
}

const EMPTY = { sections: [], loading: false, error: null };

export default function useSections(schoolYear, gradeLevel) {
  const [state, setState] = useState(EMPTY);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!schoolYear || !gradeLevel) {
      setState(EMPTY); // eslint-disable-line react-hooks/set-state-in-effect
      return undefined;
    }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load(schoolYear, gradeLevel).then(
      (sections) => live && setState({ sections, loading: false, error: null }),
      (error) => live && setState({ sections: [], loading: false, error }),
    );
    return () => { live = false; };
  }, [schoolYear, gradeLevel, version]);

  const reload = useCallback(() => {
    cache.delete(`${schoolYear}|${gradeLevel}`);
    setVersion((v) => v + 1);
  }, [schoolYear, gradeLevel]);

  return { ...state, reload };
}
