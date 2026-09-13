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

/**
 * Initials for the avatar bubble.
 *
 * Takes either split name parts — initialsFrom("Ana", "Dela Cruz") -> "AD" —
 * or a single full name, which several pages hold instead of separate fields:
 * initialsFrom("Ana Dela Cruz") -> "AD". Without the single-argument case a
 * full name yields just its first letter, since everything after the first
 * space would be ignored.
 */
export function initialsFrom(first = "", last = "") {
  if (!last) {
    const parts = String(first).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  const a = String(first).trim()[0] ?? "";
  const b = String(last).trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}
