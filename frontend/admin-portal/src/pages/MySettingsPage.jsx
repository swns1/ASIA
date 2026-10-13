import PageHeader from "../components/ui/PageHeader";
import ThemeSettings from "../components/settings/ThemeSettings";
import AccountSettings from "../components/settings/AccountSettings";
import { usePageTitle } from "../hooks/usePageTitle";

// My Settings — every staff member's own page, linked from the foot of the
// sidebar: their theme (Light, Dark, or the same as their computer), their
// password, and logging out (both moved here from the sidebar's account
// card). The theme is kept in this browser under their account
// (hooks/useTheme), so people who share a computer each keep their own.
//
// Both cards are shared with the guardian portal's My settings
// (pages/GuardianSettingsPage), which shows the portal in the pictures.
export default function MySettingsPage() {
  usePageTitle("My Settings");

  return (
    <>
      <PageHeader title="My Settings" subtitle="Your theme and account" icon="ti-adjustments-horizontal" />

      <div className="relative flex-1 overflow-y-auto px-7 py-6">
        <div className="flex max-w-3xl flex-col gap-4">
          <ThemeSettings scene="staff" />
          <AccountSettings />
        </div>
      </div>
    </>
  );
}
