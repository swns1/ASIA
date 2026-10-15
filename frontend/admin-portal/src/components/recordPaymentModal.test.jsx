import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import toast from "react-hot-toast";
import RecordPaymentModal from "./RecordPaymentModal";
import { sendPaymentReceipt } from "../api/billingApi";

vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

// The window's controls, after its styling moved onto the design tokens.
vi.mock("../api/billingApi", () => ({
  getInvoice: vi.fn(() =>
    Promise.resolve({
      invoice_id: 7,
      invoice_no: "INV-2026-000007",
      status: "partial",
      net_amount: "10000.00",
      total_paid: "4000.00",
      balance: "6000.00",
      enrollment_detail: {
        student_name: "Ana Reyes",
        grade_level: "Grade 7",
        section: "Rizal",
        school_year: "2026-2027",
      },
      installments: [],
    })
  ),
  getInvoices: vi.fn(() => Promise.resolve({ results: [] })),
  createPayment: vi.fn(() => Promise.resolve({ payment_id: 45 })),
  sendPaymentReceipt: vi.fn(() => Promise.resolve({ sent_to: ["maria@example.com"] })),
}));

const noop = () => {};

describe("RecordPaymentModal", () => {
  it("lets the cashier pick a payment method", () => {
    render(<RecordPaymentModal preloadedInvoiceId={null} onClose={noop} onSaved={noop} />);
    const cash = screen.getByRole("button", { name: /^Cash$/ });
    const gcash = screen.getByRole("button", { name: /^GCash$/ });
    expect(cash.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(gcash);
    expect(gcash.getAttribute("aria-pressed")).toBe("true");
    expect(cash.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows the chosen invoice and fills in its full balance", async () => {
    render(<RecordPaymentModal preloadedInvoiceId={7} onClose={noop} onSaved={noop} />);
    await screen.findByText("INV-2026-000007");
    expect(screen.getByText("Ana Reyes")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Full balance/ }));
    expect(screen.getByPlaceholderText("0.00").value).toBe("6000");
  });

  async function recordFullBalance() {
    render(<RecordPaymentModal preloadedInvoiceId={7} onClose={noop} onSaved={noop} />);
    await screen.findByText("INV-2026-000007");
    fireEvent.click(screen.getByRole("button", { name: /Full balance/ }));
    fireEvent.click(screen.getByRole("button", { name: /Record Payment/ }));
  }

  it("emails the receipt for the payment it just recorded", async () => {
    sendPaymentReceipt.mockClear();
    await recordFullBalance();
    await waitFor(() => expect(sendPaymentReceipt).toHaveBeenCalledWith(45));
  });

  it("stays quiet while email isn't set up", async () => {
    toast.error.mockClear();
    sendPaymentReceipt.mockImplementationOnce(() =>
      Promise.reject({ response: { status: 503, data: { code: "email_not_configured" } } }));
    await recordFullBalance();
    await waitFor(() => expect(sendPaymentReceipt).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says so when the receipt email fails, without undoing the payment", async () => {
    toast.error.mockClear();
    toast.success.mockClear();
    sendPaymentReceipt.mockImplementationOnce(() =>
      Promise.reject({ response: { status: 502, data: {} } }));
    await recordFullBalance();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "Payment recorded, but the receipt email could not be sent."));
    expect(toast.success).toHaveBeenCalledWith("Payment recorded.");
  });
});
