// compare/palette.js — the colours the Compare charts give their series.
// Read from tokens.css through token(), like every other chart's.

import { token } from "../tokens";

const LEVEL_TOKENS = {
  nursery: "--color-nursery-500",
  kindergarten: "--color-kindergarten-500",
  elementary: "--color-elementary-500",
  junior_highschool: "--color-juniorhigh-500",
  senior_highschool: "--color-seniorhigh-500",
};

/** A school level's own hue, the one its filter chips use. */
export const levelColor = (level) => token(LEVEL_TOKENS[level]);

// Two chart-only colours with no token, kept literal for the reason SURFACE
// is: nothing else in the app uses them.
//
// DEEPEST ends the year ramp one step past brand-600. tokens.css has no red
// darker than brand-700, and brand-700 sits too close to brand-600 to tell
// apart as a 12px dot.
const DEEPEST = "#7a1f1f";
/** The faint line joining a grade's cheapest and dearest year. */
export const FEE_RANGE = "#f0dada";

/**
 * One colour per year for `count` years, light to dark in year order, so
 * the latest year is always the darkest.
 */
export function yearRamp(count) {
  const ramp = [
    token("--color-brand-300"),
    token("--color-brand-400"),
    token("--color-brand-500"),
    token("--color-brand-600"),
    DEEPEST,
  ];
  return ramp.slice(Math.max(0, ramp.length - count));
}
