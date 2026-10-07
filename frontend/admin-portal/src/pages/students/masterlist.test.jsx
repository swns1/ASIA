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
const group = (name) => screen.getByRole("group", { name });
const chip = (groupName, name) => within(group(groupName)).getByRole("button", { name });
const yearPicker = () => screen.getByRole("button", { name: /^school year:/i });
const pickYear = (name) => {
  fireEvent.click(yearPicker());
  fireEvent.click(screen.getByRole("option", { name }));
};

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
  getStudentCounts.mockResolvedValue(COUNTS);
  getSections.mockResolvedValue([{ name: "Diamond" }, { name: "Garnet" }, { name: "Pearl" }]);
});

describe("StudentsPage — a school year's masterlist", () => {
  it("opens on the current year's learners, in class-list order", async () => {
    render(page());
    await screen.findByText("432 learners in S.Y. 2026-2027");

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
    await screen.findByText("432 learners in S.Y. 2026-2027");
    expect(yearPicker().getAttribute("aria-label")).toBe("School year: 2026-2027");

    pickYear(/all years/i);

    await screen.findByText("551 students on record");
    expect(lastList().school_year).toBeUndefined();
    expect(lastList().ordering).toBe("-student_id");
    expect(screen.getByRole("columnheader", { name: /last enrolled/i })).toBeTruthy();
  });

  it("counts the tiles and chips inside the same filters as the list", async () => {
    render(page());
    await screen.findByText("432 learners in S.Y. 2026-2027");

    expect(lastCounts()).toMatchObject({ school_year: "2026-2027" });
    const total = screen.getByRole("button", { name: /total students/i });
    expect(within(total).getByText("432")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: /^431 active/i })).getByText("431")).toBeTruthy();
    // The masterlist's male/female split, beside the total.
    expect(screen.getByText(/221 male · 211 female/)).toBeTruthy();
  });

  it("narrows to a level, then a grade, then a section", async () => {
    render(page());
    await screen.findByText("432 learners in S.Y. 2026-2027");

    fireEvent.click(chip("Filter by school level", /^junior high/i));
    await waitFor(() => expect(lastList()).toMatchObject({ school_level: "junior_highschool" }));

    fireEvent.click(chip("Filter by grade level", /^grade 7/i));
    await waitFor(() => expect(lastList()).toMatchObject({ grade_level: "Grade 7" }));
    await waitFor(() => expect(getSections).toHaveBeenCalledWith({ school_year: "2026-2027", grade_level: "Grade 7" }));

    fireEvent.click(await within(group("Filter by section")).findByRole("button", { name: /^diamond/i }));
    await waitFor(() => expect(lastList()).toMatchObject({
      school_year: "2026-2027", school_level: "junior_highschool", grade_level: "Grade 7", section: "Diamond",
    }));
    expect(lastCounts()).toMatchObject({ grade_level: "Grade 7", section: "Diamond" });
  });
});

describe("StudentsPage — Not enrolled", () => {
  it("lists the current year's learners with no place, each with Enroll", async () => {
    render(page());
    await screen.findByText("432 learners in S.Y. 2026-2027");

    fireEvent.click(chip(/enrolled or not enrolled/i, /^not enrolled/i));

    await screen.findByText(/^Alabado/);
    expect(lastList()).toMatchObject({ unenrolled: "2026-2027", ordering: "last_name" });
    expect(lastList().school_year).toBeUndefined();
    expect(screen.getByRole("columnheader", { name: /last enrolled/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Enroll Tomas Alabado for S.Y. 2026-2027" }));
    expect(await screen.findByText("enrollment form")).toBeTruthy();
  });

  it("isn't offered for a past year, where it would only list who joined later", async () => {
    render(page());
    await screen.findByText("432 learners in S.Y. 2026-2027");
    expect(group(/enrolled or not enrolled/i)).toBeTruthy();

    pickYear("2025-2026");

    await waitFor(() => expect(lastList()).toMatchObject({ school_year: "2025-2026" }));
    expect(screen.queryByRole("group", { name: /enrolled or not enrolled/i })).toBeNull();
  });
});

describe("StudentsPage — search", () => {
  it("offers every year when nobody in this one matches", async () => {
    render(page());
    await screen.findByText("432 learners in S.Y. 2026-2027");

    const box = screen.getByRole("searchbox", { name: /search students/i });
    fireEvent.change(box, { target: { value: "zzz" } });
    fireEvent.keyDown(box, { key: "Enter" });

    fireEvent.click(await screen.findByRole("button", { name: /search all years/i }));
    await waitFor(() => expect(lastList()).toMatchObject({ search: "zzz" }));
    expect(lastList().school_year).toBeUndefined();
  });

  it("keeps a typed search through a filter click and onto page 2", async () => {
    render(page());
    await screen.findByText("432 learners in S.Y. 2026-2027");

    fireEvent.change(screen.getByRole("searchbox", { name: /search students/i }), { target: { value: "bar" } });
    fireEvent.click(chip("Filter by sex", /^female/i));
    await waitFor(() => expect(lastList()).toMatchObject({ search: "bar", sex: "female", page: 1 }));
    await screen.findByText(/^Barroga/);

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(lastList()).toMatchObject({ search: "bar", sex: "female", page: 2 }));
  });
});

describe("StudentsPage — links and Clear", () => {
  it("opens on every student when a link asks for all years", async () => {
    render(page("/students?school_year=all&search=cruz"));
    await screen.findByText("551 students on record");
    expect(lastList()).toMatchObject({ search: "cruz" });
    expect(lastList().school_year).toBeUndefined();
  });

  it("clears back to the current year's list", async () => {
    render(page("/students?school_year=all"));
    await screen.findByText("551 students on record");

    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));

    await screen.findByText("432 learners in S.Y. 2026-2027");
    expect(lastList()).toMatchObject({ school_year: "2026-2027", ordering: "placement" });
  });
});
