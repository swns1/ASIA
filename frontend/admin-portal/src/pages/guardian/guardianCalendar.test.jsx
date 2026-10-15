/**
 * The guardian's School calendar: read-only, month by month, from the
 * guardian endpoint (which leaves out grading periods and staff-only events).
 * It asks for one month's days at a time, so it needs no school year list,
 * and a failed load says so with a retry rather than "nothing this month".
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getGuardianCalendarEvents = vi.fn();
vi.mock("../../api/enrollmentApi", () => ({
  getGuardianCalendarEvents: (...a) => getGuardianCalendarEvents(...a),
}));

const { default: GuardianCalendarPage } = await import("../GuardianCalendarPage");

const OCTOBER = [
  { event_id: 1, title: "Founders Day", event_type: "event", start_date: "2026-10-12", end_date: "2026-10-12", description: "Program and parade", school_year: "2026-2027" },
  { event_id: 2, title: "Quarterly Exams", event_type: "exam", start_date: "2026-10-21", end_date: "2026-10-23", description: null, school_year: "2026-2027" },
];

const renderPage = () => render(<MemoryRouter><GuardianCalendarPage /></MemoryRouter>);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 11));
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  getGuardianCalendarEvents.mockReset();
  getGuardianCalendarEvents.mockResolvedValue({ results: OCTOBER });
});

describe("GuardianCalendarPage", () => {
  it("asks for this month's days only", async () => {
    renderPage();
    await screen.findAllByText("Founders Day");
    expect(getGuardianCalendarEvents).toHaveBeenCalledWith({
      end_date__gte: "2026-10-01", start_date__lte: "2026-10-31", page_size: 500,
    });
  });

  it("shows the month on the grid and as a list, read-only", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeTruthy();
    expect((await screen.findAllByText("Founders Day")).length).toBeGreaterThan(0);
    expect(screen.getByText("Program and parade")).toBeTruthy();
    expect(screen.getByText("Oct 21–23")).toBeTruthy();
    expect(screen.queryByTitle("Edit")).toBeNull();
    expect(screen.queryByRole("button", { name: /Add Event/ })).toBeNull();
  });

  it("moves a month at a time, and back to this month", async () => {
    renderPage();
    await screen.findAllByText("Founders Day");
    getGuardianCalendarEvents.mockResolvedValue({ results: [] });
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();
    await waitFor(() => expect(getGuardianCalendarEvents).toHaveBeenLastCalledWith({
      end_date__gte: "2026-11-01", start_date__lte: "2026-11-30", page_size: 500,
    }));
    expect(await screen.findByText("Nothing on the calendar this month.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "This month" }));
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeTruthy();
  });

  it("narrows the list to a day picked on the grid", async () => {
    renderPage();
    const strips = await screen.findAllByText("Quarterly Exams");
    fireEvent.click(strips[0]);
    expect(await screen.findByRole("heading", { name: "October 21" })).toBeTruthy();
    expect(screen.queryByText("Program and parade")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Whole month" }));
    expect(screen.getByText("Program and parade")).toBeTruthy();
  });

  it("says when the calendar didn't load, with a retry", async () => {
    getGuardianCalendarEvents.mockRejectedValueOnce(new Error("down"));
    renderPage();
    expect(await screen.findByText(/couldn't be loaded/)).toBeTruthy();
    expect(screen.queryByText("Nothing on the calendar this month.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect((await screen.findAllByText("Founders Day")).length).toBeGreaterThan(0);
    expect(within(document.body).queryByText(/couldn't be loaded/)).toBeNull();
  });
});
