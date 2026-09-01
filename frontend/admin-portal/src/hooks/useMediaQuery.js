import { useEffect, useState } from "react";

/**
 * Track a CSS media query from JS.
 *
 * Used where layout differs structurally rather than just visually — e.g. the
 * sidebar renders as a collapsed icon rail on desktop but always expands
 * inside the mobile drawer, which can't be expressed with CSS alone because
 * the label elements themselves differ.
 */
// jsdom (and any non-browser renderer) has no matchMedia, so guard rather than
// throw — callers just see the query as unmatched.
function safeMatchMedia(query) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(query);
}

export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => safeMatchMedia(query)?.matches ?? false);

  useEffect(() => {
    const mql = safeMatchMedia(query);
    if (!mql) return undefined;

    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
