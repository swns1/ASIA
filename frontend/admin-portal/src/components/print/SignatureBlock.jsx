// SignatureBlock.jsx
//
// Shared signature-line footer, generalized from "SigBlock" (COR/GradeSlip/
// Invoice/Receipt — 4 copies, label below the line) and "SigLine" (SF9/SF10 —
// 2 copies, label above the line), plus SF1PrintPage.jsx's bespoke
// prepared-by block and ReportCardPage.jsx's twice-inlined raw signature
// markup (no helper at all). Also generalizes the "Generated: {date}" stamp
// duplicated as its own line in all 9 documents.
import { PRINT_COLORS } from "./theme";

export function SignatureRow({ children }) {
  return (
    <div style={{ marginTop: 32, borderTop: `1px solid ${PRINT_COLORS.border}`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
      {children}
    </div>
  );
}

export function SignatureBlock({ heading, printedName, role, caption, width = 200 }) {
  return (
    <div style={{ textAlign: "center", fontSize: 11, color: PRINT_COLORS.muted }}>
      {heading && (
        <div style={{ fontSize: 10, fontWeight: 600, textAlign: "left", marginBottom: 22 }}>{heading}</div>
      )}
      <div style={{ borderTop: `1px solid ${PRINT_COLORS.dark}`, width, margin: "0 auto 4px" }} />
      {printedName && <div style={{ fontSize: 11, fontWeight: 700, color: PRINT_COLORS.dark }}>{printedName}</div>}
      <div>{role}</div>
      {caption && <div style={{ fontSize: 9, color: "#8a7a7a", marginTop: 2 }}>{caption}</div>}
    </div>
  );
}

export function GeneratedStamp() {
  return (
    <div style={{ fontSize: 11, color: PRINT_COLORS.muted }}>
      Generated: {new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
    </div>
  );
}
