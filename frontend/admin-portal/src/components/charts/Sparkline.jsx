// charts/Sparkline.jsx — the trend line inside a stat tile.
//
// A stat tile's job is one current value; the sparkline adds "and here is how
// it got there" without spending a whole chart on it. Deliberately axis-less,
// label-less and legend-less: at this size any of those would be unreadable,
// and the tile's own number and delta already carry the magnitude.
//
// This is the right answer to "turn that number into a graph" for a single
// value. A one-bar bar chart is not.

import { linePath } from "./geometry";
import { chartInk, STROKE } from "./tokens";

export default function Sparkline({
  values = [],
  width = 88,
  height = 24,
  color,
  className = "",
}) {
  const ink = chartInk();
  const stroke = color || ink.bar;

  // Two points is the minimum that can express a direction; one point is a
  // dot claiming to be a trend, so render nothing and let the tile stand
  // alone rather than implying history that isn't there.
  const usable = values.filter((v) => v != null && !Number.isNaN(v));
  if (usable.length < 2) return null;

  const min = Math.min(...usable);
  const max = Math.max(...usable);
  // A flat series would divide by zero and collapse onto the baseline; a
  // 1-unit span centres it instead, which is the honest picture of "no change".
  const span = max - min || 1;

  const pad = STROKE;
  const stepX = (width - pad * 2) / (values.length - 1);

  const points = values.map((v, i) =>
    v == null || Number.isNaN(v)
      ? null
      : {
          x: pad + i * stepX,
          y: pad + (1 - (v - min) / span) * (height - pad * 2),
        }
  );

  const subpaths = linePath(points);
  const last = [...points].reverse().find(Boolean);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      // Decorative: the tile's value and delta already state the trend in
      // text, so announcing a nameless graphic here would only add noise.
      aria-hidden="true"
      focusable="false"
    >
      {subpaths.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* The current end of the series, so the eye lands on "now". */}
      {last && <circle cx={last.x} cy={last.y} r={STROKE} fill={stroke} />}
    </svg>
  );
}
