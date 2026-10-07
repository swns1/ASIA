import { motion } from "framer-motion";
import { Panel } from "../../components/ui/Card";
import SegmentedControl from "../../components/ui/SegmentedControl";
import useBandTone, { setBandTone } from "../../hooks/useBandTone";

// DeveloperTab — switches that aren't for school staff yet. The tab only
// exists in a dev build (BillingSettingsPage leaves it out of a production
// one), and each switch is kept in this browser only.

const BAND_TONES = [
  { value: "light", label: "Light", icon: "ti-sun" },
  { value: "dark", label: "Dark", icon: "ti-moon" },
];

export default function DeveloperTab() {
  const bandTone = useBandTone();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="flex-1 overflow-y-auto px-7 py-6"
    >
      <Panel
        icon="ti-layout-navbar"
        title="Status band"
        subtitle="The summary band over the lists: Students, Enrollments, Invoices and the rest"
        className="max-w-xl"
      >
        <SegmentedControl
          label="Status band look"
          options={BAND_TONES}
          value={bandTone}
          onChange={setBandTone}
        />
        <p className="mt-3 text-xs text-neutral-500">
          Light is the default. Dark brings back the brand panel, in this browser only.
        </p>
      </Panel>
      <p className="mt-3 text-xs text-neutral-500">
        This tab shows only in a development build.
      </p>
    </motion.div>
  );
}
