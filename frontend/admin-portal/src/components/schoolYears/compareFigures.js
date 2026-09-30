import { peso } from "../../utils/format";

// How Compare School Years writes its numbers -- shared by the page's tables
// and its charts, so a figure reads the same in both and "No change" means the
// same thing in both.

export const fmtCount = (n) => Number(n).toLocaleString("en-PH");
export const fmtOne = (n) => Number(n).toFixed(1);
export const share = (part, whole) => (whole ? (part * 100) / whole : null);
export const num = (v) => (v == null || v === "" ? null : Number(v));

export const KINDS = {
  count:   { value: fmtCount,               change: (d) => fmtCount(Math.abs(d)),         same: 0 },
  average: { value: fmtOne,                 change: (d) => fmtOne(Math.abs(d)),           same: 0.05 },
  percent: { value: (n) => `${fmtOne(n)}%`, change: (d) => `${fmtOne(Math.abs(d))} pts`,  same: 0.05 },
  money:   { value: peso,                   change: (d) => peso(Math.abs(d)),             same: 0.005 },
  // A fee reads better with its percentage: "₱2,000.00 (5.0%)".
  fee: {
    value: peso,
    change: (d, before) => `${peso(Math.abs(d))}${before ? ` (${fmtOne(Math.abs(d) * 100 / before)}%)` : ""}`,
    same: 0.005,
  },
};

/**
 * A figure's change from the one before it: null when either is missing,
 * "No change" inside the kind's threshold, else signed ("+20", "−1.5 pts")
 * with the direction its arrow points.
 */
export function changeBetween(value, before, kind) {
  if (value == null || before == null) return null;
  const d = value - before;
  const k = KINDS[kind];
  if (Math.abs(d) < k.same || d === 0) return { direction: "same", text: "No change" };
  return { direction: d > 0 ? "up" : "down", text: `${d > 0 ? "+" : "−"}${k.change(d, before)}` };
}

// ── Chart labels ────────────────────────────────────────────────────────────
/** "2025-2026" -> "2025-26": a year under a column, where the full label crowds. */
export const shortYear = (label) => `${label.slice(0, 5)}${label.slice(7)}`;

const compact = new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 1 });
/** "₱250K", "₱1.4M": pesos on an axis or above a column, where centavos are noise. */
export const pesoCompact = (n) => `₱${compact.format(n)}`;

/** "₱7,000": whole pesos, for a fee's change. */
export const pesoWhole = (n) => `₱${Number(n).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

/** "+141", "−12", "0": a step's size, signed with a real minus. */
export const signedCount = (d) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${fmtCount(Math.abs(d))}`;

/** "1 section", "3 sections". */
export const plural = (n, word) => `${fmtCount(n)} ${word}${n === 1 ? "" : "s"}`;
