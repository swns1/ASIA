/**
 * Teacher Advisories when an adviser's account is gone.
 *
 * A deleted teacher used to leave their sections pointing at "User #12" with
 * nothing to say the section had no working adviser -- nobody could take its
 * attendance or enter its grades. Accounts are now deactivated instead of
 * deleted; either way this page has to say which sections need a new adviser,
 * and never offer a deactivated teacher for one.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  getSectionAdvisories: vi.fn(),
  getUsers: vi.fn(),
};
vi.mock("../../api/enrollmentApi", () => ({
  getSectionAdvisories: (...a) => api.getSectionAdvisories(...a),
  createSectionAdvisory: vi.fn(),
  updateSectionAdvisory: vi.fn(),
  deleteSectionAdvisory: vi.fn(),
}));
vi.mock("../../api/identityApi", () => ({ getUsers: (...a) => api.getUsers(...a) }));
vi.mock("../../components/ui/SchoolYearPicker", () => ({ default: () => null }));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    schoolYear: "", currentYear: "2026-2027", options: ["2026-2027", "2025-2026"],
    counts: {}, setSchoolYear: () => {},
  }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: TeacherAdvisoriesPage } = await import("../TeacherAdvisoriesPage");

const ACTIVE = { user_id: 10, name: "Ana Active", email: "ana@school.ph", role: "teacher", is_active: true };
const GONE = { user_id: 11, name: "Ben Gone", email: "ben@school.ph", role: "teacher", is_active: false };

function advisory(id, teacher, school_year, section) {
  return {
    advisory_id: id, teacher_user_id: teacher, school_year, school_level: "elementary",
    grade_level: "Grade 4", section, strand: null,
  };
}

function renderPage() {
  return render(<MemoryRouter><TeacherAdvisoriesPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getUsers.mockResolvedValue([ACTIVE, GONE]);
  api.getSectionAdvisories.mockResolvedValue([
    advisory(1, 10, "2026-2027", "Rizal"),     // fine
    advisory(2, 11, "2026-2027", "Mabini"),    // deactivated adviser, this year
    advisory(3, 99, "2026-2027", "Bonifacio"), // account deleted outright
    advisory(4, 11, "2024-2025", "Luna"),      // history: not a gap
  ]);
});

describe("TeacherAdvisoriesPage", () => {
  it("counts the sections this year and later that need a new adviser", async () => {
    renderPage();
    expect(await screen.findByText(/2 sections need a new adviser/)).toBeTruthy();
  });

  it("marks those rows, and a past year's only as history", async () => {
    renderPage();
    await screen.findByText("Ana Active");

    expect(screen.getAllByText("Needs a new adviser")).toHaveLength(2);
    expect(screen.getByText("Adviser deactivated")).toBeTruthy();
    expect(screen.getByText("Removed account #99")).toBeTruthy();
  });

  it("never offers a deactivated teacher, and asks for a new adviser", async () => {
    renderPage();
    fireEvent.click(await screen.findByText("Mabini", { exact: false }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Choose a new adviser/)).toBeTruthy();
    const options = within(dialog).getAllByRole("option").map((o) => o.textContent);
    expect(options.some((t) => t.includes("Ana Active"))).toBe(true);
    expect(options.some((t) => t.includes("Ben Gone"))).toBe(false);
  });

  it("flags nothing when the teacher list couldn't load", async () => {
    api.getUsers.mockRejectedValue(new Error("down"));
    renderPage();
    await screen.findByText(/Rizal/);

    expect(screen.queryByText(/need a new adviser/)).toBeNull();
  });
});
