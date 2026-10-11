/**
 * Payment methods — payment.payment_method
 *
 * InvoicesPage and PaymentsPage each carried their own copy of this list with
 * byte-identical colours, so a new method (or a recoloured one) had to be added
 * in two places to stay consistent. One definition now, same shape as the maps
 * in statusMaps.js.
 *
 * `tone` names the shared palette entry used by ChipGroup and Badge, which
 * every method pill now renders through.
 */
export const PAYMENT_METHODS = [
  { value: "cash",          label: "Cash",          icon: "ti-cash",          tone: "success" },
  { value: "gcash",         label: "GCash",         icon: "ti-device-mobile", tone: "info" },
  { value: "bank_transfer", label: "Bank Transfer", icon: "ti-building-bank", tone: "accent" },
  { value: "card",          label: "Card",          icon: "ti-credit-card",   tone: "warning" },
  { value: "check",         label: "Check",         icon: "ti-file-text",     tone: "warning" },
  { value: "others",        label: "Others",        icon: "ti-dots",          tone: "muted" },
];

/** Keyed lookup for rendering a single payment's method. */
export const PAYMENT_METHOD_MAP = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m])
);

/** Falls back to "Others" so an unrecognised method still renders a label. */
export const paymentMethodMeta = (value) =>
  PAYMENT_METHOD_MAP[value] ?? PAYMENT_METHOD_MAP.others;
