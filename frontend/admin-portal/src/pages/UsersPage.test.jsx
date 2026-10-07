/**
 * UsersPage — deactivating staff who have left instead of deleting them: the
 * list opens on active accounts, an inactive one is badged and can be
 * reactivated, and deactivating a teacher first shows the sections they
 * still advise from this year on.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const getUsers = vi.fn();
const updateUser = vi.fn();
const getSectionAdvisories = vi.fn();

vi.mock("../api/identityApi", () => ({
  getUsers: (...a) => getUsers(...a),
  updateUser: (...a) => updateUser(...a),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock("../api/enrollmentApi", () => ({ getSectionAdvisories: (...a) => getSectionAdvisories(...a) }));
vi.mock("../context/SchoolYearContext", () => ({ useSchoolYear: () => ({ currentYear: "2026-2027" }) }));
vi.mock("../utils/auth", async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUser: () => ({ id: 1, name: "Carla Mendoza", role: "admin" }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: UsersPage } = await import("./UsersPage");

const USERS = [
  { user_id: 1, name: "Carla Mendoza", email: "carla@example.edu", role: "admin",   is_active: true },
  { user_id: 5, name: "Maria Santos",  email: "maria@example.edu", role: "teacher", is_active: true },
  { user_id: 7, name: "Ana Lim",       email: "ana@example.edu",   role: "teacher", is_active: false },
];

const renderPage = () => render(<MemoryRouter><UsersPage /></MemoryRouter>);
const rowOf = (name) => screen.getByText(name).closest("tr");

// The list endpoint pages and filters on the server; this stands in for it,
// with an account store that updateUser writes to.
let accounts;
function serveUsers(params) {
  const rows = accounts.filter((u) =>
    !params.status || (params.status === "active") === u.is_active);
  const byRole = {};
  const inactiveByRole = {};
  accounts.forEach((u) => {
    byRole[u.role] = (byRole[u.role] ?? 0) + 1;
    if (!u.is_active) inactiveByRole[u.role] = (inactiveByRole[u.role] ?? 0) + 1;
  });
  return Promise.resolve({
    count: rows.length, next: null, previous: null, results: rows,
    counts: {
      total: accounts.length, by_role: byRole,
      inactive: accounts.filter((u) => !u.is_active).length,
      inactive_by_role: inactiveByRole,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  accounts = USERS.map((u) => ({ ...u }));
  getUsers.mockImplementation(serveUsers);
  updateUser.mockImplementation((id, patch) => {
    accounts = accounts.map((u) => (u.user_id === id ? { ...u, ...patch } : u));
    return Promise.resolve(accounts.find((u) => u.user_id === id));
  });
});

describe("UsersPage — active status", () => {
  it("opens on active accounts and counts only them", async () => {
    renderPage();
    expect(await screen.findByText("Maria Santos")).toBeTruthy();
    expect(screen.queryByText("Ana Lim")).toBeNull();
    // The band counts the active accounts, by role.
    const legend = within(screen.getByRole("group", { name: "Filter by role" }));
    expect(legend.getByRole("button", { name: "All 2" })).toBeTruthy();
    expect(legend.getByRole("button", { name: "Teacher 1" })).toBeTruthy();
    expect(screen.getByText("active accounts")).toBeTruthy();
  });

  it("shows inactive accounts on request, badged, and reactivates one", async () => {
    renderPage();
    await screen.findByText("Maria Santos");
    fireEvent.click(screen.getByRole("button", { name: /^Status:/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Inactive" }));

    // Filtered on the server, so the inactive list arrives with the next page.
    await screen.findByText("Ana Lim");
    const row = rowOf("Ana Lim");
    expect(within(row).getByText("Inactive")).toBeTruthy();
    expect(screen.queryByText("Maria Santos")).toBeNull();
    expect(within(row).queryByRole("button", { name: "Deactivate Ana Lim" })).toBeNull();

    fireEvent.click(within(row).getByRole("button", { name: "Reactivate Ana Lim" }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(7, { is_active: true }));
    // Now active, so it leaves the Inactive view.
    expect(await screen.findByText("No inactive accounts")).toBeTruthy();
  });

  it("lists a teacher's advisories from this year on before deactivating", async () => {
    getSectionAdvisories.mockResolvedValue({
      results: [
        { advisory_id: 1, school_year: "2025-2026", grade_level: "Grade 2", section: "Luna", strand: null },
        { advisory_id: 2, school_year: "2026-2027", grade_level: "Grade 3", section: "Rizal", strand: null },
      ],
    });
    renderPage();
    await screen.findByText("Maria Santos");

    fireEvent.click(within(rowOf("Maria Santos")).getByRole("button", { name: "Deactivate Maria Santos" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("S.Y. 2026-2027 · Grade 3 Rizal")).toBeTruthy();
    // A past year's advisory is history, not something to reassign.
    expect(within(dialog).queryByText(/2025-2026/)).toBeNull();
    expect(getSectionAdvisories).toHaveBeenCalledWith({ teacher_user_id: 5, page_size: 100 });

    fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate account" }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(5, { is_active: false }));
    await waitFor(() => expect(screen.queryByText("Maria Santos")).toBeNull());
    expect(within(screen.getByRole("group", { name: "Filter by role" })).getByRole("button", { name: "All 1" })).toBeTruthy();
    expect(screen.getByText("active account")).toBeTruthy();
  });

  it("offers no deactivate button on your own account", async () => {
    renderPage();
    const row = await screen.findByText("Carla Mendoza").then((el) => el.closest("tr"));
    expect(within(row).queryByRole("button", { name: /Deactivate/ })).toBeNull();
  });
});
