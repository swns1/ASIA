/**
 * SchoolYearContext — where "the current year" comes from.
 *
 * Every page's year filter opens on this year, so it has to follow School
 * Settings: the old app-wide pick was saved on first login and outranked
 * settings for good, so after a rollover returning users stayed on last year.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getSchoolSettings = vi.fn();
const getSchoolYears = vi.fn();

vi.mock("../api/billingApi", () => ({
  getSchoolSettings: (...a) => getSchoolSettings(...a),
}));
vi.mock("../api/enrollmentApi", () => ({
  getSchoolYears: (...a) => getSchoolYears(...a),
}));

const { SchoolYearProvider, useSchoolYear } = await import("./SchoolYearContext");

function Probe() {
  const { currentYear } = useSchoolYear();
  return <p data-testid="current">{currentYear}</p>;
}

function renderProvider() {
  return render(
    <SchoolYearProvider>
      <Probe />
    </SchoolYearProvider>,
  );
}

const current = () => screen.getByTestId("current").textContent;

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
  getSchoolYears.mockResolvedValue({ results: [], current: "2026-2027" });
});

describe("SchoolYearContext — the current year", () => {
  it("comes from School Settings, even before any enrollment exists", async () => {
    getSchoolSettings.mockResolvedValue({ current_school_year: "2025-2026" });
    renderProvider();
    await waitFor(() => expect(current()).toBe("2025-2026"));
  });

  it("keeps the settings year when the year list fails to load", async () => {
    getSchoolYears.mockRejectedValue(new Error("enrollment service is down"));
    getSchoolSettings.mockResolvedValue({ current_school_year: "2025-2026" });
    renderProvider();
    await waitFor(() => expect(current()).toBe("2025-2026"));
  });

  it("opens on the last settings year seen, and follows settings after a rollover", async () => {
    getSchoolSettings.mockResolvedValue({ current_school_year: "2025-2026" });
    const first = renderProvider();
    await waitFor(() => expect(current()).toBe("2025-2026"));
    first.unmount();

    let rollover;
    getSchoolSettings.mockReturnValue(new Promise((resolve) => { rollover = resolve; }));
    renderProvider();
    expect(current()).toBe("2025-2026");

    rollover({ current_school_year: "2026-2027" });
    await waitFor(() => expect(current()).toBe("2026-2027"));
    expect(localStorage.getItem("current_school_year")).toBe("2026-2027");
  });

  it("ignores and clears the old sidebar pick", async () => {
    localStorage.setItem("selected_school_year", "2023-2024");
    getSchoolSettings.mockResolvedValue({ current_school_year: "2026-2027" });
    renderProvider();

    await waitFor(() => expect(current()).toBe("2026-2027"));
    expect(localStorage.getItem("selected_school_year")).toBeNull();
  });

  it("does not fetch for guardians, who have no year picker", async () => {
    sessionStorage.setItem("current_user", JSON.stringify({ name: "Parent", role: "guardian" }));
    renderProvider();
    await new Promise((r) => setTimeout(r, 0));
    expect(getSchoolSettings).not.toHaveBeenCalled();
    expect(getSchoolYears).not.toHaveBeenCalled();
  });
});
