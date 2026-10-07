/**
 * ScholarshipTypesPage — laid out like the other list pages: a status band
 * whose legend is the Active/Inactive filter, then search and a Discount menu.
 * Every type loads at once, so the band counts on the page: the Discount menu
 * narrows it, search only the rows.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = { getScholarshipTypes: vi.fn() };
vi.mock("../../api/enrollmentApi", () => ({
  getScholarshipTypes: (...a) => api.getScholarshipTypes(...a),
  createScholarshipType: vi.fn(),
  updateScholarshipType: vi.fn(),
  deleteScholarshipType: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: ScholarshipTypesPage } = await import("../ScholarshipTypesPage");

const type = (id, name, over = {}) => ({
  scholarship_type_id: id, scholarship_code: name.toUpperCase().slice(0, 5), scholarship_name: name,
  description: null, discount_mode: "percentage", discount_value: "10.00", is_active: true, ...over,
});
const TYPES = [
  type(1, "Education Service Contracting", { discount_mode: "fixed_amount", discount_value: "14000.00" }),
  type(2, "Academic Excellence"),
  type(3, "Sibling Discount"),
  type(4, "Old Voucher", { discount_mode: "fixed_amount", is_active: false }),
];

const legend = () => within(screen.getByRole("group", { name: "Filter by status" }));
const pick = (label, item) => {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}:`) }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: item }));
};
const renderPage = () => render(<MemoryRouter><ScholarshipTypesPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.getScholarshipTypes.mockResolvedValue(TYPES);
});

describe("Scholarship types — band and filters", () => {
  it("counts which types can be awarded, and filters by it", async () => {
    renderPage();
    await screen.findByText("Academic Excellence");

    expect(legend().getByRole("button", { name: "All 4" }).getAttribute("aria-pressed")).toBe("true");
    expect(legend().getByRole("button", { name: "Active 3" })).toBeTruthy();
    fireEvent.click(legend().getByRole("button", { name: "Inactive 1" }));

    expect(screen.queryByText("Academic Excellence")).toBeNull();
    expect(screen.getByText("Old Voucher")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Inactive scholarship types" })).toBeTruthy();
  });

  it("narrows the band by discount type, but not by the search", async () => {
    renderPage();
    await screen.findByText("Academic Excellence");

    pick("Discount", "Fixed amount");
    expect(legend().getByRole("button", { name: "All 2" })).toBeTruthy();
    expect(screen.getByText("scholarship types · Fixed amount")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: /search scholarship types/i }), { target: { value: "voucher" } });
    expect(screen.queryByText("Education Service Contracting")).toBeNull();
    expect(screen.getByText("Old Voucher")).toBeTruthy();
    expect(legend().getByRole("button", { name: "All 2" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(screen.getByText("Academic Excellence")).toBeTruthy());
  });

  it("opens a type to edit from its row", async () => {
    renderPage();
    fireEvent.click((await screen.findByText("Sibling Discount")).closest("tr"));
    expect(await screen.findByText("Edit Scholarship")).toBeTruthy();
  });

  it("says the list failed rather than that there are none", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api.getScholarshipTypes.mockRejectedValue(new Error("Network Error"));
    renderPage();
    expect(await screen.findByRole("button", { name: /try again|retry/i })).toBeTruthy();
    expect(screen.queryByText("No scholarship types yet")).toBeNull();
  });
});
