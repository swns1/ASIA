// compare/bridge.js — the arithmetic behind "Where the change in learners
// came from": one year's learners walked to the next year's in signed steps.

import { nextLabel } from "../../schoolYears/yearHelpers";

/**
 * The pairs the bridge can show: neighbouring selected years where the
 * earlier one knows who came back. It knows once the later year is
 * registered, so in practice any two neighbours picked together qualify.
 */
export function bridgePairs(years, get) {
  return years.slice(1).flatMap((to, i) => {
    const from = years[i];
    const qualifies = nextLabel(from) === to
      && get(from)?.enrollment.came_back
      && get(to)?.enrollment.new != null;
    return qualifies ? [{ from, to }] : [];
  });
}

/**
 * `before` and `after` are the two years' `enrollment` figures. Each step runs
 * from the total the one before it left, so the bars always join up:
 *
 *   learners − transferred out   = finished
 *   finished − didn't re-enroll  = came back
 *   came back + new              = next year's learners
 *
 * The last line is where the server's two sides can disagree. "Came back"
 * counts a learner whose next-year enrollment is still pending, and next
 * year's learners don't count them until it's approved. (Rarer, the other
 * way: someone who transferred out mid-year and then returned is returning
 * next year, but never finished this one.) When the two differ, the gap is a
 * step of its own -- "pending" when it takes learners away, "rejoined" when it
 * adds them -- so every bar is a real count and the bridge still closes.
 */
export function bridgeSteps(before, after) {
  const start = before.learners;
  const finished = start - before.transferred_out;
  const cameBack = before.came_back.count;
  const end = after.learners;
  const returning = end - after.new;

  const steps = [
    { key: "start", total: true, from: 0, to: start },
    { key: "transferred", from: start, to: finished },
    { key: "left", from: finished, to: cameBack },
  ];
  if (returning !== cameBack) {
    steps.push({ key: returning < cameBack ? "pending" : "rejoined", from: cameBack, to: returning });
  }
  steps.push({ key: "new", from: returning, to: end });
  steps.push({ key: "end", total: true, from: 0, to: end });
  return steps;
}

/**
 * Where the bridge's value axis starts: 80% of the lowest total any step
 * reaches, rounded down to a hundred. The steps are small beside the totals,
 * and from zero they'd be slivers; the caption says where the scale starts.
 */
export function bridgeFloor(steps) {
  const lows = steps.filter((s) => !s.total).map((s) => Math.min(s.from, s.to));
  return Math.floor((Math.min(...lows, steps.at(-1).to) * 0.8) / 100) * 100;
}
