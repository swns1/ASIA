// useYearComparison — the figures behind the admin home's "this year vs last
// year" panels: learners from /school-years/compare/ and money from
// /invoices/financial-summary/, once per year. The same two sources as the
// Compare School Years page, so the two can never disagree.
//
// Learners and money load and fail separately, as on that page: a billing
// hiccup leaves the Enrollees panel readable.
//
// Last year is only asked for once the year registry says it exists. The
// compare endpoint refuses a year that isn't registered, and a school's first
// year has nothing before it.

import { useCallback, useEffect, useRef, useState } from "react";

import { compareSchoolYears } from "../../api/enrollmentApi";
import { getFinancialSummary } from "../../api/billingApi";
import { previousLabel } from "../../components/schoolYears/yearHelpers";
import { useSchoolYear } from "../../context/SchoolYearContext";

export default function useYearComparison(year) {
  const { yearStates = {} } = useSchoolYear();
  const prev = year ? previousLabel(year) : "";
  const compared = Boolean(prev && yearStates[prev]);
  // Until the registry answers, every year looks unregistered; only say
  // there's nothing to compare with once it has.
  const registryLoaded = Object.keys(yearStates).length > 0;

  const key = year ? (compared ? `${prev},${year}` : year) : "";

  // Each answer keeps the years it's for (`key`). Until that matches the
  // years asked for now, the panel shows as loading -- never one year's
  // figures under another year's heading.
  const [school, setSchool] = useState({ key: null, byYear: {}, error: null });
  const [money, setMoney] = useState({ key: null, byYear: {}, error: null });
  // Only the latest pick's answers land: switching years quickly mustn't let
  // an earlier, slower request overwrite the panels.
  const latest = useRef("");

  const fetchSchool = useCallback(async (asked) => {
    setSchool((s) => ({ ...s, key: null, error: null }));
    try {
      const data = await compareSchoolYears(asked.split(","));
      if (latest.current !== asked) return;
      setSchool({ key: asked, byYear: Object.fromEntries(data.years.map((y) => [y.label, y])), error: null });
    } catch (e) {
      if (latest.current === asked) setSchool({ key: asked, byYear: {}, error: e });
    }
  }, []);

  const fetchMoney = useCallback(async (asked) => {
    setMoney((m) => ({ ...m, key: null, error: null }));
    try {
      const years = asked.split(",");
      const summaries = await Promise.all(years.map((y) => getFinancialSummary(y)));
      if (latest.current !== asked) return;
      setMoney({ key: asked, byYear: Object.fromEntries(years.map((y, i) => [y, summaries[i]])), error: null });
    } catch (e) {
      if (latest.current === asked) setMoney({ key: asked, byYear: {}, error: e });
    }
  }, []);

  useEffect(() => {
    if (!key) return;
    latest.current = key;
    fetchSchool(key); // eslint-disable-line react-hooks/set-state-in-effect
    fetchMoney(key);
  }, [key, fetchSchool, fetchMoney]);

  const reload = useCallback(() => {
    if (!key) return;
    fetchSchool(key);
    fetchMoney(key);
  }, [key, fetchSchool, fetchMoney]);

  return {
    year,
    prev,
    compared,
    noPrevious: registryLoaded && !compared,
    reload,
    school: {
      loading: !key || school.key !== key,
      error: school.error,
      current: school.byYear[year] ?? null,
      previous: compared ? school.byYear[prev] ?? null : null,
      retry: () => fetchSchool(key),
    },
    money: {
      loading: !key || money.key !== key,
      error: money.error,
      current: money.byYear[year] ?? null,
      previous: compared ? money.byYear[prev] ?? null : null,
      retry: () => fetchMoney(key),
    },
  };
}
