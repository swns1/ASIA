/**
 * Senior high report cards cover the whole school year.
 *
 * Senior high is enrolled one semester at a time — two enrollment rows a year —
 * and both the report card and SF9 read one row, so a Grade 11 learner's
 * 2nd-semester card listed three subjects and left the 1st semester off.
 * DepEd's senior high SF9 reports both semesters, each with a General Average.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = {
  getReportCard: vi.fn(),
  getEnrollment: vi.fn(),
  getEnrollments: vi.fn(),
  getSubjects: vi.fn(),
  getGrades: vi.fn(),
  getAttendance: vi.fn(),
  getNarrativeReports: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/enrollmentApi", () => ({
  getReportCard: pass("getReportCard"),
  getEnrollment: pass("getEnrollment"),
  getEnrollments: pass("getEnrollments"),
  getSubjects: pass("getSubjects"),
  getGrades: pass("getGrades"),
  getNarrativeCategories: vi.fn(() => Promise.resolve([])),
  getNarrativeReports: pass("getNarrativeReports"),
}));
vi.mock("../../api/attendanceApi", () => ({ getAttendance: pass("getAttendance") }));
vi.mock("../../api/studentApi", () => ({
  getStudent: vi.fn(() => Promise.resolve({ student_id: 7, first_name: "Ana", last_name: "Cruz", lrn: "990007", sex: "female" })),
}));
vi.mock("../../api/billingApi", () => ({ getSchoolSettings: vi.fn(() => Promise.resolve(null)) }));
vi.mock("../../utils/pdfExport", () => ({ downloadAsPDF: vi.fn() }));

const { default: ReportCardPage } = await import("../ReportCardPage");
const { default: SF9PrintPage } = await import("./SF9PrintPage");

const FIRST = { enrollment_id: 10, student: 7, student_id: 7, school_year: "2026-2027", school_level: "senior_highschool",
  grade_level: "Grade 11", section: "Bonifacio", strand: "ABM", semester: "1st", enrollment_status: "completed" };
const SECOND = { ...FIRST, enrollment_id: 11, semester: "2nd", enrollment_status: "enrolled" };

function renderAt(path, route, element) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /></Routes></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Reg", role: "registrar" }));
});

describe("Report card for a senior high learner", { timeout: 20_000 }, () => {
  it("lists each semester's subjects with its own general average", async () => {
    api.getReportCard.mockResolvedValue({
      enrollment: SECOND,
      student: { student_id: 7, first_name: "Ana", last_name: "Cruz", lrn: "990007", student_number: "S-7", sex: "female" },
      grading_periods: [{ key: "1st_semester", label: "1st Semester" }, { key: "2nd_semester", label: "2nd Semester" }],
      available_periods: [{ key: "1st_semester", label: "1st Semester" }, { key: "2nd_semester", label: "2nd Semester" }],
      subjects: [
        { subject_id: 1, subject_code: "GM", subject_name: "General Mathematics", semester: "1st_semester", grades: {}, average: 84, overall_remarks: "passed" },
        { subject_id: 2, subject_code: "PD", subject_name: "Personal Development", semester: "2nd_semester", grades: {}, average: 88, overall_remarks: "passed" },
      ],
      semesters: [
        { key: "1st_semester", label: "1st Semester", enrollment_id: 10, enrollment_status: "completed", general_average: 84 },
        { key: "2nd_semester", label: "2nd Semester", enrollment_id: 11, enrollment_status: "enrolled", general_average: 88 },
      ],
      general_average: 86,
    });
    renderAt("/report-card/11", "/report-card/:enrollmentId", <ReportCardPage />);

    const first = (await screen.findByRole("columnheader", { name: "1st Semester" }, { timeout: 5000 })).closest("table");
    const second = screen.getByRole("columnheader", { name: "2nd Semester" }).closest("table");
    expect(within(first).getByText("General Mathematics")).toBeTruthy();
    expect(within(first).queryByText("Personal Development")).toBeNull();
    expect(within(second).getByText("Personal Development")).toBeTruthy();
    expect(within(first).getByText("84")).toBeTruthy();
    expect(within(second).getByText("88")).toBeTruthy();
    // The year's figure is the mean of the two semesters.
    expect(screen.getByText("86")).toBeTruthy();
  });
});

describe("SF9 for a senior high learner", { timeout: 20_000 }, () => {
  it("reads both semester rows of the year and prints each semester", async () => {
    api.getEnrollment.mockResolvedValue(SECOND);
    api.getEnrollments.mockResolvedValue({ results: [FIRST, SECOND] });
    api.getSubjects.mockResolvedValue({ results: [
      { subject_id: 1, subject_name: "General Mathematics", semester: "1st" },
      { subject_id: 2, subject_name: "Personal Development", semester: "2nd" },
    ] });
    api.getGrades.mockImplementation(({ enrollment }) => Promise.resolve(enrollment === 10
      ? [{ subject: 1, grading_period: "1st_semester", numeric_grade: "84" }]
      : [{ subject: 2, grading_period: "2nd_semester", numeric_grade: "88" }]));
    api.getAttendance.mockImplementation(({ enrollment }) => Promise.resolve(enrollment === 10
      ? [{ enrollment: 10, date: "2026-11-27", status: "P" }]
      : [{ enrollment: 11, date: "2026-12-02", status: "A" }]));
    api.getNarrativeReports.mockResolvedValue([]);
    renderAt("/print/sf9/11", "/print/sf9/:enrollmentId", <SF9PrintPage />);

    const first = (await screen.findByText("First Semester — Learning Areas", {}, { timeout: 5000 })).closest("table");
    const second = screen.getByText("Second Semester — Learning Areas").closest("table");
    expect(within(first).getByText("General Mathematics")).toBeTruthy();
    expect(within(second).getByText("Personal Development")).toBeTruthy();
    expect(api.getGrades).toHaveBeenCalledWith(expect.objectContaining({ enrollment: 10 }));
    expect(api.getGrades).toHaveBeenCalledWith(expect.objectContaining({ enrollment: 11 }));
    // Subjects for the whole year: no semester filter, core plus the strand.
    expect(api.getSubjects).toHaveBeenCalledWith(expect.not.objectContaining({ semester: expect.anything() }));
    expect(api.getSubjects).toHaveBeenCalledWith(expect.objectContaining({ for_strand: "ABM" }));
  });
});
