/**
 * Billing Settings after the billing QA pass.
 *
 * - Fee schedules had no school year: entering next year's fees rewrote this
 *   year's. Each year now has its own, and a new year starts from a copy.
 * - The plan and Early Bird discount rates could only be changed through the
 *   API, and the page described them with hardcoded percentages.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = {
  getSchoolSettings: vi.fn(),
  getFeeSchedules: vi.fn(),
  copyFeeSchedulesToYear: vi.fn(),
  getDiscountTypes: vi.fn(),
  updateDiscountType: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/billingApi", () => ({
  getSchoolSettings: pass("getSchoolSettings"),
  updateSchoolSettings: vi.fn(),
  getFeeSchedules: pass("getFeeSchedules"),
  createFeeSchedule: vi.fn(),
  createFeeScheduleItem: vi.fn(),
  updateFeeScheduleItem: vi.fn(),
  deleteFeeScheduleItem: vi.fn(),
  recalculateFeeSchedule: vi.fn(),
  copyFeeSchedulesToYear: pass("copyFeeSchedulesToYear"),
  getDiscountTypes: pass("getDiscountTypes"),
  updateDiscountType: pass("updateDiscountType"),
}));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({ schoolYear: "2026-2027", currentYear: "2026-2027", options: ["2026-2027"], yearCounts: {} }),
}));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: BillingSettingsPage } = await import("../BillingSettingsPage");

function renderAt(query = "") {
  return render(<MemoryRouter initialEntries={[`/billing-settings${query}`]}><BillingSettingsPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getSchoolSettings.mockResolvedValue({
    setting_id: 1, school_name: "SLIS", current_school_year: "2026-2027",
    sy_start_date: "2026-06-01", sy_end_date: "2027-03-31", early_bird_days: 7,
  });
  api.getDiscountTypes.mockResolvedValue([
    { discount_type_id: 1, discount_code: "MONTHLY_PLAN", discount_value: "0.00" },
    { discount_type_id: 2, discount_code: "QUARTERLY_PLAN", discount_value: "0.00" },
    { discount_type_id: 3, discount_code: "SEMI_ANNUAL_PLAN", discount_value: "3.00" },
    { discount_type_id: 4, discount_code: "ANNUAL_PLAN", discount_value: "5.00" },
    { discount_type_id: 5, discount_code: "EARLY_BIRD", discount_value: "5.00" },
  ]);
});

describe("Fee schedules per school year", () => {
  it("loads the current year's schedules, and a year with none starts from last year's", async () => {
    api.getFeeSchedules.mockImplementation((params) => Promise.resolve(
      params.school_year === "2027-2028" ? [] : [{
        fee_schedule_id: 1, school_level: "elementary", grade_level: "Grade 4", school_year: "2026-2027",
        items: [], total_tuition: 28000, total_misc: 7500, total_other: 3000, grand_total: 38500,
      }],
    ));
    api.copyFeeSchedulesToYear.mockResolvedValue({ created: 14, skipped_existing: 0 });
    renderAt("?tab=fees");

    await waitFor(() => expect(api.getFeeSchedules).toHaveBeenCalledWith({ school_year: "2026-2027" }));
    expect(await screen.findByText("Grade 4")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Fee schedule school year"), { target: { value: "2027-2028" } });
    await waitFor(() => expect(api.getFeeSchedules).toHaveBeenLastCalledWith({ school_year: "2027-2028" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy from SY 2026-2027" }));

    await waitFor(() => expect(api.copyFeeSchedulesToYear).toHaveBeenCalledWith("2026-2027", "2027-2028"));
  });
});

describe("Discount rates", () => {
  it("shows the configured rates and saves a changed one", async () => {
    api.updateDiscountType.mockResolvedValue({ discount_type_id: 4, discount_code: "ANNUAL_PLAN", discount_value: "6.00" });
    renderAt();

    const annual = await screen.findByLabelText(/Annual plan discount/);
    expect(annual.value).toBe("5");
    // Due months come from the school year's opening month, not a fixed list.
    expect(screen.getByText(/2 installments — end of Jun, Nov/)).toBeTruthy();

    fireEvent.change(annual, { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.updateDiscountType).toHaveBeenCalledWith(4, { discount_value: 6 }));
  });
});
