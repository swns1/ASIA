/**
 * EnrollmentsPage — the status band, its school year menu, the filter menus,
 * search as you type and Clear.
 *
 * Status was set from five stat tiles and a row of chips, and Transferred Out
 * had neither, so the tiles stopped adding up to the total once anyone
 * transferred out. The band's legend is now the one status control and counts
 * every status. Level, grade and parent answer are menus, and the school year
 * sits in the band because the band's numbers are counted for it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  getEnrollments: vi.fn(),
  getUnplacedStudents: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/enrollmentApi", () => ({
  getEnrollments: pass("getEnrollments"),
  getUnplacedStudents: pass("getUnplacedStudents"),
  getEnrollmentEligibility: vi.fn(),
  updateEnrollment: vi.fn(),
  bulkCreateEnrollments: vi.fn(),
  promotePreview: vi.fn(),
  promoteConfirm: vi.fn(),
  completeSection: vi.fn(),
  closeSchoolYear: vi.fn(),
  getSections: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../../api/studentApi", () => ({
  getStudents: vi.fn(() => Promise.resolve({ results: [] })),
  markStudentsGraduated: vi.fn(),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027",
    options: ["2027-2028", "2026-2027", "2025-2026"],
    entryYears: ["2027-2028", "2026-2027"],
    yearStates: {},
    yearCounts: {},
  }),
}));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: EnrollmentsPage } = await import("../EnrollmentsPage");

// What the band's count requests get back, by status ("" is the total).
const COUNTS = { "": 300, enrolled: 200, pending: 40, completed: 30, cancelled: 20, transferred_out: 10 };

function page() {
  return (
    <MemoryRouter initialEntries={["/enrollments"]}>
      <EnrollmentsPage />
    </MemoryRouter>
  );
}

// The band's requests ask for one row; the list's don't set a page size.
const calls = () => api.getEnrollments.mock.calls.map(([p]) => p);
const lastList = () => calls().filter((p) => !p.page_size).at(-1);
const listCallCount = () => calls().filter((p) => !p.page_size).length;
const settled = () => screen.findByText("No enrollments found");
const legend = () => within(screen.getByRole("group", { name: "Filter by status" }));
const menuButton = (label) => screen.queryByRole("button", { name: new RegExp(`^${label}:`) });
const pick = (label, item) => {
  fireEvent.click(menuButton(label));
  fireEvent.click(screen.getByRole("menuitemradio", { name: item }));
};
const searchBox = () => screen.getByRole("searchbox", { name: /search enrollments/i });

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Reg", role: "registrar" }));
  api.getUnplacedStudents.mockResolvedValue({ school_year: "2026-2027", count: 0, results: [] });
  api.getEnrollments.mockImplementation(async (p = {}) =>
    p.page_size
      ? { results: [], count: COUNTS[p.enrollment_status ?? ""] }
      : { results: [], count: 0, next: null, previous: null },
  );
});

describe("EnrollmentsPage — status band", () => {
  it("counts Transferred Out, so the statuses add up to the total", async () => {
    render(page());
    await settled();

    expect(await legend().findByRole("button", { name: "Transferred Out 10" })).toBeTruthy();
    expect(api.getEnrollments).toHaveBeenCalledWith({
      school_year: "2026-2027", page_size: 1, enrollment_status: "transferred_out",
    });
    expect(legend().getByRole("button", { name: "All 300" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("enrollments in S.Y. 2026-2027")).toBeTruthy();
  });

  it("filters by a status from its legend button, and clears it on a second click", async () => {
    render(page());
    await settled();
    const pending = await legend().findByRole("button", { name: "Pending 40" });

    fireEvent.click(pending);

    await waitFor(() => expect(lastList().enrollment_status).toBe("pending"));
    await settled();
    expect(pending.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "Pending" })).toBeTruthy();

    fireEvent.click(pending);

    await waitFor(() => expect(lastList().enrollment_status).toBeUndefined());
    await settled();
    expect(pending.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("heading", { name: "All enrollments" })).toBeTruthy();
  });

  it("changes the school year from the band's menu", async () => {
    render(page());
    await settled();
    expect(menuButton("School year").getAttribute("aria-label")).toBe("School year: 2026-2027");

    fireEvent.click(menuButton("School year"));
    // The current year first and marked, then the rest, then All years.
    expect(screen.getAllByRole("menuitemradio").map((i) => i.textContent)).toEqual([
      "S.Y. 2026-2027Current", "S.Y. 2027-2028", "S.Y. 2025-2026", "All years",
    ]);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "S.Y. 2025-2026" }));

    await waitFor(() => expect(lastList().school_year).toBe("2025-2026"));
    await settled();
    expect(api.getEnrollments).toHaveBeenCalledWith({ school_year: "2025-2026", page_size: 1 });
    expect(menuButton("School year").getAttribute("aria-label")).toBe("School year: 2025-2026");

    pick("School year", "All years");

    await waitFor(() => expect(lastList().school_year).toBeUndefined());
    await settled();
    expect(await screen.findByText("enrollments in all school years")).toBeTruthy();
  });
});

describe("EnrollmentsPage — filter menus", () => {
  it("offers Grade only once a level is picked", async () => {
    render(page());
    await settled();
    expect(menuButton("Grade")).toBeNull();

    pick("Level", "Elementary");

    await waitFor(() => expect(lastList().school_level).toBe("elementary"));
    await settled();
    fireEvent.click(menuButton("Grade"));
    expect(screen.getAllByRole("menuitemradio").map((i) => i.textContent)).toEqual([
      "All grades", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
    ]);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Grade 4" }));

    await waitFor(() => expect(lastList()).toMatchObject({ school_level: "elementary", grade_level: "Grade 4" }));
    await settled();
    expect(screen.getByText("enrollments in S.Y. 2026-2027 · Elementary · Grade 4")).toBeTruthy();

    // A new level starts again from all of its grades.
    pick("Level", "Junior High");
    await waitFor(() => expect(lastList().school_level).toBe("junior_highschool"));
    await settled();
    expect(lastList().grade_level).toBeUndefined();
    expect(menuButton("Grade").getAttribute("aria-label")).toBe("Grade: All grades");
  });

  it("offers Parent answer only with Pending, and drops it without", async () => {
    render(page());
    await settled();
    expect(menuButton("Parent answer")).toBeNull();

    fireEvent.click(await legend().findByRole("button", { name: "Pending 40" }));
    await waitFor(() => expect(lastList().enrollment_status).toBe("pending"));
    await settled();
    pick("Parent answer", "Not returning");

    await waitFor(() => expect(lastList().guardian_response).toBe("not_returning"));
    await settled();

    fireEvent.click(legend().getByRole("button", { name: "Enrolled 200" }));

    await waitFor(() => expect(lastList().enrollment_status).toBe("enrolled"));
    await settled();
    expect(lastList().guardian_response).toBeUndefined();
    expect(menuButton("Parent answer")).toBeNull();
  });
});

describe("EnrollmentsPage — search as you type", () => {
  it("searches 300ms after typing stops", async () => {
    render(page());
    await settled();
    const before = listCallCount();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.change(searchBox(), { target: { value: "cr" } });
      act(() => vi.advanceTimersByTime(200));
      // Another keystroke restarts the wait.
      fireEvent.change(searchBox(), { target: { value: "cruz" } });
      act(() => vi.advanceTimersByTime(299));
      expect(listCallCount()).toBe(before);

      act(() => vi.advanceTimersByTime(1));
      expect(listCallCount()).toBe(before + 1);
      expect(lastList()).toMatchObject({ page: "1", search: "cruz" });
    } finally {
      vi.useRealTimers();
    }
    await settled();
  });

  it("searches on Enter without waiting, and only once", async () => {
    render(page());
    await settled();
    const before = listCallCount();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.change(searchBox(), { target: { value: "rizal" } });
      fireEvent.keyDown(searchBox(), { key: "Enter" });
      expect(lastList()).toMatchObject({ search: "rizal" });

      act(() => vi.advanceTimersByTime(1000));
      expect(listCallCount()).toBe(before + 1);
    } finally {
      vi.useRealTimers();
    }
    await settled();
  });
});

describe("EnrollmentsPage — rows and Clear", () => {
  it("shows a pending row's parent answer under its status, with their reason", async () => {
    api.getEnrollments.mockImplementation(async (p = {}) =>
      p.page_size
        ? { results: [], count: COUNTS[p.enrollment_status ?? ""] }
        : {
            results: [{
              enrollment_id: 7, student: 3, student_name: "Hannah Lim", school_level: "kindergarten",
              grade_level: "Kindergarten", section: "St. Clare", school_year: "2026-2027",
              enrollment_status: "pending",
              guardian_response: { response: "not_returning", reason: "Moving to Cebu" },
            }],
            count: 1, next: null, previous: null,
          },
    );
    render(page());

    const row = within((await screen.findByText("Hannah Lim")).closest("tr"));
    expect(row.getByText("Pending")).toBeTruthy();
    expect(row.getByText("Not returning").closest("[title]").getAttribute("title")).toBe("Parent: Moving to Cebu");
    expect(row.getByText("Kindergarten", { selector: "td > span > span" })).toBeTruthy();
  });

  it("resets the year, level, grade, status and search", async () => {
    render(page());
    await settled();
    expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();

    pick("School year", "S.Y. 2025-2026");
    pick("Level", "Senior High");
    await waitFor(() => expect(lastList().school_level).toBe("senior_highschool"));
    pick("Grade", "Grade 12");
    fireEvent.click(await legend().findByRole("button", { name: "Completed 30" }));
    fireEvent.change(searchBox(), { target: { value: "stem" } });
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    await waitFor(() =>
      expect(lastList()).toMatchObject({
        school_year: "2025-2026", school_level: "senior_highschool", grade_level: "Grade 12",
        enrollment_status: "completed", search: "stem",
      }),
    );
    await settled();

    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));

    await waitFor(() => expect(lastList()).toEqual({ page: "1", school_year: "2026-2027" }));
    await settled();
    expect(searchBox().value).toBe("");
    expect(menuButton("Level").getAttribute("aria-label")).toBe("Level: All levels");
    expect(menuButton("Grade")).toBeNull();
    expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
  });
});
