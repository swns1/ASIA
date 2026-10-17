// The COR page shows the server's PDF (school_forms/cor.py): the COR, then
// the Admissions Agreement. It asks for the school's copy or the parent's,
// passes on what the server warned about, and shows why a print was refused.
// A guardian gets the parent's copy only, opened in place with a Back button.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const downloadSchoolForm = vi.fn();
const saveBlob = vi.fn();
const getCurrentUser = vi.fn(() => ({ role: "registrar" }));

vi.mock("../../api/enrollmentApi", () => ({ downloadSchoolForm: (...a) => downloadSchoolForm(...a) }));
vi.mock("../../utils/download", () => ({ saveBlob: (...a) => saveBlob(...a) }));
vi.mock("../../utils/auth", () => ({ getCurrentUser: () => getCurrentUser() }));

const { default: CORPrintPage } = await import("./CORPrintPage");

const PDF = { blob: new Blob(["%PDF-"]), filename: "COR_109100000005_Dela-Cruz_SY2026-2027.pdf", warnings: [] };

// Staff open it in a tab of its own (the first page); a guardian from their
// child's page, in the same tab.
function renderCOR({ from } = {}) {
  render(
    <MemoryRouter initialEntries={from ? [from, "/print/cor/41"] : ["/print/cor/41"]} initialIndex={from ? 1 : 0}>
      <Routes>
        <Route path="/print/cor/:enrollmentId" element={<CORPrintPage />} />
        <Route path="*" element={<p>Child page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CORPrintPage", () => {
  const createObjectURL = vi.fn(() => "blob:cor-1");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    [downloadSchoolForm, saveBlob, createObjectURL, revokeObjectURL].forEach((f) => f.mockClear());
    getCurrentUser.mockReturnValue({ role: "registrar" });
    // jsdom has no object URLs.
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the school's copy of the server's PDF", async () => {
    downloadSchoolForm.mockResolvedValue(PDF);
    renderCOR();

    const frame = await screen.findByTitle("Certificate of Registration and Admissions Agreement");
    expect(frame.getAttribute("src")).toBe("blob:cor-1");
    expect(downloadSchoolForm).toHaveBeenCalledWith("cor/41", { copy: "slis" }, "COR-41.pdf");
    expect(screen.getByText(PDF.filename)).toBeTruthy();
    expect(screen.getByRole("button", { name: "SLIS Copy" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("asks for the parent's copy and lets the old file go", async () => {
    downloadSchoolForm.mockResolvedValue(PDF);
    renderCOR();
    await screen.findByTitle("Certificate of Registration and Admissions Agreement");

    fireEvent.click(screen.getByRole("button", { name: "Parent's Copy" }));
    await waitFor(() => expect(downloadSchoolForm).toHaveBeenLastCalledWith("cor/41", { copy: "parent" }, "COR-41.pdf"));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cor-1");
    expect(screen.getByRole("button", { name: "Parent's Copy" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("downloads the same file it shows", async () => {
    downloadSchoolForm.mockResolvedValue(PDF);
    renderCOR();
    await screen.findByTitle("Certificate of Registration and Admissions Agreement");

    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));
    expect(saveBlob).toHaveBeenCalledWith(PDF.blob, PDF.filename);
  });

  it("lists what the server could not fill in", async () => {
    const warning = "No Junior High School Principal is set under Billing Settings › School Forms.";
    downloadSchoolForm.mockResolvedValue({ ...PDF, warnings: [warning] });
    renderCOR();
    expect(await screen.findByText(warning)).toBeTruthy();
  });

  it("shows why the server refused", async () => {
    downloadSchoolForm.mockRejectedValue(new Error("This enrollment was cancelled, so there is no registration to certify."));
    renderCOR();
    expect(await screen.findByText("This enrollment was cancelled, so there is no registration to certify.")).toBeTruthy();
    expect(screen.queryByTitle("Certificate of Registration and Admissions Agreement")).toBeNull();
  });

  it("closes the tab staff opened it in", async () => {
    downloadSchoolForm.mockResolvedValue(PDF);
    const close = vi.spyOn(window, "close").mockImplementation(() => {});
    renderCOR();
    await screen.findByTitle("Certificate of Registration and Admissions Agreement");

    fireEvent.click(screen.getByRole("button", { name: /Close/ }));
    expect(close).toHaveBeenCalled();
  });

  it("gives a guardian the parent's copy only, and Back to their child's page", async () => {
    getCurrentUser.mockReturnValue({ role: "guardian" });
    downloadSchoolForm.mockResolvedValue(PDF);
    renderCOR({ from: "/guardian/children/7" });
    await screen.findByTitle("Certificate of Registration and Admissions Agreement");

    expect(downloadSchoolForm).toHaveBeenCalledWith("cor/41", { copy: "parent" }, "COR-41.pdf");
    expect(screen.queryByRole("button", { name: "SLIS Copy" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByText("Child page")).toBeTruthy();
  });
});
