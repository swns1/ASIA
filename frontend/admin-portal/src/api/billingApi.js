import { createApiClient } from "./apiClient";

const billingClient = createApiClient({
  baseURL: import.meta.env.VITE_BILLING_API_URL || "http://localhost:8002/api",
  timeout: 15000,
});

// ── Fee schedules ─────────────────────────────────────────────────────────────
export const getFeeSchedules = (params = {}) =>
  billingClient.get("/fee-schedules/", { params }).then((r) => r.data);

export const getFeeSchedule = (id) =>
  billingClient.get(`/fee-schedules/${id}/`).then((r) => r.data);

export const createFeeSchedule = (payload) =>
  billingClient.post("/fee-schedules/", payload).then((r) => r.data);

export const updateFeeSchedule = (id, payload) =>
  billingClient.patch(`/fee-schedules/${id}/`, payload).then((r) => r.data);

export const deleteFeeSchedule = (id) =>
  billingClient.delete(`/fee-schedules/${id}/`).then((r) => r.data);

export const recalculateFeeSchedule = (id) =>
  billingClient.post(`/fee-schedules/${id}/recalculate/`).then((r) => r.data);

// Starts one school year's price list from another's: every schedule (with
// its items) the target year doesn't have yet. -> { created, skipped_existing }
export const copyFeeSchedulesToYear = (fromSchoolYear, toSchoolYear) =>
  billingClient.post("/fee-schedules/copy-year/", {
    from_school_year: fromSchoolYear,
    to_school_year: toSchoolYear,
  }).then((r) => r.data);

// ── Fee schedule items ────────────────────────────────────────────────────────
export const createFeeScheduleItem = (payload) =>
  billingClient.post("/fee-schedule-items/", payload).then((r) => r.data);

export const updateFeeScheduleItem = (id, payload) =>
  billingClient.patch(`/fee-schedule-items/${id}/`, payload).then((r) => r.data);

export const deleteFeeScheduleItem = (id) =>
  billingClient.delete(`/fee-schedule-items/${id}/`).then((r) => r.data);

// ── Discount types ────────────────────────────────────────────────────────────
export const getDiscountTypes = (params = {}) =>
  billingClient.get("/discount-types/", { params }).then((r) => r.data);

export const createDiscountType = (payload) =>
  billingClient.post("/discount-types/", payload).then((r) => r.data);

export const updateDiscountType = (id, payload) =>
  billingClient.patch(`/discount-types/${id}/`, payload).then((r) => r.data);

export const deleteDiscountType = (id) =>
  billingClient.delete(`/discount-types/${id}/`).then((r) => r.data);

// ── Invoices ──────────────────────────────────────────────────────────────────
export const getInvoices = (params = {}) =>
  billingClient.get("/invoices/", { params }).then((r) => r.data);

export const getInvoice = (id) =>
  billingClient.get(`/invoices/${id}/`).then((r) => r.data);

export const getInvoiceBreakdown = (id) =>
  billingClient.get(`/invoices/${id}/breakdown/`).then((r) => r.data);

export const getInvoiceSummary = (params = {}) =>
  billingClient.get("/invoices/summary/", { params }).then((r) => r.data);

export const getFinancialSummary = (schoolYear) =>
  billingClient.get("/invoices/financial-summary/", { params: schoolYear ? { school_year: schoolYear } : {} }).then((r) => r.data);

export const generateInvoice = (payload) =>
  billingClient.post("/invoices/generate/", payload).then((r) => r.data);

// No updateInvoice: an invoice changes only through its actions. The generic
// PATCH it used could mark an invoice paid with nothing paid.

// Only for an invoice with no payments; the server answers 409
// (code "invoice_has_payments") otherwise -- use reissueInvoice.
export const voidInvoice = (id) =>
  billingClient.post(`/invoices/${id}/void/`).then((r) => r.data);

// Voids the invoice and builds its replacement from the current fee schedule
// with `payment_plan`, moving every payment across. How a bill is corrected
// or a family changes plan. -> { voided_invoice_no, invoice }
export const reissueInvoice = (id, payload) =>
  billingClient.post(`/invoices/${id}/reissue/`, payload).then((r) => r.data);

// Voids/caps remaining installments due after a student's transfer-out
// effective_date — unlike voidInvoice(), this keeps child installments
// consistent instead of just flipping the parent invoice's status.
export const closeOutInvoiceForTransfer = (invoiceId, payload) =>
  billingClient.post(`/invoices/${invoiceId}/close-out-transfer/`, payload).then((r) => r.data);

// ── Payments ──────────────────────────────────────────────────────────────────
export const getPayments = (params = {}) =>
  billingClient.get("/payments/", { params }).then((r) => r.data);

// Per-method totals across every matching payment, not just the page being
// shown. Takes the same date/amount filters as the list; deliberately ignores
// payment_method so selecting one tile doesn't zero out the rest.
export const getPaymentSummary = (params = {}) =>
  billingClient.get("/payments/summary/", { params }).then((r) => r.data);

export const createPayment = (payload) =>
  billingClient.post("/payments/", payload).then((r) => r.data);

// No updatePayment: payments are append-only server-side (see
// StudentPaymentViewSet). This existed, was never called by any page, and
// would now 405 — a correction is a reversing payment or a void-and-reissue,
// not an edit.

// ── Installments ──────────────────────────────────────────────────────────────
export const getInstallments = (params = {}) =>
  billingClient.get("/installments/", { params }).then((r) => r.data);

// ── Student ledger ────────────────────────────────────────────────────────────
export const getStudentLedger = (studentId) =>
  billingClient.get("/invoices/student-ledger/", { params: { student_id: studentId } }).then((r) => r.data);

// ── School settings ───────────────────────────────────────────────────────────
export const getSchoolSettings = () =>
  billingClient.get("/school-settings/current/").then((r) => r.data);

export const updateSchoolSettings = (id, payload) =>
  billingClient.patch(`/school-settings/${id}/`, payload).then((r) => r.data);

export { billingClient };
