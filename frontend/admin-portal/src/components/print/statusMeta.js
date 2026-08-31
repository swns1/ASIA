// statusMeta.js
//
// Status-pill lookup tables consumed by StatusBadge.jsx. Split into its own
// file (rather than living alongside the component) because these objects
// are the same ones copy-pasted across CORPrintPage/GradeSlipPrintPage/
// ReportCardPage/InvoicePrintPage — generalized here — and mixing constants
// with component exports in one file breaks React Fast Refresh.
import { PRINT_COLORS } from "./theme";

export const ENROLLMENT_STATUS_META = {
  enrolled:        { label: "Enrolled",        color: PRINT_COLORS.green, bg: PRINT_COLORS.greenBg },
  pending:         { label: "Pending",         color: PRINT_COLORS.amber, bg: PRINT_COLORS.amberBg },
  completed:       { label: "Completed",       color: PRINT_COLORS.blue,  bg: PRINT_COLORS.blueBg },
  cancelled:       { label: "Cancelled",       color: PRINT_COLORS.gray,  bg: PRINT_COLORS.grayBg },
  transferred_out: { label: "Transferred Out", color: PRINT_COLORS.gray,  bg: PRINT_COLORS.grayBg },
};

export const INVOICE_STATUS_META = {
  paid:           { label: "PAID",           color: PRINT_COLORS.green, bg: PRINT_COLORS.greenBg },
  partially_paid: { label: "PARTIALLY PAID", color: PRINT_COLORS.amber, bg: PRINT_COLORS.amberBg },
  unpaid:         { label: "UNPAID",         color: PRINT_COLORS.red,   bg: PRINT_COLORS.redBg },
  void:           { label: "VOID",           color: PRINT_COLORS.gray,  bg: PRINT_COLORS.grayBg },
};
