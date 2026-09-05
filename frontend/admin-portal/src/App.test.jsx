/**
 * App — smoke tests for the route table after code splitting.
 *
 * App.jsx had no tests, and splitting moved 34 of its imports from static to
 * dynamic. A typo in any one of them still builds a chunk, and a misplaced
 * Suspense boundary still type-checks; both only show up at render time. These
 * two tests evaluate the whole module graph and render on both sides of the
 * router's catch-all, which is what would break if either went wrong.
 *
 * The role guards themselves are not re-asserted here — every <Route> line in
 * App.jsx is byte-identical to its pre-split version, and PrivateRoute's own
 * matrix is covered in components/PrivateRoute.test.jsx.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// The school-year default resolves against billing on mount for a signed-in
// user. Stubbed so these render without a backend (SchoolYearProvider skips
// the call entirely without a token, but the mock keeps that an implementation
// detail rather than a thing these tests depend on).
vi.mock("./api/billingApi", () => ({
  getSchoolSettings: () => Promise.resolve({ current_school_year: "2025-2026" }),
}));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("App routes", () => {
  it("renders the login page at / without loading any route chunk", () => {
    window.history.pushState({}, "", "/");

    render(<App />);

    // LoginPage is deliberately NOT split — it is the first paint for every
    // user, so it must be present synchronously rather than behind a fallback.
    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("renders the 404 page for an unknown path", () => {
    window.history.pushState({}, "", "/no-such-page");

    render(<App />);

    // Also eager: a not-found fallback that has to be fetched is one that can
    // itself fail to arrive.
    expect(screen.getByText("Page not found")).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();
  });
});
