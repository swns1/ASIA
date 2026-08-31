// StatusBadge.jsx
//
// Shared status pill, generalized from "STATUS_META" copy-pasted verbatim in
// CORPrintPage/GradeSlipPrintPage/ReportCardPage and InvoicePrintPage's
// separately-keyed variant (see statusMeta.js). ENROLLMENT_STATUS_META adds
// `transferred_out` — a real Enrollment.STATUS_CHOICES value the original
// copies all omitted, which meant a transferred-out student's COR/Grade
// Slip/Report Card silently rendered with "Enrolled" styling via the old
// `?? STATUS_META.enrolled` fallback.
import { ENROLLMENT_STATUS_META } from "./statusMeta";

export function StatusBadge({ status, meta = ENROLLMENT_STATUS_META, defaultKey, large = false }) {
  const m = meta[status] ?? meta[defaultKey] ?? Object.values(meta)[0];
  return (
    <span style={{
      fontSize: large ? 12 : 11, fontWeight: 700, color: m.color, background: m.bg,
      padding: large ? "3px 12px" : "2px 10px", borderRadius: 50,
    }}>
      {m.label}
    </span>
  );
}
