/**
 * GradesPage — the Entry, Summary and Observed values tabs.
 *
 * Entry: scores save as they're typed, the grade is worked out by the server
 * after every change instead of on a Compute button, and Save is offered only
 * when there's a finished grade that differs from the one saved.
 * Summary: subjects pass or fail on their final rating, not per quarter grade.
 * Observed values: its own tab, driven by the selection card's period.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  getEnrollments: vi.fn(), getSubjects: vi.fn(), getGrades: vi.fn(), getScoreEntries: vi.fn(),
  computeGrade: vi.fn(), createScoreEntry: vi.fn(), updateScoreEntry: vi.fn(), deleteScoreEntry: vi.fn(),
  saveGrade: vi.fn(), updateGrade: vi.fn(), getNarrativeCategories: vi.fn(), getNarrativeReports: vi.fn(),
  createNarrativeReport: vi.fn(), updateNarrativeReport: vi.fn(), deleteNarrativeReport: vi.fn(),
  callGemini: vi.fn(), getGradeAverages: vi.fn(), getStudent: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/enrollmentApi", () => ({
  getEnrollments: pass("getEnrollments"), getSubjects: pass("getSubjects"), getGrades: pass("getGrades"),
  getScoreEntries: pass("getScoreEntries"), computeGrade: pass("computeGrade"),
  createScoreEntry: pass("createScoreEntry"), updateScoreEntry: pass("updateScoreEntry"),
  deleteScoreEntry: pass("deleteScoreEntry"), saveGrade: pass("saveGrade"), updateGrade: pass("updateGrade"),
  getNarrativeCategories: pass("getNarrativeCategories"), getNarrativeReports: pass("getNarrativeReports"),
  createNarrativeReport: pass("createNarrativeReport"), updateNarrativeReport: pass("updateNarrativeReport"),
  deleteNarrativeReport: pass("deleteNarrativeReport"), callGemini: pass("callGemini"),
  getGradeAverages: pass("getGradeAverages"),
}));
vi.mock("../../api/studentApi", () => ({
  getStudent: pass("getStudent"),
  getStudents: vi.fn(() => Promise.resolve({ results: [] })),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ currentYear: "2026-2027", options: ["2026-2027"], yearStates: {}, yearCounts: {} }),
}));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: GradesPage } = await import("../GradesPage");

const STUDENT = { student_id: 5, first_name: "Juan", last_name: "Dela Cruz", lrn: "136512090014", student_number: "S-5" };
const ENROLLMENT = {
  enrollment_id: 11, student: 5, school_year: "2026-2027", school_level: "junior_highschool",
  grade_level: "Grade 10", section: "St. Mark",
};
const TEMPLATE = {
  template_name: "DepEd JHS",
  components: [
    { grading_component_id: 1, component_name: "Written Work", weight: "40.00" },
    { grading_component_id: 2, component_name: "Performance Tasks", weight: "40.00" },
    { grading_component_id: 3, component_name: "Quarterly Assessment", weight: "20.00" },
  ],
};
const MATH = { subject_id: 7, subject_name: "Mathematics 10", subject_code: "MATH10", grading_template_detail: TEMPLATE };
const SCI  = { subject_id: 8, subject_name: "Science 10", subject_code: "SCI10", grading_template_detail: TEMPLATE };
const ENTRIES = [
  { score_entry_id: 101, grading_component: 1, label: "Quiz 1", score: "18.00", max_score: "20.00" },
  { score_entry_id: 102, grading_component: 1, label: "Quiz 2", score: "15.00", max_score: "20.00" },
  { score_entry_id: 103, grading_component: 2, label: "Project", score: "45.00", max_score: "50.00" },
  { score_entry_id: 104, grading_component: 3, label: "Exam", score: "38.00", max_score: "50.00" },
];
const computed = (final_grade, extra = {}) => ({
  final_grade, initial_grade: 81.2, is_complete: true, remarks: final_grade >= 75 ? "passed" : "failed",
  components: [
    { component_id: 1, component_name: "Written Work", weighted_score: 33 },
    { component_id: 2, component_name: "Performance Tasks", weighted_score: 36 },
    { component_id: 3, component_name: "Quarterly Assessment", weighted_score: 15.2 },
  ],
  ...extra,
});

// The grades the enrollment has saved: for the summary, and the one saved
// grade the entry sheet looks up for its subject and period.
let savedGrades = [];

function page(path) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <GradesPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Reg", role: "registrar" }));
  savedGrades = [];
  api.getStudent.mockResolvedValue(STUDENT);
  api.getEnrollments.mockResolvedValue({ results: [ENROLLMENT] });
  api.getSubjects.mockResolvedValue({ results: [MATH, SCI] });
  api.getGrades.mockImplementation(async (p) => ({
    results: savedGrades.filter((g) =>
      (!p.subject || g.subject === p.subject) && (!p.grading_period || g.grading_period === p.grading_period)),
  }));
  // A fresh copy each time, as the API sends.
  api.getScoreEntries.mockImplementation(async () => ({ results: ENTRIES.map((e) => ({ ...e })) }));
  // The Overview tab, where a summary deep link lands first.
  api.getGradeAverages.mockResolvedValue({ learners: 1, passed: 1, failed: 0, no_grades: 0 });
  api.computeGrade.mockResolvedValue(computed(88));
  api.getNarrativeCategories.mockResolvedValue({ results: [] });
  api.getNarrativeReports.mockResolvedValue({ results: [] });
});

async function openSheet() {
  render(page("/grades/entry?student=5"));
  fireEvent.click(await screen.findByRole("radio", { name: /S\.Y\. 2026-2027/ }));
  fireEvent.click(await screen.findByRole("radio", { name: /Mathematics 10/ }));
  return screen.findByRole("spinbutton", { name: "Score for Quiz 1" });
}

describe("Grades — Entry", () => {
  it("lays the selection out as steps, and lists each subject's saved grade for the period", async () => {
    savedGrades = [{ grade_id: 1, subject: 8, grading_period: "1st_quarter", numeric_grade: "86.00", remarks: "passed" }];
    render(page("/grades/entry?student=5"));
    fireEvent.click(await screen.findByRole("radio", { name: /S\.Y\. 2026-2027/ }));

    const science = await screen.findByRole("radio", { name: /Science 10/ });
    await waitFor(() => expect(science.textContent).toContain("86"));
    // Once picked, the year list folds to the one chosen.
    expect(screen.queryByRole("radiogroup", { name: "School year" })).toBeNull();
    expect(screen.getByRole("button", { name: "Change school year" })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Grading period" })).getAllByRole("button").map((b) => b.textContent))
      .toEqual(["1st Q", "2nd Q", "3rd Q", "4th Q"]);
  });

  it("saves a score as it's typed, and works the grade out again", async () => {
    api.updateScoreEntry.mockResolvedValue({});
    const quiz1 = await openSheet();
    expect(quiz1.value).toBe("18");
    await waitFor(() => expect(api.computeGrade).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("88")).toBeTruthy();

    fireEvent.change(quiz1, { target: { value: "19" } });
    fireEvent.blur(quiz1);

    await waitFor(() => expect(api.updateScoreEntry).toHaveBeenCalledWith(101, { score: 19 }));
    await waitFor(() => expect(api.computeGrade).toHaveBeenCalledTimes(2));
    expect(api.computeGrade).toHaveBeenLastCalledWith({ enrollment_id: 11, subject_id: 7, grading_period: "1st_quarter" });
  });

  it("doesn't send a score above the item's max", async () => {
    const quiz1 = await openSheet();

    fireEvent.change(quiz1, { target: { value: "25" } });
    fireEvent.blur(quiz1);

    expect(quiz1.getAttribute("aria-invalid")).toBe("true");
    expect(api.updateScoreEntry).not.toHaveBeenCalled();
  });

  it("adds an item out of the previous item's max when none is given", async () => {
    api.createScoreEntry.mockResolvedValue({});
    await openSheet();
    const written = screen.getByRole("region", { name: "Written Work" });
    const max = within(written).getByRole("spinbutton", { name: "New Written Work item max score" });
    expect(max.getAttribute("placeholder")).toBe("20");

    fireEvent.change(within(written).getByRole("textbox", { name: "New Written Work item name" }), { target: { value: "Quiz 3" } });
    const score = within(written).getByRole("spinbutton", { name: "New Written Work item score" });
    fireEvent.change(score, { target: { value: "15" } });
    fireEvent.keyDown(score, { key: "Enter" });

    await waitFor(() => expect(api.createScoreEntry).toHaveBeenCalledWith({
      enrollment: 11, subject: 7, grading_period: "1st_quarter",
      label: "Quiz 3", score: 15, max_score: 20, grading_component: 1,
    }));
  });

  it("offers Update only when the computed grade differs from the saved one", async () => {
    savedGrades = [{ grade_id: 9, subject: 7, grading_period: "1st_quarter", numeric_grade: "85.00", remarks: "passed" }];
    api.updateGrade.mockResolvedValue({});
    await openSheet();

    expect(await screen.findByText("Unsaved change")).toBeTruthy();
    expect(screen.getByText("Saved grade 85")).toBeTruthy();
    const update = screen.getByRole("button", { name: /Update grade/ });
    await waitFor(() => expect(update.disabled).toBe(false));

    fireEvent.click(update);

    await waitFor(() => expect(api.updateGrade).toHaveBeenCalledWith(9, { numeric_grade: 88, remarks: "passed" }));
  });

  it("has nothing to save when the grade is the one saved", async () => {
    savedGrades = [{ grade_id: 9, subject: 7, grading_period: "1st_quarter", numeric_grade: "88.00", remarks: "passed" }];
    await openSheet();

    expect(await screen.findByText("Up to date")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Update grade/ }).disabled).toBe(true);
  });

  it("can't save until every component has a score", async () => {
    api.computeGrade.mockResolvedValue(computed(84, { is_complete: false, remarks: null }));
    await openSheet();

    expect(await screen.findByText("Running grade")).toBeTruthy();
    expect(screen.getByText("Add a score to every component to get a grade")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save grade/ }).disabled).toBe(true);
  });
});

describe("Grades — Summary", () => {
  const Q = ["1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter"];
  const year = (subject, values) =>
    values.map((v, i) => ({ grade_id: subject * 10 + i, subject, grading_period: Q[i], numeric_grade: String(v) }));

  it("rates a subject only once every quarter is graded, and colours only failing grades", async () => {
    savedGrades = [...year(7, [80, 70, 85, 90]), ...year(8, [88, 86])];
    render(page("/grades?student=5&tab=summary&enrollment=11"));

    const math = (await screen.findByText("Mathematics 10")).closest("tr");
    expect(within(math).getByText("81.25")).toBeTruthy();
    expect(within(math).getByText("Passed")).toBeTruthy();
    expect(within(math).getByText("70").className).toContain("text-error-500");
    expect(within(math).getByText("80").className).not.toContain("text-error-500");
    const science = screen.getByText("Science 10").closest("tr");
    expect(within(science).getByText("In progress")).toBeTruthy();
    expect(screen.getByText(/1st Quarter graded in 2 of 2 · 2nd Quarter graded in 2 of 2 · 3rd Quarter graded in 1 of 2/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Print SF9/ }).getAttribute("href")).toBe("/print/sf9/11");
  });

  it("counts passed and failed by subject once every subject is rated", async () => {
    savedGrades = [...year(7, [72, 70, 85, 90]), ...year(8, [74, 73, 75, 72])];
    api.callGemini.mockResolvedValue({ interpretation: "ok" });
    render(page("/grades?student=5&tab=summary&enrollment=11"));

    expect(await screen.findByText("2 subjects · 1 passed · 1 failed (Science 10)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Analyze/ }));

    await waitFor(() => expect(api.callGemini).toHaveBeenCalled());
    const [, payload] = api.callGemini.mock.lastCall;
    expect(payload).toMatchObject({ passed_subjects: 1, failed_subjects: 1, total_grades: 8 });
    expect(payload).not.toHaveProperty("passed_period_grades");
  });

  it("tells the AI about quarter grades, under their own names, before any subject is rated", async () => {
    savedGrades = [...year(7, [72, 80]), ...year(8, [90])];
    api.callGemini.mockResolvedValue({ interpretation: "ok" });
    render(page("/grades?student=5&tab=summary&enrollment=11"));
    await screen.findByText("Mathematics 10");

    fireEvent.click(screen.getByRole("button", { name: /Analyze/ }));

    await waitFor(() => expect(api.callGemini).toHaveBeenCalled());
    const [, payload] = api.callGemini.mock.lastCall;
    expect(payload).toMatchObject({ passed_period_grades: 2, failed_period_grades: 1 });
    expect(payload).not.toHaveProperty("passed_subjects");
  });
});

describe("Grades — Observed values", () => {
  const CATEGORIES = [
    { category_id: 1, name: "Upholds truth" },
    { category_id: 2, name: "Cares for the environment" },
  ];

  it("marks each statement for the period picked in the selection card, and clears a mark clicked again", async () => {
    api.getNarrativeCategories.mockResolvedValue({ results: CATEGORIES });
    api.getNarrativeReports.mockResolvedValue({
      results: [{ report_id: 50, category: 2, grading_period: "1st_quarter", rating: "SO" }],
    });
    api.createNarrativeReport.mockResolvedValue({ report_id: 51, category: 1, rating: "AO" });
    api.deleteNarrativeReport.mockResolvedValue({});
    render(page("/grades/observed?student=5"));
    fireEvent.click(await screen.findByRole("radio", { name: /S\.Y\. 2026-2027/ }));

    expect(await screen.findByText("1st Quarter · 1 of 2 rated")).toBeTruthy();
    const truth = screen.getByRole("group", { name: "Upholds truth" });
    fireEvent.click(within(truth).getByRole("button", { name: "Always Observed (AO)" }));
    await waitFor(() => expect(api.createNarrativeReport).toHaveBeenCalledWith({
      enrollment: 11, category: 1, grading_period: "1st_quarter", rating: "AO",
    }));

    const environment = screen.getByRole("group", { name: "Cares for the environment" });
    const so = within(environment).getByRole("button", { name: "Sometimes Observed (SO)" });
    expect(so.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(so);
    await waitFor(() => expect(api.deleteNarrativeReport).toHaveBeenCalledWith(50));

    fireEvent.click(within(screen.getByRole("group", { name: "Grading period" })).getByRole("button", { name: "2nd Q" }));
    await waitFor(() => expect(api.getNarrativeReports).toHaveBeenLastCalledWith({
      enrollment: 11, grading_period: "2nd_quarter", page_size: 100,
    }));
  });
});
