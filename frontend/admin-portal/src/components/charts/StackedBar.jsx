// charts/StackedBar.jsx — part-to-whole across a small set of segments.
//
// Generalised out of RiskCharts' RiskMixChart, which drew exactly this for the
// four risk bands. Horizontal because the categories carry words: a vertical
// stack forces the labels to rotate, and rotated labels are slower to read
// than the chart they annotate.
//
// This is the form for part-to-whole with ≤ ~6 segments. Not a pie: a pie
// makes close values indistinguishable, and a two-slice pie is a stat tile
// wearing a costume.

import { useState } from "react";

import ChartFrame, { NoData } from "./ChartFrame";
import { barPath } from "./geometry";
import { GAP, RADIUS, chartInk } from "./tokens";

const W = 760;

export default function StackedBar({
  segments = [],
  title,
  caption,
  emptyMessage,
  height = 150,
  barY = 26,
  barH = 56,
  formatValue = (v) => String(v),
  legend = null,
}) {
  const [tip, setTip] = useState(null);
  const ink = chartInk();

  const shown = segments.filter((s) => (s.value ?? 0) > 0);
  const total = shown.reduce((sum, s) => sum + s.value, 0);
  if (!total) return <NoData message={emptyMessage} />;

  // reduce rather than a running `let`: the compiler rejects reassigning a
  // variable across a render, and each segment's x is just the sum of the
  // widths before it.
  const laid = shown.reduce((acc, seg) => {
    const width = (seg.value / total) * W;
    const prev = acc[acc.length - 1];
    acc.push({
      ...seg,
      x: prev ? prev.x + prev.width : 0,
      width,
      share: seg.value / total,
    });
    return acc;
  }, []);

  return (
    <ChartFrame
      viewBox={[W, height]}
      title={title}
      caption={caption}
      tip={tip}
      legend={legend}
    >
      {laid.map((seg, i) => {
        const isLast = i === laid.length - 1;
        // Trim a surface gap off every segment but the last, so adjacent
        // fills are separated by the background rather than by a border.
        const drawWidth = Math.max(1, seg.width - (isLast ? 0 : GAP));
        return (
          <g key={seg.key}>
            <path
              d={barPath(seg.x, barY, drawWidth, barH, i === 0 || isLast ? RADIUS : 0)}
              fill={seg.color}
              onMouseEnter={() =>
                setTip({
                  x: seg.x + drawWidth / 2,
                  y: barY,
                  title: seg.label,
                  lines: [
                    `${formatValue(seg.value)} of ${formatValue(total)} (${Math.round(seg.share * 100)}%)`,
                    ...(seg.blurb ? [seg.blurb] : []),
                  ],
                })
              }
              onMouseLeave={() => setTip(null)}
              style={{ cursor: "pointer" }}
            />
            {/* Direct-label only where the segment is genuinely wide enough to
                hold the text — otherwise the legend and tooltip carry it. */}
            {drawWidth > 34 && (
              <text
                x={seg.x + drawWidth / 2} y={barY + barH / 2 + 6}
                textAnchor="middle" fontSize="17" fontWeight="700" fill={ink.ink}
              >
                {seg.value}
              </text>
            )}
            {drawWidth > 96 && (
              <>
                <text
                  x={seg.x + drawWidth / 2} y={barY + barH + 20}
                  textAnchor="middle" fontSize="11" fontWeight="600" fill={ink.muted}
                >
                  {seg.label}
                </text>
                <text
                  x={seg.x + drawWidth / 2} y={barY + barH + 34}
                  textAnchor="middle" fontSize="10" fill={ink.axis}
                >
                  {Math.round(seg.share * 100)}% of the group
                </text>
              </>
            )}
          </g>
        );
      })}
    </ChartFrame>
  );
}
