// charts/Meter.jsx — one ratio against a limit.
//
// The right form for "collected against billed" or "attendance against
// target": a single quantity measured on a track it cannot exceed. Not a
// two-slice pie, and not a one-bar bar chart.
//
// The track and the fill are the same hue at two steps, so the fill reads as
// a portion of the track rather than as a separate category.

import { chartInk } from "./tokens";

export default function Meter({
  value,
  max,
  label,
  valueText,
  targetText,
  color,
  className = "",
}) {
  const ink = chartInk();
  const safeMax = max > 0 ? max : 0;
  const ratio = safeMax ? Math.min(1, Math.max(0, value / safeMax)) : 0;
  const pct = Math.round(ratio * 100);

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-neutral-700">{label}</span>
        <span className="text-xs tabular-nums text-neutral-600">
          <span className="font-bold text-neutral-900">{valueText}</span>
          {targetText && <> of {targetText}</>}
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full"
        style={{ background: ink.grid }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        // The percentage alone ("62") is meaningless read aloud; the label and
        // the actual figures are what make it an assertion.
        aria-label={`${label}: ${valueText}${targetText ? ` of ${targetText}` : ""} (${pct}%)`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%`, background: color || ink.bar }}
        />
      </div>
    </div>
  );
}
