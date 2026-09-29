/**
 * SchoolYearsPage — the registry every year picker reads.
 *
 * Pinned: each year's state is shown, make-current goes through a confirm
 * that says the old year stays open and then refreshes every picker, a year
 * that can't be deleted says why, and a new year starts as a copy of the
 * latest one, a year later.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  listRegisteredSchoolYears: vi.fn(),
  createSchoolYear: vi.fn(),
  updateSchoolYear: vi.fn(),
  deleteSchoolYear: vi.fn(),
  makeSchoolYearCurrent: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);
const refreshYears = vi.fn();

vi.mock("../../api/enrollmentApi", () => ({
  listRegisteredSchoolYears: pass("listRegisteredSchoolYears"),
  createSchoolYear: pass("createSchoolYear"),
  updateSchoolYear: pass("updateSchoolYear"),
  deleteSchoolYear: pass("deleteSchoolYear"),
  makeSchoolYearCurrent: pass("makeSchoolYearCurrent"),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ refreshYears }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: SchoolYearsPage } = await import("../SchoolYearsPage");

const YEARS = [
  { label: "2026-2027", state: "upcoming", start_date: "2026-06-08", end_date: "2027-03-31", enrollment_count: 0 },
  { label: "2025-2026", state: "current",  start_date: "2025-06-02", end_date: "2026-03-27", enrollment_count: 140 },
  { label: "2024-2025", state: "open",     start_date: "2024-06-03", end_date: "2025-03-28", enrollment_count: 120 },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/school-years"]}>
      <SchoolYearsPage />
    </MemoryRouter>,
  );
}

const rowFor = (label) => screen.getByText(`S.Y. ${label}`).closest("tr");

beforeEach(() => {
  vi.clearAllMocks();
  api.listRegisteredSchoolYears.mockResolvedValue(YEARS);
});

describe("SchoolYearsPage", () => {
  it("lists every year with its state", async () => {
    renderPage();
    await waitFor(() => expect(rowFor("2026-2027")).toBeTruthy());
    expect(within(rowFor("2026-2027")).getByText("Upcoming")).toBeTruthy();
    expect(within(rowFor("2025-2026")).getByText("Current")).toBeTruthy();
    expect(within(rowFor("2024-2025")).getByText("Open")).toBeTruthy();
    expect(screen.getByText(/Current: S\.Y\. 2025-2026/)).toBeTruthy();
  });

  it("makes a year current through a confirm, then refreshes every picker", async () => {
    api.makeSchoolYearCurrent.mockResolvedValue({ ...YEARS[0], state: "current" });
    renderPage();
    await waitFor(() => expect(rowFor("2026-2027")).toBeTruthy());

    fireEvent.click(within(rowFor("2026-2027")).getByRole("button", { name: /make current/i }));
    // The confirm says the old year isn't archived by the switch.
    expect(await screen.findByText(/stays open for final grades and late payments/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /make current/i }).at(-1));

    await waitFor(() => expect(api.makeSchoolYearCurrent).toHaveBeenCalledWith("2026-2027"));
    await waitFor(() => expect(refreshYears).toHaveBeenCalled());
    expect(api.listRegisteredSchoolYears).toHaveBeenCalledTimes(2);
  });

  it("offers no make-current on the current year", async () => {
    renderPage();
    await waitFor(() => expect(rowFor("2025-2026")).toBeTruthy());
    expect(within(rowFor("2025-2026")).queryByRole("button", { name: /make current/i })).toBeNull();
  });

  it("says why a year can't be deleted instead of letting the server refuse", async () => {
    renderPage();
    await waitFor(() => expect(rowFor("2025-2026")).toBeTruthy());
    const current = within(rowFor("2025-2026")).getByRole("button", { name: /can't be deleted/i });
    const withEnrollments = within(rowFor("2024-2025")).getByRole("button", { name: /has enrollments/i });
    expect(current.disabled).toBe(true);
    expect(withEnrollments.disabled).toBe(true);
    expect(within(rowFor("2026-2027")).getByRole("button", { name: "Delete S.Y. 2026-2027" }).disabled).toBe(false);
  });

  it("starts a new year as a copy of the latest one, a year later", async () => {
    api.createSchoolYear.mockResolvedValue({ label: "2027-2028", state: "upcoming" });
    renderPage();
    await waitFor(() => expect(rowFor("2026-2027")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /new school year/i }));
    expect(await screen.findByDisplayValue("2027-2028")).toBeTruthy();
    expect(screen.getByDisplayValue("2027-06-08")).toBeTruthy();
    expect(screen.getByDisplayValue("2028-03-31")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /add school year/i }));
    await waitFor(() =>
      expect(api.createSchoolYear).toHaveBeenCalledWith({
        label: "2027-2028", start_date: "2027-06-08", end_date: "2028-03-31",
      }),
    );
    await waitFor(() => expect(refreshYears).toHaveBeenCalled());
  });

  it("shows the server's reason next to the field it's about", async () => {
    api.createSchoolYear.mockRejectedValue({
      response: { data: { start_date: ["These dates overlap S.Y. 2026-2027 (Jun 8, 2026 – Mar 31, 2027)."] } },
    });
    renderPage();
    await waitFor(() => expect(rowFor("2026-2027")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /new school year/i }));
    fireEvent.click(await screen.findByRole("button", { name: /add school year/i }));
    expect(await screen.findByText(/These dates overlap S\.Y\. 2026-2027/)).toBeTruthy();
  });

  it("warns when no year is current", async () => {
    api.listRegisteredSchoolYears.mockResolvedValue([{ ...YEARS[0] }]);
    renderPage();
    expect(await screen.findByText("No current school year")).toBeTruthy();
  });
});
