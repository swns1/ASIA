import { LEVEL_LABELS } from "../../../constants/schoolLevels";
import { NoData } from "../ChartFrame";
import { columnPath } from "../geometry";
import { GAP, chartInk, levelColor } from "../tokens";
import { fmtCount, shortYear } from "../../schoolYears/compareFigures";
import ChartCard, { Caption } from "./ChartCard";
import ColumnPlot from "../ColumnPlot";
import Legend from "../Legend";
import { linearAxis } from "../scale";

// 1b — each year's learners as one column, stacked by school level: Nursery
// at the bottom, Senior High on top, the year's total above.

export default function LearnersByLevelChart({ years, source }) {
  return (
    <ChartCard
      icon="ti-users"
      title="Learners by school level"
      subtitle="How each year's total is made up"
      source={source}
      errorSubject="the comparison"
    >
      <LearnersByLevel years={years} get={source.get} />
    </ChartCard>
  );
}

function LearnersByLevel({ years, get }) {
  const ink = chartInk();
  const byLevel = (y) => get(y)?.enrollment.by_level ?? {};
  // A level none of these years has isn't drawn or keyed -- as in the table.
  const levels = Object.keys(LEVEL_LABELS).filter((level) => years.some((y) => byLevel(y)[level]));

  const columns = years.map((year) => {
    // Each level's segment starts where the one below it ended.
    const segments = levels.reduce((acc, level) => {
      const value = byLevel(year)[level] ?? 0;
      const from = acc.length ? acc[acc.length - 1].to : 0;
      acc.push({ level, value, from, to: from + value });
      return acc;
    }, []).filter((s) => s.value > 0);
    return { year, segments, total: get(year)?.enrollment.learners ?? 0 };
  });

  if (!columns.some((c) => c.total)) return <NoData message="No learners in these years yet." />;

  const axis = linearAxis(0, Math.max(...columns.map((c) => Math.max(c.total, c.segments.at(-1)?.to ?? 0))), { integer: true });
  const first = years[0];
  const last = years.at(-1);
  const growth = levels
    .map((level) => ({ level, d: (byLevel(last)[level] ?? 0) - (byLevel(first)[level] ?? 0) }))
    .sort((a, b) => b.d - a.d)[0];

  return (
    <>
      <ColumnPlot
        title={`Learners by school level, S.Y. ${first}${years.length > 1 ? ` to ${last}` : ""}`}
        legend={
          <Legend
            className="mb-2"
            items={levels.map((level) => ({ key: level, label: LEVEL_LABELS[level], color: levelColor(level) }))}
          />
        }
        axis={axis}
        formatTick={fmtCount}
        labels={years.map((y) => ({ key: y, label: shortYear(y) }))}
      >
        {(geo) => columns.map((col, i) => {
          const w = Math.min(64, geo.slotW * 0.52);
          const x0 = geo.x(i) - w / 2;
          return (
            <g key={col.year}>
              {col.segments.map((s, j) => {
                const top = geo.y(s.to);
                const h = geo.y(s.from) - top;
                const topmost = j === col.segments.length - 1;
                return topmost ? (
                  // The column's rounded top belongs to its highest level.
                  <path key={s.level} d={columnPath(x0, top, w, h)} fill={levelColor(s.level)}>
                    <title>{`${LEVEL_LABELS[s.level]} · ${fmtCount(s.value)}`}</title>
                  </path>
                ) : (
                  // A surface gap off each segment's top separates it from the next.
                  <rect key={s.level} x={x0} y={top + GAP} width={w} height={Math.max(0, h - GAP)} fill={levelColor(s.level)}>
                    <title>{`${LEVEL_LABELS[s.level]} · ${fmtCount(s.value)}`}</title>
                  </rect>
                );
              })}
              <text
                x={geo.x(i)} y={geo.y(col.total) - 6}
                textAnchor="middle" fontSize="12" fontWeight="700" fill={ink.ink}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {fmtCount(col.total)}
              </text>
            </g>
          );
        })}
      </ColumnPlot>
      <Caption>
        {years.length < 2
          ? "Pick another year to compare the mix."
          : growth?.d > 0
            ? `${LEVEL_LABELS[growth.level]} added the most learners between S.Y. ${first} and ${last} (+${fmtCount(growth.d)}).`
            : `No level grew between S.Y. ${first} and ${last}.`}
      </Caption>
    </>
  );
}
