// mapFrame — the frame both grade-against-attendance maps on the Analytics
// page draw on: the follow-up map on the Overview, coloured by follow-up
// status, and the group map on Performance groups, coloured by group. One
// frame, so a student sits in the same place on both and only the colouring
// differs -- the formula's reading and the grouping's reading of the same
// students, side by side.

import { SURFACE } from "../../components/charts/tokens";
import { GOOD_ATTENDANCE, PASSING_GRADE } from "./riskVocabulary";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Scales and ticks for `points` -- each `{ grade, attendance }`, a 0-100 grade
 * and a 0-1 attendance rate -- inside a `width` × `height` box with `pad`
 * margins ({ left, right, top, bottom }).
 *
 * Floors come from the data. Fixed floors of 60 and 50% pinned the weakest
 * students to the frame -- a 47.7 average drew at 60, looking no worse than a
 * borderline student. Capped so the passing and attendance lines always keep
 * a readable share of the plot.
 */
export function mapAxes(points, { width, height, pad }) {
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const lowestGrade = Math.min(...points.map((p) => p.grade));
  const lowestAttendance = Math.min(...points.map((p) => p.attendance * 100));
  const xMin = clamp(Math.floor(lowestGrade / 10) * 10, 0, 60);
  const yMin = clamp(Math.floor(lowestAttendance / 10) * 10, 0, 50);

  const x = (grade) => pad.left + ((clamp(grade, 0, 100) - xMin) / (100 - xMin)) * plotW;
  const y = (pct) => pad.top + plotH - ((clamp(pct, 0, 100) - yMin) / (100 - yMin)) * plotH;

  const xTicks = [...new Set([
    ...Array.from({ length: Math.floor((100 - xMin) / 10) + 1 }, (_, i) => xMin + i * 10),
    PASSING_GRADE,
    100,
  ])].sort((a, b) => a - b);
  const yTicks = [...new Set([yMin, 50, 70, GOOD_ATTENDANCE, 100])]
    .filter((p) => p >= yMin)
    .sort((a, b) => a - b);

  return { x, y, xTicks, yTicks, plotW, plotH, passX: x(PASSING_GRADE), goodY: y(GOOD_ATTENDANCE) };
}

/**
 * Each item placed on `axes`, as the item plus its `cx` / `cy`. Students on
 * identical figures (very common at this school's scale) get a deterministic
 * spiral offset, so they stay individually visible instead of stacking into
 * one dot.
 */
export function placeDots(items, axes) {
  const seen = new Map();
  return items.map((item) => {
    const key = `${Math.round(item.grade)}:${Math.round(item.attendance * 100)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const angle = n * 2.4;
    const radius = n === 0 ? 0 : 4 + n * 0.8;
    return {
      ...item,
      cx: axes.x(item.grade) + Math.cos(angle) * radius,
      cy: axes.y(item.attendance * 100) + Math.sin(angle) * radius,
    };
  });
}

// WCAG relative luminance of a #rrggbb colour; null for anything else.
function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return null;
  const channel = (i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/**
 * Whether a colour is too light to hold its own edge on `background` (under
 * 2:1). The groups' "in between" amber (ai/analytics_views.py BAND_COLORS) is
 * 1.8:1 on the chart surface: right for its meaning, washed out as a small
 * dot. A mark in such a colour is outlined instead of ringed with the surface.
 */
export function isFaint(color, background = SURFACE) {
  const a = luminance(color);
  const b = luminance(background);
  if (a == null || b == null) return false;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 2;
}

const SHAPES = ["circle", "square", "triangle"];

/**
 * Each group's marker shape, by `cluster_id`. Colour carries a group's
 * standing, and there are only three colours (BAND_COLORS: no fourth step
 * stays colour-blind safe beside them), so past three groups some share one.
 * Groups sharing a colour are told apart by shape, in standing order:
 * circle, square, triangle. Three groups or fewer are all circles.
 */
export function groupShapes(groups) {
  const seen = new Map();
  return new Map(
    (groups ?? []).map((g) => {
      const band = g.band ?? g.color;
      const n = seen.get(band) ?? 0;
      seen.set(band, n + 1);
      return [g.cluster_id, SHAPES[n % SHAPES.length]];
    }),
  );
}
