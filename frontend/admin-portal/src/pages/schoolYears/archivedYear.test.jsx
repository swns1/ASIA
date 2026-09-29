/**
 * An archived school year, on the pages that edit its records: said up front
 * (ArchivedYearNotice, the picker's Archived tag) rather than only in the
 * refusal after a save, and its records offered read-only.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  getSectionAdvisories: vi.fn(),
  createSectionAdvisory: vi.fn(),
  updateSectionAdvisory: vi.fn(),
  deleteSectionAdvisory: vi.fn(),
  getSections: vi.fn(),
  createSection: vi.fn(),
};
vi.mock("../../api/enrollmentApi", () =>
  Object.fromEntries(Object.keys(api).map((k) => [k, (...a) => api[k](...a)])),
);
vi.mock("../../api/identityApi", () => ({
  getUsers: () => Promise.resolve([{ user_id: 7, name: "Ana Cruz", role: "teacher" }]),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
// 2026-2027 is current, 2024-2025 archived.
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027",
    options: ["2026-2027", "2025-2026", "2024-2025"],
    yearCounts: {},
    yearStates: { "2026-2027": "current", "2025-2026": "open", "2024-2025": "archived" },
    entryYears: ["2026-2027", "2025-2026"],
  }),
}));

const { default: ArchivedYearNotice } = await import("../../components/schoolYears/ArchivedYearNotice");
const { default: SchoolYearPicker } = await import("../../components/ui/SchoolYearPicker");
const { default: TeacherAdvisoriesPage } = await import("../TeacherAdvisoriesPage");

const asRole = (role) => sessionStorage.setItem("current_user", JSON.stringify({ name: "Staff", role }));
const inRouter = (ui, url = "/") => render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  asRole("admin");
});

describe("ArchivedYearNotice", () => {
  it("says an archived year is read-only, with the way back for an admin", () => {
    inRouter(<ArchivedYearNotice schoolYear="2024-2025" records="grades" />);
    expect(screen.getByText("S.Y. 2024-2025 is archived")).toBeTruthy();
    expect(screen.getByText(/Its grades are read-only/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open S.Y. 2024-2025" }).getAttribute("href"))
      .toBe("/school-years/2024-2025");
  });

  it("tells everyone else who can unarchive it", () => {
    asRole("registrar");
    inRouter(<ArchivedYearNotice schoolYear="2024-2025" records="grades" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/An admin can unarchive it under School Years/)).toBeTruthy();
  });

  it("says nothing for an open year", () => {
    const { container } = inRouter(<ArchivedYearNotice schoolYear="2025-2026" records="grades" />);
    expect(container.textContent).toBe("");
  });
});

describe("SchoolYearPicker", () => {
  it("tags an archived year", () => {
    render(<SchoolYearPicker value="2024-2025" onChange={() => {}} />);
    const trigger = screen.getByRole("button", { name: "School year: 2024-2025 (archived)" });
    expect(within(trigger).getByText("Archived")).toBeTruthy();
  });

  it("but not an open one", () => {
    render(<SchoolYearPicker value="2025-2026" onChange={() => {}} />);
    expect(screen.queryByText("Archived")).toBeNull();
  });
});

describe("TeacherAdvisoriesPage", () => {
  it("offers an archived year's advisers read-only, and the rest as before", async () => {
    api.getSectionAdvisories.mockResolvedValue({ results: [
      { advisory_id: 1, teacher_user_id: 7, school_year: "2024-2025", school_level: "junior_highschool",
        grade_level: "Grade 7", section: "Rizal", strand: null },
      { advisory_id: 2, teacher_user_id: 7, school_year: "2025-2026", school_level: "junior_highschool",
        grade_level: "Grade 8", section: "Rizal", strand: null },
    ] });
    inRouter(<TeacherAdvisoriesPage />, "/teacher-advisories");
    // All years, so both show.
    fireEvent.click(await screen.findByRole("button", { name: /^School year:/ }));
    fireEvent.click(screen.getByRole("option", { name: /All years/ }));

    const archivedRow = (await screen.findByText("Grade 7 · Rizal")).closest("tr");
    expect(within(archivedRow).getByText("Archived")).toBeTruthy();
    expect(within(archivedRow).queryByRole("button", { name: /Edit|Remove/ })).toBeNull();

    const openRow = screen.getByText("Grade 8 · Rizal").closest("tr");
    expect(within(openRow).getByRole("button", { name: "Edit Ana Cruz's advisory" })).toBeTruthy();
  });

  it("names the archived year when it's the one picked", async () => {
    api.getSectionAdvisories.mockResolvedValue({ results: [] });
    inRouter(<TeacherAdvisoriesPage />, "/teacher-advisories?school_year=2024-2025");
    expect(await screen.findByText("S.Y. 2024-2025 is archived")).toBeTruthy();
    expect(screen.getByText(/Its advisory assignments are read-only/)).toBeTruthy();
  });
});
