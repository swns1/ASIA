// charts/LineChart.jsx — trend over time, with a crosshair.
//
// Conventions this holds to, and the reasons:
//
//   · ONE y-axis, always. Two measures of different scale get two charts or a
//     common index — never a second axis. A dual-axis chart lets you slide two
//     unrelated scales against each other until they appear correlated, which
//     is a picture of nothing.
//   · A null breaks the line rather than joining across it (see geometry.js).
//     A gap is "we did not measure", not "it was zero".
//   · Two or more series always carry a legend; a single series carries none,
//     because the title already names it.
//   · A dashed rule means a threshold and nothing else. Grid lines are solid
//     hairlines one shade off the surface.
//   · Values are labelled selectively — the crosshair carries the reading, so
//     the plot does not need a number on every point.

import { useState } from "react";
import { motion } from "framer-motion";

import ChartFrame, { NoData } from "./ChartFrame";
import { linePath, niceMax } from "./geometry";
import { MARKER, STROKE, chartInk } from "./tokens";
import { chartVariants } from "../../utils/motion";

const PAD_L = 46;
const PAD_R = 16;
const PAD_T = 18;
const PAD_B = 42;

export default function LineChart({
  labels = [],
  series = [],
  title,
  caption,
  formatValue = (v) => String(v),
  formatLabel = (l) => l,
  threshold = null,
  width = 760,
  height = 260,
  emptyMessage,
  yMax: yMaxProp,
  yMin = 0,
}) {
  const [active, setActive] = useState(null);
  const ink = chartInk();

  const hasData = labels.length > 0 &&
    series.some((s) => s.values.some((v) => v != null && !Number.isNaN(v)));
  if (!hasData) return <NoData message={emptyMessage} />;

  const plotW = width - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;

  const allValues = series.flatMap((s) => s.values).filter((v) => v != null && !Number.isNaN(v));
  const rawMax = Math.max(...allValues, 0);
  const yMax = yMaxProp ?? niceMax(Math.max(rawMax, threshold?.value ?? 0));
  // A non-zero floor is legitimate for a RATE line and misleading for a bar:
  // a line encodes change between points, a bar encodes magnitude measured
  // from zero. Rates that live between 75% and 100% on a 0-100 axis put every
  // reading in the top fifth of the plot and flatten the very movement the
  // chart exists to show. The axis labels state the floor, so it is visible.
  const span = yMax - yMin || 1;

  // A single point has no width to spread across; centring it beats dividing
  // by zero and placing it at the origin.
  const stepX = labels.length > 1 ? plotW / (labels.length - 1) : 0;
  const xAt = (i) => (labels.length > 1 ? PAD_L + i * stepX : PAD_L + plotW / 2);
  const yAt = (v) => PAD_T + (1 - (v - yMin) / span) * plotH;

  // Label every tick only while they fit; past that, thin them evenly so the
  // axis stays readable instead of turning into overlapping ink.
  const maxTicks = Math.floor(plotW / 64);
  const tickEvery = Math.max(1, Math.ceil(labels.length / Math.max(maxTicks, 1)));

  function handleMove(event) {
    // Measure the <svg>, not the <g> this handler sits on: a group's
    // bounding box is the extent of its contents, which starts at the plot's
    // left padding — mapping through that would shift every reading right.
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg || labels.length === 0) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    // The SVG scales to its container, so map the pointer back through the
    // viewBox rather than assuming 1 px = 1 unit.
    const xInView = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = stepX ? (xInView - PAD_L) / stepX : 0;
    const index = Math.max(0, Math.min(labels.length - 1, Math.round(ratio)));
    setActive(index);
  }

  const activeLines = active == null ? [] : series
    .filter((s) => s.values[active] != null && !Number.isNaN(s.values[active]))
    .map((s) => `${s.label}: ${formatValue(s.values[active])}`);

  const tip = active == null || !activeLines.length ? null : {
    x: xAt(active),
    y: PAD_T,
    title: formatLabel(labels[active]),
    lines: activeLines,
  };

  const showLegend = series.length > 1;

  return (
    <ChartFrame
      viewBox={[width, height]}
      title={title}
      caption={caption}
      tip={tip}
      legend={showLegend ? <Legend series={series} /> : null}
    >
      <g onMouseMove={handleMove} onMouseLeave={() => setActive(null)}>
        {/* Full-plot hit area: the pointer must not have to find a 2px line. */}
        <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="transparent" />

        {/* Hairline grid — solid, recessive */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD_L} x2={width - PAD_R}
              y1={PAD_T + plotH - f * plotH} y2={PAD_T + plotH - f * plotH}
              stroke={ink.grid}
            />
            <text
              x={PAD_L - 8} y={PAD_T + plotH - f * plotH + 4}
              textAnchor="end" fontSize="10" fill={ink.axis}
            >
              {formatValue(Math.round((yMin + f * span) * 100) / 100)}
            </text>
          </g>
        ))}

        {/* The only dashed line in the system: an actual threshold. */}
        {threshold && threshold.value <= yMax && threshold.value >= yMin && (
          <g>
            <line
              x1={PAD_L} x2={width - PAD_R}
              y1={yAt(threshold.value)} y2={yAt(threshold.value)}
              stroke={ink.threshold} strokeDasharray="4,3" strokeWidth={1.5}
            />
            {threshold.label && (
              <text
                x={width - PAD_R} y={yAt(threshold.value) - 5}
                textAnchor="end" fontSize="10" fontWeight="600" fill={ink.threshold}
              >
                {threshold.label}
              </text>
            )}
          </g>
        )}

        {/* Crosshair, behind the marks so it never obscures a value. */}
        {active != null && (
          <line
            x1={xAt(active)} x2={xAt(active)} y1={PAD_T} y2={PAD_T + plotH}
            stroke={ink.grid} strokeWidth={1.5}
          />
        )}

        {series.map((s) => {
          const points = s.values.map((v, i) =>
            v == null || Number.isNaN(v) ? null : { x: xAt(i), y: yAt(v) }
          );
          const color = s.color || ink.bar;
          return (
            <g key={s.key}>
              {linePath(points).map((d) => (
                <motion.path
                  key={d}
                  variants={chartVariants.line}
                  initial="hidden"
                  animate="visible"
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {/* A lone run of one point draws no line — mark it so a single
                  reading between two gaps is still visible. */}
              {points.map((p, i) =>
                p && !points[i - 1] && !points[i + 1] ? (
                  <circle key={`dot-${i}`} cx={p.x} cy={p.y} r={STROKE} fill={color} />
                ) : null
              )}
              {active != null && points[active] && (
                <circle
                  cx={points[active].x}
                  cy={points[active].y}
                  r={MARKER / 2}
                  fill={color}
                  // 2px surface ring, so an overlapping marker stays separable.
                  stroke="#fdfcfb"
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}

        {/* x-axis baseline and ticks */}
        <line
          x1={PAD_L} x2={width - PAD_R}
          y1={PAD_T + plotH} y2={PAD_T + plotH}
          stroke={ink.grid}
        />
        {labels.map((label, i) =>
          i % tickEvery === 0 || i === labels.length - 1 ? (
            <text
              key={label}
              x={xAt(i)} y={PAD_T + plotH + 16}
              textAnchor="middle" fontSize="10" fill={ink.axis}
            >
              {formatLabel(label)}
            </text>
          ) : null
        )}
      </g>
    </ChartFrame>
  );
}

function Legend({ series }) {
  const ink = chartInk();
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: s.color || ink.bar }}
            aria-hidden="true"
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}
