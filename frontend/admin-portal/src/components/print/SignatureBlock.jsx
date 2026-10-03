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
    <div style={{ marginTop: 20, borderTop: `1px solid ${PRINT_COLORS.border}`, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap", breakInside: "avoid", pageBreakInside: "avoid" }}>
      {children}
    </div>
  );
}

// Room to actually sign above the line — about 12mm on paper. It used to be
// whatever happened to sit above the line: 12px of row padding on a block
// with no heading, 22px under a "Prepared by:" heading. Neither fit a pen
// signature, so signers wrote across the line or over the heading.
const SIGNING_SPACE = 44;

export function SignatureBlock({ heading, printedName, role, caption, width = 200 }) {
  return (
    <div style={{ textAlign: "center", fontSize: 11, color: PRINT_COLORS.muted }}>
      {heading && (
        <div style={{ fontSize: 10, fontWeight: 600, textAlign: "left" }}>{heading}</div>
      )}
      <div style={{ height: SIGNING_SPACE }} />
      <div style={{ borderTop: `1px solid ${PRINT_COLORS.dark}`, width, margin: "0 auto 4px" }} />
      {printedName && <div style={{ fontSize: 11, fontWeight: 700, color: PRINT_COLORS.dark }}>{printedName}</div>}
      <div>{role}</div>
      {caption && <div style={{ fontSize: 9, color: "#8a6a6a", marginTop: 2 }}>{caption}</div>}
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
