/**
 * My Sections entry grids save what they show, so what they show must be the
 * date (or period) that is selected -- even when the server answers an
 * earlier request last.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getSectionAttendance = vi.fn();
const saveSectionAttendance = vi.fn();

vi.mock("../utils/auth", async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: () => ({ role: "teacher", user_id: 5 }),
}));
vi.mock("../api/identityApi", () => ({ getUsers: () => Promise.resolve([]) }));
vi.mock("../api/enrollmentApi", () => ({
  getMySections: () =>
    Promise.resolve([
      {
        advisory: {
          advisory_id: 1, teacher_user_id: 5, school_year: "2026-2027",
          school_level: "elementary", grade_level: "Grade 4", section: "Rosal",
        },
        student_count: 1,
        students: [],
        subjects: [],
      },
    ]),
  getSectionGrades: () => Promise.resolve([]),
  saveSectionGrades: () => Promise.resolve({}),
  getSectionAttendance: (...a) => getSectionAttendance(...a),
  saveSectionAttendance: (...a) => saveSectionAttendance(...a),
  getSectionAttendanceStats: () => Promise.resolve({}),
  getSectionGradesSummary: () => Promise.resolve({}),
  getNarrativeCategories: () => Promise.resolve([]),
  getSectionNarrativeReports: () => Promise.resolve([]),
  saveSectionNarrativeReports: () => Promise.resolve({}),
}));

const { default: TeacherSectionsPage } = await import("./TeacherSectionsPage");

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const gridWith = (status) => [
  {
    student: { student_id: 9, first_name: "Ana", last_name: "Cruz", student_number: "S-9" },
    attendance: { status, remarks: "" },
  },
];

beforeEach(() => {
  getSectionAttendance.mockReset();
  saveSectionAttendance.mockReset().mockResolvedValue({});
});

describe("My Sections attendance", () => {
  it("saves the marks of the date shown, even when an earlier date answers last", async () => {
    const today = deferred();
    const picked = deferred();
    getSectionAttendance
      .mockReturnValueOnce(today.promise)
      .mockReturnValueOnce(picked.promise)
      .mockResolvedValue(gridWith("A"));

    render(
      <MemoryRouter>
        <TeacherSectionsPage />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: /Attendance/ }));

    const dateInput = document.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: "2026-10-01" } });

    // The picked date is absent; today's slower answer (present) lands last.
    await act(async () => picked.resolve(gridWith("A")));
    await act(async () => today.resolve(gridWith("P")));

    fireEvent.click(screen.getByRole("button", { name: /Save Attendance/ }));
    await act(() => Promise.resolve());

    expect(saveSectionAttendance).toHaveBeenCalledWith(
      expect.objectContaining({
        date: "2026-10-01",
        records: [{ student_id: 9, status: "A", remarks: "" }],
      })
    );
  });
});
