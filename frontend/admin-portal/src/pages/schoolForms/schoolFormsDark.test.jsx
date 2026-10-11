/**
 * SchoolFormsPage on a dark page: the SF1 and SF2 cards with their
 * validation notes, and the SF9 / SF10 learner pickers (results dropdown,
 * the empty and failed searches, the chosen learner and the print buttons).
 * The print pages themselves stay light by design and aren't rendered here.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeContext } from "../../hooks/useTheme";

const getStudents = vi.fn();
const getEnrollments = vi.fn();

vi.mock("../../api/studentApi", () => ({ getStudents: (...a) => getStudents(...a) }));
vi.mock("../../api/enrollmentApi", () => ({ getEnrollments: (...a) => getEnrollments(...a) }));
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
    window.open = vi.fn();
  });

  it("renders every form card and the SF1 / SF2 validation notes", () => {
    renderDark();
    expect(screen.getByText("SF1 — School Register")).toBeTruthy();
    expect(screen.getByText("SF2 — Daily Attendance Register")).toBeTruthy();
    expect(screen.getByText(/SF9 — Learner's Report Card/)).toBeTruthy();
    expect(screen.getByText(/SF10 — Learner's Permanent Record/)).toBeTruthy();

    fireEvent.click(screen.getByText("Open SF1"));
    expect(screen.getByText("School Year, Grade Level, and Section are required.")).toBeTruthy();
    fireEvent.click(screen.getByText("Open SF2"));
    expect(screen.getByText("School Year, Grade Level, Section, and Month are required.")).toBeTruthy();
    expect(window.open).not.toHaveBeenCalled();
  });

  it("picks an SF9 learner from the dropdown and prints their report card", async () => {
    getStudents.mockResolvedValue([LEARNER]);
    getEnrollments.mockResolvedValue([{ enrollment_id: 31, school_year: "2026-2027", grade_level: "Grade 7", section: "Rizal" }]);
    renderDark();

    fireEvent.change(searchBoxes()[0], { target: { value: "Cruz" } });
    const row = await screen.findByText("Cruz, Ana R.");
    fireEvent.mouseEnter(row.parentElement);
    fireEvent.mouseLeave(row.parentElement);
    fireEvent.click(row);

    expect(await screen.findByText("SY 2026-2027 — Grade 7 · Rizal")).toBeTruthy();
    fireEvent.click(screen.getByText("Print SF9"));
    expect(window.open).toHaveBeenCalledWith("/print/sf9/31", "_blank");
  });

  it("shows an SF10 learner with no enrollments, and the empty and failed searches", async () => {
    getStudents.mockResolvedValueOnce([]);
    renderDark();
    fireEvent.change(searchBoxes()[1], { target: { value: "Nobody" } });
    await waitFor(() => expect(getStudents).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("No students found.")).toBeTruthy();

    getStudents.mockRejectedValueOnce(new Error("Network Error"));
    fireEvent.change(searchBoxes()[1], { target: { value: "Nobody2" } });
    expect((await screen.findByRole("alert")).textContent).toContain("Can't reach the server");

    getStudents.mockResolvedValueOnce([LEARNER]);
    fireEvent.change(searchBoxes()[1], { target: { value: "Cruz" } });
    fireEvent.click(await screen.findByText("Cruz, Ana R."));
    fireEvent.click(screen.getByText("Print SF10"));
    expect(window.open).toHaveBeenCalledWith("/print/sf10/5", "_blank");
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
