import { NoData } from "../ChartFrame";
import { linePath } from "../geometry";
import { STROKE, token } from "../tokens";
import { fmtOne, num, share, shortYear } from "../../schoolYears/compareFigures";
import ChartCard, { Caption } from "./ChartCard";
import ColumnPlot from "../ColumnPlot";
import Legend from "../Legend";
import { linearAxis } from "../scale";

// 1d — three rates on one percentage axis: came back the next year, passed
// every subject, attendance. One axis because all three are shares of a
// hundred. It starts where the lowest rate needs rather than at zero: these
// live near the top, and a zero floor would flatten every movement (see
// LineChart). The caption says where it starts.

const SERIES = [
  {
    key: "came_back", name: "Came back next year", colorToken: "--color-brand-600",
    value: (s) => {
      const c = s?.enrollment.came_back;
      return c ? share(c.count, c.of) : null;
    },
  },
  {
    key: "passed", name: "Passed every subject", colorToken: "--color-info-500",
    value: (s) => (s ? share(s.academics.passed_all, s.academics.graded_learners) : null),
  },
  {
    key: "attendance", name: "Attendance", colorToken: "--color-success-500",
    value: (s) => num(s?.academics.attendance_rate),
  },
];

export default function RatesChart({ years, states, source }) {
  return (
    <ChartCard
      icon="ti-certificate"
      title="Retention, passing and attendance"
      subtitle="Three rates on one scale"
      source={source}
      errorSubject="the comparison"
    >
      <Rates years={years} states={states} get={source.get} />
    </ChartCard>
  );
}

function Rates({ years, states, get }) {
  const series = SERIES.map((s) => ({ ...s, color: token(s.colorToken), values: years.map((y) => s.value(get(y))) }));
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!all.length) return <NoData message="No rates recorded for these years yet." />;

  const axis = linearAxis(Math.min(85, Math.floor(Math.min(...all) / 5) * 5), 100);
  const last = years.at(-1);
  const latest = (s) => {
    const i = s.values.findLastIndex((v) => v != null);
    return i < 0 ? "—" : `${fmtOne(s.values[i])}% in ${shortYear(years[i])}`;
  };
  const caption = [
    `Scale runs ${axis.lo}–100%.`,
    series[0].values.at(-1) == null && `"Came back" needs the following year, so S.Y. ${last} has no point yet.`,
    states[last] === "current" && `S.Y. ${last} is still running, so its passing rate counts grades recorded so far.`,
  ].filter(Boolean).join(" ");

  return (
    <>
      <ColumnPlot
        title={`Retention, passing and attendance rates, S.Y. ${years[0]}${years.length > 1 ? ` to ${last}` : ""}`}
        legend={
          <Legend
            shape="line"
            className="mb-2"
            items={series.map((s) => ({ key: s.key, label: s.name, color: s.color, value: latest(s) }))}
          />
        }
        axis={axis}
        formatTick={(v) => `${v}%`}
        labels={years.map((y) => ({ key: y, label: shortYear(y) }))}
        padTop={12}
      >
        {(geo) => (
          <>
            {/* A missing year breaks a line rather than joining across it. */}
            {series.map((s) => linePath(s.values.map((v, i) => (v == null ? null : { x: geo.x(i), y: geo.y(v) })))
              .map((d) => (
                <path
                  key={`${s.key}-${d}`} d={d} fill="none" stroke={s.color}
                  strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round"
                />
              )))}
            {/* Points over every line, so no line hides another's point. */}
            {series.map((s) => s.values.map((v, i) => (v == null ? null : (
              <circle key={`${s.key}-${years[i]}`} cx={geo.x(i)} cy={geo.y(v)} r={4} fill="#fff" stroke={s.color} strokeWidth={2}>
                <title>{`${s.name} · S.Y. ${years[i]} · ${fmtOne(v)}%`}</title>
              </circle>
            ))))}
          </>
        )}
      </ColumnPlot>
      <Caption>{caption}</Caption>
    </>
  );
}
