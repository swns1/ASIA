/**
 * Guardian portal shell: the account button, My settings, and the theme.
 *
 * The top bar used to hold two icon-only buttons, Change password and Log out.
 * Both moved to the portal's My settings (pages/GuardianSettingsPage), the
 * same shared cards as staff My Settings; the bar keeps one account button
 * that opens it.
 *
 * Log out still asks first: there is no undo (the session is cleared locally
 * and a logout is posted to identity). These assert on sessionStorage rather
 * than on a mocked clearAuthSession, because "the session is still alive
 * until the parent confirms" is the property that actually matters here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import GuardianLayout from "./GuardianLayout";
import GuardianSettingsPage from "../pages/GuardianSettingsPage";

// clearAuthSession() posts a logout audit before clearing storage. There is no
// backend here and the call is already fire-and-forget, so stub it away.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
  sessionStorage.clear();
  localStorage.clear();
  sessionStorage.setItem("access_token", "header.payload.signature");
  sessionStorage.setItem(
    "current_user",
    JSON.stringify({ id: 31, name: "Rosa Valdez", email: "rosa@example.com", role: "guardian" })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>Login page</p>} />
        <Route
          path="/guardian/settings"
          element={<GuardianLayout><GuardianSettingsPage /></GuardianLayout>}
        />
        <Route path="*" element={<GuardianLayout><p>Child records</p></GuardianLayout>} />
      </Routes>
    </MemoryRouter>
  );
}

const themeOf = (el) => el.closest("[data-theme]")?.getAttribute("data-theme") ?? null;
const accountLink = () => screen.getByRole("link", { name: /My settings for Rosa Valdez/ });
const stillSignedIn = () => sessionStorage.getItem("access_token") !== null;

describe("the top bar", () => {
  it("has one account button, to My settings, and no logout or password buttons", () => {
    renderAt("/guardian");
    expect(accountLink().getAttribute("href")).toBe("/guardian/settings");
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change password" })).toBeNull();
  });

  it("marks the account button as the current page on My settings", () => {
    renderAt("/guardian/settings");
    expect(accountLink().getAttribute("aria-current")).toBe("page");
  });
});

describe("the guardian's theme", () => {
  it("is light until they choose", () => {
    renderAt("/guardian");
    expect(themeOf(screen.getByText("Child records"))).toBeNull();
  });

  it("turns the whole portal dark from My settings, and light again", () => {
    renderAt("/guardian/settings");

    fireEvent.click(screen.getByRole("radio", { name: /^Dark/ }));
    expect(themeOf(accountLink())).toBe("dark");
    expect(themeOf(screen.getByRole("radiogroup", { name: "Theme" }))).toBe("dark");

    fireEvent.click(screen.getByRole("radio", { name: /^Light/ }));
    expect(themeOf(accountLink())).toBeNull();
  });

  it("is kept under the guardian's own account", () => {
    renderAt("/guardian/settings");
    fireEvent.click(screen.getByRole("radio", { name: /^Dark/ }));
    expect(localStorage.getItem("asia.theme.31")).toBe("dark");
  });
});

describe("logging out from My settings", () => {
  const trigger = () => screen.getByRole("button", { name: "Log out" });

  it("asks before logging out instead of doing it on the first click", () => {
    renderAt("/guardian/settings");
    expect(screen.queryByText("Log out?")).toBeNull();

    fireEvent.click(trigger());

    expect(screen.queryByText("Log out?")).not.toBeNull();
    expect(stillSignedIn()).toBe(true);
  });

  it("keeps the session when the parent backs out", () => {
    renderAt("/guardian/settings");

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("button", { name: /stay/i }));

    expect(stillSignedIn()).toBe(true);
  });

  it("clears the session only once the parent confirms", () => {
    renderAt("/guardian/settings");

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("button", { name: /yes, log out/i }));

    expect(sessionStorage.getItem("access_token")).toBeNull();
    expect(sessionStorage.getItem("current_user")).toBeNull();
  });
});
