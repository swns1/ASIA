import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppLayout from "./AppLayout";
import { SchoolYearProvider } from "../context/SchoolYearContext";

// The school-year default is resolved from the billing API on mount; stub it so
// the shell can render without a backend.
vi.mock("../api/billingApi", () => ({
  getSchoolSettings: () => Promise.resolve({ current_school_year: "2025-2026" }),
}));

function makeToken(expSecondsFromNow = 600) {
  const payload = { exp: Math.floor(Date.now() / 1000) + expSecondsFromNow };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

function renderShell(children = <p>Page content</p>, path = "/students") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SchoolYearProvider>
        <AppLayout>{children}</AppLayout>
      </SchoolYearProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  sessionStorage.setItem("access_token", makeToken());
  sessionStorage.setItem(
    "current_user",
    JSON.stringify({ name: "Ana Reyes", role: "registrar" })
  );
});

describe("AppLayout shell", () => {
  it("renders the sidebar and its page content", () => {
    renderShell();
    expect(screen.getByRole("navigation", { name: /main navigation/i })).not.toBeNull();
    expect(screen.queryByText("Page content")).not.toBeNull();
  });

  it("marks the current route in the nav", () => {
    renderShell();
    const current = screen.getByRole("link", { current: "page" });
    expect(current.textContent).toContain("Students");
  });

  it("hides nav items the user's role can't access", () => {
    // A registrar is not in STAFF_ADMIN, so Users/Audit Trail must not appear.
    renderShell();
    expect(screen.queryByRole("link", { name: /audit trail/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^students$/i })).not.toBeNull();
  });

  it("renders only one sidebar when a page still wraps itself", () => {
    // Guards the migration: pages used to render AppLayout themselves, and a
    // stray wrapper must render through rather than draw a second sidebar.
    renderShell(
      <AppLayout>
        <p>Nested page</p>
      </AppLayout>
    );
    expect(screen.getAllByRole("navigation", { name: /main navigation/i })).toHaveLength(1);
    expect(screen.queryByText("Nested page")).not.toBeNull();
  });
});

describe("AppLayout dark mode", () => {
  // The theme the nearest container gives an element: "dark", or null for
  // light (a light container carries no attribute at all).
  const themeOf = (el) => el.closest("[data-theme]")?.getAttribute("data-theme") ?? null;
  const nav = () => screen.getByRole("navigation", { name: /main navigation/i });

  const signInAs = (role) =>
    sessionStorage.setItem("current_user", JSON.stringify({ name: "Ana Reyes", role }));

  beforeEach(() => {
    localStorage.setItem("asia.dev.theme", "dark");
  });

  // One line per converted page: a path that must turn dark for an admin.
  // A page adds its route here when it joins constants/darkReady.js.
  const DARK_PATHS = [
    "/dashboard",
    "/students",
    "/users",
    "/teacher-advisories",
    "/subjects",
    "/audit-trail",
    "/school-years",
    "/school-years/2025-2026",
    "/grades",
    "/grades/entry",
    "/grades/summary",
    "/grades/observed",
    "/grading-templates",
    "/enrollments",
    "/invoices",
    "/payments",
    "/requirements",
    "/enrollments/12",
    "/students/12",
    "/student-applications",
    "/scholarships",
    "/scholarship-types",
    "/analytics",
    "/school-years/compare",
    "/school-forms",
    "/my-sections",
    "/sections",
    "/academic-calendar",
    "/settings",
  ];

  // Paths that stay light beside the dark sidebar: a converted list page
  // doesn't bring its detail pages along, and nothing off the list goes dark.
  const LIGHT_PATHS = [
    "/students/12/history",
    "/student-applications/7",
    "/a-page-not-converted-yet",
    "/grades/12",
    "/grading-templates/3",
  ];

  it.each(DARK_PATHS)("darkens the sidebar and %s for an admin", (path) => {
    signInAs("admin");
    renderShell(<p>Page content</p>, path);
    expect(themeOf(nav())).toBe("dark");
    expect(themeOf(screen.getByText("Page content"))).toBe("dark");
  });

  it.each(LIGHT_PATHS)("keeps %s light, beside a dark sidebar", (path) => {
    signInAs("super_admin");
    renderShell(<p>Page content</p>, path);
    expect(themeOf(nav())).toBe("dark");
    expect(themeOf(screen.getByText("Page content"))).toBeNull();
  });

  it("stays light for staff, whatever this browser has stored", () => {
    // beforeEach signs in a registrar.
    const { container } = renderShell();
    expect(container.querySelector("[data-theme]")).toBeNull();
  });
});
