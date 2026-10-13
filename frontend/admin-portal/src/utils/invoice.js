// invoice.js — reading an invoice from the billing service.

/**
 * An invoice item's description, split. They are stored as "[Category] Name"
 * (billing services, invoice generation): "[Tuition] Tuition Fee" gives
 * { category: "Tuition", name: "Tuition Fee" }. One without a category comes
 * back whole as the name.
 */
export function splitItem(description) {
  const m = /^\[(.*?)\]\s*(.*)$/.exec(description ?? "");
  if (!m) return { category: "", name: description ?? "" };
  return { category: m[1] === "Misc" ? "Miscellaneous" : m[1], name: m[2] };
}

// The plans billing accepts (views.PAYMENT_PLANS).
const PLAN_LABELS = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-annual",
  annual: "Annual",
};

/** "Monthly plan"; null when the invoice carries none. */
export const planLabel = (plan) =>
  plan ? `${PLAN_LABELS[plan] ?? plan.replace(/_/g, " ")} plan` : null;

/** A void invoice owes nothing: its installments are voided with it
 *  (billing services.void_invoice), and it is left out of every "what is
 *  owed" answer. */
export const isVoid = (invoice) => invoice?.status === "void";
