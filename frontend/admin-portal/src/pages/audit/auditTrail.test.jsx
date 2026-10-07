/**
 * AuditTrailPage — laid out like the other list pages.
 *
 * The band is how the records in view went (success, failed…) and its legend
 * is the status filter. Its counts come from /audit-logs/facets/ for the role,
 * module and time picked in the menus, never the status or the search.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const fetchAuditLogs = vi.fn();
const fetchAuditFacets = vi.fn();
vi.mock("../../api/auditTrailApi", () => ({
  fetchAuditLogs: (...a) => fetchAuditLogs(...a),
  fetchAuditFacets: (...a) => fetchAuditFacets(...a),
}));

const { default: AuditTrailPage } = await import("../AuditTrailPage");

const LOG = {
  id: 1, user_name: "Maria Santos", user_role: "teacher", action: "Saved grade", module: "Grades",
  occurred_at: "2026-10-07T01:30:00Z", status: "success", details: "Grade saved.",
};

const legend = () => within(screen.getByRole("group", { name: "Filter by status" }));
const lastList = () => fetchAuditLogs.mock.lastCall[0];
const lastFacets = () => fetchAuditFacets.mock.lastCall[0];
const pick = (label, item) => {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}:`) }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: item }));
};
const renderPage = () => render(<MemoryRouter><AuditTrailPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify({ id: 1, name: "Ada", role: "admin" }));
  fetchAuditLogs.mockResolvedValue({ results: [LOG], count: 1 });
  fetchAuditFacets.mockResolvedValue({
    roles: ["admin", "teacher"], modules: ["Grades", "Students"],
    statusCounts: { success: 1180, failed: 24, total: 1204 },
  });
});

describe("Audit trail — band", () => {
  it("counts how the records went, and filters by it", async () => {
    renderPage();
    await screen.findByText("Maria Santos");

    expect(await legend().findByRole("button", { name: "All 1,204" })).toBeTruthy();
    expect(legend().getByRole("button", { name: "Pending 0" })).toBeTruthy();
    fireEvent.click(legend().getByRole("button", { name: "Failed 24" }));

    await waitFor(() => expect(lastList()).toMatchObject({ status: "failed", page: 1 }));
    expect(lastFacets().status).toBeUndefined();
    expect(screen.getByRole("heading", { name: "Failed records" })).toBeTruthy();
  });

  it("counts what the role and module menus narrowed to", async () => {
    renderPage();
    await screen.findByText("Maria Santos");

    pick("Role", "Teacher");
    await waitFor(() => expect(lastFacets()).toEqual({ role: "teacher" }));
    pick("Module", "Grades");
    await waitFor(() => expect(lastFacets()).toEqual({ role: "teacher", module: "Grades" }));
    expect(lastList()).toMatchObject({ role: "teacher", module: "Grades" });
    expect(await screen.findByText("records · Teacher · Grades")).toBeTruthy();
  });

  it("searches as you type, leaving the band alone", async () => {
    renderPage();
    await screen.findByText("Maria Santos");
    await waitFor(() => expect(fetchAuditFacets).toHaveBeenCalledTimes(1));

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.change(screen.getByRole("searchbox", { name: /search audit records/i }), { target: { value: "grade" } });
      act(() => vi.advanceTimersByTime(300));
      await act(async () => {});
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(lastList()).toMatchObject({ search: "grade", page: 1 }));
    expect(fetchAuditFacets).toHaveBeenCalledTimes(1);
  });

  it("narrows to a day from the When menu, band included", async () => {
    renderPage();
    await screen.findByText("Maria Santos");

    fireEvent.click(screen.getByRole("button", { name: /^When:/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "When" })).getByRole("button", { name: "Today" }));

    await waitFor(() => expect(lastFacets().date).toBeTruthy());
    expect(lastList().date).toBe(lastFacets().date);
    expect(screen.getByRole("button", { name: "When: Today" })).toBeTruthy();
  });

  it("says the list failed, with a retry", async () => {
    fetchAuditLogs.mockRejectedValue(new Error("Failed to load log records."));
    renderPage();
    expect(await screen.findByRole("button", { name: /try again|retry/i })).toBeTruthy();
  });
});
