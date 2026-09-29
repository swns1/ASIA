/**
 * Billing Settings — fees per school year: the fee tab shows one year's
 * schedules (the one in the link, else the current year), creates new ones
 * for that year, copies an earlier year's fees in, and is read-only for an
 * archived year.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const billing = {
  getSchoolSettings: vi.fn(),
  updateSchoolSettings: vi.fn(),
  getFeeSchedules: vi.fn(),
  createFeeSchedule: vi.fn(),
  createFeeScheduleItem: vi.fn(),
  updateFeeScheduleItem: vi.fn(),
  deleteFeeScheduleItem: vi.fn(),
  recalculateFeeSchedule: vi.fn(),
  carryOverFees: vi.fn(),
};
const carryOverSchoolYear = vi.fn();

vi.mock("../../api/billingApi", () => Object.fromEntries(
  Object.keys(billing).map((k) => [k, (...a) => billing[k](...a)]),
));
vi.mock("../../api/enrollmentApi", () => ({ carryOverSchoolYear: (...a) => carryOverSchoolYear(...a) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
// 2026-2027 is current, 2027-2028 being set up, 2024-2025 archived.
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027",
    options: ["2027-2028", "2026-2027", "2024-2025"],
    yearStates: { "2027-2028": "upcoming", "2026-2027": "current", "2024-2025": "archived" },
    yearCounts: {},
    entryYears: ["2027-2028", "2026-2027"],
  }),
}));

const { default: BillingSettingsPage } = await import("../BillingSettingsPage");

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/settings" element={<BillingSettingsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  billing.getFeeSchedules.mockResolvedValue([]);
});

describe("Billing Settings — fees per school year", () => {
  it("opens on the year in the link", async () => {
    renderAt("/settings?tab=fees&school_year=2027-2028");
    expect(await screen.findByText("0 schedules for S.Y. 2027-2028")).toBeTruthy();
    expect(billing.getFeeSchedules).toHaveBeenCalledWith({ school_year: "2027-2028" });
  });

  it("otherwise on the current year", async () => {
    renderAt("/settings?tab=fees");
    await waitFor(() => expect(billing.getFeeSchedules).toHaveBeenCalledWith({ school_year: "2026-2027" }));
  });

  it("creates a new schedule for the year on screen", async () => {
    billing.createFeeSchedule.mockResolvedValue({ fee_schedule_id: 9, items: [] });
    renderAt("/settings?tab=fees&school_year=2027-2028");
    fireEvent.click(await screen.findByRole("button", { name: /New Schedule/ }));
    expect(await screen.findByText(/For S\.Y\. 2027-2028/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));
    await waitFor(() => expect(billing.createFeeSchedule).toHaveBeenCalledWith({
      school_year: "2027-2028", school_level: "elementary", grade_level: "Grade 1", is_active: true,
    }));
  });

  it("copies an earlier year's fees, previewing them first", async () => {
    billing.carryOverFees.mockImplementation((body) => Promise.resolve({
      from: body.from, to: body.to, dry_run: Boolean(body.dry_run),
      fees: {
        copied: [
          { school_level: "junior_highschool", grade_level: "Grade 7", items: 4, total: "25500.00" },
          { school_level: "junior_highschool", grade_level: "Grade 8", items: 4, total: "26000.00" },
        ],
        skipped: [{ school_level: "elementary", grade_level: "Grade 1", items: 3, total: "18000.00" }],
      },
    }));
    renderAt("/settings?tab=fees&school_year=2027-2028");
    fireEvent.click(await screen.findByRole("button", { name: /Copy from an earlier year/ }));

    await waitFor(() => expect(billing.carryOverFees).toHaveBeenCalledWith(
      { from: "2026-2027", to: "2027-2028", dry_run: true },
    ));
    expect(await screen.findByText("Will add fees for 2 grades:")).toBeTruthy();
    expect(screen.getByText("₱25,500.00")).toBeTruthy();
    expect(screen.getByText(/1 grade already has fees here/)).toBeTruthy();
    // Fees are the only thing Billing Settings copies: no sections or advisers.
    expect(screen.queryByRole("checkbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy fees for 2 grades" }));
    await waitFor(() => expect(billing.carryOverFees).toHaveBeenLastCalledWith({ from: "2026-2027", to: "2027-2028" }));
    expect(carryOverSchoolYear).not.toHaveBeenCalled();
  });

  it("an archived year's fees are read-only", async () => {
    renderAt("/settings?tab=fees&school_year=2024-2025");
    expect(await screen.findByText("Archived — read-only")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /New Schedule/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Copy from an earlier year/ })).toBeNull();
  });
});
