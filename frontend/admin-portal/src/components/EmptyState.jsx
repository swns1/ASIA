import { motion } from "framer-motion";

// Shared empty-state block (icon badge + message + optional subtext/CTA).
// Renders just the inner content — wrap in <tr><td colSpan={n}> for table
// bodies, or drop straight into a plain container elsewhere.
//
// Empty means "there is genuinely nothing here". A failed request must use
// ui/ErrorState instead — conflating the two is what made an outage look like
// an empty database on four list pages.
//
// Props are unchanged so existing call sites keep working; iconBg/iconColor
// still accept raw values for the few pages that tint per context.
export default function EmptyState({
  icon = "ti-inbox",
  iconBg,
  iconColor,
  title,
  subtitle,
  action,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="flex flex-col items-center gap-2.5 px-4 py-10 text-center"
    >
      <div
        className={`mb-1 flex h-14 w-14 items-center justify-center rounded-2xl ${
          iconBg ? "" : "bg-brand-100"
        }`}
        style={iconBg ? { background: iconBg } : undefined}
      >
        <i
          className={`ti ${icon} text-2xl ${iconColor ? "" : "text-brand-400"}`}
          style={iconColor ? { color: iconColor } : undefined}
          aria-hidden="true"
        />
      </div>
      <div className="text-md font-bold text-neutral-900">{title}</div>
      {subtitle && <div className="max-w-sm text-sm text-neutral-500">{subtitle}</div>}
      {action}
    </motion.div>
  );
}
