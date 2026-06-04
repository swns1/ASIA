import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getPayments, getInvoice, getSchoolSettings } from "../../api/billingApi";
import logo from "../../assets/logo.png";

const C = {
  dark: "#1a0a0a", muted: "#7a5050", border: "#e8d8d8",
  red: "#e03131", bg: "#fff8f6",
};

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

function InfoRow({ label, value, span }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.dark, fontWeight: 600, marginTop: 1 }}>{value || "—"}</div>
    </div>
  );
}

export default function ReceiptPrintPage() {
  const { paymentId } = useParams();
  const [payment,     setPayment]     = useState(null);
  const [invoice,     setInvoice]     = useState(null);
  const [schoolName,  setSchoolName]  = useState("South Lakes Integrated School");
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

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
      } catch (e) {
        setError(e.message || "Failed to load payment data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [paymentId]);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', Arial, sans-serif", color: C.muted, fontSize: 15 }}>
      Loading…
    </div>
  );

  if (error || !payment || !invoice) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', Arial, sans-serif" }}>
      <div style={{ textAlign: "center", color: C.red }}>{error || "Payment not found."}</div>
    </div>
  );

  const en          = invoice.enrollment_detail ?? {};
  const studentName = en.student_name ?? en.full_name ?? "—";
  const orNo        = `PAY-${String(paymentId).padStart(6, "0")}`;
  const prevPaid    = parseFloat(invoice.total_paid || 0) - parseFloat(payment.amount_paid || 0);

  return (
    <>
      {/* Toolbar */}
      <div className="no-print" style={{ background: C.dark, padding: "12px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={() => window.close()}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }} /> Close
        </button>
        <div style={{ flex: 1, color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
          Official Receipt — {orNo} · {studentName}
        </div>
        <button onClick={() => window.print()}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 20px", border: "none", borderRadius: 8, background: C.red, color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
          <i className="ti ti-printer" style={{ fontSize: 15 }} />
          Print
        </button>
      </div>

      {/* Document */}
      <div id="receipt-doc" style={{ maxWidth: 900, margin: "32px auto", background: "white", border: `1px solid ${C.border}`, borderRadius: 12, padding: "32px 40px", fontFamily: "'DM Sans', Arial, sans-serif" }}>

        {/* School header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, borderBottom: `2px solid ${C.border}`, paddingBottom: 16 }}>
          <img src={logo} alt="Logo" style={{ width: 52, height: 76, objectFit: "contain" }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
              Republic of the Philippines — Department of Education
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, lineHeight: 1.2 }}>{schoolName}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              Official Receipt — {orNo} · {fmtDate(payment.payment_date)}
            </div>
          </div>
        </div>

        {/* Received from strip */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 24px", marginBottom: 20, padding: "14px 18px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <InfoRow label="Received From"  value={studentName}       span />
          <InfoRow label="Student No."    value={en.student_number} />
          <InfoRow label="LRN"            value={en.lrn} />
          <InfoRow label="Grade Level"    value={en.grade_level} />
          <InfoRow label="Section"        value={en.section} />
          <InfoRow label="School Year"    value={en.school_year ?? invoice.school_year} />
          <InfoRow label="Payment Method" value={METHOD_LABEL[payment.payment_method] ?? payment.payment_method} />
          {payment.reference_number && (
            <InfoRow label="Reference No." value={payment.reference_number} />
          )}
        </div>

        {/* Invoice breakdown */}
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
                  <td style={{ padding: "9px 12px", color: "#854f0b" }}>
                    <span style={{ fontSize: 11 }}>Discount:</span>{" "}
                    {d.discount_type_detail?.discount_name ?? d.description ?? "—"}
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right", color: "#854f0b", fontWeight: 600 }}>− {fmt(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payment summary */}
        <div style={{ padding: "12px 16px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 16 }}>
          <TotRow label="Total Amount Due"  value={fmt(invoice.net_amount)} />
          <TotRow label="Previously Paid"   value={fmt(prevPaid)} />
          <div style={{ borderTop: `1px solid ${C.border}`, margin: "8px 0" }} />
          <TotRow label="This Payment"      value={fmt(payment.amount_paid)} accent />
          <TotRow label="Remaining Balance" value={fmt(invoice.balance)} />
        </div>

        {/* Amount in words */}
        <div style={{ padding: "10px 14px", background: "#fff0f0", borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 16 }}>
          <span style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Amount in Words: </span>
          <span style={{ fontSize: 13, color: C.dark, fontWeight: 600 }}>{amountInWords(payment.amount_paid)}</span>
        </div>

        {payment.notes && (
          <div style={{ padding: "8px 14px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 16, fontSize: 12, color: C.muted }}>
            <strong>Notes:</strong> {payment.notes}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 32, borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            <div>Generated: {new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}</div>
            <div style={{ marginTop: 4, fontStyle: "italic" }}>This is your official receipt. Please keep for your records.</div>
          </div>
          <SigBlock label="Cashier / Received by" />
          <SigBlock label="Student / Parent / Guardian" />
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          #receipt-doc { max-width: 100% !important; margin: 0 !important; border: none !important; border-radius: 0 !important; padding: 24px 32px !important; }
        }
      `}</style>
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

function SigBlock({ label }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ borderTop: `1px solid ${C.dark}`, width: 200, marginBottom: 4 }} />
      <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
    </div>
  );
}