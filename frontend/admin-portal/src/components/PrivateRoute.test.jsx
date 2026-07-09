import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PrivateRoute from "./PrivateRoute";

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
});

describe("PrivateRoute", () => {
  it("renders the protected content when the token is valid", () => {
    renderProtectedRoute(makeToken(60));
    expect(screen.queryByText("Secret content")).not.toBeNull();
  });

  it("redirects to /login when there is no token", () => {
    renderProtectedRoute(null);
    expect(screen.queryByText("Login page")).not.toBeNull();
  });

  it("redirects to /login when the token is expired", () => {
    renderProtectedRoute(makeToken(-60));
    expect(screen.queryByText("Login page")).not.toBeNull();
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
