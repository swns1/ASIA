/**
 * EnrollmentFormPage — the two-column layout (form + summary card).
 *
 * The redesign was presentation only, so these pin the two things it must not
 * have moved: the exact payload each save sends, and which states can save at
 * all. Also pinned: a returning student whose only gap is a document is shown
 * a warning with a way through (Pending), not a red "blocked" panel.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = {
  getEnrollment: vi.fn(),
  createEnrollment: vi.fn(),
  updateEnrollment: vi.fn(),
  getEnrollments: vi.fn(),
  getEnrollmentEligibility: vi.fn(),
  getScholarshipTypes: vi.fn(),
  createEnrollmentScholarship: vi.fn(),
  sendEnrollmentEmail: vi.fn(),
  transferInEnrollment: vi.fn(),
  getStudents: vi.fn(),
  getStudent: vi.fn(),
  generateInvoice: vi.fn(),
  createPreviousSchool: vi.fn(),
  getSections: vi.fn(),
  createSection: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/enrollmentApi", () => ({
  getEnrollment: pass("getEnrollment"),
  createEnrollment: pass("createEnrollment"),
  updateEnrollment: pass("updateEnrollment"),
  getEnrollments: pass("getEnrollments"),
  getEnrollmentEligibility: pass("getEnrollmentEligibility"),
  getScholarshipTypes: pass("getScholarshipTypes"),
  createEnrollmentScholarship: pass("createEnrollmentScholarship"),
  sendEnrollmentEmail: pass("sendEnrollmentEmail"),
  transferInEnrollment: pass("transferInEnrollment"),
  getSections: pass("getSections"),
  createSection: pass("createSection"),
}));
vi.mock("../../api/studentApi", () => ({ getStudents: pass("getStudents"), getStudent: pass("getStudent") }));
vi.mock("../../api/billingApi", () => ({ generateInvoice: pass("generateInvoice") }));
vi.mock("../../api/previousSchoolApi", () => ({ createPreviousSchool: pass("createPreviousSchool") }));
vi.mock("../../components/requirements/RequirementDocumentsPanel", () => ({ default: () => null }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
// Years come from the school year registry via the context: 2026-2027 is
// current, 2025-2026 is still open.
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027",
    entryYears: ["2026-2027", "2025-2026"],
    options: ["2026-2027", "2025-2026"],
  }),
}));

const { default: EnrollmentFormPage } = await import("../EnrollmentFormPage");
const { invalidateSections } = await import("../../hooks/useSections");

// Sections are picked from the year's list now, not typed.
const SECTIONS = ["Sampaguita", "Rizal", "Rizal B"].map((name, i) => ({
  section_id: i + 1, school_year: "2026-2027", school_level: "elementary",
  grade_level: "Grade 4", name, strand: null, enrollment_count: 0, adviser_count: 0,
}));
const sectionPicker = () => screen.getByRole("combobox", { name: "Section" });

const STUDENT = { student_id: 9, first_name: "Ana", last_name: "Cruz", lrn: "123456789012", student_number: "2025-00142", email: null };

// Returning student: completed Grade 3, no failed subjects, one document owed.
const ELIGIBILITY = {
  student_id: 9,
  is_eligible: false,
  is_new_student: false,
  last_enrollment: { grade_level: "Grade 3", semester: null, school_year: "2025-2026", enrollment_status: "completed" },
  next_allowed_grade: "Grade 4",
  blocking_reasons: [],
  admin_override_required: false,
  can_repeat: false,
  missing_docs: [{ requirement_type_id: 3, requirement_name: "Report Card (Form 138)" }],
  documents_assessed: true,
  school_level_used: "elementary",
  entry_status: "continuing",
};

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/enrollments/new" element={<EnrollmentFormPage />} />
        <Route path="/enrollments/:id/edit" element={<EnrollmentFormPage />} />
        <Route path="/enrollments" element={<div>Enrollments list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  // A registrar: not a billing role, so no invoice prompt after saving.
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Staff", role: "registrar" }));
  api.getStudent.mockResolvedValue(STUDENT);
  api.getEnrollments.mockResolvedValue({
    results: [{ enrollment_id: 1, school_year: "2025-2026", grade_level: "Grade 3", enrollment_status: "completed" }],
  });
  api.getEnrollmentEligibility.mockResolvedValue(ELIGIBILITY);
  api.getScholarshipTypes.mockResolvedValue([]);
  api.createEnrollment.mockResolvedValue({ enrollment_id: 77 });
  api.updateEnrollment.mockResolvedValue({ enrollment_id: 55 });
  api.getSections.mockResolvedValue(SECTIONS);
  invalidateSections();
});

describe("New enrollment", () => {
  it("shows a missing document as a warning with a way through, not a block", async () => {
    renderAt("/enrollments/new?student=9");

    expect(await screen.findByText("Missing required documents (1)")).toBeTruthy();
    expect(screen.getByText("Eligible for Grade 4")).toBeTruthy();
    expect(screen.queryByText(/Enrollment Blocked/)).toBeNull();

    // Level and grade are fixed by progression, so their chips are locked.
    expect(screen.getByRole("button", { name: /Junior High/ }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Grade 5" }).disabled).toBe(true);
  });

  it("names what blocks Submit, and saves as Pending with the same payload as before", async () => {
    renderAt("/enrollments/new?student=9");
    await screen.findByText("Missing required documents (1)");

    await screen.findByRole("option", { name: "Sampaguita" });
    fireEvent.change(sectionPicker(), { target: { value: "Sampaguita" } });

    const submit = screen.getByRole("button", { name: "Submit Enrollment" });
    expect(submit.disabled).toBe(true);
    // The gate's own reason is on screen, not only in a tooltip.
    expect(screen.getByText(/Required documents are still missing/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Switch to Pending" }));

    const save = screen.getByRole("button", { name: "Save as Pending" });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(api.createEnrollment).toHaveBeenCalledTimes(1));
    expect(api.createEnrollment).toHaveBeenCalledWith({
      school_year: expect.stringMatching(/^\d{4}-\d{4}$/),
      school_level: "elementary",
      grade_level: "Grade 4",
      section: "Sampaguita",
      strand: null,
      semester: null,
      enrollment_status: "pending",
      student: 9,
      is_transfer_in: false,
    });
    expect(await screen.findByText("Enrollments list")).toBeTruthy();
  });

  it("checks eligibility against the placement being made", async () => {
    renderAt("/enrollments/new?student=9");
    await screen.findByText("Missing required documents (1)");
    expect(api.getEnrollmentEligibility).toHaveBeenLastCalledWith(9, {
      schoolLevel: "elementary",
      gradeLevel: "Grade 4",
      isTransferIn: false,
      excludeEnrollmentId: undefined,
    });
  });
});

describe("Edit enrollment", () => {
  beforeEach(() => {
    api.getEnrollment.mockResolvedValue({
      enrollment_id: 55,
      student_id: 9,
      school_year: "2026-2027",
      school_level: "elementary",
      grade_level: "Grade 4",
      section: "Rizal",
      strand: null,
      semester: null,
      enrollment_status: "enrolled",
    });
  });

  it("keeps placement locked and sends the same update payload as before", async () => {
    renderAt("/enrollments/55/edit");

    expect(await screen.findByText("Grade placement is locked")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Senior High/ }).disabled).toBe(true);

    await screen.findByRole("option", { name: "Rizal B" });
    fireEvent.change(sectionPicker(), { target: { value: "Rizal B" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Enrollment" }));

    await waitFor(() => expect(api.updateEnrollment).toHaveBeenCalledTimes(1));
    expect(api.updateEnrollment).toHaveBeenCalledWith("55", {
      school_year: "2026-2027",
      school_level: "elementary",
      grade_level: "Grade 4",
      section: "Rizal B",
      strand: null,
      semester: null,
      enrollment_status: "enrolled",
      student: 9,
      is_transfer_in: false,
    });
    expect(api.createEnrollment).not.toHaveBeenCalled();
  });
});

describe("Section picker", () => {
  it("offers only the grade's sections for that year", async () => {
    renderAt("/enrollments/new?student=9");
    await screen.findByText("Missing required documents (1)");
    await screen.findByRole("option", { name: "Sampaguita" });
    expect(api.getSections).toHaveBeenLastCalledWith({ school_year: "2026-2027", grade_level: "Grade 4" });
    expect(screen.getByRole("option", { name: /Add a section/ })).toBeTruthy();
  });

  it("adds a missing section on the spot and selects it", async () => {
    api.createSection.mockResolvedValue({
      section_id: 9, school_year: "2026-2027", school_level: "elementary",
      grade_level: "Grade 4", name: "Mabini", strand: null,
    });
    renderAt("/enrollments/new?student=9");
    await screen.findByText("Missing required documents (1)");
    await screen.findByRole("option", { name: "Sampaguita" });

    fireEvent.change(sectionPicker(), { target: { value: "__add_section__" } });
    fireEvent.change(await screen.findByPlaceholderText("e.g. Rizal"), { target: { value: "Mabini" } });
    api.getSections.mockResolvedValue([...SECTIONS, { ...SECTIONS[0], section_id: 9, name: "Mabini" }]);
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));

    await waitFor(() => expect(api.createSection).toHaveBeenCalledWith({
      school_year: "2026-2027", school_level: "elementary", grade_level: "Grade 4",
      name: "Mabini", strand: null,
    }));
    await waitFor(() => expect(sectionPicker().value).toBe("Mabini"));
  });
});
