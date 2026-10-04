import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getPayment, getInvoice, getSchoolSettings } from "../../api/billingApi";
import { downloadAsPDF } from "../../utils/pdfExport";
import { PRINT_COLORS as C } from "../../components/print/theme";
import { PrintToolbar, ToolbarButton } from "../../components/print/PrintToolbar";
import { PrintShell, PrintLoading, PrintError } from "../../components/print/PrintShell";
import { PrintLetterhead } from "../../components/print/PrintLetterhead";
import { DocTitleRow } from "../../components/print/DocTitleRow";
import { SignatureRow, SignatureBlock, GeneratedStamp } from "../../components/print/SignatureBlock";

// Mirrors StudentPayment.PAYMENT_METHOD_CHOICES in
// backend/billing-service/billing/models.py.
const METHOD_LABEL = {
  cash:          "Cash",
  gcash:         "GCash",
  bank_transfer: "Bank Transfer",
  card:          "Card",
  check:         "Check",
  others:        "Others",
};

const fmt = (v) =>
  `₱ ${parseFloat(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "—";

// Whole centavos, so sums of several payments can't drift by a float error.
const toCents = (v) => Math.round(parseFloat(v || 0) * 100);

function amountInWords(amount) {
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
    "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];

  function cvt(n) {
    if (n === 0) return "";
    if (n < 20)  return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + cvt(n % 100) : "");
  }

  // Split the fixed-point string rather than subtracting floats: 0.29 * 100
  // is 28.999…, which is one rounding away from printing the wrong centavos.
  const [wholeStr, centsStr] = parseFloat(amount || 0).toFixed(2).split(".");
  const whole = parseInt(wholeStr, 10);
  const cents = parseInt(centsStr, 10);
  let result  = "";
  if (whole >= 1000000) { result += cvt(Math.floor(whole / 1000000)) + " Million "; }
  const rem = whole % 1000000;
  if (rem >= 1000) { result += cvt(Math.floor(rem / 1000)) + " Thousand "; }
  result += cvt(whole % 1000);
  if (!result.trim()) result = "Zero";
  return result.trim() + " Peso" + (whole !== 1 ? "s" : "") + (cents ? ` and ${centsStr}/100` : "") + " Only";
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
        // The detail route, not getPayments({ payment_id }): the list
        // endpoint has no payment_id filter, so it ignored the parameter and
        // every receipt printed whichever payment was recorded most recently.
        const pay = await getPayment(paymentId);
        setPayment(pay);

        const [inv, settings] = await Promise.all([
          getInvoice(pay.invoice),
          getSchoolSettings().catch(() => null),
        ]);
        setInvoice(inv);
        if (settings?.school_name) setSchoolName(settings.school_name);
        if (settings?.school_address) setSchoolAddress(settings.school_address);
      } catch (e) {
        setError(e.response?.status === 404 ? "Payment not found." : (e.message || "Failed to load payment data."));
      } finally {
        setLoading(false);
      }
    })();
  }, [paymentId]);

  const handleDownload = async () => {
    setDownloading(true);
    // try/finally, not a bare await: html2pdf rejects on a failed capture or
    // save, and without this the rejection propagated out of the handler and
    // setDownloading(false) never ran -- leaving the button disabled and
    // reading "Generating..." forever, with nothing shown to say why.
    try {
      await downloadAsPDF("receipt-doc", `Receipt-${paymentId}.pdf`);
    } catch (err) {
      console.error("PDF export failed", err);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <PrintLoading label="Loading…" />;
  if (error || !payment || !invoice) return <PrintError message={error || "Payment not found."} />;

  const en          = invoice.enrollment_detail ?? {};
  const studentName = en.student_name ?? en.full_name ?? "—";
  const orNo        = `PAY-${String(paymentId).padStart(6, "0")}`;

  // The account as it stood when THIS payment was made. invoice.total_paid
  // and invoice.balance are today's figures, so reprinting an early receipt
  // used to count every later payment as "previously paid".
  const ordered = [...(invoice.payments ?? [])].sort((a, b) =>
    a.payment_date === b.payment_date ? a.payment_id - b.payment_id : (a.payment_date < b.payment_date ? -1 : 1));
  const idx           = ordered.findIndex((p) => p.payment_id === payment.payment_id);
  const thisCents     = toCents(payment.amount_paid);
  const prevCents     = idx >= 0
    ? ordered.slice(0, idx).reduce((s, p) => s + toCents(p.amount_paid), 0)
    : toCents(invoice.total_paid) - thisCents;
  const balanceCents  = Math.max(0, toCents(invoice.net_amount) - prevCents - thisCents);

  const gradeSection = [
    [en.grade_level, en.strand].filter(Boolean).join(" · "),
    en.section,
  ].filter(Boolean).join(" – ");

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
        <PrintLetterhead variant="standard" schoolName={schoolName} schoolAddress={schoolAddress} />

        <DocTitleRow
          title="Official Receipt"
          meta={[
            ["Receipt No.", orNo],
            ["Date",        fmtDate(payment.payment_date)],
          ]}
        />

        <div style={{ border: `1.5px solid ${C.dark}`, borderRadius: 6, padding: "12px 16px", marginBottom: 18,
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.muted }}>
              Amount Received
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, marginTop: 3, lineHeight: 1.4 }}>
              {amountInWords(payment.amount_paid)}
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.dark, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {fmt(payment.amount_paid)}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: 24, marginBottom: 8, alignItems: "start" }}>
          <div>
            <SectionLabel>Payment Details</SectionLabel>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <tbody>
                <DetailRow label="Received From"   value={studentName} strong />
                <DetailRow label="Student No."     value={en.student_number} />
                <DetailRow label="LRN"             value={en.lrn} />
                <DetailRow label="Grade & Section" value={gradeSection} />
                <DetailRow label="School Year"     value={en.school_year ?? invoice.school_year} />
                <DetailRow label="Invoice No."     value={invoice.invoice_no || `#${invoice.invoice_id}`} />
                <DetailRow label="Payment Method"  value={METHOD_LABEL[payment.payment_method] ?? payment.payment_method} />
                {payment.reference_number && <DetailRow label="Reference No." value={payment.reference_number} />}
                {payment.notes && <DetailRow label="Notes" value={payment.notes} />}
              </tbody>
            </table>
          </div>

          <div>
            <SectionLabel>Account Summary</SectionLabel>
            <div style={{ border: `1px solid ${C.dark}`, borderRadius: 6, padding: "10px 14px" }}>
              <TotRow label="Total Amount Due" value={fmt(invoice.net_amount)} />
              <TotRow label="Previously Paid"  value={`− ${fmt(prevCents / 100)}`} />
              <TotRow label="This Payment"     value={`− ${fmt(thisCents / 100)}`} />
              <div style={{ borderTop: `1px solid ${C.dark}`, margin: "6px 0" }} />
              <TotRow label="Remaining Balance" value={fmt(balanceCents / 100)} bold />
            </div>
          </div>
        </div>

        <SignatureRow>
          <div style={{ fontSize: 11, color: C.muted }}>
            <GeneratedStamp />
            <div style={{ marginTop: 4, fontStyle: "italic" }}>Please keep this receipt for your records.</div>
          </div>
          <SignatureBlock role="Received by (Cashier)" />
          <SignatureBlock role="Student / Parent / Guardian" />
        </SignatureRow>
      </PrintShell>
    </>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.muted, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function DetailRow({ label, value, strong }) {
  return (
    <tr>
      <td style={{ padding: "5px 12px 5px 0", width: 130, color: C.muted, fontSize: 11.5, verticalAlign: "top", borderBottom: `1px solid ${C.border}` }}>
        {label}
      </td>
      <td style={{ padding: "5px 0", color: C.dark, fontWeight: strong ? 700 : 600, borderBottom: `1px solid ${C.border}`, overflowWrap: "anywhere" }}>
        {value || "—"}
      </td>
    </tr>
  );
}

function TotRow({ label, value, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "2px 0", color: C.dark }}>
      <span style={{ fontSize: bold ? 13 : 12, fontWeight: bold ? 800 : 500 }}>{label}</span>
      <span style={{ fontSize: bold ? 15 : 12.5, fontWeight: bold ? 800 : 600, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
