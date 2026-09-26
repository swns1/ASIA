/**
 * Editing an enrollment's status, after the enrollment-service QA pass.
 *
 * - Any status could be picked, and the server took it: Cancelled -> Enrolled
 *   skipped the document check that Pending -> Enrolled runs. The form now
 *   offers only the moves the server allows.
 * - Activating a Pending row (the rows Mass Enroll and Promote create) never
 *   sent the confirmation or offered the invoice — only creating a row as
 *   Enrolled did, so most learners got neither.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = {
  getEnrollment: vi.fn(),
  getEnrollmentEligibility: vi.fn(),
  updateEnrollment: vi.fn(),
  createEnrollment: vi.fn(),
  getScholarshipTypes: vi.fn(),
  sendEnrollmentEmail: vi.fn(),
  getStudent: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/enrollmentApi", () => ({
  getEnrollment: pass("getEnrollment"),
  getEnrollmentEligibility: pass("getEnrollmentEligibility"),
  updateEnrollment: pass("updateEnrollment"),
  createEnrollment: pass("createEnrollment"),
  getScholarshipTypes: pass("getScholarshipTypes"),
  createEnrollmentScholarship: vi.fn(),
  sendEnrollmentEmail: pass("sendEnrollmentEmail"),
  transferInEnrollment: vi.fn(),
  getEnrollments: vi.fn(() => Promise.resolve({ results: [] })),
}));
vi.mock("../../api/studentApi", () => ({
  getStudent: pass("getStudent"),
  getStudents: vi.fn(() => Promise.resolve({ results: [] })),
}));
vi.mock("../../api/billingApi", () => ({ generateInvoice: vi.fn() }));
vi.mock("../../api/previousSchoolApi", () => ({ createPreviousSchool: vi.fn() }));
vi.mock("../../components/requirements/RequirementDocumentsPanel", () => ({ default: () => null }));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    schoolYear: "2026-2027", currentYear: "2026-2027",
    options: ["2026-2027", "2025-2026"], counts: {}, setSchoolYear: () => {},
  }),
}));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: EnrollmentFormPage } = await import("../EnrollmentFormPage");
const toast = (await import("react-hot-toast")).default;

const ROW = {
  enrollment_id: 5, student_id: 7, school_year: "2026-2027", school_level: "elementary",
  grade_level: "Grade 5", section: "Rizal", strand: null, semester: null,
};

function signIn(role) {
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Staff", role }));
}

function renderEdit() {
  return render(
    <MemoryRouter initialEntries={["/enrollments/5/edit"]}>
      <Routes>
        <Route path="/enrollments/:id/edit" element={<EnrollmentFormPage />} />
        <Route path="/enrollments" element={<div>enrollments list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function statusSelect(current) {
  const select = await screen.findByDisplayValue(current, {}, { timeout: 5000 });
  return select;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.getScholarshipTypes.mockResolvedValue([]);
  api.getStudent.mockResolvedValue({ student_id: 7, first_name: "Ana", last_name: "Cruz", email: null });
  api.getEnrollmentEligibility.mockResolvedValue({
    is_eligible: true, admin_override_required: false, blocking_reasons: [],
    missing_docs: [], optional_missing_docs: [], documents_assessed: true, is_new_student: false,
  });
  api.updateEnrollment.mockImplementation((id, body) => Promise.resolve({ ...ROW, ...body }));
  api.sendEnrollmentEmail.mockResolvedValue({ success: true, sent_to: ["maria@example.com"] });
});

describe("Status choices on an existing enrollment", { timeout: 20_000 }, () => {
  it("offers a cancelled enrollment only a way back to Pending", async () => {
    signIn("registrar");
    api.getEnrollment.mockResolvedValue({ ...ROW, enrollment_status: "cancelled" });
    renderEdit();

    const select = await statusSelect("Cancelled");
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Pending", "Cancelled"]);
  });

  it("offers a transferred-out enrollment no change at all", async () => {
    signIn("registrar");
    api.getEnrollment.mockResolvedValue({ ...ROW, enrollment_status: "transferred_out" });
    renderEdit();

    const select = await statusSelect("Transferred Out");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Transferred Out"]);
  });
});

describe("Activating a pending enrollment", { timeout: 20_000 }, () => {
  async function activate() {
    api.getEnrollment.mockResolvedValue({ ...ROW, enrollment_status: "pending" });
    renderEdit();
    const select = await statusSelect("Pending");
    expect(within(select).getAllByRole("option").map((o) => o.textContent))
      .toEqual(["Enrolled", "Pending", "Cancelled"]);
    fireEvent.change(select, { target: { value: "enrolled" } });
    fireEvent.click(screen.getByRole("button", { name: /Update Enrollment/ }));
    await waitFor(() => expect(api.updateEnrollment).toHaveBeenCalled());
  }

  it("sends the confirmation and offers the registrar the invoice", async () => {
    signIn("registrar");
    await activate();

    // The learner has no email of their own; the server writes to the guardian.
    await waitFor(() => expect(api.sendEnrollmentEmail).toHaveBeenCalledWith({ enrollment_id: 5 }));
    expect(await screen.findByText("Generate Invoice?", {}, { timeout: 5000 })).toBeTruthy();
  });

  it("stays quiet when nobody has an email address", async () => {
    signIn("registrar");
    api.sendEnrollmentEmail.mockRejectedValue({ response: { status: 400, data: { code: "no_recipient" } } });
    await activate();

    await waitFor(() => expect(api.sendEnrollmentEmail).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("doesn't offer a teacher an invoice they can't generate", async () => {
    signIn("teacher");
    await activate();

    expect(await screen.findByText("enrollments list", {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByText("Generate Invoice?")).toBeNull();
  });
});

describe("Saving without activating", { timeout: 20_000 }, () => {
  it("sends nothing when a pending row stays pending", async () => {
    signIn("registrar");
    api.getEnrollment.mockResolvedValue({ ...ROW, enrollment_status: "pending" });
    renderEdit();
    await statusSelect("Pending");
    fireEvent.click(screen.getByRole("button", { name: /Update Enrollment/ }));

    expect(await screen.findByText("enrollments list", {}, { timeout: 5000 })).toBeTruthy();
    expect(api.sendEnrollmentEmail).not.toHaveBeenCalled();
  });
});
