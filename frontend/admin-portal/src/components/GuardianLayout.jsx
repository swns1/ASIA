import { useNavigate, Link, useLocation } from "react-router-dom";
import { clearAuthSession, getCurrentUser } from "../utils/auth";
import Button from "./ui/Button";
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

  function handleLogout() {
    clearAuthSession();
    navigate("/login");
  }

  const onHome = location.pathname === "/guardian";

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="sticky top-0 z-50 flex h-15 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-3 shadow-xs sm:px-6">
        <Link
          to="/guardian"
          className="focus-ring flex items-center gap-2.5 rounded-md"
          aria-label="Parent portal home"
        >
          <img src={logo} alt="" className="h-[38px] w-[26px]" aria-hidden="true" />
          <div className="min-w-0">
            <div className="truncate text-base font-bold text-neutral-900">South Lakes IS</div>
            <div className="truncate text-xs text-neutral-500">Parent Portal</div>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {!onHome && (
            <Button variant="ghost" size="sm" icon="ti-arrow-left" to="/guardian">
              <span className="hidden sm:inline">My Children</span>
            </Button>
          )}

          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-brand-200),var(--color-brand-300))] text-xs font-bold text-brand-600"
              aria-hidden="true"
            >
              {(user?.name || "P").slice(0, 2).toUpperCase()}
            </div>
            <div className="hidden min-w-0 leading-tight sm:block">
              <div className="truncate text-sm font-semibold text-neutral-900">
                {user?.name || "Parent"}
              </div>
              <div className="truncate text-xs text-neutral-500">Guardian</div>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            iconOnly
            icon="ti-logout"
            onClick={handleLogout}
            title="Log out"
            aria-label="Log out"
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-7 sm:px-6">{children}</main>
    </div>
  );
}
