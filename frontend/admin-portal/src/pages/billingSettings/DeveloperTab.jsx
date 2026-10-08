import { motion } from "framer-motion";
import { Panel } from "../../components/ui/Card";
import SegmentedControl from "../../components/ui/SegmentedControl";
import { setThemePreference, useThemePreference } from "../../hooks/useTheme";
import { DARK_READY_PAGES } from "../../constants/darkReady";

// DeveloperTab — switches that aren't for school staff yet. The tab only
// exists in a dev build, for super admins and admins (BillingSettingsPage
// leaves it out otherwise), and each switch is kept in this browser only.

const APPEARANCE = [
  { value: "light", label: "Light", icon: "ti-sun" },
  { value: "dark", label: "Dark", icon: "ti-moon" },
  { value: "system", label: "Same as my computer", icon: "ti-device-desktop" },
];

const readyPages = DARK_READY_PAGES.map((page) => page.label).join(", ");

export default function DeveloperTab() {
  const preference = useThemePreference();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="flex-1 overflow-y-auto px-7 py-6"
    >
      <Panel
        icon="ti-moon"
        title="Appearance"
        subtitle="Light or dark mode, while it's being built"
        className="max-w-xl"
      >
        <SegmentedControl
          label="Appearance"
          options={APPEARANCE}
          value={preference}
          onChange={setThemePreference}
        />
        <p className="mt-3 text-xs text-neutral-500">
          Light is the default. Dark applies only while an admin is signed in, in this browser.
          Pages turn dark as they're converted ({readyPages} so far); the rest stay light beside a
          dark sidebar.
        </p>
      </Panel>
      <p className="mt-3 text-xs text-neutral-500">
        This tab shows only in a development build, and only to admins.
      </p>
    </motion.div>
  );
}
