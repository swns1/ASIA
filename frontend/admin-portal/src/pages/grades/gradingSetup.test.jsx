/**
 * GradingSettingsPage (Grading Setup) — both tabs laid out like the other
 * list pages.
 *
 * Templates: the band says which can grade (Ready), which can't yet because
 * their weights don't add up to 100%, and which are inactive; the Level menu
 * narrows it, search only the rows. Narrative categories: active/inactive.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = { getGradingTemplates: vi.fn(), getNarrativeCategories: vi.fn() };
vi.mock("../../api/enrollmentApi", () => ({
  getGradingTemplates: (...a) => api.getGradingTemplates(...a),
  createGradingTemplate: vi.fn(), updateGradingTemplate: vi.fn(), deleteGradingTemplate: vi.fn(),
  createGradingComponent: vi.fn(), updateGradingComponent: vi.fn(), deleteGradingComponent: vi.fn(),
  getNarrativeCategories: (...a) => api.getNarrativeCategories(...a),
  createNarrativeCategory: vi.fn(), updateNarrativeCategory: vi.fn(), deleteNarrativeCategory: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: GradingSettingsPage } = await import("../GradingSettingsPage");

const component = (id, name, weight) => ({ grading_component_id: id, component_name: name, weight: String(weight) });
const TEMPLATES = [
  { grading_template_id: 1, template_name: "Elementary Standard", school_level: "elementary", is_active: true,
    components: [component(1, "Written Works", 30), component(2, "Performance Tasks", 50), component(3, "Quarterly Assessment", 20)] },
  { grading_template_id: 2, template_name: "JHS Draft", school_level: "junior_highschool", is_active: true,
    components: [component(4, "Written Works", 40), component(5, "Performance Tasks", 40)] },
  { grading_template_id: 3, template_name: "Old Elementary", school_level: "elementary", is_active: false,
    components: [component(6, "Exams", 100)] },
];

const legend = () => within(screen.getByRole("group", { name: "Filter by status" }));
const renderAt = (url = "/grading-templates") =>
  render(<MemoryRouter initialEntries={[url]}><GradingSettingsPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Reg", role: "registrar" }));
  api.getGradingTemplates.mockResolvedValue(TEMPLATES);
  api.getNarrativeCategories.mockResolvedValue([
    { category_id: 1, name: "Attentive in class", description: null, sort_order: 1, is_active: true },
    { category_id: 2, name: "Old category", description: null, sort_order: 2, is_active: false },
  ]);
});

describe("Grading setup — templates", () => {
  it("says which templates can grade, and filters by it", async () => {
    renderAt();
    await screen.findByText("Elementary Standard");

    expect(legend().getByRole("button", { name: "All 3" })).toBeTruthy();
    expect(legend().getByRole("button", { name: "Ready 1" })).toBeTruthy();
    expect(legend().getByRole("button", { name: "Inactive 1" })).toBeTruthy();
    fireEvent.click(legend().getByRole("button", { name: "Weights not 100% 1" }));

    expect(screen.queryByText("Elementary Standard")).toBeNull();
    const row = screen.getByText("JHS Draft").closest("tr");
    expect(within(row).getByText("80%")).toBeTruthy();
  });

  it("narrows the band by level, and the rows by the search", async () => {
    renderAt();
    await screen.findByText("Elementary Standard");

    fireEvent.click(screen.getByRole("button", { name: /^Level:/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Elementary" }));
    expect(legend().getByRole("button", { name: "All 2" })).toBeTruthy();
    expect(screen.getByText("grading templates · Elementary")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: /search grading templates/i }), { target: { value: "old" } });
    expect(screen.queryByText("Elementary Standard")).toBeNull();
    expect(legend().getByRole("button", { name: "All 2" })).toBeTruthy();
  });

  it("lists each component with its weight", async () => {
    renderAt();
    const row = (await screen.findByText("Elementary Standard")).closest("tr");
    expect(within(row).getByText("Performance Tasks")).toBeTruthy();
    expect(within(row).getByText("100%")).toBeTruthy();
  });

  it("opens a template to edit from its row", async () => {
    renderAt();
    fireEvent.click((await screen.findByText("JHS Draft")).closest("tr"));
    expect(await screen.findByRole("button", { name: /Update Template/ })).toBeTruthy();
  });

  it("says the list failed rather than that there are none", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api.getGradingTemplates.mockRejectedValue(new Error("Network Error"));
    renderAt();
    expect(await screen.findByRole("button", { name: /try again|retry/i })).toBeTruthy();
    expect(screen.queryByText("No grading templates yet")).toBeNull();
  });
});

describe("Grading setup — narrative categories", () => {
  it("counts active and inactive categories, and filters by it", async () => {
    renderAt("/grading-templates?tab=narrative");
    await screen.findByText("Attentive in class");

    expect(legend().getByRole("button", { name: "All 2" })).toBeTruthy();
    fireEvent.click(legend().getByRole("button", { name: "Inactive 1" }));

    await waitFor(() => expect(screen.queryByText("Attentive in class")).toBeNull());
    expect(screen.getByText("Old category")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Inactive categories" })).toBeTruthy();
  });
});
