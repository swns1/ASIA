/**
 * RegistrarHome — the registrar's home page.
 *
 * What matters: the registrar sees their own work on the page (and in the
 * bell), each row with the numbers that make it actionable and a link to the
 * list on the same year; the page is built like the admin home; and a past
 * year doesn't list placements or advisers it can no longer take.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

let currentUser;
const getEnrollments = vi.fn();
const getDocumentStatus = vi.fn();
const getSections = vi.fn();
const getUnplacedStudents = vi.fn();
const getCalendarEvents = vi.fn();
const getPersonalEvents = vi.fn(() => Promise.resolve({ results: [] }));
const getStudentApplications = vi.fn();
const getStudents = vi.fn();
const getInvoices = vi.fn();
const getDashboardSummary = vi.fn();

vi.mock("../../utils/auth", async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: () => currentUser,
}));
vi.mock("../../api/studentApi", () => ({
  getStudents: (...a) => getStudents(...a),
}));
vi.mock("../../api/enrollmentApi", () => ({
  getEnrollments: (...a) => getEnrollments(...a),
  getEnrollmentScholarships: () => Promise.resolve({ count: 163, results: [] }),
  getDashboardSummary: (...a) => getDashboardSummary(...a),
  getDocumentStatus: (...a) => getDocumentStatus(...a),
  getSections: (...a) => getSections(...a),
  getUnplacedStudents: (...a) => getUnplacedStudents(...a),
  getCalendarEvents: (...a) => getCalendarEvents(...a),
  getPersonalEvents: (...a) => getPersonalEvents(...a),
}));
vi.mock("../../api/billingApi", () => ({
  getInvoices: (...a) => getInvoices(...a),
  getFinancialSummary: () => Promise.resolve(null),
}));
vi.mock("../../api/applicationApi", () => ({
  getStudentApplications: (...a) => getStudentApplications(...a),
  createApplicationInvite: () => Promise.resolve({}),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    schoolYear: "2026-2027", options: ["2026-2027", "2025-2026"], yearCounts: {}, currentYear: "2026-2027",
    entryYears: ["2026-2027"], yearStates: { "2025-2026": "archived", "2026-2027": "current" },
  }),
}));

const { default: DashboardPage } = await import("../DashboardPage");
const { attentionRows } = await import("./attention");
const { quarterOn } = await import("./adminHomeData");

// The local database's numbers on Oct 12, 2026.
const unplacedRow = (id, last) => ({ student_id: id, full_name: `Learner ${id}`, last_enrollment: last });

beforeEach(() => {
  vi.clearAllMocks();
  getDashboardSummary.mockResolvedValue({
    pipeline: { pending: 36, enrolled: 395, completed: 0, exited: 12, total: 431 },
    risk: null,
    attendance_series: [],
  });
  currentUser = { role: "registrar", name: "Lorna Villareal" };
  getEnrollments.mockImplementation((params) => {
    if (params.enrollment_status === "pending") return Promise.resolve({ count: 36, results: [] });
    if (params.enrollment_status === "enrolled") return Promise.resolve({ count: 395, results: [] });
    return Promise.resolve({ count: 1, results: [{
      enrollment_id: 2672, student_name: "Clarence Elizalde Austria", school_level: "senior_highschool",
      grade_level: "Grade 12", section: "STEM-A", enrollment_status: "enrolled",
    }] });
  });
  getDocumentStatus.mockResolvedValue({ count: 36, results: [], summary: { learners: 36, complete: 20, missing: 16 } });
  getStudentApplications.mockImplementation((params) =>
    Promise.resolve({ count: params.status === "submitted" ? 4 : 2, results: [] }));
  getUnplacedStudents.mockResolvedValue({
    school_year: "2026-2027",
    count: 3,
    results: [
      unplacedRow(1, { school_year: "2025-2026", grade_level: "Grade 10", enrollment_status: "completed" }),
      unplacedRow(2, { school_year: "2025-2026", grade_level: "Grade 6", enrollment_status: "completed" }),
      unplacedRow(3, { school_year: "2025-2026", grade_level: "Grade 12", semester: "2nd", enrollment_status: "completed" }),
    ],
  });
  getSections.mockResolvedValue({
    count: 2,
    results: [
      // Sapphire's only adviser was deactivated: it still counts as having none.
      { section_id: 1, grade_level: "Grade 9", name: "Sapphire", strand: null, adviser_count: 1, active_adviser_count: 0 },
      { section_id: 2, grade_level: "Grade 9", name: "Ruby", strand: null, adviser_count: 1, active_adviser_count: 1 },
    ],
  });
  getCalendarEvents.mockResolvedValue({ results: [
    { event_type: "grading_period", grading_period: "2nd_quarter", title: "2nd Quarter", start_date: "2026-09-01", end_date: "2026-11-20" },
  ] });
  getStudents.mockImplementation((params) => Promise.resolve({ count: params.status ? 474 : 551, results: [] }));
});

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

describe("RegistrarHome — the header", () => {
  it("greets the registrar like the admin home, without a ticking clock", async () => {
    renderHome();
    expect(await screen.findByRole("heading", { name: /^Good (morning|afternoon|evening), Lorna$/ })).toBeTruthy();
    expect(screen.queryByText(/^\d{2}:\d{2}:\d{2}/)).toBeNull();
    expect(screen.getByRole("button", { name: /^School year: 2026-2027/ })).toBeTruthy();
  });
});

describe("RegistrarHome — needs your attention", () => {
  it("lists the registrar's queues on the page, with what makes each one actionable", async () => {
    renderHome();
    expect(await screen.findByText("36 enrollments waiting for your approval")).toBeTruthy();
    expect(screen.getByText("20 have every document in · 16 still owe documents")).toBeTruthy();
    expect(screen.getByText("4 new applications to look over")).toBeTruthy();
    expect(screen.getByText("2 more opened but not decided yet")).toBeTruthy();
    expect(screen.getByText("3 learners have no class in S.Y. 2026-2027")).toBeTruthy();
    expect(screen.getByText(
      "2 finished last school year but haven't enrolled for this one · 1 finished Grade 12 and can be marked graduated",
    )).toBeTruthy();
    expect(screen.getByText("1 section has no adviser")).toBeTruthy();
    expect(screen.getByText("Grade 9 · Sapphire: no teacher can take its attendance or enter its grades")).toBeTruthy();
    expect(screen.getByText("4 things are waiting on you")).toBeTruthy();
    // The split comes from the pending rows' own documents summary.
    expect(getDocumentStatus).toHaveBeenCalledWith(expect.objectContaining({ school_year: "2026-2027", enrollment_status: "pending" }));
  });

  it.each([
    [/^Review: 36 enrollments/, "/enrollments?enrollment_status=pending&school_year=2026-2027"],
    [/^Review: 4 new applications/, "/student-applications"],
    [/^Place: 3 learners/, "/enrollments?school_year=2026-2027&unplaced=1"],
    [/^Assign: 1 section/, "/teacher-advisories?school_year=2026-2027"],
  ])("opens %s on the matching list", async (name, to) => {
    renderHome();
    fireEvent.click(await screen.findByRole("button", { name }));
    expect(screen.getByTestId("location").textContent).toBe(to);
  });

  it("puts the same rows in the bell", async () => {
    renderHome();
    fireEvent.click(await screen.findByRole("button", { name: /^Notifications, 4 need your attention/ }));
    expect(screen.getByRole("link", { name: /36 enrollments waiting for your approval/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /1 section has no adviser/ })).toBeTruthy();
  });

  it("doesn't list placements or advisers for a past year", async () => {
    renderHome("/dashboard?school_year=2025-2026");
    expect(await screen.findByText("4 new applications to look over")).toBeTruthy();
    expect(screen.queryByText(/no class in S.Y./)).toBeNull();
    expect(screen.queryByText(/no adviser/)).toBeNull();
    expect(getUnplacedStudents).not.toHaveBeenCalled();
    expect(getSections).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Back to 2026-2027/ })).toBeTruthy();
  });

  it("says when a queue couldn't be checked, rather than reading it as nothing to do", async () => {
    getSections.mockRejectedValue(new Error("down"));
    renderHome();
    expect(await screen.findByText("Some of this page didn't load")).toBeTruthy();
    expect(screen.getByText("Some of these couldn't be checked")).toBeTruthy();
  });

  it("never asks for invoices", async () => {
    renderHome();
    await screen.findByText("36 enrollments waiting for your approval");
    expect(getInvoices).not.toHaveBeenCalled();
  });
});

describe("RegistrarHome — coming up", () => {
  it("puts the calendar and the registrar's own events beside the queues", async () => {
    getCalendarEvents.mockImplementation((params) => Promise.resolve({ results: params.event_type ? [] : [
      { event_id: 5, event_type: "holiday", title: "All Saints' Day", start_date: "2026-11-01", end_date: "2026-11-01" },
    ] }));
    getPersonalEvents.mockResolvedValue({ results: [
      { event_id: 5, title: "Records audit prep", start_date: "2026-10-20", end_date: "2026-10-20" },
    ] });
    renderHome();
    expect(await screen.findByText("Coming up")).toBeTruthy();
    expect(await screen.findByText("All Saints' Day")).toBeTruthy();
    expect(screen.getByText("Records audit prep")).toBeTruthy();
    expect(screen.getByText("Yours")).toBeTruthy();
  });
});

describe("RegistrarHome — start a task", () => {
  it.each([
    ["Enroll a student", "/enrollments/new"],
    ["Add a student", "/students/new"],
    ["Print a school form", "/school-forms"],
  ])("%s opens its page", async (label, to) => {
    renderHome();
    fireEvent.click(await screen.findByRole("button", { name: label }));
    expect(screen.getByTestId("location").textContent).toBe(to);
  });

  it("issues a form link right here, in the Applications page's own window", async () => {
    renderHome();
    fireEvent.click(await screen.findByRole("button", { name: "Issue form link" }));
    expect(within(screen.getByRole("dialog")).getByText("Issue invite")).toBeTruthy();
  });
});

describe("RegistrarHome — kept from the old dashboard", () => {
  it("keeps the four tiles, on the page's year", async () => {
    renderHome();
    expect(await screen.findByText("551")).toBeTruthy();
    expect(screen.getByText("474 active")).toBeTruthy();
    // 395 is also on the pipeline's legend; the tile is the button.
    expect(screen.getByRole("button", { name: /395.*Enrolled/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /163.*Scholarships awarded/ })).toBeTruthy();
    expect(screen.getByText("16 still owe documents")).toBeTruthy();
    fireEvent.click(screen.getByText("Scholarships awarded"));
    expect(screen.getByTestId("location").textContent).toBe("/scholarships?school_year=2026-2027");
  });

  it("keeps the trends and the recent enrollments", async () => {
    renderHome();
    expect(await screen.findByText("Clarence Elizalde Austria")).toBeTruthy();
    expect(screen.getByText("Trends")).toBeTruthy();
    expect(screen.getByText("Recent enrollments")).toBeTruthy();
  });

  it("opens Analytics on the page's year", async () => {
    renderHome("/dashboard?school_year=2025-2026");
    fireEvent.click(await screen.findByRole("button", { name: "Analytics" }));
    expect(screen.getByTestId("location").textContent).toBe("/analytics?school_year=2025-2026");
  });

  it("says the trends didn't load, rather than that nothing was recorded", async () => {
    getDashboardSummary.mockRejectedValue(new Error("down"));
    renderHome();
    expect(await screen.findByText("We couldn't load the trends.")).toBeTruthy();
    expect(screen.queryByText(/No risk assessment has been run/)).toBeNull();
    expect(screen.queryByText(/No attendance has been recorded/)).toBeNull();
    // Retry asks again.
    getDashboardSummary.mockResolvedValue({ pipeline: null, risk: null, attendance_series: [] });
    const trends = within(screen.getByRole("region", { name: "Trends" }));
    fireEvent.click(trends.getByRole("button", { name: /Try again|Retry/ }));
    expect(await screen.findByText(/No attendance has been recorded/)).toBeTruthy();
  });
});

describe("attentionRows — applications", () => {
  it("names applications opened but not decided when nothing new came in, and opens their tab", () => {
    const [row] = attentionRows({ applications: { count: 2, fresh: 0, opened: 2 } }, "2026-2027");
    expect(row.text).toBe("2 applications opened but not decided yet");
    expect(row.hint).toBeNull();
    expect(row.to).toBe("/student-applications?tab=in_review");
  });
});

describe("quarterOn", () => {
  const events = [
    { event_type: "grading_period", grading_period: "1st_quarter", start_date: "2026-06-01", end_date: "2026-08-21" },
    { event_type: "grading_period", grading_period: "2nd_quarter", start_date: "2026-09-01", end_date: "2026-11-20" },
  ];
  it("finds the quarter today falls in, its last day included", () => {
    expect(quarterOn(events, new Date(2026, 9, 12))).toBe("2nd Quarter");
    expect(quarterOn(events, new Date(2026, 10, 20, 17))).toBe("2nd Quarter");
  });
  it("has none between quarters or without dates", () => {
    expect(quarterOn(events, new Date(2026, 7, 25))).toBeNull();
    expect(quarterOn([], new Date(2026, 9, 12))).toBeNull();
  });
});
