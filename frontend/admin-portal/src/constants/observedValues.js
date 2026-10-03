// The Report on Learner's Observed Values marks (DepEd Order 8, s. 2015) --
// the ratings a teacher gives each behaviour area, and the marks SF9 prints.
//
// The entry screens used to offer the app's original three words (Outstanding /
// Satisfactory / Needs Improvement) while every rating the school actually
// holds is one of these four marks. A saved "SO" matched none of the three, so
// the Grades page lit no button and My Sections showed "—" for every rated
// student: the ratings looked missing, and "Not Observed" couldn't be entered
// at all. One list here keeps the two entry screens and SF9 on the same marks.
//
// Colours are the status pairs from styles/tokens.css (info, success,
// warning, error), as literals because these screens style inline.

export const OBSERVED_VALUES = [
  { value: "AO", label: "Always Observed", color: "#1455a0", bg: "#e3f0fd" },
  { value: "SO", label: "Sometimes Observed", color: "#2e6b0d", bg: "#e8f5e0" },
  { value: "RO", label: "Rarely Observed", color: "#854f0b", bg: "#faeeda" },
  { value: "NO", label: "Not Observed", color: "#9b2020", bg: "#fde8e8" },
];

// Rows saved before the switch keep their old word. Each reads as the mark
// SF9 has always printed for it, so the screen and the printed form agree;
// saving the row again stores the mark. Four marks onto three words is lossy
// the other way, so nothing rewrites the old rows on its own.
const LEGACY_RATINGS = {
  outstanding: "AO",
  satisfactory: "SO",
  needs_improvement: "RO",
};

/** The DepEd mark for any stored rating, or null when there is none. */
export function observedMark(rating) {
  if (!rating) return null;
  return LEGACY_RATINGS[rating] ?? rating;
}

/** The mark's display entry (label and colours), or null. */
export function observedValueMeta(rating) {
  const mark = observedMark(rating);
  return OBSERVED_VALUES.find((v) => v.value === mark) ?? null;
}
