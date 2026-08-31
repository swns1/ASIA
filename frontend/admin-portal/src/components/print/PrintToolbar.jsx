// PrintToolbar.jsx
//
// Shared on-screen (.no-print) toolbar bar, generalized from the near-identical
// header copy-pasted at the top of all 9 print/report documents.
import { PRINT_COLORS, PRINT_FONT } from "./theme";

export function PrintToolbar({ title, onBack, backLabel = "Close", middle, actions }) {
  return (
    <div className="no-print" style={{ background: PRINT_COLORS.dark, padding: "12px 24px", display: "flex", alignItems: "center", gap: 16 }}>
      {onBack && (
        <button onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 13, fontFamily: PRINT_FONT }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }} /> {backLabel}
        </button>
      )}
      {middle}
      <div style={{ flex: 1, color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{title}</div>
      {actions}
    </div>
  );
}

export function ToolbarButton({ children, primary, icon, ...props }) {
  return (
    <button {...props}
      style={{
        display: "flex", alignItems: "center", gap: 7,
        padding: primary ? "8px 20px" : "7px 14px",
        border: primary ? "none" : "1px solid rgba(255,255,255,0.2)",
        borderRadius: 8,
        background: primary ? PRINT_COLORS.red : "transparent",
        color: primary ? "white" : "rgba(255,255,255,0.7)",
        cursor: "pointer", fontSize: 13, fontWeight: primary ? 700 : 500,
        fontFamily: PRINT_FONT,
        opacity: props.disabled ? 0.7 : 1,
      }}>
      {icon && <i className={`ti ti-${icon}`} style={{ fontSize: 15 }} />}
      {children}
    </button>
  );
}
