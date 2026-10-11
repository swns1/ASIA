/**
 * SectionsPage on a dark page: the section list, a section with no adviser
 * (its roster), and one with an adviser per strand (the adviser switch).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeContext } from "../../hooks/useTheme";

const SECTIONS = [
  { section_id: 1, school_year: "2026-2027", school_level: "elementary", grade_level: "Grade 4", name: "Rosal", strand: null, enrollment_count: 1 },
  { section_id: 2, school_year: "2026-2027", school_level: "senior_highschool", grade_level: "Grade 11", name: "Hope", strand: null, enrollment_count: 0 },
];
const advisory = (id, teacher, strand) => ({
  advisory_id: id, teacher_user_id: teacher, school_year: "2026-2027",
  school_level: "senior_highschool", grade_level: "Grade 11", section: "Hope", strand,
});
const ADVISORIES = [advisory(1, 5, "STEM"), advisory(2, 6, "ABM")];

vi.mock("../../api/identityApi", () => ({
  getUsers: () => Promise.resolve([
    { user_id: 5, name: "Ana Cruz", role: "teacher" },
    { user_id: 6, name: "Ben Reyes", role: "teacher" },
  ]),
}));
vi.mock("../../api/enrollmentApi", () => ({
  getSections: () => Promise.resolve(SECTIONS),
  getSectionAdvisories: () => Promise.resolve(ADVISORIES),
  getEnrollments: () => Promise.resolve([
    { enrollment_id: 3, student_detail: { student_id: 9, first_name: "Lia", last_name: "Santos", student_number: "S-9" } },
  ]),
  getMySections: ({ teacher_user_id }) => Promise.resolve(ADVISORIES
    .filter((a) => a.teacher_user_id === teacher_user_id)
    .map((a) => ({ advisory: a, student_count: 0, students: [], subjects: [] }))),
  getSectionGrades: () => Promise.resolve([]),
  saveSectionGrades: () => Promise.resolve({}),
  getSectionAttendance: () => Promise.resolve([]),
  saveSectionAttendance: () => Promise.resolve({}),
  getSectionAttendanceStats: () => Promise.resolve({}),
  getSectionGradesSummary: () => Promise.resolve({}),
  getNarrativeCategories: () => Promise.resolve([]),
  getSectionNarrativeReports: () => Promise.resolve([]),
  saveSectionNarrativeReports: () => Promise.resolve({}),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ currentYear: "2026-2027", yearStates: { "2026-2027": "current" }, options: ["2026-2027"], yearCounts: {} }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: SectionsPage } = await import("../SectionsPage");

const renderDark = () => render(
  <ThemeContext.Provider value="dark">
    <div data-theme="dark">
      <MemoryRouter initialEntries={["/sections"]}>
        <SectionsPage />
      </MemoryRouter>
    </div>
  </ThemeContext.Provider>,
);

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("current_user", JSON.stringify({ id: 1, name: "Ada", role: "admin" }));
});

describe("SectionsPage — dark mode", () => {
  it("shows a section with no adviser, and its roster", async () => {
    renderDark();
    expect(await screen.findByText("Grade 4 · Rosal")).toBeTruthy();
    expect(await screen.findByText(/Santos/)).toBeTruthy();
  });

  it("switches between a section's advisers", async () => {
    renderDark();
    fireEvent.click(await screen.findByRole("button", { name: /^Hope/ }));
    const stem = await screen.findByRole("button", { name: "STEM · Ana Cruz" });
    expect(stem.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "ABM · Ben Reyes" }));
    expect(screen.getByRole("button", { name: "ABM · Ben Reyes" }).getAttribute("aria-pressed")).toBe("true");
  });
});
