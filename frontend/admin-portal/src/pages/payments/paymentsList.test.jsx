/**
 * PaymentsPage — the band, menus and search, as on the other list pages.
 *
 * The band is what came in, by payment method, in pesos; its legend is the
 * method filter. Its totals follow the year, dates and amounts, but never the
 * method picked (that would zero the other five) or the search, which narrows
 * only the rows.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getPayments = vi.fn();
const getPaymentSummary = vi.fn();
vi.mock("../../api/billingApi", () => ({
  getPayments: (...a) => getPayments(...a),
  getPaymentSummary: (...a) => getPaymentSummary(...a),
}));
vi.mock("../../components/RecordPaymentModal", () => ({ default: () => null }));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ currentYear: "2026-2027", options: ["2026-2027", "2025-2026"], yearCounts: {} }),
}));

const { default: PaymentsPage } = await import("../PaymentsPage");

const SUMMARY = {
  cash: 3092430.89, gcash: 3005023.26, bank_transfer: 1926847.12, card: 744667.78, check: 546597.51, others: 273983.35,
  total: 9589549.91, school_years: ["2026-2027", "2025-2026"], year_counts: {},
};
const PAYMENT = {
  payment_id: 1, invoice: 3, amount_paid: "2500.00", payment_method: "gcash", payment_date: "2026-09-01",
  reference_number: "GC-123", notes: null, invoice_detail: { student_name: "Ana Cruz", invoice_no: "INV-2026-000003" },
};

const legend = () => within(screen.getByRole("group", { name: "Filter by payment method" }));
const lastList = () => getPayments.mock.lastCall[0];
const lastSummary = () => getPaymentSummary.mock.lastCall[0];
const renderPage = () => render(<MemoryRouter initialEntries={["/payments"]}><PaymentsPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  getPayments.mockResolvedValue({ results: [PAYMENT], count: 1 });
  getPaymentSummary.mockResolvedValue(SUMMARY);
});

describe("Payments — band", () => {
  it("shows what came in by method, in whole pesos", async () => {
    renderPage();
    await screen.findByText("Ana Cruz");

    expect(legend().getByRole("button", { name: "All ₱9,589,550" }).getAttribute("aria-pressed")).toBe("true");
    expect(legend().getByRole("button", { name: "GCash ₱3,005,023" })).toBeTruthy();
    expect(screen.getByText("collected in S.Y. 2026-2027")).toBeTruthy();
    expect(within(screen.getByText("Ana Cruz").closest("tr")).getByText("GCash")).toBeTruthy();
  });

  it("filters by method from the legend, never scoping the totals to it", async () => {
    renderPage();
    await screen.findByText("Ana Cruz");

    fireEvent.click(legend().getByRole("button", { name: "Cash ₱3,092,431" }));

    await waitFor(() => expect(lastList()).toMatchObject({ payment_method: "cash", page: 1 }));
    expect(lastSummary().payment_method).toBeUndefined();
    expect(screen.getByRole("heading", { name: "Cash payments" })).toBeTruthy();
  });

  it("keeps the search out of the totals", async () => {
    renderPage();
    await screen.findByText("Ana Cruz");

    fireEvent.change(screen.getByRole("searchbox", { name: /search payments/i }), { target: { value: "cruz" } });

    await waitFor(() => expect(lastList().search).toBe("cruz"), { timeout: 2000 });
    expect(lastSummary().search).toBeUndefined();
  });
});

describe("Payments — menus", () => {
  it("narrows by a date pick and an amount range, totals included", async () => {
    renderPage();
    await screen.findByText("Ana Cruz");

    fireEvent.click(screen.getByRole("button", { name: /^Date:/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Date" })).getByRole("button", { name: "Today" }));
    await waitFor(() => expect(lastList().date_from).toBeTruthy());
    expect(lastList().date_from).toBe(lastList().date_to);
    expect(lastSummary().date_from).toBe(lastList().date_from);
    expect(screen.getByRole("button", { name: "Date: Today" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Amount:/ }));
    const panel = screen.getByRole("dialog", { name: "Amount" });
    fireEvent.change(within(panel).getByLabelText(/At least/), { target: { value: "1000" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(lastList().amount_min).toBe("1000"));
    expect(lastSummary().amount_min).toBe("1000");
    expect(screen.getByRole("button", { name: "Amount: At least ₱1,000" })).toBeTruthy();
  });

  it("sorts from the Sort menu", async () => {
    renderPage();
    await screen.findByText("Ana Cruz");

    fireEvent.click(screen.getByRole("button", { name: /^Sort:/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Largest first" }));

    await waitFor(() => expect(lastList().ordering).toBe("-amount_paid"));
  });
});
