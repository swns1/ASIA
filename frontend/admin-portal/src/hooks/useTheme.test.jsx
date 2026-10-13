import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { setThemePreference, useAppTheme, useThemePreference } from "./useTheme";

const signInAs = (role, id) =>
  sessionStorage.setItem("current_user", JSON.stringify({ id, name: "Ana Reyes", role }));

// jsdom has no matchMedia; stand in for the computer's light/dark setting.
const computerIsDark = (matches) => {
  window.matchMedia = vi.fn((media) => ({
    matches,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  signInAs("admin");
});

afterEach(() => {
  delete window.matchMedia;
  vi.unstubAllEnvs();
});

describe("the theme switch", () => {
  it("is light until someone picks otherwise", () => {
    const { result } = renderHook(() => useThemePreference());
    expect(result.current).toBe("light");
  });

  it("keeps Dark and Same as my computer, and forgets Light", () => {
    const { result } = renderHook(() => useThemePreference());
    act(() => setThemePreference("dark"));
    expect(result.current).toBe("dark");
    act(() => setThemePreference("system"));
    expect(result.current).toBe("system");
    act(() => setThemePreference("light"));
    expect(result.current).toBe("light");
    expect(localStorage.getItem("asia.theme")).toBeNull();
  });

  it("keeps each person's own choice on a shared computer", () => {
    signInAs("teacher", 7);
    setThemePreference("dark");
    signInAs("registrar", 8);
    expect(renderHook(() => useThemePreference()).result.current).toBe("light");
    signInAs("teacher", 7);
    expect(renderHook(() => useThemePreference()).result.current).toBe("dark");
    expect(localStorage.getItem("asia.theme.7")).toBe("dark");
  });

  it("clears the switches it replaced", () => {
    localStorage.setItem("asia.dev.theme", "dark");
    localStorage.setItem("asia.dev.statusBandTone", "dark");
    setThemePreference("dark");
    expect(localStorage.getItem("asia.dev.theme")).toBeNull();
    expect(localStorage.getItem("asia.dev.statusBandTone")).toBeNull();
  });
});

describe("the theme the signed-in user gets", () => {
  it("is dark for an admin who chose dark", () => {
    setThemePreference("dark");
    const { result } = renderHook(() => useAppTheme());
    expect(result.current).toBe("dark");
  });

  // Every staff role gets its choice (the user's call, 2026-10-11).
  it.each(["registrar", "teacher", "accounting"])("is dark for a %s who chose dark", (role) => {
    signInAs(role);
    setThemePreference("dark");
    const { result } = renderHook(() => useAppTheme());
    expect(result.current).toBe("dark");
  });

  // Guardians choose on the portal's My settings (2026-10-13).
  it("is dark for a guardian who chose dark", () => {
    signInAs("guardian");
    setThemePreference("dark");
    const { result } = renderHook(() => useAppTheme());
    expect(result.current).toBe("dark");
  });

  it("stays light when no one is signed in", () => {
    setThemePreference("dark");
    sessionStorage.clear();
    const { result } = renderHook(() => useAppTheme());
    expect(result.current).toBe("light");
  });

  it("is dark for a super admin who chose dark", () => {
    signInAs("super_admin");
    setThemePreference("dark");
    const { result } = renderHook(() => useAppTheme());
    expect(result.current).toBe("dark");
  });

  it("follows the computer when set to Same as my computer", () => {
    setThemePreference("system");
    computerIsDark(true);
    expect(renderHook(() => useAppTheme()).result.current).toBe("dark");
    computerIsDark(false);
    expect(renderHook(() => useAppTheme()).result.current).toBe("light");
  });

  it("works in a production build too", () => {
    setThemePreference("dark");
    vi.stubEnv("DEV", false);
    const { result } = renderHook(() => useAppTheme());
    expect(result.current).toBe("dark");
  });
});
