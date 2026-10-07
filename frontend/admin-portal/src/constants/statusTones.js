// statusTones.js — the class names behind each status variant.
//
// statusMaps.js says which variant a status is ("enrolled" is success); this
// says what a variant looks like as a dot or as text. Badge, StatusDot and
// StatusBand all read these, so one status is one colour on every surface.
//
// Literal strings on purpose: Tailwind finds classes by reading source text,
// so an interpolated `bg-${variant}-dot` would never be generated.

/** The saturated dot for each variant (tokens.css `--color-*-dot`). */
export const STATUS_DOT = {
  success: "bg-success-dot",
  warning: "bg-warning-dot",
  error:   "bg-error-dot",
  info:    "bg-info-dot",
  muted:   "bg-muted-dot",
  accent:  "bg-accent-dot",
  brand:   "bg-brand-500",
};

/**
 * Dots for a band split by categories rather than statuses (payment methods,
 * scholarship types) — tokens.css `--color-series-*`. Hand them out in the
 * categories' own fixed order with seriesDot(i), so a category keeps its
 * colour whatever the filters do. Past the sixth, a category goes grey; its
 * label still names it.
 */
export const SERIES_DOT = [
  "bg-series-1",
  "bg-series-2",
  "bg-series-3",
  "bg-series-4",
  "bg-series-5",
  "bg-series-6",
];

export const seriesDot = (index) => SERIES_DOT[index] ?? STATUS_DOT.muted;

/** The text tone for each variant, contrast-checked for labels. */
export const STATUS_TEXT = {
  success: "text-success-500",
  warning: "text-warning-500",
  error:   "text-error-500",
  info:    "text-info-500",
  muted:   "text-muted-500",
  accent:  "text-accent-500",
  brand:   "text-brand-600",
};
