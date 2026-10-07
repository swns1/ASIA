/**
 * ScholarshipsPage — the awards list's band, menus and search.
 *
 * The band splits the year's awards by scholarship, each in its own colour,
 * and its legend is the scholarship filter. Its counts take the year, level,
 * grade and award dates, but not the search, which narrows only the rows.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  getEnrollmentScholarships: vi.fn(),
  getEnrollmentScholarshipSummary: vi.fn(),
  getScholarshipTypes: vi.fn(),
  getEnrollments: vi.fn(),
  getGrades: vi.fn(),
  createEnrollmentScholarship: vi.fn(),
  deleteEnrollmentScholarship: vi.fn(),
};
vi.mock("../../api/enrollmentApi", () =>
  Object.fromEntries(Object.keys(api).map((name) => [name, (...a) => api[name](...a)])),
);
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027", options: ["2026-2027", "2025-2026"], yearCounts: {}, yearStates: {},
  }),
}));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: ScholarshipsPage } = await import("../ScholarshipsPage");

const TYPES = [
  { scholarship_type_id: 2, scholarship_code: "4PS", scholarship_name: "4Ps Beneficiary", discount_mode: "percentage", discount_value: "20.00", is_active: true },
  { scholarship_type_id: 1, scholarship_code: "ESC", scholarship_name: "Education Service Contracting", discount_mode: "fixed_amount", discount_value: "14000.00", is_active: true },
  { scholarship_type_id: 7, scholarship_code: "OLD", scholarship_name: "Retired Grant", discount_mode: "percentage", discount_value: "5.00", is_active: false },
];
const AWARD = {
  enrollment_scholarship_id: 50, enrollment_id: 9, approved_at: "2026-08-03T00:00:00Z", notes: null,
  scholarship_type_detail: TYPES[1],
  enrollment_detail: { student_name: "Ana Cruz", school_year: "2026-2027", grade_level: "Grade 7", section: "Rizal" },
};

const legend = () => within(screen.getByRole("group", { name: "Filter by scholarship" }));
const lastList = () => api.getEnrollmentScholarships.mock.lastCall[0];
const lastSummary = () => api.getEnrollmentScholarshipSummary.mock.lastCall[0];
const renderPage = () => render(<MemoryRouter><ScholarshipsPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.getScholarshipTypes.mockResolvedValue(TYPES);
  api.getEnrollmentScholarships.mockResolvedValue({ results: [AWARD], count: 1 });
  api.getEnrollmentScholarshipSummary.mockResolvedValue({ 1: 35, 2: 136, total: 171 });
});

describe("Scholarship awards — band", () => {
  it("splits the year's awards by scholarship, leaving out a retired type nobody holds", async () => {
    renderPage();
    await screen.findByText("Ana Cruz");

    expect(await legend().findByRole("button", { name: "All 171" })).toBeTruthy();
    // Types in a fixed order (by id), each with its own count.
    const names = legend().getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["All 171", "Education Service Contracting 35", "4Ps Beneficiary 136"]);
    expect(screen.getByText("awards in S.Y. 2026-2027")).toBeTruthy();
    expect(lastSummary()).toEqual({ school_year: "2026-2027" });
  });

  it("filters by scholarship from the legend, without recounting the band", async () => {
    renderPage();
    await screen.findByText("Ana Cruz");
    const esc = await legend().findByRole("button", { name: "Education Service Contracting 35" });
    const summaries = api.getEnrollmentScholarshipSummary.mock.calls.length;

    fireEvent.click(esc);

    await waitFor(() => expect(lastList().scholarship_type).toBe("1"));
    expect(screen.getByRole("heading", { name: "Education Service Contracting" })).toBeTruthy();
    expect(api.getEnrollmentScholarshipSummary.mock.calls.length).toBe(summaries);
  });

  it("searches as you type, leaving the band to the year", async () => {
    renderPage();
    await screen.findByText("Ana Cruz");
    await waitFor(() => expect(api.getEnrollmentScholarshipSummary).toHaveBeenCalledTimes(1));

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.change(screen.getByRole("searchbox", { name: /search awards/i }), { target: { value: "cruz" } });
      act(() => vi.advanceTimersByTime(300));
      await act(async () => {});
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(lastList()).toMatchObject({ search: "cruz", page: 1 }));
    expect(api.getEnrollmentScholarshipSummary).toHaveBeenCalledTimes(1);
  });

  it("narrows the band and the list to the award dates picked", async () => {
    renderPage();
    await screen.findByText("Ana Cruz");

    fireEvent.click(screen.getByRole("button", { name: /^Awarded:/ }));
    const panel = screen.getByRole("dialog", { name: "Awarded" });
    fireEvent.change(within(panel).getByLabelText("From"), { target: { value: "2026-08-01" } });
    fireEvent.change(within(panel).getByLabelText("To"), { target: { value: "2026-08-31" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(lastList()).toMatchObject({ approved_after: "2026-08-01", approved_before: "2026-08-31" }));
    await waitFor(() => expect(lastSummary()).toMatchObject({ approved_after: "2026-08-01", approved_before: "2026-08-31" }));
    expect(screen.getByRole("button", { name: /^Awarded: Aug 1, 2026 – Aug 31, 2026/ })).toBeTruthy();
  });

  it("offers only active types when awarding", async () => {
    renderPage();
    await screen.findByText("Ana Cruz");
    fireEvent.click(screen.getByRole("button", { name: /award scholarship/i }));
    const dialog = await screen.findByRole("dialog");
    const options = within(dialog).getAllByRole("option").map((o) => o.textContent);
    expect(options.some((o) => o.includes("Retired Grant"))).toBe(false);
    expect(options.some((o) => o.includes("4Ps Beneficiary"))).toBe(true);
  });
});
