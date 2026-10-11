// darkSurfaces.js — the dark finish for hand-built surfaces.
//
// A page converting its own markup (a card, menu or dialog that isn't the
// shared component yet) appends one of these to the element's classes, so it
// lands on exactly what Card, FilterMenu, Modal and Pagination draw instead
// of an approximation. Every class carries `dark:`, so light mode is
// unchanged. The element's own light classes still need their tokens:
// `bg-surface` for a card, `bg-surface-raised` for a menu or dialog.

/** A card-like block on the page (a bordered surface): Card's faint top
 *  sheen and black elevation, in place of the red light shadow. */
export const CARD_DARK =
  "dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_60%)] dark:shadow-card-dark";

/** A menu, popover or dropdown panel, as FilterMenu's. */
export const MENU_DARK = "dark:shadow-float-dark";

/** A hand-built dialog body, as Modal draws its own. */
export const DIALOG_DARK = "dark:shadow-float-dark dark:ring-1 dark:ring-white/[0.06]";

/** The chosen option of a set (a view switch, a pill tab, a page number):
 *  Pagination's current page, lit with the brand's red gradient. Works over
 *  a tinted light state (bg-brand-100) and a solid one (bg-action) alike. */
export const SELECTED_DARK =
  "dark:border-[rgba(239,75,75,0.6)] dark:bg-brand-100 dark:bg-[linear-gradient(135deg,rgba(224,49,49,0.38),rgba(224,49,49,0.12))] dark:text-white";
