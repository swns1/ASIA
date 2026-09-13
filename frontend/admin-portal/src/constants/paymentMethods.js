/**
 * Payment methods — payment.payment_method
 *
 * InvoicesPage and PaymentsPage each carried their own copy of this list with
 * byte-identical colours, so a new method (or a recoloured one) had to be added
 * in two places to stay consistent. One definition now, same shape as the maps
 * in statusMaps.js.
 *
 * `tone` names the shared palette entry used by ChipGroup and Badge; the
 * `color`/`bg` literals remain for the few inline pills that haven't moved to
 * Badge yet, and should be dropped once they have.
 */
export const PAYMENT_METHODS = [
  { value: "cash",          label: "Cash",          icon: "ti-cash",          tone: "success", color: "#2e6b0d", bg: "#e8f5e0" },
  { value: "gcash",         label: "GCash",         icon: "ti-device-mobile", tone: "info",    color: "#1455a0", bg: "#e3f0fd" },
  { value: "bank_transfer", label: "Bank Transfer", icon: "ti-building-bank", tone: "accent",  color: "#7c3aed", bg: "#f0e8fd" },
  { value: "card",          label: "Card",          icon: "ti-credit-card",   tone: "warning", color: "#854f0b", bg: "#fdf5e8" },
  { value: "check",         label: "Check",         icon: "ti-file-text",     tone: "warning", color: "#854f0b", bg: "#faeeda" },
  { value: "others",        label: "Others",        icon: "ti-dots",          tone: "muted",   color: "#5c5752", bg: "#f0ede8" },
];

/** Keyed lookup for rendering a single payment's method. */
export const PAYMENT_METHOD_MAP = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m])
);

/** Falls back to "Others" so an unrecognised method still renders a label. */
export const paymentMethodMeta = (value) =>
  PAYMENT_METHOD_MAP[value] ?? PAYMENT_METHOD_MAP.others;
