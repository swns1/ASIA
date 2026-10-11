/**
 * ScholarshipsPage on a dark page: the awards list and its revoke confirm,
 * the Award Scholarship window (the student search, its drop-down and the
 * chosen learner), and the eligibility scan with its Apply window, through
 * to the results (awarded, not awarded, already invoiced). The dark-only
 * branches never run in a light render.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeContext } from "../../hooks/useTheme";

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
    currentYear: "2026-2027", options: ["2026-2027"], yearCounts: {}, yearStates: {},
  }),
}));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: ScholarshipsPage } = await import("../ScholarshipsPage");

const TYPES = [
  { scholarship_type_id: 1, scholarship_code: "ESC", scholarship_name: "Education Service Contracting", discount_mode: "fixed_amount", discount_value: "14000.00", is_active: true },
];
const AWARD = {
  enrollment_scholarship_id: 50, enrollment_id: 9, approved_at: "2026-08-03T00:00:00Z", notes: "Top of the class",
  scholarship_type_detail: TYPES[0],
  enrollment_detail: { student_name: "Ana Cruz", school_year: "2026-2027", grade_level: "Grade 7", section: "Rizal" },
};
const enrollment = (id, name) => ({
  enrollment_id: id, student: id, student_name: name, lrn: `10${id}`,
  school_year: "2026-2027", grade_level: "Grade 5", section: "Mabini",
});

function renderDark() {
  return render(
    <ThemeContext.Provider value="dark">
      <div data-theme="dark">
        <MemoryRouter initialEntries={["/scholarships"]}>
          <ScholarshipsPage />
        </MemoryRouter>
      </div>
    </ThemeContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getScholarshipTypes.mockResolvedValue(TYPES);
  api.getEnrollmentScholarships.mockResolvedValue({ results: [AWARD], count: 1 });
  api.getEnrollmentScholarshipSummary.mockResolvedValue({ 1: 1, total: 1 });
  api.getEnrollments.mockResolvedValue({ results: [enrollment(3, "Ben Uy"), enrollment(4, "Cara Lim")], next: null });
  api.getGrades.mockResolvedValue([{ numeric_grade: "97.00" }]);
});

describe("Scholarships — dark mode", { timeout: 20_000 }, () => {
  it("shows the awards list and the revoke confirm", async () => {
    renderDark();
    expect(await screen.findByText("Ana Cruz")).toBeTruthy();
    expect(screen.getByText("Top of the class")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Revoke scholarship from Ana Cruz" }));
    expect(await screen.findByText("Revoke Scholarship?")).toBeTruthy();
  });

  it("opens the award window: the search, its matches, the chosen learner and an error", async () => {
    renderDark();
    await screen.findByText("Ana Cruz");
    fireEvent.click(screen.getByRole("button", { name: /Award Scholarship/ }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getByPlaceholderText(/Search student by name or LRN/), { target: { value: "Uy" } });
    fireEvent.click(await within(dialog).findByText("Uy, Ben"));
    expect(await within(dialog).findByText("LRN 103")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Change" })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: /^Award Scholarship$/ }));
    expect(await within(dialog).findByText("Please select a scholarship type.")).toBeTruthy();
  });

  it("scans for eligible learners and awards them, showing every kind of result", async () => {
    api.createEnrollmentScholarship
      .mockResolvedValueOnce({ invoice_to_reissue: "INV-0007" })
      .mockRejectedValueOnce(new Error("already holds one"));
    renderDark();
    fireEvent.click(screen.getByRole("tab", { name: /Grade-Based Eligibility/ }));
    await screen.findByRole("button", { name: /^Period:/ }, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /Scan Now/ }));
    expect(await screen.findByText("Ben Uy")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Award Scholarship to All/ }));
    const dialog = await screen.findByRole("dialog");
    // The roster: one row per learner, each with its average.
    expect(within(dialog).getByText("Cara Lim")).toBeTruthy();
    expect(within(dialog).getAllByText("97.00")).toHaveLength(2);

    fireEvent.click(within(dialog).getByRole("button", { name: /Award to All/ }));
    expect(await within(dialog).findByText("Please select a scholarship type.")).toBeTruthy();

    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Award to All/ }));
    expect(await within(dialog).findByText(/1 scholarship awarded successfully/)).toBeTruthy();
    expect(within(dialog).getByText(/1 not awarded/)).toBeTruthy();
    expect(within(dialog).getByText(/Ben Uy — INV-0007/)).toBeTruthy();
  });
});
