import BrandBackdrop from "./BrandBackdrop";
import { STATUS_DOT } from "../../constants/statusTones";

// StatusBand — a list page's status mix, and its status filter.
//
// Students and Enrollments each had five stat tiles over a row of Status
// chips: the same filter set from two places, and on Enrollments the tiles
// didn't add up to the total once anyone transferred out. The band shows the
// whole mix as one bar, and its legend is the filter, so the numbers and the
// control are the same thing.
//
//   <StatusBand
//     total={counts.all} caption="students registered"
//     options={[{ value: "all", label: "All", count: 551 },
//               { value: "active", label: "Active", count: 474, variant: "success" }, …]}
//     value={status} allValue="all" onChange={setStatus}
//   />
//
// `options` lists "all" first, then each status with its Badge variant
// (statusMaps.js), which picks its dot colour. A count left undefined reads as
// "—" and draws no segment, which is how the band shows counts still loading.

const fmt = (n) => (n == null ? "—" : n.toLocaleString());

export default function StatusBand({
  total,
  caption,
  // Top right: the hint on Students, the school year menu on Enrollments.
  aside,
  options,
  value,
  allValue = "",
  onChange,
  label = "Filter by status",
}) {
  // A status with nobody in it gets no segment rather than a 6px sliver,
  // which would claim there was someone.
  const segments = options.filter((o) => o.value !== allValue && o.count > 0);
  const showingAll = value === allValue;

  return (
    // z-20 so a menu opening from `aside` draws over the notices and toolbar
    // below, which are later in the page and would otherwise paint on top.
    <section
      aria-label="Status summary"
      className="relative isolate z-20 flex flex-col gap-4 rounded-2xl bg-brand-950 px-6 py-[22px] shadow-lg"
    >
      <BrandBackdrop />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-3xl font-bold leading-none tracking-[-0.02em] text-white tabular-nums">
            {fmt(total)}
          </span>
          <span className="text-base text-brand-300">{caption}</span>
        </div>
        {aside}
      </div>

      {/* Decorative: the legend below states every number the bar draws. */}
      <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full bg-white/6" aria-hidden="true">
        {segments.map((o) => (
          <span
            key={o.value}
            className={`transition-opacity duration-[180ms] ${STATUS_DOT[o.variant] ?? STATUS_DOT.muted} ${
              showingAll || value === o.value ? "opacity-100" : "opacity-[0.28]"
            }`}
            style={{ flexGrow: o.count, flexBasis: 0, minWidth: 6 }}
          />
        ))}
      </div>

      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const isAll = o.value === allValue;
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={selected}
              // Picking the selected status again goes back to everyone, as
              // the stat tiles did.
              onClick={() => onChange(selected && !isAll ? allValue : o.value)}
              className={`focus-ring inline-flex h-[34px] items-center gap-2 rounded-full border-[1.5px] px-3.5 text-[12.5px] font-semibold text-neutral-50 transition-colors duration-150 ${
                selected ? "border-brand-300 bg-white/12" : "border-white/16 bg-transparent hover:border-white/30"
              }`}
            >
              {!isAll && (
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[o.variant] ?? STATUS_DOT.muted}`}
                  aria-hidden="true"
                />
              )}
              {/* The space keeps the name "Active 1,102", not "Active1,102";
                  a flex row doesn't draw it. */}
              {o.label}{" "}
              <span className="font-bold text-white tabular-nums">{fmt(o.count)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
