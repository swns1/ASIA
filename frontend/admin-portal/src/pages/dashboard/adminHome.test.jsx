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
const compareSchoolYears = vi.fn();
let yearStates;

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
  compareSchoolYears: (...a) => compareSchoolYears(...a),
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
    schoolYear: "2026-2027", options: ["2027-2028", "2026-2027"], yearCounts: {}, currentYear: "2026-2027",
    yearStates,
  }),
}));

const { default: DashboardPage } = await import("../DashboardPage");
const { dueLine, attentionRows, withYear, yearChange, levelRows } = await import("./adminHomeData");

// What /school-years/compare/ and /invoices/financial-summary/ answer, per
// year. 2026-2027 is the seed data's: 24 learners against 23 the year before.
const LEVELS = (nursery, kindergarten, elementary, junior_highschool, senior_highschool) =>
  ({ nursery, kindergarten, elementary, junior_highschool, senior_highschool });
const ENROLLMENT = {
  "2025-2026": { learners: 23, by_level: LEVELS(1, 1, 10, 5, 6), returning: null, new: null, transferred_out: 1, pending: 0, came_back: null },
  "2026-2027": { learners: 24, by_level: LEVELS(1, 2, 8, 7, 6), returning: 19, new: 5, transferred_out: 1, pending: 1, came_back: null },
  "2027-2028": { learners: 0, by_level: LEVELS(0, 0, 0, 0, 0), returning: 0, new: 0, transferred_out: 0, pending: 12, came_back: null },
};
const MONEY = {
  "2025-2026": { net_billed: "600000.00", total_collected: "590000.00", outstanding: "10000.00", invoice_count: 24 },
  "2026-2027": { net_billed: "540666.40", total_collected: "225522.70", outstanding: "315143.70", invoice_count: 23 },
  "2027-2028": { net_billed: "94300.00", total_collected: "10000.00", outstanding: "84300.00", invoice_count: 4 },
};

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

async function pickYearFrom(year) {
  fireEvent.click(await screen.findByRole("button", { name: /^School year: 2026-2027/ }));
  fireEvent.click(screen.getByRole("option", { name: new RegExp(year) }));
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
  yearStates = { "2025-2026": "open", "2026-2027": "current", "2027-2028": "upcoming" };
  compareSchoolYears.mockImplementation((years) =>
    Promise.resolve({ years: years.map((label) => ({ label, enrollment: ENROLLMENT[label] })) }));
  // A year with no figures here gets this year's rather than undefined.
  getFinancialSummary.mockImplementation((sy) => Promise.resolve(MONEY[sy] ?? MONEY["2026-2027"]));
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
  const openDetails = async () =>
    fireEvent.click(await screen.findByRole("button", { name: "Teachers today: open details" }));

  it("previews attendance, grades and missing advisers without listing sections", async () => {
    renderAs("admin");
    expect(await screen.findByRole("progressbar", { name: /Attendance taken: 1 of 3 sections/ })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: /2nd Quarter grades in: 2 of 3 sections/ })).toBeTruthy();
    expect(screen.getByText("1 section has no adviser")).toBeTruthy();
    // The section list lives in the details window, not on the page.
    expect(screen.queryByText("Grade 3 · Rizal")).toBeNull();
    expect(screen.queryByText(/Add each quarter's dates/)).toBeNull();
  });

  it("shows the due date when the calendar has quarter dates", async () => {
    renderAs("admin");
    expect(await screen.findByText(/^Due .*October 23 · \d+ days left$/)).toBeTruthy();
  });

  it("says there are no classes on a holiday", async () => {
    getTeachersToday.mockResolvedValue(teachersToday({ no_classes: { label: "National Heroes Day" } }));
    renderAs("admin");
    expect(await screen.findByText("No classes today")).toBeTruthy();
    expect(screen.queryByRole("progressbar", { name: /Attendance taken/ })).toBeNull();
  });

  it("opens every section in the details window", async () => {
    renderAs("admin");
    await openDetails();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Grade 3 · Rizal")).toBeTruthy();
    expect(within(dialog).getByText("Grade 10 · Ruby")).toBeTruthy();
    expect(within(dialog).getByText("60 of 240 grades in")).toBeTruthy();
  });

  it("filters the window to the sections that need something", async () => {
    renderAs("admin");
    await openDetails();
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: /^No adviser/ }));
    expect(within(dialog).getByText("Grade 9 · Diamond")).toBeTruthy();
    expect(within(dialog).queryByText("Grade 3 · Rizal")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: /^Grades not complete/ }));
    expect(within(dialog).getByText("Grade 3 · Rizal")).toBeTruthy();
    expect(within(dialog).queryByText("Grade 9 · Diamond")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: /^Attendance not taken/ }));
    expect(within(dialog).getByText("Grade 9 · Diamond")).toBeTruthy();
    expect(within(dialog).queryByText("Grade 10 · Ruby")).toBeNull();
  });

  it("asks for quarter dates in the window when the calendar has none", async () => {
    getTeachersToday.mockResolvedValue(teachersToday({
      grading_period: { ...teachersToday().grading_period, source: "grades", due_date: null, semester_due_date: null },
    }));
    renderAs("admin");
    await openDetails();
    expect(within(screen.getByRole("dialog")).getByText(/Add each quarter's dates to the Academic Calendar/)).toBeTruthy();
    expect(screen.queryByText(/days left/)).toBeNull();
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
  it("keeps two tiles and compares enrollees with last year", async () => {
    renderAs("admin");
    expect(await screen.findByRole("button", { name: "24 learners" })).toBeTruthy();
    expect(screen.getByText("Present today")).toBeTruthy();
    expect(screen.getByText("Need follow-up")).toBeTruthy();
    expect(compareSchoolYears).toHaveBeenCalledWith(["2025-2026", "2026-2027"]);
    expect(screen.getByText("Enrollees")).toBeTruthy();
    expect(screen.getByText("S.Y. 2026-2027 vs 2025-2026")).toBeTruthy();
    expect(screen.getByText("+1 (4%) from S.Y. 2025-2026")).toBeTruthy();
    expect(screen.getByText("19 returning · 5 new · 1 transferred out")).toBeTruthy();
  });

  it("compares net billed with last year, with this year's Billing panel under it", async () => {
    renderAs("admin");
    expect(await screen.findByRole("button", { name: "₱540,666.40" })).toBeTruthy();
    expect(screen.getByText("Billing · S.Y. 2026-2027 vs 2025-2026")).toBeTruthy();
    expect(screen.getByText((_, el) =>
      el?.tagName === "P" && el.textContent === "Net billed is down ₱59,334 (10%) from S.Y. 2025-2026.")).toBeTruthy();
    // The year's own figures, as the Billing panel always showed them.
    expect(screen.getByText("Billing · S.Y. 2026-2027")).toBeTruthy();
    expect(screen.getByRole("button", { name: "₱225,522.70" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "₱315,143.70" })).toBeTruthy();
    expect(screen.getByText("42% collected")).toBeTruthy();
    expect(getFinancialSummary).toHaveBeenCalledWith("2025-2026");
    expect(getFinancialSummary).toHaveBeenCalledWith("2026-2027");
  });

  it("gives the panels no year filter of their own", async () => {
    renderAs("admin");
    await screen.findByRole("button", { name: "₱540,666.40" });
    expect(screen.queryByRole("button", { name: "Filter by school year" })).toBeNull();
  });

  it("keeps the Billing panel's year filter on the staff dashboard", async () => {
    renderAs("accounting");
    expect(await screen.findByRole("button", { name: "Filter by school year" })).toBeTruthy();
  });

  it("hides amounts in both money panels with one eye button", async () => {
    renderAs("admin");
    await screen.findByRole("button", { name: "₱540,666.40" });
    expect(screen.getAllByRole("button", { name: /financial amounts/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Hide financial amounts" }));
    expect(screen.getByRole("button", { name: "Show financial amounts" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens unpaid invoices on the page's year", async () => {
    renderAs("admin");
    await screen.findByRole("button", { name: "₱540,666.40" });
    await pickYearFrom("2027-2028");
    await screen.findByText("Billing · S.Y. 2027-2028 vs 2026-2027");
    fireEvent.click(await screen.findByRole("button", { name: "₱84,300.00" }));
    expect(screen.getByTestId("location").textContent).toBe("/invoices?status=unpaid&school_year=2027-2028");
  });

  it("opens Compare School Years on the same two years", async () => {
    renderAs("admin");
    await screen.findByRole("button", { name: "24 learners" });
    fireEvent.click(screen.getByRole("button", { name: "Compare years" }));
    expect(screen.getByTestId("location").textContent).toBe("/school-years/compare?years=2025-2026,2026-2027");
  });

  it("shows this year alone when last year isn't registered", async () => {
    yearStates = { "2026-2027": "current", "2027-2028": "upcoming" };
    renderAs("admin");
    await screen.findByRole("button", { name: "24 learners" });
    await screen.findByRole("button", { name: "₱540,666.40" });
    expect(compareSchoolYears).toHaveBeenCalledWith(["2026-2027"]);
    expect(getFinancialSummary).not.toHaveBeenCalledWith("2025-2026");
    expect(screen.getAllByText("No S.Y. 2025-2026 to compare with.")).toHaveLength(2);
    expect(screen.queryByText(/from S\.Y\. 2025-2026/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Compare years" })).toBeNull();
  });

  it("keeps the learner counts when billing fails to load", async () => {
    getFinancialSummary.mockRejectedValue(new Error("billing is down"));
    renderAs("admin");
    expect(await screen.findByRole("button", { name: "24 learners" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
    // Said once, with its retry -- not also as a Billing panel of ₱0.00.
    expect(screen.queryByText("Billing · S.Y. 2026-2027")).toBeNull();
    expect(screen.queryByRole("button", { name: "₱0.00" })).toBeNull();
  });
});

describe("yearChange", () => {
  it("gives the difference and its whole percentage of last year", () => {
    expect(yearChange(24, 23)).toEqual({ diff: 1, pct: 4 });
    expect(yearChange("540666.40", "600000.00")).toEqual({ diff: -59333.6, pct: 10 });
  });

  it("reads equal money strings as no change, not a float remainder", () => {
    expect(yearChange("0.30", "0.10").diff).toBe(0.2);
    expect(yearChange("100.10", "100.10").diff).toBe(0);
  });

  it("has nothing to say when either year has no figure", () => {
    expect(yearChange(24, null)).toBeNull();
    expect(yearChange(undefined, 23)).toBeNull();
  });

  it("gives no percentage of a zero year", () => {
    expect(yearChange(5, 0)).toEqual({ diff: 5, pct: null });
  });
});

describe("levelRows", () => {
  it("keeps the school's level order and drops levels empty in both years", () => {
    const rows = levelRows(ENROLLMENT["2026-2027"].by_level, LEVELS(0, 1, 0, 0, 0));
    expect(rows.map((r) => r.key)).toEqual(["nursery", "kindergarten", "elementary", "junior_highschool", "senior_highschool"]);
    expect(levelRows(LEVELS(0, 0, 3, 0, 0), LEVELS(0, 0, 0, 2, 0)).map((r) => [r.key, r.current, r.previous]))
      .toEqual([["elementary", 3, 0], ["junior_highschool", 0, 2]]);
  });

  it("leaves previous null without a last year", () => {
    expect(levelRows(LEVELS(1, 0, 0, 0, 0), null)).toEqual([
      { key: "nursery", label: "Nursery", current: 1, previous: null },
    ]);
  });
});

describe("withYear", () => {
  it("adds the year to a link that has none", () => {
    expect(withYear("/invoices", "2026-2027")).toBe("/invoices?school_year=2026-2027");
    expect(withYear("/invoices?status=paid", "2026-2027")).toBe("/invoices?status=paid&school_year=2026-2027");
  });

  it("leaves a link that already names a year alone", () => {
    expect(withYear("/invoices?school_year=2024-2025", "2026-2027")).toBe("/invoices?school_year=2024-2025");
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

describe("AdminHome — school year", () => {
  const pickYear = pickYearFrom;

  it("opens on the current year, with no way back needed", async () => {
    renderAs("admin");
    expect(await screen.findByRole("button", { name: /^School year: 2026-2027/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Back to/ })).toBeNull();
  });

  it("offers no All years option", async () => {
    renderAs("admin");
    fireEvent.click(await screen.findByRole("button", { name: /^School year: 2026-2027/ }));
    expect(screen.queryByRole("option", { name: /All years/ })).toBeNull();
  });

  it("moves the counts and their links to the picked year", async () => {
    renderAs("admin");
    await screen.findByText("4 things are waiting on you");
    await pickYear("2027-2028");
    await screen.findByRole("button", { name: /Back to 2026-2027/ });

    expect(getEnrollments).toHaveBeenLastCalledWith(
      expect.objectContaining({ enrollment_status: "pending", school_year: "2027-2028" }));
    expect(getDashboardSummary).toHaveBeenLastCalledWith({ school_year: "2027-2028" });
    expect(getFinancialSummary).toHaveBeenLastCalledWith("2027-2028");

    fireEvent.click(await screen.findByRole("button", { name: /Review: 12 enrollments waiting/ }));
    expect(screen.getByTestId("location").textContent)
      .toBe("/enrollments?enrollment_status=pending&school_year=2027-2028");
  });

  it("keeps Teachers today on the current year, and says so", async () => {
    renderAs("admin");
    await screen.findByText("4 things are waiting on you");
    await pickYear("2027-2028");
    await screen.findByRole("button", { name: /Back to 2026-2027/ });
    expect(getTeachersToday).toHaveBeenLastCalledWith({ school_year: "2026-2027" });
    // The card's subtitle and the Present today tile both name today's year.
    expect(await screen.findAllByText("Today · S.Y. 2026-2027")).toHaveLength(2);
  });

  it("goes back to the current year", async () => {
    renderAs("admin");
    await screen.findByText("4 things are waiting on you");
    await pickYear("2027-2028");
    fireEvent.click(await screen.findByRole("button", { name: /Back to 2026-2027/ }));
    expect(await screen.findByRole("button", { name: /^School year: 2026-2027/ })).toBeTruthy();
    expect(getDashboardSummary).toHaveBeenLastCalledWith({ school_year: "2026-2027" });
  });
});
