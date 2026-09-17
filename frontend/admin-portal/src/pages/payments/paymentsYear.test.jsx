/**
 * PaymentsPage — the school-year scope on a cold load.
 *
 * On a device that has never picked a year, the global default arrives after
 * the page's first fetch. The page adopted it into the picker but kept the
 * first, all-years result, so the collection tiles showed every year's money
 * under a label naming one.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

function ctx(schoolYear) {
  return { schoolYear, options: ["2026-2027", "2025-2026"], yearCounts: {}, currentYear: "2026-2027" };
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/payments"]}>
      <PaymentsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getPaymentSummary.mockResolvedValue({});
});

describe("PaymentsPage — school year on a cold load", () => {
  it("reloads for the default year once it arrives, and ignores the stale all-years result", async () => {
    let finishAllYears;
    getPayments.mockImplementation((params) =>
      params.school_year
        ? Promise.resolve({ results: [payment(2, "This Year Student")], count: 1 })
        : new Promise((resolve) => { finishAllYears = resolve; }),
    );

    schoolYearCtx = ctx("");
    const { rerender } = renderPage();
    await waitFor(() => expect(getPayments).toHaveBeenCalledTimes(1));

    schoolYearCtx = ctx("2026-2027");
    rerender(
      <MemoryRouter initialEntries={["/payments"]}>
        <PaymentsPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(getPayments).toHaveBeenLastCalledWith(expect.objectContaining({ school_year: "2026-2027" })),
    );
    expect(await screen.findByText("This Year Student")).toBeTruthy();

    // The first request, for every year, finally returns.
    finishAllYears({ results: [payment(1, "Old Year Student")], count: 1 });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText("Old Year Student")).toBeNull();
    expect(screen.getByText("This Year Student")).toBeTruthy();
  });

  it("does not fetch twice when the year is already known", async () => {
    getPayments.mockResolvedValue({ results: [], count: 0 });
    schoolYearCtx = ctx("2026-2027");
    renderPage();

    await waitFor(() => expect(getPayments).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(getPayments).toHaveBeenCalledTimes(1);
    expect(getPayments).toHaveBeenCalledWith(expect.objectContaining({ school_year: "2026-2027" }));
  });
});
