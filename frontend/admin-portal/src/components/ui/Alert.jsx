import { motion } from "framer-motion";

// Alert — the inline banner for form-level and page-level messages.
//
// Replaces the `#fef2f2` / `#fca5a5` / `#b91c1c` block that was hand-copied
// into LoginPage, DashboardPage, UsersPage, RecordPaymentModal, the student and
// enrollment forms, and others. role="alert" means screen readers actually
// announce it — previously only the login page did that.

const VARIANTS = {
  error: {
    box: "bg-error-50 border-brand-300 text-error-500",
    icon: "ti-alert-circle",
    iconColor: "text-error-500",
  },
  warning: {
    box: "bg-warning-50 border-warning-dot/40 text-warning-500",
    icon: "ti-alert-triangle",
    iconColor: "text-warning-500",
  },
  success: {
    box: "bg-success-50 border-success-dot/40 text-success-500",
    icon: "ti-circle-check",
    iconColor: "text-success-500",
  },
  info: {
    box: "bg-info-50 border-info-dot/40 text-info-500",
    icon: "ti-info-circle",
    iconColor: "text-info-500",
  },
};

export default function Alert({
  variant = "error",
  title,
  icon,
  dismissible = false,
  onDismiss,
  className = "",
  children,
  ...props
}) {
  const v = VARIANTS[variant] ?? VARIANTS.error;

  return (
    <motion.div
      // Matches the login page's error-banner motion, so every banner in the
      // app now enters and leaves the same way.
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      // "alert" for problems (assertive), "status" for confirmations (polite).
      role={variant === "error" || variant === "warning" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-sm border px-3.5 py-2.5 text-sm ${v.box} ${className}`}
      {...props}
    >
      <i className={`ti ${icon ?? v.icon} mt-px shrink-0 text-[15px] ${v.iconColor}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <div className="font-bold">{title}</div>}
        {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="focus-ring -mr-1 shrink-0 rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <i className="ti ti-x text-sm" aria-hidden="true" />
        </button>
      )}
    </motion.div>
  );
}
