/**
 * RequirementsPage on a dark page: the list, a learner's checklist (the
 * shared panel, with its lit icon tiles and progress bar), and the document
 * windows it opens: the upload dialog with the reader's verdict, and the
 * viewer. Also the panel's own load error.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeContext } from "../../hooks/useTheme";

const fetchRequirementSummary = vi.fn();
const scanDocument = vi.fn();

vi.mock("../../api/enrollmentApi", () => ({
  getDocumentStatus: () => Promise.resolve({
    count: 1, next: null, previous: null,
    summary: { learners: 1, complete: 0, missing: 1 },
    results: [{
      student_id: 2, first_name: "Ben", middle_name: null, last_name: "Uy", suffix: null,
      lrn: "1002", student_number: "S-2", enrollment_id: 11, enrollment_status: "pending",
      school_level: "junior_highschool", grade_level: "Grade 7", section: "Rizal",
      entry_status: "transferee", required: 2, submitted: 1,
      missing: [{ requirement_type_id: 12, requirement_name: "Form 137/138" }],
    }],
  }),
}));
vi.mock("../../api/studentApi", () => ({ getStudent: vi.fn() }));
vi.mock("../../api/requirementApi", () => ({
  fetchRequirementSummary: (...a) => fetchRequirementSummary(...a),
  uploadRequirement: vi.fn(),
  replaceRequirement: vi.fn(),
  removeRequirement: vi.fn(),
  resolveMediaUrl: (u) => u,
}));
vi.mock("../../api/ocrApi", () => ({ scanDocument: (...a) => scanDocument(...a) }));
vi.mock("../../context/SchoolYearContext", () => ({
  useSchoolYear: () => ({
    currentYear: "2026-2027",
    options: ["2026-2027"],
    yearCounts: {},
    yearStates: { "2026-2027": "current" },
  }),
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const { default: RequirementsPage } = await import("../RequirementsPage");

const doc = (over) => ({
  requirement_type_id: 1, requirement_code: "form_137_or_138", requirement_name: "Form 137/138",
  description: null, is_required: true, applies: true, is_submitted: false, image_url: null,
  file_kind: null, remarks: null, submitted_at: null, submission_id: null,
  ...over,
});
const DOCS = [
  doc({}),
  doc({ requirement_type_id: 2, requirement_code: "recommendation_letter", requirement_name: "Recommendation Letter", is_required: false }),
  doc({
    requirement_type_id: 3, requirement_code: "psa_birth_certificate", requirement_name: "PSA Birth Certificate",
    is_submitted: true, submission_id: 9, image_url: "/files/psa.png", file_kind: "image",
    submitted_at: "2026-06-01T00:00:00Z",
  }),
];

const renderDark = () => render(
  <ThemeContext.Provider value="dark">
    <div data-theme="dark">
      <MemoryRouter initialEntries={["/requirements"]}>
        <RequirementsPage />
      </MemoryRouter>
    </div>
  </ThemeContext.Provider>,
);

async function openChecklist() {
  renderDark();
  fireEvent.click(await screen.findByText("Uy, Ben"));
  await screen.findByText(/Required \(1\)/);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("access_token", "t");
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Ada", role: "admin" }));
  fetchRequirementSummary.mockResolvedValue(DOCS);
  scanDocument.mockResolvedValue({ success: true, check: { is_expected_document: true, names_student: true, notes: [] } });
});

describe("RequirementsPage — dark mode", () => {
  it("lists the learners and what they still owe", async () => {
    renderDark();
    expect(await screen.findByText("Uy, Ben")).toBeTruthy();
    expect(screen.getByText("Missing 1 of 2")).toBeTruthy();
  });

  it("opens a learner's checklist, sorted by what's owed", async () => {
    await openChecklist();
    expect(screen.getByText(/Optional \(1\)/)).toBeTruthy();
    expect(screen.getByText(/Submitted \(1\)/)).toBeTruthy();
    expect(screen.getByText("1 required document still missing.")).toBeTruthy();
    expect(screen.getByText("1 / 3")).toBeTruthy();
  });

  it("uploads a document with the reader's verdict", async () => {
    await openChecklist();
    fireEvent.click(screen.getAllByTitle("Upload")[0]);
    const dialog = await screen.findByRole("dialog");
    const input = dialog.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [new File(["x"], "form137.png", { type: "image/png" })] } });
    expect(await within(dialog).findByText("Looks right")).toBeTruthy();
  });

  it("shows a submitted document in the viewer", async () => {
    await openChecklist();
    fireEvent.click(screen.getByTitle("View"));
    const viewer = await screen.findByRole("dialog", { name: "PSA Birth Certificate" });
    expect(within(viewer).getByRole("img", { name: "PSA Birth Certificate" })).toBeTruthy();
    expect(within(viewer).getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("says so when the checklist can't load", async () => {
    fetchRequirementSummary.mockRejectedValue(new Error("Documents are unavailable."));
    renderDark();
    fireEvent.click(await screen.findByText("Uy, Ben"));
    expect(await screen.findByText("Documents are unavailable.")).toBeTruthy();
  });
});
