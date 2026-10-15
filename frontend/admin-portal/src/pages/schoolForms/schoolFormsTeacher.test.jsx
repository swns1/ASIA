/**
 * A teacher's School Forms: the server lets them download SF1 and SF2 only
 * for sections they advise that year, so the grade and section pickers offer
 * only those (from my-sections, never the school's whole section list), and
 * a single advisory needs no picking at all.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getMySections = vi.fn();
const getSections = vi.fn();
const downloadSchoolForm = vi.fn();

vi.mock("../../api/studentApi", () => ({ getStudents: vi.fn() }));
vi.mock("../../api/enrollmentApi", () => ({
  getEnrollments: vi.fn(),
  getMySections: (...a) => getMySections(...a),
  getSections: (...a) => getSections(...a),
  downloadSchoolForm: (...a) => downloadSchoolForm(...a),
}));
vi.mock("../../utils/download", () => ({ saveBlob: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("../../utils/auth", async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: () => ({ role: "teacher" }),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027",
    options: ["2026-2027", "2025-2026"],
    yearCounts: {},
    yearStates: { "2026-2027": "current" },
  }),
}));

const { default: SchoolFormsPage } = await import("../SchoolFormsPage");

const advisory = (school_year, grade_level, section) => ({ advisory: { school_year, grade_level, section }, students: [] });
const FILE = { blob: new Blob(["xlsx"]), filename: "SF1.xlsx", warnings: [] };

const renderPage = () => render(
  <MemoryRouter initialEntries={["/school-forms"]}>
    <SchoolFormsPage />
  </MemoryRouter>,
);

const optionValues = (select) => within(select).getAllByRole("option").map((o) => o.value).filter(Boolean);

describe("SchoolFormsPage for a teacher", () => {
  beforeEach(() => {
    [getMySections, getSections, downloadSchoolForm].forEach((f) => f.mockReset());
    downloadSchoolForm.mockResolvedValue(FILE);
  });

  it("offers only the grades and sections the teacher advises that year", async () => {
    getMySections.mockResolvedValue([
      advisory("2026-2027", "Grade 7", "Rizal"),
      advisory("2026-2027", "Grade 8", "Mabini"),
      advisory("2026-2027", "Grade 8", "Luna"),
      advisory("2025-2026", "Grade 6", "Bonifacio"),
    ]);
    renderPage();
    const grade = screen.getByLabelText("SF1 grade level");
    await waitFor(() => expect(optionValues(grade)).toEqual(["Grade 7", "Grade 8"]));

    fireEvent.change(grade, { target: { value: "Grade 8" } });
    const section = screen.getByLabelText("SF1 section");
    expect(optionValues(section)).toEqual(["Luna", "Mabini"]);
    expect(section.value).toBe("");

    // One section in the grade: already picked.
    fireEvent.change(grade, { target: { value: "Grade 7" } });
    expect(section.value).toBe("Rizal");
    fireEvent.click(screen.getByText("Download SF1 (Excel)"));
    await waitFor(() => expect(downloadSchoolForm).toHaveBeenCalled());
    expect(downloadSchoolForm.mock.calls[0][1]).toEqual({ school_year: "2026-2027", grade_level: "Grade 7", section: "Rizal" });
    expect(getSections).not.toHaveBeenCalled();
  });

  it("needs no picking from a teacher with one advisory", async () => {
    getMySections.mockResolvedValue([advisory("2026-2027", "Grade 7", "Rizal")]);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText("SF2 grade level").value).toBe("Grade 7"));
    expect(screen.getByLabelText("SF2 section").value).toBe("Rizal");

    fireEvent.click(screen.getByText("Download SF2 (Excel)"));
    await waitFor(() => expect(downloadSchoolForm).toHaveBeenCalled());
    expect(downloadSchoolForm.mock.calls[0][1]).toMatchObject({ grade_level: "Grade 7", section: "Rizal" });
  });

  it("says so when the teacher advises no section in the year", async () => {
    getMySections.mockResolvedValue([advisory("2025-2026", "Grade 6", "Bonifacio")]);
    renderPage();
    const grade = screen.getByLabelText("SF1 grade level");
    expect(await within(grade).findByText("You advise no section in 2026-2027")).toBeTruthy();
    expect(grade.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/School Year/), { target: { value: "2025-2026" } });
    await waitFor(() => expect(grade.value).toBe("Grade 6"));
    expect(screen.getByLabelText("SF1 section").value).toBe("Bonifacio");
  });

  it("says so when the teacher's sections can't be loaded", async () => {
    getMySections.mockRejectedValue(new Error("offline"));
    renderPage();
    const grade = screen.getByLabelText("SF1 grade level");
    expect(await within(grade).findByText("Couldn't load your sections")).toBeTruthy();
  });
});
