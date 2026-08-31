import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getPayments, getInvoice, getSchoolSettings } from "../../api/billingApi";
import { downloadAsPDF } from "../../utils/pdfExport";
import { PRINT_COLORS as C } from "../../components/print/theme";
import { PrintToolbar, ToolbarButton } from "../../components/print/PrintToolbar";
import { PrintShell, PrintLoading, PrintError } from "../../components/print/PrintShell";
import { PrintLetterhead } from "../../components/print/PrintLetterhead";
import { InfoGrid, InfoItem } from "../../components/print/InfoGrid";
import { SignatureRow, SignatureBlock, GeneratedStamp } from "../../components/print/SignatureBlock";

const METHOD_LABEL = {
  cash:          "Cash",
  gcash:         "GCash",
  bank_transfer: "Bank Transfer",
  check:         "Check",
  online:        "Online Payment",
};

const fmt = (v) =>
  `₱ ${parseFloat(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "—";

function amountInWords(amount) {
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
    "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];

  function cvt(n) {
    if (n === 0) return "";
    if (n < 20)  return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + cvt(n % 100) : "");
  }

  const n     = parseFloat(amount || 0);
  const whole = Math.floor(n);
  const cents = Math.round((n - whole) * 100);
  let result  = "";
  if (whole >= 1000000) { result += cvt(Math.floor(whole / 1000000)) + " Million "; }
  const rem = whole % 1000000;
  if (rem >= 1000) { result += cvt(Math.floor(rem / 1000)) + " Thousand "; }
  result += cvt(whole % 1000);
  if (!result.trim()) result = "Zero";
  return result.trim() + " Peso" + (whole !== 1 ? "s" : "") + (cents ? ` and ${cents}/100` : " Only");
}

export default function ReceiptPrintPage() {
  const { paymentId } = useParams();
  const [payment,        setPayment]        = useState(null);
  const [invoice,        setInvoice]        = useState(null);
  const [schoolName,     setSchoolName]     = useState("South Lakes Integrated School");
  const [schoolAddress,  setSchoolAddress]  = useState("");
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [downloading,    setDownloading]    = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await getPayments({ payment_id: paymentId });
        const pay  = Array.isArray(list) ? list[0] : (list.results ?? [])[0];
        if (!pay) throw new Error("Payment not found.");
        setPayment(pay);

        const [inv, settings] = await Promise.all([
          getInvoice(pay.invoice),
          getSchoolSettings().catch(() => null),
        ]);
        setInvoice(inv);
        if (settings?.school_name) setSchoolName(settings.school_name);
        if (settings?.school_address) setSchoolAddress(settings.school_address);
      } catch (e) {
        setError(e.message || "Failed to load payment data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [paymentId]);

  const handleDownload = async () => {
    setDownloading(true);
    await downloadAsPDF("receipt-doc", `Receipt-${paymentId}.pdf`);
    setDownloading(false);
  };

  if (loading) return <PrintLoading label="Loading…" />;
  if (error || !payment || !invoice) return <PrintError message={error || "Payment not found."} />;

  const en          = invoice.enrollment_detail ?? {};
  const studentName = en.student_name ?? en.full_name ?? "—";
  const orNo        = `PAY-${String(paymentId).padStart(6, "0")}`;
  const prevPaid    = parseFloat(invoice.total_paid || 0) - parseFloat(payment.amount_paid || 0);

  return (
    <>
      <PrintToolbar
        onBack={() => window.close()}
        title={`Official Receipt — ${orNo} · ${studentName}`}
        actions={
          <>
            <ToolbarButton onClick={handleDownload} disabled={downloading} icon="download">
              {downloading ? "Generating…" : "Download PDF"}
            </ToolbarButton>
            <ToolbarButton onClick={() => window.print()} primary icon="printer">Print</ToolbarButton>
          </>
        }
      />

      <PrintShell id="receipt-doc" maxWidth={900} orientation="portrait">
        <PrintLetterhead
          variant="standard"
          schoolName={schoolName}
          schoolAddress={schoolAddress}
          subtitle={`Official Receipt — ${orNo} · ${fmtDate(payment.payment_date)}`}
        />

        <InfoGrid columns={3}>
          <InfoItem label="Received From"  value={studentName}       span />
          <InfoItem label="Student No."    value={en.student_number} />
          <InfoItem label="LRN"            value={en.lrn} />
          <InfoItem label="Grade Level"    value={en.grade_level} />
          <InfoItem label="Section"        value={en.section} />
          <InfoItem label="School Year"    value={en.school_year ?? invoice.school_year} />
          <InfoItem label="Payment Method" value={METHOD_LABEL[payment.payment_method] ?? payment.payment_method} />
          {payment.reference_number && (
            <InfoItem label="Reference No." value={payment.reference_number} />
          )}
        </InfoGrid>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.muted, marginBottom: 8 }}>
            Invoice #{invoice.invoice_id} — Fee Breakdown
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.dark }}>
                <th style={{ textAlign: "left",  padding: "10px 12px", color: "white", fontWeight: 700, borderRadius: "6px 0 0 0" }}>Description</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "white", fontWeight: 700, borderRadius: "0 6px 0 0", width: 130 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items ?? []).map((item, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "white" : C.bg, borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "9px 12px", color: C.dark }}>{item.description}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", color: C.dark, fontWeight: 500 }}>{fmt(item.amount)}</td>
                </tr>
              ))}
              {(invoice.discounts ?? []).map((d, i) => (
                <tr key={`d${i}`} style={{ background: i % 2 === 0 ? "white" : C.bg, borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "9px 12px", color: C.amber }}>
                    <span style={{ fontSize: 11 }}>Discount:</span>{" "}
                    {d.discount_type_detail?.discount_name ?? d.description ?? "—"}
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right", color: C.amber, fontWeight: 600 }}>− {fmt(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: "12px 16px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 16 }}>
          <TotRow label="Total Amount Due"  value={fmt(invoice.net_amount)} />
          <TotRow label="Previously Paid"   value={fmt(prevPaid)} />
          <div style={{ borderTop: `1px solid ${C.border}`, margin: "8px 0" }} />
          <TotRow label="This Payment"      value={fmt(payment.amount_paid)} accent />
          <TotRow label="Remaining Balance" value={fmt(invoice.balance)} />
        </div>

        <div style={{ padding: "10px 14px", background: C.redBg, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 16 }}>
          <span style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Amount in Words: </span>
          <span style={{ fontSize: 13, color: C.dark, fontWeight: 600 }}>{amountInWords(payment.amount_paid)}</span>
        </div>

        {payment.notes && (
          <div style={{ padding: "8px 14px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 16, fontSize: 12, color: C.muted }}>
            <strong>Notes:</strong> {payment.notes}
          </div>
        )}

        <SignatureRow>
          <div style={{ fontSize: 11, color: C.muted }}>
            <GeneratedStamp />
            <div style={{ marginTop: 4, fontStyle: "italic" }}>This is your official receipt. Please keep for your records.</div>
          </div>
          <SignatureBlock role="Cashier / Received by" />
          <SignatureBlock role="Student / Parent / Guardian" />
        </SignatureRow>
      </PrintShell>
    </>
  );
}

function TotRow({ label, value, accent }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: accent ? "4px 0 0" : "2px 0" }}>
      <span style={{ fontSize: accent ? 13 : 12, fontWeight: accent ? 700 : 500, color: accent ? C.dark : C.muted }}>{label}</span>
      <span style={{ fontSize: accent ? 16 : 13, fontWeight: 700, color: accent ? C.red : C.dark }}>{value}</span>
    </div>
  );
}
