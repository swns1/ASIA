/**
 * ScholarshipsPage — the grade-based eligibility scan.
 *
 * It is meant to cover every enrolled learner in the year. It used to read one
 * page of 200 and stop, and a learner whose grades failed to load simply did
 * not appear — which reads exactly like "not eligible".
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  getEnrollmentScholarships: vi.fn(),
  getEnrollmentScholarshipSummary: vi.fn(),
  getScholarshipTypes: vi.fn(),
  getEnrollments: vi.fn(),
  getGrades: vi.fn(),
  createEnrollmentScholarship: vi.fn(),
  deleteEnrollmentScholarship: vi.fn(),
};

vi.mock("../../api/enrollmentApi", () =>
  Object.fromEntries(Object.keys(api).map((name) => [name, (...a) => api[name](...a)])),
);
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    schoolYear: "2026-2027",
    options: ["2026-2027"],
    yearCounts: {},
    currentYear: "2026-2027",
  }),
}));

const { default: ScholarshipsPage } = await import("../ScholarshipsPage");

function enrollment(id) {
  return {
    enrollment_id: id,
    student: id,
    student_name: `Learner ${id}`,
    school_year: "2026-2027",
    grade_level: "Grade 5",
    section: "Mabini",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getScholarshipTypes.mockResolvedValue([]);
  api.getEnrollmentScholarships.mockResolvedValue({ results: [], count: 0 });
  api.getEnrollmentScholarshipSummary.mockResolvedValue({});
  // Two pages of enrolled learners; only the second page holds an honour student.
  api.getEnrollments.mockImplementation((params) => {
    if (params.page === 1) return Promise.resolve({ results: [enrollment(1), enrollment(2)], next: "?page=2" });
    if (params.page === 2) return Promise.resolve({ results: [enrollment(3), enrollment(4)], next: null });
    return Promise.resolve({ results: [], next: null });
  });
  api.getGrades.mockImplementation(({ enrollment: id }) => {
    if (id === 4) return Promise.reject(new Error("timeout"));
    return Promise.resolve([{ numeric_grade: id === 3 ? "97.00" : "85.00" }]);
  });
});

async function runScan() {
  render(
    <MemoryRouter>
      <ScholarshipsPage />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("tab", { name: /Grade-Based Eligibility/ }));
  // The tab adopts the global year in an effect; scanning before that lands
  // is a no-op, so wait for the year chip to show as chosen.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /2026-2027/ }).getAttribute("aria-pressed")).toBe("true"),
  );
  fireEvent.click(screen.getByRole("button", { name: /Scan Now/ }));
}

describe("ScholarshipsPage — eligibility scan", () => {
  it("scans learners past the first page", async () => {
    await runScan();

    expect(await screen.findByText("Learner 3")).toBeTruthy();
    expect(api.getGrades).toHaveBeenCalledTimes(4);
  });

  it("says how many learners could not be checked", async () => {
    await runScan();

    expect(await screen.findByText(/1 student couldn't be checked/)).toBeTruthy();
  });

  it("shows an error when the learner list itself fails", async () => {
    api.getEnrollments.mockRejectedValue(new Error("enrollment service is down"));
    await runScan();

    await waitFor(() => expect(screen.queryByText(/enrollment service is down/)).not.toBeNull());
  });
});
