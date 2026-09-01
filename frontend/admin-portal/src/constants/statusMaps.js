// statusMaps.js — one authoritative definition per status vocabulary.
//
// These replace the ~10 hand-copied STATUS_META objects that were declared
// independently in StudentsPage, StudentDetailPage, EnrollmentsPage,
// EnrollmentDetailPage, InvoicesPage, GuardianHomePage, RecordPaymentModal,
// AuditTrailPage and others — which had drifted apart (e.g. "cancelled" was
// grey in two files and red in a third, and two different ambers were in use).
//
// Each entry maps a backend status key to a Badge `variant` plus a human label
// and an icon. The icon matters for accessibility: status must never be
// communicated by colour alone.

/** Students — student.status */
export const STUDENT_STATUS_MAP = {
  active:      { label: "Active",      variant: "success", icon: "ti-circle-check" },
  inactive:    { label: "Inactive",    variant: "muted",   icon: "ti-circle-minus" },
  transferred: { label: "Transferred", variant: "warning", icon: "ti-arrow-right-circle" },
  graduated:   { label: "Graduated",   variant: "info",    icon: "ti-school" },
  dropped:     { label: "Dropped",     variant: "error",   icon: "ti-circle-x" },
};

/** Enrollments — enrollment.enrollment_status
 *  "cancelled" is deliberately `muted`, not `error`: it's an inactive terminal
 *  state rather than a fault needing attention. (Two of the three previous
 *  copies already treated it that way; EnrollmentsPage was the outlier.) */
export const ENROLLMENT_STATUS_MAP = {
  enrolled:        { label: "Enrolled",        variant: "success", icon: "ti-circle-check" },
  pending:         { label: "Pending",         variant: "warning", icon: "ti-clock" },
  completed:       { label: "Completed",       variant: "info",    icon: "ti-flag-check" },
  cancelled:       { label: "Cancelled",       variant: "muted",   icon: "ti-circle-minus" },
  transferred_out: { label: "Transferred Out", variant: "warning", icon: "ti-arrow-right-circle" },
};

/** Invoices and installments — invoice.status / installment.status
 *  "overdue" was previously purple, which read as an unrelated category rather
 *  than something more urgent than "unpaid". It's now error-toned with a
 *  distinct icon and label so urgency is conveyed by icon + wording, not hue
 *  alone. `pending`/`voided` are the installment-level spellings of
 *  `unpaid`/`void`. */
export const INVOICE_STATUS_MAP = {
  unpaid:         { label: "Unpaid",   variant: "error",   icon: "ti-alert-circle" },
  pending:        { label: "Unpaid",   variant: "error",   icon: "ti-alert-circle" },
  partially_paid: { label: "Partial",  variant: "warning", icon: "ti-progress" },
  paid:           { label: "Paid",     variant: "success", icon: "ti-circle-check" },
  overdue:        { label: "Overdue",  variant: "error",   icon: "ti-clock-exclamation" },
  void:           { label: "Void",     variant: "muted",   icon: "ti-ban" },
  voided:         { label: "Voided",   variant: "muted",   icon: "ti-ban" },
};

/** Audit trail — log.status */
export const AUDIT_STATUS_MAP = {
  success: { label: "Success", variant: "success", icon: "ti-circle-check" },
  failed:  { label: "Failed",  variant: "error",   icon: "ti-circle-x" },
  warning: { label: "Warning", variant: "warning", icon: "ti-alert-triangle" },
  pending: { label: "Pending", variant: "info",    icon: "ti-clock" },
};

/** Portal roles — same shape, so Badge renders them the same way.
 *  Each role gets a visually distinct variant; guardians are muted because
 *  they're external users rather than staff. */
export const ROLE_MAP = {
  super_admin: { label: "Super Admin", variant: "accent",  icon: "ti-shield-lock" },
  admin:       { label: "Admin",       variant: "error",   icon: "ti-shield-check" },
  registrar:   { label: "Registrar",   variant: "info",    icon: "ti-clipboard-text" },
  accounting:  { label: "Accounting",  variant: "success", icon: "ti-cash" },
  teacher:     { label: "Teacher",     variant: "warning", icon: "ti-chalkboard" },
  guardian:    { label: "Guardian",    variant: "muted",   icon: "ti-users" },
};

/** Fallback for an unrecognised status — shows the raw key, humanised, rather
 *  than rendering nothing. */
export function fallbackStatus(status) {
  return {
    label: String(status || "Unknown").replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase()),
    variant: "muted",
    icon: "ti-help-circle",
  };
}
