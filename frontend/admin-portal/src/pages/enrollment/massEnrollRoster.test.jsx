/**
 * Mass Enroll's "In This Class" list names each enrolled learner.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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
vi.mock("../../components/ui/SchoolYearPicker", () => ({ default: () => null }));
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
const { invalidateSections } = await import("../../hooks/useSections");

// Every grade of every year has a section named Rizal: sections are picked
// from the year's list, not typed.
const sectionsFor = ({ school_year, grade_level }) => Promise.resolve([{
  section_id: 1, school_year, grade_level, school_level: "elementary",
  name: "Rizal", strand: null, enrollment_count: 0, adviser_count: 0,
}]);


// The roster in Mass Enroll's "In This Class" column. A row's name is the
// enrollment's student_name, else the learner's first and last name, else
// "Student #id". `??` binds tighter than `?:`, so the unbracketed version read
// `(student_name ?? student_detail) ? first+last : "Student #id"`: a row with
// a student_name and no student_detail showed a blank name and a "?" avatar.
const ROSTER = [
  { enrollment_id: 31, student: 1, enrollment_status: "enrolled", student_name: "Cruz, Ana" },
  { enrollment_id: 32, student: 2, enrollment_status: "enrolled", student_detail: { first_name: "Ben", last_name: "Reyes" } },
  { enrollment_id: 33, student: 3, enrollment_status: "enrolled" },
];

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Reg", role: "registrar" }));
  api.getEnrollments.mockImplementation((params = {}) => Promise.resolve(
    params.section === "Rizal" ? { results: ROSTER, count: ROSTER.length } : { results: [], count: 0 },
  ));
  api.getUnplacedStudents.mockResolvedValue({ school_year: "2025-2026", count: 0, results: [] });
  api.getStudents.mockResolvedValue({ results: [] });
  api.getScholarshipTypes.mockResolvedValue({ results: [] });
  api.getSections.mockImplementation(sectionsFor);
  invalidateSections();
});

describe("Mass Enroll roster", { timeout: 20_000 }, () => {
  it("names every learner in the class, whichever fields the row carries", async () => {
    render(
      <MemoryRouter initialEntries={["/enrollments"]}>
        <EnrollmentsPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Mass Enroll/ }));
    const dialog = (await screen.findByText(/Bulk-assign students to a class section/)).closest('[role="dialog"]');
    const section = within(dialog).getByRole("combobox", { name: "Section" });
    await within(section).findByRole("option", { name: "Rizal" });
    fireEvent.change(section, { target: { value: "Rizal" } });

    expect(await within(dialog).findByText("Cruz, Ana")).toBeTruthy();
    expect(within(dialog).getByText("Ben Reyes")).toBeTruthy();
    expect(within(dialog).getByText("Student #3")).toBeTruthy();
  });
});
