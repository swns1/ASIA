// charts/tokens.js — the chart layer's link back to styles/tokens.css.
//
// These values used to be hardcoded hex at the top of RiskCharts.jsx. That is
// how the app ended up with ~300 WCAG failures in the first place: a literal
// copied out of the design system drifts the moment the system changes, and
// nothing tells you it happened. So the values are READ from the CSS custom
// properties Tailwind v4 emits from the `@theme` block, at runtime, once.
//
// Why read them into JS instead of writing `style={{ fill: "var(--…)" }}`:
//
//   * `fill="var(--x)"` does not work as an SVG presentation attribute, so
//     every mark would have to move to inline `style`, and
//   * framer-motion cannot interpolate a `var()` string. Phase 4 animates
//     chart marks, and colour transitions need real values to tween between.
//
// The fallbacks are NOT a second source of truth. They exist only for
// environments with no live stylesheet — jsdom under vitest, and the first
// paint before styles resolve. In the browser the CSS always wins. Keep them
// in step with tokens.css if you touch them, but the browser never reads them.

const FALLBACKS = {
  "--color-neutral-50":  "#fdf8f6",
  "--color-neutral-200": "#f5eaea",
  "--color-neutral-300": "#f0e4e4",
  "--color-neutral-500": "#8a6a6a",
  "--color-neutral-600": "#855c5c",
  "--color-neutral-700": "#7a5050",
  "--color-neutral-800": "#5a4040",
  "--color-neutral-900": "#1a0a0a",
  "--color-brand-100":   "#fff0f0",
  "--color-brand-300":   "#fca5a5",
  "--color-brand-500":   "#e03131",
  "--color-brand-600":   "#c92a2a",
  "--color-success-500": "#2e6b0d",
  "--color-warning-500": "#854f0b",
  "--color-error-500":   "#9b2020",
  "--color-info-500":    "#1455a0",
};

const cache = new Map();

/**
 * One resolved token value. Cached — getComputedStyle forces style resolution,
 * and a chart can ask for the same token once per mark.
 */
export function token(name) {
  if (cache.has(name)) return cache.get(name);

  let value = "";
  if (typeof window !== "undefined" && window.getComputedStyle) {
    value = window.getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }
  const resolved = value || FALLBACKS[name] || "";
  cache.set(name, resolved);
  return resolved;
}

/** Test seam: styles change between suites, and the cache would outlive them. */
export function clearTokenCache() {
  cache.clear();
}

// ── Chart surface ───────────────────────────────────────────────────────────
// A shade off the app background so a chart reads as its own plane. Kept as a
// literal because it is a chart-only surface with no token of its own; every
// other value below comes from the design system.
export const SURFACE = "#fdfcfb";

export const chartInk = () => ({
  /** Hairline grid — one shade off the surface, solid. Dashes mean threshold. */
  grid:  token("--color-neutral-300"),
  /** Axis labels and tick text — AA on the surface. */
  axis:  token("--color-neutral-500"),
  /** Direct labels on a mark, and any figure the reader is meant to read. */
  ink:   token("--color-neutral-900"),
  /** Secondary label text beneath a mark. */
  muted: token("--color-neutral-800"),
  /** Single-series fill. One hue for every bar — never a value ramp. */
  bar:   token("--color-brand-500"),
  /** A threshold rule (passing mark, target). The only dashed line allowed. */
  threshold: token("--color-neutral-900"),
});

// ── Mark geometry ───────────────────────────────────────────────────────────
/** Surface gap between adjacent fills, so the background separates them. */
export const GAP = 2;
/** Rounded data-end. The baseline end stays square so the bar reads as measured. */
export const RADIUS = 4;
/** Stroke width for lines and series paths. */
export const STROKE = 2;
/** Minimum interactive marker size. */
export const MARKER = 8;
