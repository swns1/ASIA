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
  "--color-neutral-400": "#cbb3b3",
  "--color-neutral-500": "#8a6a6a",
  "--color-neutral-600": "#855c5c",
  "--color-neutral-700": "#7a5050",
  "--color-neutral-800": "#5a4040",
  "--color-neutral-900": "#1a0a0a",
  "--color-brand-100":   "#fff0f0",
  "--color-brand-300":   "#fca5a5",
  "--color-brand-400":   "#e87474",
  "--color-brand-500":   "#e03131",
  "--color-brand-600":   "#c92a2a",
  "--color-success-500": "#2e6b0d",
  "--color-warning-500": "#854f0b",
  "--color-error-50":    "#fde8e8",
  "--color-error-500":   "#9b2020",
  "--color-info-500":    "#1455a0",
  // School levels: categorical, one hue each (see tokens.css).
  "--color-nursery-500":      "#854f0b",
  "--color-kindergarten-500": "#7c3aed",
  "--color-elementary-500":   "#2563eb",
  "--color-juniorhigh-500":   "#2e6b0d",
  "--color-seniorhigh-500":   "#be185d",
  // Chart-only values (tokens.css :root).
  "--chart-plane":   "#fdfcfb",
  "--chart-dot":     "#ffffff",
  "--chart-on-mark": "#1a0a0a",
};

// The same for dark mode, where tokens.css's dark set differs.
const DARK_FALLBACKS = {
  "--color-neutral-50":  "#110b0b",
  "--color-neutral-200": "#302424",
  "--color-neutral-300": "#463535",
  "--color-neutral-400": "#604a4a",
  "--color-neutral-500": "#a68c8c",
  "--color-neutral-600": "#b69b9b",
  "--color-neutral-700": "#cab3b3",
  "--color-neutral-800": "#ddcbcb",
  "--color-neutral-900": "#f6eded",
  "--color-brand-100":   "#2f1a1a",
  "--color-brand-300":   "#7d3535",
  "--color-brand-400":   "#b04a4a",
  "--color-brand-500":   "#ef4b4b",
  "--color-brand-600":   "#ff8f8f",
  "--color-success-500": "#7fcf8a",
  "--color-warning-500": "#f2b866",
  "--color-error-50":    "#341717",
  "--color-error-500":   "#ff8f85",
  "--color-info-500":    "#8fbaf2",
  "--color-nursery-500":      "#e3a857",
  "--color-kindergarten-500": "#b99af7",
  "--color-elementary-500":   "#7ba8f7",
  "--color-juniorhigh-500":   "#86c98a",
  "--color-seniorhigh-500":   "#f17db7",
  "--chart-plane":   "#160f0f",
  "--chart-dot":     "#160f0f",
  "--chart-on-mark": "#1c1414",
};

const cache = new Map();

// Dark mode is set on a container, not the document (hooks/useTheme.js), so
// the document root only ever has the light values. Dark ones are read off a
// hidden element that carries the dark theme itself.
let darkProbe = null;
function darkSource() {
  if (typeof document === "undefined" || !document.body) return null;
  if (!darkProbe || !darkProbe.isConnected) {
    darkProbe = document.createElement("div");
    darkProbe.setAttribute("data-theme", "dark");
    darkProbe.setAttribute("aria-hidden", "true");
    darkProbe.style.display = "none";
    document.body.appendChild(darkProbe);
  }
  return darkProbe;
}

/**
 * One resolved token value, for "light" (the default) or "dark". Cached:
 * getComputedStyle forces style resolution, and a chart can ask for the same
 * token once per mark. A chart in a page that can be dark passes the theme
 * from hooks/useTheme, and redraws when it changes.
 */
export function token(name, theme = "light") {
  const key = `${theme}:${name}`;
  if (cache.has(key)) return cache.get(key);

  let value = "";
  if (typeof window !== "undefined" && window.getComputedStyle) {
    const source = theme === "dark" ? darkSource() : document.documentElement;
    if (source) value = window.getComputedStyle(source).getPropertyValue(name).trim();
  }
  const resolved = value || (theme === "dark" && DARK_FALLBACKS[name]) || FALLBACKS[name] || "";
  cache.set(key, resolved);
  return resolved;
}

/** Test seam: styles change between suites, and the cache would outlive them. */
export function clearTokenCache() {
  cache.clear();
}

// ── Chart surface ───────────────────────────────────────────────────────────
// A shade off the app background so a chart reads as its own plane. The
// light value, for charts on pages that are always light; ChartFrame draws
// its background from --chart-surface, which follows the theme.
export const SURFACE = "#fdfcfb";

export const chartInk = (theme = "light") => ({
  /** Hairline grid — one shade off the surface, solid. Dashes mean threshold. */
  grid:  token("--color-neutral-300", theme),
  /** Axis labels and tick text — AA on the surface. */
  axis:  token("--color-neutral-500", theme),
  /** Direct labels on a mark, and any figure the reader is meant to read. */
  ink:   token("--color-neutral-900", theme),
  /** Secondary label text beneath a mark. */
  muted: token("--color-neutral-800", theme),
  /** Single-series fill. One hue for every bar — never a value ramp. */
  bar:   token("--color-brand-500", theme),
  /** A threshold rule (passing mark, target). The only dashed line allowed. */
  threshold: token("--color-neutral-900", theme),
  /** The chart plane's plain colour, for a ring that has to match it. */
  plane: token("--chart-plane", theme),
  /** A hollow point's fill, and the halo that lifts a label off a line. */
  dot: token("--chart-dot", theme),
  /** A label drawn on a filled mark: dark on light dark-mode bars. */
  onMark: token("--chart-on-mark", theme),
});

// ── School levels ───────────────────────────────────────────────────────────
// Categorical: one hue per level, the one its filter chips use, so a level
// reads the same in every chart that splits by level.
const LEVEL_TOKENS = {
  nursery: "--color-nursery-500",
  kindergarten: "--color-kindergarten-500",
  elementary: "--color-elementary-500",
  junior_highschool: "--color-juniorhigh-500",
  senior_highschool: "--color-seniorhigh-500",
};

export const levelColor = (level, theme = "light") => token(LEVEL_TOKENS[level], theme);

// ── Mark geometry ───────────────────────────────────────────────────────────
/** Surface gap between adjacent fills, so the background separates them. */
export const GAP = 2;
/** Rounded data-end. The baseline end stays square so the bar reads as measured. */
export const RADIUS = 4;
/** Stroke width for lines and series paths. */
export const STROKE = 2;
/** Minimum interactive marker size. */
export const MARKER = 8;
