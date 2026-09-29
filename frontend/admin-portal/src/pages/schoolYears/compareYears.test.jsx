/**
 * SchoolYearComparePage — registered years side by side, oldest on the left,
 * each column showing its change from the one before it.
 *
 * Pinned: which years it opens on (and that the URL can pick others), that a
 * year can be added or taken off, that a figure the server can't give reads
 * as "—" rather than 0, that fees line up by grade, and that billing failing
 * doesn't take the rest of the page with it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  listRegisteredSchoolYears: vi.fn(),
  compareSchoolYears: vi.fn(),
  getFinancialSummary: vi.fn(),
  getFeeSchedules: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/enrollmentApi", () => ({
  listRegisteredSchoolYears: pass("listRegisteredSchoolYears"),
  compareSchoolYears: pass("compareSchoolYears"),
}));
vi.mock("../../api/billingApi", () => ({
  getFinancialSummary: pass("getFinancialSummary"),
  getFeeSchedules: pass("getFeeSchedules"),
}));

const { default: SchoolYearComparePage } = await import("../SchoolYearComparePage");
const { defaultCompareYears, previousLabel } = await import("../../components/schoolYears/yearHelpers");

const YEARS = [
  { label: "2027-2028", state: "upcoming" },
  { label: "2026-2027", state: "current" },
  { label: "2025-2026", state: "open" },
  { label: "2024-2025", state: "archived" },
  { label: "2023-2024", state: "archived" },
];

const LEARNERS = { "2023-2024": 80, "2024-2025": 90, "2025-2026": 100, "2026-2027": 120, "2027-2028": 0 };

function yearData(label) {
  return {
    label,
    enrollment: {
      learners: LEARNERS[label],
      by_level: { nursery: 0, kindergarten: 10, elementary: LEARNERS[label] - 10, junior_highschool: 0, senior_highschool: 0 },
      new: label === "2023-2024" ? null : 20,
      returning: label === "2023-2024" ? null : LEARNERS[label] - 20,
      transferred_out: 2,
      pending: 0,
      came_back: label === "2026-2027" ? null : { count: 45, of: 50 },
    },
    sections: { total: 6, with_adviser: 5, advisers: 5 },
    academics: { graded_learners: 50, general_average: 85.5, passed_all: 48, attendance_rate: 96.0 },
    scholarships: { awarded: 3 },
  };
}

const FEES = {
  "2025-2026": [{ grade_level: "Grade 1", grand_total: "20000.00" }],
  "2026-2027": [
    { grade_level: "Grade 1", grand_total: "21000.00" },
    { grade_level: "Kindergarten", grand_total: "18000.00" },
  ],
};

function renderAt(url = "/school-years/compare") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SchoolYearComparePage />
    </MemoryRouter>,
  );
}

// A metric's row within one table: "Kindergarten" is both a learners row
// and a fees row.
const rowOf = async (table, label) =>
  (await within(await screen.findByRole("table", { name: table })).findByText(label)).closest("tr");
const lastCall = () => api.compareSchoolYears.mock.calls.at(-1)[0];

beforeEach(() => {
  vi.clearAllMocks();
  api.listRegisteredSchoolYears.mockResolvedValue(YEARS);
  api.compareSchoolYears.mockImplementation((years) => Promise.resolve({ years: years.map(yearData) }));
  api.getFinancialSummary.mockImplementation((y) => Promise.resolve({
    school_year: y, invoice_count: 10, net_billed: "100000.00", total_discounts: "5000.00",
    total_collected: "80000.00", outstanding: "20000.00",
  }));
  api.getFeeSchedules.mockImplementation(({ school_year }) => Promise.resolve({ results: FEES[school_year] ?? [] }));
});

describe("defaultCompareYears", () => {
  it("takes the current year and the two before it", () => {
    expect(defaultCompareYears(["2027-2028", "2026-2027", "2025-2026", "2024-2025"], "2026-2027"))
      .toEqual(["2024-2025", "2025-2026", "2026-2027"]);
  });

  it("takes the latest three when no year is current", () => {
    expect(defaultCompareYears(["2025-2026", "2026-2027"], undefined)).toEqual(["2025-2026", "2026-2027"]);
  });
});

describe("previousLabel", () => {
  it("steps a label back one year", () => {
    expect(previousLabel("2026-2027")).toBe("2025-2026");
  });

  it("has no answer for something that isn't a label", () => {
    expect(previousLabel("")).toBe("");
    expect(previousLabel(null)).toBe("");
  });
});

describe("SchoolYearComparePage", () => {
  it("opens on the current year and the two before it, oldest first", async () => {
    renderAt();
    await waitFor(() => expect(api.compareSchoolYears).toHaveBeenCalled());
    expect(lastCall()).toEqual(["2024-2025", "2025-2026", "2026-2027"]);
    expect(api.getFinancialSummary).toHaveBeenCalledWith("2026-2027");
    expect(api.getFeeSchedules).toHaveBeenCalledWith(expect.objectContaining({ school_year: "2026-2027", is_active: true }));

    const chooser = screen.getByRole("group", { name: "School years to compare" });
    expect(within(chooser).getByRole("button", { name: /2026-2027/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(chooser).getByRole("button", { name: /2027-2028/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("shows each year's figure and its change from the year before", async () => {
    renderAt();
    const learners = await rowOf("Learners by year", "Learners");
    await waitFor(() => expect(within(learners).getByText("120")).toBeTruthy());
    expect(within(learners).getByText("+20")).toBeTruthy();   // 100 -> 120
    expect(within(learners).getByText("+10")).toBeTruthy();   // 90 -> 100

    const sections = await rowOf("Classes by year", "Sections");
    expect(within(sections).getAllByText("No change")).toHaveLength(2);
  });

  it("reads a figure the server can't give as a dash, not a zero", async () => {
    renderAt();
    const cameBack = await rowOf("Learners by year", "Came back the next year");
    await waitFor(() => expect(within(cameBack).getAllByText("90.0%")).toHaveLength(2));
    expect(within(cameBack).getAllByText("45 of 50")).toHaveLength(2);
    expect(within(cameBack).getByText("—")).toBeTruthy();       // 2026-2027: next year has nothing yet
  });

  it("lets the URL pick the years, ignoring any that aren't registered", async () => {
    renderAt("/school-years/compare?years=2026-2027,2019-2020,2023-2024");
    await waitFor(() => expect(api.compareSchoolYears).toHaveBeenCalled());
    expect(lastCall()).toEqual(["2023-2024", "2026-2027"]);
  });

  it("adds and takes off a year, but never the last one", async () => {
    renderAt("/school-years/compare?years=2026-2027");
    const chooser = await screen.findByRole("group", { name: "School years to compare" });
    await waitFor(() => expect(lastCall()).toEqual(["2026-2027"]));
    expect(within(chooser).getByRole("button", { name: /2026-2027/ }).disabled).toBe(true);

    fireEvent.click(within(chooser).getByRole("button", { name: /2025-2026/ }));
    await waitFor(() => expect(lastCall()).toEqual(["2025-2026", "2026-2027"]));

    fireEvent.click(within(chooser).getByRole("button", { name: /2026-2027/ }));
    await waitFor(() => expect(lastCall()).toEqual(["2025-2026"]));
  });

  it("stops at five years", async () => {
    renderAt("/school-years/compare?years=2023-2024,2024-2025,2025-2026,2026-2027,2027-2028");
    const chooser = await screen.findByRole("group", { name: "School years to compare" });
    await waitFor(() => expect(lastCall()).toHaveLength(5));
    YEARS.forEach(({ label }) => {
      expect(within(chooser).getByRole("button", { name: new RegExp(label) }).getAttribute("aria-pressed")).toBe("true");
    });
  });

  it("lines fees up by grade, in grade order, with the change in pesos and percent", async () => {
    renderAt();
    const kinder = await rowOf("Fees by grade and year", "Kindergarten");
    const grade1 = await rowOf("Fees by grade and year", "Grade 1");
    // Fees table: Kindergarten sorts before Grade 1.
    const feeRows = within(grade1.closest("table")).getAllByRole("row").map((r) => r.cells[0]?.textContent);
    expect(feeRows.indexOf("Kindergarten")).toBeLessThan(feeRows.indexOf("Grade 1"));
    expect(within(grade1).getByText("+₱1,000.00 (5.0%)")).toBeTruthy();
    expect(within(kinder).getAllByText("—")).toHaveLength(2);
  });

  it("keeps learners and grades when billing can't be reached", async () => {
    api.getFinancialSummary.mockRejectedValue(new Error("Network Error"));
    renderAt();
    const learners = await rowOf("Learners by year", "Learners");
    await waitFor(() => expect(within(learners).getByText("120")).toBeTruthy());
    expect(await screen.findAllByText(/billing figures/)).not.toHaveLength(0);
  });

  it("says so when no year is registered", async () => {
    api.listRegisteredSchoolYears.mockResolvedValue([]);
    renderAt();
    expect(await screen.findByText("No school years yet")).toBeTruthy();
    expect(api.compareSchoolYears).not.toHaveBeenCalled();
  });
});
