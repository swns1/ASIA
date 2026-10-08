import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BillingSettingsPage from "../BillingSettingsPage";
import { SchoolYearProvider } from "../../context/SchoolYearContext";

// The tabs are what's under test; the settings behind them just need to load.
vi.mock("../../api/billingApi", () => ({
  getSchoolSettings: () => Promise.resolve({ current_school_year: "2026-2027" }),
  updateSchoolSettings: vi.fn(),
  getFeeSchedules: () => Promise.resolve({ results: [] }),
  createFeeSchedule: vi.fn(),
  createFeeScheduleItem: vi.fn(),
  updateFeeScheduleItem: vi.fn(),
  deleteFeeScheduleItem: vi.fn(),
  recalculateFeeSchedule: vi.fn(),
  getDiscountTypes: () => Promise.resolve([]),
  updateDiscountType: vi.fn(),
}));

const signInAs = (role) =>
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Ana Reyes", role }));

// Renders, then lets the settings finish loading before anything is checked.
async function renderSettings() {
  render(
    <MemoryRouter initialEntries={["/settings"]}>
      <SchoolYearProvider>
        <BillingSettingsPage />
      </SchoolYearProvider>
    </MemoryRouter>
  );
  await act(async () => {});
}

const developerTab = () => screen.queryByRole("tab", { name: /developer/i });

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Billing Settings › Developer (the dark mode switch)", () => {
  it("is there for an admin in a development build", async () => {
    signInAs("admin");
    await renderSettings();
    expect(developerTab()).not.toBeNull();
  });

  it("is hidden from accounting staff, who can open Billing Settings", async () => {
    signInAs("accounting");
    await renderSettings();
    expect(developerTab()).toBeNull();
  });

  it("is hidden from everyone in a production build", async () => {
    vi.stubEnv("DEV", false);
    signInAs("super_admin");
    await renderSettings();
    expect(developerTab()).toBeNull();
  });
});
