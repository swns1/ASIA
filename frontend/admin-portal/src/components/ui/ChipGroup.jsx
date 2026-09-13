import { motion } from "framer-motion";

// ChipGroup — the row of pill filters used for status/level/sex facets.
//
// Consolidates the `.chip-btn` rules from AppLayout's injected <style> block,
// the per-page copies in StudentsPage/InvoicesPage/UsersPage, and — as of the
// filter-bar centralization — EnrollmentsPage's hand-rolled motion.button chip
// rows (school year / school level / grade level / status), which had the
// spring-driven recolor-in-place feel this component now provides by default.
//
// Colors animate via Framer Motion's `animate` prop (backgroundColor / color /
// borderColor) instead of a CSS transition, so a chip recolors in place with
// no re-mount and no layout pop — `layout` absorbs any width change from a
// spring instead of a snap. This intentionally reverses the old "don't mix
// framer-motion animate with CSS transitions" rule: that guidance predates
// this design and was about accidentally combining the two on the *same*
// property, which is avoided here by animating color exclusively through
// `animate`, never through a CSS transition on the same button.
//
// Deliberately no hover state: a `whileHover` color here previously got stuck
// on chips the cursor had merely passed over, because `layout` shifts each
// button's position as siblings resize, so the pointer can end up "hovering"
// a chip after the click landed elsewhere. Matches EnrollmentsPage's chips,
// which never had hover styling either.

const SPRING_TRANSITION = {
  layout: { type: "spring", stiffness: 400, damping: 36 },
  duration: 0.18,
  ease: "easeOut",
};

// Per-tone colors resolved to literal values (not Tailwind classes) because
// they're consumed by Framer Motion's `animate` prop, which interpolates real
// style values — Tailwind's static class extraction doesn't apply here, but
// the values themselves are still the tokens.css palette, not new hex.
// `badge` is the tone's `--color-*-dot` — the softer indicator colour, which
// is what EnrollmentsPage fills its count badge with (its "Enrolled" badge is
// #4caf50, the success dot, not the darker #2e6b0d border). Using the border
// colour instead reads as a harsh, mismatched block against the pale chip.
const TONES = {
  brand:   { bg: "#fff0f0", color: "#c92a2a", border: "#e03131", badge: "#e03131" },
  success: { bg: "#e8f5e0", color: "#2e6b0d", border: "#2e6b0d", badge: "#4caf50" },
  warning: { bg: "#faeeda", color: "#854f0b", border: "#854f0b", badge: "#ff9800" },
  error:   { bg: "#fde8e8", color: "#9b2020", border: "#9b2020", badge: "#f44336" },
  info:    { bg: "#e3f0fd", color: "#1455a0", border: "#1455a0", badge: "#2196f3" },
  muted:   { bg: "#f0ede8", color: "#5c5752", border: "#5c5752", badge: "#9e9e9e" },
  accent:  { bg: "#f0e8fd", color: "#7c3aed", border: "#7c3aed", badge: "#a855f7" },

  // Categorical school-level tones (--color-<level>-50 / -500 in tokens.css).
  // These distinguish levels from one another; they carry no status meaning.
  nursery:      { bg: "#fdf5e8", color: "#854f0b", border: "#854f0b", badge: "#854f0b" },
  kindergarten: { bg: "#f0e8fd", color: "#7c3aed", border: "#7c3aed", badge: "#7c3aed" },
  elementary:   { bg: "#e8f0fd", color: "#2563eb", border: "#2563eb", badge: "#2563eb" },
  juniorhigh:   { bg: "#e8fdf0", color: "#2e6b0d", border: "#2e6b0d", badge: "#2e6b0d" },
  seniorhigh:   { bg: "#fde8f8", color: "#be185d", border: "#be185d", badge: "#be185d" },
};

const REST = { bg: "#ffffff", color: "#855c5c", border: "#f0e4e4" };
const REST_DOT = "#c0b0b0";

export default function ChipGroup({
  options = [],
  value,
  onChange,
  label,
  size = "md",
  // `stagger` fades the chips in one after another instead of showing them
  // all at once. Used where a row's contents are swapped out as a set — the
  // Grade Level chips re-render whenever the School Level above them changes,
  // and cascading them in makes that read as a deliberate reveal.
  stagger = false,
  // Changing `generation` remounts every chip, which replays the stagger.
  // Without it the chips would animate in once and then swap silently, since
  // React reuses elements whose keys match.
  generation = "",
  className = "",
}) {
  // "md" text is 12px, matching EnrollmentsPage's original chips exactly —
  // that value sits between the text-xs (11px) and text-sm (12.5px) tokens,
  // so it's set explicitly rather than forced onto the nearest token step.
  const sizeClass = size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-3.5 text-[12px]";

  return (
    <motion.div
      layout
      role="group"
      aria-label={label}
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
    >
      {options.map((opt, idx) => {
        const selected = opt.value === value;
        const tone = TONES[opt.tone] ?? TONES.brand;
        return (
          <motion.button
            key={generation ? `${generation}-${opt.value}` : opt.value}
            type="button"
            layout
            initial={
              stagger
                ? { opacity: 0, y: 6, backgroundColor: REST.bg, color: REST.color, borderColor: REST.border }
                : false
            }
            animate={{
              ...(stagger ? { opacity: 1, y: 0 } : null),
              backgroundColor: selected ? tone.bg : REST.bg,
              color: selected ? tone.color : REST.color,
              borderColor: selected ? tone.border : REST.border,
            }}
            transition={
              stagger
                ? {
                    opacity: { duration: 0.16, ease: "easeOut", delay: idx * 0.03 },
                    y: { duration: 0.16, ease: "easeOut", delay: idx * 0.03 },
                    backgroundColor: { duration: 0.18, ease: "easeOut" },
                    color: { duration: 0.18, ease: "easeOut" },
                    borderColor: { duration: 0.18, ease: "easeOut" },
                    layout: SPRING_TRANSITION.layout,
                  }
                : SPRING_TRANSITION
            }
            onClick={() => onChange?.(opt.value)}
            aria-pressed={selected}
            className={[
              "focus-ring inline-flex items-center gap-1.5 rounded-full border-[1.5px] font-semibold",
              sizeClass,
            ].join(" ")}
          >
            {opt.dot && (
              <motion.span
                animate={{ background: selected ? opt.dot : REST_DOT }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
              />
            )}
            {opt.icon && <i className={`ti ${opt.icon} text-[13px]`} aria-hidden="true" />}
            {opt.label}
            {/* Only the selected chip carries its count. The badge appearing
                and disappearing is what changes the chip's width, which the
                `layout` springs above turn into the neighbours easing aside —
                showing every count at rest would freeze that motion. */}
            {selected && opt.count != null && (
              <span
                className="ml-0.5 inline-block shrink-0 whitespace-nowrap rounded-full px-[7px] py-px text-[10px] font-bold text-white"
                style={{ background: opt.dot ?? tone.badge }}
              >
                {opt.count}
              </span>
            )}
          </motion.button>
        );
      })}
    </motion.div>
  );
}
