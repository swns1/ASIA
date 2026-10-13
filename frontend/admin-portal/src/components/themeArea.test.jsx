import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import toast from "react-hot-toast";
import ThemeArea from "./ThemeArea";
import AppToaster from "./AppToaster";
import SessionTimeoutWarning from "./SessionTimeoutWarning";
import useTheme, { setThemePreference } from "../hooks/useTheme";
import { toastOptions } from "../utils/toastConfig";

// What floats over a page or stands in for the shell takes the theme of the
// page it belongs to: dark only for someone who chose dark (staff or a
// guardian), and only on a route listed in constants/darkReady.js.

const CONVERTED = "/students";
const NOT_CONVERTED = "/a-page-not-converted-yet";

const themeOf = (el) => el.closest("[data-theme]")?.getAttribute("data-theme") ?? null;
const signInAs = (role) =>
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Ana Reyes", role }));

function makeToken(expSecondsFromNow) {
  const payload = { exp: Math.floor(Date.now() / 1000) + expSecondsFromNow };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

function Probe() {
  return <p>theme: {useTheme()}</p>;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  setThemePreference("dark");
});

describe("ThemeArea (the full-page forms)", () => {
  const renderAt = (path) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeArea className="min-h-screen bg-neutral-50">
          <Probe />
        </ThemeArea>
      </MemoryRouter>
    );

  it("goes dark on a converted route for an admin", () => {
    signInAs("admin");
    renderAt(CONVERTED);
    expect(themeOf(screen.getByText(/theme:/))).toBe("dark");
    expect(screen.getByText("theme: dark")).not.toBeNull();
  });

  it("stays light on a route not converted yet", () => {
    signInAs("super_admin");
    renderAt(NOT_CONVERTED);
    expect(themeOf(screen.getByText(/theme:/))).toBeNull();
    expect(screen.getByText("theme: light")).not.toBeNull();
  });

  it("goes dark for any staff member who chose dark", () => {
    signInAs("registrar");
    renderAt(CONVERTED);
    expect(themeOf(screen.getByText(/theme:/))).toBe("dark");
  });

  // The guardian portal is wrapped in ThemeArea too (GuardianLayout).
  it("goes dark in the guardian portal for a guardian who chose dark", () => {
    signInAs("guardian");
    renderAt("/guardian");
    expect(themeOf(screen.getByText(/theme:/))).toBe("dark");
  });

  it("keeps the page's own root classes", () => {
    signInAs("registrar");
    const { container } = renderAt(CONVERTED);
    expect(container.firstChild.className).toContain("min-h-screen bg-neutral-50");
  });
});

describe("Toasts follow the page under them", () => {
  // react-hot-toast asks matchMedia about reduced motion; jsdom has none.
  beforeEach(() => {
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => {
    act(() => toast.remove());
    delete window.matchMedia;
  });

  const renderToaster = (path) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppToaster />
      </MemoryRouter>
    );

  it("draws a toast dark over a converted page", async () => {
    signInAs("admin");
    renderToaster(CONVERTED);
    act(() => {
      toast.success("Saved");
    });
    expect(themeOf(await screen.findByText("Saved"))).toBe("dark");
  });

  it("keeps a toast light over a page not converted yet", async () => {
    signInAs("admin");
    renderToaster(NOT_CONVERTED);
    act(() => {
      toast.error("Couldn't save");
    });
    expect(themeOf(await screen.findByText("Couldn't save"))).toBeNull();
  });

  it("reads only --toast-* variables, each set in both themes", () => {
    // A toast is styled inline, so a hard-coded colour would stay light in
    // dark mode; a variable missing from one theme would render unset.
    const css = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");
    const darkAt = css.indexOf('[data-theme="dark"] {');
    const light = css.slice(0, darkAt);
    const dark = css.slice(darkAt, css.indexOf("}", darkAt));
    const used = new Set(JSON.stringify(toastOptions).match(/--toast-[a-z-]+/g));
    expect(used.size).toBeGreaterThan(0);
    expect(JSON.stringify(toastOptions)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    for (const name of used) {
      expect(light, `${name} has no light value`).toContain(`${name}:`);
      expect(dark, `${name} has no dark value`).toContain(`${name}:`);
    }
  });
});

describe("The session warning follows the page under it", () => {
  const renderWarning = (path) => {
    // Expiring inside the five-minute window, so the warning shows at once.
    sessionStorage.setItem("access_token", makeToken(60));
    return render(
      <MemoryRouter initialEntries={[path]}>
        <SessionTimeoutWarning />
      </MemoryRouter>
    );
  };

  it("is dark over a converted page for an admin", async () => {
    signInAs("admin");
    renderWarning(CONVERTED);
    expect((await screen.findByRole("alert")).getAttribute("data-theme")).toBe("dark");
  });

  it("is dark for any staff member who chose dark", async () => {
    signInAs("registrar");
    renderWarning(CONVERTED);
    expect((await screen.findByRole("alert")).getAttribute("data-theme")).toBe("dark");
  });

  it("is dark over the guardian portal for a guardian who chose dark", async () => {
    signInAs("guardian");
    renderWarning("/guardian/child/12");
    expect((await screen.findByRole("alert")).getAttribute("data-theme")).toBe("dark");
  });
});
