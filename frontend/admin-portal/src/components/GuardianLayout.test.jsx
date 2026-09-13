/**
 * Guardian portal shell — the logout gate.
 *
 * The staff Sidebar has always put its logout behind a ConfirmDialog, but the
 * guardian top bar called clearAuthSession() straight from the button's
 * onClick. That button is icon-only and sits immediately beside the account
 * block, so it is the easier of the two to hit by accident, and there is no
 * undo: the session is cleared locally and a logout is posted to identity.
 *
 * These assert on sessionStorage rather than on a mocked clearAuthSession,
 * because "the session is still alive until the parent confirms" is the
 * property that actually matters here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GuardianLayout from "./GuardianLayout";

// clearAuthSession() posts a logout audit before clearing storage. There is no
// backend here and the call is already fire-and-forget, so stub it away.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
  sessionStorage.clear();
  sessionStorage.setItem("access_token", "header.payload.signature");
  sessionStorage.setItem(
    "current_user",
    JSON.stringify({ name: "Rosa Valdez", role: "guardian" })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/guardian"]}>
      <GuardianLayout>
        <p>Child records</p>
      </GuardianLayout>
    </MemoryRouter>
  );
}

const trigger = () => screen.getByRole("button", { name: "Log out" });
const stillSignedIn = () => sessionStorage.getItem("access_token") !== null;

describe("GuardianLayout logout", () => {
  it("asks before logging out instead of doing it on the first click", () => {
    renderLayout();

    fireEvent.click(trigger());

    expect(screen.queryByText("Log out?")).not.toBeNull();
    expect(stillSignedIn()).toBe(true);
  });

  it("keeps the session when the parent backs out", () => {
    renderLayout();

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("button", { name: /stay/i }));

    expect(stillSignedIn()).toBe(true);
    expect(screen.queryByText("Child records")).not.toBeNull();
  });

  it("clears the session only once the parent confirms", () => {
    renderLayout();

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("button", { name: /yes, log out/i }));

    expect(sessionStorage.getItem("access_token")).toBeNull();
    expect(sessionStorage.getItem("current_user")).toBeNull();
  });

  it("shows no dialog until the button is pressed", () => {
    renderLayout();

    expect(screen.queryByText("Log out?")).toBeNull();
    expect(stillSignedIn()).toBe(true);
  });
});
