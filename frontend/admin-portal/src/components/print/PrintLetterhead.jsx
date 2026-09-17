// PrintLetterhead.jsx
//
// Shared DepEd-style letterhead. The `deped` variant stacks a centered
// crest+school block, the form title, then a Region/Division/District row, the
// way DepEd's own school forms lay these fields out. It used to put those fields
// in a left column with a matching blank column on the right, which took 360px
// of SF9's 640px page and made the title wrap. The `standard` variant comes from
// the single-row logo+centered-text header shared by CORPrintPage/
// InvoicePrintPage/ReceiptPrintPage/ReportCardPage. No official DepEd seal graphic
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
    const fields = [
      { label: "Region", value: region },
      { label: "Division", value: division },
      ...(district !== undefined ? [{ label: "District", value: district }] : []),
    ];

    return (
      <div style={{ borderBottom: `2px solid ${PRINT_COLORS.border}`, paddingTop: 6, paddingBottom: 12, marginBottom: 12 }}>
        {/* The empty box mirrors the logo so the text is centered on the page,
            in line with the form title below it, not just centered beside the crest. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <img src={logo} alt="Logo" style={{ width: logoSize.width, height: logoSize.height, objectFit: "contain", flexShrink: 0 }} />
          <div style={{ textAlign: "center", minWidth: 0 }}>
            <div style={{ fontSize: 9, color: PRINT_COLORS.muted, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1.45 }}>
              Republic of the Philippines
            </div>
            <div style={{ fontSize: 9, color: PRINT_COLORS.muted, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1.45, fontWeight: 700 }}>
              Department of Education
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: PRINT_COLORS.dark, lineHeight: 1.2, marginTop: 4, textWrap: "balance" }}>{schoolName}</div>
            {schoolAddress && <div style={{ fontSize: 9, color: PRINT_COLORS.muted, marginTop: 2 }}>{schoolAddress}</div>}
          </div>
          <div aria-hidden="true" style={{ width: logoSize.width, flexShrink: 0 }} />
        </div>

        {(title || formCode || subtitle) && (
          <div style={{ textAlign: "center", marginTop: 10 }}>
            {title && (
              <div style={{ fontSize: 14, fontWeight: 800, color: PRINT_COLORS.dark, textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: 1.3, textWrap: "balance" }}>
                {title}
              </div>
            )}
            {formCode && <div style={{ fontSize: 11, color: PRINT_COLORS.muted, fontWeight: 600, marginTop: 2 }}>({formCode})</div>}
            {subtitle && <div style={{ fontSize: 11, color: PRINT_COLORS.muted, marginTop: 1 }}>{subtitle}</div>}
          </div>
        )}

        <div
          style={{
            display: "grid", gridTemplateColumns: `repeat(${fields.length}, minmax(0, 1fr))`, columnGap: 24,
            maxWidth: 640, margin: "14px auto 0", fontSize: 10, color: PRINT_COLORS.muted,
          }}
        >
          {fields.map((f) => <FieldLine key={f.label} label={f.label} value={f.value} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, borderBottom: `2px solid ${PRINT_COLORS.border}`, paddingTop: 14, paddingBottom: 14 }}>
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

// The underline fills whatever the label leaves, so every blank in the row
// runs to the same right edge whether or not it has been filled in.
function FieldLine({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
      <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{label}:</span>
      <span style={{ flex: 1, minWidth: 0, borderBottom: "1px solid #aaa", color: PRINT_COLORS.dark, fontWeight: 600, paddingBottom: 1, overflowWrap: "anywhere" }}>
        {value || " "}
      </span>
    </div>
  );
}
