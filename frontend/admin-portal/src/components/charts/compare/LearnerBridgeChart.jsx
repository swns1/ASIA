import SegmentedControl from "../../ui/SegmentedControl";
import { NoData } from "../ChartFrame";
import { chartInk, token } from "../tokens";
import { fmtCount, fmtOne, plural, share, shortYear, signedCount } from "../../schoolYears/compareFigures";
import { bridgeFloor, bridgePairs, bridgeSteps } from "./bridge";
import ChartCard, { Caption } from "./ChartCard";
import ColumnPlot from "../ColumnPlot";
import { linearAxis } from "../scale";

// 1c — how one year's learners became the next year's: who transferred out,
// who finished and didn't come back, who's new. A waterfall between two
// neighbouring selected years, with buttons above to pick which two. The
// steps and why they always add up are in bridge.js.

// The soft hyphens (­) let "Transferred" break as "Trans-ferred" where a
// phone leaves its slot narrower than the word; invisible anywhere it fits.
const STEP_TEXT = {
  transferred: { label: "Trans­ferred out", sub: "during the year" },
  left: { label: "Didn't re-enroll", sub: "after finishing" },
  pending: { label: "Still pending", sub: "not enrolled yet" },
  rejoined: { label: "Back from a trans­fer", sub: "left, then returned" },
  new: { label: "New learners", sub: "first year here" },
};
const plain = (text) => text.replace(/­/g, "");

export default function LearnerBridgeChart({ years, source, bridgeTo, onBridgeTo }) {
  return (
    <ChartCard
      icon="ti-arrows-exchange"
      title="Where the change in learners came from"
      subtitle="One year's learners to the next, step by step"
      source={source}
      errorSubject="the comparison"
    >
      <LearnerBridge years={years} get={source.get} bridgeTo={bridgeTo} onBridgeTo={onBridgeTo} />
    </ChartCard>
  );
}

function LearnerBridge({ years, get, bridgeTo, onBridgeTo }) {
  const ink = chartInk();
  const pairs = bridgePairs(years, get);
  if (!pairs.length) return <NoData message="Pick two neighbouring years to see how one became the next." />;

  // The pair asked for, while both its years are still picked; else the latest.
  const pair = pairs.find((p) => p.to === bridgeTo) ?? pairs.at(-1);
  const before = get(pair.from).enrollment;
  const after = get(pair.to).enrollment;
  const steps = bridgeSteps(before, after);
  const axis = linearAxis(bridgeFloor(steps), Math.max(before.learners, after.learners), { integer: true });

  const loss = token("--color-neutral-400");
  const colors = {
    start: token("--color-brand-400"),
    transferred: loss,
    left: loss,
    pending: loss,
    rejoined: token("--color-brand-300"),
    new: token("--color-brand-500"),
    end: token("--color-brand-600"),
  };
  const textOf = (s) => (s.total
    ? { label: shortYear(s.key === "start" ? pair.from : pair.to), sub: "learners" }
    : STEP_TEXT[s.key]);
  const valueOf = (s) => (s.total ? fmtCount(s.to) : signedCount(s.to - s.from));

  const { count: cameBack, of: finished } = before.came_back;
  const rate = share(cameBack, finished);
  const net = after.learners - before.learners;
  const gap = steps.find((s) => s.key === "pending" || s.key === "rejoined");
  const caption = [
    rate == null
      ? `No learners finished S.Y. ${pair.from}.`
      : `${fmtCount(cameBack)} of ${fmtCount(finished)} learners who finished S.Y. ${pair.from} came back (${fmtOne(rate)}%).`,
    gap?.key === "pending"
      && `${fmtCount(gap.from - gap.to)} of them ${gap.from - gap.to === 1 ? "is" : "are"} still pending in S.Y. ${pair.to}.`,
    gap?.key === "rejoined"
      && `${plural(gap.to - gap.from, "learner")} who transferred out came back too.`,
    `With ${plural(after.new, "new learner")}, S.Y. ${pair.to} is ${
      net > 0 ? `up ${fmtCount(net)}` : net < 0 ? `down ${fmtCount(-net)}` : "level with the year before"
    }.`,
    axis.lo > 0 && `Scale starts at ${fmtCount(axis.lo)}.`,
  ].filter(Boolean).join(" ");

  return (
    <>
      <ColumnPlot
        title={`Learners from S.Y. ${pair.from} to S.Y. ${pair.to}, step by step`}
        legend={
          <SegmentedControl
            size="sm"
            label="Years to show"
            className="mb-2"
            options={pairs.map((p) => ({ value: p.to, label: `${shortYear(p.from)} → ${shortYear(p.to)}` }))}
            value={pair.to}
            onChange={onBridgeTo}
          />
        }
        axis={axis}
        formatTick={fmtCount}
        labels={steps.map((s) => ({ key: s.key, ...textOf(s) }))}
      >
        {(geo) => {
          const w = geo.slotW * 0.5;
          return (
            <>
              {/* Each step starts where the last one ended; the dashes say so. */}
              {steps.slice(0, -1).map((s, i) => (
                <line
                  key={`link-${s.key}`}
                  x1={geo.x(i) + w / 2} x2={geo.x(i + 1) - w / 2}
                  y1={geo.y(s.to)} y2={geo.y(s.to)}
                  stroke={loss} strokeDasharray="3 3" shapeRendering="crispEdges"
                />
              ))}
              {steps.map((s, i) => {
                const top = geo.y(Math.max(s.from, s.to));
                // A total rises from the floor of the scale; a step floats.
                const bottom = s.total ? geo.base : geo.y(Math.min(s.from, s.to));
                const t = textOf(s);
                return (
                  <g key={s.key}>
                    <rect x={geo.x(i) - w / 2} y={top} width={w} height={Math.max(1.5, bottom - top)} rx={3} fill={colors[s.key]}>
                      <title>{`${plain(t.label)} ${t.sub}: ${valueOf(s)}`}</title>
                    </rect>
                    <text
                      x={geo.x(i)} y={top - 6}
                      textAnchor="middle" fontSize="12" fontWeight="700" fill={ink.ink}
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {valueOf(s)}
                    </text>
                  </g>
                );
              })}
            </>
          );
        }}
      </ColumnPlot>
      <Caption>{caption}</Caption>
    </>
  );
}
