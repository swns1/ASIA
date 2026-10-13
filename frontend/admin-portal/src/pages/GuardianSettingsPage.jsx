import { motion } from "framer-motion";
import ThemeSettings from "../components/settings/ThemeSettings";
import AccountSettings from "../components/settings/AccountSettings";
import { usePageTitle } from "../hooks/usePageTitle";

// My settings for a guardian: their theme and their account, reached from the
// account button in the portal's top bar. The same cards as staff My Settings
// (components/settings), with the portal in the theme pictures.
export default function GuardianSettingsPage() {
  usePageTitle("My settings");

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="mb-5 flex items-center gap-3.5">
        <div
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-brand-200 text-brand-600 dark:bg-[linear-gradient(135deg,var(--color-action),var(--color-action-2))] dark:text-white"
          aria-hidden="true"
        >
          <i className="ti ti-adjustments-horizontal text-xl" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-neutral-900">My settings</h1>
          <p className="text-sm text-neutral-500">Your theme and account</p>
        </div>
      </div>

      <div className="flex max-w-3xl flex-col gap-4">
        <ThemeSettings scene="portal" printNote="Printable report cards stay light: they're made for paper." />
        <AccountSettings logoutMessage="You'll be returned to the login page and will need to sign in again to view your children's records." />
      </div>
    </motion.div>
  );
}
