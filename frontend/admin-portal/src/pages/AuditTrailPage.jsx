import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import ChipGroup from "../components/ui/ChipGroup";
import FilterBar, { FilterRow } from "../components/ui/FilterBar";
import Pagination from "../components/Pagination";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, canViewAuditTrail } from "../utils/auth";
import { fetchAuditLogs, fetchAuditFacets } from "../api/auditTrailApi";
import { listVariants, modalVariants, springTransition } from "../utils/motion";

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
  red: "#e03131", redDark: "#c92a2a", redLight: "#fff0f0", redBorder: "#fca5a5",
  border: "#f5eaea", softBorder: "#f9f0f0", text: "#1a0a0a",
  muted: "#7a5050", pale: "#8a6a6a", micro: "#8a6a6a", bg: "#fdf8f6", white: "#ffffff",
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

// The shared ChipGroup takes a semantic tone name rather than raw hex; these
// map onto the same colours STATUS_META already used for the row badges.
const STATUS_TONES = {
  success: "success",
  failed:  "error",
  warning: "warning",
  pending: "info",
};

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

function formatDate(log) {
  if (log.invalidDate) return "Missing";
  return log.date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" });
}
function formatTime(log) {
  if (log.invalidDate) return "Missing";
  return log.date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}
// ── Skeleton ──────────────────────────────────────────────────────────────────

function Sk({ w = "100%", h = 14, r = 6 }) {
  return (
    <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
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
        <i className={`ti ${active && direction === "asc" ? "ti-sort-ascending" : "ti-sort-descending"}`} style={{ fontSize: 12, color: active ? C.redDark : C.micro }} />
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
    <>
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
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AuditTrailPage() {
  usePageTitle("Audit Trail");
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const allowed = canViewAuditTrail(currentUser);

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
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "date", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  // Filter options come from the whole log, not the page on screen — with
  // server-side paging there's no complete set in the browser to derive from.
  const [facets, setFacets] = useState({ roles: [], modules: [], statusCounts: {} });

  const roles = facets.roles;
  const modules = facets.modules;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const invalidCount = logs.filter(l => l.invalidDate).length;

  const hasActiveFilters = statusFilter !== "all" || roleFilter !== "all" || moduleFilter !== "all"
    || dateFilter || timeFrom || timeTo || search;

  // The table's sortable headers map onto the orderings the API accepts.
  // "time" has no separate column server-side — occurred_at carries both, and
  // ordering by it sorts by time within a day anyway.
  const orderingParam = useMemo(() => {
    const prefix = sort.direction === "desc" ? "-" : "";
    if (sort.key === "role") return `${prefix}user_role`;
    return `${prefix}occurred_at`;
  }, [sort]);

  const loadLogs = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await fetchAuditLogs({
        page,
        page_size: pageSize,
        ordering: orderingParam,
        ...(statusFilter !== "all" ? { status: statusFilter } : null),
        ...(roleFilter !== "all" ? { role: roleFilter } : null),
        ...(moduleFilter !== "all" ? { module: moduleFilter } : null),
        ...(dateFilter ? { date: dateFilter } : null),
        ...(timeFrom ? { time_from: timeFrom } : null),
        ...(timeTo ? { time_to: timeTo } : null),
        ...(search.trim() ? { search: search.trim() } : null),
      });
      setLogs((data.results || []).map(normalizeLog));
      setTotalCount(data.count ?? 0);
      setSource(data.source);
    } catch (e) {
      setError(e.message || "Failed to load log records.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, orderingParam, statusFilter, roleFilter, moduleFilter, dateFilter, timeFrom, timeTo, search]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    if (!allowed) { setLoading(false); return; }
    loadLogs();
  }, [allowed, navigate, loadLogs]);

  // Facets describe the whole log, so they're fetched once rather than with
  // every filter change. A failure here is non-fatal: the chip rows just fall
  // back to empty and the list still works.
  useEffect(() => {
    if (!allowed) return;
    fetchAuditFacets().then(setFacets).catch(() => {});
  }, [allowed]);

  function toggleSort(key) {
    setSort(cur => ({ key, direction: cur.key === key && cur.direction === "asc" ? "desc" : "asc" }));
    setPage(1);
  }

  // Every facet change returns to page 1 — staying on page 12 of a narrower
  // result set would land on an empty table.
  const applyFilter = (setter) => (v) => { setter(v); setPage(1); };

  function clearFilters() {
    setStatusFilter("all"); setRoleFilter("all"); setModuleFilter("all");
    setDateFilter(""); setTimeFrom(""); setTimeTo("");
    setSearch(""); setSearchInput("");
    setPage(1);
  }

  const statusOptions = useMemo(() => {
    const counts = facets.statusCounts || {};
    return [
      { value: "all", label: "All", count: counts.total ?? null },
      ...Object.entries(STATUS_META).map(([key, meta]) => ({
        value: key,
        label: meta.label,
        tone: STATUS_TONES[key],
        icon: meta.icon,
        count: counts[key] ?? 0,
      })),
    ];
  }, [facets.statusCounts]);

  const roleOptions = useMemo(() => ([
    { value: "all", label: "All" },
    ...roles.map(r => ({ value: r, label: normalizeRole(r), tone: "muted" })),
  ]), [roles]);

  const isFirstRender = useIsFirstRender();

  if (!allowed && !loading) return <AccessDenied navigate={navigate} />;

  return (
    <>
      <style>{baseCss}</style>

      <PageHeader
        title="Audit Trail"
        icon="ti-shield-check"
        subtitle={loading ? "Loading…" : `${logs.length} log record${logs.length !== 1 ? "s" : ""}`}
        actions={
          <Button variant="secondary" icon="ti-refresh" onClick={loadLogs}>
            Refresh
          </Button>
        }
      />

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

        <FilterBar
          animate={isFirstRender}
          animateDelay={0.14}
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          onSearch={() => { setSearch(searchInput); setPage(1); }}
          onClearSearch={() => { setSearchInput(""); setSearch(""); setPage(1); }}
          searchPlaceholder="Search by user, action, or details…"
          searchLabel="Search audit records"
          searchInputId="audit-search"
          hasFilters={Boolean(hasActiveFilters)}
          onClearFilters={clearFilters}
          advancedLabel="Date & time"
          advancedIcon="ti-calendar-clock"
          advancedActive={Boolean(dateFilter || timeFrom || timeTo)}
          advanced={
            <>
              <div>
                <label htmlFor="audit-date" className={fieldLabelCls}>Date</label>
                <input id="audit-date" type="date" value={dateFilter}
                  onChange={e => { setDateFilter(e.target.value); setPage(1); }}
                  className={fieldInputCls} />
              </div>
              <div>
                <label htmlFor="audit-time-from" className={fieldLabelCls}>From time</label>
                <input id="audit-time-from" type="time" value={timeFrom}
                  onChange={e => { setTimeFrom(e.target.value); setPage(1); }}
                  className={fieldInputCls} />
              </div>
              <div>
                <label htmlFor="audit-time-to" className={fieldLabelCls}>To time</label>
                <input id="audit-time-to" type="time" value={timeTo}
                  onChange={e => { setTimeTo(e.target.value); setPage(1); }}
                  className={fieldInputCls} />
              </div>
            </>
          }
          extraControls={
            modules.length > 0 && (
              <select
                aria-label="Filter by module"
                value={moduleFilter}
                onChange={e => { setModuleFilter(e.target.value); setPage(1); }}
                className={`focus-ring h-[42px] shrink-0 rounded-lg border-[1.5px] px-3 text-[13px] outline-none ${
                  moduleFilter !== "all"
                    ? "border-brand-500 bg-brand-100 font-semibold text-brand-600"
                    : "border-neutral-300 bg-white text-neutral-700"
                }`}
              >
                <option value="all">All modules</option>
                {modules.map(mod => <option key={mod} value={mod}>{mod}</option>)}
              </select>
            )
          }
        >
          <FilterRow label="Status">
            <ChipGroup
              options={statusOptions}
              value={statusFilter}
              onChange={applyFilter(setStatusFilter)}
              label="Filter by status"
            />
          </FilterRow>

          {roleOptions.length > 1 && (
            <FilterRow label="Role">
              <ChipGroup
                options={roleOptions}
                value={roleFilter}
                onChange={applyFilter(setRoleFilter)}
                label="Filter by role"
              />
            </FilterRow>
          )}
        </FilterBar>

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
                  : logs.length === 0
                  ? (
                      <tr>
                        <td colSpan={8}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "56px 24px", textAlign: "center" }}>
                            <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#fff0f0,#fde8e8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <i className="ti ti-file-search" style={{ fontSize: 24, color: "#8a6a6a" }} />
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#7a5050" }}>No log records found</div>
                            <div style={{ fontSize: 13, color: C.pale }}>Try adjusting your status, role, module, or date filters.</div>
                            {hasActiveFilters && (
                              <motion.button onClick={clearFilters} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                style={{ fontSize: 12, color: C.redDark, background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
                                Clear filters
                              </motion.button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  : logs.map(log => <LogRow key={log.id} log={log} />)
                }
              </motion.tbody>
            </table>
          </div>

        </motion.div>

        {!loading && totalCount > 0 && (
          <div className="flex items-center justify-between gap-3">
            {/* Rows-per-page isn't part of the shared Pagination component, so
                it sits beside it rather than being folded in. */}
            <label className="flex items-center gap-2 text-[12px] text-neutral-500">
              <span>Rows</span>
              <select
                aria-label="Rows per page"
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="focus-ring h-8 rounded-lg border border-neutral-300 bg-white px-2 text-[12px] text-neutral-700 outline-none"
              >
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <Pagination
              page={page}
              totalPages={totalPages}
              count={totalCount}
              hasPrevious={page > 1}
              hasNext={page < totalPages}
              onPageChange={setPage}
            />
          </div>
        )}

      </div>
    </>
  );
}

const fieldLabelCls = "mb-2 block text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500";
const fieldInputCls = "h-[34px] rounded-lg border-[1.5px] border-neutral-300 bg-white px-2.5 text-[12px] text-neutral-900 outline-none focus:border-brand-500";
