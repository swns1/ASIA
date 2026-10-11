// compare/palette.js — the colours the Compare charts give their series.
// Read from tokens.css through token(), like every other chart's.

import { token } from "../tokens";

// Two chart-only colours with no token, kept literal for the reason SURFACE
// is: nothing else in the app uses them.
//
// DEEPEST ends the year ramp one step past brand-600. tokens.css has no red
// darker than brand-700, and brand-700 sits too close to brand-600 to tell
// apart as a 12px dot.
const DEEPEST = "#7a1f1f";
/** The faint line joining a grade's cheapest and dearest year. */
export const FEE_RANGE = "#f0dada";

// Dark mode. The dark token reds run the other way (brand-300 is the dimmest
// and fails 3:1 as a mark on the dark plane), so the dark ramp is its own:
// palest to deepest, keeping "darker is later" true, every step at least
// 3:1 on the dark chart plane (#160f0f) and card (#1c1414). Its last three
// steps are the dark brand-600, -500 and -400; the first two (the second is
// the dark brand-700, which tokens.js doesn't carry) are literal.
const DARK_PALEST = "#ffd0d0";
const DARK_PALER = "#ffb0b0";
/** FEE_RANGE in dark: a muted rose at 3.4:1 on the card, so the span reads
 * clearly but stays quieter than the year dots it joins. */
export const DARK_FEE_RANGE = "#9a5a5a";

/**
 * One colour per year for `count` years, light to dark in year order, so
 * the latest year is always the darkest.
 */
export function yearRamp(count, theme = "light") {
  const ramp = theme === "dark" ? [
    DARK_PALEST,
    DARK_PALER,
    token("--color-brand-600", theme),
    token("--color-brand-500", theme),
    token("--color-brand-400", theme),
  ] : [
    token("--color-brand-300"),
    token("--color-brand-400"),
    token("--color-brand-500"),
    token("--color-brand-600"),
    DEEPEST,
  ];
  return ramp.slice(Math.max(0, ramp.length - count));
}
