/**
 * InvoicesPage — the band, menus and search, as on the other list pages.
 *
 * The band is where the year's invoices stand (unpaid, partial, paid, void),
 * from /invoices/summary/, and its legend is the status filter. Its counts
 * follow the year, plan and past-due menu, not the status or the search.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  getInvoices: vi.fn(),
  getInvoice: vi.fn(),
  getInvoiceSummary: vi.fn(),
  getDiscountTypes: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);
vi.mock("../../api/billingApi", () => ({
  getInvoices: pass("getInvoices"),
  getInvoice: pass("getInvoice"),
  getInvoiceSummary: pass("getInvoiceSummary"),
  generateInvoice: vi.fn(),
  voidInvoice: vi.fn(),
  reissueInvoice: vi.fn(),
  getDiscountTypes: pass("getDiscountTypes"),
}));
vi.mock("../../api/enrollmentApi", () => ({ getEnrollments: vi.fn() }));
vi.mock("../../components/RecordPaymentModal", () => ({ default: () => null }));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ currentYear: "2026-2027", options: ["2026-2027", "2025-2026"], yearCounts: {} }),
}));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: InvoicesPage } = await import("../InvoicesPage");

const INVOICE = {
  invoice_id: 1, invoice_no: "INV-2026-000001", enrollment_id: 101, status: "unpaid", payment_plan: "quarterly",
  is_overdue: false, balance: "9200.00",
  enrollment_detail: { student_name: "Ana Cruz", grade_level: "Grade 7" },
};

const legend = () => within(screen.getByRole("group", { name: "Filter by status" }));
const lastList = () => api.getInvoices.mock.lastCall[0];
const lastSummary = () => api.getInvoiceSummary.mock.lastCall[0];
const pick = (label, item) => {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}:`) }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: item }));
};
const renderAt = (url = "/invoices") => render(<MemoryRouter initialEntries={[url]}><InvoicesPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Acct", role: "accounting" }));
  api.getInvoices.mockResolvedValue({ results: [INVOICE], count: 1 });
  api.getInvoiceSummary.mockResolvedValue({
    unpaid: 97, partially_paid: 347, paid: 264, void: 33, total: 741, school_years: ["2026-2027", "2025-2026"],
  });
  api.getDiscountTypes.mockResolvedValue([]);
});

describe("Invoices — band", () => {
  it("shows where the year's invoices stand", async () => {
    renderAt();
    await screen.findByText("INV-2026-000001");

    expect(await legend().findByRole("button", { name: "All 741" })).toBeTruthy();
    expect(legend().getByRole("button", { name: "Unpaid 97" })).toBeTruthy();
    expect(legend().getByRole("button", { name: "Partial 347" })).toBeTruthy();
    expect(legend().getByRole("button", { name: "Void 33" })).toBeTruthy();
    expect(screen.getByText("invoices in S.Y. 2026-2027")).toBeTruthy();
    expect(lastSummary()).toEqual({ school_year: "2026-2027" });
  });

  it("filters by status from the legend, without recounting the band", async () => {
    renderAt();
    await screen.findByText("INV-2026-000001");
    const summaries = api.getInvoiceSummary.mock.calls.length;

    fireEvent.click(await legend().findByRole("button", { name: "Unpaid 97" }));

    await waitFor(() => expect(lastList()).toMatchObject({ status: "unpaid", page: 1 }));
    expect(screen.getByRole("heading", { name: "Unpaid invoices" })).toBeTruthy();
    expect(api.getInvoiceSummary.mock.calls.length).toBe(summaries);
  });
});

describe("Invoices — menus", () => {
  it("narrows the list and the band by plan and by a payment past due", async () => {
    renderAt();
    await screen.findByText("INV-2026-000001");

    pick("Plan", "Quarterly");
    await waitFor(() => expect(lastList().payment_plan).toBe("quarterly"));
    await waitFor(() => expect(lastSummary().payment_plan).toBe("quarterly"));

    pick("Due", "A payment is past due");
    await waitFor(() => expect(lastList().overdue).toBe("true"));
    await waitFor(() => expect(lastSummary().overdue).toBe("true"));
    expect(await screen.findByText("invoices in S.Y. 2026-2027 · Quarterly plan · with a payment past due")).toBeTruthy();
  });

  it("opens on past-due invoices from the admin home's link", async () => {
    renderAt("/invoices?overdue=1");
    await screen.findByText("INV-2026-000001");
    expect(lastList().overdue).toBe("true");
    expect(screen.getByRole("button", { name: "Due: Past due" })).toBeTruthy();
  });

  it("sorts by balance, which the server now works out", async () => {
    renderAt();
    await screen.findByText("INV-2026-000001");

    pick("Sort", "Largest balance");

    await waitFor(() => expect(lastList().ordering).toBe("-balance"));
  });

  it("searches by invoice number or name as you type", async () => {
    renderAt();
    await screen.findByText("INV-2026-000001");
    const summaries = api.getInvoiceSummary.mock.calls.length;

    fireEvent.change(screen.getByRole("searchbox", { name: /search invoices/i }), { target: { value: "cruz" } });

    await waitFor(() => expect(lastList().search).toBe("cruz"));
    expect(api.getInvoiceSummary.mock.calls.length).toBe(summaries);
  });
});
