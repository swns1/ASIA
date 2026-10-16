/**
 * SchoolFormsPage on a dark page: the SF1 and SF2 cards with their
 * validation notes, and the SF9 / SF10 learner pickers (results dropdown,
 * the empty and failed searches, the chosen learner, SF9's print button and
 * SF10's level picker). The SF9 print page stays light by design and isn't
 * rendered here; the Excel downloads have their own test file.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeContext } from "../../hooks/useTheme";

const getStudents = vi.fn();
const getEnrollments = vi.fn();
const downloadSchoolForm = vi.fn();

vi.mock("../../api/studentApi", () => ({ getStudents: (...a) => getStudents(...a) }));
vi.mock("../../api/enrollmentApi", () => ({
  getEnrollments: (...a) => getEnrollments(...a),
  getSections: () => Promise.resolve([]),
  downloadSchoolForm: (...a) => downloadSchoolForm(...a),
}));
vi.mock("../../utils/download", () => ({ saveBlob: vi.fn() }));
vi.mock("../../utils/auth", async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: () => ({ role: "admin" }),
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

const renderDark = () => render(
  <ThemeContext.Provider value="dark">
    <div data-theme="dark">
      <MemoryRouter initialEntries={["/school-forms"]}>
        <SchoolFormsPage />
      </MemoryRouter>
    </div>
  </ThemeContext.Provider>,
);

const searchBoxes = () => screen.getAllByLabelText("Search for a learner");

describe("SchoolFormsPage in dark mode", () => {
  beforeEach(() => {
    getStudents.mockReset();
    getEnrollments.mockReset();
    downloadSchoolForm.mockReset();
    window.open = vi.fn();
  });

  it("renders every form card and the SF1 / SF2 validation notes", () => {
    renderDark();
    expect(screen.getByText("SF1 — School Register")).toBeTruthy();
    expect(screen.getByText("SF2 — Daily Attendance Register")).toBeTruthy();
    expect(screen.getByText(/SF9 — Learner's Report Card/)).toBeTruthy();
    expect(screen.getByText(/SF10 — Learner's Permanent Record/)).toBeTruthy();

    fireEvent.click(screen.getByText("Download SF1 (Excel)"));
    expect(screen.getByText("School Year, Grade Level, and Section are required.")).toBeTruthy();
    fireEvent.click(screen.getByText("Download SF2 (Excel)"));
    expect(screen.getByText("School Year, Grade Level, Section, and Month are required.")).toBeTruthy();
    expect(downloadSchoolForm).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it("points to Settings for the forms' header", () => {
    renderDark();
    const link = screen.getByRole("link", { name: "Settings › School Forms" });
    expect(link.getAttribute("href")).toBe("/settings");
  });

  it("picks an SF9 learner from the dropdown and prints their report card", async () => {
    getStudents.mockResolvedValue([LEARNER]);
    getEnrollments.mockResolvedValue([
      { enrollment_id: 31, school_year: "2026-2027", grade_level: "Grade 7", section: "Rizal", enrollment_status: "enrolled" },
      // Cancelled before it started: no report card to print.
      { enrollment_id: 32, school_year: "2027-2028", grade_level: "Grade 8", section: "Rizal", enrollment_status: "cancelled" },
    ]);
    renderDark();

    fireEvent.change(searchBoxes()[0], { target: { value: "Cruz" } });
    const row = await screen.findByText("Cruz, Ana R.");
    fireEvent.mouseEnter(row.parentElement);
    fireEvent.mouseLeave(row.parentElement);
    fireEvent.click(row);

    expect(await screen.findByText("SY 2026-2027 — Grade 7 · Rizal")).toBeTruthy();
    expect(screen.queryByText("SY 2027-2028 — Grade 8 · Rizal")).toBeNull();
    fireEvent.click(screen.getByText("Print SF9"));
    expect(window.open).toHaveBeenCalledWith("/print/sf9/31", "_blank");
  });

  it("shows the empty and failed searches, and an SF10 learner with no Grade 1–12 records", async () => {
    getStudents.mockResolvedValueOnce([]);
    renderDark();
    fireEvent.change(searchBoxes()[1], { target: { value: "Nobody" } });
    await waitFor(() => expect(getStudents).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("No students found.")).toBeTruthy();

    getStudents.mockRejectedValueOnce(new Error("Network Error"));
    fireEvent.change(searchBoxes()[1], { target: { value: "Nobody2" } });
    expect((await screen.findByRole("alert")).textContent).toContain("Can't reach the server");

    // Nursery only (no SF10 covers it), and a pending Kindergarten row: no SF10 yet.
    getEnrollments.mockResolvedValue([
      { enrollment_id: 1, school_level: "nursery", enrollment_status: "completed" },
      { enrollment_id: 2, school_level: "kindergarten", enrollment_status: "pending" },
    ]);
    getStudents.mockResolvedValueOnce([LEARNER]);
    fireEvent.change(searchBoxes()[1], { target: { value: "Cruz" } });
    fireEvent.click(await screen.findByText("Cruz, Ana R."));
    expect(await screen.findByText("This learner has no Kinder–Grade 12 records here.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download SF10 (Excel)" })).toBeNull();
  });

  it("says when an SF9 learner has no enrollments", async () => {
    getStudents.mockResolvedValue([LEARNER]);
    getEnrollments.mockResolvedValue([]);
    renderDark();
    fireEvent.change(searchBoxes()[0], { target: { value: "Cruz" } });
    fireEvent.click(await screen.findByText("Cruz, Ana R."));
    expect(await screen.findByText("No enrollments found for this student.")).toBeTruthy();
    const card = screen.getByText(/SF9 — Learner's Report Card/).parentElement;
    expect(within(card).getByText("✕")).toBeTruthy();
  });
});
