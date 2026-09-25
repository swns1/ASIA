/**
 * AdminHome — the super_admin/admin home page.
 *
 * What matters here is what the page tells an admin to do: only queues with
 * something in them, links that open the list on the same year the count
 * came from, and which sections still owe attendance or grades.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

let currentUser;
const getEnrollments = vi.fn();
const getTeachersToday = vi.fn();
const getDashboardSummary = vi.fn();
const getInvoices = vi.fn();
const getFinancialSummary = vi.fn();
const getStudentApplications = vi.fn();

vi.mock("../../utils/auth", async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: () => currentUser,
}));
vi.mock("../../api/studentApi", () => ({
  getStudents: () => Promise.resolve({ count: 0, results: [] }),
}));
vi.mock("../../api/enrollmentApi", () => ({
  getEnrollments: (...a) => getEnrollments(...a),
  getEnrollmentScholarships: () => Promise.resolve({ count: 0, results: [] }),
  getDashboardSummary: (...a) => getDashboardSummary(...a),
  getTeachersToday: (...a) => getTeachersToday(...a),
}));
vi.mock("../../api/billingApi", () => ({
  getInvoices: (...a) => getInvoices(...a),
  getFinancialSummary: (...a) => getFinancialSummary(...a),
}));
vi.mock("../../api/applicationApi", () => ({
  getStudentApplications: (...a) => getStudentApplications(...a),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    schoolYear: "2026-2027", options: ["2026-2027"], yearCounts: {}, currentYear: "2026-2027",
  }),
}));

const { default: DashboardPage } = await import("../DashboardPage");
const { dueLine, attentionRows } = await import("./adminHomeData");

const SECTIONS = [
  {
    school_level: "elementary", level_label: "Elementary", grade_level: "Grade 3", section: "Rizal",
    strand: null, students: 30, advisers: ["Ana Lim"], attendance_taken: false,
    grades: { period: "2nd_quarter", label: "2nd Quarter", due_date: "2026-10-23", done: 60, expected: 240, complete: false },
  },
  {
    school_level: "junior_highschool", level_label: "Junior High", grade_level: "Grade 9", section: "Diamond",
    strand: null, students: 28, advisers: [], attendance_taken: false,
    grades: { period: "2nd_quarter", label: "2nd Quarter", due_date: "2026-10-23", done: 224, expected: 224, complete: true },
  },
  {
    school_level: "junior_highschool", level_label: "Junior High", grade_level: "Grade 10", section: "Ruby",
    strand: null, students: 31, advisers: ["Paolo Tan"], attendance_taken: true,
    grades: { period: "2nd_quarter", label: "2nd Quarter", due_date: "2026-10-23", done: 248, expected: 248, complete: true },
  },
];

function teachersToday(overrides = {}) {
  return {
    school_year: "2026-2027",
    date: "2026-09-25",
    no_classes: null,
    grading_period: {
      key: "2nd_quarter", label: "2nd Quarter", due_date: "2099-10-23",
      semester: "1st_semester", semester_label: "1st Semester", semester_due_date: "2099-10-23",
      source: "calendar",
    },
    attendance: { sections_taken: 1, sections_total: 3, present: 29, late: 1, absent: 1, excused: 0, rate: 0.9677 },
    grades: { sections_complete: 2, sections_total: 3 },
    sections: SECTIONS,
    ...overrides,
  };
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderAs(role, name = "Teresa Dela Cruz") {
  currentUser = { role, name };
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getDashboardSummary.mockResolvedValue({
    pipeline: { pending: 12, enrolled: 842, completed: 0, exited: 0, total: 854 },
    risk: { run_id: 1, computed_at: "2026-09-21T08:00:00Z", bands: { low: 700, moderate: 125, high: 12, critical: 5 }, flagged: 17, total: 842 },
    attendance_series: [],
  });
  getTeachersToday.mockResolvedValue(teachersToday());
  getFinancialSummary.mockResolvedValue({ net_billed: "29470000", total_collected: "20040000", outstanding: "9430000" });
  getStudentApplications.mockResolvedValue({ count: 5, results: [] });
  getEnrollments.mockResolvedValue({ count: 12, results: [] });
  getInvoices.mockImplementation((params) =>
    Promise.resolve({ count: params.overdue ? 6 : 18, results: [] }));
});

describe("DashboardPage — who gets which home", () => {
  it.each(["admin", "super_admin"])("sends %s to the admin home", async (role) => {
    renderAs(role);
    expect(await screen.findByRole("heading", { name: /Teresa$/ })).toBeTruthy();
    expect(screen.queryByText("Recent Enrollments")).toBeNull();
  });

  it("keeps the shared dashboard for registrars", async () => {
    renderAs("registrar");
    expect(await screen.findByText("Recent Enrollments")).toBeTruthy();
    expect(getTeachersToday).not.toHaveBeenCalled();
  });
});

describe("AdminHome — needs your attention", () => {
  it("lists each queue with its count", async () => {
    renderAs("admin");
    expect(await screen.findByText("4 things are waiting on you")).toBeTruthy();
    expect(screen.getByText("12 enrollments waiting for your approval")).toBeTruthy();
    expect(screen.getByText("5 new applications to look over")).toBeTruthy();
    expect(screen.getByText("18 invoices with no payment yet")).toBeTruthy();
    expect(screen.getByText("6 invoices with a payment past due")).toBeTruthy();
  });

  it("counts and links on the same school year", async () => {
    renderAs("admin");
    fireEvent.click(await screen.findByRole("button", { name: /View: 6 invoices with a payment past due/ }));
    expect(screen.getByTestId("location").textContent).toBe("/invoices?overdue=1&school_year=2026-2027");
    expect(getInvoices).toHaveBeenCalledWith(expect.objectContaining({ overdue: "true", school_year: "2026-2027" }));
  });

  it("leaves out empty queues, and says so when all are empty", async () => {
    getEnrollments.mockResolvedValue({ count: 0, results: [] });
    getStudentApplications.mockResolvedValue({ count: 0, results: [] });
    getInvoices.mockResolvedValue({ count: 0, results: [] });
    renderAs("admin");
    expect(await screen.findByText("Nothing is waiting on you")).toBeTruthy();
    expect(screen.queryByText(/waiting for your approval/)).toBeNull();
  });

  it("warns instead of reading a failed count as nothing to do", async () => {
    getStudentApplications.mockRejectedValue(new Error("down"));
    renderAs("admin");
    expect(await screen.findByText("Some of this page didn't load")).toBeTruthy();
    // The rest of the page still renders.
    expect(screen.getByText("12 enrollments waiting for your approval")).toBeTruthy();
  });
});

describe("AdminHome — teachers today", () => {
  it("names the sections that haven't taken attendance, flagging a missing adviser", async () => {
    renderAs("admin");
    await screen.findByText("Not taken yet");
    expect(screen.getByText("Grade 3 · Rizal")).toBeTruthy();
    expect(screen.getByText("Ana Lim")).toBeTruthy();
    expect(screen.getByText("Grade 9 · Diamond")).toBeTruthy();
    expect(screen.getByText("No adviser")).toBeTruthy();
    expect(screen.queryByText("Grade 10 · Ruby")).toBeNull();
    expect(screen.getByRole("progressbar", { name: /Attendance taken: 1 of 3 sections/ })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: /2nd Quarter grades complete: 2 of 3 sections/ })).toBeTruthy();
  });

  it("shows the due date when the calendar has quarter dates", async () => {
    renderAs("admin");
    expect(await screen.findByText(/^Due .*October 23 · \d+ days left$/)).toBeTruthy();
    expect(screen.queryByText(/Add each quarter's dates/)).toBeNull();
  });

  it("asks for quarter dates when the calendar has none", async () => {
    getTeachersToday.mockResolvedValue(teachersToday({
      grading_period: { ...teachersToday().grading_period, source: "grades", due_date: null, semester_due_date: null },
    }));
    renderAs("admin");
    expect(await screen.findByText(/Add each quarter's dates to the Academic Calendar/)).toBeTruthy();
    expect(screen.queryByText(/days left/)).toBeNull();
  });

  it("says there are no classes instead of listing sections on a holiday", async () => {
    getTeachersToday.mockResolvedValue(teachersToday({ no_classes: { label: "National Heroes Day" } }));
    renderAs("admin");
    expect(await screen.findByText("No classes today")).toBeTruthy();
    expect(screen.queryByText("Not taken yet")).toBeNull();
  });

  it("opens every section in a dialog", async () => {
    renderAs("admin");
    fireEvent.click(await screen.findByRole("button", { name: /See every section/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Grade 10 · Ruby")).toBeTruthy();
    expect(within(dialog).getByText("60 of 240 grades in")).toBeTruthy();
  });
});

describe("AdminHome — start a task", () => {
  it("finds a student through the Students page search", async () => {
    renderAs("admin");
    fireEvent.change(await screen.findByLabelText(/Find a student/), { target: { value: "Dela Cruz" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    expect(screen.getByTestId("location").textContent).toBe("/students?search=Dela%20Cruz");
  });
});

describe("AdminHome — school at a glance", () => {
  it("hides peso amounts on request", async () => {
    renderAs("admin");
    expect(await screen.findByText("₱20.04M")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide amounts" }));
    expect(screen.queryByText("₱20.04M")).toBeNull();
    expect(screen.getByText("Amounts hidden")).toBeTruthy();
  });
});

describe("dueLine", () => {
  const now = new Date(2026, 8, 25, 9, 0); // Sep 25, 2026, 9 AM local

  it("counts whole days left", () => {
    expect(dueLine("2026-10-23", now)).toEqual({ text: expect.stringMatching(/28 days left$/), late: false });
  });

  it("reads a date-only string as a local date, not UTC", () => {
    expect(dueLine("2026-09-25", now)).toEqual({ text: "Due today", late: false });
    expect(dueLine("2026-09-26", now).text).toMatch(/^Due tomorrow/);
  });

  it("marks a past due date as late", () => {
    expect(dueLine("2026-09-22", now)).toEqual({ text: expect.stringMatching(/3 days ago$/), late: true });
  });

  it("has nothing to say without a date", () => {
    expect(dueLine(null, now)).toBeNull();
  });
});

describe("attentionRows", () => {
  it("drops queues whose count is zero or missing", () => {
    const rows = attentionRows({ pending: 2, applications: 0, unpaid: undefined, overdue: 1 }, "2026-2027");
    expect(rows.map((r) => r.id)).toEqual(["pending", "overdue"]);
  });
});
