// PrintLetterhead.jsx
//
// Shared DepEd-style letterhead, generalized from SF1PrintPage.jsx's 3-column
// header (region/division left, centered logo+title, spacer right) for the
// `deped` variant, and from the single-row logo+centered-text header shared
// by CORPrintPage/GradeSlipPrintPage/InvoicePrintPage/ReceiptPrintPage/
// ReportCardPage for the `standard` variant. No official DepEd seal graphic
// exists in this repo — both variants stay text-only ("Republic of the
// Philippines / Department of Education"), paired with the school's own
// crest (assets/logo.png).
import { PRINT_COLORS, LOGO_SIZE, LOGO_SIZE_LG } from "./theme";
import logo from "../../assets/logo.png";

export function PrintLetterhead({
  schoolName,
  schoolAddress,
  region,
  division,
  district,
  formCode,
  title,
  subtitle,
  variant = "standard",
  size = "default",
}) {
  const logoSize = size === "lg" ? LOGO_SIZE_LG : LOGO_SIZE;

  if (variant === "deped") {
    return (
      <div style={{ borderBottom: `2px solid ${PRINT_COLORS.border}`, paddingBottom: 10, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 10, color: PRINT_COLORS.muted, minWidth: 180 }}>
            <FieldLine label="Region" value={region} width={120} />
            <FieldLine label="Division" value={division} width={110} />
            {district !== undefined && <FieldLine label="District" value={district} width={110} />}
          </div>

          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 4 }}>
              <img src={logo} alt="Logo" style={{ width: logoSize.width, height: logoSize.height, objectFit: "contain" }} />
              <div>
                <div style={{ fontSize: 9, color: PRINT_COLORS.muted, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                  Republic of the Philippines — Department of Education
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: PRINT_COLORS.dark, lineHeight: 1.2, marginTop: 2 }}>{schoolName}</div>
                {schoolAddress && <div style={{ fontSize: 9, color: PRINT_COLORS.muted, marginTop: 1 }}>{schoolAddress}</div>}
              </div>
            </div>
            {title && (
              <div style={{ fontSize: 14, fontWeight: 800, color: PRINT_COLORS.dark, textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 4 }}>
                {title}
              </div>
            )}
            {formCode && <div style={{ fontSize: 11, color: PRINT_COLORS.muted, fontWeight: 600 }}>({formCode})</div>}
            {subtitle && <div style={{ fontSize: 11, color: PRINT_COLORS.muted, marginTop: 2 }}>{subtitle}</div>}
          </div>

          <div style={{ minWidth: 180 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, borderBottom: `2px solid ${PRINT_COLORS.border}`, paddingBottom: 14 }}>
      <img src={logo} alt="Logo" style={{ width: logoSize.width, height: logoSize.height, objectFit: "contain" }} />
      <div style={{ flex: 1, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: PRINT_COLORS.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
          Republic of the Philippines — Department of Education
        </div>
        <div style={{ fontSize: size === "lg" ? 24 : 20, fontWeight: 800, color: PRINT_COLORS.dark, lineHeight: 1.2 }}>{schoolName}</div>
        {schoolAddress && <div style={{ fontSize: 11, color: PRINT_COLORS.muted, marginTop: 2 }}>{schoolAddress}</div>}
        {subtitle && <div style={{ fontSize: 12, color: PRINT_COLORS.muted, marginTop: 3 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

function FieldLine({ label, value, width }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}: </span>
      <span style={{ color: PRINT_COLORS.dark, fontWeight: 600 }}>
        {value || <span style={{ borderBottom: "1px solid #aaa", display: "inline-block", width }}>&nbsp;</span>}
      </span>
    </div>
  );
}
