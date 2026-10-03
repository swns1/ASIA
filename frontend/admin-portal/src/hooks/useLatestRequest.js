// useLatestRequest — for a loader that can be called again before its last
// call answers, so that only the newest call's answer is used.
//
// An entry grid reloads whenever its date, period or subject changes, and
// again after a save. Answers can arrive out of order, and an older one
// landing last put, say, Monday's attendance under Tuesday's date -- where
// "Save all" then wrote Monday's marks onto Tuesday. An effect can guard
// itself with a `cancelled` flag in its cleanup; a loader that is also called
// from a save handler has no cleanup, so it uses this instead.
//
//   const begin = useLatestRequest();
//   const load = useCallback(async () => {
//     const isCurrent = begin();
//     const data = await fetchIt();
//     if (!isCurrent()) return;
//     setRows(data);
//   }, [begin, ...]);

import { useCallback, useRef } from "react";

export default function useLatestRequest() {
  const latest = useRef(0);
  return useCallback(() => {
    const id = ++latest.current;
    return () => id === latest.current;
  }, []);
}
