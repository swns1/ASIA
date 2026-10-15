/**
 * My Sections — the fixes from the 2026-10-12 teacher audit.
 *
 * Grades and narrative open on the current period, not always the 1st; the
 * header and Quick view count only SAVED attendance; a failed load says so
 * instead of "no sections"; one school year at a time, earlier years view
 * only; and a link can open a section on a tab.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getMySections = vi.fn();
const getSectionGrades = vi.fn();
const getSectionAttendance = vi.fn();
const getSectionNarrativeReports = vi.fn();

vi.mock("../utils/auth", async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: () => ({ role: "teacher", user_id: 25, name: "Teresa Aquino" }),
}));
vi.mock("../api/identityApi", () => ({ getUsers: () => Promise.resolve([]) }));
vi.mock("../api/enrollmentApi", () => ({
  getMySections: (...a) => getMySections(...a),
  getSectionGrades: (...a) => getSectionGrades(...a),
  saveSectionGrades: () => Promise.resolve({}),
  getSectionAttendance: (...a) => getSectionAttendance(...a),
  saveSectionAttendance: () => Promise.resolve({}),
  getSectionAttendanceStats: () => Promise.resolve({}),
  getSectionGradesSummary: () => Promise.resolve({}),
  getNarrativeCategories: () => Promise.resolve([]),
  getSectionNarrativeReports: (...a) => getSectionNarrativeReports(...a),
  saveSectionNarrativeReports: () => Promise.resolve({}),
  // 2nd Quarter: Sep 1 - Nov 20, 2026.
  getCalendarEvents: () => Promise.resolve([
    { event_type: "grading_period", grading_period: "1st_quarter", start_date: "2026-06-01", end_date: "2026-08-21" },
    { event_type: "grading_period", grading_period: "2nd_quarter", start_date: "2026-09-01", end_date: "2026-11-20" },
  ]),
}));
vi.mock("../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027", options: ["2026-2027", "2025-2026"], yearCounts: {},
    yearStates: { "2025-2026": "archived", "2026-2027": "current" },
  }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: TeacherSectionsPage } = await import("./TeacherSectionsPage");
const { resetGradingCalendar } = await import("../hooks/useGradingCalendar");

const student = (id, first) => ({ student_id: id, first_name: first, last_name: "Cruz" });
const section = (id, year, level, grade, name) => ({
  advisory: { advisory_id: id, teacher_user_id: 25, school_year: year, school_level: level, grade_level: grade, section: name },
  student_count: 2,
  students: [student(1, "Ana"), student(2, "Ben")],
  subjects: [{ subject_id: 7, subject_code: "ENG5", subject_name: "English 5" }],
});
const SECTIONS = [
  section(62, "2026-2027", "elementary", "Grade 5", "Silang"),
  section(63, "2026-2027", "senior_highschool", "Grade 11", "ABM-A"),
  section(40, "2025-2026", "elementary", "Grade 4", "Silang"),
];
// Today's roster with nothing saved yet, or saved marks.
const unsaved = [{ student: student(1, "Ana"), attendance: null }, { student: student(2, "Ben"), attendance: null }];
const saved = [
  { student: student(1, "Ana"), attendance: { status: "P", remarks: "" } },
  { student: student(2, "Ben"), attendance: { status: "A", remarks: "" } },
];

beforeEach(() => {
  vi.clearAllMocks();
  resetGradingCalendar();
  // Monday, October 12, 2026: a school day in the 2nd Quarter.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 12, 9, 0));
  getMySections.mockResolvedValue(SECTIONS);
  getSectionGrades.mockResolvedValue([]);
  getSectionNarrativeReports.mockResolvedValue([]);
  getSectionAttendance.mockResolvedValue(unsaved);
});
afterEach(() => vi.useRealTimers());

function renderPage(entry = "/my-sections") {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <TeacherSectionsPage />
    </MemoryRouter>,
  );
}

describe("My Sections — the current period", () => {
  it("opens grades on the quarter today falls in", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Grades/ }));
    await waitFor(() => expect(getSectionGrades).toHaveBeenCalled());
    expect(getSectionGrades.mock.calls.every(([p]) => p.grading_period === "2nd_quarter")).toBe(true);
  });

  it("opens Senior High on its semester", async () => {
    renderPage("/my-sections?section=63&tab=grades");
    await waitFor(() => expect(getSectionGrades).toHaveBeenCalled());
    expect(getSectionGrades).toHaveBeenLastCalledWith(expect.objectContaining({ advisory_id: 63, grading_period: "1st_semester" }));
  });

  it("opens the narrative report on the current quarter too", async () => {
    renderPage("/my-sections?tab=narrative");
    await waitFor(() => expect(getSectionNarrativeReports).toHaveBeenCalled());
    expect(getSectionNarrativeReports).toHaveBeenLastCalledWith(expect.objectContaining({ grading_period: "2nd_quarter" }));
  });

  it("lets a link name the period", async () => {
    renderPage("/my-sections?section=62&tab=grades&period=1st_quarter");
    await waitFor(() => expect(getSectionGrades).toHaveBeenCalled());
    expect(getSectionGrades).toHaveBeenLastCalledWith(expect.objectContaining({ grading_period: "1st_quarter" }));
  });
});

describe("My Sections — today's attendance", () => {
  it("doesn't call unsaved marks present, and says it isn't taken", async () => {
    renderPage();
    expect(await screen.findByText("Attendance not taken today")).toBeTruthy();
    expect(screen.queryByText(/% present today/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Attendance/ }));
    expect(await screen.findByText("2 not saved yet · press Save Attendance")).toBeTruthy();
    // Still not "present": the editor's pre-filled marks aren't saved.
    expect(screen.queryByText(/% present today/)).toBeNull();
  });

  it("counts saved marks before the Attendance tab is opened", async () => {
    getSectionAttendance.mockResolvedValue(saved);
    renderPage();
    expect(await screen.findByText("50% present today")).toBeTruthy();
    expect(screen.queryByText("Attendance not taken today")).toBeNull();
  });

  it("offers no day after today", async () => {
    renderPage("/my-sections?tab=attendance");
    expect((await screen.findByRole("button", { name: "Next day" })).disabled).toBe(true);
  });
});

describe("My Sections — loading, years and links", () => {
  it("says the sections didn't load, with a retry, instead of 'no sections'", async () => {
    getMySections.mockRejectedValueOnce(new Error("down"));
    renderPage();
    expect(await screen.findByRole("button", { name: /Try again/ })).toBeTruthy();
    expect(screen.queryByText("No section assignments found")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect((await screen.findAllByText("Grade 5 · Silang")).length).toBeGreaterThan(0);
  });

  it("lists only the year's sections, the current year first", async () => {
    renderPage();
    expect(await screen.findByText("2 sections · S.Y. 2026-2027")).toBeTruthy();
    expect(screen.queryByText("Grade 4 · Silang")).toBeNull();
  });

  it("shows an earlier year's sections view only", async () => {
    renderPage("/my-sections?school_year=2025-2026");
    expect(await screen.findByText("1 section · S.Y. 2025-2026")).toBeTruthy();
    expect(screen.getByText("View only")).toBeTruthy();
  });

  it("opens the section and tab a link names", async () => {
    renderPage("/my-sections?section=63&tab=attendance");
    expect(await screen.findByText("Grade 11 · ABM-A", { selector: "div[style*='font-size: 18px']" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Save Attendance/ })).toBeTruthy();
  });

  it("opens attendance on the day a link names (from a home or the calendar)", async () => {
    renderPage("/my-sections?section=62&tab=attendance&date=2026-10-09");
    expect((await screen.findByLabelText("Day")).value).toBe("2026-10-09");
    await waitFor(() => expect(getSectionAttendance).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-10-09" })));
    expect(screen.getByRole("button", { name: "Next day" }).disabled).toBe(false);
  });

  it.each(["2026-10-20", "yesterday"])("opens on today for a link's day %s, not one to come or not a date", async (date) => {
    renderPage(`/my-sections?section=62&tab=attendance&date=${date}`);
    expect((await screen.findByLabelText("Day")).value).toBe("2026-10-12");
  });

  it("tells a teacher with no section that year, plainly", async () => {
    getMySections.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("You're not an adviser of a section in S.Y. 2026-2027.")).toBeTruthy();
  });
});
