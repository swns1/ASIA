/**
 * StudentsPage — the year behind "Not enrolled".
 *
 * The filter used to take whatever year the sidebar selector was set to: the
 * page never said which, and changing the sidebar didn't reload the list. It
 * now has its own "Not enrolled for" picker, always shown so the page says
 * which year the filter means, and only styled as applied while it is on.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
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

function ctx(currentYear) {
  return { currentYear, options: ["2026-2027", "2025-2026", "2024-2025"], yearCounts: {} };
}

const notEnrolledChip = () =>
  within(screen.getByRole("group", { name: /no enrollment for/i })).getByRole("button", { name: /not enrolled/i });
const yearPicker = () => screen.getByRole("button", { name: /not enrolled for/i });
const pickYear = (year) => {
  fireEvent.click(yearPicker());
  fireEvent.click(screen.getByRole("option", { name: new RegExp(year) }));
};
// Whole class names: the neutral pill carries `hover:border-brand-500`.
const looksApplied = () => yearPicker().className.split(/\s+/).includes("border-brand-500");
const lastUnenrolled = () => getStudents.mock.lastCall[0].unenrolled;
// The header reads "Loading records…" while a request is out; waiting for
// the count to come back keeps every state update inside the test.
const settled = () => screen.findByText("0 students registered");

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("access_token", "token");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Ana Reyes", role: "registrar" }));
  schoolYearCtx = ctx("2026-2027");
  getStudents.mockResolvedValue({ results: [], count: 0, next: null, previous: null });
});

describe("StudentsPage — Not enrolled", () => {
  it("always says which year it checks, and only looks applied while it's on", async () => {
    render(page());
    await settled();
    expect(yearPicker().getAttribute("aria-label")).toBe("Not enrolled for: 2026-2027");
    expect(looksApplied()).toBe(false);
    expect(lastUnenrolled()).toBeUndefined();

    fireEvent.click(notEnrolledChip());

    await waitFor(() => expect(lastUnenrolled()).toBe("2026-2027"));
    await settled();
    expect(looksApplied()).toBe(true);
  });

  it("reloads for a year picked in its picker", async () => {
    render(page());
    await settled();
    fireEvent.click(notEnrolledChip());
    await waitFor(() => expect(lastUnenrolled()).toBe("2026-2027"));

    pickYear("2025-2026");

    await waitFor(() => expect(lastUnenrolled()).toBe("2025-2026"));
    await settled();
    expect(yearPicker().getAttribute("aria-label")).toBe("Not enrolled for: 2025-2026");
  });

  it("turns the filter on when a year is picked while it's off", async () => {
    render(page());
    await settled();

    pickYear("2025-2026");

    await waitFor(() => expect(lastUnenrolled()).toBe("2025-2026"));
    await settled();
    expect(notEnrolledChip().getAttribute("aria-pressed")).toBe("true");
    expect(looksApplied()).toBe(true);
  });

  it("also turns it on when the year picked is the one already shown", async () => {
    render(page());
    await settled();

    pickYear("2026-2027");

    await waitFor(() => expect(lastUnenrolled()).toBe("2026-2027"));
    await settled();
    expect(notEnrolledChip().getAttribute("aria-pressed")).toBe("true");
  });

  it("offers one specific year, never All years", async () => {
    render(page());
    await settled();
    fireEvent.click(yearPicker());

    expect(screen.queryByRole("option", { name: /all years/i })).toBeNull();
  });

  it("reloads when the current year arrives from School Settings", async () => {
    const { rerender } = render(page());
    await settled();
    fireEvent.click(notEnrolledChip());
    await waitFor(() => expect(lastUnenrolled()).toBe("2026-2027"));

    schoolYearCtx = ctx("2025-2026");
    rerender(page());

    await waitFor(() => expect(lastUnenrolled()).toBe("2025-2026"));
    await settled();
  });

  it("clears back to no filter, with the picker still showing the current year", async () => {
    render(page());
    await settled();
    pickYear("2025-2026");
    await waitFor(() => expect(lastUnenrolled()).toBe("2025-2026"));
    await settled();

    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await waitFor(() => expect(lastUnenrolled()).toBeUndefined());
    await settled();
    expect(yearPicker().getAttribute("aria-label")).toBe("Not enrolled for: 2026-2027");
    expect(looksApplied()).toBe(false);
    expect(notEnrolledChip().getAttribute("aria-pressed")).toBe("false");
  });
});
