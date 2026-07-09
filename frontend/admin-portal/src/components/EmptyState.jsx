import { motion } from "framer-motion";

// Shared empty-state block (icon badge + message + optional subtext/CTA).
// Renders just the inner content — wrap in <tr><td colSpan={n}> for table
// bodies, or drop straight into a plain container elsewhere.
export default function EmptyState({
  icon = "ti-inbox",
  iconBg = "#fff0f0",
  iconColor = "#e08080",
  title,
  subtitle,
  action,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "40px 16px", textAlign: "center" }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: 16, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4,
      }}>
        <i className={`ti ${icon}`} style={{ fontSize: 24, color: iconColor }} />
      </div>
      <div style={{ fontSize: 15, color: "#1a0a0a", fontWeight: 700 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12.5, color: "#b09090" }}>{subtitle}</div>}
      {action}
    </motion.div>
  );
}
