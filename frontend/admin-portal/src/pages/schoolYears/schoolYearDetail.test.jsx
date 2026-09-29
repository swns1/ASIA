/**
 * SchoolYearDetailPage — one year's setup: the checklist, its sections laid
 * out on the grade ladder, adding and renaming a section, who advises each
 * section, copying an earlier year's sections and advisers (previewed by the
 * server's own dry run), and archiving a finished year.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = {
  getSchoolYear: vi.fn(),
  getSchoolYearSetup: vi.fn(),
  getSections: vi.fn(),
  listRegisteredSchoolYears: vi.fn(),
  makeSchoolYearCurrent: vi.fn(),
  createSection: vi.fn(),
  updateSection: vi.fn(),
  deleteSection: vi.fn(),
  carryOverSchoolYear: vi.fn(),
  createSchoolYear: vi.fn(),
  updateSchoolYear: vi.fn(),
  getSectionAdvisories: vi.fn(),
  createSectionAdvisory: vi.fn(),
  deleteSectionAdvisory: vi.fn(),
  archiveSchoolYear: vi.fn(),
  unarchiveSchoolYear: vi.fn(),
};
const getUsers = vi.fn();
const carryOverFees = vi.fn();
const pass = (name) => (...a) => api[name](...a);
const refreshYears = vi.fn();

vi.mock("../../api/enrollmentApi", () => Object.fromEntries(Object.keys(api).map((k) => [k, pass(k)])));
vi.mock("../../api/identityApi", () => ({ getUsers: (...a) => getUsers(...a) }));
vi.mock("../../api/billingApi", () => ({ carryOverFees: (...a) => carryOverFees(...a) }));
vi.mock("../../context/SchoolYearContext", () => ({ useSchoolYear: () => ({ refreshYears }) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: SchoolYearDetailPage } = await import("../SchoolYearDetailPage");

const YEAR = { label: "2027-2028", state: "upcoming", start_date: "2027-06-07", end_date: "2028-03-31" };
const YEARS = [
  YEAR,
  { label: "2026-2027", state: "current", start_date: "2026-06-08", end_date: "2027-03-31" },
];
const section = (id, grade, name, extra = {}) => ({
  section_id: id, school_year: "2027-2028", grade_level: grade, name, strand: null,
  school_level: "junior_highschool", enrollment_count: 0, adviser_count: 0, ...extra,
});

function renderAt(url = "/school-years/2027-2028") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/school-years/:label" element={<SchoolYearDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getSchoolYear.mockResolvedValue(YEAR);
  api.listRegisteredSchoolYears.mockResolvedValue(YEARS);
  api.getSchoolYearSetup.mockResolvedValue({
    sections: { count: 0, grades: 0 },
    advisers: { sections: 0, with_adviser: 0 },
    calendar: { quarters_set: 2, holidays: 0 },
  });
  api.getSections.mockResolvedValue([]);
  api.getSectionAdvisories.mockResolvedValue({ results: [] });
  getUsers.mockResolvedValue([
    { user_id: 7, name: "Ana Cruz", role: "teacher" },
    { user_id: 8, name: "Ben Reyes", role: "teacher" },
    { user_id: 1, name: "Admin", role: "admin" },
  ]);
});

describe("SchoolYearDetailPage — overview", () => {
  it("shows the setup checklist with what's missing", async () => {
    renderAt();
    expect(await screen.findByText("Setup checklist")).toBeTruthy();
    expect(screen.getByText(/None yet — enrollment and advisers pick from these/)).toBeTruthy();
    expect(screen.getByText("2 of 4 grading periods set on the calendar")).toBeTruthy();
    // An empty year offers to start from an earlier one.
    expect(screen.getByRole("button", { name: /Copy from an earlier year/ })).toBeTruthy();
  });

  it("makes the year current through a confirm", async () => {
    api.makeSchoolYearCurrent.mockResolvedValue({ ...YEAR, state: "current" });
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "Make current" }));
    expect(await screen.findByText(/S\.Y\. 2026-2027 stays open/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Make current" }).at(-1));
    await waitFor(() => expect(api.makeSchoolYearCurrent).toHaveBeenCalledWith("2027-2028"));
    await waitFor(() => expect(refreshYears).toHaveBeenCalled());
  });
});

describe("SchoolYearDetailPage — sections", () => {
  it("lays sections out on the grade ladder, with empty grades visible", async () => {
    api.getSections.mockResolvedValue([
      section(1, "Grade 7", "Rizal", { enrollment_count: 31, adviser_count: 1 }),
      section(2, "Grade 11", "STEM-A", { school_level: "senior_highschool", strand: "STEM" }),
    ]);
    renderAt("/school-years/2027-2028?tab=sections");
    expect(await screen.findByText("2 sections across 2 grades")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Grade 7 Rizal: 31 learners, has an adviser/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Grade 11 STEM-A, STEM/ })).toBeTruthy();
    // Grade 8 has none, and says so rather than being left out.
    const grade8 = screen.getByText("Grade 8").closest("li");
    expect(within(grade8).getByText("No sections")).toBeTruthy();
  });

  it("adds a section to the grade it was opened from", async () => {
    api.createSection.mockResolvedValue(section(3, "Grade 8", "Mabini"));
    renderAt("/school-years/2027-2028?tab=sections");
    fireEvent.click(await screen.findByRole("button", { name: "Add a Grade 8 section" }));
    fireEvent.change(await screen.findByPlaceholderText("e.g. Rizal"), { target: { value: "Mabini" } });
    // The dialog's button, not the toolbar's.
    fireEvent.click(screen.getAllByRole("button", { name: "Add section" }).at(-1));
    await waitFor(() => expect(api.createSection).toHaveBeenCalledWith({
      school_year: "2027-2028", school_level: "junior_highschool", grade_level: "Grade 8",
      name: "Mabini", strand: null,
    }));
    // The list and the checklist both reload.
    await waitFor(() => expect(api.getSections).toHaveBeenCalledTimes(2));
  });

  it("won't remove a section that still has learners", async () => {
    api.getSections.mockResolvedValue([section(1, "Grade 7", "Rizal", { enrollment_count: 31 })]);
    renderAt("/school-years/2027-2028?tab=sections");
    fireEvent.click(await screen.findByRole("button", { name: /Grade 7 Rizal/ }));
    expect((await screen.findByRole("button", { name: "Remove" })).disabled).toBe(true);
    expect(screen.getByText(/A section can only be removed once it's empty/)).toBeTruthy();
  });

  it("previews a copy from an earlier year, then applies it", async () => {
    api.carryOverSchoolYear.mockImplementation((label, body) => Promise.resolve({
      from: "2026-2027", to: label, dry_run: Boolean(body.dry_run),
      sections: {
        copied: [
          { grade_level: "Grade 7", name: "Rizal", strand: null },
          { grade_level: "Grade 11", name: "STEM-A", strand: "STEM" },
        ],
        skipped: [{ grade_level: "Grade 7", name: "Mabini", strand: null }],
      },
    }));
    renderAt("/school-years/2027-2028?tab=sections");
    fireEvent.click(await screen.findByRole("button", { name: /Copy from an earlier year/ }));

    // The preview is the server's dry run, from the nearest other year.
    await waitFor(() => expect(api.carryOverSchoolYear).toHaveBeenCalledWith(
      "2027-2028", { from: "2026-2027", parts: ["sections"], dry_run: true },
    ));
    expect(await screen.findByText("Will add 2 sections:")).toBeTruthy();
    expect(screen.getByText("STEM-A · STEM")).toBeTruthy();
    expect(screen.getByText(/1 already here is left as it is/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy 2 sections" }));
    await waitFor(() => expect(api.carryOverSchoolYear).toHaveBeenLastCalledWith(
      "2027-2028", { from: "2026-2027", parts: ["sections"] },
    ));
  });
});

describe("SchoolYearDetailPage — advisers", () => {
  const SECTIONS = [
    section(1, "Grade 7", "Rizal", { adviser_count: 1 }),
    section(2, "Grade 7", "Mabini"),
  ];
  const RIZAL_ADVISER = {
    advisory_id: 40, teacher_user_id: 7, school_year: "2027-2028",
    school_level: "junior_highschool", grade_level: "Grade 7", section: "Rizal", strand: null,
  };

  beforeEach(() => {
    api.getSections.mockResolvedValue(SECTIONS);
    api.getSectionAdvisories.mockResolvedValue({ results: [RIZAL_ADVISER] });
  });

  it("lists every section with its adviser, or the gap", async () => {
    renderAt("/school-years/2027-2028?tab=advisers");
    expect(await screen.findByText("1 of 2 sections have an adviser")).toBeTruthy();
    expect(api.getSectionAdvisories).toHaveBeenCalledWith({ school_year: "2027-2028", page_size: 500 });
    expect(screen.getByText("Ana Cruz")).toBeTruthy();
    const mabini = screen.getByRole("button", { name: "Assign an adviser to Grade 7 Mabini" }).closest("li");
    expect(within(mabini).getByText("No adviser")).toBeTruthy();
  });

  it("assigns a teacher to a section, which fixes the rest of the placement", async () => {
    api.createSectionAdvisory.mockResolvedValue({});
    renderAt("/school-years/2027-2028?tab=advisers");
    await screen.findByText("1 of 2 sections have an adviser");
    fireEvent.click(screen.getByRole("button", { name: "Assign an adviser to Grade 7 Mabini" }));
    const picker = await screen.findByRole("combobox", { name: "Teacher" });
    // Only teachers, each with what they already advise this year.
    const options = within(picker).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Select a teacher…", "Ben Reyes", "Ana Cruz — advises Grade 7 Rizal"]);

    fireEvent.change(picker, { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(api.createSectionAdvisory).toHaveBeenCalledWith({
      teacher_user_id: 8, school_year: "2027-2028", school_level: "junior_highschool",
      grade_level: "Grade 7", section: "Mabini", strand: null,
    }));
    await waitFor(() => expect(api.getSectionAdvisories).toHaveBeenCalledTimes(2));
  });

  it("removes an adviser through a confirm", async () => {
    api.deleteSectionAdvisory.mockResolvedValue({});
    renderAt("/school-years/2027-2028?tab=advisers");
    fireEvent.click(await screen.findByRole("button", { name: "Remove Ana Cruz as adviser" }));
    expect(await screen.findByText(/lose access to its grades, attendance and narrative reports/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove adviser" }));
    await waitFor(() => expect(api.deleteSectionAdvisory).toHaveBeenCalledWith(40));
  });

  it("previews an earlier year's advisers, with why any were skipped", async () => {
    api.carryOverSchoolYear.mockImplementation((label, body) => Promise.resolve({
      from: "2026-2027", to: label, dry_run: Boolean(body.dry_run),
      ...(body.parts.includes("sections") && { sections: { copied: [], skipped: [] } }),
      advisers: {
        copied: [{ teacher_user_id: 8, teacher_name: "Ben Reyes", grade_level: "Grade 7", section: "Mabini", strand: null }],
        skipped: [
          { teacher_user_id: 9, teacher_name: "Cy Luna", grade_level: "Grade 8", section: "Luna", strand: null, reason: "no_section" },
          { teacher_user_id: 7, teacher_name: "Ana Cruz", grade_level: "Grade 7", section: "Rizal", strand: null, reason: "already" },
        ],
      },
    }));
    renderAt("/school-years/2027-2028?tab=advisers");
    fireEvent.click(await screen.findByRole("button", { name: /Copy from an earlier year/ }));

    await waitFor(() => expect(api.carryOverSchoolYear).toHaveBeenCalledWith(
      "2027-2028", { from: "2026-2027", parts: ["advisers"], dry_run: true },
    ));
    expect(await screen.findByText("Will assign 1 adviser:")).toBeTruthy();
    expect(screen.getByText(/no section of the same name in S\.Y\. 2027-2028 \(Grade 8 Luna\)/)).toBeTruthy();
    expect(screen.getByText(/already assigned to the same section here/)).toBeTruthy();

    // Ticking Sections too asks for both, in the order the server applies them.
    fireEvent.click(screen.getByRole("checkbox", { name: /Sections/ }));
    await waitFor(() => expect(api.carryOverSchoolYear).toHaveBeenLastCalledWith(
      "2027-2028", { from: "2026-2027", parts: ["sections", "advisers"], dry_run: true },
    ));

    fireEvent.click(await screen.findByRole("button", { name: "Copy 1 adviser" }));
    await waitFor(() => expect(api.carryOverSchoolYear).toHaveBeenLastCalledWith(
      "2027-2028", { from: "2026-2027", parts: ["sections", "advisers"] },
    ));
  });

  it("sends a year without sections to set them up first", async () => {
    api.getSections.mockResolvedValue([]);
    api.getSectionAdvisories.mockResolvedValue({ results: [] });
    renderAt("/school-years/2027-2028?tab=advisers");
    expect(await screen.findByText("Set up this year's sections first")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Go to Sections" }));
    expect(await screen.findByText("No sections yet")).toBeTruthy();
  });
});

describe("SchoolYearDetailPage — archiving", () => {
  const FINISHED = { label: "2025-2026", state: "open", start_date: "2025-06-02", end_date: "2026-03-31" };
  const ARCHIVED = { ...FINISHED, state: "archived", archived_at: "2026-07-01T00:00:00Z" };

  it("only a finished year offers Archive", async () => {
    renderAt();   // 2027-2028 is upcoming
    await screen.findByText("Setup checklist");
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  });

  it("archives a finished year, naming the learners left unfinished", async () => {
    api.getSchoolYear.mockResolvedValue(FINISHED);
    api.getSchoolYearSetup.mockResolvedValue({
      enrollments: { total: 40, unfinished: 3 },
      sections: { count: 2, grades: 1 },
      advisers: { sections: 2, with_adviser: 2 },
      calendar: { quarters_set: 4, holidays: 12 },
    });
    api.archiveSchoolYear.mockResolvedValue({ ...ARCHIVED });
    renderAt("/school-years/2025-2026");

    fireEvent.click(await screen.findByRole("button", { name: "Archive" }));
    expect(await screen.findByText("3 learners are still enrolled or pending")).toBeTruthy();
    expect(screen.getByText(/Even a grade correction will need it unarchived first/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Archive" }).at(-1));
    await waitFor(() => expect(api.archiveSchoolYear).toHaveBeenCalledWith("2025-2026"));
    // Every year picker drops it from what can be filed under.
    await waitFor(() => expect(refreshYears).toHaveBeenCalled());
  });

  it("an archived year is read-only until it's unarchived", async () => {
    api.getSchoolYear.mockResolvedValue(ARCHIVED);
    api.getSections.mockResolvedValue([section(1, "Grade 7", "Rizal", { school_year: "2025-2026" })]);
    api.unarchiveSchoolYear.mockResolvedValue({ ...FINISHED });
    renderAt("/school-years/2025-2026");

    expect(await screen.findByText(/Its records are read-only, grade corrections included/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Make current" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Sections/ }));
    expect(await screen.findByText("1 section across 1 grade")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add section" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Unarchive" }));
    expect(await screen.findByText(/Its records become editable again/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Unarchive" }).at(-1));
    await waitFor(() => expect(api.unarchiveSchoolYear).toHaveBeenCalledWith("2025-2026"));
  });
});

describe("SchoolYearDetailPage — fees", () => {
  it("starts an empty year from an earlier one: sections, advisers, calendar and fees", async () => {
    api.getSchoolYearSetup.mockResolvedValue({
      enrollments: { total: 0, unfinished: 0 },
      sections: { count: 0, grades: 0 },
      advisers: { sections: 0, with_adviser: 0 },
      fees: { grades: 0, of: 14 },
      calendar: { quarters_set: 0, holidays: 0 },
    });
    api.carryOverSchoolYear.mockImplementation((label, body) => Promise.resolve({
      from: body.from, to: label, dry_run: Boolean(body.dry_run),
      sections: { copied: [{ grade_level: "Grade 7", name: "Rizal", strand: null }], skipped: [] },
      advisers: { copied: [], skipped: [] },
    }));
    carryOverFees.mockImplementation((body) => Promise.resolve({
      from: body.from, to: body.to, dry_run: Boolean(body.dry_run),
      fees: { copied: [{ school_level: "junior_highschool", grade_level: "Grade 7", items: 4, total: "25500.00" }], skipped: [] },
    }));
    renderAt();

    expect(await screen.findByText("None yet — invoices for this year are built from these")).toBeTruthy();
    // The Sections row's copy (the Fees row has its own, for fees alone).
    fireEvent.click(screen.getAllByRole("button", { name: /Copy from an earlier year/ })[0]);

    // Each server previews its own parts.
    await waitFor(() => expect(api.carryOverSchoolYear).toHaveBeenCalledWith(
      "2027-2028", { from: "2026-2027", parts: ["sections", "advisers", "calendar"], dry_run: true },
    ));
    expect(carryOverFees).toHaveBeenCalledWith({ from: "2026-2027", to: "2027-2028", dry_run: true });
    expect(await screen.findByText("Will add fees for 1 grade:")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy 1 section and fees for 1 grade" }));
    await waitFor(() => expect(carryOverFees).toHaveBeenLastCalledWith({ from: "2026-2027", to: "2027-2028" }));
    expect(api.carryOverSchoolYear).toHaveBeenLastCalledWith(
      "2027-2028", { from: "2026-2027", parts: ["sections", "advisers", "calendar"] },
    );
  });

  it("links to the year's fees in Billing Settings", async () => {
    renderAt();
    const link = await screen.findByRole("link", { name: "Billing Settings" });
    expect(link.getAttribute("href")).toBe("/settings?tab=fees&school_year=2027-2028");
  });
});

describe("SchoolYearDetailPage — calendar", () => {
  it("copies an earlier year's calendar, a year on, with a reminder to check it", async () => {
    api.getSections.mockResolvedValue([section(1, "Grade 7", "Rizal")]);
    api.getSchoolYearSetup.mockResolvedValue({
      enrollments: { total: 0, unfinished: 0 },
      sections: { count: 1, grades: 1 },
      advisers: { sections: 1, with_adviser: 1 },
      fees: { grades: 14, of: 14 },
      calendar: { quarters_set: 0, holidays: 0 },
    });
    api.carryOverSchoolYear.mockImplementation((label, body) => Promise.resolve({
      from: body.from, to: label, dry_run: Boolean(body.dry_run),
      calendar: {
        shift_years: 1,
        copied: [
          { title: "1st Quarter", event_type: "grading_period", grading_period: "1st_quarter", start_date: "2027-06-07", end_date: "2027-08-20" },
          { title: "Christmas Day", event_type: "holiday", grading_period: null, start_date: "2027-12-25", end_date: "2027-12-25" },
        ],
        skipped: [],
      },
    }));
    renderAt();

    // The Quarter dates row offers it while the year's calendar is empty.
    fireEvent.click(await screen.findByRole("button", { name: /Copy from an earlier year/ }));
    await waitFor(() => expect(api.carryOverSchoolYear).toHaveBeenCalledWith(
      "2027-2028", { from: "2026-2027", parts: ["calendar"], dry_run: true },
    ));
    expect(await screen.findByText("Will add 2 calendar events, 1 year on:")).toBeTruthy();
    expect(screen.getByText("Christmas Day")).toBeTruthy();
    expect(screen.getByText(/Check holidays that move each year/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy 2 calendar events" }));
    await waitFor(() => expect(api.carryOverSchoolYear).toHaveBeenLastCalledWith(
      "2027-2028", { from: "2026-2027", parts: ["calendar"] },
    ));
  });
});
