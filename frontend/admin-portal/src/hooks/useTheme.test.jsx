import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { setThemePreference, useAppTheme, useThemePreference } from "./useTheme";

const signInAs = (role) =>
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Ana Reyes", role }));

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

describe("the developer switch", () => {
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
    expect(localStorage.getItem("asia.dev.theme")).toBeNull();
  });

  it("clears the status band's old switch", () => {
    localStorage.setItem("asia.dev.statusBandTone", "dark");
    setThemePreference("dark");
    expect(localStorage.getItem("asia.dev.statusBandTone")).toBeNull();
  });
});

describe("the theme the signed-in user gets", () => {
  it("is dark for an admin who chose dark", () => {
    setThemePreference("dark");
    const { result } = renderHook(() => useAppTheme());
    expect(result.current).toBe("dark");
  });

  it("stays light for staff, whatever the browser has stored", () => {
    signInAs("registrar");
    setThemePreference("dark");
    const { result } = renderHook(() => useAppTheme());
    expect(result.current).toBe("light");
  });

  it("follows the computer when set to Same as my computer", () => {
    setThemePreference("system");
    computerIsDark(true);
    expect(renderHook(() => useAppTheme()).result.current).toBe("dark");
    computerIsDark(false);
    expect(renderHook(() => useAppTheme()).result.current).toBe("light");
  });

  it("is always light in a production build", () => {
    setThemePreference("dark");
    vi.stubEnv("DEV", false);
    const { result } = renderHook(() => useAppTheme());
    expect(result.current).toBe("light");
  });
});
