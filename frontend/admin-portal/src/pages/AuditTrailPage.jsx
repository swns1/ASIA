import { usePageTitle } from "../hooks/usePageTitle";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import AppLayout from "../components/AppLayout";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, canViewAuditTrail } from "../utils/auth";
import { fetchAuditLogs } from "../api/auditTrailApi";
import { listVariants, modalVariants, springTransition } from "../utils/motion";

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
  red: "#e03131", redDark: "#c92a2a", redLight: "#fff0f0", redBorder: "#fca5a5",
  border: "#f5eaea", softBorder: "#f9f0f0", text: "#1a0a0a",
  muted: "#7a5050", pale: "#b09090", micro: "#c0a0a0", bg: "#fdf8f6", white: "#ffffff",
};

const baseCss = `
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }
`;

const STATUS_META = {
  success: { label: "Success", bg: "#e8f5e0", color: "#2e6b0d", border: "#86efac", icon: "ti-circle-check" },
  failed:  { label: "Failed",  bg: "#fde8e8", color: "#9b2020", border: "#fca5a5", icon: "ti-circle-x"    },
  warning: { label: "Warning", bg: "#fef3e2", color: "#7a4a08", border: "#fcd34d", icon: "ti-alert-triangle" },
  pending: { label: "Pending", bg: "#e3f0fd", color: "#1455a0", border: "#93c5fd", icon: "ti-clock"       },
};

const STAT_DEFS = [
  { key: "total",   label: "Total Logs",      icon: "ti-list-details", color: C.red,     bg: C.redLight },
  { key: "visible", label: "Visible Records",  icon: "ti-filter-check", color: "#1455a0", bg: "#e3f0fd"  },
  { key: "failed",  label: "Failed Actions",   icon: "ti-circle-x",     color: "#9b2020", bg: "#fde8e8"  },
  { key: "invalid", label: "Invalid Dates",    icon: "ti-calendar-x",   color: "#7a4a08", bg: "#fef3e2"  },
];

// ── Data helpers ──────────────────────────────────────────────────────────────

function normalizeRole(role) {
  return String(role || "unknown").replaceAll("_", " ").replace(/\b\w/g, m => m.toUpperCase());
}

const legacyDetailSubjects = {
  "students": "student record", "households": "household record", "guardians": "guardian record",
  "student_siblings": "student sibling record", "siblings": "sibling record",
  "previous_schools": "previous school record", "requirement_types": "requirement type",
  "student_requirement_submissions": "student requirement submission", "enrollments": "enrollment record",
  "subjects": "subject", "grades": "grade record", "grading-templates": "grading template",
  "grading-components": "grading component", "score-entries": "score entry",
  "scholarship-types": "scholarship type", "enrollment-scholarships": "scholarship award",
  "school-settings": "school settings", "fee-schedules": "fee schedule",
  "fee-schedule-items": "fee schedule item", "discount-types": "discount type",
  "invoices": "invoice", "payments": "payment",
};

const moduleSubjects = {
  Students: "student record", Households: "household record", Guardians: "guardian record",
  "Student Siblings": "student sibling record", Siblings: "sibling record",
  "Previous Schools": "previous school record", Requirements: "requirement record",
  Enrollments: "enrollment record", Subjects: "subject", Grades: "grade record",
  Scholarships: "scholarship award", "Scholarship Types": "scholarship type",
  "School Settings": "school settings", "Fee Schedules": "fee schedule",
  "Fee Schedule Items": "fee schedule item", "Discount Types": "discount type",
  Invoices: "invoice", Payments: "payment",
};

const legacyMethodWords = {
  POST:   ["Created", "created", "create"],
  PUT:    ["Updated", "updated", "update"],
  PATCH:  ["Updated", "updated", "update"],
  DELETE: ["Deleted", "deleted", "delete"],
};

function sentenceCase(v) { return v ? v.charAt(0).toUpperCase() + v.slice(1) : v; }

function parseTechnicalDetail(value, metadata = {}) {
  const detail = String(value || "").trim();
  const { path: metadataPath, method: metadataMethod, status_code: metadataStatus } = metadata;

  if (metadataPath && metadataMethod && metadataStatus !== undefined) {
    const parts = String(metadataPath).split("/").filter(Boolean);
    const key = parts[0] === "api" ? parts[1] : parts[0];
    return { method: String(metadataMethod).toUpperCase(), key: key || "system", path: String(metadataPath), success: Number(metadataStatus) < 400 };
  }

  const match = detail.match(/^([A-Z]+)\s+(\/api\/[^\s]+)\s+returned HTTP\s+(\d+)\.?$/i);
  if (!match) return null;
  const parts = match[2].split("/").filter(Boolean);
  return { method: match[1].toUpperCase(), key: parts[0] === "api" ? parts[1] : parts[0], path: match[2], success: Number(match[3]) < 400 };
}

function actionFromTechnicalInfo(info) {
  if (info.key === "payments" && info.method === "POST") return "Recorded payment";
  if (info.key === "score-entries" && info.method === "POST") return "Added score entry";
  if (info.key === "send-enrollment-email" && info.method === "POST") return "Sent enrollment email";
  if (info.key === "enrollment-scholarships" && info.method === "POST") return "Awarded scholarship";
  if (info.key === "invoices" && info.path.includes("/generate")) return "Generated invoice";
  if (info.key === "students" && info.path.includes("/bulk-create")) return "Saved student information";
  const [titleVerb] = legacyMethodWords[info.method] || ["Changed"];
  const subject = legacyDetailSubjects[info.key] || `${info.key.replaceAll("-", " ").replaceAll("_", " ")} record`;
  return `${titleVerb} ${subject}`;
}

function detailsFromTechnicalInfo(info) {
  if (info.key === "payments" && info.method === "POST") return info.success ? "Payment was recorded successfully." : "Payment could not be recorded. Please review the payment details.";
  if (info.key === "score-entries" && info.method === "POST") return info.success ? "Score entry was added successfully." : "Score entry could not be added. Please review the grade details.";
  if (info.key === "send-enrollment-email" && info.method === "POST") return info.success ? "Enrollment email was sent successfully." : "Enrollment email could not be sent. Please review the student's email address.";
  if (info.key === "enrollment-scholarships" && info.method === "POST") return info.success ? "Scholarship was awarded successfully." : "Scholarship could not be awarded. Please review the scholarship details.";
  if (info.key === "invoices" && info.path.includes("/generate")) return info.success ? "Invoice was generated successfully." : "Invoice could not be generated. Please review the enrollment and payment plan.";
  if (info.key === "students" && info.path.includes("/bulk-create")) return info.success ? "Student information was saved successfully." : "Student information could not be saved. Please review the student details.";
  const [, pastTense, baseVerb] = legacyMethodWords[info.method] || ["Changed", "changed", "change"];
  const subject = legacyDetailSubjects[info.key] || `${info.key.replaceAll("-", " ").replaceAll("_", " ")} record`;
  const beWord = info.key === "school-settings" ? "were" : "was";
  return info.success ? `${sentenceCase(subject)} ${beWord} ${pastTense} successfully.` : `${sentenceCase(subject)} could not be ${baseVerb}d. Please review the submitted information.`;
}

function humanizeAuditAction(value, details, metadata, module) {
  const info = parseTechnicalDetail(details, metadata);
  if (info) return actionFromTechnicalInfo(info);
  const action = String(value || "").trim();
  const awkward = action.match(/^(Created|Updated|Deleted|Changed)\s+(.+?)\s+record$/i);
  if (!awkward) return action || "System activity";
  const verb = sentenceCase(awkward[1].toLowerCase());
  if (verb === "Created" && module === "Scholarships") return "Awarded scholarship";
  const subject = moduleSubjects[module] || awkward[2].replaceAll("_", " ").replaceAll("-", " ").toLowerCase();
  return `${verb} ${subject}`;
}

function humanizeTechnicalDetails(value, metadata = {}) {
  const detail = String(value || "").trim();
  const info = parseTechnicalDetail(detail, metadata);
  if (!info) return detail;
  return detailsFromTechnicalInfo(info);
}

const MODULE_NORMALIZE = {
  // raw backend values → canonical display name
  "ai": "Analytics", "Ai": "Analytics",
  "auth": "Authentication", "Auth": "Authentication", "Identity": "Authentication",
  "ocr": "OCR", "Ocr": "OCR",
  "enrollments": "Enrollments", "Enrollments": "Enrollments",
  "Enrollment Email": "Enrollments", "enrollment email": "Enrollments",
  "grades": "Grades", "Grades": "Grades",
  "students": "Students", "Students": "Students",
  "invoices": "Invoices", "Invoices": "Invoices",
  "payments": "Payments", "Payments": "Payments",
  "scholarships": "Scholarships", "Scholarships": "Scholarships",
  "Scholarship Types": "Scholarships",
  "requirements": "Requirements", "Requirements": "Requirements",
  "Guardians": "Students", "Households": "Students", "Siblings": "Students",
  "Previous Schools": "Students", "Student Siblings": "Students",
  "Grading Templates": "Grades", "Grading Components": "Grades",
  "Fee Schedules": "Finance", "Fee Schedule Items": "Finance",
  "Discount Types": "Finance",
  "Calendar Events": "Academic Calendar",
  "Subjects": "Subjects", "subjects": "Subjects",
  "School Settings": "Settings",
};

function normalizeModule(raw) {
  return MODULE_NORMALIZE[raw] ?? raw ?? "General";
}

function normalizeLog(row, index) {
  const date = row.occurred_at ? new Date(row.occurred_at) : null;
  const invalidDate = !date || Number.isNaN(date.getTime());
  const rawModule = row.module ?? row.section ?? "General";
  return {
    id: row.id ?? row.log_id ?? row.audit_log_id ?? index + 1,
    userName: row.user_name ?? row.user?.name ?? "Unknown user",
    userRole: row.user_role ?? row.user?.role ?? "unknown",
    action: humanizeAuditAction(row.action, row.details ?? row.remarks ?? "", row.metadata ?? {}, rawModule),
    module: normalizeModule(rawModule),
    occurredAt: row.occurred_at ?? "",
    date, invalidDate,
    status: String(row.status ?? row.result ?? "success").toLowerCase(),
    details: humanizeTechnicalDetails(row.details ?? row.remarks ?? "", row.metadata ?? {}),
  };
}

function dateValue(log) { return log.invalidDate ? "" : log.date.toISOString().slice(0, 10); }
function timeValue(log) { return log.invalidDate ? "" : log.date.toTimeString().slice(0, 5); }
function formatDate(log) {
  if (log.invalidDate) return "Missing";
  return log.date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" });
}
function formatTime(log) {
  if (log.invalidDate) return "Missing";
  return log.date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}
function compareValues(a, b, direction) {
  if (a < b) return direction === "asc" ? -1 : 1;
  if (a > b) return direction === "asc" ? 1 : -1;
  return 0;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Sk({ w = "100%", h = 14, r = 6 }) {
  return (
    <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
  );
}

// ── AnimatedCount ─────────────────────────────────────────────────────────────

function AnimatedCount({ value }) {
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 90, damping: 18 });
  const display = useTransform(spring, v => Math.round(v));
  const [shown, setShown] = useState(value);
  useEffect(() => { mv.set(value); }, [value]);
  useEffect(() => display.on("change", v => setShown(v)), [display]);
  return <>{shown}</>;
}

// ── Chip ──────────────────────────────────────────────────────────────────────

function Chip({ label, active, activeBg, activeColor, activeBorder, onClick, delay = 0 }) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut", delay }}
      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
      style={{
        height: 32, padding: "0 14px", borderRadius: 99, border: "1.5px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
        backgroundColor: active ? activeBg     : C.white,
        color:           active ? activeColor  : "#9a7070",
        borderColor:     active ? activeBorder : "#f0e4e4",
        transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease",
      }}
    >
      {label}
    </motion.button>
  );
}

// ── Sortable Th ───────────────────────────────────────────────────────────────

function Th({ children, sortable, active, direction, onClick, align = "left", sticky = false }) {
  const thStyle = { textAlign: align, fontSize: 10.5, fontWeight: 600, color: C.micro, padding: "12px 18px", borderBottom: `1px solid ${C.border}`, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap", background: "#fdfafa", ...(sticky ? { position: "sticky", top: 0, zIndex: 1 } : {}) };
  if (!sortable) return <th style={thStyle}>{children}</th>;
  return (
    <th style={thStyle}>
      <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "transparent", color: "inherit", font: "inherit", textTransform: "inherit", letterSpacing: "inherit", cursor: "pointer", padding: 0 }}>
        {children}
        <i className={`ti ${active && direction === "asc" ? "ti-sort-ascending" : "ti-sort-descending"}`} style={{ fontSize: 12, color: active ? C.red : C.micro }} />
      </button>
    </th>
  );
}

// ── Log Row ───────────────────────────────────────────────────────────────────

function LogRow({ log }) {
  const [hovered, setHovered] = useState(false);
  const status = STATUS_META[log.status] || STATUS_META.pending;

  return (
    <motion.tr
      variants={listVariants.item}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      animate={{ backgroundColor: hovered ? "#fff8f6" : C.white }}
      transition={{ duration: 0.12 }}
      style={{ borderBottom: `1px solid ${C.softBorder}` }}
    >
      <td style={{ padding: "11px 18px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>{log.userName}</div>
      </td>
      <td style={{ padding: "11px 18px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 99, padding: "3px 10px", background: "#f7eeee", color: C.muted, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
          {normalizeRole(log.userRole)}
        </span>
      </td>
      <td style={{ padding: "11px 18px", fontSize: 13, color: C.text, maxWidth: 240 }}>{log.action}</td>
      <td style={{ padding: "11px 18px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.muted }}>
          <i className="ti ti-folder" style={{ fontSize: 13, color: C.red }} />{log.module}
        </span>
      </td>
      <td style={{ padding: "11px 18px", fontSize: 13, color: log.invalidDate ? "#b91c1c" : C.text, fontWeight: log.invalidDate ? 700 : 400, whiteSpace: "nowrap" }}>
        {formatDate(log)}
      </td>
      <td style={{ padding: "11px 18px", fontSize: 13, color: log.invalidDate ? "#b91c1c" : C.text, fontWeight: log.invalidDate ? 700 : 400, whiteSpace: "nowrap" }}>
        {formatTime(log)}
      </td>
      <td style={{ padding: "11px 18px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 700, background: status.bg, color: status.color, whiteSpace: "nowrap" }}>
          <i className={`ti ${status.icon}`} style={{ fontSize: 12 }} />{status.label}
        </span>
      </td>
      <td style={{ padding: "11px 18px", fontSize: 12, color: C.muted, maxWidth: 260 }}>{log.details || "No remarks"}</td>
    </motion.tr>
  );
}

// ── Access Denied ─────────────────────────────────────────────────────────────

function AccessDenied({ navigate }) {
  return (
    <AppLayout>
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <motion.div
          variants={modalVariants} initial="hidden" animate="visible" transition={springTransition}
          style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 20, padding: "34px 38px", width: 420, boxShadow: "0 18px 50px rgba(224,49,49,0.12)", textAlign: "center" }}
        >
          <div style={{ width: 58, height: 58, borderRadius: 16, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <i className="ti ti-shield-lock" style={{ fontSize: 26, color: C.red }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Access Denied</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginTop: 8 }}>Only Admin and Super Admin users can view log records.</div>
          <motion.button
            onClick={() => navigate("/dashboard")}
            whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }} whileTap={{ scale: 0.97 }}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: `linear-gradient(135deg,${C.red},${C.redDark})`, color: C.white, border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.24)", marginTop: 22 }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: 14 }} /> Back to Dashboard
          </motion.button>
        </motion.div>
      </div>
    </AppLayout>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AuditTrailPage() {
  usePageTitle("Audit Trail");
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const allowed = canViewAuditTrail(currentUser);
  const hasAnimated = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState([]);
  const [source, setSource] = useState("");

  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [sort, setSort] = useState({ key: "date", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const roles = useMemo(() => {
    const unique = Array.from(new Set(logs.map(l => l.userRole).filter(Boolean)));
    return unique.sort((a, b) => normalizeRole(a).localeCompare(normalizeRole(b)));
  }, [logs]);

  const modules = useMemo(() => {
    const unique = Array.from(new Set(logs.map(l => l.module).filter(Boolean)));
    return unique.sort((a, b) => a.localeCompare(b));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs
      .filter(l => statusFilter === "all" || l.status === statusFilter)
      .filter(l => roleFilter === "all" || l.userRole === roleFilter)
      .filter(l => moduleFilter === "all" || l.module === moduleFilter)
      .filter(l => !dateFilter || dateValue(l) === dateFilter)
      .filter(l => !timeFrom || (timeValue(l) && timeValue(l) >= timeFrom))
      .filter(l => !timeTo || (timeValue(l) && timeValue(l) <= timeTo))
      .sort((a, b) => {
        if (sort.key === "role") return compareValues(normalizeRole(a.userRole), normalizeRole(b.userRole), sort.direction);
        if (sort.key === "time") return compareValues(timeValue(a), timeValue(b), sort.direction);
        return compareValues(a.invalidDate ? 0 : a.date.getTime(), b.invalidDate ? 0 : b.date.getTime(), sort.direction);
      });
  }, [logs, statusFilter, roleFilter, moduleFilter, dateFilter, timeFrom, timeTo, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const pageLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize);
  const invalidCount = logs.filter(l => l.invalidDate).length;

  const hasActiveFilters = statusFilter !== "all" || roleFilter !== "all" || moduleFilter !== "all" || dateFilter || timeFrom || timeTo;

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    if (!allowed) { setLoading(false); return; }
    loadLogs();
  }, [allowed, navigate]);

  useEffect(() => { setPage(1); }, [statusFilter, roleFilter, moduleFilter, dateFilter, timeFrom, timeTo, pageSize]);

  async function loadLogs() {
    setLoading(true); setError("");
    try {
      const data = await fetchAuditLogs();
      setLogs((data.results || []).map(normalizeLog));
      setSource(data.source);
    } catch (e) {
      setError(e.message || "Failed to load log records.");
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(key) {
    setSort(cur => ({ key, direction: cur.key === key && cur.direction === "asc" ? "desc" : "asc" }));
  }

  function clearFilters() {
    setStatusFilter("all"); setRoleFilter("all"); setModuleFilter("all");
    setDateFilter(""); setTimeFrom(""); setTimeTo("");
  }

  const isFirstRender = !hasAnimated.current;
  if (isFirstRender) hasAnimated.current = true;

  const stats = {
    total: logs.length,
    visible: filteredLogs.length,
    failed: logs.filter(l => l.status === "failed").length,
    invalid: invalidCount,
  };


  if (!allowed && !loading) return <AccessDenied navigate={navigate} />;

  return (
    <AppLayout>
      <style>{baseCss}</style>

      {/* Topbar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 8px rgba(224,49,49,0.04)" }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" }}>Audit Trail</div>
          <div style={{ fontSize: 11.5, color: C.pale, marginTop: 1 }}>
            {loading ? "Loading…" : <><AnimatedCount value={logs.length} /> log record{logs.length !== 1 ? "s" : ""}</>}
          </div>
        </div>
        <motion.button
          onClick={loadLogs}
          whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }} whileTap={{ scale: 0.96 }}
          style={{ display: "flex", alignItems: "center", gap: 8, background: `linear-gradient(135deg,${C.red},${C.redDark})`, color: C.white, border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}
        >
          <i className="ti ti-refresh" style={{ fontSize: 14 }} /> Refresh
        </motion.button>
      </motion.div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Banners */}
        <AnimatePresence>
          {source === "sample" && (
            <motion.div key="info" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              style={{ background: "#e3f0fd", border: "1px solid #a7c7ed", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#1455a0", display: "flex", alignItems: "center", gap: 8 }}>
              <i className="ti ti-info-circle" style={{ fontSize: 15 }} />
              Showing local sample records until the audit API endpoint is connected.
            </motion.div>
          )}
          {error && (
            <motion.div key="error" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              style={{ background: "#fef2f2", border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", display: "flex", alignItems: "center", gap: 8 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 15 }} />{error}
            </motion.div>
          )}
          {invalidCount > 0 && (
            <motion.div key="warn" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              style={{ background: "#fef3e2", border: "1px solid #f4c27a", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#7a4a08", display: "flex", alignItems: "center", gap: 8 }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 15 }} />
              {invalidCount} log record{invalidCount === 1 ? "" : "s"} contain missing or invalid date/time values.
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stat cards */}
        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.08, ease: "easeOut" }}
          style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}
        >
          {STAT_DEFS.map(s => (
            <div key={s.key} style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 12px rgba(224,49,49,0.06)" }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <i className={`ti ${s.icon}`} style={{ fontSize: 20, color: s.color }} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1 }}>
                  {loading ? <Sk w={36} h={22} r={6} /> : <AnimatedCount value={stats[s.key]} />}
                </div>
                <div style={{ fontSize: 11, color: C.pale, marginTop: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Filter panel */}
        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.14, ease: "easeOut" }}
          style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "18px 20px", boxShadow: "0 2px 12px rgba(224,49,49,0.05)", display: "flex", flexDirection: "column", gap: 16 }}
        >
          {/* Status chips */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.micro, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Status</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <Chip label="All" active={statusFilter === "all"} activeBg={C.redLight} activeColor={C.red} activeBorder={C.redBorder} onClick={() => setStatusFilter("all")} />
              {Object.entries(STATUS_META).map(([key, meta], idx) => (
                <Chip key={key} label={meta.label} active={statusFilter === key}
                  activeBg={meta.bg} activeColor={meta.color} activeBorder={meta.border}
                  onClick={() => setStatusFilter(key)} delay={idx * 0.03} />
              ))}
            </div>
          </div>

          {/* Role chips */}
          {roles.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.micro, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Role</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <Chip label="All" active={roleFilter === "all"} activeBg={C.redLight} activeColor={C.red} activeBorder={C.redBorder} onClick={() => setRoleFilter("all")} />
                {roles.map((role, idx) => (
                  <Chip key={role} label={normalizeRole(role)} active={roleFilter === role}
                    activeBg="#f7eeee" activeColor={C.muted} activeBorder={C.border}
                    onClick={() => setRoleFilter(role)} delay={idx * 0.03} />
                ))}
              </div>
            </div>
          )}

          {/* Module + Date + time row */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            {modules.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.micro, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Module</div>
                <select
                  value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}
                  style={{ height: 36, border: `1.5px solid ${moduleFilter !== "all" ? "#93c5fd" : "#f0e4e4"}`, borderRadius: 10, padding: "0 12px", background: moduleFilter !== "all" ? "#e3f0fd" : C.white, color: moduleFilter !== "all" ? "#1455a0" : C.text, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", cursor: "pointer", fontWeight: moduleFilter !== "all" ? 600 : 400, minWidth: 160 }}
                >
                  <option value="all">All modules</option>
                  {modules.map(mod => <option key={mod} value={mod}>{mod}</option>)}
                </select>
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.micro, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Date</div>
              <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                style={{ height: 36, border: `1.5px solid #f0e4e4`, borderRadius: 10, padding: "0 12px", background: C.white, color: C.text, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none" }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.micro, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>From</div>
              <input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)}
                style={{ height: 36, border: `1.5px solid #f0e4e4`, borderRadius: 10, padding: "0 12px", background: C.white, color: C.text, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none" }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.micro, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>To</div>
              <input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)}
                style={{ height: 36, border: `1.5px solid #f0e4e4`, borderRadius: 10, padding: "0 12px", background: C.white, color: C.text, fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none" }} />
            </div>

            <AnimatePresence>
              {hasActiveFilters && (
                <motion.button
                  initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }}
                  onClick={clearFilters}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  style={{ height: 36, padding: "0 14px", borderRadius: 99, border: `1.5px solid ${C.redBorder}`, background: C.redLight, color: C.red, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 6 }}
                >
                  <i className="ti ti-x" style={{ fontSize: 12 }} /> Clear filters
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Table panel */}
        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.2, ease: "easeOut" }}
          style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: "0 2px 16px rgba(224,49,49,0.06)", display: "flex", flexDirection: "column" }}
        >
          {/* Table */}
          <div style={{ overflowX: "auto", overflowY: "auto", borderRadius: "0 0 16px 16px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1040 }}>
              <thead>
                <tr>
                  <Th sticky>User</Th>
                  <Th sticky sortable active={sort.key === "role"} direction={sort.direction} onClick={() => toggleSort("role")}>Role</Th>
                  <Th sticky>Action</Th>
                  <Th sticky>Module</Th>
                  <Th sticky sortable active={sort.key === "date"} direction={sort.direction} onClick={() => toggleSort("date")}>Date</Th>
                  <Th sticky sortable active={sort.key === "time"} direction={sort.direction} onClick={() => toggleSort("time")}>Time</Th>
                  <Th sticky>Status</Th>
                  <Th sticky>Details</Th>
                </tr>
              </thead>
              <motion.tbody
                variants={listVariants.container}
                initial={isFirstRender ? "hidden" : false}
                animate="visible"
              >
                {loading
                  ? Array.from({ length: pageSize }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.softBorder}` }}>
                        {[140, 80, 200, 90, 80, 60, 70, 180].map((w, c) => (
                          <td key={c} style={{ padding: "11px 18px" }}><Sk w={w} h={13} /></td>
                        ))}
                      </tr>
                    ))
                  : pageLogs.length === 0
                  ? (
                      <tr>
                        <td colSpan={8}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "56px 24px", textAlign: "center" }}>
                            <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#fff0f0,#fde8e8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <i className="ti ti-file-search" style={{ fontSize: 24, color: "#e08080" }} />
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#7a5050" }}>No log records found</div>
                            <div style={{ fontSize: 13, color: C.pale }}>Try adjusting your status, role, module, or date filters.</div>
                            {hasActiveFilters && (
                              <motion.button onClick={clearFilters} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                style={{ fontSize: 12, color: C.red, background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
                                Clear filters
                              </motion.button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  : pageLogs.map(log => <LogRow key={log.id} log={log} />)
                }
              </motion.tbody>
            </table>
          </div>

        </motion.div>

        {/* Pagination — outside the card, matching Students page layout */}
        {!loading && filteredLogs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "#b09090" }}>
              Page <strong style={{ color: "#7a5050" }}>{page}</strong> of{" "}
              <strong style={{ color: "#7a5050" }}>{totalPages || 1}</strong>
              &nbsp;·&nbsp;{filteredLogs.length.toLocaleString()} total records
            </span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
                style={{ height: 32, border: "1px solid #f0e4e4", borderRadius: 8, padding: "0 8px", fontSize: 12, color: "#9a7070", background: "white", fontFamily: "'DM Sans',sans-serif", outline: "none", cursor: "pointer", marginRight: 4 }}
              >
                {[10, 25, 50].map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>
              <motion.button
                whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
                style={pgBtn} disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <i className="ti ti-chevron-left" style={{ fontSize: 13 }} />
              </motion.button>
              {(() => {
                const windowSize = Math.min(totalPages, 5);
                const start = Math.min(Math.max(1, page - 2), Math.max(1, totalPages - windowSize + 1));
                return Array.from({ length: windowSize }, (_, i) => start + i);
              })().map(n => (
                <motion.button
                  key={n}
                  whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
                  style={{ ...pgBtn, ...(n === page ? pgBtnActive : {}) }}
                  onClick={() => setPage(n)}
                >
                  {n}
                </motion.button>
              ))}
              <motion.button
                whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
                style={pgBtn} disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: 13 }} />
              </motion.button>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}

const pgBtn = {
  width: 32, height: 32, border: "1px solid #f0e4e4", borderRadius: 8,
  background: "white", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", fontSize: 12, color: "#9a7070",
  fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s",
};

const pgBtnActive = {
  background: "#fff0f0", borderColor: "#e03131", color: "#e03131", fontWeight: 700,
};
