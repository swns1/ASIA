/**
 * ScholarshipsPage — the awards list's school year.
 *
 * The list used to be scoped to the sidebar's year with no year control on the
 * page. It now has the same picker as every other list page, and the Award
 * Scholarship form searches the year the list is showing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
  }),
}));

const { default: ScholarshipsPage } = await import("../ScholarshipsPage");

function renderPage() {
  return render(
    <MemoryRouter>
      <ScholarshipsPage />
    </MemoryRouter>,
  );
}

const lastAwardsYear = () => api.getEnrollmentScholarships.mock.lastCall[0].school_year;

async function pickYear(label) {
  fireEvent.click(screen.getByRole("button", { name: /^school year:/i }));
  fireEvent.click(screen.getByRole("option", { name: new RegExp(label, "i") }));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getScholarshipTypes.mockResolvedValue([]);
  api.getEnrollmentScholarships.mockResolvedValue({ results: [], count: 0 });
  api.getEnrollmentScholarshipSummary.mockResolvedValue({});
  api.getEnrollments.mockResolvedValue({ results: [] });
});

describe("ScholarshipsPage — awards year", () => {
  it("opens on the current school year", async () => {
    renderPage();
    await waitFor(() => expect(api.getEnrollmentScholarships).toHaveBeenCalled());
    expect(lastAwardsYear()).toBe("2026-2027");
    expect(screen.getByRole("button", { name: "School year: 2026-2027" })).toBeTruthy();
  });

  it("shows every year when All years is picked, and Clear goes back", async () => {
    renderPage();
    await waitFor(() => expect(api.getEnrollmentScholarships).toHaveBeenCalled());

    await pickYear("all years");
    await waitFor(() => expect(lastAwardsYear()).toBeUndefined());

    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await waitFor(() => expect(lastAwardsYear()).toBe("2026-2027"));
  });

  it("keeps the picked year across a tab switch", async () => {
    renderPage();
    await waitFor(() => expect(api.getEnrollmentScholarships).toHaveBeenCalled());
    await pickYear("2025-2026");
    await waitFor(() => expect(lastAwardsYear()).toBe("2025-2026"));

    fireEvent.click(screen.getByRole("tab", { name: /grade-based eligibility/i }));
    fireEvent.click(await screen.findByRole("tab", { name: /manual awards/i }));

    expect(await screen.findByRole("button", { name: "School year: 2025-2026" })).toBeTruthy();
    expect(lastAwardsYear()).toBe("2025-2026");
  });

  it("searches the listed year when awarding a scholarship", async () => {
    renderPage();
    await waitFor(() => expect(api.getEnrollmentScholarships).toHaveBeenCalled());
    await pickYear("2025-2026");

    fireEvent.click(screen.getByRole("button", { name: /award scholarship/i }));
    fireEvent.change(await screen.findByPlaceholderText(/search student by name or lrn/i), {
      target: { value: "Reyes" },
    });

    await waitFor(() =>
      expect(api.getEnrollments).toHaveBeenCalledWith(
        expect.objectContaining({ search: "Reyes", school_year: "2025-2026" }),
      ),
    );
  });
});
