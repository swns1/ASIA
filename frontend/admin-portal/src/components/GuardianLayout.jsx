import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { clearAuthSession, getCurrentUser } from "../utils/auth";
import Button from "./ui/Button";
import { ConfirmDialog } from "./ui/Modal";
import { initialsFrom } from "../utils/avatarPalette";
import logo from "../assets/logo.png";

// A slim, staff-sidebar-free shell for the guardian (parent) portal. Guardians
// see only their own child(ren)'s records, so they get a minimal top bar rather
// than the full admin Sidebar — that stays true; only the styling is unified
// with the staff portal, so both feel like one product.
//
// Its duplicated <Toaster> and @keyframes now live at the app root and in
// index.css respectively.
export default function GuardianLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();
  // Gated behind a confirm the same way the staff Sidebar gates its own logout
  // button. This one is an icon-only button sitting next to the account block
  // in a top bar, so it is the easiest of the two to hit by accident, and
  // clearAuthSession() ends the session server-side — there is no undo.
  const [showLogout, setShowLogout] = useState(false);

  function handleLogout() {
    clearAuthSession();
    navigate("/login");
  }

  const onHome = location.pathname === "/guardian";

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      {/* The bar's contents share main's width, so on a wide screen the crest
          and the account block line up with the page instead of the screen edges. */}
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/90 shadow-xs backdrop-blur">
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
                <span className="hidden sm:inline">My Children</span>
              </Button>
            )}

            <div className="flex items-center gap-2.5 sm:border-l sm:border-neutral-200 sm:pl-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-200 text-xs font-bold text-brand-700"
                aria-hidden="true"
              >
                {initialsFrom(user?.name || "Guardian")}
              </div>
              <div className="hidden min-w-0 leading-tight sm:block">
                <div className="max-w-[160px] truncate text-sm font-semibold text-neutral-900">
                  {user?.name || "Guardian"}
                </div>
                <div className="truncate text-xs text-neutral-500">Guardian</div>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              iconOnly
              icon="ti-logout"
              onClick={() => setShowLogout(true)}
              title="Log out"
              aria-label="Log out"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12 pt-6 sm:px-6">{children}</main>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-center text-xs text-neutral-500 sm:px-6">
        South Lakes Integrated School · Questions about a record? Contact the registrar's office.
      </footer>

      <AnimatePresence>
        {showLogout && (
          <ConfirmDialog
            icon="ti-logout"
            danger={false}
            title="Log out?"
            message="You'll be returned to the login page and will need to sign in again to view your children's records."
            confirmLabel="Yes, log out"
            cancelLabel="Stay"
            onConfirm={handleLogout}
            onCancel={() => setShowLogout(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
