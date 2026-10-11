/**
 * EnrollmentDetailPage on a dark page: the summary strip (the brand panel),
 * the invoice, documents, scholarships and grades cards, the unsent
 * confirmation email notice, and the two confirmation windows.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ThemeContext } from "../../hooks/useTheme";

const ENROLLMENT = {
  enrollment_id: 55, student_id: 9, student_name: "Ana Cruz", enrollment_status: "enrolled",
  school_level: "elementary", grade_level: "Grade 3", section: "Rizal", school_year: "2026-2027",
};

vi.mock("../../api/enrollmentApi", () => ({
  getEnrollment: () => Promise.resolve(ENROLLMENT),
  getEnrollmentEligibility: () => Promise.resolve({ entry_status: "continuing" }),
  getGrades: () => Promise.resolve([
    { subject: 1, subject_name: "Mathematics", grading_period: "1st_quarter", numeric_grade: 88, remarks: "passed" },
    { subject: 2, subject_name: "Science", grading_period: "1st_quarter", numeric_grade: 72, remarks: "failed" },
  ]),
  getEnrollmentScholarships: () => Promise.resolve([
    { enrollment_scholarship_id: 1, scholarship_type: 4, scholarship_type_detail: { scholarship_name: "Academic Excellence" }, notes: "Top of class" },
  ]),
  updateEnrollment: vi.fn(),
  transferOutEnrollment: vi.fn(),
  getEnrollmentEmailStatus: () => Promise.resolve({
    failures: [{ recipients: ["parent@example.com"], created_at: "2026-06-01T00:00:00Z" }],
  }),
  sendEnrollmentEmail: vi.fn(),
}));
vi.mock("../../api/billingApi", () => ({
  getInvoices: () => Promise.resolve({ results: [
    { invoice_id: 301, invoice_no: "INV-2026-000301", status: "partially_paid", next_due_date: "2026-07-01", is_overdue: true, payment_plan: "monthly" },
  ] }),
  closeOutInvoiceForTransfer: vi.fn(),
}));
vi.mock("../../api/studentApi", () => ({ updateStudentStatus: vi.fn() }));
vi.mock("../../api/requirementApi", () => ({
  fetchRequirementSummary: () => Promise.resolve([
    {
      requirement_type_id: 1, requirement_code: "psa_birth_certificate", requirement_name: "PSA Birth Certificate",
      description: null, is_required: true, applies: true, is_submitted: false, image_url: null,
      file_kind: null, remarks: null, submitted_at: null, submission_id: null,
    },
  ]),
  uploadRequirement: vi.fn(),
  replaceRequirement: vi.fn(),
  removeRequirement: vi.fn(),
  resolveMediaUrl: (u) => u,
}));
vi.mock("../../api/ocrApi", () => ({ scanDocument: vi.fn() }));
vi.mock("../../context/SchoolYearContext", () => ({ useSchoolYear: () => ({ yearStates: {} }) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: EnrollmentDetailPage } = await import("../EnrollmentDetailPage");

const renderDark = () => render(
  <ThemeContext.Provider value="dark">
    <div data-theme="dark">
      <MemoryRouter initialEntries={["/enrollments/55"]}>
        <Routes>
          <Route path="/enrollments/:id" element={<EnrollmentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </div>
  </ThemeContext.Provider>,
);

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Ada", role: "admin" }));
});

describe("EnrollmentDetailPage — dark mode", () => {
  it("shows the enrollment, its summary and every card", async () => {
    renderDark();
    expect(await screen.findByRole("heading", { name: "Ana Cruz" })).toBeTruthy();
    expect(screen.getByText("Grade 3")).toBeTruthy();
    expect(screen.getByText("Partial")).toBeTruthy();
    expect(screen.getByText(/· overdue/)).toBeTruthy();
    expect(await screen.findByText("PSA Birth Certificate")).toBeTruthy();
    expect(screen.getByText("Academic Excellence")).toBeTruthy();
    expect(screen.getByText("Mathematics")).toBeTruthy();
    expect(screen.getByText("failed")).toBeTruthy();
    expect(await screen.findByText(/didn't go through/)).toBeTruthy();
  });

  it("opens the Mark Completed and Transfer Out windows", async () => {
    renderDark();
    fireEvent.click(await screen.findByRole("button", { name: /Mark Completed/ }));
    expect(await screen.findByText("Mark as Completed?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: /Transfer Out/ }));
    expect(await screen.findByText("Transfer Out Student?")).toBeTruthy();
  });
});
