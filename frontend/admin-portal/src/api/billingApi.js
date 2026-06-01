import axios from "axios";

const billingClient = axios.create({
  baseURL: import.meta.env.VITE_BILLING_API_URL || "http://localhost:8002/api",
  timeout: 15000,
});

// ── Auth token attachment ─────────────────────────────────────────────────────
billingClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── 401 auto-refresh ──────────────────────────────────────────────────────────
billingClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const res = await axios.post(
          (import.meta.env.VITE_IDENTITY_API_URL || "http://localhost:8001/api/auth") + "/refresh/",
          {},
          { withCredentials: true }
        );
        const newToken = res.data.access;
        sessionStorage.setItem("access_token", newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return billingClient(original);
      } catch {
        sessionStorage.removeItem("access_token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

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

export const generateInvoice = (payload) =>
  billingClient.post("/invoices/generate/", payload).then((r) => r.data);

export const updateInvoice = (id, payload) =>
  billingClient.patch(`/invoices/${id}/`, payload).then((r) => r.data);

export const voidInvoice = (id) =>
  billingClient.patch(`/invoices/${id}/`, { status: "void" }).then((r) => r.data);

// ── Payments ──────────────────────────────────────────────────────────────────
export const getPayments = (params = {}) =>
  billingClient.get("/payments/", { params }).then((r) => r.data);

export const createPayment = (payload) =>
  billingClient.post("/payments/", payload).then((r) => r.data);

export const updatePayment = (id, payload) =>
  billingClient.patch(`/payments/${id}/`, payload).then((r) => r.data);

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
