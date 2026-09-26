/**
 * PaymentsPage — the school-year scope on a cold load.
 *
 * The page opens on the current year, but School Settings can name a different
 * one after the first fetch has already gone out (the context starts from its
 * last-seen or computed year). The page used to move the picker but keep the
 * first result, so the collection tiles showed one year's money under a label
 * naming another.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getPayments = vi.fn();
const getPaymentSummary = vi.fn();
let schoolYearCtx;

vi.mock("../../api/billingApi", () => ({
  getPayments: (...a) => getPayments(...a),
  getPaymentSummary: (...a) => getPaymentSummary(...a),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => schoolYearCtx,
}));

const { default: PaymentsPage } = await import("../PaymentsPage");

function ctx(currentYear) {
  return { currentYear, options: ["2026-2027", "2025-2026"], yearCounts: {} };
}

function payment(id, name) {
  return {
    payment_id: id,
    amount_paid: "1000.00",
    payment_method: "cash",
    payment_date: "2026-09-01",
    invoice_detail: { student_name: name, invoice_no: `INV-${id}` },
  };
}

function page() {
  return (
    <MemoryRouter initialEntries={["/payments"]}>
      <PaymentsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getPaymentSummary.mockResolvedValue({ school_years: ["2026-2027", "2025-2026"] });
});

describe("PaymentsPage — school year on a cold load", () => {
  it("reloads for the School Settings year once it arrives, and ignores the stale first result", async () => {
    let finishStaleYear;
    getPayments.mockImplementation((params) =>
      params.school_year === "2026-2027"
        ? Promise.resolve({ results: [payment(2, "This Year Student")], count: 1 })
        : new Promise((resolve) => { finishStaleYear = resolve; }),
    );

    schoolYearCtx = ctx("2025-2026");
    const { rerender } = render(page());
    await waitFor(() => expect(getPayments).toHaveBeenCalledTimes(1));
    expect(getPayments).toHaveBeenCalledWith(expect.objectContaining({ school_year: "2025-2026" }));

    schoolYearCtx = ctx("2026-2027");
    rerender(page());

    await waitFor(() =>
      expect(getPayments).toHaveBeenLastCalledWith(expect.objectContaining({ school_year: "2026-2027" })),
    );
    expect(await screen.findByText("This Year Student")).toBeTruthy();

    // The first request, for the stale year, finally returns.
    finishStaleYear({ results: [payment(1, "Old Year Student")], count: 1 });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText("Old Year Student")).toBeNull();
    expect(screen.getByText("This Year Student")).toBeTruthy();
  });

  it("does not fetch twice when the year is already known", async () => {
    getPayments.mockResolvedValue({ results: [], count: 0 });
    schoolYearCtx = ctx("2026-2027");
    render(page());

    await waitFor(() => expect(getPayments).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(getPayments).toHaveBeenCalledTimes(1);
    expect(getPayments).toHaveBeenCalledWith(expect.objectContaining({ school_year: "2026-2027" }));
  });
});

describe("PaymentsPage — Clear filters", () => {
  it("goes back to the current year with a single request", async () => {
    getPayments.mockResolvedValue({ results: [], count: 0 });
    schoolYearCtx = ctx("2026-2027");
    render(page());
    await waitFor(() => expect(getPayments).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /school year: 2026-2027/i }));
    fireEvent.click(await screen.findByRole("option", { name: /2025-2026/ }));
    await waitFor(() =>
      expect(getPayments).toHaveBeenLastCalledWith(expect.objectContaining({ school_year: "2025-2026" })),
    );

    getPayments.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await waitFor(() => expect(getPayments).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));

    expect(getPayments).toHaveBeenCalledTimes(1);
    expect(getPayments).toHaveBeenCalledWith(expect.objectContaining({ school_year: "2026-2027" }));
    expect(screen.getByRole("button", { name: /school year: 2026-2027/i })).toBeTruthy();
  });
});
