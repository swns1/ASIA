import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getInvoice, getSchoolSettings } from "../../api/billingApi";
import { downloadAsPDF } from "../../utils/pdfExport";
import { PRINT_COLORS as C } from "../../components/print/theme";
import { PrintToolbar, ToolbarButton } from "../../components/print/PrintToolbar";
import { PrintShell, PrintLoading, PrintError } from "../../components/print/PrintShell";
import { PrintLetterhead } from "../../components/print/PrintLetterhead";
import { InfoGrid, InfoItem } from "../../components/print/InfoGrid";
import { SignatureRow, SignatureBlock, GeneratedStamp } from "../../components/print/SignatureBlock";
import { StatusBadge } from "../../components/print/StatusBadge";
import { INVOICE_STATUS_META } from "../../components/print/statusMeta";

const fmt = (v) =>
  `₱ ${parseFloat(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—";

export default function InvoicePrintPage() {
  const { invoiceId } = useParams();
  const [invoice,        setInvoice]        = useState(null);
  const [schoolName,     setSchoolName]     = useState("South Lakes Integrated School");
  const [schoolAddress,  setSchoolAddress]  = useState("");
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [downloading,    setDownloading]    = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [inv, settings] = await Promise.all([
          getInvoice(invoiceId),
          getSchoolSettings().catch(() => null),
        ]);
        setInvoice(inv);
        if (settings?.school_name) setSchoolName(settings.school_name);
        if (settings?.school_address) setSchoolAddress(settings.school_address);
      } catch (e) {
        setError(e.message || "Failed to load invoice data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [invoiceId]);

  const handleDownload = async () => {
    setDownloading(true);
    await downloadAsPDF("invoice-doc", `Invoice-${invoiceId}.pdf`);
    setDownloading(false);
  };

  if (loading) return <PrintLoading label="Loading…" />;
  if (error || !invoice) return <PrintError message={error || "Invoice not found."} />;

  const en      = invoice.enrollment_detail ?? {};
  const invNo   = `INV-${String(invoiceId).padStart(6, "0")}`;
  const balance = parseFloat(invoice.balance || 0);

  return (
    <>
      <PrintToolbar
        onBack={() => window.close()}
        title={`Invoice ${invNo} · ${en.student_name ?? en.full_name ?? "—"}`}
        actions={
          <>
            <ToolbarButton onClick={handleDownload} disabled={downloading} icon="download">
              {downloading ? "Generating…" : "Download PDF"}
            </ToolbarButton>
            <ToolbarButton onClick={() => window.print()} primary icon="printer">Print</ToolbarButton>
          </>
        }
      />

      <PrintShell id="invoice-doc" maxWidth={900} orientation="portrait">
        <PrintLetterhead
          variant="standard"
          schoolName={schoolName}
          schoolAddress={schoolAddress}
          subtitle={`Student Invoice — ${invNo} · School Year ${en.school_year ?? "—"}`}
        />

        <InfoGrid columns={3}>
          <InfoItem label="Student Name" value={en.student_name ?? en.full_name} span />
          <InfoItem label="Student No."  value={en.student_number} />
          <InfoItem label="LRN"          value={en.lrn} />
          <InfoItem label="Grade Level"  value={en.grade_level} />
          <InfoItem label="Section"      value={en.section} />
          {en.strand && <InfoItem label="Strand" value={en.strand} />}
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</span>
            <StatusBadge status={invoice.status} meta={INVOICE_STATUS_META} defaultKey="unpaid" />
          </div>
        </InfoGrid>

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
                <tr style={{ background: C.redBg, borderTop: `2px solid ${C.border}` }}>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: C.dark }}>Subtotal</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: C.dark }}>{fmt(invoice.total_items)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {(invoice.discounts ?? []).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.muted, marginBottom: 8 }}>Applied Discounts</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.amber }}>
                  <th style={{ textAlign: "left",  padding: "10px 12px", color: "white", fontWeight: 700, borderRadius: "6px 0 0 0" }}>Discount Type</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", color: "white", fontWeight: 700, borderRadius: "0 6px 0 0", width: 130 }}>Deduction</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.discounts ?? []).map((d, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "white" : C.amberBg, borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "9px 12px", color: C.amber }}>
                      {d.discount_type_detail?.discount_name ?? d.description ?? "—"}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "right", color: C.amber, fontWeight: 600 }}>− {fmt(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: C.amberBg, borderTop: `2px solid ${C.amber}` }}>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: C.amber }}>Total Discounts</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: C.amber }}>− {fmt(invoice.total_discounts)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {(invoice.payments ?? []).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.muted, marginBottom: 8 }}>Payment History</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.blue }}>
                  <th style={{ textAlign: "left",   padding: "10px 12px", color: "white", fontWeight: 700, borderRadius: "6px 0 0 0" }}>Date</th>
                  <th style={{ textAlign: "center", padding: "10px 12px", color: "white", fontWeight: 700 }}>Method</th>
                  <th style={{ textAlign: "right",  padding: "10px 12px", color: "white", fontWeight: 700, borderRadius: "0 6px 0 0", width: 130 }}>Amount Paid</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.payments ?? []).map((p, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "white" : C.blueBg, borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "9px 12px", color: C.dark }}>{fmtDate(p.payment_date)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "center", color: C.muted, fontSize: 12 }}>
                      {(p.payment_method ?? "").replace("_", " ").toUpperCase()}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: C.blue }}>{fmt(p.amount_paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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

        <SignatureRow>
          <GeneratedStamp />
          <SignatureBlock role="Registrar / Cashier" />
          <SignatureBlock role="School Principal's Signature" />
        </SignatureRow>
      </PrintShell>
    </>
  );
}

function TotRow({ label, value, bold, muted, green, accent }) {
  const color = accent ? C.red : green ? C.green : C.dark;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
      <span style={{ fontSize: bold ? 13 : 12, fontWeight: bold ? 700 : 500, color: muted ? C.muted : C.dark }}>{label}</span>
      <span style={{ fontSize: bold ? 16 : 13, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}
