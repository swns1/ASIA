/**
 * Billing Settings on a dark page: the General tab (its cards, the school
 * year's progress, the discount rates with an unsaved rate and a failed save),
 * the Fee Schedules tab (the list, a chosen schedule with its totals and item
 * rows, editing a row, the add form's error, deleting a row), the New Schedule
 * and Copy from an earlier year windows, an archived year, and the Developer
 * tab. Dark-only branches are otherwise never run by the suite.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeContext } from "../../hooks/useTheme";

const billing = {
  getSchoolSettings: vi.fn(),
  updateSchoolSettings: vi.fn(),
  getFeeSchedules: vi.fn(),
  createFeeSchedule: vi.fn(),
  createFeeScheduleItem: vi.fn(),
  updateFeeScheduleItem: vi.fn(),
  deleteFeeScheduleItem: vi.fn(),
  recalculateFeeSchedule: vi.fn(),
  getDiscountTypes: vi.fn(),
  updateDiscountType: vi.fn(),
  carryOverFees: vi.fn(),
};

vi.mock("../../api/billingApi", () => Object.fromEntries(
  Object.keys(billing).map((k) => [k, (...a) => billing[k](...a)]),
));
vi.mock("../../api/enrollmentApi", () => ({ carryOverSchoolYear: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
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

const SCHEDULE = {
  fee_schedule_id: 4, school_year: "2026-2027", school_level: "junior_highschool", grade_level: "Grade 7",
  total_tuition: "20000.00", total_misc: "4000.00", total_other: "1500.00", grand_total: "25500.00",
  items: [
    { fee_schedule_item_id: 11, item_category: "tuition", item_name: "Tuition Fee", amount: "20000.00" },
    { fee_schedule_item_id: 12, item_category: "misc", item_name: "Books", amount: "4000.00" },
  ],
};

const renderDark = (url = "/settings") => render(
  <ThemeContext.Provider value="dark">
    <div data-theme="dark">
      <MemoryRouter initialEntries={[url]}>
        <BillingSettingsPage />
      </MemoryRouter>
    </div>
  </ThemeContext.Provider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Ana Reyes", role: "admin" }));
  billing.getSchoolSettings.mockResolvedValue({
    setting_id: 1, school_name: "SLIS", current_school_year: "2026-2027",
    sy_start_date: "2026-06-01", sy_end_date: "2027-03-31", early_bird_days: 7,
    updated_at: "2026-10-01T08:00:00Z",
  });
  billing.getDiscountTypes.mockResolvedValue([
    { discount_type_id: 1, discount_code: "MONTHLY_PLAN", discount_value: "0.00" },
    { discount_type_id: 4, discount_code: "ANNUAL_PLAN", discount_value: "5.00" },
    { discount_type_id: 5, discount_code: "EARLY_BIRD", discount_value: "5.00" },
  ]);
  billing.getFeeSchedules.mockResolvedValue([SCHEDULE]);
});

describe("Billing Settings in dark mode", () => {
  it("renders the General tab's cards, the year's progress and the discount rates", async () => {
    renderDark();
    expect(await screen.findByDisplayValue("SLIS")).toBeTruthy();
    expect(screen.getByText("School Information")).toBeTruthy();
    expect(screen.getByText("S.Y. 2026-2027")).toBeTruthy();
    expect(screen.getByText("School Year Progress")).toBeTruthy();
    expect(screen.getByText("Payment Plans & Discount Rates")).toBeTruthy();

    // An unsaved change lights the save button and its chip.
    fireEvent.change(screen.getByDisplayValue("SLIS"), { target: { value: "" } });
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Save Settings/ }));
    expect(await screen.findByText("School name is required.")).toBeTruthy();

    // A changed rate shows its Save button; a failed save shows the error.
    const annual = await screen.findByLabelText(/Annual plan discount/);
    fireEvent.change(annual, { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("A rate is a percentage from 0 to 100.")).toBeTruthy();
  });

  it("shows a chosen fee schedule, edits and deletes a row, and the add form's error", async () => {
    renderDark("/settings?tab=fees");
    fireEvent.click(await screen.findByText("Grade 7"));

    expect(await screen.findByText("Grand Total")).toBeTruthy();
    expect(screen.getByText("Tuition Fee")).toBeTruthy();
    expect(screen.getByText("· discounts applied here")).toBeTruthy();
    expect(screen.getAllByText("No items yet")).toHaveLength(1);

    fireEvent.click(document.querySelector(".ti-pencil").closest("button"));
    expect(screen.getByDisplayValue("Tuition Fee")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    expect(await screen.findByText("Name required.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete fee item Books" }));
    expect(await screen.findByText("Delete fee item?")).toBeTruthy();
  });

  it("opens the New Schedule window", async () => {
    renderDark("/settings?tab=fees");
    fireEvent.click(await screen.findByRole("button", { name: /New Schedule/ }));
    expect(await screen.findByText(/For S\.Y\. 2026-2027/)).toBeTruthy();
    expect(screen.getByText("School Level")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Senior HS/ }));
    expect(screen.getByDisplayValue("Grade 11")).toBeTruthy();
  });

  it("opens the Copy from an earlier year window", async () => {
    billing.carryOverFees.mockResolvedValue({
      from: "2026-2027", to: "2027-2028", dry_run: true,
      fees: { copied: [{ school_level: "junior_highschool", grade_level: "Grade 7", items: 4, total: "25500.00" }], skipped: [] },
    });
    renderDark("/settings?tab=fees&school_year=2027-2028");
    fireEvent.click(await screen.findByRole("button", { name: /Copy from an earlier year/ }));
    expect(await screen.findByText("₱25,500.00")).toBeTruthy();
  });

  it("marks an archived year read-only and shows the empty list", async () => {
    billing.getFeeSchedules.mockResolvedValue([]);
    renderDark("/settings?tab=fees&school_year=2024-2025");
    expect(await screen.findByText("Archived — read-only")).toBeTruthy();
    expect(screen.getByText(/No fee schedules for S\.Y\. 2024-2025 yet/)).toBeTruthy();
    expect(screen.getByText("Select a fee schedule")).toBeTruthy();
  });

  it("shows the Developer tab's appearance switch", async () => {
    renderDark();
    fireEvent.click(screen.getByRole("tab", { name: /developer/i }));
    await waitFor(() => expect(screen.getByText("Appearance")).toBeTruthy());
    // Listed among the ready pages, wherever it falls in the list.
    expect(screen.getByText(/Billing Settings[^)]* so far/)).toBeTruthy();
  });
});
