/**
 * AccountingHome — accounting's home page.
 *
 * What matters: accounting sees money to chase on the page and in the bell,
 * each on the page's year (last year's balances on the year before); what
 * came in today and the latest receipts; the year's Billing panel on the
 * page's year with no filter of its own; and no link to a page they can't
 * open.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

let currentUser;
const getInvoices = vi.fn();
const getInvoiceSummary = vi.fn();
const getFinancialSummary = vi.fn();
const getPayments = vi.fn();
const getPaymentSummary = vi.fn();
const getStudentApplications = vi.fn();
const getEnrollments = vi.fn();

vi.mock("../../utils/auth", async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: () => currentUser,
}));
vi.mock("../../api/studentApi", () => ({
  getStudents: (params) => Promise.resolve({ count: params.status ? 474 : 551, results: [] }),
}));
vi.mock("../../api/enrollmentApi", () => ({
  getEnrollments: (...a) => getEnrollments(...a),
  getEnrollmentScholarships: () => Promise.resolve({ count: 163, results: [] }),
  getDashboardSummary: () => Promise.resolve({ pipeline: null, risk: null, attendance_series: [] }),
  getCalendarEvents: () => Promise.resolve({ results: [] }),
  getPersonalEvents: () => Promise.resolve({ results: [] }),
}));
vi.mock("../../api/billingApi", () => ({
  getInvoices: (...a) => getInvoices(...a),
  getInvoiceSummary: (...a) => getInvoiceSummary(...a),
  getFinancialSummary: (...a) => getFinancialSummary(...a),
  getPayments: (...a) => getPayments(...a),
  getPaymentSummary: (...a) => getPaymentSummary(...a),
}));
vi.mock("../../api/applicationApi", () => ({
  getStudentApplications: (...a) => getStudentApplications(...a),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    schoolYear: "2026-2027", options: ["2026-2027", "2025-2026"], yearCounts: {}, currentYear: "2026-2027",
    yearStates: { "2025-2026": "archived", "2026-2027": "current" },
  }),
}));
// The payment window has its own tests; here it only has to open.
vi.mock("../../components/RecordPaymentModal", () => ({
  default: () => <div role="dialog" aria-label="Record payment" />,
}));

const { default: DashboardPage } = await import("../DashboardPage");

// The local database's numbers on Oct 12, 2026.
const MONEY = {
  "2026-2027": { net_billed: "9119397.25", total_collected: "3530014.83", outstanding: "5589382.42", invoice_count: 404 },
  "2025-2026": { net_billed: "8000000.00", total_collected: "7184143.62", outstanding: "815856.38", invoice_count: 340 },
};

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { role: "accounting", name: "Rosa Mendoza" };
  getInvoices.mockImplementation((params) => Promise.resolve({ count: params.overdue ? 155 : 81, results: [] }));
  getInvoiceSummary.mockImplementation((params) => Promise.resolve(
    params.school_year === "2025-2026" ? { unpaid: 30, partially_paid: 45 } : { unpaid: 81, partially_paid: 288 }));
  getFinancialSummary.mockImplementation((sy) => Promise.resolve(MONEY[sy]));
  getPaymentSummary.mockResolvedValue({ total: 4500, cash: 3000, gcash: 1500 });
  getPayments.mockImplementation((params) => Promise.resolve(params.date_from
    ? { count: 2, results: [] }
    : { count: 1, results: [{
        payment_id: 77, invoice: 9, payment_date: "2026-09-29", amount_paid: "1500.00", payment_method: "gcash",
        invoice_detail: { student_name: "Ana Dela Cruz", invoice_no: "INV-0009" },
      }] }));
  getEnrollments.mockResolvedValue({ count: 0, results: [] });
});

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderHome() {
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AccountingHome — needs your attention", () => {
  it("lists the money to chase, last year's balances included", async () => {
    renderHome();
    expect(await screen.findByText("81 invoices with no payment yet")).toBeTruthy();
    expect(screen.getByText("155 invoices with a payment past due")).toBeTruthy();
    expect(screen.getByText("75 invoices from S.Y. 2025-2026 still owe money")).toBeTruthy();
    expect(screen.getByText("₱815,856.38 outstanding")).toBeTruthy();
    // Enrollment queues are the registrar's.
    expect(screen.queryByText(/waiting for your approval/)).toBeNull();
    expect(getStudentApplications).not.toHaveBeenCalled();
  });

  it("opens last year's balances on that year, largest first", async () => {
    renderHome();
    fireEvent.click(await screen.findByRole("button", { name: /^View: 75 invoices from S.Y. 2025-2026/ }));
    expect(screen.getByTestId("location").textContent).toBe("/invoices?school_year=2025-2026&money=balance&ordering=-balance");
  });

  it("puts the same rows in the bell", async () => {
    renderHome();
    fireEvent.click(await screen.findByRole("button", { name: /^Notifications, 3 need your attention/ }));
    expect(screen.getByRole("link", { name: /155 invoices with a payment past due/ }).getAttribute("href"))
      .toBe("/invoices?overdue=1&school_year=2026-2027");
  });
});

describe("AccountingHome — payments", () => {
  it("says what came in today, by method", async () => {
    renderHome();
    expect(await screen.findByText("Collected today")).toBeTruthy();
    expect(await screen.findByText("₱4,500.00")).toBeTruthy();
    expect(screen.getByText("from 2 payments")).toBeTruthy();
    expect(screen.getByText("₱3,000.00")).toBeTruthy();
    // Only the methods that took money.
    expect(screen.queryByText("Bank Transfer")).toBeNull();
  });

  it("lists the latest payments with their receipts", async () => {
    renderHome();
    expect(await screen.findByText("Ana Dela Cruz")).toBeTruthy();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(screen.getByRole("button", { name: /^Print the receipt for ₱1,500.00/ }));
    expect(open).toHaveBeenCalledWith("/print/receipt/77", "_blank");
    open.mockRestore();
  });

  it("lists the latest payments by date, newest first", async () => {
    renderHome();
    await screen.findByText("Ana Dela Cruz");
    expect(getPayments).toHaveBeenCalledWith({ ordering: "-payment_date,-payment_id", page_size: 5 });
  });

  it("opens today's payments across every year", async () => {
    renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Payments" }));
    expect(screen.getByTestId("location").textContent).toMatch(
      /^\/payments\?date_from=\d{4}-\d{2}-\d{2}&date_to=\d{4}-\d{2}-\d{2}&school_year=all$/);
  });
});

describe("AccountingHome — billing", () => {
  it("shows the year's Billing panel with no year filter of its own", async () => {
    renderHome();
    expect(await screen.findByText("Billing · S.Y. 2026-2027")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Filter by school year" })).toBeNull();
    expect(getFinancialSummary).toHaveBeenCalledWith("2026-2027");
  });

  it("hides the payment amounts with the Billing panel's eye button", async () => {
    renderHome();
    const amount = await screen.findByText("₱4,500.00");
    fireEvent.click(screen.getByRole("button", { name: "Hide financial amounts" }));
    expect(amount.className).toContain("blur-[6px]");
  });
});

describe("AccountingHome — start a task", () => {
  it("records a payment right here", async () => {
    renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Record a payment" }));
    expect(screen.getByRole("dialog", { name: "Record payment" })).toBeTruthy();
  });

  it("generates an invoice in the Invoices page's own window", async () => {
    renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Generate an invoice" }));
    expect(screen.getByTestId("location").textContent).toBe("/invoices?generate=1&school_year=2026-2027");
  });

  it("gives no way into pages accounting can't open", async () => {
    renderHome();
    await screen.findByText("81 invoices with no payment yet");
    expect(screen.queryByRole("button", { name: "Analytics" })).toBeNull();
    // The scholarships tile is a count, not a link.
    expect(screen.queryByRole("button", { name: /Scholarships awarded/ })).toBeNull();
  });
});
