import { lazy } from "react";

// lazyRoute — React.lazy with one self-heal for the failure mode that route
// splitting introduces.
//
// A single bundle could not fail to load "halfway": index.html and index.js
// were fetched together. Split into per-route chunks, a deploy that replaces
// the hashed files while someone has the old index.html open makes their next
// navigation request a chunk that no longer exists, and the import rejects
// with "Failed to fetch dynamically imported module". That is not an
// application error — the user's tab is simply holding a stale manifest, and
// a reload fixes it completely.
//
// Without this, that rejection reaches ErrorBoundary and the user gets
// "Something went wrong" for a condition that resolves itself, on a click
// that had nothing wrong with it.

const RELOAD_KEY = "chunk_reload_at";
// If a reload was already attempted this recently, the chunk is genuinely
// missing (bad deploy, offline, blocked by a proxy) rather than stale —
// rethrow so ErrorBoundary shows a real error instead of looping the tab.
const RELOAD_WINDOW_MS = 10_000;

function reloadedRecently() {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < RELOAD_WINDOW_MS;
  } catch {
    // Storage unavailable (private mode, blocked cookies) — assume no prior
    // reload. Worst case is one extra reload, which is still better than a
    // dead-end error screen.
    return false;
  }
}

/**
 * @param {() => Promise<{ default: import("react").ComponentType }>} load
 *   the same `() => import("...")` thunk React.lazy takes.
 */
export default function lazyRoute(load) {
  return lazy(() =>
    load().catch((error) => {
      if (reloadedRecently()) throw error;
      try {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        /* see above — proceed with the reload regardless */
      }
      window.location.reload();
      // The tab is on its way out; resolving with anything here would flash a
      // half-rendered route first.
      return new Promise(() => {});
    })
  );
}
