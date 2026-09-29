/**
 * SchoolYearDetailPage — one year's setup: the checklist, its sections laid
 * out on the grade ladder, adding and renaming a section, and copying the
 * sections of an earlier year (previewed by the server's own dry run).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = {
  getSchoolYear: vi.fn(),
  getSchoolYearSetup: vi.fn(),
  getSections: vi.fn(),
  listRegisteredSchoolYears: vi.fn(),
  makeSchoolYearCurrent: vi.fn(),
  createSection: vi.fn(),
  updateSection: vi.fn(),
  deleteSection: vi.fn(),
  carryOverSchoolYear: vi.fn(),
  createSchoolYear: vi.fn(),
  updateSchoolYear: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);
const refreshYears = vi.fn();

vi.mock("../../api/enrollmentApi", () => Object.fromEntries(Object.keys(api).map((k) => [k, pass(k)])));
vi.mock("../../context/SchoolYearContext", () => ({ useSchoolYear: () => ({ refreshYears }) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: SchoolYearDetailPage } = await import("../SchoolYearDetailPage");

const YEAR = { label: "2027-2028", state: "upcoming", start_date: "2027-06-07", end_date: "2028-03-31" };
const YEARS = [
  YEAR,
  { label: "2026-2027", state: "current", start_date: "2026-06-08", end_date: "2027-03-31" },
];
const section = (id, grade, name, extra = {}) => ({
  section_id: id, school_year: "2027-2028", grade_level: grade, name, strand: null,
  school_level: "junior_highschool", enrollment_count: 0, adviser_count: 0, ...extra,
});

function renderAt(url = "/school-years/2027-2028") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/school-years/:label" element={<SchoolYearDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getSchoolYear.mockResolvedValue(YEAR);
  api.listRegisteredSchoolYears.mockResolvedValue(YEARS);
  api.getSchoolYearSetup.mockResolvedValue({
    sections: { count: 0, grades: 0 },
    advisers: { sections: 0, with_adviser: 0 },
    calendar: { quarters_set: 2, holidays: 0 },
  });
  api.getSections.mockResolvedValue([]);
});

describe("SchoolYearDetailPage — overview", () => {
  it("shows the setup checklist with what's missing", async () => {
    renderAt();
    expect(await screen.findByText("Setup checklist")).toBeTruthy();
    expect(screen.getByText(/None yet — enrollment and advisers pick from these/)).toBeTruthy();
    expect(screen.getByText("2 of 4 grading periods set on the calendar")).toBeTruthy();
    // An empty year offers to start from an earlier one.
    expect(screen.getByRole("button", { name: /Copy from an earlier year/ })).toBeTruthy();
  });

  it("makes the year current through a confirm", async () => {
    api.makeSchoolYearCurrent.mockResolvedValue({ ...YEAR, state: "current" });
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "Make current" }));
    expect(await screen.findByText(/S\.Y\. 2026-2027 stays open/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Make current" }).at(-1));
    await waitFor(() => expect(api.makeSchoolYearCurrent).toHaveBeenCalledWith("2027-2028"));
    await waitFor(() => expect(refreshYears).toHaveBeenCalled());
  });
});

describe("SchoolYearDetailPage — sections", () => {
  it("lays sections out on the grade ladder, with empty grades visible", async () => {
    api.getSections.mockResolvedValue([
      section(1, "Grade 7", "Rizal", { enrollment_count: 31, adviser_count: 1 }),
      section(2, "Grade 11", "STEM-A", { school_level: "senior_highschool", strand: "STEM" }),
    ]);
    renderAt("/school-years/2027-2028?tab=sections");
    expect(await screen.findByText("2 sections across 2 grades")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Grade 7 Rizal: 31 learners, has an adviser/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Grade 11 STEM-A, STEM/ })).toBeTruthy();
    // Grade 8 has none, and says so rather than being left out.
    const grade8 = screen.getByText("Grade 8").closest("li");
    expect(within(grade8).getByText("No sections")).toBeTruthy();
  });

  it("adds a section to the grade it was opened from", async () => {
    api.createSection.mockResolvedValue(section(3, "Grade 8", "Mabini"));
    renderAt("/school-years/2027-2028?tab=sections");
    fireEvent.click(await screen.findByRole("button", { name: "Add a Grade 8 section" }));
    fireEvent.change(await screen.findByPlaceholderText("e.g. Rizal"), { target: { value: "Mabini" } });
    // The dialog's button, not the toolbar's.
    fireEvent.click(screen.getAllByRole("button", { name: "Add section" }).at(-1));
    await waitFor(() => expect(api.createSection).toHaveBeenCalledWith({
      school_year: "2027-2028", school_level: "junior_highschool", grade_level: "Grade 8",
      name: "Mabini", strand: null,
    }));
    // The list and the checklist both reload.
    await waitFor(() => expect(api.getSections).toHaveBeenCalledTimes(2));
  });

  it("won't remove a section that still has learners", async () => {
    api.getSections.mockResolvedValue([section(1, "Grade 7", "Rizal", { enrollment_count: 31 })]);
    renderAt("/school-years/2027-2028?tab=sections");
    fireEvent.click(await screen.findByRole("button", { name: /Grade 7 Rizal/ }));
    expect((await screen.findByRole("button", { name: "Remove" })).disabled).toBe(true);
    expect(screen.getByText(/A section can only be removed once it's empty/)).toBeTruthy();
  });

  it("previews a copy from an earlier year, then applies it", async () => {
    api.carryOverSchoolYear.mockImplementation((label, body) => Promise.resolve({
      from: "2026-2027", to: label, dry_run: Boolean(body.dry_run),
      sections: {
        copied: [
          { grade_level: "Grade 7", name: "Rizal", strand: null },
          { grade_level: "Grade 11", name: "STEM-A", strand: "STEM" },
        ],
        skipped: [{ grade_level: "Grade 7", name: "Mabini", strand: null }],
      },
    }));
    renderAt("/school-years/2027-2028?tab=sections");
    fireEvent.click(await screen.findByRole("button", { name: /Copy from an earlier year/ }));

    // The preview is the server's dry run, from the nearest other year.
    await waitFor(() => expect(api.carryOverSchoolYear).toHaveBeenCalledWith(
      "2027-2028", { from: "2026-2027", parts: ["sections"], dry_run: true },
    ));
    expect(await screen.findByText("Will add 2 sections:")).toBeTruthy();
    expect(screen.getByText("STEM-A · STEM")).toBeTruthy();
    expect(screen.getByText(/1 already here is left as it is/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy 2 sections" }));
    await waitFor(() => expect(api.carryOverSchoolYear).toHaveBeenLastCalledWith(
      "2027-2028", { from: "2026-2027", parts: ["sections"] },
    ));
  });
});
