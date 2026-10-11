/**
 * ScholarshipTypesPage on a dark page: the list, the type editor (the
 * discount-type cards, the active box, an error) and the delete confirm.
 * The dark-only branches never run in a light render.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeContext } from "../../hooks/useTheme";

const api = { getScholarshipTypes: vi.fn() };
vi.mock("../../api/enrollmentApi", () => ({
  getScholarshipTypes: (...a) => api.getScholarshipTypes(...a),
  createScholarshipType: vi.fn(),
  updateScholarshipType: vi.fn(),
  deleteScholarshipType: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: ScholarshipTypesPage } = await import("../ScholarshipTypesPage");

const TYPES = [
  { scholarship_type_id: 1, scholarship_code: "ESC", scholarship_name: "Education Service Contracting", description: "DepEd subsidy", discount_mode: "fixed_amount", discount_value: "14000.00", is_active: true },
  { scholarship_type_id: 4, scholarship_code: "OLD", scholarship_name: "Old Voucher", description: null, discount_mode: "percentage", discount_value: "5.00", is_active: false },
];

function renderDark() {
  return render(
    <ThemeContext.Provider value="dark">
      <div data-theme="dark">
        <MemoryRouter initialEntries={["/scholarship-types"]}>
          <ScholarshipTypesPage />
        </MemoryRouter>
      </div>
    </ThemeContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getScholarshipTypes.mockResolvedValue(TYPES);
});

describe("Scholarship types — dark mode", () => {
  it("shows the list", async () => {
    renderDark();
    expect(await screen.findByText("Education Service Contracting")).toBeTruthy();
    expect(screen.getByText("DepEd subsidy")).toBeTruthy();
    expect(screen.getByText("Old Voucher")).toBeTruthy();
  });

  it("opens the type editor: both discount cards, the active box and an error", async () => {
    renderDark();
    await screen.findByText("Old Voucher");
    fireEvent.click(screen.getByRole("button", { name: /New Scholarship/ }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Percentage (%)")).toBeTruthy();
    fireEvent.click(within(dialog).getByText("Fixed Amount (₱)"));
    expect(within(dialog).getByText("₱")).toBeTruthy();
    expect(within(dialog).getByLabelText(/Active — available for assignment/).checked).toBe(true);

    fireEvent.click(within(dialog).getByRole("button", { name: /Create Scholarship/ }));
    expect(await within(dialog).findByText("Scholarship code is required.")).toBeTruthy();
  });

  it("opens the delete confirm", async () => {
    renderDark();
    await screen.findByText("Old Voucher");
    fireEvent.click(screen.getByRole("button", { name: "Delete Old Voucher" }));
    expect(await screen.findByText("Delete scholarship?")).toBeTruthy();
  });
});
