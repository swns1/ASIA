// charts/scale.js — a value axis for the charts drawn on ColumnPlot.
//
// A round step (1, 2, 2.5 or 5 × 10ⁿ) sized for four intervals, then the
// multiples of it that hold the data: 734 learners get a 0–800 axis in steps
// of 200, not 0–734 in steps of 183.5. geometry.js's niceMax finds a round
// top alone; these charts also want a floor that isn't always zero (a rate
// line, the learner bridge) and 2.5 among the steps.

const INTERVALS = 4;

/**
 * The round step nearest above `raw`. `integer` keeps a count's axis on whole
 * numbers: half a learner is not a gridline.
 */
export function niceStep(raw, { integer = false } = {}) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  // 2.5 of a unit isn't a whole count, so below tens a count axis skips it.
  const steps = integer && magnitude < 10 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const n = raw / magnitude;
  const step = (steps.find((s) => n <= s + 1e-9) ?? 10) * magnitude;
  return integer ? Math.max(1, step) : step;
}

/**
 * An axis holding `min` to `max`. `at(v)` is v's place on it, 0 at the floor
 * and 1 at the top (clamped), and `ticks` are every step between.
 */
export function linearAxis(min, max, { integer = false } = {}) {
  const step = niceStep((max - min) / INTERVALS, { integer });
  const lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (hi <= lo) hi = lo + step;
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const at = (v) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return { lo, hi, step, ticks, at };
}
