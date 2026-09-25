/**
 * Invoices after the billing QA pass.
 *
 * - Every open invoice read as overdue: the flag came from invoice.due_date,
 *   the first installment's date, which never moves.
 * - Void was offered on invoices with payments, stranding the money; Re-issue
 *   carries the payments to a corrected invoice and is how a plan changes.
 * - Generate quietly returned an existing invoice (with its old plan) as if it
 *   were new; it now says the student is already invoiced and opens it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  getInvoices: vi.fn(),
  getInvoice: vi.fn(),
  getInvoiceSummary: vi.fn(),
  generateInvoice: vi.fn(),
  voidInvoice: vi.fn(),
  reissueInvoice: vi.fn(),
  getDiscountTypes: vi.fn(),
  getEnrollments: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/billingApi", () => ({
  getInvoices: pass("getInvoices"),
  getInvoice: pass("getInvoice"),
  getInvoiceSummary: pass("getInvoiceSummary"),
  generateInvoice: pass("generateInvoice"),
  voidInvoice: pass("voidInvoice"),
  reissueInvoice: pass("reissueInvoice"),
  getDiscountTypes: pass("getDiscountTypes"),
}));
vi.mock("../../api/enrollmentApi", () => ({ getEnrollments: pass("getEnrollments") }));
vi.mock("../../components/RecordPaymentModal", () => ({ default: () => null }));
vi.mock("../../components/ui/SchoolYearPicker", () => ({ default: () => null }));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ schoolYear: "2026-2027", currentYear: "2026-2027", options: ["2026-2027"], yearCounts: {} }),
}));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: InvoicesPage } = await import("../InvoicesPage");

function invoice(id, over = {}) {
  return {
    invoice_id: id, invoice_no: `INV-2026-00000${id}`, enrollment_id: 100 + id,
    status: "partially_paid", payment_plan: "monthly",
    invoice_date: "2026-05-01", due_date: "2026-06-30",
    next_due_date: "2026-11-30", is_overdue: false,
    total_items: "46000.00", total_discounts: "0.00",
    net_amount: "46000.00", total_paid: "36800.00", balance: "9200.00",
    items: [], discounts: [], installments: [], payments: [],
    enrollment_detail: { student_name: `Student ${id}`, grade_level: "Grade 7", section: "Rizal", school_year: "2026-2027", lrn: "1" },
    ...over,
  };
}

function renderPage() {
  return render(<MemoryRouter initialEntries={["/invoices"]}><InvoicesPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Acct", role: "accounting" }));
  api.getInvoiceSummary.mockResolvedValue({ unpaid: 0, partially_paid: 2, paid: 0, void: 0, total: 2, school_years: ["2026-2027"] });
  api.getDiscountTypes.mockResolvedValue([
    { discount_code: "SEMI_ANNUAL_PLAN", discount_value: "3.00" },
    { discount_code: "ANNUAL_PLAN", discount_value: "6.00" },
  ]);
});

// Whole-page renders with a second fetch after a click: generous waits so a
// busy machine running the full suite doesn't turn them into flakes.
describe("Overdue", { timeout: 20_000 }, () => {
  it("flags only an invoice with an installment actually past due", async () => {
    // Both carry a first-installment due_date in June; only one is behind.
    api.getInvoices.mockResolvedValue({ results: [invoice(1), invoice(2, { is_overdue: true })], count: 2 });
    renderPage();

    await screen.findByText("INV-2026-000001");
    expect(screen.getAllByText("Overdue")).toHaveLength(1);
    expect(screen.getByText("1 overdue")).toBeTruthy();
  });

  it("shows the next installment's date, not the first one's", async () => {
    api.getInvoices.mockResolvedValue({ results: [invoice(1)], count: 1 });
    api.getInvoice.mockResolvedValue(invoice(1));
    renderPage();

    fireEvent.click(await screen.findByText("INV-2026-000001"));
    const header = await screen.findByText(/Next due:/, {}, { timeout: 5000 });
    expect(header.textContent).toMatch(/Nov/);
    expect(header.textContent).not.toMatch(/Jun/);
  });
});

describe("Void and re-issue", { timeout: 20_000 }, () => {
  it("offers Re-issue, not Void, on an invoice with payments, and moves to the new invoice", async () => {
    api.getInvoices.mockResolvedValue({ results: [invoice(1)], count: 1 });
    api.getInvoice.mockImplementation((id) => Promise.resolve(
      id === 9 ? invoice(9, { payment_plan: "annual", invoice_no: "INV-2026-000009" }) : invoice(1),
    ));
    api.reissueInvoice.mockResolvedValue({ voided_invoice_no: "INV-2026-000001", invoice: invoice(9) });
    renderPage();

    fireEvent.click(await screen.findByText("INV-2026-000001"));
    const reissue = await screen.findByRole("button", { name: /Re-issue/ }, { timeout: 5000 });
    // Within the invoice's own actions -- the status filter has a "Void" chip.
    expect(within(reissue.parentElement).queryByRole("button", { name: /^Void$/ })).toBeNull();

    fireEvent.click(reissue);
    const dialog = await screen.findByRole("dialog", {}, { timeout: 5000 });
    expect(within(dialog).getByText(/already paid moves to the new invoice/)).toBeTruthy();
    // The live rate, not a hardcoded 5%.
    expect(within(dialog).getByText(/6% off tuition/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Annual/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Re-issue invoice/ }));

    await waitFor(() => expect(api.reissueInvoice).toHaveBeenCalledWith(1, { payment_plan: "annual" }));
    await waitFor(() => expect(api.getInvoice).toHaveBeenCalledWith(9));
  });

  it("offers Void on an invoice nobody has paid", async () => {
    const unpaid = invoice(3, { status: "unpaid", total_paid: "0.00", balance: "46000.00" });
    api.getInvoices.mockResolvedValue({ results: [unpaid], count: 1 });
    api.getInvoice.mockResolvedValue(unpaid);
    renderPage();

    fireEvent.click(await screen.findByText("INV-2026-000003"));
    const actions = (await screen.findByRole("button", { name: /Re-issue/ }, { timeout: 5000 })).parentElement;
    expect(within(actions).getByRole("button", { name: /^Void$/ })).toBeTruthy();
  });
});

describe("Generate", { timeout: 20_000 }, () => {
  it("says the student is already invoiced for the year and opens that invoice", async () => {
    api.getInvoices.mockResolvedValue({ results: [], count: 0 });
    api.getInvoice.mockResolvedValue(invoice(1));
    api.getEnrollments.mockResolvedValue({ results: [{ enrollment_id: 5, student_name: "Ana Cruz", school_year: "2026-2027", grade_level: "Grade 11", section: "STEM-A" }] });
    api.generateInvoice.mockRejectedValue({
      response: { status: 409, data: {
        code: "already_invoiced", invoice_id: 1, invoice_no: "INV-2026-000001",
        detail: "Already invoiced for SY 2026-2027: INV-2026-000001 (monthly plan). To change the payment plan or correct it, re-issue that invoice.",
      } },
    });
    renderPage();

    fireEvent.click((await screen.findAllByRole("button", { name: /Generate Invoice/ }))[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText(/Search by student name/), { target: { value: "Ana" } });
    fireEvent.click(await within(dialog).findByText("Ana Cruz"));
    fireEvent.click(within(dialog).getAllByRole("button", { name: /Generate Invoice/ }).at(-1));

    expect(await within(dialog).findByText(/Already invoiced for SY 2026-2027/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Open INV-2026-000001" }));
    await waitFor(() => expect(api.getInvoice).toHaveBeenCalledWith(1));
  });
});
