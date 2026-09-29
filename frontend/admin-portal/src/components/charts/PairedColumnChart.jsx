// charts/PairedColumnChart.jsx — one figure per category, this year beside last.
//
// Columns grouped by category, last year on the left and this year on the
// right, rising from one baseline on one scale, with a light grid behind.
// The categories here are short enough ("Kindergarten", "Net billed") to sit
// under their group without rotating, which is when columns beat the
// horizontal bars the other charts use.
//
// Two steps of the brand red: the years are ordered, so this is an ordinal
// pair -- the lighter step for last year (context), the deeper one for this
// year (the point). brand-400 and brand-600 pass the dataviz validator on the
// chart surface: CVD separation 14.7, normal vision 15.7. brand-400 is 2.85:1
// against the surface, under 3:1, which the validator allows only with
// visible values -- so every column carries its figure, and the legend names
// both years.
//
// Without a previous year (`previous` null on every row) it draws this year
// alone, one column per category and no legend: a single series is named by
// the title.
//
// `fill` lets the plot stretch to the height its card is given (at least
// `height` pixels), so two cards side by side can end level. It then draws in
// real pixels at the measured size rather than scaling a fixed viewBox, which
// would stretch the text along with the columns.

import { useState } from "react";
import { motion } from "framer-motion";

import ChartFrame, { NoData } from "./ChartFrame";
import { columnPath, niceMax } from "./geometry";
import { chartInk, token } from "./tokens";
import useElementSize from "./useElementSize";
import { chartVariants } from "../../utils/motion";

const W = 760;      // viewBox width when not filling (or not measured yet)
const PAD_L = 52;
const PAD_R = 12;
const PAD_T = 24;   // room for the figure above the tallest column
const PAD_B = 30;   // room for the category labels
const PAIR_GAP = 6;
const TICKS = 4;

function changeText(now, before, formatValue) {
  const diff = now - before;
  if (!diff) return "No change";
  const pct = before ? ` (${Math.round((Math.abs(diff) * 100) / before)}%)` : "";
  return `${diff > 0 ? "Up" : "Down"} ${formatValue(Math.abs(diff))}${pct}`;
}

export default function PairedColumnChart({
  rows = [],
  currentLabel,
  previousLabel,
  title,
  caption,
  emptyMessage,
  height = 240,
  fill = false,
  // Counts can't be split: keep the grid on whole numbers.
  integer = false,
  formatValue = (v) => String(v),
  formatTick = formatValue,
}) {
  const [tip, setTip] = useState(null);
  // A callback ref held in state, so the observer attaches whenever the plot
  // appears -- including after an empty state gives way to data.
  const [plotEl, setPlotEl] = useState(null);
  const measured = useElementSize(fill ? plotEl : null);
  // Filling needs both dimensions; until the plot has a height, the fixed size.
  const size = measured?.height > 0 ? measured : null;
  const ink = chartInk();
  const colors = { previous: token("--color-brand-400"), current: token("--color-brand-600") };
  const names = { previous: previousLabel, current: currentLabel };

  const compared = rows.some((r) => r.previous != null);
  // Oldest first, left to right, the order the legend reads in.
  const series = compared ? ["previous", "current"] : ["current"];
  const max = Math.max(0, ...rows.flatMap((r) => series.map((s) => r[s] ?? 0)));
  if (!rows.length || !max) return <NoData message={emptyMessage} />;

  // A round step, then the smallest multiple of it that holds the tallest
  // column: 581,341 gets a 600,000 top in 200,000 steps, not a 1,000,000 one
  // that would leave every column half height.
  const step = integer ? Math.max(1, niceMax(max / TICKS)) : niceMax(max / TICKS);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  const width = size?.width ?? W;
  const fullH = size?.height ?? height;
  const plotW = width - PAD_L - PAD_R;
  const plotH = fullH - PAD_T - PAD_B;
  const baseY = PAD_T + plotH;
  const yOf = (v) => baseY - (v / top) * plotH;

  const groupW = plotW / rows.length;
  const colW = Math.max(16, Math.min(56, groupW * (compared ? 0.26 : 0.34)));
  const pairW = series.length * colW + (series.length - 1) * PAIR_GAP;

  const legend = compared ? (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {series.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: colors[s] }} aria-hidden="true" />
          {names[s]}
        </span>
      ))}
    </div>
  ) : null;

  return (
    <ChartFrame
      viewBox={[width, fullH]}
      title={title}
      caption={caption}
      tip={tip}
      legend={legend}
      fill={fill}
      minPlotHeight={height}
      plotRef={setPlotEl}
    >
      {/* Grid: hairline and solid; dashes are for thresholds only. */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD_L} x2={width - PAD_R} y1={yOf(t)} y2={yOf(t)} stroke={ink.grid} />
          <text x={PAD_L - 8} y={yOf(t) + 3.5} textAnchor="end" fontSize="10" fill={ink.axis}>
            {formatTick(t)}
          </text>
        </g>
      ))}

      <motion.g variants={chartVariants.container} initial="hidden" animate="visible">
        {rows.map((row, i) => {
          const groupX = PAD_L + i * groupW;
          const startX = groupX + (groupW - pairW) / 2;
          const tallest = Math.max(...series.map((s) => row[s] ?? 0));
          const lines = series.map((s) => `${names[s] ?? "This year"}: ${formatValue(row[s] ?? 0)}`);
          if (compared && row.previous != null) {
            lines.push(changeText(row.current ?? 0, row.previous, formatValue));
          }
          return (
            <g
              key={row.key}
              onMouseEnter={() => setTip({ x: groupX + groupW / 2, y: yOf(tallest), title: row.label, lines })}
              onMouseLeave={() => setTip(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Whole-group hit area, so a short column is easy to hover. */}
              <rect x={groupX} y={PAD_T} width={groupW} height={plotH} fill="transparent" />
              {series.map((s, j) => {
                const value = row[s] ?? 0;
                const x = startX + j * (colW + PAIR_GAP);
                const y = yOf(value);
                return (
                  <g key={s}>
                    {value > 0 && (
                      <motion.path
                        variants={chartVariants.column}
                        // originY in `style`, not as a prop -- see BarChart.
                        style={{ transformBox: "fill-box", originY: 1 }}
                        d={columnPath(x, y, colW, baseY - y)}
                        fill={colors[s]}
                      />
                    )}
                    {/* Text wears text ink, never the series colour; this
                        year's figure is the heavier one. */}
                    <text
                      x={x + colW / 2} y={y - 6}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={s === "current" ? "700" : "600"}
                      fill={s === "current" ? ink.ink : ink.muted}
                    >
                      {formatValue(value)}
                    </text>
                  </g>
                );
              })}
              <text
                x={groupX + groupW / 2} y={baseY + 19}
                textAnchor="middle" fontSize="11" fontWeight="600" fill={ink.muted}
              >
                {row.label}
              </text>
            </g>
          );
        })}
      </motion.g>
    </ChartFrame>
  );
}
