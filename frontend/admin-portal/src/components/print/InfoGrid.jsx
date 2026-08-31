// InfoGrid.jsx
//
// Shared label/value info display, generalized from two concepts that were
// really the same idea styled two ways: "InfoRow" (COR/GradeSlip/Invoice/
// Receipt/ReportCard — 5 near-identical copies, label above value, no
// underline) and "InfoCell" (SF9/SF10 — 2 copies, label above value WITH an
// underline beneath it). SF1's inline "Label: value" strip is a genuinely
// different layout (horizontal, not a grid) so it keeps its own InfoStrip
// wrapper, but reuses the same InfoItem in its `inline` mode.
import { PRINT_COLORS } from "./theme";

export function InfoGrid({ columns = 3, tinted = true, bordered = false, children }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: bordered ? "5px 16px" : "10px 24px",
      marginBottom: 20,
      padding: bordered ? "9px 12px" : "14px 18px",
      background: tinted ? PRINT_COLORS.bg : "white",
      border: `1px solid ${bordered ? "#aaa" : PRINT_COLORS.border}`,
      borderRadius: bordered ? 0 : 8,
    }}>
      {children}
    </div>
  );
}

export function InfoStrip({ children }) {
  return (
    <div style={{ display: "flex", gap: 28, marginBottom: 10, fontSize: 11, flexWrap: "wrap", padding: "6px 2px", borderBottom: `1px solid ${PRINT_COLORS.border}` }}>
      {children}
    </div>
  );
}

export function InfoItem({ label, value, span, bordered = false, inline = false, placeholderWidth = 80 }) {
  if (inline) {
    return (
      <span>
        <span style={{ color: PRINT_COLORS.muted, fontWeight: 500 }}>{label}: </span>
        <strong style={{ color: PRINT_COLORS.dark }}>
          {value || <span style={{ borderBottom: "1px solid #bbb", display: "inline-block", width: placeholderWidth }}>&nbsp;</span>}
        </strong>
      </span>
    );
  }

  const spanStyle = span === true ? { gridColumn: "1 / -1" } : span ? { gridColumn: `1 / ${span + 1}` } : {};

  return (
    <div style={spanStyle}>
      <div style={{
        fontSize: bordered ? 9 : 10, color: PRINT_COLORS.muted, textTransform: "uppercase",
        letterSpacing: "0.05em", fontWeight: 700, marginBottom: bordered ? 1 : 0,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: bordered ? 12 : 13, fontWeight: bordered ? 700 : 600, color: PRINT_COLORS.dark,
        marginTop: bordered ? 0 : 1,
        ...(bordered ? { borderBottom: "1px solid #999", paddingBottom: 1, minHeight: 16 } : {}),
      }}>
        {value || "—"}
      </div>
    </div>
  );
}
