import { useEffect, useId, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import BrandBackdrop from "./BrandBackdrop";
import { STATUS_DOT } from "../../constants/statusTones";
import useBandTone, { BandToneContext } from "../../hooks/useBandTone";
import { springTransition } from "../../utils/motion";

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
// (statusMaps.js), which picks its dot colour. A band split by categories
// instead (payment methods) gives each option a literal `dot` class from
// statusTones.SERIES_DOT. A count left undefined reads as "—" and draws no
// segment, which is how the band shows counts still loading. `format` writes
// the numbers, for a band that counts money.
//
// The band is a white card by default. `tone` forces "light" or "dark" (the
// brand panel); left out, it follows hooks/useBandTone, a developer switch.
//
// Motion, each a response to something the reader did:
//  - the selected chip's highlight slides to the chip picked;
//  - pointing at a chip previews its share of the bar, and pointing at the
//    bar marks its chip;
//  - the bar shimmers while counts load, then fills left to right, once;
//  - when the counts change (a new year, a filter), the segments resize and
//    the numbers roll to their new values rather than jumping.
// The OS "reduce motion" setting turns all of it off.

// Every class string is a complete literal, as Tailwind needs.
const TONES = {
  light: {
    panel: "border border-neutral-200 bg-white shadow-sm",
    total: "text-neutral-900",
    caption: "text-neutral-600",
    hint: "text-neutral-500",
    track: "bg-neutral-200",
    shimmer:
      "bg-[linear-gradient(90deg,var(--color-neutral-200)_25%,var(--color-brand-border-soft)_50%,var(--color-neutral-200)_75%)]",
    // Chips are see-through so the highlight shows through as it slides
    // under them; the band behind is white either way.
    chip: "bg-transparent text-neutral-700 hover:border-brand-500",
    chipBorder: "border-neutral-300",
    chipMarked: "border-brand-500",
    chipOn: "border-transparent text-brand-600",
    highlight: "border-brand-500 bg-brand-100",
    count: "text-neutral-900",
    countOn: "text-brand-600",
  },
  dark: {
    panel: "bg-brand-950 shadow-lg",
    total: "text-white",
    caption: "text-brand-300",
    hint: "text-brand-border",
    track: "bg-white/6",
    shimmer:
      "bg-[linear-gradient(90deg,rgb(255_255_255/0.06)_25%,rgb(255_255_255/0.14)_50%,rgb(255_255_255/0.06)_75%)]",
    chip: "bg-transparent text-neutral-50 hover:border-white/30",
    chipBorder: "border-white/16",
    chipMarked: "border-white/30",
    chipOn: "border-transparent text-neutral-50",
    highlight: "border-brand-300 bg-white/12",
    count: "text-white",
    countOn: "text-white",
  },
};

// tokens.css --ease-out-soft, for framer-motion and inline transitions.
const EASE_OUT_SOFT = [0.16, 1, 0.3, 1];
const SEGMENT_TRANSITION = "flex-grow 520ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease";

const plain = (n) => (n == null ? "—" : n.toLocaleString());
const dotOf = (o) => o.dot ?? STATUS_DOT[o.variant] ?? STATUS_DOT.muted;

// A number that rolls to each new value instead of jumping: from 0 when it
// first arrives, then from wherever it was.
function RollingNumber({ value, format }) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(0);
  const last = useRef(null);

  useEffect(() => {
    if (value == null || reduceMotion) {
      last.current = value;
      return undefined;
    }
    const controls = animate(last.current ?? 0, value, {
      duration: 0.7,
      ease: EASE_OUT_SOFT,
      onUpdate: (n) => {
        last.current = n;
        setShown(n);
      },
    });
    return () => controls.stop();
  }, [value, reduceMotion]);

  if (value == null || reduceMotion) return format(value);
  return format(shown === value ? value : Math.round(shown));
}

export default function StatusBand({
  total,
  caption,
  // Top right: the school year menu on most pages.
  aside,
  // Top right instead of `aside`: a line of help ("Pick a role to filter the
  // list"), in the band's own hint colour. Hidden on a phone.
  hint,
  options,
  value,
  allValue = "",
  onChange,
  label = "Filter by status",
  format = plain,
  tone: toneProp,
}) {
  const storedTone = useBandTone();
  const tone = toneProp ?? storedTone;
  const t = TONES[tone] ?? TONES.light;
  const reduceMotion = useReducedMotion();
  // Scopes the sliding highlight to this band, for a page with two.
  const highlightId = `${useId()}-highlight`;
  // What the pointer is on, and whether that's a chip or the bar.
  const [pointed, setPointed] = useState(null);

  const fmt = (n) => (n == null ? "—" : format(n));
  // A status with nobody in it gets no segment rather than a 6px sliver,
  // which would claim there was someone.
  const segments = options.filter((o) => o.value !== allValue && o.count > 0);
  // No status counted yet: the counts are still on their way.
  const loading = !options.some((o) => o.value !== allValue && o.count != null);
  // The status the bar brings forward: the one pointed at, else the filter.
  const focus = pointed?.value ?? value;
  const showingAll = focus === allValue;

  // Mouse only: a tap would leave its "hover" behind on a touch screen.
  const point = (next) => (e) => {
    if (e.pointerType === "mouse") setPointed(next);
  };

  return (
    // z-20 so a menu opening from `aside` draws over the notices and toolbar
    // below, which are later in the page and would otherwise paint on top.
    <section
      aria-label="Status summary"
      className={`relative isolate z-20 flex flex-col gap-4 rounded-2xl px-6 py-[22px] ${t.panel}`}
    >
      <BrandBackdrop tone={tone} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className={`text-3xl font-bold leading-none tracking-[-0.02em] tabular-nums ${t.total}`}>
            <RollingNumber value={total} format={fmt} />
          </span>
          {/* Keyed on its text, so a new caption fades in. */}
          <motion.span
            key={caption}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={`text-base ${t.caption}`}
          >
            {caption}
          </motion.span>
        </div>
        <BandToneContext.Provider value={tone}>
          {aside ?? (hint && <span className={`hidden text-sm sm:block ${t.hint}`}>{hint}</span>)}
        </BandToneContext.Provider>
      </div>

      {/* Decorative: the legend below states every number the bar draws. */}
      <div
        className={`h-2.5 overflow-hidden rounded-full ${
          loading
            ? `${t.shimmer} bg-[length:200%_100%] animate-[shimmer_1.6s_ease-in-out_infinite] motion-reduce:animate-none`
            : t.track
        }`}
        aria-hidden="true"
      >
        {!loading && (
          // Mounts when the counts arrive, so the fill plays once, not on
          // every filter change.
          <motion.div
            className="flex h-full gap-[3px]"
            initial={reduceMotion ? false : { clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: "inset(0 0% 0 0)" }}
            transition={{ duration: 0.75, ease: EASE_OUT_SOFT }}
          >
            {segments.map((o) => (
              <span
                key={o.value}
                onPointerEnter={point({ value: o.value, from: "bar" })}
                onPointerLeave={point(null)}
                className={`${dotOf(o)} ${showingAll || focus === o.value ? "opacity-100" : "opacity-[0.28]"}`}
                style={{ flexGrow: o.count, flexBasis: 0, minWidth: 6, transition: SEGMENT_TRANSITION }}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* `isolate`, so the highlight (-z-10) sits under every chip in this
          row and nothing else on the page. */}
      <div role="group" aria-label={label} className="relative isolate flex flex-wrap gap-2">
        {options.map((o) => {
          const isAll = o.value === allValue;
          const selected = value === o.value;
          const marked = !selected && pointed?.from === "bar" && pointed.value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={selected}
              // The real count, while the one on screen may still be rolling.
              aria-label={`${o.label} ${fmt(o.count)}`}
              // Picking the selected status again goes back to everyone, as
              // the stat tiles did.
              onClick={() => onChange(selected && !isAll ? allValue : o.value)}
              onPointerEnter={point({ value: o.value, from: "chip" })}
              onPointerLeave={point(null)}
              className={`focus-ring relative inline-flex h-[34px] items-center gap-2 rounded-full border-[1.5px] px-3.5 text-[12.5px] font-semibold transition-colors duration-150 ${
                selected ? t.chipOn : `${t.chip} ${marked ? t.chipMarked : t.chipBorder}`
              }`}
            >
              {selected && (
                // One highlight per band: framer-motion moves it from the
                // old chip to the new one.
                <motion.span
                  layoutId={highlightId}
                  layoutDependency={value}
                  transition={springTransition}
                  className={`absolute -inset-[1.5px] -z-10 border-[1.5px] ${t.highlight}`}
                  // Inline, not rounded-full: framer-motion keeps a radius
                  // set in `style` round while it stretches the highlight.
                  style={{ borderRadius: 9999 }}
                  aria-hidden="true"
                />
              )}
              {!isAll && (
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${dotOf(o)}`}
                  aria-hidden="true"
                />
              )}
              {o.label}{" "}
              <span className={`font-bold tabular-nums ${selected ? t.countOn : t.count}`}>
                <RollingNumber value={o.count} format={fmt} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
