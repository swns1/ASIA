/**
 * StudentsPage — the masterlist's "Last enrolled" column.
 *
 * The page lists every learner the school has, so it says where each one was:
 * their latest enrollment that wasn't cancelled, sent with the list itself.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getStudents = vi.fn();

vi.mock("../../api/studentApi", () => ({
  getStudents: (...a) => getStudents(...a),
  deleteStudent: vi.fn(),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ currentYear: "2026-2027", options: ["2026-2027"], yearCounts: {} }),
}));

const { default: StudentsPage } = await import("../StudentsPage");

function student(id, last_name, extra = {}) {
  return {
    student_id: id,
    first_name: "Learner",
    last_name,
    lrn: `13651209000${id}`,
    birth_date: "2015-02-03",
    sex: "male",
    status: "active",
    ...extra,
  };
}

const rowOf = (lastName) => screen.getByText(new RegExp(`^${lastName}\\b`)).closest("tr");

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("access_token", "token");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Ana Reyes", role: "registrar" }));
  getStudents.mockResolvedValue({
    results: [
      student(1, "Castillo", {
        last_enrollment: { school_year: "2025-2026", grade_level: "Grade 6", section: "Rizal" },
      }),
      student(2, "Pascual", { last_enrollment: null }),
      student(3, "Uy"),
    ],
    count: 3,
    next: null,
    previous: null,
  });
});

describe("StudentsPage — Last enrolled", () => {
  it("shows the school year, grade and section of each student's latest enrollment", async () => {
    render(
      <MemoryRouter initialEntries={["/students"]}>
        <StudentsPage />
      </MemoryRouter>,
    );
    await screen.findByText("3 students registered");

    expect(screen.getByRole("columnheader", { name: /last enrolled/i })).toBeTruthy();
    const castillo = within(rowOf("Castillo"));
    expect(castillo.getByText("S.Y. 2025-2026")).toBeTruthy();
    expect(castillo.getByText("Grade 6 · Rizal")).toBeTruthy();
  });

  it("says so when a student was never enrolled, and guesses nothing when the server didn't say", async () => {
    render(
      <MemoryRouter initialEntries={["/students"]}>
        <StudentsPage />
      </MemoryRouter>,
    );
    await screen.findByText("3 students registered");

    expect(within(rowOf("Pascual")).getByText("Not enrolled yet")).toBeTruthy();
    expect(within(rowOf("Uy")).queryByText("Not enrolled yet")).toBeNull();
  });
});
