/**
 * Identity screens: signing in, changing your own password, and the Users page.
 *
 * Regressions from the 2026-09-25 QA pass:
 * - The login page said "check your credentials" when the server was simply
 *   unreachable, and a locked-out account looked exactly like a wrong password
 *   with no hint that waiting (or an admin reset) would fix it.
 * - "Remember me" was ticked by default; now that it really keeps a browser
 *   signed in for a week, that default is wrong for shared school computers.
 * - Only admins could change their own password -- the one screen for it was
 *   the admin-only Users page.
 * - Changing your own password silently ended your session: "Profile updated."
 *   and then the login page at the next click.
 * - A plain admin was offered edit/delete on super admin accounts and the
 *   "Super Admin" role, then met a 403; and anyone was offered their own role.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = {
  login: vi.fn(),
  getUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);
vi.mock("../../api/identityApi", () => ({
  login: pass("login"),
  getUsers: pass("getUsers"),
  createUser: pass("createUser"),
  updateUser: pass("updateUser"),
  deleteUser: pass("deleteUser"),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
globalThis.fetch = fetchMock;

const { default: LoginPage } = await import("../LoginPage");
const { default: UsersPage } = await import("../UsersPage");
const { default: AccountSettingsModal } = await import("../../components/AccountSettingsModal");
const { default: useCurrentUser } = await import("../../hooks/useCurrentUser");
const { setCurrentUser } = await import("../../utils/auth");

function signInAs(user) {
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify(user));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

// ── Login ────────────────────────────────────────────────────────────────────

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function submitLogin() {
  fireEvent.change(screen.getByLabelText(/Email or full name/), { target: { value: "ana@school.ph" } });
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "secret-pass" } });
  fireEvent.click(screen.getByRole("button", { name: /Sign in to your account/ }));
}

describe("LoginPage", () => {
  it("leaves 'Remember me' off by default", () => {
    renderLogin();
    expect(screen.getByLabelText(/Remember me/).checked).toBe(false);
  });

  it("says the server is unreachable instead of blaming the password", async () => {
    api.login.mockRejectedValue(new Error("Network Error")); // no response at all
    renderLogin();
    await submitLogin();

    expect(await screen.findByText(/Can't reach the server/)).toBeTruthy();
    expect(screen.queryByText(/check your credentials/i)).toBeNull();
  });

  it("explains the lockout under a wrong-credentials error", async () => {
    api.login.mockRejectedValue({ response: { status: 400, data: { detail: "Invalid identifier or password." } } });
    renderLogin();
    await submitLogin();

    expect(await screen.findByText("Invalid identifier or password.")).toBeTruthy();
    expect(screen.getByText(/After 5 wrong tries, sign-in pauses for an hour/)).toBeTruthy();
  });

  it("names a rate limit as one", async () => {
    api.login.mockRejectedValue({ response: { status: 429, data: { detail: "Request was throttled." } } });
    renderLogin();
    await submitLogin();

    expect(await screen.findByText(/Too many sign-in attempts/)).toBeTruthy();
  });

  it("sends the Remember me choice to the server", async () => {
    api.login.mockResolvedValue({ access: "t", user: { id: 1, role: "registrar", name: "Ana" } });
    renderLogin();
    fireEvent.click(screen.getByLabelText(/Remember me/));
    await submitLogin();

    await waitFor(() => expect(api.login).toHaveBeenCalledWith(expect.objectContaining({ rememberMe: true })));
  });
});

// ── Changing your own password ───────────────────────────────────────────────

function renderAccountModal(user = { id: 7, name: "Teacher Ana", email: "ana@school.ph", role: "teacher" }) {
  signInAs(user);
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={["/teacher"]}>
      <Routes>
        <Route path="/teacher" element={<AccountSettingsModal user={user} onClose={onClose} />} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return { onClose };
}

function fillPasswords({ current = "old-pass-123", next = "New-Pass-456!", confirm = next } = {}) {
  fireEvent.change(screen.getByLabelText(/Current password/), { target: { value: current } });
  fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: next } });
  fireEvent.change(screen.getByLabelText(/Confirm new password/), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: /^Change password$/ }));
}

describe("AccountSettingsModal", () => {
  it("changes the password with the current one, then asks for a fresh sign-in", async () => {
    api.updateUser.mockResolvedValue({ user_id: 7 });
    renderAccountModal();
    fillPasswords();

    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith(7, {
      current_password: "old-pass-123", new_password: "New-Pass-456!",
    }));
    expect(await screen.findByText("Login page")).toBeTruthy();
    expect(sessionStorage.getItem("access_token")).toBeNull();
  });

  it("does not submit mismatched passwords", async () => {
    renderAccountModal();
    fillPasswords({ confirm: "something-else" });

    expect(await screen.findByText(/doesn't match/)).toBeTruthy();
    expect(api.updateUser).not.toHaveBeenCalled();
  });

  it("shows the server's reason and stays open", async () => {
    api.updateUser.mockRejectedValue({ response: { status: 400, data: { detail: "Current password is incorrect." } } });
    renderAccountModal();
    fillPasswords();

    expect(await screen.findByText("Current password is incorrect.")).toBeTruthy();
    expect(screen.queryByText("Login page")).toBeNull();
  });
});

// ── Users page ───────────────────────────────────────────────────────────────

const SUPER = { user_id: 1, name: "Sam Super", email: "sam@school.ph", role: "super_admin", profile_picture: null };
const ADMIN = { user_id: 2, name: "Ada Admin", email: "ada@school.ph", role: "admin", profile_picture: null };
const TEACHER = { user_id: 3, name: "Tina Teacher", email: "tina@school.ph", role: "teacher", profile_picture: null };

function page(results, extra = {}) {
  return {
    count: results.length, next: null, previous: null, results,
    counts: { total: 3, by_role: { super_admin: 1, admin: 1, teacher: 1 }, inactive: 0 },
    ...extra,
  };
}

function renderUsers(me, rows = [SUPER, ADMIN, TEACHER]) {
  signInAs(me);
  api.getUsers.mockResolvedValue(page(rows));
  return render(
    <MemoryRouter initialEntries={["/users"]}>
      <Routes>
        <Route path="/users" element={<UsersPage />} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("UsersPage", () => {
  it("does not offer a plain admin the super admin's edit or delete", async () => {
    renderUsers({ id: 2, name: "Ada Admin", email: "ada@school.ph", role: "admin" });
    await screen.findByText("Sam Super");

    expect(screen.queryByRole("button", { name: "Edit Sam Super" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deactivate Sam Super" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit Tina Teacher" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deactivate Tina Teacher" })).toBeTruthy();
  });

  it("still lets a super admin edit other admins", async () => {
    renderUsers({ id: 1, name: "Sam Super", email: "sam@school.ph", role: "super_admin" });
    await screen.findByText("Ada Admin");

    expect(screen.getByRole("button", { name: "Edit Ada Admin" })).toBeTruthy();
  });

  it("does not offer the Super Admin role to a plain admin", async () => {
    renderUsers({ id: 2, name: "Ada Admin", email: "ada@school.ph", role: "admin" });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Tina Teacher" }));

    const dialog = await screen.findByRole("dialog");
    const roles = within(dialog).getByRole("group", { name: /Select a role/ });
    expect(within(roles).queryByText(/Super Admin/)).toBeNull();
    expect(within(roles).getByText(/Registrar/)).toBeTruthy();
  });

  it("hides the role picker on your own profile", async () => {
    renderUsers({ id: 2, name: "Ada Admin", email: "ada@school.ph", role: "admin" });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Ada Admin" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("group", { name: /Select a role/ })).toBeNull();
  });

  it("sends you to sign in again after changing your own password", async () => {
    api.updateUser.mockResolvedValue(ADMIN);
    renderUsers({ id: 2, name: "Ada Admin", email: "ada@school.ph", role: "admin" });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Ada Admin" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Change password/ }));
    fireEvent.change(within(dialog).getByLabelText(/Current password/), { target: { value: "old-pass-123" } });
    fireEvent.change(within(dialog).getByLabelText(/^New password/), { target: { value: "New-Pass-456!" } });
    fireEvent.change(within(dialog).getByLabelText(/Confirm new password/), { target: { value: "New-Pass-456!" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Save changes/ }));

    expect(await screen.findByText("Login page")).toBeTruthy();
  });

  it("updates the stored user after editing your own name", async () => {
    api.updateUser.mockResolvedValue({ ...ADMIN, name: "Ada Renamed" });
    renderUsers({ id: 2, name: "Ada Admin", email: "ada@school.ph", role: "admin" });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Ada Admin" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Full name/), { target: { value: "Ada Renamed" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(JSON.parse(sessionStorage.getItem("current_user")).name).toBe("Ada Renamed"));
  });
});

describe("UsersPage — one page at a time, from the server", () => {
  it("asks the server for a page, not the whole list", async () => {
    renderUsers({ id: 2, name: "Ada Admin", email: "ada@school.ph", role: "admin" });
    await screen.findByText("Tina Teacher");

    expect(api.getUsers).toHaveBeenLastCalledWith({ page: 1 });
  });

  it("draws the stat cards from the server's counts", async () => {
    signInAs({ id: 2, name: "Ada Admin", email: "ada@school.ph", role: "admin" });
    api.getUsers.mockResolvedValue(page([TEACHER], {
      counts: { total: 480, by_role: { admin: 2, teacher: 40, guardian: 438 }, inactive: 5 },
    }));
    render(<MemoryRouter><UsersPage /></MemoryRouter>);

    expect(await screen.findByText("480 accounts, 5 deactivated")).toBeTruthy();
  });

  it("filters by a role group on the server", async () => {
    renderUsers({ id: 2, name: "Ada Admin", email: "ada@school.ph", role: "admin" });
    await screen.findByText("Tina Teacher");

    fireEvent.click(screen.getByText("Staff").closest("button"));

    await waitFor(() => expect(api.getUsers).toHaveBeenLastCalledWith({
      page: 1, role: "registrar,teacher,accounting",
    }));
  });

  it("searches on the server once typing pauses", async () => {
    renderUsers({ id: 2, name: "Ada Admin", email: "ada@school.ph", role: "admin" });
    await screen.findByText("Tina Teacher");

    fireEvent.change(screen.getByLabelText(/Search users/), { target: { value: "tina" } });

    await waitFor(() => expect(api.getUsers).toHaveBeenLastCalledWith({ page: 1, search: "tina" }));
  });
});

describe("UsersPage — deactivating instead of deleting", () => {
  it("deactivates an account rather than deleting it", async () => {
    api.updateUser.mockResolvedValue({ ...TEACHER, is_active: false });
    renderUsers({ id: 2, name: "Ada Admin", email: "ada@school.ph", role: "admin" });

    fireEvent.click(await screen.findByRole("button", { name: "Deactivate Tina Teacher" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/give it a new adviser on Teacher Advisories/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));

    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith(3, { is_active: false }));
    expect(api.deleteUser).not.toHaveBeenCalled();
  });

  it("marks a deactivated account and offers to reactivate it", async () => {
    api.updateUser.mockResolvedValue({ ...TEACHER, is_active: true });
    renderUsers({ id: 2, name: "Ada Admin", email: "ada@school.ph", role: "admin" },
      [SUPER, ADMIN, { ...TEACHER, is_active: false }]);

    expect(await screen.findByText("Deactivated", { selector: "span" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reactivate Tina Teacher" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reactivate" }));

    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith(3, { is_active: true }));
  });

  it("offers no way to deactivate yourself", async () => {
    renderUsers({ id: 2, name: "Ada Admin", email: "ada@school.ph", role: "admin" });
    await screen.findByText("Tina Teacher");

    expect(screen.queryByRole("button", { name: "Deactivate Ada Admin" })).toBeNull();
  });
});

// ── Live current user ────────────────────────────────────────────────────────

describe("useCurrentUser", () => {
  it("re-renders when the stored user changes", () => {
    signInAs({ id: 2, name: "Before", role: "admin" });
    const { result } = renderHook(() => useCurrentUser());
    expect(result.current.name).toBe("Before");

    act(() => setCurrentUser({ id: 2, name: "After", role: "admin" }));

    expect(result.current.name).toBe("After");
  });
});
