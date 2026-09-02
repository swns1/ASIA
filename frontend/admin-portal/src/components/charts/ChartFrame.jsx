// charts/ChartFrame.jsx — the shell every chart in the app draws inside.
//
// Extracted from RiskCharts.jsx (ChartFrame / ChartTooltip / NoData) so the
// dashboard draws on the same surface, with the same tooltip behaviour and the
// same empty state, rather than a second look invented alongside it.

import { SURFACE } from "./tokens";

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
      className="pointer-events-none absolute z-10 w-max max-w-[240px] rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-xs shadow-lg"
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
 */
export default function ChartFrame({
  viewBox,
  title,
  children,
  tip,
  caption,
  height = "auto",
  legend = null,
}) {
  return (
    <div>
      {legend}
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${viewBox[0]} ${viewBox[1]}`}
          className="w-full"
          style={{ background: SURFACE, borderRadius: 10, height }}
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
