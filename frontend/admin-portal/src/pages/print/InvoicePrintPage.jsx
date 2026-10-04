import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getInvoice, getSchoolSettings } from "../../api/billingApi";
import { downloadAsPDF } from "../../utils/pdfExport";
import { PRINT_COLORS as C } from "../../components/print/theme";
import { PrintToolbar, ToolbarButton } from "../../components/print/PrintToolbar";
import { PrintShell, PrintLoading, PrintError } from "../../components/print/PrintShell";
import { PrintLetterhead } from "../../components/print/PrintLetterhead";
import { DocTitleRow } from "../../components/print/DocTitleRow";
import { InfoGrid, InfoItem } from "../../components/print/InfoGrid";
import { SignatureRow, SignatureBlock, GeneratedStamp } from "../../components/print/SignatureBlock";
import { INVOICE_STATUS_META } from "../../components/print/statusMeta";

const fmt = (v) =>
  `₱ ${parseFloat(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—";

const PLAN_LABEL = {
  monthly:     "Monthly",
  quarterly:   "Quarterly",
  semi_annual: "Semi-Annual",
  annual:      "Annual",
};

const METHOD_LABEL = {
  cash:          "Cash",
  gcash:         "GCash",
  bank_transfer: "Bank Transfer",
  card:          "Card",
  check:         "Check",
  others:        "Others",
};

// Item descriptions are stored as "[Category] Name" (see the billing
// service's invoice generation). The category gets its own column here, and
// tuition is listed first because it is the line the discounts apply to.
const CATEGORY_ORDER = { Tuition: 0, Miscellaneous: 1, Other: 2 };

function splitItem(description) {
  const m = /^\[(.*?)\]\s*(.*)$/.exec(description ?? "");
  if (!m) return { category: "", name: description ?? "" };
  return { category: m[1] === "Misc" ? "Miscellaneous" : m[1], name: m[2] };
}

// One ink throughout: the dark header bar and rules carry the structure, so
// nothing on the page depends on colour to be read — it photocopies and
// prints in black-and-white without losing anything.
const TH  = { padding: "6px 10px", color: "white", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "left" };
const TD  = { padding: "4px 10px", color: C.dark, borderBottom: `1px solid ${C.border}` };
const NUM = { textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

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
    // try/finally, not a bare await: html2pdf rejects on a failed capture or
    // save, and without this the rejection propagated out of the handler and
    // setDownloading(false) never ran -- leaving the button disabled and
    // reading "Generating..." forever, with nothing shown to say why.
    try {
      await downloadAsPDF("invoice-doc", `Invoice-${invoiceId}.pdf`);
    } catch (err) {
      console.error("PDF export failed", err);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <PrintLoading label="Loading…" />;
  if (error || !invoice) return <PrintError message={error || "Invoice not found."} />;

  const en        = invoice.enrollment_detail ?? {};
  // The billing service's own number (INV-<year>-<id>), so the printout
  // matches what the Invoices page and the guardian portal show.
  const invNo     = invoice.invoice_no || `INV-${String(invoiceId).padStart(6, "0")}`;
  const status    = INVOICE_STATUS_META[invoice.status] ?? INVOICE_STATUS_META.unpaid;
  const discounts = invoice.discounts ?? [];
  const payments  = invoice.payments ?? [];
  const items     = (invoice.items ?? [])
    .map((item) => ({ ...item, ...splitItem(item.description) }))
    .sort((a, b) => (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9));

  const gradeSection = [
    [en.grade_level, en.strand].filter(Boolean).join(" · "),
    en.section,
  ].filter(Boolean).join(" – ");

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

      <PrintShell id="invoice-doc" maxWidth={900} orientation="portrait" pageMargin="10mm 14mm">
        <PrintLetterhead variant="standard" schoolName={schoolName} schoolAddress={schoolAddress} />

        <DocTitleRow
          title="Student Invoice"
          meta={[
            ["Invoice No.",  invNo],
            ["Invoice Date", fmtDate(invoice.invoice_date)],
            // Not `due_date`: on an installment plan that is the first
            // installment's date, already past on any mid-year reprint. The
            // serializer leaves next_due_date null once nothing is owed.
            ...(invoice.next_due_date ? [["Next Due Date", fmtDate(invoice.next_due_date)]] : []),
          ]}
        />

        <InfoGrid columns={4} tinted={false}>
          <InfoItem label="Student Name"    value={en.student_name ?? en.full_name} span={2} />
          <InfoItem label="Student No."     value={en.student_number} />
          <InfoItem label="LRN"             value={en.lrn} />
          <InfoItem label="Grade & Section" value={gradeSection} />
          <InfoItem label="School Year"     value={en.school_year} />
          <InfoItem label="Payment Plan"    value={PLAN_LABEL[invoice.payment_plan] ?? invoice.payment_plan} />
          <InfoItem
            label="Status"
            value={
              <span style={{ display: "inline-block", border: `1px solid ${C.dark}`, borderRadius: 4, padding: "0 7px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
                {status.label}
              </span>
            }
          />
        </InfoGrid>

        {items.length > 0 && (
          <Section title="Fee Details">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, lineHeight: 1.3 }}>
              <thead>
                <tr style={{ background: C.dark }}>
                  <th style={TH}>Description</th>
                  <th style={{ ...TH, width: 150 }}>Category</th>
                  <th style={{ ...TH, ...NUM, width: 140 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.invoice_item_id ?? item.description}>
                    <td style={TD}>{item.name}</td>
                    <td style={{ ...TD, color: C.muted }}>{item.category}</td>
                    <td style={{ ...TD, ...NUM }}>{fmt(item.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} style={{ ...TD, ...NUM, fontWeight: 700 }}>Total Fees</td>
                  <td style={{ ...TD, ...NUM, fontWeight: 700 }}>{fmt(invoice.total_items)}</td>
                </tr>
                {discounts.map((d, i) => (
                  <tr key={d.invoice_discount_id ?? i}>
                    <td colSpan={2} style={TD}>
                      <span style={{ color: C.muted }}>Less: </span>
                      {d.discount_type_detail?.discount_name ?? d.description ?? "—"}
                    </td>
                    <td style={{ ...TD, ...NUM }}>− {fmt(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ ...TD, ...NUM, borderTop: `2px solid ${C.dark}`, borderBottom: "none", fontWeight: 800, fontSize: 13.5 }}>
                    Net Amount Due
                  </td>
                  <td style={{ ...TD, ...NUM, borderTop: `2px solid ${C.dark}`, borderBottom: "none", fontWeight: 800, fontSize: 13.5 }}>
                    {fmt(invoice.net_amount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Section>
        )}

        {/* Always shown, even with no payments yet: its footer is where the
            balance lives. Total Paid and Balance Due close this table the way
            Net Amount Due closes the one above, rather than repeating all
            three in a separate box — which also kept a full year of monthly
            payments from fitting on one page. */}
        <Section title="Payment History">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, lineHeight: 1.3 }}>
            <thead>
              <tr style={{ background: C.dark }}>
                <th style={{ ...TH, width: 110 }}>Date</th>
                <th style={{ ...TH, width: 120 }}>Receipt No.</th>
                <th style={{ ...TH, width: 120 }}>Method</th>
                <th style={TH}>Reference No.</th>
                <th style={{ ...TH, ...NUM, width: 140 }}>Amount Paid</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...TD, color: C.muted, textAlign: "center", fontStyle: "italic" }}>No payments recorded yet.</td>
                </tr>
              )}
              {payments.map((p) => (
                <tr key={p.payment_id}>
                  <td style={TD}>{fmtDate(p.payment_date)}</td>
                  <td style={TD}>PAY-{String(p.payment_id).padStart(6, "0")}</td>
                  <td style={TD}>{METHOD_LABEL[p.payment_method] ?? p.payment_method}</td>
                  <td style={{ ...TD, color: C.muted }}>{p.reference_number || "—"}</td>
                  <td style={{ ...TD, ...NUM }}>{fmt(p.amount_paid)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ ...TD, ...NUM, fontWeight: 700 }}>Total Paid</td>
                <td style={{ ...TD, ...NUM, fontWeight: 700 }}>{fmt(invoice.total_paid)}</td>
              </tr>
              <tr>
                <td colSpan={4} style={{ ...TD, ...NUM, borderTop: `2px solid ${C.dark}`, borderBottom: "none", fontWeight: 800, fontSize: 13.5 }}>
                  Balance Due
                </td>
                <td style={{ ...TD, ...NUM, borderTop: `2px solid ${C.dark}`, borderBottom: "none", fontWeight: 800, fontSize: 13.5 }}>
                  {fmt(invoice.balance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </Section>

        <SignatureRow>
          <GeneratedStamp />
          <SignatureBlock role="Registrar / Cashier" />
          <SignatureBlock role="School Principal" />
        </SignatureRow>
      </PrintShell>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.muted, marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
