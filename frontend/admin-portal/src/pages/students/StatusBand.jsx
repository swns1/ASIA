import BrandBackdrop from "../../components/ui/BrandBackdrop";
import { STUDENT_STATUS_MAP, fallbackStatus } from "../../constants/statusMaps";

// The Students page's status band, and the status cell its rows use.
//
// The band replaced five stat tiles and a row of Status chips that set the
// same filter from two places. It shows the status mix as one bar, and its
// legend is the status filter, so the counts and the control are one thing.
//
// Both pieces live here because they draw a status the same way: the
// saturated dot from tokens.css, keyed by the status's Badge variant. Literal
// class strings, since Tailwind can't see an interpolated `bg-${variant}-dot`.
const TONE = {
  success: { dot: "bg-success-dot", text: "text-success-500" },
  warning: { dot: "bg-warning-dot", text: "text-warning-500" },
  error:   { dot: "bg-error-dot",   text: "text-error-500" },
  info:    { dot: "bg-info-dot",    text: "text-info-500" },
  muted:   { dot: "bg-muted-dot",   text: "text-muted-500" },
};

const statusMeta = (status) => STUDENT_STATUS_MAP[status] ?? fallbackStatus(status);
const toneOf = (status) => TONE[statusMeta(status).variant] ?? TONE.muted;

/** A row's status: a dot and the label. The label carries the meaning; the
 *  dot only matches it to the band. */
export function StudentStatus({ status }) {
  const tone = toneOf(status);
  return (
    <span className={`inline-flex items-center gap-[7px] text-sm font-semibold ${tone.text}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
      {statusMeta(status).label}
    </span>
  );
}

/**
 * @param {string[]} statuses  filter values in display order, "all" first
 * @param {Record<string, number>} counts  per-status totals; empty while loading
 * @param {string} value  the selected status, or "all"
 * @param {(status: string) => void} onChange
 */
export default function StatusBand({ statuses, counts, value, onChange }) {
  const segments = statuses.filter((s) => s !== "all");
  // One empty track until there's something to divide: while the counts load,
  // if they failed, or when there are no students at all.
  const hasMix = counts.all > 0;
  const fmt = (n) => (n === undefined ? "—" : n.toLocaleString());

  return (
    // The login page's brand panel, glow and all, so the band reads as the
    // brand's dark red rather than a black slab.
    <section
      aria-label="Students by status"
      className="relative isolate flex flex-col gap-4 overflow-hidden rounded-2xl bg-brand-950 px-6 py-[22px] shadow-lg"
    >
      <BrandBackdrop />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold leading-none tracking-[-0.02em] text-white tabular-nums">
            {fmt(counts.all)}
          </span>
          <span className="text-base text-brand-300">students registered</span>
        </div>
        <span className="hidden text-sm text-brand-border sm:block">
          Pick a status to filter the list
        </span>
      </div>

      {/* Decorative: the legend below states every number the bar draws. */}
      <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
        {hasMix ? (
          segments.map((s) => (
            <span
              key={s}
              className={`transition-opacity duration-[180ms] ${toneOf(s).dot} ${
                value === "all" || value === s ? "opacity-100" : "opacity-[0.28]"
              }`}
              style={{ flexGrow: counts[s] ?? 0, flexBasis: 0, minWidth: 6 }}
            />
          ))
        ) : (
          <span className="flex-1 bg-white/10" />
        )}
      </div>

      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {statuses.map((s) => {
          const selected = value === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={selected}
              // Picking the selected status again goes back to everyone, as
              // the stat tiles did.
              onClick={() => onChange(selected ? "all" : s)}
              className={`focus-ring inline-flex h-[34px] items-center gap-2 rounded-full border-[1.5px] px-3.5 text-[12.5px] font-semibold text-neutral-50 transition-colors duration-150 ${
                selected ? "border-brand-300 bg-white/12" : "border-white/16 bg-transparent hover:border-white/30"
              }`}
            >
              {s !== "all" && (
                <span className={`h-2 w-2 shrink-0 rounded-full ${toneOf(s).dot}`} aria-hidden="true" />
              )}
              {/* The space keeps the name "Active 1,102", not "Active1,102";
                  a flex row doesn't draw it. */}
              {s === "all" ? "All" : statusMeta(s).label}{" "}
              <span className="font-bold text-white tabular-nums">{fmt(counts[s])}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
