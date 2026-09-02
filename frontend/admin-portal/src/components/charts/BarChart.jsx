// charts/BarChart.jsx — magnitude across a handful of named categories.
//
// Horizontal, because the categories here carry words ("Junior High",
// "Kindergarten") and a vertical column chart would rotate them.
//
// ONE hue for every bar. The bar's length already encodes the value, so
// shading each bar darker-where-bigger spends the only free channel on
// information the chart has already given, and a value-ramp across nominal
// categories fails the palette checks by construction. Ordered categories get
// the ordinal ramp only when the order is the point; here the labels carry it.

import { useState } from "react";
import { motion } from "framer-motion";

import ChartFrame, { NoData } from "./ChartFrame";
import { barPath, niceMax } from "./geometry";
import { GAP, chartInk } from "./tokens";
import { chartVariants } from "../../utils/motion";

const W = 760;
const PAD_L = 116;
const PAD_R = 44;
const PAD_T = 12;
const PAD_B = 12;
const ROW_H = 34;

export default function BarChart({
  rows = [],
  title,
  caption,
  emptyMessage,
  color,
  formatValue = (v) => String(v),
}) {
  const [tip, setTip] = useState(null);
  const ink = chartInk();
  const fill = color || ink.bar;

  // Rows with a zero value are KEPT — an empty category is a real reading
  // ("no Senior High intake this year"), and dropping it would silently
  // reshape the axis between refreshes.
  if (!rows.length) return <NoData message={emptyMessage} />;
  const total = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  if (!total) return <NoData message={emptyMessage} />;

  const height = PAD_T + rows.length * ROW_H + PAD_B;
  const plotW = W - PAD_L - PAD_R;
  const max = niceMax(Math.max(...rows.map((r) => r.value ?? 0)));

  return (
    <ChartFrame viewBox={[W, height]} title={title} caption={caption} tip={tip}>
      <motion.g variants={chartVariants.container} initial="hidden" animate="visible">
      {rows.map((row, i) => {
        const y = PAD_T + i * ROW_H;
        const barH = ROW_H - GAP * 3;
        const value = row.value ?? 0;
        const width = max ? (value / max) * plotW : 0;
        return (
          <g
            key={row.key}
            onMouseEnter={() =>
              setTip({
                x: PAD_L + width,
                y,
                title: row.label,
                lines: [
                  `${formatValue(value)} student${value === 1 ? "" : "s"}`,
                  `${Math.round((value / total) * 100)}% of the school`,
                ],
              })
            }
            onMouseLeave={() => setTip(null)}
            style={{ cursor: "pointer" }}
          >
            {/* Row hit area — bigger than the bar, so a short bar is still
                easy to hover. */}
            <rect x={0} y={y} width={W} height={ROW_H} fill="transparent" />
            <text
              x={PAD_L - 10} y={y + barH / 2 + 4}
              textAnchor="end" fontSize="11" fontWeight="600" fill={ink.muted}
            >
              {row.label}
            </text>
            {value > 0 && (
              <motion.path
                variants={chartVariants.bar}
                // originX belongs in `style`, not as a prop: framer-motion treats
                // it as a transform property and writes transform-origin from it.
                // As a bare prop it is ignored and the origin stays 50% 50%, which
                // grows the bar from its centre outward.
                style={{ transformBox: "fill-box", originX: 0 }}
                d={barPath(PAD_L, y, width, barH)}
                fill={fill}
              />
            )}
            <text
              x={PAD_L + width + 8} y={y + barH / 2 + 4}
              fontSize="11" fontWeight="700" fill={ink.ink}
            >
              {formatValue(value)}
            </text>
          </g>
        );
      })}
      </motion.g>
      {/* Baseline the bars are measured from. */}
      <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={height - PAD_B} stroke={ink.grid} />
    </ChartFrame>
  );
}
