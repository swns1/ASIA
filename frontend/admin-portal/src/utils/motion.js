export const pageVariants = {
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.07 } },
  },
  item: {
    hidden:  { y: 14, opacity: 0 },
    visible: { y: 0,  opacity: 1, transition: { duration: 0.32, ease: "easeOut" } },
  },
};

export const listVariants = {
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.04 } },
  },
  item: {
    hidden:  { x: -8, opacity: 0 },
    visible: { x: 0,  opacity: 1, transition: { duration: 0.22, ease: "easeOut" } },
  },
};

export const modalVariants = {
  hidden:  { scale: 0.94, opacity: 0, y: 12 },
  visible: { scale: 1,    opacity: 1, y: 0  },
  exit:    { scale: 0.94, opacity: 0, y: 12 },
};

export const springTransition = { type: "spring", stiffness: 340, damping: 28 };

// ── Charts ───────────────────────────────────────────────────────────────────
//
// A chart animates ONCE, as it arrives. It must not replay on every filter
// change: re-drawing the same marks each time a dropdown moves makes the data
// feel unstable, and it puts a half-second delay between the reader's action
// and the answer. In practice this falls out of leaving the variant on
// "visible" — framer-motion replays only when the variant changes or the
// component remounts, so mark keys must stay tied to the series identity
// (`seg.key`, `row.key`) and never to a value that changes with the data.
//
// Reduced motion is NOT handled here. It is handled once, globally, by
// <MotionConfig reducedMotion="user"> in App.jsx, which disables transform
// animations across every motion component in the app. Guarding it per-variant
// would be four more places to forget.

export const chartVariants = {
  container: {
    hidden: {},
    // Series enter in order rather than together, so a stacked bar reads as
    // accumulating left to right instead of appearing whole.
    visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
  },

  // Bars grow from their baseline, not from their centre — the baseline is
  // what the length is measured from, so growing from anywhere else animates a
  // quantity the chart never claims. Pair with
  // `style={{ transformBox: "fill-box", transformOrigin: "left center" }}`
  // so each mark scales from its own left edge rather than the SVG origin.
  bar: {
    hidden:  { scaleX: 0, opacity: 0.4 },
    visible: { scaleX: 1, opacity: 1, transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] } },
  },

  // `pathLength` is a framer-motion special: it normalises the path's own
  // length to 0-1, so a line draws itself end to end regardless of geometry.
  line: {
    hidden:  { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: { pathLength: { duration: 0.55, ease: "easeOut" }, opacity: { duration: 0.15 } },
    },
  },
};
