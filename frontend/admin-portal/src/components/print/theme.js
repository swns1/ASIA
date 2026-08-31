// theme.js
//
// Shared color/font/logo tokens for every printable document (SF1/SF2/SF9/SF10,
// COR, Grade Slip, Invoice, Receipt, Report Card). Generalizes the "Family A"
// maroon palette that CORPrintPage/GradeSlipPrintPage/InvoicePrintPage/
// ReceiptPrintPage/ReportCardPage already shared by copy-paste, and replaces
// the unrelated navy (SF9) and purple (SF10) palettes those two files used to
// have of their own.

export const PRINT_COLORS = {
  dark: "#1a0a0a", muted: "#7a5050", border: "#e8d8d8",
  red: "#e03131", bg: "#fff8f6",
  green: "#2e6b0d", greenBg: "#e8f5e0",
  amber: "#854f0b", amberBg: "#faeeda",
  blue: "#1455a0", blueBg: "#e3f0fd",
  gray: "#5c5752", grayBg: "#f0ede8",
  redBg: "#fde8e8",
};

export const PRINT_FONT = "'DM Sans', Arial, sans-serif";

export const LOGO_SIZE = { width: 52, height: 76 };
export const LOGO_SIZE_LG = { width: 68, height: 100 };
