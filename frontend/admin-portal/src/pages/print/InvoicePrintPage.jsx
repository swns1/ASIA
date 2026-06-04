import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getInvoice, getSchoolSettings } from "../../api/billingApi";
import logo from "../../assets/logo.png";

const C = {
  dark: "#1a0a0a", muted: "#7a5050", border: "#e8d8d8",
  red: "#e03131", bg: "#fff8f6",
};

const STATUS_META = {
  paid:           { label: "PAID",           color: "#2e6b0d", bg: "#e8f5e0" },
  partially_paid: { label: "PARTIALLY PAID", color: "#854f0b", bg: "#faeeda" },
  unpaid:         { label: "UNPAID",         color: "#c92a2a", bg: "#fde8e8" },
  void:           { label: "VOID",           color: "#5c5752", bg: "#f0ede8" },
};

const fmt = (v) =>
  `₱ ${parseFloat(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—";

function InfoRow({ label, value, span }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.dark, fontWeight: 600, marginTop: 1 }}>{value || "—"}</div>
    </div>
  );
}

export default function InvoicePrintPage() {
  const { invoiceId } = useParams();
  const [invoice,     setInvoice]     = useState(null);
  const [schoolName,  setSchoolName]  = useState("South Lakes Integrated School");
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [inv, settings] = await Promise.all([
          getInvoice(invoiceId),
          getSchoolSettings().catch(() => null),
        ]);
        setInvoice(inv);
        if (settings?.school_name) setSchoolName(settings.school_name);
      } catch (e) {
        setError(e.message || "Failed to load invoice data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [invoiceId]);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', Arial, sans-serif", color: C.muted, fontSize: 15 }}>
      Loading…
    </div>
  );

  if (error || !invoice) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', Arial, sans-serif" }}>
      <div style={{ textAlign: "center", color: C.red }}>{error || "Invoice not found."}</div>
    </div>
  );

  const en         = invoice.enrollment_detail ?? {};
  const statusMeta = STATUS_META[invoice.status] ?? STATUS_META.unpaid;
  const invNo      = `INV-${String(invoiceId).padStart(6, "0")}`;
  const balance    = parseFloat(invoice.balance || 0);

  return (
    <>
      {/* Toolbar */}
      <div className="no-print" style={{ background: C.dark, padding: "12px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={() => window.close()}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }} /> Close
        </button>
        <div style={{ flex: 1, color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
          Invoice {invNo} · {en.student_name ?? en.full_name ?? "—"}
        </div>
        <button onClick={() => window.print()}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 20px", border: "none", borderRadius: 8, background: C.red, color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
          <i className="ti ti-printer" style={{ fontSize: 15 }} />
          Print
        </button>
      </div>

      {/* Document */}
      <div id="invoice-doc" style={{ maxWidth: 900, margin: "32px auto", background: "white", border: `1px solid ${C.border}`, borderRadius: 12, padding: "32px 40px", fontFamily: "'DM Sans', Arial, sans-serif" }}>

        {/* School header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, borderBottom: `2px solid ${C.border}`, paddingBottom: 16 }}>
          <img src={logo} alt="Logo" style={{ width: 52, height: 76, objectFit: "contain" }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
              Republic of the Philippines — Department of Education
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, lineHeight: 1.2 }}>{schoolName}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              Student Invoice — {invNo} · School Year {en.school_year ?? "—"}
              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 9px", borderRadius: 50, color: statusMeta.color, background: statusMeta.bg }}>
                {statusMeta.label}
              </span>
            </div>
          </div>
        </div>

        {/* Bill to strip */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 24px", marginBottom: 20, padding: "14px 18px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <InfoRow label="Student Name" value={en.student_name ?? en.full_name} span />
          <InfoRow label="Student No."  value={en.student_number} />
          <InfoRow label="LRN"          value={en.lrn} />
          <InfoRow label="Grade Level"  value={en.grade_level} />
          <InfoRow label="Section"      value={en.section} />
          {en.strand && <InfoRow label="Strand" value={en.strand} />}
        </div>

        {/* Fee items */}
        {(invoice.items ?? []).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.muted, marginBottom: 8 }}>Fee Details</div>
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
              </tbody>
              <tfoot>
                <tr style={{ background: "#fff0f0", borderTop: `2px solid ${C.border}` }}>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: C.dark }}>Subtotal</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: C.dark }}>{fmt(invoice.total_items)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Discounts */}
        {(invoice.discounts ?? []).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.muted, marginBottom: 8 }}>Applied Discounts</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#7a4a00" }}>
                  <th style={{ textAlign: "left",  padding: "10px 12px", color: "white", fontWeight: 700, borderRadius: "6px 0 0 0" }}>Discount Type</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", color: "white", fontWeight: 700, borderRadius: "0 6px 0 0", width: 130 }}>Deduction</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.discounts ?? []).map((d, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "white" : "#faeeda", borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "9px 12px", color: "#7a4a00" }}>
                      {d.discount_type_detail?.discount_name ?? d.description ?? "—"}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "right", color: "#7a4a00", fontWeight: 600 }}>− {fmt(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#faeeda", borderTop: `2px solid #d9b07a` }}>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#7a4a00" }}>Total Discounts</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#7a4a00" }}>− {fmt(invoice.total_discounts)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Payment history */}
        {(invoice.payments ?? []).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.muted, marginBottom: 8 }}>Payment History</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#1a3a5f" }}>
                  <th style={{ textAlign: "left",   padding: "10px 12px", color: "white", fontWeight: 700, borderRadius: "6px 0 0 0" }}>Date</th>
                  <th style={{ textAlign: "center", padding: "10px 12px", color: "white", fontWeight: 700 }}>Method</th>
                  <th style={{ textAlign: "right",  padding: "10px 12px", color: "white", fontWeight: 700, borderRadius: "0 6px 0 0", width: 130 }}>Amount Paid</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.payments ?? []).map((p, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "white" : "#f0f4fa", borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "9px 12px", color: C.dark }}>{fmtDate(p.payment_date)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "center", color: C.muted, fontSize: 12 }}>
                      {(p.payment_method ?? "").replace("_", " ").toUpperCase()}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#1455a0" }}>{fmt(p.amount_paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div style={{ padding: "14px 18px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 24 }}>
          <TotRow label="Subtotal"       value={fmt(invoice.total_items)} />
          {parseFloat(invoice.total_discounts || 0) > 0 && (
            <TotRow label="Total Discounts" value={`− ${fmt(invoice.total_discounts)}`} muted />
          )}
          <div style={{ borderTop: `1px solid ${C.border}`, margin: "8px 0" }} />
          <TotRow label="Net Amount Due" value={fmt(invoice.net_amount)} bold />
          <TotRow label="Total Paid"     value={fmt(invoice.total_paid)} green />
          <div style={{ borderTop: `2px solid ${C.border}`, margin: "8px 0" }} />
          <TotRow label="Balance" value={fmt(invoice.balance)} accent={balance > 0} green={balance <= 0} bold />
        </div>

        {/* Footer */}
        <div style={{ marginTop: 32, borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            Generated: {new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
          </div>
          <SigBlock label="Registrar / Cashier" />
          <SigBlock label="School Principal's Signature" />
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          #invoice-doc { max-width: 100% !important; margin: 0 !important; border: none !important; border-radius: 0 !important; padding: 24px 32px !important; }
        }
      `}</style>
    </>
  );
}

function TotRow({ label, value, bold, muted, green, accent }) {
  const color = accent ? "#c92a2a" : green ? "#2e6b0d" : C.dark;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
      <span style={{ fontSize: bold ? 13 : 12, fontWeight: bold ? 700 : 500, color: muted ? C.muted : C.dark }}>{label}</span>
      <span style={{ fontSize: bold ? 16 : 13, fontWeight: 700, color }}>{value}</span>
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