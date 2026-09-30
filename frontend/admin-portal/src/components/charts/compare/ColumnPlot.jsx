import { useState } from "react";

import ChartFrame from "../ChartFrame";
import { chartInk } from "../tokens";
import useElementSize from "../useElementSize";

// compare/ColumnPlot.jsx — the plot the Compare column and line charts draw
// on: a value axis up the left, one slot per year (or step) across, and each
// slot's label underneath.
//
// It draws inside ChartFrame at the size the card gives it, measured in
// pixels, so an 11px label is 11px in a wide card and in a narrow one; a
// scaled viewBox would set it anywhere from ~8px to ~14px. The slot labels
// are HTML under the plot rather than SVG text, so a long one ("Didn't
// re-enroll") wraps instead of running into its neighbour -- hyphenated, on
// a phone, where a single word can be wider than its slot.
//
// `children` is a function of the plot's geometry:
//   x(i)   the centre of slot i        slotW  one slot's width
//   y(v)   the height of value v       base   the bottom of the plot

const GUTTER = 48;      // the value labels, left of the plot
const PLOT_H = 200;
const PAD_B = 6;        // the lowest value label sits centred on the baseline
const FALLBACK_W = 480; // until measured -- and in jsdom, which can't measure

export default function ColumnPlot({
  title,
  legend = null,
  axis,
  formatTick,
  labels,
  // Room above the top gridline for the figures over the tallest mark.
  padTop = 18,
  children,
}) {
  const [plotEl, setPlotEl] = useState(null);
  const measured = useElementSize(plotEl);
  const ink = chartInk();

  const width = measured?.width ?? FALLBACK_W;
  const height = padTop + PLOT_H + PAD_B;
  const slotW = (width - GUTTER) / Math.max(1, labels.length);
  const geo = {
    slotW,
    base: padTop + PLOT_H,
    x: (i) => GUTTER + (i + 0.5) * slotW,
    y: (v) => padTop + (1 - axis.at(v)) * PLOT_H,
  };

  return (
    <div>
      <ChartFrame
        viewBox={[width, height]}
        title={title}
        legend={legend}
        fill
        minPlotHeight={height}
        plotRef={setPlotEl}
      >
        {axis.ticks.map((t) => (
          <g key={t}>
            <line x1={GUTTER} x2={width} y1={geo.y(t)} y2={geo.y(t)} stroke={ink.grid} shapeRendering="crispEdges" />
            <text
              x={GUTTER - 8} y={geo.y(t)} dy="0.35em"
              textAnchor="end" fontSize="10.5" fill={ink.axis}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatTick(t)}
            </text>
          </g>
        ))}
        {children(geo)}
      </ChartFrame>
      {/* The plot is an image with a name; its labels would only repeat it. */}
      <div className="mt-0.5 flex" style={{ marginLeft: GUTTER }} aria-hidden="true">
        {labels.map((l) => (
          <div key={l.key} className="min-w-0 flex-1 px-0.5 text-center break-words hyphens-auto">
            <div className="text-[11px] font-semibold text-neutral-800">{l.label}</div>
            {l.sub && <div className="text-[10.5px] text-neutral-500">{l.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
