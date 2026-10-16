// The SF9 page shows the server's PDF (school_forms/sf9.py): DepEd's folded
// report card with the school's letterhead. It is also the report card the
// enrollment page and the guardian portal open. It passes on what the server
// warned about, shows why a card was refused without stranding anyone, and
// offers the file where a browser can't show a PDF inside the page.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const downloadSchoolForm = vi.fn();
const saveBlob = vi.fn();

vi.mock("../../api/enrollmentApi", () => ({ downloadSchoolForm: (...a) => downloadSchoolForm(...a) }));
vi.mock("../../utils/download", () => ({ saveBlob: (...a) => saveBlob(...a) }));

const { default: SF9PrintPage } = await import("./SF9PrintPage");

const TITLE = "Learner's Progress Report Card";
const PDF = { blob: new Blob(["%PDF-"]), filename: "SF9_109100000005_Dela-Cruz_SY2026-2027.pdf", warnings: [] };

function renderAt(path = "/print/sf9/41", route = "/print/sf9/:enrollmentId") {
  render(
    <MemoryRouter initialEntries={["/before", path]}>
      <Routes>
        <Route path="/before" element={<div>The page before</div>} />
        <Route path={route} element={<SF9PrintPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SF9PrintPage", () => {
  const createObjectURL = vi.fn(() => "blob:sf9-1");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    [downloadSchoolForm, saveBlob, createObjectURL, revokeObjectURL].forEach((f) => f.mockClear());
    // jsdom has no object URLs.
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete navigator.pdfViewerEnabled;
  });

  it("shows the server's report card", async () => {
    downloadSchoolForm.mockResolvedValue(PDF);
    renderAt();

    const frame = await screen.findByTitle(TITLE);
    expect(frame.getAttribute("src")).toBe("blob:sf9-1");
    expect(downloadSchoolForm).toHaveBeenCalledWith("sf9/41", {}, "SF9-41.pdf");
    expect(screen.getByText(PDF.filename)).toBeTruthy();
  });

  it("is the same document at the report card's address", async () => {
    downloadSchoolForm.mockResolvedValue(PDF);
    renderAt("/report-card/11", "/report-card/:enrollmentId");

    expect(await screen.findByTitle(TITLE)).toBeTruthy();
    expect(downloadSchoolForm).toHaveBeenCalledWith("sf9/11", {}, "SF9-11.pdf");
  });

  it("downloads the same file it shows", async () => {
    downloadSchoolForm.mockResolvedValue(PDF);
    renderAt();
    await screen.findByTitle(TITLE);

    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));
    expect(saveBlob).toHaveBeenCalledWith(PDF.blob, PDF.filename);
  });

  it("lists what the server could not fill in", async () => {
    const warning = "No adviser is assigned to Grade 7 – Rizal for 2026-2027, so the adviser's lines print without a name.";
    downloadSchoolForm.mockResolvedValue({ ...PDF, warnings: [warning] });
    renderAt();
    expect(await screen.findByText(warning)).toBeTruthy();
  });

  it("shows why the server refused, with the way back still there", async () => {
    downloadSchoolForm.mockRejectedValue(new Error("This enrollment hasn't started yet, so there is no report card."));
    renderAt();

    expect(await screen.findByText("This enrollment hasn't started yet, so there is no report card.")).toBeTruthy();
    expect(screen.queryByTitle(TITLE)).toBeNull();
    expect(screen.getByRole("button", { name: /Download PDF/ }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByText("The page before")).toBeTruthy();
  });

  it("offers the file where the browser shows no PDF inside a page", async () => {
    Object.defineProperty(navigator, "pdfViewerEnabled", { value: false, configurable: true });
    downloadSchoolForm.mockResolvedValue(PDF);
    renderAt();

    const open = await screen.findByRole("link", { name: "Open the report card" });
    expect(open.getAttribute("href")).toBe("blob:sf9-1");
    expect(screen.queryByTitle(TITLE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save PDF" }));
    expect(saveBlob).toHaveBeenCalledWith(PDF.blob, PDF.filename);
  });
});
