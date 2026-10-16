// PrintLetterhead.jsx
//
// The single-row logo+centered-text header the invoice and receipt print
// pages share. No official DepEd seal graphic exists in this repo — it stays
// text-only ("Republic of the Philippines / Department of Education"), paired
// with the school's own crest (assets/logo.png). The SF9, SF10 and COR are
// drawn by the server, with the school's letterhead (school_forms/cor.py).
import { PRINT_COLORS, LOGO_SIZE, LOGO_SIZE_LG } from "./theme";
import logo from "../../assets/logo.png";

export function PrintLetterhead({ schoolName, schoolAddress, subtitle, size = "default" }) {
  const logoSize = size === "lg" ? LOGO_SIZE_LG : LOGO_SIZE;

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
