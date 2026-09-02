import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import {
  hasAnyRole, clearAuthSession, getCurrentUser, portalLabelFor,
  STAFF_ADMIN, ACADEMIC_STAFF, GRADE_ROLES, BILLING_ROLES,
} from "../utils/auth";
import { useSchoolYear } from "../context/SchoolYearContext";
import useMediaQuery from "../hooks/useMediaQuery";
import { ConfirmDialog } from "./ui/Modal";
import { Select } from "./FormField";
import logo from "../assets/logo.png";

// ── Global school-year filter: sets the default year every year-scoped
// module (Dashboard, Enrollments, Grades, Attendance, Analytics,
// Scholarships, Academic Calendar, Teacher Advisories) opens to. Individual
// pages may still switch to a different year locally without affecting this.
function SchoolYearPicker() {
  const { schoolYear, setSchoolYear, options } = useSchoolYear();
  if (!schoolYear) return null; // still resolving the default on first load

  return (
    <div className="border-b border-neutral-200 px-3.5 pb-2.5 pt-3">
      <label
        htmlFor="sidebar-school-year"
        className="mb-1 block text-xs font-bold uppercase tracking-[0.1em] text-neutral-500"
      >
        School Year
      </label>
      <Select
        id="sidebar-school-year"
        value={schoolYear}
        onChange={(e) => setSchoolYear(e.target.value)}
        title="Applies to Dashboard, Enrollments, Grades, Attendance, Analytics, Scholarships, Academic Calendar, and Teacher Advisories"
        className="px-2.5 py-1.5 text-sm font-semibold"
      >
        {options.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </Select>
    </div>
  );
}

const NAV = [
  {
    section: "Main",
    items: [
      { label: "Dashboard",         icon: "ti-layout-dashboard",  path: "/dashboard"           },
      { label: "Students",          icon: "ti-users",             path: "/students"            },
      { label: "Enrollments",       icon: "ti-clipboard-list",    path: "/enrollments"         },
      { label: "My Sections",       icon: "ti-users-group",       path: "/my-sections",        allowedRoles: GRADE_ROLES },
      { label: "Subjects",          icon: "ti-book",              path: "/subjects"            },
      { label: "Grades",            icon: "ti-chart-bar",         path: "/grades",             allowedRoles: GRADE_ROLES },
      { label: "Requirements",      icon: "ti-file-check",        path: "/requirements",        allowedRoles: ACADEMIC_STAFF },
      { label: "Academic Calendar", icon: "ti-calendar-event",    path: "/academic-calendar"   },
      { label: "School Forms", icon: "ti-forms", path: "/school-forms" },
      { label: "Analytics",         icon: "ti-chart-dots-3",      path: "/analytics",           allowedRoles: GRADE_ROLES },
    ],
  },
  {
    section: "Finance",
    items: [
      { label: "Invoices",          icon: "ti-receipt",  path: "/invoices",          allowedRoles: BILLING_ROLES },
      { label: "Payments",          icon: "ti-cash",     path: "/payments",          allowedRoles: BILLING_ROLES },
      { label: "Scholarships",      icon: "ti-discount", path: "/scholarships",      allowedRoles: ACADEMIC_STAFF },
      { label: "Scholarship Types", icon: "ti-discount", path: "/scholarship-types", allowedRoles: ACADEMIC_STAFF },
    ],
  },
  {
    section: "Settings",
    items: [
      { label: "Users",              icon: "ti-user-cog",         path: "/users",             allowedRoles: STAFF_ADMIN },
      { label: "Audit Trail",        icon: "ti-shield-check",     path: "/audit-trail",        allowedRoles: STAFF_ADMIN },
      { label: "Billing Settings",   icon: "ti-settings",         path: "/settings",           allowedRoles: BILLING_ROLES },
      { label: "Grading Settings",   icon: "ti-report-analytics", path: "/grading-templates",  allowedRoles: GRADE_ROLES },
      { label: "Teacher Advisories", icon: "ti-user-check",       path: "/teacher-advisories", allowedRoles: ACADEMIC_STAFF },
    ],
  },
];

export default function Sidebar({
  collapsed = false,
  onToggleCollapsed,
  mobileOpen = false,
  onCloseMobile,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogout, setShowLogout] = useState(false);

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // Inside the mobile drawer there's room for labels, so collapse only applies
  // to the persistent desktop rail.
  const showLabels = !collapsed || !isDesktop;

  const currentUser = getCurrentUser();

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

  function handleLogout() {
    clearAuthSession();
    navigate("/");
  }

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
          "z-50 flex shrink-0 flex-col border-r border-neutral-200 bg-white shadow-xs transition-[width,transform] duration-200",
          "fixed inset-y-0 left-0 lg:static",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          showLabels ? "w-56" : "w-16",
        ].join(" ")}
      >
        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-neutral-200 px-4">
          <img src={logo} alt="" className="h-[30px] w-5 shrink-0" aria-hidden="true" />
          {showLabels && (
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-neutral-900">South Lakes IS</div>
              <div className="truncate text-xs text-neutral-500">
                {portalLabelFor(currentUser?.role)}
              </div>
            </div>
          )}
        </div>

        {showLabels && <SchoolYearPicker />}

        {/* The landmark name belongs on <nav>, not the <aside> wrapper —
            <aside> exposes a "complementary" role, so labelling it there left
            the navigation landmark unnamed. */}
        <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2.5">
          {navGroups.map((group) => (
            <div key={group.section} className="mb-1.5">
              {showLabels && (
                <div className="px-2.5 pb-1 pt-2.5 text-xs font-bold uppercase tracking-[0.1em] text-neutral-500">
                  {group.section}
                </div>
              )}
              {group.items.map((item) => {
                const active =
                  location.pathname === item.path ||
                  location.pathname.startsWith(item.path + "/");
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-current={active ? "page" : undefined}
                    title={showLabels ? undefined : item.label}
                    className={[
                      "focus-ring relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                      showLabels ? "" : "justify-center",
                      active
                        ? "bg-brand-100 font-semibold text-brand-600 before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-r before:bg-brand-500"
                        : "text-neutral-700 hover:bg-brand-50 hover:text-brand-600",
                    ].join(" ")}
                  >
                    <i
                      className={`ti ${item.icon} w-5 shrink-0 text-center text-[16px]`}
                      aria-hidden="true"
                    />
                    {showLabels ? <span className="truncate">{item.label}</span> : (
                      <span className="sr-only">{item.label}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Collapse toggle — desktop only; the drawer closes instead. */}
        <div className="hidden border-t border-neutral-200 px-2.5 py-2 lg:block">
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

        {/* User card */}
        <div className="border-t border-neutral-200 p-2.5">
          <div
            className={[
              "flex items-center gap-2.5 rounded-md bg-brand-50 p-2.5",
              showLabels ? "" : "justify-center",
            ].join(" ")}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-brand-200),var(--color-brand-300))] text-xs font-bold text-brand-600"
              aria-hidden="true"
            >
              {(currentUser?.name || "SA").slice(0, 2).toUpperCase()}
            </div>
            {showLabels && (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-neutral-900">
                    {currentUser?.name || "Super Admin"}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {portalLabelFor(currentUser?.role)}
                  </div>
                </div>
                <button
                  type="button"
                  title="Log out"
                  aria-label="Log out"
                  onClick={() => setShowLogout(true)}
                  className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-neutral-300 bg-white text-neutral-600 transition-colors hover:border-brand-300 hover:bg-brand-100 hover:text-brand-600"
                >
                  <i className="ti ti-logout text-[15px]" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
          {!showLabels && (
            <button
              type="button"
              title="Log out"
              aria-label="Log out"
              onClick={() => setShowLogout(true)}
              className="focus-ring mt-1.5 flex h-8 w-full items-center justify-center rounded-sm border border-neutral-300 bg-white text-neutral-600 transition-colors hover:border-brand-300 hover:bg-brand-100 hover:text-brand-600"
            >
              <i className="ti ti-logout text-[15px]" aria-hidden="true" />
            </button>
          )}
        </div>
      </aside>

      <AnimatePresence>
        {showLogout && (
          <ConfirmDialog
            icon="ti-logout"
            danger={false}
            title="Log out?"
            message="You'll be returned to the login page. Any unsaved changes will be lost."
            confirmLabel="Yes, log out"
            cancelLabel="Stay"
            onConfirm={handleLogout}
            onCancel={() => setShowLogout(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
