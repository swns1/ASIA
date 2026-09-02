// charts/geometry.js — SVG path maths shared by every bar-shaped mark.
// Lifted verbatim from RiskCharts.jsx, which is now a consumer of it.

import { RADIUS } from "./tokens";

/**
 * A horizontal bar with only its data-end rounded, so the baseline stays a
 * straight edge and the bar reads as measured from it.
 */
export function barPath(x, y, width, height, radius = RADIUS) {
  const r = Math.max(0, Math.min(radius, width, height / 2));
  if (r === 0) return `M ${x} ${y} h ${width} v ${height} h ${-width} Z`;
  return [
    `M ${x} ${y}`,
    `h ${width - r}`,
    `a ${r} ${r} 0 0 1 ${r} ${r}`,
    `v ${height - 2 * r}`,
    `a ${r} ${r} 0 0 1 ${-r} ${r}`,
    `h ${-(width - r)}`,
    "Z",
  ].join(" ");
}

/**
 * A vertical bar rising from a baseline, rounded only at the top — the
 * column equivalent of barPath. Used by the column charts and histograms,
 * which previously reused barPath and got rounding on the wrong edge.
 */
export function columnPath(x, y, width, height, radius = RADIUS) {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  if (r === 0) return `M ${x} ${y} h ${width} v ${height} h ${-width} Z`;
  return [
    `M ${x} ${y + r}`,
    `a ${r} ${r} 0 0 1 ${r} ${-r}`,
    `h ${width - 2 * r}`,
    `a ${r} ${r} 0 0 1 ${r} ${r}`,
    `v ${height - r}`,
    `h ${-width}`,
    "Z",
  ].join(" ");
}

/**
 * Points → an SVG polyline `d`, skipping null values.
 *
 * Returns an array of subpaths rather than one string: a null is a genuine
 * gap in the data (a week the school was closed), and joining across it would
 * draw a straight line through days that were never measured. Each contiguous
 * run becomes its own `M … L …` segment so the line visibly breaks.
 */
export function linePath(points) {
  const runs = [];
  let current = [];
  for (const p of points) {
    if (p == null || p.y == null || Number.isNaN(p.y)) {
      if (current.length) runs.push(current);
      current = [];
    } else {
      current.push(p);
    }
  }
  if (current.length) runs.push(current);

  return runs
    .map((run) =>
      run
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(" ")
    )
    .filter(Boolean);
}

/**
 * A "nice" upper bound for an axis — the smallest 1/2/5×10ⁿ step at or above
 * `max`. Without this an axis tops out at the exact data maximum, so the
 * tallest bar touches the frame and the gridline labels read 0 / 3.5 / 7.
 */
export function niceMax(max) {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}
