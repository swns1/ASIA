/**
 * SubjectsPage — each school year has its own curriculum.
 *
 * Pinned: the page lists one year's subjects (the current one, or the one in
 * the link), a new subject is filed under the year on screen, an archived
 * year's subjects are read-only, and copying from an earlier year asks the
 * server for subjects alone -- and is offered only to admins, whose API it is.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  getSubjects: vi.fn(),
  createSubject: vi.fn(),
  updateSubject: vi.fn(),
  deleteSubject: vi.fn(),
  getGradingTemplates: vi.fn(),
  carryOverSchoolYear: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/enrollmentApi", () => ({
  getSubjects: pass("getSubjects"),
  createSubject: pass("createSubject"),
  updateSubject: pass("updateSubject"),
  deleteSubject: pass("deleteSubject"),
  getGradingTemplates: pass("getGradingTemplates"),
  carryOverSchoolYear: pass("carryOverSchoolYear"),
}));
vi.mock("../../api/billingApi", () => ({ carryOverFees: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027",
    options: ["2026-2027", "2025-2026", "2024-2025"],
    yearCounts: {},
    yearStates: { "2026-2027": "current", "2025-2026": "open", "2024-2025": "archived" },
  }),
}));

const { default: SubjectsPage } = await import("../SubjectsPage");

const subject = (id, year, name = "Mathematics 7") => ({
  subject_id: id, school_year: year, subject_code: `MATH-7-${id}`, subject_name: name,
  school_level: "junior_highschool", grade_level: "Grade 7", strand: null, semester: null,
  grading_template: null, grading_template_detail: null,
});

const asRole = (role) => sessionStorage.setItem("current_user", JSON.stringify({ name: "Staff", role }));

function renderAt(url = "/subjects") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SubjectsPage />
    </MemoryRouter>,
  );
}

// The list's own requests; the band's counts ask for one row (page_size: 1).
const listCalls = () => api.getSubjects.mock.calls.map((c) => c[0]).filter((p) => p.page_size !== 1);
const lastParams = () => listCalls().at(-1);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  asRole("admin");
  api.getGradingTemplates.mockResolvedValue([]);
  api.getSubjects.mockImplementation((p) => Promise.resolve({
    results: [subject(1, p.school_year)], count: 1, next: null, previous: null,
  }));
});

describe("SubjectsPage — per school year", () => {
  it("lists the current year's subjects", async () => {
    renderAt();
    expect(await screen.findByText("Mathematics 7")).toBeTruthy();
    expect(lastParams()).toEqual(expect.objectContaining({ school_year: "2026-2027", page: 1 }));
    expect(await screen.findByText("subject in S.Y. 2026-2027")).toBeTruthy();
  });

  it("opens on the year in the link", async () => {
    renderAt("/subjects?school_year=2025-2026");
    await screen.findByText("Mathematics 7");
    expect(lastParams().school_year).toBe("2025-2026");
  });

  it("files a new subject under the year on screen", async () => {
    api.createSubject.mockResolvedValue({ subject_id: 9 });
    renderAt("/subjects?school_year=2025-2026");
    await screen.findByText("Mathematics 7");

    fireEvent.click(screen.getByRole("button", { name: "New Subject" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. MATH-7"), { target: { value: "ENG-1" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Mathematics 7"), { target: { value: "English 1" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Subject/ }));

    await waitFor(() => expect(api.createSubject).toHaveBeenCalled());
    expect(api.createSubject.mock.calls[0][0]).toEqual(expect.objectContaining({
      school_year: "2025-2026", subject_code: "ENG-1", subject_name: "English 1",
    }));
  });

  it("keeps an archived year's subjects read-only", async () => {
    renderAt("/subjects?school_year=2024-2025");
    const row = (await screen.findByText("Mathematics 7")).closest("tr");

    expect(screen.getByText("S.Y. 2024-2025 is archived")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New Subject" }).disabled).toBe(true);
    expect(within(row).getByText("Archived")).toBeTruthy();
    expect(within(row).queryByRole("button", { name: /Edit|Delete/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Copy from an earlier year/ })).toBeNull();
  });

  it("copies subjects alone from an earlier year", async () => {
    api.carryOverSchoolYear.mockImplementation((label, body) => Promise.resolve({
      from: body.from, to: label, dry_run: Boolean(body.dry_run),
      subjects: {
        copied: [{ subject_code: "MATH-7", subject_name: "Mathematics 7", school_level: "junior_highschool",
                   grade_level: "Grade 7", strand: null, semester: null }],
        skipped: [],
      },
    }));
    renderAt();
    await screen.findByText("Mathematics 7");

    fireEvent.click(screen.getByRole("button", { name: /Copy from an earlier year/ }));
    await waitFor(() => expect(api.carryOverSchoolYear).toHaveBeenCalledWith(
      "2026-2027", { from: "2025-2026", parts: ["subjects"], dry_run: true },
    ));
    expect(await screen.findByText("Will add 1 subject:")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(api.carryOverSchoolYear).toHaveBeenLastCalledWith(
      "2026-2027", { from: "2025-2026", parts: ["subjects"] },
    ));
  });

  it("offers the copy to admins only", async () => {
    asRole("registrar");
    renderAt();
    await screen.findByText("Mathematics 7");
    expect(screen.queryByRole("button", { name: /Copy from an earlier year/ })).toBeNull();
    expect(screen.getByRole("button", { name: "New Subject" }).disabled).toBe(false);
  });
});
