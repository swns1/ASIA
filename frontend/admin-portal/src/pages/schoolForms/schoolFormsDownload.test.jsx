/**
 * The School Forms page's Excel downloads: the section picker, the semester
 * for senior high, what goes to the server, what the browser is handed, the
 * server's warnings, and a refused form's reason shown on the card.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getStudents = vi.fn();
const getEnrollments = vi.fn();
const getSections = vi.fn();
const downloadSchoolForm = vi.fn();
const saveBlob = vi.fn();
const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });

vi.mock("../../api/studentApi", () => ({ getStudents: (...a) => getStudents(...a) }));
vi.mock("../../api/enrollmentApi", () => ({
  getEnrollments: (...a) => getEnrollments(...a),
  getSections: (...a) => getSections(...a),
  downloadSchoolForm: (...a) => downloadSchoolForm(...a),
}));
vi.mock("../../utils/download", () => ({ saveBlob: (...a) => saveBlob(...a) }));
vi.mock("react-hot-toast", () => ({ default: toast }));
vi.mock("../../utils/auth", async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: () => ({ role: "registrar" }),
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

const LEARNER = { student_id: 5, first_name: "Ana", middle_name: "Reyes", last_name: "Cruz", lrn: "1005", student_number: "S-5" };
const FILE = { blob: new Blob(["xlsx"]), filename: "SF1_Grade-7_Rizal_SY2026-2027.xlsx", warnings: [] };

const renderPage = () => render(
  <MemoryRouter initialEntries={["/school-forms"]}>
    <SchoolFormsPage />
  </MemoryRouter>,
);

async function pickSection(prefix, grade, section) {
  fireEvent.change(screen.getByLabelText(`${prefix} grade level`), { target: { value: grade } });
  const select = screen.getByLabelText(`${prefix} section`);
  await waitFor(() => expect(select.disabled).toBe(false));
  fireEvent.change(select, { target: { value: section } });
}

describe("SchoolFormsPage downloads", () => {
  beforeEach(() => {
    [getStudents, getEnrollments, getSections, downloadSchoolForm, saveBlob, toast, toast.success].forEach((f) => f.mockReset());
    getSections.mockResolvedValue([{ name: "Rizal" }, { name: "Bonifacio" }]);
  });

  it("downloads SF1 for a picked section and hands the file to the browser", async () => {
    downloadSchoolForm.mockResolvedValue(FILE);
    renderPage();
    await pickSection("SF1", "Grade 7", "Rizal");
    expect(getSections).toHaveBeenCalledWith({ school_year: "2026-2027", grade_level: "Grade 7" });

    fireEvent.click(screen.getByText("Download SF1 (Excel)"));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(FILE.blob, FILE.filename));
    expect(downloadSchoolForm).toHaveBeenCalledWith(
      "sf1", { school_year: "2026-2027", grade_level: "Grade 7", section: "Rizal" }, "SF1_Grade 7_Rizal.xlsx",
    );
    expect(toast.success).toHaveBeenCalledWith(`${FILE.filename} downloaded.`);
  });

  it("asks senior high for a semester and sends it", async () => {
    downloadSchoolForm.mockResolvedValue(FILE);
    renderPage();
    expect(screen.queryByLabelText("SF1 semester")).toBeNull();
    await pickSection("SF1", "Grade 11", "Rizal");
    fireEvent.change(screen.getByLabelText("SF1 semester"), { target: { value: "2nd" } });

    fireEvent.click(screen.getByText("Download SF1 (Excel)"));
    await waitFor(() => expect(downloadSchoolForm).toHaveBeenCalled());
    expect(downloadSchoolForm.mock.calls[0][1]).toEqual({
      school_year: "2026-2027", grade_level: "Grade 11", section: "Rizal", semester: "2nd",
    });
  });

  it("clears the section when the grade changes", async () => {
    renderPage();
    await pickSection("SF1", "Grade 7", "Rizal");
    fireEvent.change(screen.getByLabelText("SF1 grade level"), { target: { value: "Grade 8" } });
    expect(screen.getByLabelText("SF1 section").value).toBe("");
  });

  it("downloads SF2 for a month and shows the server's warnings", async () => {
    downloadSchoolForm.mockResolvedValue({
      ...FILE, filename: "SF2_Grade-7_Rizal_2026-09.xlsx",
      warnings: ["No attendance was recorded on 1 class day(s): 09/21/2026."],
    });
    renderPage();
    await pickSection("SF2", "Grade 7", "Rizal");
    fireEvent.change(screen.getByLabelText("SF2 month"), { target: { value: "2026-09" } });

    fireEvent.click(screen.getByText("Download SF2 (Excel)"));
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(downloadSchoolForm.mock.calls[0][0]).toBe("sf2");
    expect(downloadSchoolForm.mock.calls[0][1]).toEqual({
      school_year: "2026-2027", grade_level: "Grade 7", section: "Rizal", month: "2026-09",
    });
    expect(toast).toHaveBeenCalledWith(
      "SF2_Grade-7_Rizal_2026-09.xlsx downloaded. No attendance was recorded on 1 class day(s): 09/21/2026.",
      expect.objectContaining({ duration: 10000 }),
    );
  });

  it("shows a refused or empty form's reason on the card", async () => {
    downloadSchoolForm.mockRejectedValue(Object.assign(new Error("No learners in Grade 7 – Rizal for 2026-2027."), {
      response: { status: 404 },
    }));
    renderPage();
    await pickSection("SF1", "Grade 7", "Rizal");
    fireEvent.click(screen.getByText("Download SF1 (Excel)"));
    expect(await screen.findByText("No learners in Grade 7 – Rizal for 2026-2027.")).toBeTruthy();
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("says when a grade has no sections set up", async () => {
    getSections.mockResolvedValue([]);
    renderPage();
    fireEvent.change(screen.getByLabelText("SF1 grade level"), { target: { value: "Grade 9" } });
    expect(await screen.findByText("No sections set up for this grade")).toBeTruthy();
    expect(screen.getByLabelText("SF1 section").disabled).toBe(true);
  });

  it("offers each SF10 level a learner attended, the latest first, and downloads the one picked", async () => {
    getStudents.mockResolvedValue([LEARNER]);
    getEnrollments.mockResolvedValue([
      { enrollment_id: 1, school_level: "elementary", enrollment_status: "completed" },
      { enrollment_id: 2, school_level: "junior_highschool", enrollment_status: "enrolled" },
      { enrollment_id: 3, school_level: "senior_highschool", enrollment_status: "cancelled" },
    ]);
    downloadSchoolForm.mockResolvedValue({ ...FILE, filename: "SF10-JHS_1005_Cruz.xlsx" });
    renderPage();

    fireEvent.change(screen.getAllByLabelText("Search for a learner")[1], { target: { value: "Cruz" } });
    fireEvent.click(await screen.findByText("Cruz, Ana R."));
    const level = await screen.findByLabelText("SF10 level");
    expect([...level.options].map((o) => o.value)).toEqual(["elementary", "junior_highschool"]);
    expect(level.value).toBe("junior_highschool");

    fireEvent.click(screen.getByText("Download SF10"));
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(downloadSchoolForm).toHaveBeenCalledWith("sf10/5", { level: "junior_highschool" }, "SF10_1005.xlsx");

    fireEvent.change(level, { target: { value: "elementary" } });
    fireEvent.click(screen.getByText("Download SF10"));
    await waitFor(() => expect(downloadSchoolForm).toHaveBeenCalledTimes(2));
    expect(downloadSchoolForm.mock.calls[1][1]).toEqual({ level: "elementary" });
  });
});
