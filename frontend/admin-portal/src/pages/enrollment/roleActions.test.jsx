/**
 * EnrollmentDetailPage — what each staff role is offered.
 *
 * The page asked for grades and the eligibility check for every role, and the
 * server refuses both to accounting — one 403 failed the whole load, so an
 * accounting user got "Failed to load enrollment details." on every
 * enrollment. And Edit, Mark Completed and Transfer Out were shown to teachers
 * and accounting, whose saves the server refuses.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = {
  getEnrollment: vi.fn(),
  getEnrollmentEligibility: vi.fn(),
  getGrades: vi.fn(),
  getEnrollmentScholarships: vi.fn(),
  getInvoices: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/enrollmentApi", () => ({
  getEnrollment: pass("getEnrollment"),
  getEnrollmentEligibility: pass("getEnrollmentEligibility"),
  getGrades: pass("getGrades"),
  getEnrollmentScholarships: pass("getEnrollmentScholarships"),
  updateEnrollment: vi.fn(),
  transferOutEnrollment: vi.fn(),
  getEnrollmentEmailStatus: vi.fn(() => Promise.resolve({ failures: [] })),
  sendEnrollmentEmail: vi.fn(),
}));
vi.mock("../../api/billingApi", () => ({
  getInvoices: pass("getInvoices"),
  closeOutInvoiceForTransfer: vi.fn(),
}));
vi.mock("../../api/studentApi", () => ({ updateStudentStatus: vi.fn() }));
vi.mock("../../components/requirements/RequirementDocumentsPanel", () => ({ default: () => null }));
vi.mock("../../context/SchoolYearContext", () => ({ useSchoolYear: () => ({ yearStates: {} }) }));

const { default: EnrollmentDetailPage } = await import("../EnrollmentDetailPage");

const ENROLLMENT = {
  enrollment_id: 55,
  student_id: 9,
  student_name: "Ana Cruz",
  enrollment_status: "enrolled",
  school_level: "elementary",
  grade_level: "Grade 3",
  section: "Rizal",
  school_year: "2026-2027",
};

function signInAs(role) {
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Staff", role }));
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/enrollments/55"]}>
      <Routes>
        <Route path="/enrollments/:id" element={<EnrollmentDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.getEnrollment.mockResolvedValue(ENROLLMENT);
  api.getEnrollmentEligibility.mockResolvedValue({ entry_status: "continuing" });
  api.getGrades.mockResolvedValue([]);
  api.getEnrollmentScholarships.mockResolvedValue([]);
  api.getInvoices.mockResolvedValue({ results: [] });
});

describe("EnrollmentDetailPage role actions", () => {
  it("loads for accounting without asking for grades or eligibility", async () => {
    signInAs("accounting");
    renderPage();

    expect(await screen.findByText("Ana Cruz")).toBeTruthy();
    expect(screen.queryByText("Failed to load enrollment details.")).toBeNull();
    expect(api.getGrades).not.toHaveBeenCalled();
    expect(api.getEnrollmentEligibility).not.toHaveBeenCalled();
    expect(screen.queryByText("Grades")).toBeNull();
    expect(screen.queryByRole("button", { name: /Report Card/ })).toBeNull();
  });

  it.each(["accounting", "teacher"])("offers %s no enrollment changes", async (role) => {
    signInAs(role);
    renderPage();

    await screen.findByText("Ana Cruz");
    for (const name of [/^Edit$/, /Mark Completed/, /Transfer Out/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    // The COR is enrollment data every staff role may print.
    expect(screen.getByRole("button", { name: /Print COR/ })).toBeTruthy();
  });

  it("still offers the registrar every action", async () => {
    signInAs("registrar");
    renderPage();

    await screen.findByText("Ana Cruz");
    for (const name of [/Report Card/, /^Edit$/, /Mark Completed/, /Transfer Out/]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(api.getGrades).toHaveBeenCalled();
  });
});
