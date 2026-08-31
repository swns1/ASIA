// SectionBar.jsx
//
// Shared section-header bar, generalized from SF9PrintPage.jsx's "BarTitle"
// and SF10PrintPage.jsx's "SectionBar" — the same component, defined twice
// under two names with two different hardcoded colors.
import { PRINT_COLORS } from "./theme";

export function SectionBar({ children, color = PRINT_COLORS.dark }) {
  return (
    <div style={{
      background: color, color: "white", fontSize: 10, fontWeight: 800, padding: "5px 10px",
      marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase",
      breakAfter: "avoid", pageBreakAfter: "avoid",
    }}>
      {children}
    </div>
  );
}
