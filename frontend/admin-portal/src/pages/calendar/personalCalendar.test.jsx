/**
 * Everyone's own events on the Academic Calendar.
 *
 * Each staff member keeps private events beside the school's, behind the
 * "My events" toggle. Only an admin or the registrar changes the school's
 * events (the server refuses everyone else, so the page no longer offers
 * teachers and accounting buttons that could only fail); everyone adds,
 * edits and deletes their own. A school event can be kept from guardians;
 * a grading period always is. Print and CSV are the school's calendar alone.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const SCHOOL = [
  { event_id: 1, title: "Founders Day", event_type: "event", start_date: "2026-10-12", end_date: "2026-10-12", description: null, school_year: "2026-2027", visible_to_guardians: true },
  { event_id: 2, title: "Faculty meeting", event_type: "other", start_date: "2026-10-20", end_date: "2026-10-20", description: null, school_year: "2026-2027", visible_to_guardians: false },
];
// The same event_id as a school event: the grid must still tell them apart.
const MINE = [
  { event_id: 1, title: "Dentist", start_date: "2026-10-15", end_date: "2026-10-15", description: null },
];

const api = vi.hoisted(() => ({
  createCalendarEvent: vi.fn(() => Promise.resolve({})),
  createPersonalEvent: vi.fn(() => Promise.resolve({})),
  deletePersonalEvent: vi.fn(() => Promise.resolve()),
  deleteCalendarEvent: vi.fn(() => Promise.resolve()),
  getPersonalEvents: vi.fn(),
}));

vi.mock("../../api/enrollmentApi", () => ({
  getCalendarEvents: () => Promise.resolve(SCHOOL),
  createCalendarEvent: api.createCalendarEvent,
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: api.deleteCalendarEvent,
  getPersonalEvents: api.getPersonalEvents,
  createPersonalEvent: api.createPersonalEvent,
  updatePersonalEvent: vi.fn(),
  deletePersonalEvent: api.deletePersonalEvent,
}));
vi.mock("../../api/billingApi", () => ({
  getSchoolSettings: () => Promise.resolve({ school_name: "Test School" }),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ currentYear: "2026-2027", options: ["2026-2027"], yearStates: {} }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: AcademicCalendarPage } = await import("../AcademicCalendarPage");

function renderAs(role, id = 7) {
  sessionStorage.setItem("current_user", JSON.stringify({ id, name: "Ada", role }));
  return render(
    <MemoryRouter initialEntries={["/academic-calendar"]}>
      <AcademicCalendarPage />
    </MemoryRouter>,
  );
}

// The All Events list's row for a title.
async function listRow(title) {
  const list = await screen.findByRole("region", { name: "All events" });
  return (await within(list).findByText(title)).closest("div[style*='border-bottom']");
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 11));
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.getPersonalEvents.mockResolvedValue(MINE);
});

describe("My events", () => {
  it("asks for your own events over the school year's days", async () => {
    renderAs("teacher");
    await screen.findAllByText("Dentist");
    expect(api.getPersonalEvents).toHaveBeenCalledWith({
      end_date__gte: "2026-07-01", start_date__lte: "2027-06-30", page_size: 500,
    });
  });

  it("shows your events beside the school's, marked as yours alone", async () => {
    renderAs("teacher");
    expect((await screen.findAllByText("Dentist")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Founders Day").length).toBeGreaterThan(0);
    expect(screen.getByText(/1 of yours/)).toBeTruthy();
    fireEvent.click(screen.getAllByText("Dentist")[0]);
    expect(await screen.findByText("Only you")).toBeTruthy();
  });

  it("hides them with the toggle, and remembers that per person", async () => {
    const { unmount } = renderAs("teacher", 7);
    await screen.findAllByText("Dentist");
    fireEvent.click(screen.getByRole("checkbox", { name: /My events/ }));
    await waitFor(() => expect(screen.queryAllByText("Dentist")).toHaveLength(0));
    unmount();

    const again = renderAs("teacher", 7);
    await screen.findAllByText("Founders Day");
    expect(screen.queryAllByText("Dentist")).toHaveLength(0);
    again.unmount();

    // Someone else on this browser still sees theirs.
    renderAs("accounting", 8);
    expect((await screen.findAllByText("Dentist")).length).toBeGreaterThan(0);
  });

  it("leaves your events out of the printed calendar", async () => {
    renderAs("admin");
    await screen.findAllByText("Dentist");
    const print = document.getElementById("cal-print-portal");
    expect(within(print).getAllByText("Founders Day").length).toBeGreaterThan(0);
    expect(within(print).queryByText("Dentist")).toBeNull();
  });
});

describe("a teacher or accounting", () => {
  it.each(["teacher", "accounting"])("%s changes only their own events", async (role) => {
    renderAs(role);
    expect(await listRow("Dentist")).toBeTruthy();
    expect(within(await listRow("Dentist")).getByTitle("Edit")).toBeTruthy();
    expect(within(await listRow("Founders Day")).queryByTitle("Edit")).toBeNull();
    expect(screen.queryByRole("button", { name: /PH Holidays/ })).toBeNull();
  });

  it("adds to their own calendar, with no school fields", async () => {
    renderAs("teacher");
    await screen.findAllByText("Dentist");
    fireEvent.click(screen.getByRole("button", { name: /Add Event/ }));
    expect(await screen.findByText("Add My Event")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Add to" })).toBeNull();
    expect(screen.queryByText("Event Type *")).toBeNull();
    expect(screen.queryByText("Show on the guardian portal")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("e.g. Dentist appointment"), { target: { value: "Parent visit" } });
    const [start, end] = document.querySelectorAll("input[type=date]");
    fireEvent.change(start, { target: { value: "2026-10-22" } });
    fireEvent.change(end, { target: { value: "2026-10-22" } });
    // The window's own Add Event, after the header's.
    fireEvent.click(screen.getAllByRole("button", { name: /Add Event/ }).at(-1));

    await waitFor(() => expect(api.createPersonalEvent).toHaveBeenCalledWith({
      title: "Parent visit", start_date: "2026-10-22", end_date: "2026-10-22", description: null,
    }));
    expect(api.createCalendarEvent).not.toHaveBeenCalled();
  });

  it("deletes their own event through the personal calendar", async () => {
    renderAs("teacher");
    fireEvent.click(within(await listRow("Dentist")).getByTitle("Delete"));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(api.deletePersonalEvent).toHaveBeenCalledWith(1));
    expect(api.deleteCalendarEvent).not.toHaveBeenCalled();
  });
});

describe("an admin or the registrar", () => {
  it("changes school events and their own", async () => {
    renderAs("registrar");
    expect(within(await listRow("Founders Day")).getByTitle("Edit")).toBeTruthy();
    expect(within(await listRow("Dentist")).getByTitle("Edit")).toBeTruthy();
    expect(screen.getByRole("button", { name: /PH Holidays/ })).toBeTruthy();
  });

  it("marks a school event kept from guardians", async () => {
    renderAs("admin");
    fireEvent.click((await screen.findAllByText("Faculty meeting"))[0]);
    expect(await screen.findByText("Staff only")).toBeTruthy();
  });

  it("chooses which calendar a new event goes on", async () => {
    renderAs("admin");
    await screen.findAllByText("Dentist");
    fireEvent.click(screen.getByRole("button", { name: /Add Event/ }));
    expect(await screen.findByText("Add New Event")).toBeTruthy();
    const choice = screen.getByRole("group", { name: "Add to" });
    expect(screen.getByText("Event Type *")).toBeTruthy();
    expect(screen.getByText("Show on the guardian portal")).toBeTruthy();

    fireEvent.click(within(choice).getByRole("button", { name: /Just me/ }));
    expect(screen.getByText("Add My Event")).toBeTruthy();
    expect(screen.queryByText("Event Type *")).toBeNull();
    expect(screen.queryByText("Show on the guardian portal")).toBeNull();
  });

  it("sends whether guardians see a school event", async () => {
    renderAs("admin");
    await screen.findAllByText("Dentist");
    fireEvent.click(screen.getByRole("button", { name: /Add Event/ }));
    await screen.findByText("Add New Event");
    fireEvent.change(screen.getByPlaceholderText("e.g. Independence Day"), { target: { value: "Teachers' planning day" } });
    fireEvent.click(screen.getByRole("button", { name: "Event" }));
    const [start, end] = document.querySelectorAll("input[type=date]");
    fireEvent.change(start, { target: { value: "2026-10-23" } });
    fireEvent.change(end, { target: { value: "2026-10-23" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Show on the guardian portal/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /Add Event/ }).at(-1));

    await waitFor(() => expect(api.createCalendarEvent).toHaveBeenCalled());
    expect(api.createCalendarEvent.mock.calls[0][0]).toMatchObject({
      title: "Teachers' planning day", school_year: "2026-2027", visible_to_guardians: false,
    });
  });

  it("keeps a grading period from guardians", async () => {
    renderAs("admin");
    await screen.findAllByText("Dentist");
    fireEvent.click(screen.getByRole("button", { name: /Add Event/ }));
    await screen.findByText("Add New Event");
    fireEvent.click(screen.getByRole("button", { name: /Grading Period/ }));
    expect(screen.getByText(/Grading periods are for staff only/)).toBeTruthy();
    expect(screen.queryByText("Show on the guardian portal")).toBeNull();
  });

  it("offers only their own calendar in an archived year", async () => {
    vi.resetModules();
    vi.doMock("../../hooks/useArchivedYears", () => ({ default: () => () => true }));
    const { default: ArchivedPage } = await import("../AcademicCalendarPage");
    sessionStorage.setItem("current_user", JSON.stringify({ id: 7, name: "Ada", role: "admin" }));
    render(<MemoryRouter><ArchivedPage /></MemoryRouter>);
    await screen.findAllByText("Dentist");
    expect(screen.queryByRole("button", { name: /PH Holidays/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Add Event/ }));
    expect(await screen.findByText("Add My Event")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Add to" })).toBeNull();
    vi.doUnmock("../../hooks/useArchivedYears");
  });
});
