import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PrivateRoute from "./PrivateRoute";

function makeToken(expSecondsFromNow) {
  const payload = { exp: Math.floor(Date.now() / 1000) + expSecondsFromNow };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

function renderProtectedRoute(token) {
  if (token) sessionStorage.setItem("access_token", token);

  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route
          path="/protected"
          element={
            <PrivateRoute>
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
  // NOTE: this only proves the *frontend* gate works — it says nothing about
  // per-role access, since PrivateRoute doesn't check role at all today.
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
});
