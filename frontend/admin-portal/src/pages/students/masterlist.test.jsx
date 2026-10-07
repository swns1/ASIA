/**
 * StudentsPage — the school's masterlist, scoped by school year.
 *
 * Before, the year only fed a one-off "Not enrolled for" picker, the tiles
 * never heard a filter, Recents did nothing, there was no way to list a grade
 * or a section, and a search typed but not entered was dropped on page 2.
 * Now the school year is the page's scope, picked like on every other year
 * page: a year lists its learners in class-list order, All years lists every
 * record, and the current year can switch to who isn't enrolled for it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const getStudents = vi.fn();
const getStudentCounts = vi.fn();
const getSections = vi.fn();

vi.mock("../../api/studentApi", () => ({
  getStudents: (...a) => getStudents(...a),
  getStudentCounts: (...a) => getStudentCounts(...a),
  deleteStudent: vi.fn(),
}));
vi.mock("../../api/enrollmentApi", () => ({
  getSections: (...a) => getSections(...a),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027",
    options: ["2026-2027", "2025-2026"],
    yearCounts: {},
    yearStates: { "2026-2027": "current", "2025-2026": "open" },
  }),
}));

const { default: StudentsPage } = await import("../StudentsPage");

const IMELDA = {
  student_id: 509, first_name: "Imelda", last_name: "Arellano", lrn: "136700000509",
  birth_date: "2014-06-26", sex: "female", status: "active",
  placement: { school_year: "2026-2027", grade_level: "Grade 7", section: "Diamond", enrollment_status: "enrolled", semester: null },
  last_enrollment: { school_year: "2026-2027", grade_level: "Grade 7", section: "Diamond" },
};
const HERMINIA = {
  student_id: 660, first_name: "Herminia", last_name: "Barroga", lrn: "136700000660",
  birth_date: "2014-01-04", sex: "female", status: "active",
  placement: { school_year: "2026-2027", grade_level: "Grade 7", section: "Diamond", enrollment_status: "pending", semester: null },
  last_enrollment: { school_year: "2026-2027", grade_level: "Grade 7", section: "Diamond" },
};
const TOMAS = {
  student_id: 521, first_name: "Tomas", last_name: "Alabado", lrn: "136700000521",
  birth_date: "2010-07-07", sex: "male", status: "active",
  last_enrollment: { school_year: "2025-2026", grade_level: "Grade 10", section: "Ruby" },
};

const COUNTS = {
  status: { active: 431, transferred: 1 },
  sex: { male: 221, female: 211 },
  registered: 551,
  year_total: 432,
  enrollment: { enrolled: 432, not_enrolled: 43 },
  school_level: { junior_highschool: 126 },
  grade_level: { "Grade 7": 32 },
  section: { Diamond: 11 },
};

function page(url = "/students") {
  return (
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/enrollments/new" element={<div>enrollment form</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const lastList = () => getStudents.mock.lastCall[0];
const lastCounts = () => getStudentCounts.mock.lastCall[0];
const legend = () => within(screen.getByRole("group", { name: "Filter by status" }));
const menu = (label) => screen.queryByRole("button", { name: new RegExp(`^${label}:`, "i") });
const pick = async (label, item) => {
  fireEvent.click(menu(label));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: item }));
};
const yearPicker = () => menu("school year");
const pickYear = (name) => pick("school year", name);
// The band's total, beside the caption that says what it counts.
const band = (caption, total) =>
  waitFor(() => expect(screen.getByText(caption).previousSibling.textContent).toBe(total));
const onCurrentYear = () => band("learners in S.Y. 2026-2027", "432");

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("access_token", "token");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Ana Reyes", role: "registrar" }));
  getStudents.mockImplementation(async (params) => {
    if (params.unenrolled) return { results: [TOMAS], count: 1, next: null, previous: null };
    if (params.search === "zzz") return { results: [], count: 0, next: null, previous: null };
    return { results: [IMELDA, HERMINIA], count: 45, next: "page2", previous: null };
  });
  // Without a year the statuses span every record: 551, as `registered` says.
  getStudentCounts.mockImplementation(async (p) =>
    (p.school_year || p.unenrolled ? COUNTS : { ...COUNTS, status: { active: 540, transferred: 11 } }));
  getSections.mockResolvedValue([{ name: "Diamond" }, { name: "Garnet" }, { name: "Pearl" }]);
});

describe("StudentsPage — a school year's masterlist", () => {
  it("opens on the current year's learners, in class-list order", async () => {
    render(page());
    await onCurrentYear();

    expect(lastList()).toMatchObject({ school_year: "2026-2027", ordering: "placement" });
    expect(lastList().unenrolled).toBeUndefined();
    expect(screen.getByRole("columnheader", { name: /grade · section/i })).toBeTruthy();

    const imelda = within(screen.getByText(/^Arellano/).closest("tr"));
    expect(imelda.getByText("Grade 7 · Diamond")).toBeTruthy();
    expect(imelda.getByText("Enrolled")).toBeTruthy();
    expect(within(screen.getByText(/^Barroga/).closest("tr")).getByText("Pending")).toBeTruthy();
  });

  it("uses the same year picker as every other year page, All years included", async () => {
    render(page());
    await onCurrentYear();
    expect(yearPicker().getAttribute("aria-label")).toBe("School year: 2026-2027");

    await pickYear(/all years/i);

    await band("students on record", "551");
    expect(lastList().school_year).toBeUndefined();
    expect(lastList().ordering).toBe("-student_id");
    expect(screen.getByRole("columnheader", { name: /last enrolled/i })).toBeTruthy();
  });

  it("counts the band and menus inside the same filters as the list", async () => {
    render(page());
    await onCurrentYear();

    expect(lastCounts()).toMatchObject({ school_year: "2026-2027" });
    expect(legend().getByRole("button", { name: "All 432" })).toBeTruthy();
    expect(legend().getByRole("button", { name: "Active 431" })).toBeTruthy();
    // The masterlist's male/female split, beside the total.
    expect(screen.getByText(/221 male · 211 female/)).toBeTruthy();
  });

  it("narrows to a level, then a grade, then a section", async () => {
    render(page());
    await onCurrentYear();

    expect(menu("grade")).toBeNull();
    await pick("level", /^junior high/i);
    await waitFor(() => expect(lastList()).toMatchObject({ school_level: "junior_highschool" }));

    expect(menu("section")).toBeNull();
    await pick("grade", /^grade 7/i);
    await waitFor(() => expect(lastList()).toMatchObject({ grade_level: "Grade 7" }));
    await waitFor(() => expect(getSections).toHaveBeenCalledWith({ school_year: "2026-2027", grade_level: "Grade 7" }));

    await pick("section", /^diamond/i);
    await waitFor(() => expect(lastList()).toMatchObject({
      school_year: "2026-2027", school_level: "junior_highschool", grade_level: "Grade 7", section: "Diamond",
    }));
    expect(lastCounts()).toMatchObject({ grade_level: "Grade 7", section: "Diamond" });
  });
});

describe("StudentsPage — Not enrolled", () => {
  it("lists the current year's learners with no place, each with Enroll", async () => {
    render(page());
    await onCurrentYear();

    await pick("enrollment", /^not enrolled/i);

    await screen.findByText(/^Alabado/);
    expect(lastList()).toMatchObject({ unenrolled: "2026-2027", ordering: "last_name" });
    expect(lastList().school_year).toBeUndefined();
    expect(screen.getByRole("columnheader", { name: /last enrolled/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Enroll Tomas Alabado for S.Y. 2026-2027" }));
    expect(await screen.findByText("enrollment form")).toBeTruthy();
  });

  it("isn't offered for a past year, where it would only list who joined later", async () => {
    render(page());
    await onCurrentYear();
    expect(menu("enrollment")).toBeTruthy();

    await pickYear(/2025-2026/);

    await waitFor(() => expect(lastList()).toMatchObject({ school_year: "2025-2026" }));
    expect(menu("enrollment")).toBeNull();
  });
});

describe("StudentsPage — search", () => {
  it("offers every year when nobody in this one matches", async () => {
    render(page());
    await onCurrentYear();

    const box = screen.getByRole("searchbox", { name: /search students/i });
    fireEvent.change(box, { target: { value: "zzz" } });
    fireEvent.keyDown(box, { key: "Enter" });

    fireEvent.click(await screen.findByRole("button", { name: /search all years/i }));
    await waitFor(() => expect(lastList()).toMatchObject({ search: "zzz" }));
    expect(lastList().school_year).toBeUndefined();
  });

  it("keeps a typed search through a filter click and onto page 2", async () => {
    render(page());
    await onCurrentYear();

    fireEvent.change(screen.getByRole("searchbox", { name: /search students/i }), { target: { value: "bar" } });
    await pick("sex", "Female");
    await waitFor(() => expect(lastList()).toMatchObject({ search: "bar", sex: "female", page: 1 }));
    await screen.findByText(/^Barroga/);

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(lastList()).toMatchObject({ search: "bar", sex: "female", page: 2 }));
  });
});

describe("StudentsPage — links and Clear", () => {
  it("opens on every student when a link asks for all years", async () => {
    render(page("/students?school_year=all&search=cruz"));
    await band("students on record", "551");
    expect(lastList()).toMatchObject({ search: "cruz" });
    expect(lastList().school_year).toBeUndefined();
  });

  it("clears back to the current year's list", async () => {
    render(page("/students?school_year=all"));
    await band("students on record", "551");

    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));

    await onCurrentYear();
    expect(lastList()).toMatchObject({ school_year: "2026-2027", ordering: "placement" });
  });
});
