/**
 * DashboardPage — who gets which notification.
 *
 * The bell should only list what the viewer can act on. Its queues come from
 * dashboard/attention.js, shared with the admin home's bell (adminHome.test.jsx),
 * so both read the same. Approving enrollments and reviewing applications is
 * limited to super_admin/admin/registrar by the backend, and invoices to the
 * billing roles, so a teacher or accountant must not get a red dot for a
 * pending enrollment they can't approve.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let currentUser;
const getEnrollments = vi.fn();
const getInvoices = vi.fn();
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
  getDashboardSummary: () => Promise.resolve({}),
  // The registrar's own queues (attention.js), empty unless a test fills them.
  getDocumentStatus: () => Promise.resolve({ count: 0, results: [], summary: null }),
  getSections: () => Promise.resolve({ count: 0, results: [] }),
  getUnplacedStudents: () => Promise.resolve({ count: 0, results: [] }),
  getCalendarEvents: () => Promise.resolve({ results: [] }),
  // A teacher's home: no section, no risk check.
  getMyDay: () => Promise.resolve({ school_year: "2026-2027", no_classes: null, grading_period: null, sections: [] }),
  getRiskAssessmentLatest: () => Promise.reject(Object.assign(new Error("none"), { response: { status: 404 } })),
}));
vi.mock("../../api/billingApi", () => ({
  getInvoices: (...a) => getInvoices(...a),
  getFinancialSummary: () => Promise.resolve(null),
  // Last year's balances (attention.js): none unless a test says so.
  getInvoiceSummary: () => Promise.resolve({ unpaid: 0, partially_paid: 0, paid: 0, void: 0, total: 0 }),
  // The accounting home's payment panels.
  getPayments: () => Promise.resolve({ count: 0, results: [] }),
  getPaymentSummary: () => Promise.resolve({ total: 0 }),
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
const { ThemeContext } = await import("../../hooks/useTheme");

beforeEach(() => {
  vi.clearAllMocks();
  getEnrollments.mockResolvedValue({ count: 3, results: [] });
  getInvoices.mockImplementation((params) =>
    Promise.resolve({ count: params.overdue ? 2 : 12, results: [] }));
  // Four new; none opened and left undecided.
  getStudentApplications.mockImplementation((params) =>
    Promise.resolve({ count: params.status === "submitted" ? 4 : 0, results: [] }));
});

async function openBellAs(role, theme = "light") {
  currentUser = { role, name: "Test User" };
  render(
    <ThemeContext.Provider value={theme}>
      <div data-theme={theme === "dark" ? "dark" : undefined}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <DashboardPage />
        </MemoryRouter>
      </div>
    </ThemeContext.Provider>,
  );
  // The empty Recent enrollments table only renders once every dashboard
  // fetch has settled, the notifications included.
  await screen.findByText("No enrollments yet");
  fireEvent.click(screen.getByRole("button", { name: /^Notifications/ }));
}

describe("DashboardPage — notifications by role", () => {
  it("tells registrars about pending enrollments and new applications, not invoices", async () => {
    await openBellAs("registrar");
    expect(screen.getByRole("link", { name: /3 enrollments waiting for your approval/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /4 new applications to look over/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /invoices? with/ })).toBeNull();
    expect(getInvoices).not.toHaveBeenCalled();
  });

  it("tells accounting about unpaid and overdue invoices, not enrollments or applications", async () => {
    await openBellAs("accounting");
    expect(screen.getByRole("link", { name: /12 invoices with no payment yet/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /2 invoices with a payment past due/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /waiting for your approval/ })).toBeNull();
    expect(getStudentApplications).not.toHaveBeenCalled();
  });

  it("counts and links invoices on the dashboard's year, so the number matches the list", async () => {
    await openBellAs("accounting");
    expect(getInvoices).toHaveBeenCalledWith(expect.objectContaining({ status: "unpaid", school_year: "2026-2027" }));
    expect(screen.getByRole("link", { name: /12 invoices with no payment yet/ }).getAttribute("href"))
      .toBe("/invoices?status=unpaid&school_year=2026-2027");
  });

  it("lists in one order and one wording with the admin home, with no second line", async () => {
    await openBellAs("registrar");
    const links = screen.getAllByRole("link", { name: /waiting for your approval|new applications/ });
    expect(links.map((l) => l.textContent)).toEqual([
      "3 enrollments waiting for your approval",
      "4 new applications to look over",
    ]);
  });

  it("gives teachers no red dot for enrollments they can't approve", async () => {
    await openBellAs("teacher");
    // A teacher's own queues come from their my-day (teacherHome.test.jsx);
    // none here, so nothing new.
    expect(screen.getByRole("button", { name: "Notifications, nothing new" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /waiting for your approval/ })).toBeNull();
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(getStudentApplications).not.toHaveBeenCalled();
    expect(getInvoices).not.toHaveBeenCalled();
  });

  it("says when a count didn't load, rather than passing over it", async () => {
    getStudentApplications.mockRejectedValue(new Error("down"));
    await openBellAs("registrar");
    expect(screen.getByRole("button", { name: "Notifications, 1 needs your attention, some couldn't be checked" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /3 enrollments waiting for your approval/ })).toBeTruthy();
    expect(screen.getByText("Some notifications couldn't be checked")).toBeTruthy();
  });
});

// Staff get dark mode too (2026-10-11). The bell panel used to be hard
// white; now it's the raised surface, which turns dark.
describe("DashboardPage — the bell in dark", () => {
  it("opens the bell on a raised surface, its tiles lit", async () => {
    await openBellAs("registrar", "dark");
    const link = screen.getByRole("link", { name: /3 enrollments waiting for your approval/ });
    const panel = link.closest(".rounded-2xl");
    expect(panel.className).toContain("bg-surface-raised");
    expect(panel.className).not.toContain("bg-white");
    expect(link.querySelector("span").className).toContain("dark:bg-[linear-gradient");
  });
});
