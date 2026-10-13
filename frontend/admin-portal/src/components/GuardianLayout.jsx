import { Link, NavLink, useLocation } from "react-router-dom";
import useCurrentUser from "../hooks/useCurrentUser";
import Button from "./ui/Button";
import ThemeArea from "./ThemeArea";
import { initialsFrom } from "../utils/avatarPalette";
import logo from "../assets/logo.png";

// A slim, staff-sidebar-free shell for the guardian (parent) portal. Guardians
// see only their own child(ren)'s records, so they get a minimal top bar rather
// than the full admin Sidebar — that stays true; only the styling is unified
// with the staff portal, so both feel like one product.
//
// ThemeArea gives the portal the guardian's own theme (hooks/useTheme), as it
// does the staff full-page forms. The account button opens My settings
// (pages/GuardianSettingsPage), the one place for the theme, Change password
// and Log out -- as staff My Settings is for staff.
//
// Its duplicated <Toaster> and @keyframes now live at the app root and in
// index.css respectively.
export default function GuardianLayout({ children }) {
  const { pathname } = useLocation();
  const user = useCurrentUser();
  const name = user?.name || "Guardian";
  const onHome = pathname === "/guardian";

  return (
    <ThemeArea className="flex min-h-screen flex-col bg-neutral-50">
      {/* The bar's contents share main's width, so on a wide screen the crest
          and the account block line up with the page instead of the screen edges. */}
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-surface/90 shadow-xs backdrop-blur dark:bg-[rgba(24,14,14,0.72)] dark:shadow-[inset_0_-1px_0_rgba(224,49,49,0.18)]">
        <div className="mx-auto flex h-15 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            to="/guardian"
            className="focus-ring flex items-center gap-2.5 rounded-md"
            aria-label="Guardian portal home"
          >
            <img src={logo} alt="" className="h-[38px] w-[26px]" aria-hidden="true" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-base font-bold text-neutral-900">South Lakes IS</div>
              <div className="truncate text-xs text-neutral-500">Guardian Portal</div>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            {!onHome && (
              <Button variant="ghost" size="sm" icon="ti-arrow-left" to="/guardian">
                <span className="hidden sm:inline">My children</span>
              </Button>
            )}

            <NavLink
              to="/guardian/settings"
              aria-label={`My settings for ${name}: theme, password and log out`}
              className={({ isActive }) => [
                "focus-ring flex items-center gap-2.5 rounded-full border py-1 pl-1 pr-1 transition-colors sm:pr-3",
                isActive
                  ? "border-brand-300 bg-brand-100"
                  : "border-neutral-300 bg-surface hover:border-brand-300",
              ].join(" ")}
            >
              {({ isActive }) => (
                <>
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-brand-200),var(--color-brand-300))] text-xs font-bold text-brand-600 dark:bg-[linear-gradient(135deg,var(--color-action),var(--color-action-2))] dark:text-white"
                    aria-hidden="true"
                  >
                    {initialsFrom(name)}
                  </span>
                  <span className="hidden min-w-0 leading-tight sm:block" aria-hidden="true">
                    <span className="block max-w-[160px] truncate text-sm font-semibold text-neutral-900">{name}</span>
                    <span className={`block truncate text-xs ${isActive ? "text-brand-600" : "text-neutral-500"}`}>My settings</span>
                  </span>
                  <i className="ti ti-adjustments-horizontal hidden text-lg text-neutral-600 sm:block" aria-hidden="true" />
                </>
              )}
            </NavLink>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12 pt-6 sm:px-6">{children}</main>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-center text-xs text-neutral-500 sm:px-6">
        South Lakes Integrated School · Questions about a record? Contact the registrar's office.
      </footer>
    </ThemeArea>
  );
}
