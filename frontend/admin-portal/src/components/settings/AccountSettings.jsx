import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import SettingsCard from "./SettingsCard";
import Button from "../ui/Button";
import { ConfirmDialog } from "../ui/Modal";
import AccountSettingsModal from "../AccountSettingsModal";
import useCurrentUser from "../../hooks/useCurrentUser";
import { clearAuthSession, portalLabelFor } from "../../utils/auth";
import { initialsFrom } from "../../utils/avatarPalette";

// The Account card: who is signed in, Change password, and Log out. Shared by
// staff My Settings and the guardian portal's My settings, the one place in
// each for both actions. Log out asks first: clearAuthSession() ends the
// session server-side, so there is no undo.
export default function AccountSettings({
  logoutMessage = "You'll be returned to the login page. Any unsaved changes will be lost.",
}) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [changingPassword, setChangingPassword] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  function handleLogout() {
    clearAuthSession();
    navigate("/");
  }

  return (
    <>
      <SettingsCard
        title="Account"
        description="Changing your password signs you out. Sign in again with the new one."
      >
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-brand-200),var(--color-brand-300))] text-sm font-bold text-brand-600 dark:bg-[linear-gradient(135deg,var(--color-action),var(--color-action-2))] dark:text-white dark:shadow-[0_4px_12px_rgba(224,49,49,0.35)]"
            aria-hidden="true"
          >
            {initialsFrom(user?.name || "")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-neutral-900">{user?.name || "Signed in"}</div>
            <div className="truncate text-xs text-neutral-500">
              {[user?.email, portalLabelFor(user?.role)].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon="ti-key" onClick={() => setChangingPassword(true)}>
              Change password
            </Button>
            <Button variant="secondary" size="sm" icon="ti-logout" onClick={() => setConfirmingLogout(true)}>
              Log out
            </Button>
          </div>
        </div>
      </SettingsCard>

      <AnimatePresence>
        {changingPassword && (
          <AccountSettingsModal user={user} onClose={() => setChangingPassword(false)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {confirmingLogout && (
          <ConfirmDialog
            icon="ti-logout"
            danger={false}
            title="Log out?"
            message={logoutMessage}
            confirmLabel="Yes, log out"
            cancelLabel="Stay"
            onConfirm={handleLogout}
            onCancel={() => setConfirmingLogout(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
