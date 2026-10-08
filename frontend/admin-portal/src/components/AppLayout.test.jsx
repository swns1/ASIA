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

  it("darkens the sidebar and a converted page for an admin", () => {
    signInAs("admin");
    renderShell();
    expect(themeOf(nav())).toBe("dark");
    expect(themeOf(screen.getByText("Page content"))).toBe("dark");
  });

  it("darkens the dashboard (the admin home) for an admin", () => {
    signInAs("super_admin");
    renderShell(<p>Page content</p>, "/dashboard");
    expect(themeOf(screen.getByText("Page content"))).toBe("dark");
  });

  it("keeps a page that isn't converted yet light, beside a dark sidebar", () => {
    signInAs("admin");
    renderShell(<p>Page content</p>, "/enrollments");
    expect(themeOf(nav())).toBe("dark");
    expect(themeOf(screen.getByText("Page content"))).toBeNull();
  });

  it("leaves a list page's detail pages light", () => {
    signInAs("super_admin");
    renderShell(<p>Page content</p>, "/students/12");
    expect(themeOf(screen.getByText("Page content"))).toBeNull();
  });

  it("stays light for staff, whatever this browser has stored", () => {
    // beforeEach signs in a registrar.
    const { container } = renderShell();
    expect(container.querySelector("[data-theme]")).toBeNull();
  });
});
