// statusMeta.js
//
// Status-pill lookup table for the invoice print page. Kept apart from the
// page because mixing constants with component exports in one file breaks
// React Fast Refresh.
import { PRINT_COLORS } from "./theme";

export const INVOICE_STATUS_META = {
  paid:           { label: "PAID",           color: PRINT_COLORS.green, bg: PRINT_COLORS.greenBg },
  partially_paid: { label: "PARTIALLY PAID", color: PRINT_COLORS.amber, bg: PRINT_COLORS.amberBg },
  unpaid:         { label: "UNPAID",         color: PRINT_COLORS.red,   bg: PRINT_COLORS.redBg },
  void:           { label: "VOID",           color: PRINT_COLORS.gray,  bg: PRINT_COLORS.grayBg },
};
