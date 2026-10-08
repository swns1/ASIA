// Deterministic avatar colours from a name.
//
// StudentsPage, StudentDetailPage and DashboardPage each had their own copy of
// this idea with different palette lengths, so the same student could appear in
// two different colours on two screens. One palette, one function.
//
// The seven pairs live in styles/tokens.css (--avatar-N-bg / --avatar-N-fg),
// with a dark value for each, so an avatar follows the theme of the page it
// is drawn on. They are returned as var() references for inline styles.

const PALETTES = Array.from({ length: 7 }, (_, i) => ({
  bg: `var(--avatar-${i + 1}-bg)`,
  color: `var(--avatar-${i + 1}-fg)`,
}));

/**
 * @param {string} name  any stable identifier for the person
 * @returns {{bg: string, color: string}} tinted background + AA-contrast text,
 *   as CSS var() references
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
