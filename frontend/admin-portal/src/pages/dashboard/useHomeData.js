// useHomeData — the loading every home page shares.
//
// One school year for the whole page (the current one, or the one in the
// link; no "All years"), the viewer's attention queues (./attention.js) plus
// the page's own requests, all settled together: one failed request leaves
// the rest on screen, and says so, rather than blanking the page or reading
// as zero. Only the newest load fills the page, and each answer keeps the
// year it's for: until the picked year's has arrived the page reads as
// loading with no data, so it never shows one year's numbers -- or links --
// under another's heading (a teacher's past sections used to flash up as
// today's while the current year loaded).
//
// `requests(year, currentYear, ctx)` answers the page's own { key: promise }
// map; pass a function defined outside the component, so it stays the same
// one. `ctx.once(key, call)` (attention.js sharedRequests) shares a request
// with the queues, e.g. the teacher's my-day.

import { useCallback, useEffect, useRef, useState } from "react";

import { useSchoolYear } from "../../context/SchoolYearContext";
import useYearFilter from "../../hooks/useYearFilter";
import { getCurrentUser } from "../../utils/auth";
import { attentionRequests, attentionRows, sharedRequests } from "./attention";
import { settleAll } from "./adminHomeData";

export default function useHomeData(label, requests) {
  const { currentYear } = useSchoolYear();
  const [year, setYear, yearIsDefault] = useYearFilter({ allowAll: false });
  const [state, setState] = useState({ loading: true, data: {}, failed: [], queueKeys: [], for: null });
  const latest = useRef(0);

  const reload = useCallback(async () => {
    if (!year || !currentYear) return;
    const run = ++latest.current;
    setState((s) => ({ ...s, loading: true }));
    const ctx = sharedRequests();
    const queues = attentionRequests(getCurrentUser(), year, { currentYear, ctx });
    const { data, failed } = await settleAll({ ...requests(year, currentYear, ctx), ...queues }, label);
    if (run !== latest.current) return;
    setState({ loading: false, data, failed, queueKeys: Object.keys(queues), for: `${year}|${currentYear}` });
  }, [year, currentYear, requests, label]);

  useEffect(() => { reload(); }, [reload]); // eslint-disable-line react-hooks/set-state-in-effect

  // The answer on hand is for the years asked about now. A reload of the same
  // year keeps its figures on screen meanwhile; a different year doesn't.
  const fresh = state.for === `${year}|${currentYear}`;
  const loading = state.loading || !fresh;
  const data = fresh ? state.data : {};
  const failed = fresh ? state.failed : [];
  const { queueKeys } = state;
  return {
    year, setYear, yearIsDefault, currentYear,
    loading, data, reload,
    // The keys whose request failed, so a card can say "couldn't load"
    // rather than reading an empty answer as "nothing here".
    failed,
    // The queues with something in them; empty while loading, so the bell's
    // red dot doesn't flash on a count that hasn't arrived.
    rows: loading ? [] : attentionRows(data, year),
    partialError: !loading && failed.length > 0,
    // A queue's count failed: the bell and the list say so, not "all caught up".
    attentionFailed: !loading && failed.some((key) => queueKeys.includes(key)),
  };
}
