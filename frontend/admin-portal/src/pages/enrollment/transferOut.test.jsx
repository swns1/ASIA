/**
 * EnrollmentDetailPage — transferring a student out.
 *
 * The transfer is two writes in two services: enrollment-service flips the
 * enrollment, then billing-service closes out the invoice's remaining
 * installments. The second step used to depend on the invoice the page had
 * loaded for its Invoice card, which is only fetched for billing roles — so
 * when a registrar recorded the transfer, the invoice was never closed and the
 * family's future installments kept falling overdue.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const api = {
  getEnrollment: vi.fn(),
  getEnrollmentEligibility: vi.fn(),
  getGrades: vi.fn(),
  getEnrollmentScholarships: vi.fn(),
  updateEnrollment: vi.fn(),
  transferOutEnrollment: vi.fn(),
  getInvoices: vi.fn(),
  closeOutInvoiceForTransfer: vi.fn(),
  updateStudentStatus: vi.fn(),
};
const pass = (name) => (...a) => api[name](...a);

vi.mock("../../api/enrollmentApi", () => ({
  getEnrollment: pass("getEnrollment"),
  getEnrollmentEligibility: pass("getEnrollmentEligibility"),
  getGrades: pass("getGrades"),
  getEnrollmentScholarships: pass("getEnrollmentScholarships"),
  updateEnrollment: pass("updateEnrollment"),
  transferOutEnrollment: pass("transferOutEnrollment"),
  getEnrollmentEmailStatus: vi.fn(() => Promise.resolve({ failures: [] })),
  sendEnrollmentEmail: vi.fn(),
}));
vi.mock("../../api/billingApi", () => ({
  getInvoices: pass("getInvoices"),
  closeOutInvoiceForTransfer: pass("closeOutInvoiceForTransfer"),
}));
vi.mock("../../api/studentApi", () => ({ updateStudentStatus: pass("updateStudentStatus") }));
vi.mock("../../components/requirements/RequirementDocumentsPanel", () => ({ default: () => null }));

const { default: EnrollmentDetailPage } = await import("../EnrollmentDetailPage");

const ENROLLMENT = {
  enrollment_id: 55,
  student_id: 9,
  student_name: "Ana Cruz",
  enrollment_status: "enrolled",
  school_level: "elementary",
  grade_level: "Grade 3",
  section: "Rizal",
  school_year: "2026-2027",
};
const INVOICE = { invoice_id: 301, invoice_no: "INV-2026-000301", status: "unpaid" };

function signInAs(role) {
  sessionStorage.setItem("current_user", JSON.stringify({ name: "Staff", role }));
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/enrollments/55"]}>
      <Routes>
        <Route path="/enrollments/:id" element={<EnrollmentDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function transferOut() {
  fireEvent.click(await screen.findByRole("button", { name: /Transfer Out/ }));
  fireEvent.change(screen.getByPlaceholderText(/Explain why/), { target: { value: "Family moving to Cebu" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.getEnrollment.mockResolvedValue(ENROLLMENT);
  api.getEnrollmentEligibility.mockResolvedValue({ entry_status: "continuing" });
  api.getGrades.mockResolvedValue([]);
  api.getEnrollmentScholarships.mockResolvedValue([]);
  api.getInvoices.mockResolvedValue({ results: [INVOICE] });
  api.transferOutEnrollment.mockResolvedValue({
    enrollment: { ...ENROLLMENT, enrollment_status: "transferred_out" },
  });
  api.closeOutInvoiceForTransfer.mockResolvedValue({ ...INVOICE, status: "partially_paid" });
  api.updateStudentStatus.mockResolvedValue({});
});

describe("EnrollmentDetailPage — transfer out", () => {
  it("closes out the invoice when a registrar records the transfer", async () => {
    signInAs("registrar");
    renderPage();
    await transferOut();

    await waitFor(() =>
      expect(api.closeOutInvoiceForTransfer).toHaveBeenCalledWith(301, expect.objectContaining({ effective_date: expect.any(String) })),
    );
  });

  it("closes out the invoice for billing staff too", async () => {
    signInAs("admin");
    renderPage();
    await transferOut();

    await waitFor(() => expect(api.closeOutInvoiceForTransfer).toHaveBeenCalledWith(301, expect.anything()));
  });

  it("does nothing to billing when the enrollment was never invoiced", async () => {
    signInAs("registrar");
    api.getInvoices.mockResolvedValue({ results: [] });
    renderPage();
    await transferOut();

    await waitFor(() => expect(api.updateStudentStatus).toHaveBeenCalled());
    expect(api.closeOutInvoiceForTransfer).not.toHaveBeenCalled();
    expect(screen.queryByText(/closing out the invoice/)).toBeNull();
  });

  it("says so when the invoice can't be found to close out", async () => {
    signInAs("registrar");
    api.getInvoices.mockRejectedValue(new Error("503"));
    renderPage();
    await transferOut();

    expect(await screen.findByText(/closing out the invoice's remaining installments failed/)).toBeTruthy();
  });

  it("does not show a failed invoice load as 'No invoice generated yet'", async () => {
    signInAs("admin");
    api.getInvoices.mockRejectedValue(new Error("503"));
    renderPage();

    expect(await screen.findByText(/Couldn't load the invoice/)).toBeTruthy();
    expect(screen.queryByText("No invoice generated yet.")).toBeNull();
  });
});
