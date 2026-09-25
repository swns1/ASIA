/**
 * Placing returning learners: Promote Section, and the per-learner form it
 * hands off to.
 *
 * Promote only moves a section up within a school level, from rows marked
 * Completed. Everything it cannot do has to land somewhere the registrar can
 * act on, and none of it did:
 *
 * - A section still marked Enrolled at year end came back as a 404. The only
 *   way to mark it Completed was one "Mark Completed" click per learner.
 * - Grade 6 -> 7 and 10 -> 11 came back as a bare error string. Mass Enroll
 *   was the tool for those, and nothing pointed there.
 * - A learner held back had no way onto the enrollment form as a repeater:
 *   the grade was locked to the next one.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

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
}));
vi.mock("../../api/studentApi", () => ({
  getStudents: pass("getStudents"),
  getStudent: pass("getStudent"),
}));
vi.mock("../../api/billingApi", () => ({ generateInvoice: vi.fn() }));
vi.mock("../../api/previousSchoolApi", () => ({ createPreviousSchool: vi.fn() }));
vi.mock("../../components/requirements/RequirementDocumentsPanel", () => ({ default: () => null }));
vi.mock("../../components/ui/SchoolYearPicker", () => ({ default: () => null }));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    schoolYear: "2025-2026",
    currentYear: "2025-2026",
    options: ["2025-2026", "2024-2025"],
    counts: {},
    setSchoolYear: () => {},
  }),
}));

const { default: EnrollmentsPage } = await import("../EnrollmentsPage");
const { default: EnrollmentFormPage } = await import("../EnrollmentFormPage");

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderEnrollments() {
  return render(
    <MemoryRouter initialEntries={["/enrollments"]}>
      <Routes>
        <Route path="/enrollments" element={<EnrollmentsPage />} />
        <Route path="/enrollments/new" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openPromoteAndPreview({ grade = "Grade 4" } = {}) {
  fireEvent.click(await screen.findByRole("button", { name: /Promote Section/ }));
  const dialog = await screen.findByRole("dialog");
  const [fromYear, fromGrade, toYear] = within(dialog).getAllByRole("combobox");
  fireEvent.change(fromYear, { target: { value: "2025-2026" } });
  fireEvent.change(fromGrade, { target: { value: grade } });
  fireEvent.change(within(dialog).getByPlaceholderText("e.g. Rizal"), { target: { value: "Rizal" } });
  fireEvent.change(toYear, { target: { value: "2026-2027" } });
  fireEvent.click(within(dialog).getByRole("button", { name: /Preview/ }));
  return dialog;
}

const PREVIEW = {
  to_grade_level: "Grade 5", to_school_level: "elementary",
  to_section: "Rizal", to_school_year: "2026-2027",
  to_promote: [{ student_id: 1, student_name: "Cruz, Ana", average: 88 }],
  to_skip: [],
  still_enrolled: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Reg", role: "registrar" }));
  api.getEnrollments.mockResolvedValue({ results: [], count: 0 });
  api.getUnplacedStudents.mockResolvedValue({ school_year: "2025-2026", count: 0, results: [] });
  api.getStudents.mockResolvedValue({ results: [] });
  api.getScholarshipTypes.mockResolvedValue({ results: [] });
});

// Each test here renders the whole Enrollments page and walks a modal; in the
// full parallel run that brushed Vitest's 5-second default and flaked.
describe("Promote Section", { timeout: 20_000 }, () => {
  it("offers to close a section that is still marked Enrolled", async () => {
    api.promotePreview
      .mockResolvedValueOnce({ ...PREVIEW, to_promote: [], still_enrolled: [
        { enrollment_id: 5, student_id: 1, student_name: "Cruz, Ana" },
        { enrollment_id: 6, student_id: 2, student_name: "Reyes, Ben" },
      ] })
      .mockResolvedValueOnce(PREVIEW);
    api.completeSection.mockResolvedValue({ completed: 2 });

    renderEnrollments();
    const dialog = await openPromoteAndPreview();

    fireEvent.click(await within(dialog).findByRole("button", { name: /Mark 2 completed/ }));

    await waitFor(() => expect(api.completeSection).toHaveBeenCalledWith({
      school_year: "2025-2026", grade_level: "Grade 4", section: "Rizal",
    }));
    expect(await within(dialog).findByText("Cruz, Ana")).toBeTruthy();
    expect(api.promotePreview).toHaveBeenCalledTimes(2);
  });

  it("closes Grade 11 on its 2nd semester", async () => {
    api.promotePreview
      .mockResolvedValueOnce({ ...PREVIEW, to_promote: [], still_enrolled: [
        { enrollment_id: 5, student_id: 1, student_name: "Cruz, Ana" },
      ] })
      .mockResolvedValueOnce(PREVIEW);
    api.completeSection.mockResolvedValue({ completed: 1 });

    renderEnrollments();
    const dialog = await openPromoteAndPreview({ grade: "Grade 11" });
    fireEvent.click(await within(dialog).findByRole("button", { name: /Mark 1 completed/ }));

    await waitFor(() => expect(api.completeSection).toHaveBeenCalledWith(
      expect.objectContaining({ grade_level: "Grade 11", semester: "2nd" }),
    ));
  });

  it("hands a level crossing to Mass Enroll, opened on the destination grade", async () => {
    const err = new Error("level transition");
    err.response = { data: {
      reason: "level_transition",
      detail: "'Grade 6' to 'Grade 7' moves a learner from elementary to junior highschool, which has to be done per learner rather than by section.",
      from_grade_level: "Grade 6", to_grade_level: "Grade 7",
      from_school_level: "elementary", to_school_level: "junior_highschool",
    } };
    api.promotePreview.mockRejectedValue(err);

    renderEnrollments();
    const dialog = await openPromoteAndPreview({ grade: "Grade 6" });

    fireEvent.click(await within(dialog).findByRole("button", { name: /Open Mass Enroll for Grade 7/ }));

    // Scoped: the Promote dialog can still be animating out behind it.
    const mass = within(
      (await screen.findByText(/Bulk-assign students to a class section/)).closest('[role="dialog"]'),
    );
    expect(mass.getByDisplayValue("2026-2027")).toBeTruthy();
    expect(mass.getByDisplayValue("Junior High School")).toBeTruthy();
    expect(mass.getByDisplayValue("Grade 7")).toBeTruthy();
  });

  it("sends a learner who failed to the form as a repeater", async () => {
    api.promotePreview.mockResolvedValue({ ...PREVIEW, to_promote: [], to_skip: [
      { student_id: 7, student_name: "Diaz, Carlo", kind: "failed", reason: "Failed/incomplete: Mathematics (72)" },
      { student_id: 8, student_name: "Lim, Dana", kind: "already_enrolled", reason: "Already has an active enrollment in 2026-2027." },
    ] });

    renderEnrollments();
    const dialog = await openPromoteAndPreview();

    const links = await within(dialog).findAllByRole("button", { name: /Enroll as repeater/ });
    expect(links).toHaveLength(1);  // not for the learner who is already placed
    fireEvent.click(links[0]);

    expect((await screen.findByTestId("location")).textContent)
      .toBe("/enrollments/new?student=7&retain=1&school_year=2026-2027");
  });
});

describe("Not yet placed", () => {
  it("lists active students with no enrollment this year", async () => {
    api.getUnplacedStudents.mockResolvedValue({
      school_year: "2025-2026", count: 1,
      results: [{
        student_id: 117, full_name: "Juan Dela Cruz", student_number: "S-117", lrn: "1",
        last_enrollment: null,
      }],
    });

    renderEnrollments();

    expect(await screen.findByText((_, el) =>
      el?.tagName === "SPAN" && el.textContent === "1 active student has no enrollment in SY 2025-2026.",
    )).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Show/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^Enroll$/ }));

    expect((await screen.findByTestId("location")).textContent)
      .toBe("/enrollments/new?student=117&school_year=2025-2026");
  });
});

describe("Enrollment form — repeating a grade", () => {
  function renderForm(query) {
    return render(
      <MemoryRouter initialEntries={[`/enrollments/new?${query}`]}>
        <Routes>
          <Route path="/enrollments/new" element={<EnrollmentFormPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    api.getStudent.mockResolvedValue({
      student_id: 7, first_name: "Carlo", last_name: "Diaz", full_name: "Carlo Diaz", lrn: "990001",
    });
    api.getEnrollments.mockResolvedValue({ results: [{
      enrollment_id: 70, student_id: 7, school_year: "2025-2026",
      school_level: "elementary", grade_level: "Grade 4", section: "Rizal",
      enrollment_status: "completed",
    }] });
    api.getEnrollmentEligibility.mockResolvedValue({
      is_eligible: true, admin_override_required: false, can_repeat: true,
      blocking_reasons: ["Subject 'Mathematics' in Grade 4: failed (72)"],
      missing_docs: [], optional_missing_docs: [], documents_assessed: true, is_new_student: false,
    });
  });

  it("opens on Repeat from Promote's link", async () => {
    renderForm("student=7&retain=1&school_year=2026-2027");

    const repeat = await screen.findByRole("radio", { name: /Repeat Grade 4/ });
    expect(repeat.getAttribute("aria-checked")).toBe("true");
    expect(await screen.findByText(/Locked to Grade 4/)).toBeTruthy();
    expect(screen.getByDisplayValue("2026-2027")).toBeTruthy();
  });

  it("defaults to the next grade and can switch to Repeat", async () => {
    renderForm("student=7");

    const promote = await screen.findByRole("radio", { name: /Promote to Grade 5/ });
    expect(promote.getAttribute("aria-checked")).toBe("true");
    expect(await screen.findByText(/Locked to Grade 5/)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /Repeat Grade 4/ }));

    expect(await screen.findByText(/Locked to Grade 4/)).toBeTruthy();
    await waitFor(() => expect(api.getEnrollmentEligibility).toHaveBeenLastCalledWith(
      7, expect.objectContaining({ gradeLevel: "Grade 4" }),
    ));
  });
});
