/**
 * AcademicCalendarPage on a dark page: the month grid, the side panels and
 * events list, and its four windows (add/edit, delete, event colours, PH
 * holidays). One event type carries a user-chosen colour, which stays on the
 * strip's edge while its label takes token text in dark.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeContext } from "../../hooks/useTheme";

const EVENTS = [
  { event_id: 1, title: "Founders Day", event_type: "event", start_date: "2026-10-12", end_date: "2026-10-14", description: "Program and parade", school_year: "2026-2027" },
  { event_id: 2, title: "Bonifacio Day", event_type: "holiday", start_date: "2026-11-30", end_date: "2026-11-30", description: null, school_year: "2026-2027" },
];

vi.mock("../../api/enrollmentApi", () => ({
  getCalendarEvents: () => Promise.resolve(EVENTS),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}));
vi.mock("../../api/billingApi", () => ({
  getSchoolSettings: () => Promise.resolve({ school_name: "Test School" }),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ currentYear: "2026-2027", options: ["2025-2026", "2026-2027"], yearStates: {} }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

// A user-chosen colour for the "Event" type, read when the page loads.
const USER_COLOR = "#ffd400";
localStorage.setItem("cal_event_colors", JSON.stringify({ event: USER_COLOR }));

const { default: AcademicCalendarPage } = await import("../AcademicCalendarPage");

const renderDark = () => render(
  <ThemeContext.Provider value="dark">
    <div data-theme="dark">
      <MemoryRouter initialEntries={["/academic-calendar"]}>
        <AcademicCalendarPage />
      </MemoryRouter>
    </div>
  </ThemeContext.Provider>,
);

beforeAll(() => {
  // October 2026, so the grid opens on the month holding Founders Day.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 11));
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Ada", role: "admin" }));
});

afterAll(() => {
  vi.useRealTimers();
  localStorage.removeItem("cal_event_colors");
});

// The grid strip that starts an event (it carries the title and the edge).
async function startStrip(title) {
  const titles = await screen.findAllByText(title);
  return titles.map((t) => t.parentElement).find((el) => el.style.borderLeft.includes("solid"));
}

describe("AcademicCalendarPage — dark mode", () => {
  it("shows the grid, the year summary and the events list", async () => {
    renderDark();
    expect(screen.getByRole("heading", { name: "Academic Calendar" })).toBeTruthy();
    expect((await screen.findAllByText("Founders Day")).length).toBeGreaterThan(0);
    expect(screen.getByText("This Year")).toBeTruthy();
    expect(screen.getByText("All Events")).toBeTruthy();
    expect(screen.getAllByText("Bonifacio Day").length).toBeGreaterThan(0);
    expect(screen.getByText("No date selected")).toBeTruthy();
    expect(screen.getByText("Download CSV")).toBeTruthy();
  });

  it("keeps a user-chosen colour on the strip's edge and gives its title token text", async () => {
    renderDark();
    const strip = await startStrip("Founders Day");
    expect(strip).toBeTruthy();
    expect(strip.style.color).toBe("var(--color-neutral-800)");
    expect(strip.getAttribute("style")).toMatch(/2\.5px solid (#ffd400|rgb\(255, 212, 0\))/);
  });

  it("gives a day with events the hover, but not once it's selected, nor today's number", async () => {
    renderDark();
    const strip = await startStrip("Founders Day");
    const cell = strip.closest(".cal-day");
    expect(cell).toBeTruthy();
    const numbers = [...document.querySelectorAll(".cal-day-num")].map((n) => n.textContent);
    expect(numbers).toContain("12");
    expect(numbers).not.toContain("11"); // today: its red circle keeps its look
    fireEvent.click(strip);
    expect(strip.closest(".cal-day")).toBeNull();
  });

  it("opens a day, then the edit and delete windows", async () => {
    renderDark();
    fireEvent.click(await startStrip("Founders Day"));
    expect(await screen.findByText("October 12, 2026")).toBeTruthy();
    fireEvent.click(screen.getAllByTitle("Edit")[0]);
    expect(await screen.findByText("Edit Event")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getAllByTitle("Delete")[0]);
    expect(await screen.findByText("Delete event?")).toBeTruthy();
  });

  it("opens the add window", async () => {
    renderDark();
    await screen.findAllByText("Founders Day");
    fireEvent.click(screen.getByRole("button", { name: /Add Event/ }));
    expect(await screen.findByText("Add New Event")).toBeTruthy();
    expect(screen.getByText("Event Type *")).toBeTruthy();
  });

  it("opens the event colours window", async () => {
    renderDark();
    await screen.findAllByText("Founders Day");
    fireEvent.click(screen.getByRole("button", { name: "Customize event colors" }));
    expect(await screen.findByText("Event Colors")).toBeTruthy();
    expect(screen.getAllByText("Sample event").length).toBeGreaterThan(0);
  });

  it("opens the PH holidays window", async () => {
    renderDark();
    await screen.findAllByText("Founders Day");
    fireEvent.click(screen.getByRole("button", { name: /PH Holidays/ }));
    expect(await screen.findByText("Import PH Holidays")).toBeTruthy();
    expect(screen.getByText("Will be added")).toBeTruthy();
  });
});
