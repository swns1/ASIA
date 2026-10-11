/**
 * Dark mode on the Enrollments pages: the list's two windows (Mass Enroll and
 * Promote Section) and the enrollment form.
 *
 * The other tests here render light, so the windows' dark-only branches (the
 * theme-picked hover tint, the read-only fields' fill) never run in them.
 * These walk each window inside a dark page area and check that the real
 * content still shows. The form has no shell: it themes itself through
 * ThemeArea, so it is rendered on its own routes, as an admin who chose dark.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = {
  getEnrollments: vi.fn(),
  getEnrollment: vi.fn(),
  getEnrollmentEligibility: vi.fn(),
  updateEnrollment: vi.fn(),
  createEnrollment: vi.fn(),
  bulkCreateEnrollments: vi.fn(),
  promotePreview: vi.fn(),
  promoteConfirm: vi.fn(),
  completeSection: vi.fn(),
  getUnplacedStudents: vi.fn(),
  getScholarshipTypes: vi.fn(),
  createEnrollmentScholarship: vi.fn(),
  sendEnrollmentEmail: vi.fn(),
  transferInEnrollment: vi.fn(),
  getStudents: vi.fn(),
  getStudent: vi.fn(),
  markStudentsGraduated: vi.fn(),
  getSections: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/enrollmentApi", () => ({
  getEnrollments: pass("getEnrollments"),
  getEnrollment: pass("getEnrollment"),
  getEnrollmentEligibility: pass("getEnrollmentEligibility"),
  updateEnrollment: pass("updateEnrollment"),
  createEnrollment: pass("createEnrollment"),
  bulkCreateEnrollments: pass("bulkCreateEnrollments"),
  promotePreview: pass("promotePreview"),
  promoteConfirm: pass("promoteConfirm"),
  completeSection: pass("completeSection"),
  getUnplacedStudents: pass("getUnplacedStudents"),
  getScholarshipTypes: pass("getScholarshipTypes"),
  createEnrollmentScholarship: pass("createEnrollmentScholarship"),
  sendEnrollmentEmail: pass("sendEnrollmentEmail"),
  transferInEnrollment: pass("transferInEnrollment"),
  getSections: pass("getSections"),
  createSection: vi.fn(),
}));
vi.mock("../../api/studentApi", () => ({
  getStudents: pass("getStudents"),
  getStudent: pass("getStudent"),
  markStudentsGraduated: pass("markStudentsGraduated"),
}));
vi.mock("../../api/billingApi", () => ({ generateInvoice: vi.fn() }));
vi.mock("../../api/previousSchoolApi", () => ({ createPreviousSchool: vi.fn() }));
vi.mock("../../components/requirements/RequirementDocumentsPanel", () => ({ default: () => null }));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    schoolYear: "2025-2026",
    currentYear: "2025-2026",
    options: ["2025-2026", "2024-2025"],
    entryYears: ["2026-2027", "2025-2026"],
    yearStates: {},
    counts: {},
    setSchoolYear: () => {},
  }),
}));

const { default: EnrollmentsPage } = await import("../EnrollmentsPage");
const { default: EnrollmentFormPage } = await import("../EnrollmentFormPage");
const { default: ThemeArea } = await import("../../components/ThemeArea");
const { default: useTheme, ThemeContext } = await import("../../hooks/useTheme");
const { invalidateSections } = await import("../../hooks/useSections");

// "dark", or null for light (a light container carries no attribute).
const themeOf = (el) => el.closest("[data-theme]")?.getAttribute("data-theme") ?? null;
const signInAs = (role) =>
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Ana Reyes", role }));

const sectionsFor = ({ school_year, grade_level }) => Promise.resolve([{
  section_id: 1, school_year, grade_level, school_level: "elementary",
  name: "Rizal", strand: null, enrollment_count: 0, adviser_count: 0,
}]);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  sessionStorage.setItem("access_token", "t");
  signInAs("registrar");
  api.getEnrollments.mockResolvedValue({ results: [], count: 0 });
  api.getUnplacedStudents.mockResolvedValue({ school_year: "2025-2026", count: 0, results: [] });
  api.getStudents.mockResolvedValue({ results: [] });
  api.getScholarshipTypes.mockResolvedValue({ results: [] });
  api.getSections.mockImplementation(sectionsFor);
  invalidateSections();
});

// The list as AppLayout draws it on a dark page: inside a dark area.
function renderListDark() {
  return render(
    <MemoryRouter initialEntries={["/enrollments"]}>
      <ThemeContext.Provider value="dark">
        <div data-theme="dark">
          <Routes>
            <Route path="/enrollments" element={<EnrollmentsPage />} />
            <Route path="/enrollments/new" element={<p>Enrollment form</p>} />
          </Routes>
        </div>
      </ThemeContext.Provider>
    </MemoryRouter>,
  );
}

describe("Mass Enroll in dark", { timeout: 20_000 }, () => {
  const STUDENTS = [
    { student_id: 1, first_name: "Ana", last_name: "Cruz", lrn: "101" },
    { student_id: 2, first_name: "Ben", last_name: "Reyes", lrn: "102" },
    { student_id: 3, first_name: "Cora", last_name: "Diaz", lrn: "103" },
    { student_id: 4, first_name: "Dan", last_name: "Lim", lrn: "104" },
  ];
  const ELIGIBILITY = {
    1: { blocking_reasons: ["Failed Mathematics"], missing_docs: [] },
    2: { blocking_reasons: [], missing_docs: [{ requirement_type_id: 1, requirement_name: "PSA" }] },
    3: { blocking_reasons: [], missing_docs: [], documents_assessed: false },
    4: { blocking_reasons: [], missing_docs: [], documents_assessed: true },
  };

  beforeEach(() => {
    api.getStudents.mockResolvedValue({ results: STUDENTS });
    api.getEnrollments.mockImplementation((params = {}) => {
      // A learner's completed years: Dan finished Kindergarten, the rest are new.
      if (params.student) {
        return Promise.resolve({
          results: params.student === 4
            ? [{ enrollment_id: 40, school_year: "2024-2025", grade_level: "Kindergarten" }]
            : [],
        });
      }
      // The class already holds one pending learner.
      if (params.section) {
        return Promise.resolve({ results: [{
          enrollment_id: 90, student: 50, enrollment_status: "pending",
          student_detail: { first_name: "Bea", last_name: "Lopez" },
        }] });
      }
      return Promise.resolve({ results: [], count: 0 });
    });
    api.getEnrollmentEligibility.mockImplementation((id) => Promise.resolve(ELIGIBILITY[id]));
  });

  it("shows the candidates, their badges, the class and the outcome", async () => {
    api.bulkCreateEnrollments.mockResolvedValue({
      created: [{ student_id: 4 }],
      failed: [{ student_id: 2, reason: "Documents missing" }],
    });

    renderListDark();
    fireEvent.click(await screen.findByRole("button", { name: /Mass Enroll/ }));
    const dialog = await screen.findByRole("dialog");
    expect(themeOf(dialog)).toBe("dark");

    const section = within(dialog).getByRole("combobox", { name: "Section" });
    await within(section).findByRole("option", { name: "Rizal" });
    fireEvent.change(section, { target: { value: "Rizal" } });

    // Candidates, each with its eligibility badge and grade chip.
    expect(await within(dialog).findByText("Cruz, Ana", {}, { timeout: 5000 })).toBeTruthy();
    expect(await within(dialog).findByText("Blocked")).toBeTruthy();
    expect(within(dialog).getByText("Docs (1)")).toBeTruthy();
    expect(within(dialog).getByText("Docs not checked")).toBeTruthy();
    expect(within(dialog).getByText("Eligible")).toBeTruthy();
    expect(within(dialog).getAllByText("New")).toHaveLength(3);
    expect(within(dialog).getByText(/Kindergarten →/)).toBeTruthy();

    // The class's own learner, and the inline remove confirmation.
    expect(await within(dialog).findByText("Bea Lopez")).toBeTruthy();
    fireEvent.click(within(dialog).getByTitle("Remove from class"));
    expect(within(dialog).getByText(/from this class\?/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    // Pick one and enroll: the outcome box lists what failed.
    fireEvent.click(within(dialog).getByText("Lim, Dan"));
    expect(within(dialog).getByText("1 selected")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /Enroll Selected \(1\)/ }));
    expect(await within(dialog).findByText(/1 student added as Pending\./)).toBeTruthy();
    expect(within(dialog).getByText(/Student #2: Documents missing/)).toBeTruthy();
  });

  it("shows a failed save", async () => {
    api.bulkCreateEnrollments.mockRejectedValue(new Error("Bulk enrollment failed."));

    renderListDark();
    fireEvent.click(await screen.findByRole("button", { name: /Mass Enroll/ }));
    const dialog = await screen.findByRole("dialog");
    const section = within(dialog).getByRole("combobox", { name: "Section" });
    await within(section).findByRole("option", { name: "Rizal" });
    fireEvent.change(section, { target: { value: "Rizal" } });

    fireEvent.click(await within(dialog).findByText("Lim, Dan", {}, { timeout: 5000 }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Enroll Selected/ }));
    expect(await within(dialog).findByText("Bulk enrollment failed.")).toBeTruthy();
  });
});

describe("Promote Section in dark", { timeout: 20_000 }, () => {
  async function openPromote() {
    renderListDark();
    fireEvent.click(await screen.findByRole("button", { name: /Promote Section/ }));
    const dialog = await screen.findByRole("dialog");
    expect(themeOf(dialog)).toBe("dark");
    // The step-1 note is the blue info box.
    expect(within(dialog).getByText(/Nothing is saved until you confirm/)).toBeTruthy();
    const [fromYear, fromGrade] = within(dialog).getAllByRole("combobox");
    fireEvent.change(fromYear, { target: { value: "2025-2026" } });
    fireEvent.change(fromGrade, { target: { value: "Grade 4" } });
    const source = within(dialog).getByRole("combobox", { name: "Source section" });
    await within(source).findByRole("option", { name: "Rizal" });
    fireEvent.change(source, { target: { value: "Rizal" } });
    await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Destination section" }).value).toBe("Rizal"));
    // The read-only fields take the dark fill.
    expect(within(dialog).getByLabelText("Destination school year").value).toBe("2026-2027");
    return dialog;
  }

  it("walks preview and result", async () => {
    api.promotePreview.mockResolvedValue({
      to_grade_level: "Grade 5", to_school_level: "elementary",
      to_section: "Rizal", to_school_year: "2026-2027",
      to_promote: [
        { student_id: 1, student_name: "Cruz, Ana", average: 88 },
        { student_id: 2, student_name: "Reyes, Ben", average: 90.5 },
      ],
      to_skip: [
        { student_id: 7, student_name: "Diaz, Carlo", kind: "failed", reason: "Failed/incomplete: Mathematics (72)" },
        { student_id: 8, student_name: "Lim, Dana", kind: "already_enrolled", reason: "Already enrolled." },
      ],
      still_enrolled: [{ enrollment_id: 5, student_id: 9, student_name: "Tan, Eli" }],
    });
    api.promoteConfirm.mockResolvedValue({
      created: [{ student_id: 1 }, { student_id: 2 }],
      skipped: [{ student_id: 7, student_name: "Diaz, Carlo", kind: "failed", reason: "Failed" }],
      failed: [{ student_id: 8, student_name: "Lim, Dana", reason: "Server error" }],
      to_grade_level: "Grade 5", to_section: "Rizal", to_school_year: "2026-2027",
    });

    const dialog = await openPromote();
    fireEvent.click(within(dialog).getByRole("button", { name: /Preview/ }));

    // Preview: the stat tiles, the still-enrolled warning, both lists.
    expect(await within(dialog).findByText("Will Promote")).toBeTruthy();
    expect(within(dialog).getByText(/still marked/)).toBeTruthy();
    expect(within(dialog).getByText("Avg: 90.50")).toBeTruthy();
    expect(within(dialog).getByText("Failed/incomplete: Mathematics (72)")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Enroll as repeater/ })).toBeTruthy();

    // Result: the success tile, the skipped and failed boxes.
    fireEvent.click(within(dialog).getByRole("button", { name: /Confirm & Promote \(2\)/ }));
    expect(await within(dialog).findByText("Promotion Complete")).toBeTruthy();
    expect(within(dialog).getByText(/student was skipped/)).toBeTruthy();
    expect(within(dialog).getByText(/failed to create/)).toBeTruthy();
  });

  it("shows a refused preview and an empty one", async () => {
    api.promotePreview
      .mockRejectedValueOnce(new Error("Preview failed."))
      .mockResolvedValueOnce({
        to_grade_level: "Grade 5", to_section: "Rizal", to_school_year: "2026-2027",
        to_promote: [], to_skip: [], still_enrolled: [],
      });

    const dialog = await openPromote();
    fireEvent.click(within(dialog).getByRole("button", { name: /Preview/ }));
    expect(await within(dialog).findByText("Preview failed.")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: /Preview/ }));
    expect(await within(dialog).findByText(/No students are eligible for promotion/)).toBeTruthy();
  });
});

describe("Enrollment form in dark", () => {
  const STUDENT = { student_id: 7, first_name: "Carlo", last_name: "Diaz", lrn: "990001", student_number: "S-7" };

  beforeEach(() => {
    // An admin who chose dark: the form themes itself (ThemeArea).
    signInAs("admin");
    localStorage.setItem("asia.dev.theme", "dark");
    api.getStudent.mockResolvedValue(STUDENT);
    api.getEnrollments.mockResolvedValue({ results: [{
      enrollment_id: 70, student_id: 7, school_year: "2024-2025",
      school_level: "elementary", grade_level: "Grade 4", section: "Rizal",
      enrollment_status: "completed",
    }] });
    api.getEnrollmentEligibility.mockResolvedValue({
      is_eligible: false, is_new_student: false, admin_override_required: false, can_repeat: false,
      last_enrollment: { grade_level: "Grade 4", semester: null, school_year: "2024-2025", enrollment_status: "completed" },
      next_allowed_grade: "Grade 5", blocking_reasons: [],
      missing_docs: [{ requirement_type_id: 3, requirement_name: "Report Card (Form 138)" }],
      documents_assessed: true, school_level_used: "elementary", entry_status: "continuing",
    });
    api.getEnrollment.mockResolvedValue({
      enrollment_id: 12, student_id: 7, school_year: "2025-2026", school_level: "elementary",
      grade_level: "Grade 5", section: "Rizal", strand: null, semester: null, enrollment_status: "pending",
    });
  });

  const renderFormAt = (url) =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/enrollments/new" element={<EnrollmentFormPage />} />
          <Route path="/enrollments/:id/edit" element={<EnrollmentFormPage />} />
          <Route path="/enrollments" element={<p>Enrollments list</p>} />
        </Routes>
      </MemoryRouter>,
    );

  it("draws a new enrollment dark, its dialogs included", async () => {
    renderFormAt("/enrollments/new?student=7");

    const [name] = await screen.findAllByText("Carlo Diaz");
    expect(themeOf(name)).toBe("dark");
    expect(await screen.findByText("Missing required documents (1)")).toBeTruthy();
    expect(screen.getByText("Report Card (Form 138)")).toBeTruthy();
    expect(screen.getByText("Enrollment summary")).toBeTruthy();

    // The leave-confirm floats over the form in the form's theme.
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
    expect(themeOf(await screen.findByRole("dialog"))).toBe("dark");
  });

  it("draws an edit dark", async () => {
    renderFormAt("/enrollments/12/edit");
    const locked = await screen.findByText("Grade placement is locked");
    expect(themeOf(locked)).toBe("dark");
  });

  // The form's routes, and a look-alike off the list that must stay light
  // (the form's pattern must not over-match).
  function Probe() {
    return <p>theme: {useTheme()}</p>;
  }
  it.each([
    ["/enrollments/new", "dark"],
    ["/enrollments/12/edit", "dark"],
    ["/enrollments/12/edit/extra", null],
  ])("ThemeArea at %s is %s", (path, expected) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeArea className="min-h-screen bg-neutral-50">
          <Probe />
        </ThemeArea>
      </MemoryRouter>,
    );
    expect(themeOf(screen.getByText(/theme:/))).toBe(expected);
  });
});
