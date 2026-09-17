// PrintShell.jsx
//
// Shared document card + @media print / @page rules, generalized from the
// inconsistent per-file <style> blocks across all 9 print/report documents
// (@page was nested inside @media print in some, top-level in others, or
// missing entirely in 5 of them; SF2PrintPage.jsx was missing the .no-print
// rule altogether, letting its toolbar print). This component makes both bugs
// structurally impossible: @page is always emitted top-level, and .no-print
// is always defined. Print padding is always collapsed to 0 and margin is
// handled solely via @page, instead of the old pattern of applying both an
// @page margin and a large inner padding override.
import { PRINT_COLORS, PRINT_FONT } from "./theme";

export function PrintShell({
  id,
  maxWidth = 900,
  orientation = "portrait",
  pageMargin,
  padding = "32px 40px",
  backdrop = false,
  accent = false,
  children,
}) {
  const margin = pageMargin ?? (orientation === "landscape" ? "8mm" : "12mm 16mm");

  const doc = (
    <div
      id={id}
      style={{
        maxWidth, margin: "32px auto", background: "white",
        border: `1px solid ${PRINT_COLORS.border}`,
        ...(accent ? { borderTop: `4px solid ${PRINT_COLORS.red}` } : {}),
        borderRadius: 12,
        padding, fontFamily: PRINT_FONT,
      }}
    >
      {children}
    </div>
  );

  return (
    <>
      {backdrop ? (
        <div className="print-shell-backdrop" style={{ background: "#ececec", minHeight: "100vh", padding: 24, fontFamily: PRINT_FONT }}>
          {doc}
        </div>
      ) : doc}

      <style>{`
        @page { size: A4 ${orientation}; margin: ${margin}; }
        #${id} table { word-break: break-word; overflow-wrap: break-word; }
        #${id} thead { display: table-header-group; }
        /* Browsers default <tfoot> to display:table-footer-group, which repeats it at
           the bottom of every page a table spans — correct for a running subtotal, but
           every tfoot in this app holds a one-time grand total (GWA, invoice subtotal),
           so left at the default it shows the final total prematurely mid-table too. */
        #${id} tfoot { display: table-row-group; }
        #${id} tr { break-inside: avoid; page-break-inside: avoid; }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
        }
        /* This lean-layout ruleset is duplicated under both selectors below rather than
           shared, because html2canvas (the html2pdf.js export path, see utils/pdfExport.js)
           captures the DOM's live on-screen state and never triggers @media print itself —
           without the body.force-print-layout selector, an exported PDF would include the
           on-screen card's padding/border/rounded corners instead of this edge-to-edge layout. */
        @media print {
          .print-shell-backdrop { background: white !important; padding: 0 !important; min-height: 0 !important; }
          #${id} {
            max-width: 100% !important;
            margin: 0 !important;
            border: none !important;
            ${accent ? `border-top: 4px solid ${PRINT_COLORS.red} !important;` : ""}
            border-radius: 0 !important;
            padding: 0 !important;
          }
        }
        body.force-print-layout .print-shell-backdrop { background: white !important; padding: 0 !important; min-height: 0 !important; }
        body.force-print-layout #${id} {
          max-width: 100% !important;
          margin: 0 !important;
          border: none !important;
          ${accent ? `border-top: 4px solid ${PRINT_COLORS.red} !important;` : ""}
          border-radius: 0 !important;
          padding: 0 !important;
        }
      `}</style>
    </>
  );
}

export function PrintLoading({ label }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: PRINT_FONT, color: PRINT_COLORS.muted, fontSize: 15 }}>
      {label}
    </div>
  );
}

export function PrintError({ message }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: PRINT_FONT }}>
      <div style={{ textAlign: "center", color: PRINT_COLORS.red }}>{message}</div>
    </div>
  );
}

// On-screen only: names the sections that failed to load, so a form with a
// silently-empty attendance or grades block is never printed as if complete.
export function PrintIncompleteWarning({ sections }) {
  if (!sections?.length) return null;
  return (
    <div
      className="no-print"
      role="alert"
      style={{
        maxWidth: 900, margin: "16px auto 0", padding: "10px 16px",
        border: "1px solid #fca5a5", borderRadius: 10, background: "#fef2f2",
        color: "#b91c1c", fontSize: 13, fontFamily: PRINT_FONT,
        display: "flex", alignItems: "center", gap: 8,
      }}
    >
      <i className="ti ti-alert-triangle" style={{ fontSize: 16 }} />
      <span>
        Could not load: <strong>{sections.join(", ")}</strong>. Those parts of
        this form are blank — reload the page before printing.
      </span>
    </div>
  );
}
