/**
 * DashboardPage — who gets which notification.
 *
 * The bell should only list what the viewer can act on. (super_admin and
 * admin no longer see the bell: their home lists the same queues under "Needs
 * your attention" — see adminHome.test.jsx.) Approving an
 * enrollment is limited to super_admin/admin/registrar by the backend, and
 * invoices to the billing roles, so a teacher or accountant must not get a red
 * dot for a pending enrollment they can't approve.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let currentUser;
const getEnrollments = vi.fn();
const getInvoices = vi.fn();

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
}));
vi.mock("../../api/billingApi", () => ({
  getInvoices: (...a) => getInvoices(...a),
  getFinancialSummary: () => Promise.resolve(null),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    schoolYear: "2026-2027", options: ["2026-2027"], yearCounts: {}, currentYear: "2026-2027",
  }),
}));

const { default: DashboardPage } = await import("../DashboardPage");

beforeEach(() => {
  vi.clearAllMocks();
  getEnrollments.mockResolvedValue({ count: 3, results: [] });
  getInvoices.mockResolvedValue({ count: 12, results: [] });
});

async function openBellAs(role) {
  currentUser = { role, name: "Test User" };
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <DashboardPage />
    </MemoryRouter>,
  );
  // The empty Recent Enrollments table only renders once every dashboard
  // fetch has settled, the notifications included.
  await screen.findByText("No enrollments yet");
  fireEvent.click(screen.getByRole("button", { name: /^Notifications/ }));
}

describe("DashboardPage — notifications by role", () => {
  it("tells registrars about pending enrollments but not invoices", async () => {
    await openBellAs("registrar");
    expect(screen.getByRole("link", { name: /3 enrollments pending approval/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /unpaid invoices/ })).toBeNull();
  });

  it("tells accounting about invoices but not enrollments they can't approve", async () => {
    await openBellAs("accounting");
    expect(screen.getByRole("link", { name: /12 unpaid invoices/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /pending approval/ })).toBeNull();
  });

  it("gives teachers no red dot for enrollments they can't approve", async () => {
    await openBellAs("teacher");
    expect(screen.getByRole("button", { name: "Notifications, nothing new" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /pending approval/ })).toBeNull();
    expect(screen.getByText("You're all caught up")).toBeTruthy();
  });
});
