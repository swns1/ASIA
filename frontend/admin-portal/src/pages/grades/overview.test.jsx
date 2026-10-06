/**
 * GradesPage — the Overview list: its status band, filter menus and search.
 *
 * Passed/Failed is a learner's grade average, which the page can only work
 * out for the page of learners it has fetched. So its old Status chips had no
 * counts, and nothing said how many were failing in all. The band now reads
 * the split for the whole selection from /enrollments/grade-averages/, and
 * its legend is the pass/fail filter, which still narrows the fetched page.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  getEnrollments: vi.fn(),
  getGradeAverages: vi.fn(),
  getGrades: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);
const none = () => vi.fn(() => Promise.resolve({ results: [] }));

vi.mock("../../api/enrollmentApi", () => ({
  getEnrollments: pass("getEnrollments"),
  getGradeAverages: pass("getGradeAverages"),
  getGrades: pass("getGrades"),
  getSubjects: none(), getScoreEntries: none(), createScoreEntry: none(), updateScoreEntry: none(),
  deleteScoreEntry: none(), computeGrade: none(), saveGrade: none(), updateGrade: none(),
  getNarrativeCategories: none(), getNarrativeReports: none(), createNarrativeReport: none(),
  updateNarrativeReport: none(), deleteNarrativeReport: none(), callGemini: none(),
}));
vi.mock("../../api/studentApi", () => ({
  getStudents: vi.fn(() => Promise.resolve({ results: [] })),
  getStudent: vi.fn(),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027",
    options: ["2026-2027", "2025-2026"],
    yearStates: {},
    yearCounts: {},
  }),
}));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: GradesPage } = await import("../GradesPage");

const SPLIT = { learners: 352, passed: 345, failed: 2, no_grades: 5 };

// One page of three learners: one passing, one failing, one with no grades.
const PAGE = [
  { enrollment_id: 1, grade_level: "Grade 4", section: "Rizal", student_detail: { full_name: "Ana Cruz", lrn: "101", student_number: "S-1" } },
  { enrollment_id: 2, grade_level: "Grade 4", section: "Rizal", student_detail: { full_name: "Ben Uy", lrn: "102", student_number: "S-2" } },
  { enrollment_id: 3, grade_level: "Grade 4", section: "Rizal", student_detail: { full_name: "Cora Lim", lrn: "103", student_number: "S-3" } },
];
const GRADES = { 1: [{ numeric_grade: "90" }, { numeric_grade: "88" }], 2: [{ numeric_grade: "70" }], 3: [] };

function page() {
  return (
    <MemoryRouter initialEntries={["/grades"]}>
      <GradesPage />
    </MemoryRouter>
  );
}

const lastList = () => api.getEnrollments.mock.lastCall[0];
const lastAverages = () => api.getGradeAverages.mock.lastCall[0];
const legend = () => within(screen.getByRole("group", { name: "Filter by average" }));
const menuButton = (label) => screen.queryByRole("button", { name: new RegExp(`^${label}:`) });
const pick = (label, item) => {
  fireEvent.click(menuButton(label));
  fireEvent.click(screen.getByRole("menuitemradio", { name: item }));
};
const searchBox = () => screen.getByRole("searchbox", { name: /search students/i });
const settled = () => screen.findByText("Ana Cruz");

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Reg", role: "registrar" }));
  api.getEnrollments.mockResolvedValue({ results: PAGE, count: 352, next: "n", previous: null });
  api.getGrades.mockImplementation(async ({ enrollment }) => ({ results: GRADES[enrollment] }));
  api.getGradeAverages.mockResolvedValue(SPLIT);
});

describe("Grades overview — status band", () => {
  it("shows the whole selection's pass/fail split from the server", async () => {
    render(page());
    await settled();

    expect(await legend().findByRole("button", { name: "Failed 2" })).toBeTruthy();
    expect(legend().getByRole("button", { name: "All 352" }).getAttribute("aria-pressed")).toBe("true");
    expect(legend().getByRole("button", { name: "Passed 345" })).toBeTruthy();
    expect(legend().getByRole("button", { name: "No grades 5" })).toBeTruthy();
    expect(screen.getByText("enrollments in S.Y. 2026-2027")).toBeTruthy();
    expect(lastAverages()).toEqual({
      enrollment_status__in: "enrolled,completed,transferred_out", school_year: "2026-2027",
    });
  });

  it("filters the page by average from the legend, and clears on a second click", async () => {
    render(page());
    await settled();
    const failed = await legend().findByRole("button", { name: "Failed 2" });

    fireEvent.click(failed);

    await waitFor(() => expect(screen.queryByText("Ana Cruz")).toBeNull());
    expect(screen.getByText("Ben Uy")).toBeTruthy();
    expect(screen.queryByText("Cora Lim")).toBeNull();
    expect(failed.getAttribute("aria-pressed")).toBe("true");
    // The heading counts the band's whole-selection number, not this page's.
    const heading = screen.getByRole("heading", { name: "Failed" });
    expect(heading.nextSibling.textContent).toBe("2");
    expect(screen.getByText(/1 of 3 on this page match "Failed"/)).toBeTruthy();

    fireEvent.click(failed);

    expect(await screen.findByText("Ana Cruz")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "All enrollments" })).toBeTruthy();
  });

  it("can list the learners with no grades yet", async () => {
    render(page());
    await settled();

    fireEvent.click(await legend().findByRole("button", { name: "No grades 5" }));

    await waitFor(() => expect(screen.queryByText("Ana Cruz")).toBeNull());
    expect(screen.getByText("Cora Lim")).toBeTruthy();
    expect(screen.queryByText("Ben Uy")).toBeNull();
  });

  it("reads '—' when the server can't give the split, and still lists the page", async () => {
    api.getGradeAverages.mockRejectedValue(new Error("404"));
    render(page());
    await settled();

    await waitFor(() => expect(api.getGradeAverages).toHaveBeenCalled());
    expect(legend().getByRole("button", { name: "Failed —" })).toBeTruthy();
    expect(screen.getByText("Ben Uy")).toBeTruthy();
  });
});

describe("Grades overview — filter menus", () => {
  it("changes the school year for the list and the band", async () => {
    render(page());
    await settled();

    pick("School year", "S.Y. 2025-2026");

    await waitFor(() => expect(lastList().school_year).toBe("2025-2026"));
    await waitFor(() => expect(lastAverages().school_year).toBe("2025-2026"));
    expect(menuButton("School year").getAttribute("aria-label")).toBe("School year: 2025-2026");
  });

  it("offers Grade and Period once a level is picked, and counts the period's grades", async () => {
    render(page());
    await settled();
    expect(menuButton("Grade")).toBeNull();
    expect(menuButton("Period")).toBeNull();

    pick("Level", "Senior High");
    await waitFor(() => expect(lastList().school_level).toBe("senior_highschool"));

    fireEvent.click(menuButton("Period"));
    // Senior high grades by semester, not quarter.
    expect(screen.getAllByRole("menuitemradio").map((i) => i.textContent)).toEqual([
      "All periods", "1st Semester", "2nd Semester",
    ]);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "2nd Semester" }));

    await waitFor(() => expect(lastAverages()).toMatchObject({
      school_level: "senior_highschool", grading_period: "2nd_semester",
    }));
    await waitFor(() => expect(api.getGrades.mock.lastCall[0].grading_period).toBe("2nd_semester"));
    expect(await screen.findByText("enrollments in S.Y. 2026-2027 · Senior High · 2nd Semester")).toBeTruthy();
  });
});

describe("Grades overview — search as you type", () => {
  it("searches 300ms after typing stops, without recounting the band", async () => {
    render(page());
    await settled();
    await waitFor(() => expect(api.getGradeAverages).toHaveBeenCalledTimes(1));
    const before = api.getEnrollments.mock.calls.length;

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.change(searchBox(), { target: { value: "cruz" } });
      act(() => vi.advanceTimersByTime(299));
      expect(api.getEnrollments.mock.calls.length).toBe(before);

      act(() => vi.advanceTimersByTime(1));
      expect(lastList()).toMatchObject({ page: 1, search: "cruz" });
    } finally {
      vi.useRealTimers();
    }
    await settled();
    expect(api.getGradeAverages).toHaveBeenCalledTimes(1);
  });
});
