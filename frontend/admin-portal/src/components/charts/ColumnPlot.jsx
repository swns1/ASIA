import { useState } from "react";

import ChartFrame from "./ChartFrame";
import { chartInk } from "./tokens";
import useTheme from "../../hooks/useTheme";
import useElementSize from "./useElementSize";

// charts/ColumnPlot.jsx — a plot with a value axis up the left and a row of
// slots across (years, steps, months, weeks), each slot's label underneath.
// Compare School Years draws its columns and rate lines on it; the admin home
// its collection pace and attendance lines.
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
//   left   the plot's left edge        width, height   the whole drawing
//
// `overlay`, the same kind of function, draws HTML over the plot -- for an
// annotation that wants a border and an icon, which SVG text can't carry.
//
// `labels` are { key, label, sub?, span?, muted? }. `span` lets one label
// cover several slots (a month over its weeks); with `labelStyle="ranges"`
// each label sits at the left of its span with a tick, rather than centred.

const PAD_B = 6;        // the lowest value label sits centred on the baseline
const FALLBACK_W = 480; // until measured -- and in jsdom, which can't measure

export default function ColumnPlot({
  title,
  legend = null,
  axis,
  formatTick,
  labels,
  labelStyle = "centered",
  // Room above the top gridline for the figures over the tallest mark.
  padTop = 18,
  plotHeight = 200,
  // The value labels, left of the plot.
  gutter = 48,
  overlay,
  children,
}) {
  const [plotEl, setPlotEl] = useState(null);
  const measured = useElementSize(plotEl);
  const ink = chartInk(useTheme());

  const width = measured?.width ?? FALLBACK_W;
  const height = padTop + plotHeight + PAD_B;
  const slots = labels.reduce((sum, l) => sum + (l.span ?? 1), 0);
  const slotW = (width - gutter) / Math.max(1, slots);
  const geo = {
    slotW,
    width,
    height,
    left: gutter,
    base: padTop + plotHeight,
    x: (i) => gutter + (i + 0.5) * slotW,
    y: (v) => padTop + (1 - axis.at(v)) * plotHeight,
  };
  const ranges = labelStyle === "ranges";

  return (
    <div>
      {legend}
      <div className="relative">
        <ChartFrame viewBox={[width, height]} title={title} fill minPlotHeight={height} plotRef={setPlotEl}>
          {axis.ticks.map((t) => (
            <g key={t}>
              <line x1={gutter} x2={width} y1={geo.y(t)} y2={geo.y(t)} stroke={ink.grid} shapeRendering="crispEdges" />
              <text
                x={gutter - 8} y={geo.y(t)} dy="0.35em"
                textAnchor="end" fontSize="10.5" fill={ink.axis}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatTick(t)}
              </text>
            </g>
          ))}
          {children(geo)}
        </ChartFrame>
        {/* Placed in percentages of the drawing, so it stays on its marks
            even in the frame before the plot is measured. */}
        {overlay && <div className="pointer-events-none absolute inset-0">{overlay(geo)}</div>}
      </div>
      {/* The plot is an image with a name; its labels would only repeat it. */}
      <div className={ranges ? "mt-2 flex" : "mt-0.5 flex"} style={{ marginLeft: gutter }} aria-hidden="true">
        {labels.map((l) => (
          <div
            key={l.key}
            style={{ flex: `${l.span ?? 1} 1 0` }}
            className={
              ranges
                ? "min-w-0 border-l border-neutral-300 pl-1.5"
                : "min-w-0 px-0.5 text-center break-words hyphens-auto"
            }
          >
            <div className={`text-[11px] font-semibold ${l.muted ? "text-neutral-500" : "text-neutral-800"}`}>{l.label}</div>
            {l.sub && <div className="text-[10.5px] text-neutral-500">{l.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
