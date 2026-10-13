import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ThemeContext } from "../hooks/useTheme";
import MySettingsPage from "./MySettingsPage";

// Each staff member's own page: their theme, their password, and logging out.

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem(
    "current_user",
    JSON.stringify({ id: 4, name: "Lea Tan", email: "lea@school.ph", role: "teacher" }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderPage = (theme = "light") =>
  render(
    <ThemeContext.Provider value={theme}>
      <div data-theme={theme === "dark" ? "dark" : undefined}>
        <MemoryRouter initialEntries={["/my-settings"]}>
          <MySettingsPage />
        </MemoryRouter>
      </div>
    </ThemeContext.Provider>,
  );

const themes = () => within(screen.getByRole("radiogroup", { name: "Theme" }));
const option = (name) => themes().getByRole("radio", { name: new RegExp(`^${name}`) });

describe("My Settings", () => {
  it("offers Light, Dark and Auto, with Light chosen until the person picks", () => {
    renderPage();
    expect(themes().getAllByRole("radio").map((r) => r.value)).toEqual(["light", "dark", "system"]);
    expect(option("Light").checked).toBe(true);
    expect(option("Auto").closest("label").textContent).toContain("Matches your computer's light or dark setting.");
  });

  it("keeps the person's own choice", () => {
    renderPage();
    fireEvent.click(option("Dark"));
    expect(option("Dark").checked).toBe(true);
    expect(option("Light").checked).toBe(false);
    expect(localStorage.getItem("asia.theme.4")).toBe("dark");

    fireEvent.click(option("Auto"));
    expect(localStorage.getItem("asia.theme.4")).toBe("system");

    fireEvent.click(option("Light"));
    expect(localStorage.getItem("asia.theme.4")).toBeNull();
  });

  it("shows a returning person the choice they made", () => {
    localStorage.setItem("asia.theme.4", "system");
    renderPage("dark");
    expect(option("Auto").checked).toBe(true);
    // The chosen card takes dark's lit selection.
    expect(option("Auto").closest("label").className).toContain("dark:bg-[linear-gradient(135deg,rgba(224,49,49,0.38),rgba(224,49,49,0.12))]");
  });

  it("says that print pages stay light", () => {
    renderPage();
    expect(screen.getByText(/Print pages and report cards stay light/)).toBeTruthy();
  });

  it("says who is signed in, and changes their password", () => {
    renderPage();
    expect(screen.getByText("Lea Tan")).toBeTruthy();
    expect(screen.getByText("lea@school.ph · Teacher Portal")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByRole("dialog", { name: "Change password" })).toBeTruthy();
  });

  describe("logging out", () => {
    // clearAuthSession() posts a logout audit first; there's no backend here.
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
      sessionStorage.setItem("access_token", "header.payload.signature");
    });

    const renderWithLogin = () =>
      render(
        <MemoryRouter initialEntries={["/my-settings"]}>
          <Routes>
            <Route path="/my-settings" element={<MySettingsPage />} />
            <Route path="/" element={<p>Login page</p>} />
          </Routes>
        </MemoryRouter>,
      );

    it("asks first, and keeps the session when the person stays", () => {
      renderWithLogin();
      fireEvent.click(screen.getByRole("button", { name: "Log out" }));
      expect(screen.getByRole("dialog", { name: "Log out?" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Stay" }));
      expect(sessionStorage.getItem("access_token")).not.toBeNull();
      expect(screen.queryByText("Login page")).toBeNull();
    });

    it("ends the session and goes to the login page once confirmed", () => {
      renderWithLogin();
      fireEvent.click(screen.getByRole("button", { name: "Log out" }));
      fireEvent.click(screen.getByRole("button", { name: /yes, log out/i }));
      expect(sessionStorage.getItem("access_token")).toBeNull();
      expect(sessionStorage.getItem("current_user")).toBeNull();
      expect(screen.getByText("Login page")).toBeTruthy();
    });
  });
});
