// DocTitleRow.jsx
//
// The document's name on the left and its number/date block on the right,
// directly under the letterhead. Shared by the invoice and the receipt, which
// used to squeeze both into the letterhead's one-line subtitle, where the
// number and date were the smallest text on the page.
import { PRINT_COLORS } from "./theme";

export function DocTitleRow({ title, meta }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, marginBottom: 16 }}>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: PRINT_COLORS.dark, lineHeight: 1.2 }}>
        {title}
      </div>
      <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
        <tbody>
          {meta.map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: "1px 14px 1px 0", color: PRINT_COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10.5 }}>
                {label}
              </td>
              <td style={{ padding: "1px 0", color: PRINT_COLORS.dark, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
