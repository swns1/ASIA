// format.js — display formatters shared across pages.
//
// These were hand-copied rather than shared: `peso` existed in three files
// with identical bodies, `todayISO` in three, and a short-date formatter in
// several more. The date helpers here cover only the two shapes that were
// genuinely duplicated; the print documents deliberately use their own longer
// forms ("January 5, 2026" on a certificate, "Jan 5, 2026" in a table), so
// those stay where they are rather than being forced through one function.

/** Philippine peso, always two decimals. Treats null/undefined as zero. */
export const peso = (v) =>
  `₱${Number(v || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Short date: "Jan 5, 2026". Returns `fallback` for an absent date so callers
 * don't each repeat the same ternary — pass `null` where a component wants to
 * branch on absence itself.
 */
export const fmtDate = (d, fallback = "—") =>
  d
    ? new Date(d).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : fallback;

/** Today as `YYYY-MM-DD`, for comparing against date-only API fields. */
export const todayISO = () => new Date().toISOString().slice(0, 10);
