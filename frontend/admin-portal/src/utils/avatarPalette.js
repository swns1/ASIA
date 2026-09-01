// Deterministic avatar colours from a name.
//
// StudentsPage, StudentDetailPage and DashboardPage each had their own copy of
// this idea with different palette lengths, so the same student could appear in
// two different colours on two screens. One palette, one function.

const PALETTES = [
  { bg: "#fde8e8", color: "#a52f22" },
  { bg: "#e8f0fd", color: "#1d4ed8" },
  { bg: "#e8fdf0", color: "#15803d" },
  { bg: "#fdf5e8", color: "#b45309" },
  { bg: "#f0e8fd", color: "#6d28d9" },
  { bg: "#fde8f8", color: "#a3155f" },
  { bg: "#e8fdfd", color: "#0e7490" },
];

/**
 * @param {string} name  any stable identifier for the person
 * @returns {{bg: string, color: string}} tinted background + AA-contrast text
 */
export function getAvatarPalette(name = "") {
  if (!name) return PALETTES[0];
  // Sum the codepoints rather than using only the first character, so names
  // starting with the same letter don't all collide on one colour.
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return PALETTES[sum % PALETTES.length];
}

/** "Dela Cruz, Ana" -> "DC"-style initials for the avatar bubble. */
export function initialsFrom(first = "", last = "") {
  const a = String(first).trim()[0] ?? "";
  const b = String(last).trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}
