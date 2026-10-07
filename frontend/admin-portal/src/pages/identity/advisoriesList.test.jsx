/**
 * TeacherAdvisoriesPage — the band, menus and search, as on the other list
 * pages. The band is where each section's adviser stands, for the year (and
 * level) picked, and its legend is the filter.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = { getSectionAdvisories: vi.fn(), getUsers: vi.fn() };
vi.mock("../../api/enrollmentApi", () => ({
  getSectionAdvisories: (...a) => api.getSectionAdvisories(...a),
  createSectionAdvisory: vi.fn(),
  updateSectionAdvisory: vi.fn(),
  deleteSectionAdvisory: vi.fn(),
}));
vi.mock("../../api/identityApi", () => ({ getUsers: (...a) => api.getUsers(...a) }));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027", options: ["2026-2027", "2025-2026"], entryYears: ["2026-2027"],
    yearCounts: {}, yearStates: {},
  }),
}));
vi.mock("../../components/sections/SectionSelect", () => ({ default: () => null }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: TeacherAdvisoriesPage } = await import("../TeacherAdvisoriesPage");

const advisory = (id, teacher, school_year, level, grade, section) => ({
  advisory_id: id, teacher_user_id: teacher, school_year, school_level: level,
  grade_level: grade, section, strand: null,
});

const legend = () => within(screen.getByRole("group", { name: "Filter by adviser" }));
const pick = (label, item) => {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}:`) }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: item }));
};
const renderPage = () => render(<MemoryRouter><TeacherAdvisoriesPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.getUsers.mockResolvedValue([
    { user_id: 10, name: "Ana Active", role: "teacher", is_active: true },
    { user_id: 11, name: "Ben Gone", role: "teacher", is_active: false },
  ]);
  api.getSectionAdvisories.mockResolvedValue([
    advisory(1, 10, "2026-2027", "elementary", "Grade 4", "Rizal"),
    advisory(2, 11, "2026-2027", "junior_highschool", "Grade 7", "Mabini"),
    advisory(3, 10, "2026-2027", "junior_highschool", "Grade 8", "Luna"),
    advisory(4, 11, "2025-2026", "elementary", "Grade 3", "Jacinto"),
  ]);
});

describe("Teacher advisories — band", () => {
  it("counts the year's sections by where their adviser stands", async () => {
    renderPage();
    await screen.findByText("Grade 4 · Rizal");

    expect(legend().getByRole("button", { name: "All 3" })).toBeTruthy();
    expect(legend().getByRole("button", { name: "Active adviser 2" })).toBeTruthy();
    expect(legend().getByRole("button", { name: "Needs a new adviser 1" })).toBeTruthy();
    expect(screen.getByText("advisories in S.Y. 2026-2027")).toBeTruthy();
  });

  it("lists the sections that need an adviser from the legend", async () => {
    renderPage();
    await screen.findByText("Grade 4 · Rizal");

    fireEvent.click(legend().getByRole("button", { name: "Needs a new adviser 1" }));

    expect(screen.queryByText("Grade 4 · Rizal")).toBeNull();
    expect(screen.getByText("Grade 7 · Mabini")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sections that need a new adviser" })).toBeTruthy();
  });

  it("narrows the band by level, and by year", async () => {
    renderPage();
    await screen.findByText("Grade 4 · Rizal");

    pick("Level", "Junior High");
    expect(legend().getByRole("button", { name: "All 2" })).toBeTruthy();
    expect(screen.getByText("advisories in S.Y. 2026-2027 · Junior High")).toBeTruthy();

    pick("School year", /S\.Y\. 2025-2026/);
    expect(legend().getByRole("button", { name: "All 0" })).toBeTruthy();
    pick("Level", "All levels");
    expect(legend().getByRole("button", { name: "Adviser deactivated 1" })).toBeTruthy();
  });

  it("searches by teacher name without changing the band", async () => {
    renderPage();
    await screen.findByText("Grade 4 · Rizal");

    fireEvent.change(screen.getByRole("searchbox", { name: /search advisories/i }), { target: { value: "ben" } });

    expect(screen.queryByText("Grade 4 · Rizal")).toBeNull();
    expect(screen.getByText("Grade 7 · Mabini")).toBeTruthy();
    expect(legend().getByRole("button", { name: "All 3" })).toBeTruthy();
  });
});
