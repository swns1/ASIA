// brandPanel.js — controls that sit on the dark brand panel.
//
// In dark mode a page's lead block becomes the login page's brand panel
// (Card's `brandPanel`). A field or secondary button on it turns to glass,
// like the chips on the login page: white at a low opacity, so the panel's
// dot grid and glow show through. Every class carries `dark:`, so the same
// control on a light page is unchanged. Pass as `className`; the variants
// win over the control's own colours by coming later in the stylesheet.

/** A text field (FormField's Input) on the panel. */
export const GLASS_FIELD =
  "dark:border-white/[0.14] dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/55 " +
  "dark:hover:border-white/30 dark:focus:border-white/40 dark:focus:bg-white/[0.08]";

/** A SearchField on the panel. Its border and fill sit on the wrapper, not
 *  the input, so it takes focus-within where GLASS_FIELD takes focus; its
 *  text and icon tokens already read light on the panel. */
export const GLASS_SEARCH =
  "dark:border-white/[0.14] dark:bg-white/[0.06] " +
  "dark:hover:border-white/30 dark:focus-within:border-white/40 dark:focus-within:bg-white/[0.08]";

/** A secondary Button on the panel. */
export const GLASS_BUTTON =
  "dark:border-white/[0.16] dark:bg-white/[0.08] dark:text-white " +
  "dark:hover:border-white/30 dark:hover:bg-white/[0.14] dark:hover:text-white";
