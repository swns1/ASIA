/**
 * ScholarshipsPage on an archived school year: awards stay readable, nothing
 * new is awarded into it, and its awards can't be revoked.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    currentYear: "2026-2027",
    options: ["2026-2027", "2025-2026", "2024-2025"],
    yearCounts: {},
    yearStates: { "2026-2027": "current", "2025-2026": "open", "2024-2025": "archived" },
  }),
}));

const { default: ScholarshipsPage } = await import("../ScholarshipsPage");

const award = (id, year) => ({
  enrollment_scholarship_id: id,
  enrollment_id: id,
  approved_at: "2025-01-10T00:00:00Z",
  notes: "",
  scholarship_type_detail: { scholarship_name: "Academic", discount_mode: "percentage", discount_value: "10.00" },
  enrollment_detail: { student_name: `Learner ${id}`, school_year: year, grade_level: "Grade 7", section: "Rizal" },
});

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ScholarshipsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Staff", role: "registrar" }));
  api.getScholarshipTypes.mockResolvedValue([]);
  api.getEnrollmentScholarshipSummary.mockResolvedValue({});
  api.getEnrollments.mockResolvedValue({ results: [] });
});

describe("ScholarshipsPage — an archived year", () => {
  it("shows its awards read-only and awards nothing new into it", async () => {
    api.getEnrollmentScholarships.mockResolvedValue({ results: [award(1, "2024-2025")], count: 1 });
    renderAt("/scholarships?school_year=2024-2025");

    expect(await screen.findByText("Learner 1")).toBeTruthy();
    expect(screen.getByText("S.Y. 2024-2025 is archived")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Revoke scholarship/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Award Scholarship/ }).disabled).toBe(true);
  });

  it("leaves an open year as it was", async () => {
    api.getEnrollmentScholarships.mockResolvedValue({ results: [award(2, "2025-2026")], count: 1 });
    renderAt("/scholarships?school_year=2025-2026");

    expect(await screen.findByText("Learner 2")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Revoke scholarship from Learner 2" })).toBeTruthy());
    expect(screen.getByRole("button", { name: /Award Scholarship/ }).disabled).toBe(false);
    expect(screen.queryByText(/is archived/)).toBeNull();
  });
});
