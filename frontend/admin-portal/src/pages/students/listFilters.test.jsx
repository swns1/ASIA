/**
 * StudentsPage — the status band, search as you type, the Sex menu and Clear.
 *
 * Status was set from two places (five stat tiles and a row of chips), search
 * ran only on Enter or a Search button, and Sex was a labelled chip row that
 * also held "Recents" and "Not enrolled". The band's legend is now the one
 * status control, the box searches once typing pauses, and Sex is a menu.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getStudents = vi.fn();

vi.mock("../../api/studentApi", () => ({
  getStudents: (...a) => getStudents(...a),
  deleteStudent: vi.fn(),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ currentYear: "2026-2027", options: ["2026-2027", "2025-2026"], yearCounts: {} }),
}));

const { default: StudentsPage } = await import("../StudentsPage");

// What the band's count requests get back, by status ("" is everyone).
const COUNTS = { "": 10, active: 6, inactive: 1, transferred: 1, graduated: 1, dropped: 1 };

function page() {
  return (
    <MemoryRouter initialEntries={["/students"]}>
      <StudentsPage />
    </MemoryRouter>
  );
}

// The list request is the one with a page size; the band's are not.
const lastList = () => getStudents.mock.calls.map(([p]) => p).filter((p) => p.page_size).at(-1);
const listCallCount = () => getStudents.mock.calls.filter(([p]) => p.page_size).length;
const settled = () => screen.findByText(/^No students (yet|match these filters)$/);
const legend = () => within(screen.getByRole("group", { name: "Filter by status" }));
const searchBox = () => screen.getByRole("searchbox", { name: /search students/i });
const sexMenu = () => screen.getByRole("button", { name: /^sex:/i });

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("access_token", "token");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Ana Reyes", role: "registrar" }));
  getStudents.mockImplementation(async (p) => ({
    results: [],
    count: p.page_size ? 0 : COUNTS[p.status],
    next: null,
    previous: null,
  }));
});

describe("StudentsPage — status band", () => {
  it("shows the total and each status's count", async () => {
    render(page());
    await settled();

    expect(await legend().findByRole("button", { name: "Active 6" })).toBeTruthy();
    expect(legend().getByRole("button", { name: "All 10" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("students registered").previousSibling.textContent).toBe("10");
  });

  it("filters by a status from its legend button, and goes back to all on a second click", async () => {
    render(page());
    await settled();
    const active = await legend().findByRole("button", { name: "Active 6" });

    fireEvent.click(active);

    await waitFor(() => expect(lastList().status).toBe("active"));
    await settled();
    expect(active.getAttribute("aria-pressed")).toBe("true");
    expect(legend().getByRole("button", { name: "All 10" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("heading", { name: "Active students" })).toBeTruthy();

    fireEvent.click(active);

    await waitFor(() => expect(lastList().status).toBe(""));
    await settled();
    expect(active.getAttribute("aria-pressed")).toBe("false");
    expect(legend().getByRole("button", { name: "All 10" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "All students" })).toBeTruthy();
  });
});

describe("StudentsPage — search as you type", () => {
  it("searches 300ms after typing stops", async () => {
    render(page());
    await settled();
    const before = listCallCount();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.change(searchBox(), { target: { value: "cr" } });
      act(() => vi.advanceTimersByTime(200));
      // Another keystroke restarts the wait.
      fireEvent.change(searchBox(), { target: { value: "cruz" } });
      act(() => vi.advanceTimersByTime(299));
      expect(listCallCount()).toBe(before);

      act(() => vi.advanceTimersByTime(1));
      expect(listCallCount()).toBe(before + 1);
      expect(lastList()).toMatchObject({ page: 1, search: "cruz" });
    } finally {
      vi.useRealTimers();
    }
    await settled();
  });

  it("searches on Enter without waiting, and only once", async () => {
    render(page());
    await settled();
    const before = listCallCount();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.change(searchBox(), { target: { value: "cruz" } });
      fireEvent.keyDown(searchBox(), { key: "Enter" });
      expect(lastList()).toMatchObject({ page: 1, search: "cruz" });

      act(() => vi.advanceTimersByTime(1000));
      expect(listCallCount()).toBe(before + 1);
    } finally {
      vi.useRealTimers();
    }
    await settled();
  });
});

describe("StudentsPage — Sex menu", () => {
  it("filters by the sex picked and shows it on the pill", async () => {
    render(page());
    await settled();
    expect(sexMenu().getAttribute("aria-label")).toBe("Sex: All");

    fireEvent.click(sexMenu());
    fireEvent.click(within(screen.getByRole("menu", { name: "Sex" })).getByRole("menuitemradio", { name: "Female" }));

    await waitFor(() => expect(lastList().sex).toBe("female"));
    await settled();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(sexMenu().getAttribute("aria-label")).toBe("Sex: Female");
    expect(sexMenu().getAttribute("aria-expanded")).toBe("false");
  });

  it("works from the keyboard, and closes on Escape or a click outside", async () => {
    render(page());
    await settled();

    fireEvent.keyDown(sexMenu(), { key: "ArrowDown" });
    const items = screen.getAllByRole("menuitemradio");
    // Opens on the selected option.
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document.activeElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(document.activeElement, { key: "ArrowUp" });
    fireEvent.keyDown(document.activeElement, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[2]); // wraps
    fireEvent.keyDown(document.activeElement, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(sexMenu());

    fireEvent.click(sexMenu());
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("StudentsPage — Clear", () => {
  it("resets search, status, sex, enrollment and sort", async () => {
    render(page());
    await settled();
    expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
    expect(screen.getByText("Newest registered first")).toBeTruthy();

    fireEvent.click(await legend().findByRole("button", { name: "Active 6" }));
    fireEvent.click(sexMenu());
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Female" }));
    fireEvent.click(screen.getByRole("button", { name: /^enrollment:/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Not enrolled for 2025-2026" }));
    fireEvent.change(searchBox(), { target: { value: "cruz" } });
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Student" }));
    await waitFor(() =>
      expect(lastList()).toMatchObject({
        search: "cruz", status: "active", sex: "female", ordering: "last_name", unenrolled: "2025-2026",
      }),
    );
    await settled();
    expect(screen.getByText("Sorted by last name, A to Z")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));

    await waitFor(() =>
      expect(lastList()).toMatchObject({
        page: 1, search: "", status: "", sex: "", ordering: "-student_id", unenrolled: undefined,
      }),
    );
    await settled();
    expect(searchBox().value).toBe("");
    expect(legend().getByRole("button", { name: "All 10" }).getAttribute("aria-pressed")).toBe("true");
    expect(sexMenu().getAttribute("aria-label")).toBe("Sex: All");
    expect(screen.getByRole("button", { name: /^enrollment:/i }).getAttribute("aria-label")).toBe("Enrollment: Any");
    expect(screen.getByText("Newest registered first")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
  });
});
