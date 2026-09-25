import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const refreshSession = vi.fn();
vi.mock("../api/apiClient", () => ({ refreshSession: (...a) => refreshSession(...a) }));

const { default: PrivateRoute } = await import("./PrivateRoute");

function makeToken(expSecondsFromNow) {
  const payload = { exp: Math.floor(Date.now() / 1000) + expSecondsFromNow };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

function renderProtectedRoute(token, { allowedRoles, user } = {}) {
  if (token) sessionStorage.setItem("access_token", token);
  if (user) sessionStorage.setItem("current_user", JSON.stringify(user));

  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
        <Route
          path="/protected"
          element={
            <PrivateRoute allowedRoles={allowedRoles}>
              <div>Secret content</div>
            </PrivateRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  refreshSession.mockReset();
  // By default there is no refresh cookie either: the session is gone.
  refreshSession.mockRejectedValue(Object.assign(new Error("no session"), { response: { status: 401 } }));
});

describe("PrivateRoute", () => {
  it("renders the protected content when the token is valid", () => {
    renderProtectedRoute(makeToken(60));
    expect(screen.queryByText("Secret content")).not.toBeNull();
  });

  it("redirects to /login when there is no token and no session to restore", async () => {
    renderProtectedRoute(null);
    expect(await screen.findByText("Login page")).toBeTruthy();
  });

  it("redirects to /login when the token is expired and the session is gone", async () => {
    renderProtectedRoute(makeToken(-60));
    expect(await screen.findByText("Login page")).toBeTruthy();
  });

  it("does not ask for a refresh while the token is still valid", () => {
    renderProtectedRoute(makeToken(60));
    expect(refreshSession).not.toHaveBeenCalled();
  });

  // "Remember me for 1 week": a new tab, or a reopened browser, has no access
  // token in sessionStorage. The refresh cookie still holds the session, and
  // this used to send the user to /login without asking it.
  it("restores the session from the refresh cookie instead of redirecting", async () => {
    refreshSession.mockImplementation(async () => {
      sessionStorage.setItem("access_token", makeToken(60));
      sessionStorage.setItem("current_user", JSON.stringify({ role: "registrar" }));
      return "token";
    });

    renderProtectedRoute(null, { allowedRoles: ["registrar"] });

    expect(await screen.findByText("Secret content")).toBeTruthy();
    expect(screen.queryByText("Login page")).toBeNull();
  });

  it("restores an expired session the same way", async () => {
    refreshSession.mockImplementation(async () => {
      sessionStorage.setItem("access_token", makeToken(60));
      return "token";
    });

    renderProtectedRoute(makeToken(-60));

    expect(await screen.findByText("Secret content")).toBeTruthy();
  });

  it("renders the protected content when the user's role is allowed", () => {
    renderProtectedRoute(makeToken(60), {
      allowedRoles: ["admin", "registrar"],
      user: { role: "registrar" },
    });
    expect(screen.queryByText("Secret content")).not.toBeNull();
  });

  it("redirects to /dashboard when the user's role is not allowed", () => {
    renderProtectedRoute(makeToken(60), {
      allowedRoles: ["admin", "accounting"],
      user: { role: "teacher" },
    });
    expect(screen.queryByText("Dashboard page")).not.toBeNull();
  });
});
