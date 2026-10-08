import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import { PageGlow } from "./ui/BrandBackdrop";
import { useSchoolYear } from "../context/SchoolYearContext";
import { ThemeContext, useAppTheme } from "../hooks/useTheme";
import { isDarkReady } from "../constants/darkReady";

// AppLayout — the staff shell (sidebar + content column).
//
// It now mounts ONCE, from a layout route in App.jsx, instead of being wrapped
// individually inside all 21 staff pages. That means the sidebar, session timer
// and toast host survive navigation instead of unmounting on every route
// change, and no page can forget to include the shell.
//
// The <style> block this component used to inject at runtime has moved into
// index.css, and <Toaster> is now mounted once at the app root.

// Guards against a page that still wraps itself (or a new one written from an
// old page as a template): rather than drawing a second sidebar, the inner
// AppLayout renders straight through.
const InsideAppLayout = createContext(false);

const COLLAPSE_KEY = "sidebar_collapsed";

function readCollapsed() {
  try {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored !== null) return stored === "true";
  } catch {
    /* storage unavailable — fall through to the viewport default */
  }
  // Default to the icon rail on smaller laptops, full width on desktops.
  return typeof window !== "undefined" && window.innerWidth < 1280;
}

// `data-theme` for a container: present only when dark, so a light page is
// exactly what it was before dark mode existed.
const themeAttr = (theme) => (theme === "dark" ? "dark" : undefined);

export default function AppLayout({ children }) {
  const alreadyInside = useContext(InsideAppLayout);
  const { ensureYears } = useSchoolYear();
  const { pathname } = useLocation();

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Dark mode reaches the sidebar whenever it's on, but a page only once it
  // has been converted (constants/darkReady.js); the rest stay light.
  const appTheme = useAppTheme();
  const pageTheme = appTheme === "dark" && isDarkReady(pathname) ? "dark" : "light";

  // AppLayout is the first thing to mount once a user is actually
  // authenticated (SchoolYearProvider itself mounts before login, when there's
  // no token yet to fetch with) — retry here so the current year comes from
  // School Settings, and the pickers get the real year list, right after login.
  useEffect(() => {
    ensureYears();
  }, [ensureYears]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        /* preference just won't persist */
      }
      return next;
    });
  }

  if (alreadyInside) return children;

  return (
    <InsideAppLayout.Provider value={true}>
      <div className="flex h-screen overflow-hidden bg-neutral-50">
        {/* `contents`: the wrapper only carries the theme (to the sidebar and
            the dialogs it opens); the sidebar keeps its place in the row. */}
        <div className="contents" data-theme={themeAttr(appTheme)}>
          <ThemeContext.Provider value={appTheme}>
            <Sidebar
              collapsed={collapsed}
              onToggleCollapsed={toggleCollapsed}
              mobileOpen={mobileOpen}
              onCloseMobile={() => setMobileOpen(false)}
            />
          </ThemeContext.Provider>
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Below lg the sidebar is an off-canvas drawer, so the content
              column carries its own bar to open it. Part of the shell, so it
              takes the sidebar's theme. */}
          <div
            data-theme={themeAttr(appTheme)}
            className="flex h-12 shrink-0 items-center gap-3 border-b border-neutral-200 bg-surface px-4 lg:hidden dark:border-white/[0.07] dark:bg-brand-950"
          >
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileOpen}
              className="focus-ring flex h-9 w-9 items-center justify-center rounded-md text-neutral-700 transition-colors hover:bg-brand-50 hover:text-brand-600"
            >
              <i className="ti ti-menu-2 text-[19px]" aria-hidden="true" />
            </button>
            <span className="text-sm font-bold text-neutral-900">South Lakes IS</span>
          </div>

          {/* The page area. Dark only for a converted page, with the brand
              panel's glow behind it. The glow is positioned and comes first,
              and the page wraps in a positioned box after it, so the page
              paints over the glow without either making a stacking context:
              a dialog's z-index still has to clear the sidebar. */}
          <div
            data-theme={themeAttr(pageTheme)}
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-neutral-50"
          >
            {pageTheme === "dark" && <PageGlow />}
            <div className="relative flex min-h-0 flex-1 flex-col">
              <ThemeContext.Provider value={pageTheme}>{children}</ThemeContext.Provider>
            </div>
          </div>
        </div>
      </div>
    </InsideAppLayout.Provider>
  );
}
