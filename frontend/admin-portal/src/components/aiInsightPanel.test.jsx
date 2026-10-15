/**
 * AIInsightPanel — saved AI summaries.
 *
 * A summary is saved to the account that made it, so the panel finds it on
 * open, warns (with its date) when the data moved on since, and lets its
 * owner edit, copy, download, share or archive it. What other staff shared
 * shows beneath, read-only.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { parseAiText, toPlainText } from "../utils/aiText";

const api = {
  callGemini: vi.fn(), lookupAiSummary: vi.fn(), editAiSummary: vi.fn(),
  shareAiSummary: vi.fn(), archiveAiSummary: vi.fn(), downloadAiSummaryDocx: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);
vi.mock("../api/enrollmentApi", () => Object.fromEntries(Object.keys(api).map((k) => [k, pass(k)])));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: AIInsightPanel } = await import("./AIInsightPanel");

const REQUEST = { contextType: "grade_report", enrollmentId: 11, payload: { grade_level: "Grade 10" } };
const TEXT = "**SUMMARY**\n* Strong in **Math**";

const summary = (over = {}) => ({
  id: 3, context_type: "grade_report", text: TEXT, ai_text: TEXT, edited: false, provider: "gemini",
  generated_at: "2026-10-14T07:20:00Z", edited_at: null, stale: false,
  shared: false, shared_at: null, shared_is_current: false, ...over,
});

function renderPanel(lookup = { mine: null, shared: [] }) {
  api.lookupAiSummary.mockResolvedValue(lookup);
  return render(<AIInsightPanel title="AI Grade Interpretation" request={REQUEST} />);
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
});

describe("the summary markup", () => {
  it("is read one way for the screen and for copying", () => {
    expect(parseAiText("**KEY**\n- a *b*")).toEqual([
      { kind: "heading", text: "KEY" },
      { kind: "bullet", runs: [{ text: "a ", bold: false, italic: false }, { text: "b", bold: false, italic: true }] },
    ]);
    expect(toPlainText("**SUMMARY**\n\n\n\n* Strong in **Math**\nWell done.")).toBe(
      "SUMMARY\n\n• Strong in Math\nWell done.",
    );
  });
});

describe("AIInsightPanel", () => {
  it("finds the saved summary for this subject on open", async () => {
    renderPanel({ mine: summary(), shared: [] });
    expect(await screen.findByText("Math")).toBeTruthy();
    expect(api.lookupAiSummary).toHaveBeenCalledWith(REQUEST);
    expect(api.callGemini).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Regenerate/ })).toBeTruthy();
    expect(screen.getByText(/by Gemini/)).toBeTruthy();
  });

  it("does not look again when the page rebuilds the same request", async () => {
    const { rerender } = renderPanel();
    await screen.findByText("No summary yet");
    rerender(<AIInsightPanel title="AI Grade Interpretation" request={{ ...REQUEST, payload: { ...REQUEST.payload } }} />);
    expect(api.lookupAiSummary).toHaveBeenCalledTimes(1);
  });

  it("starts fresh for another student, carrying nothing over", async () => {
    const { rerender } = renderPanel({ mine: summary(), shared: [] });
    expect(await screen.findByText("Math")).toBeTruthy();

    api.lookupAiSummary.mockResolvedValue({ mine: null, shared: [] });
    rerender(<AIInsightPanel title="AI Grade Interpretation" request={{ ...REQUEST, enrollmentId: 12 }} />);
    expect(await screen.findByText("No summary yet")).toBeTruthy();
    expect(screen.queryByText("Math")).toBeNull();
    expect(api.lookupAiSummary).toHaveBeenLastCalledWith({ ...REQUEST, enrollmentId: 12 });
  });

  it("warns, with the date, when the data changed after the summary was made", async () => {
    renderPanel({ mine: summary({ stale: true }), shared: [] });
    expect(await screen.findByText("The data changed after this summary was made")).toBeTruthy();
    expect(screen.getByText(/This summary is from Oct 14, 2026/)).toBeTruthy();
    expect(screen.getByText("Math")).toBeTruthy(); // still shown
  });

  it("makes and saves a summary on Analyze", async () => {
    renderPanel();
    api.callGemini.mockResolvedValue({ interpretation: TEXT, provider: "groq", summary: summary({ provider: "groq" }) });
    fireEvent.click(await screen.findByRole("button", { name: /Analyze/ }));
    expect(await screen.findByText("Math")).toBeTruthy();
    expect(api.callGemini).toHaveBeenCalledWith(REQUEST);
    expect(screen.getByText(/by Groq/)).toBeTruthy();
  });

  it("still shows an answer it could not save, and says so", async () => {
    renderPanel();
    api.callGemini.mockResolvedValue({ interpretation: TEXT, provider: "gemini", summary: null });
    fireEvent.click(await screen.findByRole("button", { name: /Analyze/ }));
    expect(await screen.findByText(/couldn.t be saved/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Share with staff/ }).disabled).toBe(true);
  });

  it("copies plain text, without the markup", async () => {
    renderPanel({ mine: summary(), shared: [] });
    fireEvent.click(await screen.findByRole("button", { name: /Copy/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("SUMMARY\n• Strong in Math"));
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("saves the owner's edit, and can put the AI's version back", async () => {
    renderPanel({ mine: summary(), shared: [] });
    fireEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    const box = screen.getByLabelText("Your version");
    expect(box.value).toBe(TEXT);

    api.editAiSummary.mockResolvedValue(summary({ text: "My notes", edited: true, edited_at: "2026-10-14T08:00:00Z" }));
    fireEvent.change(box, { target: { value: "My notes" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(await screen.findByText("My notes")).toBeTruthy();
    expect(api.editAiSummary).toHaveBeenCalledWith(3, "My notes");
    expect(screen.getByText(/Edited Oct 14, 2026/)).toBeTruthy();

    api.editAiSummary.mockResolvedValue(summary());
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    fireEvent.click(screen.getByRole("button", { name: /Restore AI version/ }));
    await waitFor(() => expect(api.editAiSummary).toHaveBeenLastCalledWith(3, ""));
  });

  it("asks before regenerating over an edit", async () => {
    renderPanel({ mine: summary({ text: "My notes", edited: true }), shared: [] });
    fireEvent.click(await screen.findByRole("button", { name: /Regenerate/ }));
    expect(await screen.findByText("Replace your edited version?")).toBeTruthy();
    expect(api.callGemini).not.toHaveBeenCalled();

    api.callGemini.mockResolvedValue({ interpretation: TEXT, provider: "gemini", summary: summary() });
    fireEvent.click(screen.getAllByRole("button", { name: "Regenerate" }).at(-1));
    await waitFor(() => expect(api.callGemini).toHaveBeenCalledWith(REQUEST));
  });

  it("shares with staff, and offers to update a shared copy that fell behind", async () => {
    renderPanel({ mine: summary(), shared: [] });
    api.shareAiSummary.mockResolvedValue(summary({ shared: true, shared_at: "2026-10-14T07:30:00Z", shared_is_current: true }));
    fireEvent.click(await screen.findByRole("button", { name: /Share with staff/ }));
    expect(await screen.findByText("Shared with staff")).toBeTruthy();
    expect(api.shareAiSummary).toHaveBeenCalledWith(3, true);
    expect(screen.getByRole("button", { name: /Stop sharing/ })).toBeTruthy();
  });

  it("says when staff still read an older shared version", async () => {
    renderPanel({
      mine: summary({ text: "My notes", edited: true, shared: true, shared_at: "2026-10-14T07:30:00Z", shared_is_current: false }),
      shared: [],
    });
    expect(await screen.findByText(/Staff still see the version you shared on/)).toBeTruthy();
    api.shareAiSummary.mockResolvedValue(summary({ shared: true, shared_is_current: true }));
    fireEvent.click(screen.getByRole("button", { name: /Share this version/ }));
    await waitFor(() => expect(api.shareAiSummary).toHaveBeenCalledWith(3, true));
  });

  it("archives only after asking", async () => {
    renderPanel({ mine: summary(), shared: [] });
    fireEvent.click(await screen.findByRole("button", { name: /^Archive$/ }));
    expect(await screen.findByText("Archive this summary?")).toBeTruthy();
    api.archiveAiSummary.mockResolvedValue(null);
    fireEvent.click(screen.getAllByRole("button", { name: /Archive/ }).at(-1));
    await waitFor(() => expect(api.archiveAiSummary).toHaveBeenCalledWith(3));
    expect(await screen.findByText("No summary yet")).toBeTruthy();
  });

  it("lists what other staff shared, read-only", async () => {
    renderPanel({
      mine: null,
      shared: [{ id: 9, text: "**NOTE**\nShared view", owner_name: "Ana Reyes", shared_at: "2026-10-13T02:00:00Z", stale: true }],
    });
    expect(await screen.findByText("Ana Reyes")).toBeTruthy();
    expect(screen.getByText("Shared by other staff (1)")).toBeTruthy();
    expect(screen.getByText("Data changed since")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Share with staff/ })).toBeNull();
  });

  it("lets Analyze run when the saved summary could not be loaded", async () => {
    api.lookupAiSummary.mockRejectedValue(new Error("down"));
    render(<AIInsightPanel title="AI" request={REQUEST} />);
    expect(await screen.findByText(/Couldn.t load your saved summary/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Analyze/ }).disabled).toBe(false);
  });
});
