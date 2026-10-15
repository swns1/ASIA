// The receipt prints the server's figures (billing/receipts.py) -- the same
// ones the emailed copy is rendered from -- and can email itself.
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import toast from "react-hot-toast";
import ReceiptPrintPage from "./ReceiptPrintPage";
import { sendPaymentReceipt } from "../../api/billingApi";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("../../utils/pdfExport", () => ({ downloadAsPDF: vi.fn() }));
vi.mock("../../api/billingApi", () => ({
  getPayment: vi.fn(() => Promise.resolve({
    payment_id: 12, invoice: 9, payment_date: "2026-07-05", amount_paid: "1500.00",
    payment_method: "gcash", reference_number: null, notes: null,
    receipt: {
      receipt_no: "PAY-000012", net_amount: "9000.00", previously_paid: "2500.00",
      this_payment: "1500.00", balance_after: "5000.00",
      amount_in_words: "One Thousand Five Hundred Pesos Only",
    },
  })),
  // Today's invoice figures differ from the receipt's: later payments exist.
  getInvoice: vi.fn(() => Promise.resolve({
    invoice_id: 9, invoice_no: "INV-2026-0009", net_amount: "9000.00",
    total_paid: "9000.00", balance: "0.00", payments: [],
    enrollment_detail: { student_name: "Juan Dela Cruz", school_year: "2026-2027" },
  })),
  getSchoolSettings: vi.fn(() => Promise.resolve(null)),
  sendPaymentReceipt: vi.fn(() => Promise.resolve({ sent_to: ["maria@example.com"] })),
}));

function renderReceipt() {
  render(
    <MemoryRouter initialEntries={["/print/receipt/12"]}>
      <Routes><Route path="/print/receipt/:paymentId" element={<ReceiptPrintPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe("ReceiptPrintPage", () => {
  it("prints the account as it stood at this payment, from the server", async () => {
    renderReceipt();
    expect(await screen.findByText("One Thousand Five Hundred Pesos Only")).toBeTruthy();
    expect(screen.getAllByText("PAY-000012").length).toBeGreaterThan(0);
    expect(screen.getByText("− ₱ 2,500.00")).toBeTruthy();
    expect(screen.getByText("₱ 5,000.00")).toBeTruthy();
  });

  it("emails the receipt and names who it went to", async () => {
    renderReceipt();
    fireEvent.click(await screen.findByRole("button", { name: /Email receipt/ }));
    await waitFor(() => expect(sendPaymentReceipt).toHaveBeenCalledWith(12));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Receipt emailed to maria@example.com."));
  });

  it("shows the server's reason when it can't send", async () => {
    sendPaymentReceipt.mockImplementationOnce(() => Promise.reject({
      message: "Something went wrong on the server.",
      response: { status: 503, data: { code: "email_not_configured",
        detail: "Email is not configured on the server, so no receipt was sent." } },
    }));
    renderReceipt();
    fireEvent.click(await screen.findByRole("button", { name: /Email receipt/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "Email is not configured on the server, so no receipt was sent."));
  });
});
