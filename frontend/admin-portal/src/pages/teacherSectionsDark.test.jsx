/**
 * My Sections on a dark page: the roster (with its quick view), and the
 * attendance, grades, narrative and stats tabs, for the teacher who edits
 * them and the registrar who only views them.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeContext } from "../hooks/useTheme";

let role = "teacher";

const STUDENT = { student_id: 9, first_name: "Ana", last_name: "Cruz", student_number: "S-9", lrn: "1234", sex: "F" };

vi.mock("../utils/auth", async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: () => ({ role, user_id: 5 }),
}));
vi.mock("../api/identityApi", () => ({
  getUsers: () => Promise.resolve([{ user_id: 5, name: "Lea Tan", email: "lea@school.ph", role: "teacher", is_active: true }]),
}));
vi.mock("../api/enrollmentApi", () => ({
  getMySections: () =>
    Promise.resolve([
      {
        advisory: {
          advisory_id: 1, teacher_user_id: 5, school_year: "2026-2027",
          school_level: "elementary", grade_level: "Grade 4", section: "Rosal",
        },
        student_count: 1,
        students: [STUDENT],
        subjects: [{ subject_id: 3, subject_code: "MATH4", subject_name: "Mathematics" }],
      },
    ]),
  getSectionGrades: () =>
    Promise.resolve([{ student: STUDENT, enrollment_id: 7, grade: { numeric_grade: 88 } }]),
  saveSectionGrades: () => Promise.resolve({}),
  getSectionAttendance: () =>
    Promise.resolve([{ student: STUDENT, attendance: { status: "L", remarks: "Bus" } }]),
  saveSectionAttendance: () => Promise.resolve({}),
  getSectionAttendanceStats: () =>
    Promise.resolve({
      total_school_days: 1,
      totals: { present: 0, absent: 0, late: 1, excused: 0, total_marks: 1 },
      daily: [{ date: "2026-10-01", total: 1, present: 0, absent: 0, late: 1, excused: 0 }],
      per_student: [{ student_id: 9, name: "Ana Cruz", present: 0, absent: 0, late: 1, excused: 0, attendance_rate: 80 }],
    }),
  getSectionGradesSummary: () =>
    Promise.resolve({ average: 88, graded_count: 1, pass_rate: 100, distribution: { "90_100": 0, "75_89": 1, below_75: 0 } }),
  getNarrativeCategories: () => Promise.resolve([{ category_id: 2, name: "Respect" }]),
  getSectionNarrativeReports: () =>
    Promise.resolve([{ student: STUDENT, ratings: { 2: "AO" } }]),
  saveSectionNarrativeReports: () => Promise.resolve({}),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: TeacherSectionsPage } = await import("./TeacherSectionsPage");

const renderDark = () => render(
  <ThemeContext.Provider value="dark">
    <div data-theme="dark">
      <MemoryRouter initialEntries={["/my-sections"]}>
        <TeacherSectionsPage />
      </MemoryRouter>
    </div>
  </ThemeContext.Provider>,
);

const openTab = async (name) => fireEvent.click(await screen.findByRole("button", { name }));

beforeEach(() => {
  role = "teacher";
});

describe("TeacherSectionsPage — dark mode", () => {
  it("shows the section and its roster, with the quick view", async () => {
    renderDark();
    expect((await screen.findAllByText("Grade 4 · Rosal")).length).toBeGreaterThan(0);
    expect(screen.getByText("Ana Cruz")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Quick view" }));
    expect(screen.getByText("Full Profile")).toBeTruthy();
  });

  it("marks attendance, Late in dark's warning pair", async () => {
    renderDark();
    await openTab(/^Attendance$/);
    const late = await screen.findByRole("button", { name: "Late — Ana Cruz" });
    expect(late.getAttribute("aria-pressed")).toBe("true");
    expect(late.style.background).toBe("var(--color-warning-50)");
    expect(screen.getByText("1 late")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save Attendance/ })).toBeTruthy();
  });

  it("shows a registrar the recorded marks, read-only", async () => {
    role = "registrar";
    renderDark();
    await screen.findByRole("option", { name: /Lea Tan/ });
    fireEvent.change(screen.getByLabelText("Select a teacher"), { target: { value: "5" } });
    await screen.findAllByText("Grade 4 · Rosal");
    await openTab(/^Attendance$/);
    expect((await screen.findAllByText("Late")).length).toBeGreaterThan(0);
    expect(screen.getByText("View only")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Save Attendance/ })).toBeNull();
  });

  it("shows the grades grid", async () => {
    renderDark();
    await openTab(/^Grades$/);
    expect(await screen.findByLabelText("Grade for Ana Cruz")).toBeTruthy();
    // The chip's tint: it was passed as a `bg` key, which isn't CSS, so the
    // chip had no background in either theme.
    const chip = screen.getByText("Passed");
    expect(chip.style.background).toBe("var(--color-success-50)");
    expect(chip.style.color).toBe("var(--color-success-500)");
  });

  it("shows the narrative cross-tab", async () => {
    renderDark();
    await openTab(/Narrative Report/);
    expect(await screen.findByText("Respect")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save Ratings/ })).toBeTruthy();
  });

  it("shows the stats, with the daily chart's tooltip", async () => {
    renderDark();
    await openTab(/^Stats$/);
    expect(await screen.findByText("Grade Distribution")).toBeTruthy();
    const chart = screen.getByText("Daily Attendance Breakdown").parentElement;
    const bar = chart.querySelector('[style*="cursor: pointer"]');
    fireEvent.mouseEnter(bar);
    expect(within(chart).getByText("Late: 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sort: Rate" }));
    expect(screen.getByText("80%")).toBeTruthy();
  });
});
