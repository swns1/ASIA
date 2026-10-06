/**
 * StudentsPage — the year behind "Not enrolled".
 *
 * The filter used to take whatever year the sidebar selector was set to: the
 * page never said which, and changing the sidebar didn't reload the list. It
 * then got a "Not enrolled" chip with its own year picker beside the search
 * box. Now both are one Enrollment menu, where each year is its own choice
 * ("Not enrolled for 2025-2026"), so the pill always names the year it checks.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getStudents = vi.fn();
let schoolYearCtx;

vi.mock("../../api/studentApi", () => ({
  getStudents: (...a) => getStudents(...a),
  deleteStudent: vi.fn(),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => schoolYearCtx,
}));

const { default: StudentsPage } = await import("../StudentsPage");

function page() {
  return (
    <MemoryRouter initialEntries={["/students"]}>
      <StudentsPage />
    </MemoryRouter>
  );
}

function ctx(currentYear, options = ["2026-2027", "2025-2026", "2024-2025"]) {
  return { currentYear, options, yearCounts: {} };
}

const enrollmentMenu = () => screen.getByRole("button", { name: /^enrollment:/i });
const menuItems = () => screen.getAllByRole("menuitemradio");
const pick = (label) => {
  fireEvent.click(enrollmentMenu());
  fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
};
// Whole class names: the resting pill carries `hover:border-brand-500`.
const looksApplied = () => enrollmentMenu().className.split(/\s+/).includes("border-brand-500");
const lastUnenrolled = () => getStudents.mock.lastCall[0].unenrolled;
// The empty state only shows once a request has come back, so waiting for it
// keeps every state update inside the test.
const settled = () => screen.findByText(/^No students (yet|match these filters)$/);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("access_token", "token");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Ana Reyes", role: "registrar" }));
  schoolYearCtx = ctx("2026-2027");
  getStudents.mockResolvedValue({ results: [], count: 0, next: null, previous: null });
});

describe("StudentsPage — Not enrolled", () => {
  it("offers each year as its own choice, the current year first, and never All years", async () => {
    schoolYearCtx = ctx("2026-2027", ["2027-2028", "2026-2027", "2025-2026"]);
    render(page());
    await settled();
    expect(enrollmentMenu().getAttribute("aria-label")).toBe("Enrollment: Any");
    expect(looksApplied()).toBe(false);

    fireEvent.click(enrollmentMenu());

    expect(menuItems().map((i) => i.textContent)).toEqual([
      "Any enrollment",
      "Not enrolled for 2026-2027",
      "Not enrolled for 2027-2028",
      "Not enrolled for 2025-2026",
    ]);
    expect(screen.getByRole("menuitemradio", { name: "Any enrollment" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("menuitemradio", { name: /all years/i })).toBeNull();
  });

  it("lists who isn't enrolled for the year picked, and the pill names that year", async () => {
    render(page());
    await settled();
    expect(lastUnenrolled()).toBeUndefined();

    pick("Not enrolled for 2025-2026");

    await waitFor(() => expect(lastUnenrolled()).toBe("2025-2026"));
    await settled();
    expect(enrollmentMenu().getAttribute("aria-label")).toBe("Enrollment: Not enrolled for 2025-2026");
    expect(looksApplied()).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("also turns it on for the year it already defaults to", async () => {
    render(page());
    await settled();

    pick("Not enrolled for 2026-2027");

    await waitFor(() => expect(lastUnenrolled()).toBe("2026-2027"));
    await settled();
    expect(looksApplied()).toBe(true);
  });

  it("reloads when a different year is picked while it's on", async () => {
    render(page());
    await settled();
    pick("Not enrolled for 2026-2027");
    await waitFor(() => expect(lastUnenrolled()).toBe("2026-2027"));
    await settled();

    pick("Not enrolled for 2024-2025");

    await waitFor(() => expect(lastUnenrolled()).toBe("2024-2025"));
    await settled();
    expect(enrollmentMenu().getAttribute("aria-label")).toBe("Enrollment: Not enrolled for 2024-2025");
  });

  it("goes back to everyone on Any enrollment", async () => {
    render(page());
    await settled();
    pick("Not enrolled for 2025-2026");
    await waitFor(() => expect(lastUnenrolled()).toBe("2025-2026"));
    await settled();

    pick("Any enrollment");

    await waitFor(() => expect(lastUnenrolled()).toBeUndefined());
    await settled();
    expect(enrollmentMenu().getAttribute("aria-label")).toBe("Enrollment: Any");
    expect(looksApplied()).toBe(false);
  });

  it("clears back to no filter", async () => {
    render(page());
    await settled();
    pick("Not enrolled for 2025-2026");
    await waitFor(() => expect(lastUnenrolled()).toBe("2025-2026"));
    await settled();

    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));

    await waitFor(() => expect(lastUnenrolled()).toBeUndefined());
    await settled();
    expect(enrollmentMenu().getAttribute("aria-label")).toBe("Enrollment: Any");
    expect(looksApplied()).toBe(false);
    fireEvent.click(enrollmentMenu());
    expect(screen.getByRole("menuitemradio", { name: "Any enrollment" }).getAttribute("aria-checked")).toBe("true");
  });
});
