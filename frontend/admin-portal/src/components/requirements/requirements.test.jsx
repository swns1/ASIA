/**
 * RequirementDocumentsPanel — the shared document checklist.
 *
 * This component replaces two divergent copies (RequirementsPage's grid and
 * StudentFormPage's DocumentsStep), and two of the cases below lock down bugs
 * that only one of those copies had:
 *
 * - the check strip read `is_expected_document` off the nested `check` object.
 *   StudentFormPage read it off the top level, where it is always undefined,
 *   so it rendered "Worth a second look" on every document it ever scanned.
 * - a PDF is never sent to the recogniser. There is no page for it to read,
 *   and showing a failed check for a perfectly good PDF is worse than saying
 *   nothing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const fetchRequirementSummary = vi.fn();
const uploadRequirement = vi.fn();
const replaceRequirement = vi.fn();
const removeRequirement = vi.fn();
const scanDocument = vi.fn();

vi.mock("../../api/requirementApi", () => ({
  fetchRequirementSummary: (...a) => fetchRequirementSummary(...a),
  uploadRequirement: (...a) => uploadRequirement(...a),
  replaceRequirement: (...a) => replaceRequirement(...a),
  removeRequirement: (...a) => removeRequirement(...a),
  resolveMediaUrl: (u) => u,
}));
vi.mock("../../api/ocrApi", () => ({ scanDocument: (...a) => scanDocument(...a) }));

const { default: RequirementDocumentsPanel } = await import("./RequirementDocumentsPanel");

const STUDENT = { student_id: 42, first_name: "Marco", last_name: "Valdez" };

function doc(over = {}) {
  return {
    requirement_type_id: 1,
    requirement_code: "psa_birth_certificate",
    requirement_name: "PSA Birth Certificate",
    description: null,
    is_required: true,
    applies: null,
    is_submitted: false,
    image_url: null,
    file_kind: null,
    remarks: null,
    submitted_at: null,
    submission_id: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  scanDocument.mockResolvedValue({ success: true, check: {} });
});

function renderPanel(props = {}) {
  return render(<RequirementDocumentsPanel studentId={42} student={STUDENT} {...props} />);
}

describe("RequirementDocumentsPanel", () => {
  it("separates required from optional", async () => {
    fetchRequirementSummary.mockResolvedValue([
      doc({ requirement_type_id: 1, requirement_name: "PSA Birth Certificate", is_required: true }),
      doc({ requirement_type_id: 2, requirement_name: "Recommendation Letter", is_required: false }),
    ]);
    renderPanel();

    await waitFor(() => expect(screen.queryByText(/Required \(1\)/)).not.toBeNull());
    expect(screen.queryByText(/Optional \(1\)/)).not.toBeNull();
    expect(screen.queryByText(/1 required document still missing/i)).not.toBeNull();
  });

  it("hides documents this learner is not asked for", async () => {
    fetchRequirementSummary.mockResolvedValue([
      doc({ requirement_type_id: 1, is_required: true, applies: true }),
      doc({ requirement_type_id: 2, requirement_name: "NCAE Result", is_required: false, applies: false }),
    ]);
    renderPanel({ context: { schoolLevel: "elementary", entryStatus: "new" } });

    await waitFor(() => expect(screen.queryByText("PSA Birth Certificate")).not.toBeNull());
    expect(screen.queryByText("NCAE Result")).toBeNull();
  });

  it("passes the placement to the server so the list can be scoped", async () => {
    fetchRequirementSummary.mockResolvedValue([]);
    renderPanel({ context: { schoolLevel: "junior_highschool", entryStatus: "transferee" } });

    await waitFor(() => expect(fetchRequirementSummary).toHaveBeenCalled());
    expect(fetchRequirementSummary).toHaveBeenCalledWith(42, {
      schoolLevel: "junior_highschool",
      entryStatus: "transferee",
    });
  });

  it("reports counts up to its host", async () => {
    fetchRequirementSummary.mockResolvedValue([
      doc({ requirement_type_id: 1, is_submitted: true }),
      doc({ requirement_type_id: 2, is_required: true }),
    ]);
    const onChange = vi.fn();
    renderPanel({ onChange });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({
      total: 2, submitted: 1, requiredMissing: 1,
    }));
  });

  it("never lists the previous student's files after a quick switch", async () => {
    // Student 42's request is slow and resolves after student 7's. Its rows
    // carry student 42's submission ids, which Replace/Remove act on.
    let finishFirst;
    fetchRequirementSummary
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce([doc({ requirement_name: "Form 138 (student 7)" })]);

    const { rerender } = renderPanel();
    rerender(<RequirementDocumentsPanel studentId={7} student={STUDENT} />);
    await waitFor(() => expect(screen.queryByText("Form 138 (student 7)")).not.toBeNull());

    finishFirst([doc({ requirement_name: "PSA (student 42)", is_submitted: true, submission_id: 900 })]);
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText("PSA (student 42)")).toBeNull();
    expect(screen.queryByText("Form 138 (student 7)")).not.toBeNull();
  });

  it("hides every action in readOnly mode", async () => {
    fetchRequirementSummary.mockResolvedValue([doc()]);
    renderPanel({ readOnly: true });

    await waitFor(() => expect(screen.queryByText("PSA Birth Certificate")).not.toBeNull());
    expect(screen.queryByTitle("Upload")).toBeNull();
    expect(screen.queryByTitle("Replace")).toBeNull();
    expect(screen.queryByTitle("Remove")).toBeNull();
  });

  it("offers Upload for a missing document and Replace/Remove for a submitted one", async () => {
    fetchRequirementSummary.mockResolvedValue([
      doc({ requirement_type_id: 1 }),
      doc({ requirement_type_id: 2, requirement_name: "Health Record", is_submitted: true, submission_id: 9 }),
    ]);
    renderPanel();

    await waitFor(() => expect(screen.queryByTitle("Upload")).not.toBeNull());
    expect(screen.queryByTitle("Replace")).not.toBeNull();
    expect(screen.queryByTitle("Remove")).not.toBeNull();
  });
});

describe("the OCR check strip", () => {
  async function openUploadAndPick(file) {
    fetchRequirementSummary.mockResolvedValue([doc()]);
    const { container } = renderPanel();
    await waitFor(() => expect(screen.queryByTitle("Upload")).not.toBeNull());
    fireEvent.click(screen.getByTitle("Upload"));
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });
    return input;
  }

  it("reads is_expected_document off the nested check object", async () => {
    // The StudentFormPage regression: it read this off the top level, where
    // it is always undefined, so every document came back "Worth a second look".
    scanDocument.mockResolvedValue({
      success: true,
      check: { is_expected_document: false, names_student: true, notes: [] },
    });
    await openUploadAndPick(new File(["x"], "wrong.png", { type: "image/png" }));

    await waitFor(() => expect(screen.queryByText(/Worth a second look/i)).not.toBeNull());
    expect(screen.queryByText(/does not look like a PSA Birth Certificate/i)).not.toBeNull();
  });

  it("says a document looks right when the reader raises nothing", async () => {
    scanDocument.mockResolvedValue({
      success: true,
      check: { is_expected_document: true, names_student: true, notes: [] },
    });
    await openUploadAndPick(new File(["x"], "ok.png", { type: "image/png" }));

    await waitFor(() => expect(screen.queryByText(/Looks right/i)).not.toBeNull());
  });

  it("never scans a PDF", async () => {
    await openUploadAndPick(new File(["x"], "doc.pdf", { type: "application/pdf" }));

    await waitFor(() => expect(screen.queryByText("doc.pdf")).not.toBeNull());
    expect(scanDocument).not.toHaveBeenCalled();
  });

  it("does not block the upload when the check is unhappy", async () => {
    scanDocument.mockResolvedValue({
      success: true,
      check: { is_expected_document: false, names_student: false, notes: [] },
    });
    uploadRequirement.mockResolvedValue({});
    await openUploadAndPick(new File(["x"], "wrong.png", { type: "image/png" }));

    await waitFor(() => expect(screen.queryByText(/Worth a second look/i)).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /upload document/i }));
    await waitFor(() => expect(uploadRequirement).toHaveBeenCalled());
  });
});
