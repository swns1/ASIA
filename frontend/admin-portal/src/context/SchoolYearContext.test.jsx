/**
 * SchoolYearContext — where "the current year" and the year list come from.
 *
 * Both come from the school year registry (GET /enrollments/school-years/).
 * School Settings used to be asked separately for the current year; it now
 * only mirrors the registry, so the context no longer reads it. Every page's
 * year filter opens on this year, so it has to follow a rollover: the old
 * app-wide pick was saved on first login and outranked everything for good.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

const getSchoolYears = vi.fn();

vi.mock("../api/enrollmentApi", () => ({
  getSchoolYears: (...a) => getSchoolYears(...a),
}));

const { SchoolYearProvider, useSchoolYear } = await import("./SchoolYearContext");

let ctx;
function Probe() {
  ctx = useSchoolYear();
  return (
    <>
      <p data-testid="current">{ctx.currentYear}</p>
      <p data-testid="entry">{ctx.entryYears.join(",")}</p>
    </>
  );
}

function renderProvider() {
  return render(
    <SchoolYearProvider>
      <Probe />
    </SchoolYearProvider>,
  );
}

const current = () => screen.getByTestId("current").textContent;
const entry = () => screen.getByTestId("entry").textContent;

const registry = (currentLabel, rows) => ({ current: currentLabel, results: rows });
const row = (school_year, state, count = 0) => ({ school_year, state, count });

function makeToken(expSecondsFromNow = 600) {
  const payload = { exp: Math.floor(Date.now() / 1000) + expSecondsFromNow };
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  sessionStorage.setItem("access_token", makeToken());
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Ana Reyes", role: "registrar" }));
  getSchoolYears.mockResolvedValue(registry("2025-2026", [
    row("2026-2027", "upcoming"),
    row("2025-2026", "current", 140),
  ]));
});

describe("SchoolYearContext — the current year", () => {
  it("comes from the registry, even before any enrollment exists", async () => {
    getSchoolYears.mockResolvedValue(registry("2025-2026", [row("2025-2026", "current")]));
    renderProvider();
    await waitFor(() => expect(current()).toBe("2025-2026"));
  });

  it("opens on the last current year seen, and follows a rollover", async () => {
    const first = renderProvider();
    await waitFor(() => expect(current()).toBe("2025-2026"));
    first.unmount();

    let rollover;
    getSchoolYears.mockReturnValue(new Promise((resolve) => { rollover = resolve; }));
    renderProvider();
    expect(current()).toBe("2025-2026");

    rollover(registry("2026-2027", [row("2026-2027", "current"), row("2025-2026", "open")]));
    await waitFor(() => expect(current()).toBe("2026-2027"));
    expect(localStorage.getItem("current_school_year")).toBe("2026-2027");
  });

  it("does not cache a date guess as if it were the school's current year", async () => {
    // Nothing registered as current: the server falls back to a guess.
    getSchoolYears.mockResolvedValue(registry("2026-2027", [row("2026-2027", null)]));
    renderProvider();
    await waitFor(() => expect(current()).toBe("2026-2027"));
    expect(localStorage.getItem("current_school_year")).toBeNull();
  });

  it("keeps the cached year when the year list fails to load", async () => {
    localStorage.setItem("current_school_year", "2025-2026");
    getSchoolYears.mockRejectedValue(new Error("enrollment service is down"));
    renderProvider();
    await new Promise((r) => setTimeout(r, 0));
    expect(current()).toBe("2025-2026");
  });

  it("ignores and clears the old sidebar pick", async () => {
    localStorage.setItem("selected_school_year", "2023-2024");
    renderProvider();

    await waitFor(() => expect(current()).toBe("2025-2026"));
    expect(localStorage.getItem("selected_school_year")).toBeNull();
  });

  it("does not fetch for guardians, who have no year picker", async () => {
    sessionStorage.setItem("current_user", JSON.stringify({ name: "Parent", role: "guardian" }));
    renderProvider();
    await new Promise((r) => setTimeout(r, 0));
    expect(getSchoolYears).not.toHaveBeenCalled();
  });
});

describe("SchoolYearContext — years a form can file into", () => {
  it("are the registered years that aren't archived", async () => {
    getSchoolYears.mockResolvedValue(registry("2025-2026", [
      row("2026-2027", "upcoming"),
      row("2025-2026", "current"),
      row("2024-2025", "open"),
      row("2023-2024", "archived"),
      row("2022-2023", null), // an unregistered label from old data
    ]));
    renderProvider();
    await waitFor(() => expect(entry()).toBe("2026-2027,2025-2026,2024-2025"));
  });

  it("fall back to the current year before the list arrives", () => {
    localStorage.setItem("current_school_year", "2025-2026");
    getSchoolYears.mockReturnValue(new Promise(() => {}));
    renderProvider();
    expect(entry()).toBe("2025-2026");
  });

  it("refresh after the School Years page changes something", async () => {
    renderProvider();
    await waitFor(() => expect(current()).toBe("2025-2026"));
    expect(getSchoolYears).toHaveBeenCalledTimes(1);

    getSchoolYears.mockResolvedValue(registry("2026-2027", [
      row("2026-2027", "current"),
      row("2025-2026", "open"),
    ]));
    act(() => ctx.refreshYears());
    await waitFor(() => expect(current()).toBe("2026-2027"));
    expect(getSchoolYears).toHaveBeenCalledTimes(2);
  });
});
