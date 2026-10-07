/**
 * SubjectsPage — the list's status band, filter menus and search, as on the
 * Students, Enrollments and Grades lists.
 *
 * The band splits the year's subjects by whether they have a grading
 * template: without one, nobody can work a grade out for the subject (the
 * server refuses), so "No template" is the part to fix. Its legend is the
 * filter. Level and Grade are menus beside the search, which searches as you
 * type.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  getSubjects: vi.fn(),
  getGradingTemplates: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/enrollmentApi", () => ({
  getSubjects: pass("getSubjects"),
  createSubject: vi.fn(),
  updateSubject: vi.fn(),
  deleteSubject: vi.fn(),
  getGradingTemplates: pass("getGradingTemplates"),
  carryOverSchoolYear: vi.fn(),
}));
vi.mock("../../api/billingApi", () => ({ carryOverFees: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027",
    options: ["2026-2027", "2025-2026"],
    yearCounts: {},
    yearStates: { "2026-2027": "current", "2025-2026": "open" },
  }),
}));

const { default: SubjectsPage } = await import("../SubjectsPage");

const TEMPLATE = { template_name: "JHS Standard", components: [{}, {}, {}], total_weight: 100 };
const ROWS = [
  { subject_id: 1, subject_code: "MATH-7", subject_name: "Mathematics 7", school_level: "junior_highschool",
    grade_level: "Grade 7", strand: null, semester: null, grading_template: 4, grading_template_detail: TEMPLATE },
  { subject_id: 2, subject_code: "TLE-7", subject_name: "TLE 7", school_level: "junior_highschool",
    grade_level: "Grade 7", strand: null, semester: null, grading_template: null, grading_template_detail: null },
];
// The year: 118 subjects, 3 of them without a template.
const COUNTS = { all: 118, yes: 115, no: 3 };

const listCalls = () => api.getSubjects.mock.calls.map((c) => c[0]).filter((p) => p.page_size !== 1);
const countCalls = () => api.getSubjects.mock.calls.map((c) => c[0]).filter((p) => p.page_size === 1);
const lastList = () => listCalls().at(-1);
const legend = () => within(screen.getByRole("group", { name: "Filter by grading template" }));
const menuButton = (label) => screen.queryByRole("button", { name: new RegExp(`^${label}:`) });
const pick = (label, item) => {
  fireEvent.click(menuButton(label));
  fireEvent.click(screen.getByRole("menuitemradio", { name: item }));
};
const searchBox = () => screen.getByRole("searchbox", { name: /search subjects/i });
const settled = () => screen.findByText("Mathematics 7");

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/subjects"]}>
      <SubjectsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Reg", role: "registrar" }));
  api.getGradingTemplates.mockResolvedValue([]);
  api.getSubjects.mockImplementation(async (p) => {
    if (p.page_size === 1) {
      const count = p.has_template === true ? COUNTS.yes : p.has_template === false ? COUNTS.no : COUNTS.all;
      return { results: [], count, next: null, previous: null };
    }
    return { results: ROWS, count: 118, next: "n", previous: null };
  });
});

describe("Subjects — status band", () => {
  it("splits the year's subjects by grading template", async () => {
    renderPage();
    await settled();

    expect(await legend().findByRole("button", { name: "No template 3" })).toBeTruthy();
    expect(legend().getByRole("button", { name: "All 118" }).getAttribute("aria-pressed")).toBe("true");
    expect(legend().getByRole("button", { name: "With template 115" })).toBeTruthy();
    expect(screen.getByText("subjects in S.Y. 2026-2027")).toBeTruthy();
    expect(countCalls()).toEqual(expect.arrayContaining([
      { school_year: "2026-2027", page_size: 1 },
      { school_year: "2026-2027", page_size: 1, has_template: true },
      { school_year: "2026-2027", page_size: 1, has_template: false },
    ]));
  });

  it("lists the subjects with no template from the legend, and clears on a second click", async () => {
    renderPage();
    await settled();
    const none = await legend().findByRole("button", { name: "No template 3" });

    fireEvent.click(none);

    await waitFor(() => expect(lastList()).toMatchObject({ page: 1, has_template: false }));
    expect(none.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "Subjects with no template" })).toBeTruthy();

    fireEvent.click(none);

    await waitFor(() => expect(lastList().has_template).toBeUndefined());
    expect(screen.getByRole("heading", { name: "All subjects" })).toBeTruthy();
  });

  it("marks the subject nobody can grade yet", async () => {
    renderPage();
    const row = (await screen.findByText("TLE 7")).closest("tr");
    expect(within(row).getByText("No template")).toBeTruthy();

    const graded = screen.getByText("Mathematics 7").closest("tr");
    expect(within(graded).getByText("JHS Standard")).toBeTruthy();
    expect(within(graded).getByText("3 components · 100%")).toBeTruthy();
  });

  it("reads '—' when the counts fail, and still lists the year", async () => {
    api.getSubjects.mockImplementation(async (p) => {
      if (p.page_size === 1) throw new Error("down");
      return { results: ROWS, count: 2, next: null, previous: null };
    });
    renderPage();
    await settled();
    await waitFor(() => expect(legend().getByRole("button", { name: "No template —" })).toBeTruthy());
  });
});

describe("Subjects — filter menus", () => {
  it("offers one year at a time, and recounts the band for it", async () => {
    renderPage();
    await settled();

    fireEvent.click(menuButton("School year"));
    expect(screen.getAllByRole("menuitemradio").map((i) => i.textContent)).not.toContain("All years");
    fireEvent.click(screen.getByRole("menuitemradio", { name: /S\.Y\. 2025-2026/ }));

    await waitFor(() => expect(lastList().school_year).toBe("2025-2026"));
    await waitFor(() => expect(countCalls().at(-1).school_year).toBe("2025-2026"));
  });

  it("offers Grade once a level is picked, and narrows the band with both", async () => {
    renderPage();
    await settled();
    expect(menuButton("Grade")).toBeNull();

    pick("Level", "Junior High");
    await waitFor(() => expect(lastList().school_level).toBe("junior_highschool"));

    pick("Grade", "Grade 7");
    await waitFor(() => expect(lastList()).toMatchObject({ school_level: "junior_highschool", grade_level: "Grade 7" }));
    await waitFor(() => expect(countCalls().at(-1)).toMatchObject({
      school_level: "junior_highschool", grade_level: "Grade 7",
    }));
    expect(await screen.findByText("subjects in S.Y. 2026-2027 · Junior High · Grade 7")).toBeTruthy();
  });

  it("clears every filter back to the current year", async () => {
    renderPage();
    await settled();
    pick("Level", "Junior High");
    fireEvent.click(await legend().findByRole("button", { name: "No template 3" }));
    await waitFor(() => expect(lastList()).toMatchObject({ school_level: "junior_highschool", has_template: false }));

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => expect(lastList()).toEqual({ page: 1, school_year: "2026-2027" }));
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });
});

describe("Subjects — search as you type", () => {
  it("searches 300ms after typing stops, without recounting the band", async () => {
    renderPage();
    await settled();
    await waitFor(() => expect(countCalls()).toHaveLength(3));
    const before = listCalls().length;

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.change(searchBox(), { target: { value: "math" } });
      act(() => vi.advanceTimersByTime(299));
      expect(listCalls().length).toBe(before);

      act(() => vi.advanceTimersByTime(1));
      await act(async () => {});
      expect(lastList()).toMatchObject({ page: 1, search: "math" });
    } finally {
      vi.useRealTimers();
    }
    await settled();
    expect(countCalls()).toHaveLength(3);
  });
});

describe("Subjects — who may change them", () => {
  it("offers a teacher no way to add, edit or delete", async () => {
    sessionStorage.setItem("current_user", JSON.stringify({ name: "Tina", role: "teacher" }));
    renderPage();
    const row = (await settled()).closest("tr");

    expect(screen.queryByRole("button", { name: "New Subject" })).toBeNull();
    expect(within(row).queryByRole("button", { name: /Edit|Delete/ })).toBeNull();
    fireEvent.click(row);
    expect(screen.queryByText("Edit Subject")).toBeNull();
  });

  it("opens a subject to edit from its row for the registrar", async () => {
    renderPage();
    fireEvent.click((await settled()).closest("tr"));
    expect(await screen.findByText("Edit Subject")).toBeTruthy();
  });
});

describe("Subjects — a failed load", () => {
  it("says so instead of offering to set up an empty year", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api.getSubjects.mockImplementation(async (p) => {
      if (p.page_size === 1) return { results: [], count: 0 };
      throw new Error("Network Error");
    });
    renderPage();

    await waitFor(() => expect(screen.queryByText(/No subjects for S\.Y\./)).toBeNull());
    expect(await screen.findByRole("button", { name: /try again|retry/i })).toBeTruthy();
  });
});
