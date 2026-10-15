/**
 * Attendance on the Academic Calendar (AttendanceDay.jsx).
 *
 * Whoever may read attendance (not accounting) sees, behind an "Attendance"
 * toggle, how many learners were present on each day of the month, and the
 * picked day's breakdown with the sections still to take it. A teacher's is
 * their own sections, each linked to that day in My Sections. It is asked by
 * date with no school year (the server picks the year the dates fall in),
 * and never for a day still to come.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

const getAttendanceDays = vi.hoisted(() => vi.fn());

vi.mock("../../api/enrollmentApi", () => ({
  getCalendarEvents: () => Promise.resolve([]),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  getPersonalEvents: () => Promise.resolve([]),
  createPersonalEvent: vi.fn(),
  updatePersonalEvent: vi.fn(),
  deletePersonalEvent: vi.fn(),
  getAttendanceDays: (...a) => getAttendanceDays(...a),
}));
vi.mock("../../api/billingApi", () => ({
  getSchoolSettings: () => Promise.resolve({ school_name: "Test School" }),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ currentYear: "2026-2027", options: ["2026-2027"], yearStates: {} }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: AcademicCalendarPage } = await import("../AcademicCalendarPage");

const SECTION = {
  advisory_id: null, school_level: "elementary", level_label: "Elementary", grade_level: "Grade 3",
  section: "Rizal", strand: null, students: 30, marked: 0, unmarked: 30, taken: false,
  present: 0, late: 0, absent: 0, excused: 0,
};
const TAKEN = { ...SECTION, grade_level: "Grade 4", section: "Mabini", marked: 30, unmarked: 0, taken: true, present: 26, late: 2, absent: 1, excused: 1 };

function day(date, overrides = {}) {
  return {
    date, no_classes: null, enrolled: 300, marked: 270, unmarked: 30, attended: 250,
    present: 240, late: 10, absent: 15, excused: 5,
    sections_taken: 15, sections_marked: 15, sections_total: 16, rate: 0.9434,
    ...overrides,
  };
}

// The month answer, or one day's with its sections.
function answer({ date_from, date_to }, sections = [SECTION, TAKEN]) {
  if (date_from === date_to) return Promise.resolve({ school_year: "2026-2027", days: [{ ...day(date_from), sections }] });
  return Promise.resolve({
    school_year: "2026-2027",
    days: [
      day("2026-10-08", { sections_taken: 16 }),
      day("2026-10-09"),
      day("2026-10-10", { marked: 0, attended: 0, rate: null, no_classes: { label: "Saturday" } }),
    ],
  });
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderAs(role, id = 7) {
  sessionStorage.setItem("current_user", JSON.stringify({ id, name: "Ada", role }));
  return render(
    <MemoryRouter initialEntries={["/academic-calendar"]}>
      <Routes>
        <Route path="/academic-calendar" element={<AcademicCalendarPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const NOTE_9 = "250 of 300 learners present · 15 of 16 sections taken";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 11));
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  getAttendanceDays.mockImplementation((params) => answer(params));
});

describe("Attendance on the month grid", () => {
  it("asks for the month by date, with no school year", async () => {
    renderAs("registrar");
    await screen.findByTitle(NOTE_9);
    expect(getAttendanceDays).toHaveBeenCalledWith({ date_from: "2026-10-01", date_to: "2026-10-31" });
  });

  it("puts each day's present count on the grid, amber while a section still owes it", async () => {
    renderAs("admin");
    const owed = await screen.findByTitle(NOTE_9);
    expect(owed.textContent).toBe("250 present");
    expect(owed.className).toMatch(/warning/);
    expect(screen.getByTitle("250 of 300 learners present · 16 of 16 sections taken").className).toMatch(/success/);
    // A day with no marks gets no count.
    expect(screen.queryAllByTitle(/learners present/)).toHaveLength(2);
  });

  it("isn't offered to accounting, who can't read attendance", async () => {
    renderAs("accounting");
    await screen.findByRole("checkbox", { name: /My events/ });
    expect(screen.queryByRole("checkbox", { name: /Attendance/ })).toBeNull();
    expect(getAttendanceDays).not.toHaveBeenCalled();
  });

  it("hides with the toggle, and remembers that per person", async () => {
    const { unmount } = renderAs("registrar", 7);
    await screen.findByTitle(NOTE_9);
    fireEvent.click(screen.getByRole("checkbox", { name: /Attendance/ }));
    await waitFor(() => expect(screen.queryByTitle(NOTE_9)).toBeNull());
    unmount();

    getAttendanceDays.mockClear();
    const again = renderAs("registrar", 7);
    await screen.findByRole("checkbox", { name: /Attendance/ });
    expect(getAttendanceDays).not.toHaveBeenCalled();
    again.unmount();

    renderAs("registrar", 8);
    expect(await screen.findByTitle(NOTE_9)).toBeTruthy();
  });

  it("says so when the month's attendance fails, with a retry", async () => {
    getAttendanceDays.mockRejectedValueOnce(new Error("down"));
    renderAs("admin");
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByTitle(NOTE_9)).toBeTruthy();
  });
});

describe("The picked day's attendance", () => {
  it("gives present of enrolled, the breakdown and the sections still to take it", async () => {
    renderAs("admin");
    fireEvent.click(await screen.findByTitle(NOTE_9));
    const panel = within(await screen.findByRole("region", { name: "Attendance" }));
    expect(await panel.findByText(/250 of 300 learners present/)).toBeTruthy();
    expect(panel.getByText("Late learners count as present.")).toBeTruthy();
    for (const text of ["240 on time", "10 late", "15 absent", "5 excused", "30 not marked", "15 of 16 sections taken"]) {
      expect(panel.getByText(text)).toBeTruthy();
    }
    // Staff see only the sections still owed, with no link into a teacher's page.
    expect(panel.getByText("Grade 3 · Rizal")).toBeTruthy();
    expect(panel.queryByText("Grade 4 · Mabini")).toBeNull();
    expect(panel.queryByRole("button", { name: /Open/ })).toBeNull();
    expect(getAttendanceDays).toHaveBeenCalledWith({ date_from: "2026-10-09", date_to: "2026-10-09" });
  });

  it("shows a teacher their own sections, each opening that day in My Sections", async () => {
    getAttendanceDays.mockImplementation((params) => answer(params, [{ ...SECTION, advisory_id: 55 }]));
    renderAs("teacher");
    fireEvent.click(await screen.findByTitle(NOTE_9));
    const panel = within(await screen.findByRole("region", { name: "Attendance" }));
    expect(panel.getByRole("heading", { name: "Your sections' attendance" })).toBeTruthy();
    fireEvent.click(await panel.findByRole("button", { name: "Open Grade 3 · Rizal's attendance for this day" }));
    expect(screen.getByTestId("location").textContent)
      .toBe("/my-sections?school_year=2026-2027&section=55&tab=attendance&date=2026-10-09");
  });

  it("names why a day had no classes", async () => {
    getAttendanceDays.mockImplementation((params) => (params.date_from === params.date_to
      ? Promise.resolve({ days: [{ ...day(params.date_from, { marked: 0, attended: 0, rate: null, no_classes: { label: "Saturday" } }), sections: [] }] })
      : answer(params)));
    renderAs("admin");
    fireEvent.click(await screen.findByTitle(NOTE_9));
    expect(await screen.findByText("No classes · Saturday")).toBeTruthy();
  });

  it("isn't asked for a day still to come", async () => {
    renderAs("admin");
    await screen.findByTitle(NOTE_9);
    getAttendanceDays.mockClear();
    // Tomorrow on the grid: its day number's cell.
    fireEvent.click(screen.getAllByText("12").find((el) => el.closest("[style*='min-height']")));
    expect(await screen.findByText(/October 12, 2026/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Attendance" })).toBeNull();
    expect(getAttendanceDays).not.toHaveBeenCalled();
  });
});
