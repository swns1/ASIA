import { useState } from "react";
import { Link } from "react-router-dom";

import { GRADE_ORDER } from "../../../utils/grading";
import { peso } from "../../../utils/format";
import { NoData } from "../ChartFrame";
import useElementSize from "../useElementSize";
import { fmtOne, num, pesoCompact, pesoWhole, shortYear } from "../../schoolYears/compareFigures";
import ChartCard, { Caption } from "./ChartCard";
import Legend from "../Legend";
import { FEE_RANGE, yearRamp } from "./palette";
import { niceStep } from "../scale";

// 1g — every grade's total fee as one dot per year on a shared peso scale, so
// a grade's rise reads as how far its dots spread. Darker is later. On the
// right, the change since the first selected year.

const COLUMNS = "grid grid-cols-[84px_minmax(0,1fr)_124px] gap-x-3";
const ROUND = 5000;

export default function FeesByGradeChart({ years, source }) {
  return (
    <ChartCard
      icon="ti-receipt"
      title="Fees by grade"
      subtitle="Each dot is one year's total fee; darker is later"
      source={source}
      errorSubject="billing figures"
      skeletonHeight={360}
    >
      <FeesByGrade years={years} get={source.get} />
    </ChartCard>
  );
}

// The peso scale, rounded out to ₱5K. Gridlines every ₱10K, or a rounder
// step when the fees span too far, or the plot is too narrow (`width`, once
// measured), for labels that close to fit: one needs about 44px.
function feeScale(values, width) {
  const floor = Math.floor(Math.min(...values) / ROUND) * ROUND;
  const ceil = Math.ceil(Math.max(...values) / ROUND) * ROUND;
  // One fee throughout: widen either side so its dots sit mid-scale.
  const [lo, hi] = ceil > floor ? [floor, ceil] : [Math.max(0, floor - ROUND), ceil + ROUND];
  const room = width ? Math.max(1, Math.floor(width / 44)) : Infinity;
  const count = (s) => Math.floor(hi / s) - Math.ceil(lo / s) + 1;
  let step = Math.max(10000, niceStep((hi - lo) / 4));
  while (count(step) > room) step = niceStep(step * 1.01);
  const first = Math.ceil(lo / step) * step;
  const ticks = Array.from({ length: Math.floor((hi - first) / step) + 1 }, (_, i) => first + i * step);
  return { at: (v) => ((v - lo) / (hi - lo)) * 100, ticks };
}

function FeeChange({ row, years }) {
  if (years.length < 2) return <span className="text-[11.5px] font-bold text-neutral-500">—</span>;
  if (row.start == null || row.end == null) {
    const missing = row.start == null ? years[0] : years.at(-1);
    return (
      <span className="text-[11.5px] font-bold text-neutral-500" title={`No fee for S.Y. ${missing}`}>—</span>
    );
  }
  const d = row.end - row.start;
  if (Math.abs(d) < 0.005) return <span className="text-[11.5px] font-bold text-neutral-900">No change</span>;
  return (
    <>
      <span className="text-[11.5px] font-bold text-neutral-900">{d > 0 ? "+" : "−"}{pesoWhole(Math.abs(d))}</span>
      {row.start > 0 && <span className="text-xs text-neutral-500">{fmtOne((Math.abs(d) * 100) / row.start)}%</span>}
    </>
  );
}

function FeesByGrade({ years, get }) {
  // The plot column's width, which sets how many peso labels fit under it.
  const [axisEl, setAxisEl] = useState(null);
  const plotWidth = useElementSize(axisEl)?.width;
  const schedules = (y) => get(y) ?? [];
  const rank = (g) => (GRADE_ORDER.includes(g) ? GRADE_ORDER.indexOf(g) : GRADE_ORDER.length);
  const grades = [...new Set(years.flatMap((y) => schedules(y).map((s) => s.grade_level)))]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  if (!grades.length) {
    return (
      <NoData
        message={
          <>
            None of these years has a fee schedule yet. They're set up under{" "}
            <Link to="/settings?tab=fees" className="font-semibold text-brand-600 underline underline-offset-2">Billing Settings</Link>.
          </>
        }
      />
    );
  }

  const first = years[0];
  const last = years.at(-1);
  const colors = yearRamp(years.length);
  const rows = grades.map((grade) => {
    const fees = years.map((y) => num(schedules(y).find((s) => s.grade_level === grade)?.grand_total));
    const known = fees.filter((v) => v != null);
    return { grade, fees, low: Math.min(...known), high: Math.max(...known), start: fees[0], end: fees.at(-1) };
  });
  const scale = feeScale(rows.flatMap((r) => r.fees).filter((v) => v != null), plotWidth);

  // A ₱0 fee (most likely a schedule not filled in yet) has no percentage
  // change to average, so the caption counts only grades priced both years.
  // Its dot still shows: the chart draws what the schedules say.
  const priced = rows.filter((r) => r.start > 0 && r.end > 0);
  const growth = priced.reduce((sum, r) => sum + (r.end - r.start) / r.start, 0) * 100 / (priced.length || 1);
  const moved = Math.abs(growth) < 0.05 ? "held steady" : growth > 0 ? `rose ${fmtOne(growth)}%` : `fell ${fmtOne(-growth)}%`;
  const between = `between S.Y. ${first} and ${last}`;
  const caption = years.length < 2
    ? "Pick another year to compare fees."
    : !priced.length
      ? `No grade has a fee in both S.Y. ${first} and ${last}.`
      : priced.length === 1
        ? `${priced[0].grade}'s fee ${moved} ${between}${rows.length > 1 ? ", the only grade priced in both years" : ""}.`
        : `Across the ${priced.length} grades${priced.length < rows.length ? " priced in both years" : ""}, fees ${moved} on average ${between}.`;

  return (
    <>
      <Legend
        shape="dot"
        items={years.map((y, k) => ({ key: y, label: `S.Y. ${shortYear(y)}`, color: colors[k] }))}
      />
      <div>
        <div className={`${COLUMNS} border-b border-neutral-200 pb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-neutral-500`}>
          <span>Grade</span>
          <span>Total fee</span>
          <span className="text-right">{years.length > 1 ? `Since ${shortYear(first)}` : "Change"}</span>
        </div>
        <div className="relative py-1">
          <div className={`${COLUMNS} pointer-events-none absolute inset-0`} aria-hidden="true">
            <div />
            <div className="relative">
              {scale.ticks.map((t) => (
                <div key={t} className="absolute inset-y-0 border-l border-neutral-200" style={{ left: `${scale.at(t)}%` }} />
              ))}
            </div>
            <div />
          </div>
          {rows.map((row) => (
            <div key={row.grade} className={`${COLUMNS} relative h-6 items-center`}>
              <span className="whitespace-nowrap text-[11.5px] font-semibold text-neutral-800">{row.grade}</span>
              <div
                className="relative h-full"
                role="img"
                aria-label={`${row.grade}: ${row.fees
                  .map((fee, k) => (fee == null ? null : `${peso(fee)} in S.Y. ${years[k]}`))
                  .filter(Boolean)
                  .join(", ")}`}
              >
                {row.high > row.low && (
                  <div
                    className="absolute top-1/2 -mt-px h-0.5 rounded-[1px]"
                    style={{
                      left: `${scale.at(row.low)}%`,
                      width: `${scale.at(row.high) - scale.at(row.low)}%`,
                      background: FEE_RANGE,
                    }}
                  />
                )}
                {row.fees.map((fee, k) => (fee == null ? null : (
                  <div
                    key={years[k]}
                    title={`${row.grade} · S.Y. ${years[k]} · ${peso(fee)}`}
                    className="absolute top-1/2 -ml-1.5 -mt-1.5 h-3 w-3 rounded-full border-2 border-white"
                    style={{ left: `${scale.at(fee)}%`, background: colors[k] }}
                  />
                )))}
              </div>
              <div className="flex items-baseline justify-end gap-1.5 whitespace-nowrap tabular-nums">
                <FeeChange row={row} years={years} />
              </div>
            </div>
          ))}
        </div>
        <div className={`${COLUMNS} border-t border-neutral-200 pt-1`} aria-hidden="true">
          <div />
          <div ref={setAxisEl} className="relative h-4">
            {scale.ticks.map((t) => (
              <span
                key={t}
                className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap text-[10.5px] leading-none text-neutral-500"
                style={{ left: `${scale.at(t)}%` }}
              >
                {pesoCompact(t)}
              </span>
            ))}
          </div>
          <div />
        </div>
      </div>
      <Caption>{caption}</Caption>
    </>
  );
}
