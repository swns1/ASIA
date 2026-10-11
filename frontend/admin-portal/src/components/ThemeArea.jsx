import { PageGlow } from "./ui/BrandBackdrop";
import { ThemeContext, usePageTheme } from "../hooks/useTheme";

// ThemeArea — the page area's dark mode, for a page outside the staff shell.
//
// AppLayout themes the pages inside it. The focused full-page forms (new or
// edit student, new or edit enrollment) render no shell, so they wrap
// themselves in this instead, in place of their root element:
//
//   <ThemeArea className="min-h-screen bg-neutral-50">…</ThemeArea>
//
// Dark only for an admin who chose it, and only once the route is listed in
// constants/darkReady.js, exactly as in the shell. The page glow is fixed to
// the window, so it holds still while the form scrolls, as it does behind a
// shell page.
//
// `isolate` keeps the glow (at -z-10) above the root's own background and
// behind its content. It's on in light too, so the element is the same in
// both themes and switching never remounts a half-filled form.
export default function ThemeArea({ className = "", children }) {
  const theme = usePageTheme();
  const dark = theme === "dark";
  return (
    <div data-theme={dark ? "dark" : undefined} className={`isolate ${className}`}>
      {dark && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
          <PageGlow />
        </div>
      )}
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </div>
  );
}
