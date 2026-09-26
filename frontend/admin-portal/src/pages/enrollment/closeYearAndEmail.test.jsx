/**
 * Enrollment-service QA, second pass.
 *
 * - A finished school year could only be closed one class at a time, so one
 *   nobody closed stayed open: 47 learners of 2025-2026 still read as Enrolled.
 *   The Enrollments page now offers "Close SY" for a past year that has them.
 * - A confirmation email that failed was logged for follow-up, but no screen
 *   read the log. The enrollment page now says so, with a Resend button.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = {
  getEnrollments: vi.fn(),
  getUnplacedStudents: vi.fn(),
  closeSchoolYear: vi.fn(),
  getEnrollment: vi.fn(),
  getEnrollmentEligibility: vi.fn(),
  getGrades: vi.fn(),
  getEnrollmentScholarships: vi.fn(),
  getEnrollmentEmailStatus: vi.fn(),
  sendEnrollmentEmail: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/enrollmentApi", () => ({
  getEnrollments: pass("getEnrollments"),
  getUnplacedStudents: pass("getUnplacedStudents"),
  closeSchoolYear: pass("closeSchoolYear"),
  getEnrollmentEligibility: pass("getEnrollmentEligibility"),
  updateEnrollment: vi.fn(),
  bulkCreateEnrollments: vi.fn(),
  promotePreview: vi.fn(),
  promoteConfirm: vi.fn(),
  completeSection: vi.fn(),
  getEnrollment: pass("getEnrollment"),
  getGrades: pass("getGrades"),
  getEnrollmentScholarships: pass("getEnrollmentScholarships"),
  transferOutEnrollment: vi.fn(),
  getEnrollmentEmailStatus: pass("getEnrollmentEmailStatus"),
  sendEnrollmentEmail: pass("sendEnrollmentEmail"),
}));
vi.mock("../../api/studentApi", () => ({
  getStudents: vi.fn(() => Promise.resolve({ results: [] })),
  markStudentsGraduated: vi.fn(),
  updateStudentStatus: vi.fn(),
}));
vi.mock("../../api/billingApi", () => ({
  getInvoices: vi.fn(() => Promise.resolve({ results: [] })),
  closeOutInvoiceForTransfer: vi.fn(),
}));
vi.mock("../../components/requirements/RequirementDocumentsPanel", () => ({ default: () => null }));
vi.mock("../../components/ui/SchoolYearPicker", () => ({ default: () => null }));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    schoolYear: "2026-2027", currentYear: "2026-2027",
    options: ["2026-2027", "2025-2026"], counts: {}, setSchoolYear: () => {},
  }),
}));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: EnrollmentsPage } = await import("../EnrollmentsPage");
const { default: EnrollmentDetailPage } = await import("../EnrollmentDetailPage");

function signIn(role) {
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Staff", role }));
}

function countsFor(enrolled) {
  api.getEnrollments.mockImplementation((params = {}) => {
    const byStatus = { enrolled, pending: 0, completed: 173, cancelled: 0 };
    const count = params.enrollment_status ? byStatus[params.enrollment_status] : enrolled + 173;
    return Promise.resolve({ results: [], count });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.getUnplacedStudents.mockResolvedValue({ school_year: "2025-2026", count: 0, results: [] });
});

describe("Close SY", { timeout: 20_000 }, () => {
  function renderYear(year) {
    return render(
      <MemoryRouter initialEntries={[`/enrollments?school_year=${year}`]}>
        <Routes><Route path="/enrollments" element={<EnrollmentsPage />} /></Routes>
      </MemoryRouter>,
    );
  }

  it("is offered for a past year that still has learners marked Enrolled", async () => {
    signIn("registrar");
    countsFor(47);
    api.closeSchoolYear.mockResolvedValue({ school_year: "2025-2026", completed: 47 });
    renderYear("2025-2026");

    expect(await screen.findByText(/SY 2025-2026 has ended/, {}, { timeout: 5000 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Close SY 2025-2026/ }));
    expect(screen.getByText("Mark all 47 completed?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Close SY 2025-2026/ }));

    await waitFor(() => expect(api.closeSchoolYear).toHaveBeenCalledWith("2025-2026"));
  });

  it("is not offered for the year in progress", async () => {
    signIn("registrar");
    countsFor(155);
    renderYear("2026-2027");

    await waitFor(() => expect(api.getEnrollments).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/has ended/)).toBeNull();
  });

  it("is not offered to a teacher", async () => {
    signIn("teacher");
    countsFor(47);
    renderYear("2025-2026");

    await waitFor(() => expect(api.getEnrollments).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/has ended/)).toBeNull();
  });
});

describe("A confirmation email that didn't go through", { timeout: 20_000 }, () => {
  function renderDetail() {
    return render(
      <MemoryRouter initialEntries={["/enrollments/55"]}>
        <Routes><Route path="/enrollments/:id" element={<EnrollmentDetailPage />} /></Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    api.getEnrollment.mockResolvedValue({
      enrollment_id: 55, student_id: 9, student_name: "Ana Cruz", enrollment_status: "enrolled",
      school_level: "elementary", grade_level: "Grade 3", section: "Rizal", school_year: "2026-2027",
    });
    api.getGrades.mockResolvedValue([]);
    api.getEnrollmentScholarships.mockResolvedValue([]);
    api.getEnrollmentEligibility.mockResolvedValue(null);
  });

  it("is shown with a Resend that clears it once sent", async () => {
    signIn("registrar");
    api.getEnrollmentEmailStatus.mockResolvedValue({ failures: [
      { id: 1, to_email: "maria@example.com", recipients: ["maria@example.com"], created_at: "2026-09-20T08:00:00+08:00" },
    ] });
    api.sendEnrollmentEmail.mockResolvedValue({ success: true, sent_to: ["maria@example.com"] });
    renderDetail();

    expect(await screen.findByText(/confirmation to maria@example.com didn't go through/, {}, { timeout: 5000 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Resend/ }));

    await waitFor(() => expect(api.sendEnrollmentEmail).toHaveBeenCalledWith({ enrollment_id: 55 }));
    await waitFor(() => expect(screen.queryByText(/didn't go through/)).toBeNull());
  });

  it("isn't asked for by a role that can't resend", async () => {
    signIn("accounting");
    renderDetail();

    await screen.findByText("Ana Cruz", {}, { timeout: 5000 });
    expect(api.getEnrollmentEmailStatus).not.toHaveBeenCalled();
  });
});
