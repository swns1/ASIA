import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

import { hasAnyRole, portalLabelFor } from "../utils/auth";
import { NAV } from "../constants/sidebarNav";
import useCurrentUser from "../hooks/useCurrentUser";
import useTheme from "../hooks/useTheme";
import useMediaQuery from "../hooks/useMediaQuery";
import BrandBackdrop from "./ui/BrandBackdrop";
import { springTransition } from "../utils/motion";
import { initialsFrom } from "../utils/avatarPalette";
import logo from "../assets/logo.png";

// Every staff member's own page (their theme and password, and logging out),
// at the foot of the sidebar beside their account card rather than among the
// school's pages.
const MY_SETTINGS = { label: "My Settings", icon: "ti-adjustments-horizontal", path: "/my-settings" };

const isCurrent = (pathname, path) => pathname === path || pathname.startsWith(path + "/");

function SidebarLink({ item, showLabels, active, className = "" }) {
  return (
    <Link
      to={item.path}
      aria-current={active ? "page" : undefined}
      title={showLabels ? undefined : item.label}
      className={[
        "focus-ring relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
        showLabels ? "" : "justify-center",
        active
          ? "font-semibold text-brand-600 dark:text-white"
          : "text-neutral-700 hover:bg-brand-50 hover:text-brand-600",
        className,
      ].join(" ")}
    >
      {active && (
        // Dark: a red wash fading to the right, edged in red.
        <motion.span
          layoutId="sidebar-active-pill"
          transition={springTransition}
          className="absolute inset-0 rounded-md bg-brand-100 dark:bg-transparent dark:bg-[linear-gradient(90deg,rgba(224,49,49,0.34),rgba(224,49,49,0.08))] dark:shadow-[inset_0_0_0_1px_rgba(224,49,49,0.28)]"
        />
      )}
      <span className="relative flex items-center gap-2.5">
        <i
          className={`ti ${item.icon} w-5 shrink-0 text-center text-[16px]`}
          aria-hidden="true"
        />
        {showLabels ? <span className="truncate">{item.label}</span> : (
          <span className="sr-only">{item.label}</span>
        )}
      </span>
      {active && (
        <span
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-brand-500 dark:bg-action dark:shadow-[0_0_10px_rgba(224,49,49,0.9)]"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}

export default function Sidebar({
  collapsed = false,
  onToggleCollapsed,
  mobileOpen = false,
  onCloseMobile,
}) {
  const location = useLocation();
  // Sections marked `defaultCollapsed` (currently just "Admin") start closed;
  // this is the only per-section collapse state — independent of the
  // whole-rail `collapsed` prop below.
  const [collapsedSections, setCollapsedSections] = useState(
    () => new Set(NAV.filter((g) => g.defaultCollapsed).map((g) => g.section))
  );
  function toggleSection(section) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // Inside the mobile drawer there's room for labels, so collapse only applies
  // to the persistent desktop rail.
  const showLabels = !collapsed || !isDesktop;

  // Live, so editing your own name on the Users page shows here at once.
  const currentUser = useCurrentUser();
  // In dark mode the sidebar is the login page's brand panel.
  const dark = useTheme() === "dark";

  const navGroups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasAnyRole(currentUser, item.allowedRoles)),
  })).filter((group) => group.items.length > 0);

  // Navigating from the drawer should close it, otherwise it covers the page
  // the user just asked for.
  useEffect(() => {
    if (mobileOpen) onCloseMobile?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <>
      {/* Drawer backdrop (below lg only) */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-brand-900/40 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        className={[
          // `lg:relative`, not static: the dark brand panel's backdrop is
          // positioned inside it. `isolate` keeps that backdrop behind the
          // nav without slipping under the sidebar's own background.
          "isolate z-50 flex shrink-0 flex-col border-r border-neutral-200 bg-surface shadow-xs transition-[width,transform] duration-200",
          "dark:border-white/[0.07] dark:bg-brand-950 dark:shadow-none",
          "fixed inset-y-0 left-0 lg:relative",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          showLabels ? "w-56" : "w-16",
        ].join(" ")}
      >
        {/* The login's dot grid and red glows; they hold still. */}
        {dark && <BrandBackdrop tone="dark" />}

        {/* Logo. In dark mode it sits on the login page's glass tile, which
            also keeps the crest's dark outline from melting into the panel. */}
        <div
          className={[
            "flex h-14 shrink-0 items-center gap-2.5 border-b border-neutral-200 px-4 dark:border-white/[0.07]",
            showLabels ? "" : "justify-center px-0",
          ].join(" ")}
        >
          <span
            className="flex shrink-0 items-center justify-center dark:h-[34px] dark:w-[34px] dark:rounded-md dark:border dark:border-white/[0.12] dark:bg-white/[0.08]"
            aria-hidden="true"
          >
            <img src={logo} alt="" className="h-[30px] w-5 dark:h-[26px] dark:w-[18px]" />
          </span>
          {showLabels && (
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-neutral-900">South Lakes IS</div>
              <div className="truncate text-xs text-neutral-500">
                {portalLabelFor(currentUser?.role)}
              </div>
            </div>
          )}
        </div>

        {/* The landmark name belongs on <nav>, not the <aside> wrapper —
            <aside> exposes a "complementary" role, so labelling it there left
            the navigation landmark unnamed. */}
        <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2.5">
          {navGroups.map((group) => {
            // A collapsible section only ever collapses when labels are
            // showing — in icon-only rail mode there's no header to click,
            // so its items always render flat rather than disappearing.
            const isOpen = !group.collapsible || !showLabels || !collapsedSections.has(group.section);

            const items = group.items.map((item) => (
              <SidebarLink
                key={item.path}
                item={item}
                showLabels={showLabels}
                active={isCurrent(location.pathname, item.path)}
              />
            ));

            return (
              <div key={group.section} className="mb-1.5">
                {showLabels && (
                  group.collapsible ? (
                    <button
                      type="button"
                      onClick={() => toggleSection(group.section)}
                      aria-expanded={isOpen}
                      className="focus-ring flex w-full items-center justify-between rounded-md px-2.5 pb-1 pt-2.5 text-xs font-bold uppercase tracking-[0.1em] text-neutral-500 hover:text-brand-600"
                    >
                      <span>{group.section}</span>
                      <i
                        className="ti ti-chevron-right text-[12px] transition-transform duration-200"
                        style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    <div className="px-2.5 pb-1 pt-2.5 text-xs font-bold uppercase tracking-[0.1em] text-neutral-500">
                      {group.section}
                    </div>
                  )
                )}
                {showLabels && group.collapsible ? (
                  <motion.div
                    initial={false}
                    animate={isOpen ? "open" : "closed"}
                    variants={{
                      open: { height: "auto", opacity: 1 },
                      closed: { height: 0, opacity: 0 },
                    }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    {items}
                  </motion.div>
                ) : (
                  items
                )}
              </div>
            );
          })}
        </nav>

        {/* Collapse toggle — desktop only; the drawer closes instead. */}
        <div className="hidden border-t border-neutral-200 px-2.5 py-2 lg:block dark:border-white/[0.07]">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={[
              "focus-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-semibold text-neutral-600 transition-colors hover:bg-brand-50 hover:text-brand-600",
              showLabels ? "" : "justify-center",
            ].join(" ")}
          >
            <i
              className={`ti ${collapsed ? "ti-chevron-right" : "ti-chevron-left"} text-[15px]`}
              aria-hidden="true"
            />
            {showLabels && <span>Collapse</span>}
          </button>
        </div>

        {/* User card. Dark: glass over the panel's strongest glow, with the
            avatar in the login button's red. Above it, the link to the
            person's own settings, where they change their password and log
            out. */}
        <div className="border-t border-neutral-200 p-2.5 dark:border-white/[0.07]">
          <SidebarLink
            item={MY_SETTINGS}
            showLabels={showLabels}
            active={isCurrent(location.pathname, MY_SETTINGS.path)}
            className={showLabels ? "mb-1.5" : ""}
          />
          {showLabels && (
            <div className="flex items-center gap-2.5 rounded-md bg-brand-50 p-2.5 dark:bg-white/[0.06] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-brand-200),var(--color-brand-300))] text-xs font-bold text-brand-600 dark:bg-[linear-gradient(135deg,var(--color-action),var(--color-action-2))] dark:text-white dark:shadow-[0_4px_12px_rgba(224,49,49,0.35)]"
                aria-hidden="true"
              >
                {initialsFrom(currentUser?.name || "")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-neutral-900">
                  {/* Falls back to a neutral placeholder, not "Super Admin".
                      A missing name is a loading or data problem, and
                      rendering the highest-privilege label for it told the
                      person on screen they were signed in as something they
                      are not — the role line below already says the truth. */}
                  {currentUser?.name || "Signed in"}
                </div>
                <div className="truncate text-xs text-neutral-500">
                  {portalLabelFor(currentUser?.role)}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
