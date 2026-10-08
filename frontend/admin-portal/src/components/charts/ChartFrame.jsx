// charts/ChartFrame.jsx — the shell every chart in the app draws inside.
//
// Extracted from RiskCharts.jsx (ChartFrame / ChartTooltip / NoData) so the
// dashboard draws on the same surface, with the same tooltip behaviour and the
// same empty state, rather than a second look invented alongside it.


/**
 * Tooltips are HTML rather than SVG text so they wrap, use real type tokens
 * and stay readable. The SVG fills its container at a fixed viewBox, so a
 * mark's position maps to a percentage of the container exactly.
 */
export function ChartTooltip({ tip, viewBox }) {
  if (!tip) return null;
  const [w, h] = viewBox;
  // Flip near the edges so the tooltip never leaves the plot.
  const flipX = tip.x > w * 0.62;
  const flipY = tip.y < h * 0.24;
  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-[240px] rounded-md border border-neutral-200 bg-surface-raised px-2.5 py-2 text-xs shadow-lg dark:shadow-float-dark"
      style={{
        left: `${(tip.x / w) * 100}%`,
        top: `${(tip.y / h) * 100}%`,
        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "8px" : "calc(-100% - 8px)"})`,
      }}
      role="tooltip"
    >
      <div className="font-bold text-neutral-900">{tip.title}</div>
      {tip.lines.map((line) => (
        <div key={line} className="mt-0.5 text-neutral-600">
          {line}
        </div>
      ))}
    </div>
  );
}

export function NoData({ message = "Nothing to chart for this selection yet." }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-[10px] bg-neutral-50 px-6 text-center text-sm text-neutral-500">
      {message}
    </div>
  );
}

/**
 * `title` is the accessible name of the plot. A chart is an image to assistive
 * tech, and `role="img"` with no name is an unlabelled graphic — so it is
 * required rather than optional, and rendered into <title> inside the SVG.
 *
 * `caption` is the sentence under the chart that says what the reader should
 * take from it. Charts here are captioned rather than left to speak for
 * themselves, which is also what makes them legible when printed.
 *
 * `fill` makes the plot take whatever height its flex parent leaves it (never
 * less than `minPlotHeight`), instead of a height fixed by the viewBox's
 * aspect ratio -- so a chart can stretch to line its card up with the one
 * beside it. The chart then measures the plot through `plotRef` and draws in
 * pixels; see PairedColumnChart.
 */
export default function ChartFrame({
  viewBox,
  title,
  children,
  tip,
  caption,
  height = "auto",
  legend = null,
  fill = false,
  minPlotHeight,
  plotRef,
}) {
  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col" : undefined}>
      {legend}
      <div
        ref={plotRef}
        className={fill ? "relative w-full flex-1" : "relative w-full"}
        style={fill ? { minHeight: minPlotHeight } : undefined}
      >
        <svg
          viewBox={`0 0 ${viewBox[0]} ${viewBox[1]}`}
          // Out of the flow when filling, so the plot's height comes from the
          // layout alone and redrawing at the measured size can't feed back
          // into the size.
          className={fill ? "absolute inset-0 h-full w-full" : "w-full"}
          // tokens.css --chart-surface: the plain plane in light, the plane
          // with a faint red glow in dark.
          style={{ background: "var(--chart-surface)", borderRadius: 10, ...(fill ? {} : { height }) }}
          role="img"
        >
          {title && <title>{title}</title>}
          {children}
        </svg>
        <ChartTooltip tip={tip} viewBox={viewBox} />
      </div>
      {caption && <p className="mt-2 text-xs text-neutral-500">{caption}</p>}
    </div>
  );
}
