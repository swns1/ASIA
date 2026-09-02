import { createContext, useContext, useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import { useSchoolYear } from "../context/SchoolYearContext";

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

export default function AppLayout({ children }) {
  const alreadyInside = useContext(InsideAppLayout);
  const { ensureDefault } = useSchoolYear();

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  // AppLayout is the first thing to mount once a user is actually
  // authenticated (SchoolYearProvider itself mounts before login, when there's
  // no token yet to resolve a default against) — retry here so the global
  // school year gets its backend-sourced default right after login.
  useEffect(() => {
    ensureDefault();
  }, [ensureDefault]);

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
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Below lg the sidebar is an off-canvas drawer, so the content
              column carries its own bar to open it. */}
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 lg:hidden">
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

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </div>
      </div>
    </InsideAppLayout.Provider>
  );
}
