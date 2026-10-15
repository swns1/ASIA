/**
 * TeacherHome — the teacher's home page.
 *
 * What matters: a teacher sees what today and this period still ask of them,
 * in their own sections (the my-day request, asked once); every button opens
 * My Sections on the right section and tab; a teacher with no section is told
 * so; and nothing counts the school's numbers as theirs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

let currentUser;
const getMyDay = vi.fn();
const getRiskAssessmentLatest = vi.fn();
const getCalendarEvents = vi.fn();
const getPersonalEvents = vi.fn(() => Promise.resolve({ results: [] }));
const getEnrollments = vi.fn();

vi.mock("../../utils/auth", async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: () => currentUser,
}));
vi.mock("../../api/studentApi", () => ({
  getStudents: () => Promise.resolve({ count: 13, results: [] }),
}));
vi.mock("../../api/enrollmentApi", () => ({
  getEnrollments: (...a) => getEnrollments(...a),
  getEnrollmentScholarships: () => Promise.resolve({ count: 4, results: [] }),
  getDashboardSummary: () => Promise.resolve({ pipeline: null, risk: null, attendance_series: [] }),
  getCalendarEvents: (...a) => getCalendarEvents(...a),
  getPersonalEvents: (...a) => getPersonalEvents(...a),
  getMyDay: (...a) => getMyDay(...a),
  getRiskAssessmentLatest: (...a) => getRiskAssessmentLatest(...a),
}));
vi.mock("../../api/billingApi", () => ({ getInvoices: vi.fn(), getFinancialSummary: vi.fn() }));
vi.mock("../../api/applicationApi", () => ({ getStudentApplications: vi.fn() }));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    schoolYear: "2026-2027", options: ["2026-2027", "2025-2026"], yearCounts: {}, currentYear: "2026-2027",
    yearStates: { "2025-2026": "archived", "2026-2027": "current" },
  }),
}));

const { default: DashboardPage } = await import("../DashboardPage");

// Teresa Aquino's Grade 5 · Silang on Oct 12, 2026 (the local database).
const PERIOD = {
  key: "2nd_quarter", label: "2nd Quarter", due_date: "2026-11-20",
  semester: "1st_semester", semester_label: "1st Semester", semester_due_date: "2026-11-20", source: "calendar",
};
const subject = (subject_id, subject_name, done, expected = 13) =>
  ({ subject_id, subject_code: subject_name, subject_name, done, expected, complete: done >= expected });
const SILANG = {
  advisory_id: 62, school_level: "elementary", level_label: "Elementary", grade_level: "Grade 5",
  section: "Silang", strand: null, students: 13,
  attendance: { taken: false, marked: 0, unmarked: 13, present: 0, late: 0, absent: 0, excused: 0 },
  grades: {
    period: "2nd_quarter", label: "2nd Quarter", due_date: "2026-11-20", done: 13, expected: 26, complete: false,
    subjects: [subject(11, "English 5", 13), subject(12, "Math 5", 0)],
  },
  narrative: { period: "2nd_quarter", label: "2nd Quarter", done: 0, expected: 52, complete: false },
};
const myDay = (sections = [SILANG], no_classes = null) =>
  ({ school_year: "2026-2027", date: "2026-10-12", no_classes, grading_period: PERIOD, sections });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 12, 9, 0));
  currentUser = { role: "teacher", user_id: 25, name: "Teresa Aquino" };
  getMyDay.mockResolvedValue(myDay());
  getRiskAssessmentLatest.mockResolvedValue({ scores: [
    { student_name: "Elvira Balagtas", risk_level: "high" },
    { student_name: "Iris Armada", risk_level: "critical" },
    // "Watch" is worth keeping an eye on, not on the follow-up list.
    { student_name: "Ben Reyes", risk_level: "moderate" },
    { student_name: "Ana Cruz", risk_level: "low" },
  ] });
  getCalendarEvents.mockImplementation((params) => Promise.resolve(params.event_type === "grading_period"
    ? [{ event_type: "grading_period", grading_period: "2nd_quarter", start_date: "2026-09-01", end_date: "2026-11-20" }]
    : [
        { event_id: 1, event_type: "school_day_off", title: "Teachers' In-Service Training", start_date: "2026-10-16", end_date: "2026-10-16" },
        { event_id: 2, event_type: "exam", title: "2nd Quarter Examinations", start_date: "2026-11-17", end_date: "2026-11-19" },
        { event_id: 3, event_type: "grading_period", title: "2nd Quarter", start_date: "2026-09-01", end_date: "2026-11-20" },
        { event_id: 4, event_type: "event", title: "Christmas Program", start_date: "2026-12-18", end_date: "2026-12-18" },
      ]));
  getEnrollments.mockResolvedValue({ count: 0, results: [] });
});
afterEach(() => vi.useRealTimers());

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderHome(entry = "/dashboard") {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}
const location = () => screen.getByTestId("location").textContent;

describe("TeacherHome — the header", () => {
  it("greets the teacher with today's quarter and a year picker, like every home", async () => {
    renderHome();
    expect(await screen.findByRole("heading", { name: "Good morning, Teresa" })).toBeTruthy();
    expect(await screen.findByText(/2nd Quarter · S\.Y\. 2026-2027$/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^School year: 2026-2027/ })).toBeTruthy();
  });
});

describe("TeacherHome — today and what's due", () => {
  it("asks for the my-day once, for the page and its queues", async () => {
    renderHome();
    await screen.findByText("Not taken yet today");
    expect(getMyDay).toHaveBeenCalledTimes(1);
    expect(getMyDay).toHaveBeenCalledWith({ school_year: "2026-2027" });
  });

  it("lists what's waiting, each with a way in", async () => {
    renderHome();
    expect(await screen.findByText("Today's attendance isn't taken yet")).toBeTruthy();
    expect(screen.getByText("2nd Quarter grades: 13 of 26 in")).toBeTruthy();
    expect(screen.getByText(/^Grade 5 · Silang · Due Friday, November 20 · 39 days left$/)).toBeTruthy();
    expect(screen.getByText("2nd Quarter narrative reports: 0 of 52 ratings in")).toBeTruthy();
    expect(screen.getByText("2 learners to follow up")).toBeTruthy();
    expect(screen.getByText("Elvira Balagtas · Iris Armada")).toBeTruthy();
  });

  it.each([
    [/^Take: Today's attendance/, "/my-sections?school_year=2026-2027&section=62&tab=attendance"],
    [/^Enter: 2nd Quarter grades/, "/my-sections?school_year=2026-2027&section=62&tab=grades&period=2nd_quarter&subject=12"],
    [/^Enter: 2nd Quarter narrative/, "/my-sections?school_year=2026-2027&section=62&tab=narrative&period=2nd_quarter"],
    [/^View: 2 learners/, "/analytics?school_year=2026-2027"],
  ])("opens %s where the work is", async (name, to) => {
    renderHome();
    fireEvent.click(await screen.findByRole("button", { name }));
    expect(location()).toBe(to);
  });

  it("starts today's attendance from Start a task", async () => {
    renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Take today's attendance" }));
    expect(location()).toBe("/my-sections?school_year=2026-2027&section=62&tab=attendance");
  });

  it("shows each subject's grades, and opens the first one short", async () => {
    renderHome();
    expect(await screen.findByRole("progressbar", { name: "Math 5: 0 of 13 learners" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "English 5: 13 of 13 learners" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enter Math 5" }));
    expect(location()).toBe("/my-sections?school_year=2026-2027&section=62&tab=grades&period=2nd_quarter&subject=12");
  });

  it("counts a partly taken day as not done, and says who is left", async () => {
    getMyDay.mockResolvedValue(myDay([{ ...SILANG, attendance: { ...SILANG.attendance, taken: true, marked: 11, unmarked: 2, present: 10, absent: 1 } }]));
    renderHome();
    expect(await screen.findByText("Today's attendance isn't finished yet")).toBeTruthy();
    expect(screen.getByText("Grade 5 · Silang · 11 of 13 learners marked")).toBeTruthy();
    expect(screen.getByText("2 of 13 learners not marked yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Finish attendance" })).toBeTruthy();
  });

  it("asks for no attendance on a day with no classes", async () => {
    getMyDay.mockResolvedValue(myDay([SILANG], { label: "Teachers' In-Service Training" }));
    renderHome();
    expect(await screen.findByText("No classes today")).toBeTruthy();
    expect(screen.queryByText(/Today's attendance isn't/)).toBeNull();
  });

  it("puts the next weeks on the calendar beside, with the grade due date", async () => {
    renderHome();
    expect(await screen.findByText("Coming up")).toBeTruthy();
    expect(await screen.findByText("Teachers' In-Service Training")).toBeTruthy();
    expect(screen.getByText("2nd Quarter grades due")).toBeTruthy();
    expect(screen.getByText("No classes")).toBeTruthy();
    // Beyond 45 days, and the quarter itself, aren't listed.
    expect(screen.queryByText("Christmas Program")).toBeNull();
  });

  it("asks the calendar for the next 45 days by date, not by school year", async () => {
    // Near a year's end the window runs into the next year's opening days,
    // which a request for the current year's calendar never returned.
    renderHome();
    await screen.findByText("Teachers' In-Service Training");
    expect(getCalendarEvents).toHaveBeenCalledWith({
      end_date__gte: "2026-10-12", start_date__lte: "2026-11-26", page_size: 500,
    });
  });

  it("puts the teacher's own events among them, marked as theirs", async () => {
    // The same event_id as a school event: they still both show.
    getPersonalEvents.mockResolvedValue({ results: [
      { event_id: 1, title: "Dentist", start_date: "2026-10-14", end_date: "2026-10-14" },
      { event_id: 2, title: "Conference in Cebu", start_date: "2027-01-10", end_date: "2027-01-12" },
    ] });
    renderHome();
    expect(await screen.findByText("Dentist")).toBeTruthy();
    expect(screen.getByText("Yours")).toBeTruthy();
    expect(screen.getByText("Teachers' In-Service Training")).toBeTruthy();
    expect(screen.queryByText("Conference in Cebu")).toBeNull();
    expect(getPersonalEvents).toHaveBeenCalledWith({
      end_date__gte: "2026-10-12", start_date__lte: "2026-11-26", page_size: 500,
    });
  });

  it("says when the sections didn't load, instead of no subjects set up", async () => {
    getMyDay.mockRejectedValue(new Error("down"));
    renderHome();
    expect(await screen.findByText("Couldn't load your sections' grades.")).toBeTruthy();
    expect(screen.queryByText(/No subjects are set up/)).toBeNull();
  });
});

describe("TeacherHome — no section, and another year", () => {
  it("tells a teacher with no section, plainly", async () => {
    getMyDay.mockResolvedValue(myDay([]));
    renderHome();
    expect(await screen.findByText("You're not an adviser of a section in S.Y. 2026-2027.")).toBeTruthy();
    expect(screen.queryByText("Today")).toBeNull();
    expect(screen.queryByRole("button", { name: "Take today's attendance" })).toBeNull();
  });

  it("still shows what's coming up with no section", async () => {
    getMyDay.mockResolvedValue(myDay([]));
    renderHome();
    expect(await screen.findByText("Coming up")).toBeTruthy();
    expect(await screen.findByText("Teachers' In-Service Training")).toBeTruthy();
  });

  it("keeps names written last-name-first apart", async () => {
    getRiskAssessmentLatest.mockResolvedValue({ scores: [
      { student_name: "Dimapilis, Purificacion C.", risk_level: "high" },
      { student_name: "Balagtas, Elvira A.", risk_level: "high" },
      { student_name: "Ventura, Miguelito A.", risk_level: "high" },
      { student_name: "Armada, Iris A.", risk_level: "high" },
    ] });
    renderHome();
    expect(await screen.findByText(
      "Dimapilis, Purificacion C. · Balagtas, Elvira A. · Ventura, Miguelito A. · and 1 more",
    )).toBeTruthy();
  });

  it("doesn't call an empty roster's grades all in", async () => {
    // An earlier year: its learners have left the roster.
    getMyDay.mockResolvedValue(myDay([{
      ...SILANG, students: 0,
      attendance: { taken: false, marked: 0, unmarked: 0, present: 0, late: 0, absent: 0, excused: 0 },
      grades: { period: "4th_quarter", label: "4th Quarter", due_date: null, done: 0, expected: 0, complete: true, subjects: [] },
    }]));
    renderHome("/dashboard?school_year=2025-2026");
    expect(await screen.findByText("No learners are on this section's roster.")).toBeTruthy();
    expect(screen.queryByText(/grades are all in/)).toBeNull();
  });

  it("shows another year's grades without today's cards", async () => {
    renderHome("/dashboard?school_year=2025-2026");
    expect(await screen.findByText("2nd Quarter grades: 13 of 26 in")).toBeTruthy();
    expect(getMyDay).toHaveBeenCalledWith({ school_year: "2025-2026" });
    expect(screen.queryByText("Not taken yet today")).toBeNull();
    expect(screen.queryByText(/Today's attendance/)).toBeNull();
  });

  it("opens Analytics on the page's year", async () => {
    renderHome("/dashboard?school_year=2025-2026");
    await screen.findByText("2nd Quarter grades: 13 of 26 in");
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
    expect(location()).toBe("/analytics?school_year=2025-2026");
  });

  it("doesn't show last year's sections as today's while this year loads", async () => {
    renderHome("/dashboard?school_year=2025-2026");
    await screen.findByText("2nd Quarter grades: 13 of 26 in");
    // This year's my-day hasn't answered yet.
    getMyDay.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: /^School year: 2025-2026/ }));
    fireEvent.click(screen.getByRole("option", { name: /2026-2027/ }));
    await screen.findByRole("button", { name: /^School year: 2026-2027/ });
    expect(screen.queryByText("Today")).toBeNull();
    expect(screen.queryByRole("button", { name: "Take today's attendance" })).toBeNull();
  });
});
