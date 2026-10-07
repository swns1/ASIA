import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Pagination from "../components/Pagination";
import Card from "../components/ui/Card";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Alert from "../components/ui/Alert";
import StatusBand from "../components/ui/StatusBand";
import FilterMenu from "../components/ui/FilterMenu";
import RangeMenu from "../components/ui/RangeMenu";
import SearchField from "../components/ui/SearchField";
import { StatusDot } from "../components/ui/Badge";
import { AUDIT_STATUS_MAP, ROLE_MAP } from "../constants/statusMaps";
import { ROLE_DOT } from "../constants/roleDots";
import { fmtDate, localISODate, todayISO } from "../utils/format";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, canViewAuditTrail } from "../utils/auth";
import { fetchAuditLogs, fetchAuditFacets } from "../api/auditTrailApi";
import { modalVariants, springTransition } from "../utils/motion";

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
  red: "#e03131", redDark: "#c92a2a", redLight: "#fff0f0", redBorder: "#fca5a5",
  border: "#f5eaea", softBorder: "#f9f0f0", text: "#1a0a0a",
  muted: "#7a5050", pale: "#8a6a6a", micro: "#8a6a6a", bg: "#fdf8f6", white: "#ffffff",
};

// ── Data helpers ──────────────────────────────────────────────────────────────

// `key` doubles as the sort key for sortable columns — toggleSort maps
// role/date/time onto the API's `ordering` values.
const TABLE_COLUMNS = [
  { key: "user",    label: "User",    width: "13%" },
  { key: "role",    label: "Role",    width: "11%", sortable: true },
  { key: "action",  label: "Action",  width: "17%" },
  { key: "module",  label: "Module",  width: "10%" },
  { key: "date",    label: "Date",    width: "10%", sortable: true },
  { key: "time",    label: "Time",    width: "8%",  sortable: true },
  { key: "status",  label: "Status",  width: "9%" },
  { key: "details", label: "Details", width: "22%" },
];

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

/// ── Log Row ───────────────────────────────────────────────────────────────────

function LogRow({ log }) {
  return (
    <TableRow>
      <TableCell>
        <span className="whitespace-nowrap text-[13px] font-semibold text-neutral-900">{log.userName}</span>
      </TableCell>

      {/* The same dot as the Role menu and the Users page. */}
      <TableCell>
        <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-neutral-800">
          <span className={`h-2 w-2 shrink-0 rounded-full ${ROLE_DOT[log.userRole] ?? "bg-neutral-400"}`} aria-hidden="true" />
          {ROLE_MAP[log.userRole]?.label ?? normalizeRole(log.userRole)}
        </span>
      </TableCell>

      <TableCell className="max-w-[240px] text-sm text-neutral-900">{log.action}</TableCell>

      <TableCell>
        <span className="text-sm text-neutral-800">{log.module}</span>
      </TableCell>

      {/* A missing or unparseable timestamp is called out in red — an audit
          record without a reliable time is the one thing worth noticing here. */}
      <TableCell className={`whitespace-nowrap text-sm ${log.invalidDate ? "font-bold text-error-600" : "text-neutral-800"}`}>
        {formatDate(log)}
      </TableCell>

      <TableCell className={`whitespace-nowrap text-sm ${log.invalidDate ? "font-bold text-error-600" : "text-neutral-800"}`}>
        {formatTime(log)}
      </TableCell>

      <TableCell>
        <StatusDot status={log.status} map={AUDIT_STATUS_MAP} />
      </TableCell>

      <TableCell className="max-w-[260px] text-[12.5px] text-neutral-700">
        {log.details || "No remarks"}
      </TableCell>
    </TableRow>
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

// ── When a record happened, as the When pill says it ─────────────────────────

const shortTime = (t) => {
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
};

function whenLabel(date, timeFrom, timeTo) {
  const day = date ? (date === todayISO() ? "Today" : fmtDate(date)) : "";
  const time = timeFrom && timeTo ? `${shortTime(timeFrom)} – ${shortTime(timeTo)}`
    : timeFrom ? `after ${shortTime(timeFrom)}`
    : timeTo ? `before ${shortTime(timeTo)}`
    : "";
  return [day, time].filter(Boolean).join(", ") || "Any time";
}

function whenPresets(now = new Date()) {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return [
    { label: "Today",     values: { date: todayISO() } },
    { label: "Yesterday", values: { date: localISODate(yesterday) } },
  ];
}

// Long enough that a word is finished, short enough that the list keeps up.
// The same wait as the other list pages.
const SEARCH_DEBOUNCE_MS = 300;

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AuditTrailPage() {
  usePageTitle("Audit Trail");
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const allowed = canViewAuditTrail(currentUser);

  const [loading, setLoading] = useState(true);
  // The failure itself, not a sentence: the table's error state words it
  // from the response, and offers a retry.
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);

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
  const searchRef = useRef(null);

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

  // Who, where and when: what the band counts. The status and search narrow
  // only the rows, as on the other list pages.
  const scope = useMemo(() => ({
    ...(roleFilter !== "all" ? { role: roleFilter } : null),
    ...(moduleFilter !== "all" ? { module: moduleFilter } : null),
    ...(dateFilter ? { date: dateFilter } : null),
    ...(timeFrom ? { time_from: timeFrom } : null),
    ...(timeTo ? { time_to: timeTo } : null),
  }), [roleFilter, moduleFilter, dateFilter, timeFrom, timeTo]);
  const scopeKey = JSON.stringify(scope);

  const loadLogs = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchAuditLogs({
        page,
        page_size: pageSize,
        ordering: orderingParam,
        ...JSON.parse(scopeKey),
        ...(statusFilter !== "all" ? { status: statusFilter } : null),
        ...(search.trim() ? { search: search.trim() } : null),
      });
      setLogs((data.results || []).map(normalizeLog));
      setTotalCount(data.count ?? 0);
    } catch (e) {
      setError(e.cause ?? e);
      setLogs([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, orderingParam, scopeKey, statusFilter, search]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    if (!allowed) { setLoading(false); return; }
    loadLogs();
  }, [allowed, navigate, loadLogs]);

  // The band's numbers, and the Role and Module menus' choices. The counts
  // follow the scope; the choices always cover the whole log, so they're
  // kept from the last answer rather than emptied while the next one loads.
  // A failure is non-fatal: the band reads "—" and the list still works.
  const [facets, setFacets] = useState({ key: null, roles: [], modules: [], statusCounts: null });
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    fetchAuditFacets(JSON.parse(scopeKey))
      .then((f) => { if (!cancelled) setFacets({ key: scopeKey, ...f }); })
      .catch(() => { if (!cancelled) setFacets((cur) => ({ ...cur, key: scopeKey, statusCounts: null })); });
    return () => { cancelled = true; };
  }, [allowed, scopeKey, refreshKey]);
  const statusCounts = facets.key === scopeKey ? facets.statusCounts : null;

  // Search as you type: the box applies itself once typing pauses.
  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

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
    searchRef.current?.focus();
  }

  const refresh = () => { loadLogs(); setRefreshKey((k) => k + 1); };

  const roleOptions = [
    { value: "all", label: "All roles" },
    ...facets.roles.map((r) => ({
      value: r,
      label: ROLE_MAP[r]?.label ?? normalizeRole(r),
      dot: ROLE_DOT[r] ?? "bg-neutral-400",
    })),
  ];
  const moduleOptions = [
    { value: "all", label: "All modules" },
    ...facets.modules.map((m) => ({ value: m, label: m })),
  ];
  const roleLabel = roleOptions.find((o) => o.value === roleFilter)?.label;
  const when = whenLabel(dateFilter, timeFrom, timeTo);

  // What the band counts: the whole log, or the role, module and time picked.
  const bandCaption = [
    `record${statusCounts?.total === 1 ? "" : "s"}`,
    roleFilter !== "all" && roleLabel,
    moduleFilter !== "all" && moduleFilter,
    (dateFilter || timeFrom || timeTo) && when,
  ].filter(Boolean).join(" · ");

  const isFirstRender = useIsFirstRender();

  if (!allowed && !loading) return <AccessDenied navigate={navigate} />;

  return (
    <>
      <PageHeader
        title="Audit Trail"
        actions={
          <Button variant="secondary" icon="ti-refresh" onClick={refresh}>
            Refresh
          </Button>
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">

        {/* ── How the records in view went, and the status filter ── */}
        <StatusBand
          total={statusCounts?.total}
          caption={bandCaption}
          aside={
            <span className="hidden text-sm text-brand-border sm:block">
              Pick a status to filter the list
            </span>
          }
          options={[
            { value: "all", label: "All", count: statusCounts?.total },
            ...Object.entries(AUDIT_STATUS_MAP).map(([key, meta]) => ({
              value: key,
              label: meta.label,
              count: statusCounts ? (statusCounts[key] ?? 0) : undefined,
              variant: meta.variant,
            })),
          ]}
          value={statusFilter}
          allValue="all"
          onChange={applyFilter(setStatusFilter)}
        />

        {/* ── Toolbar: search, the filter menus, Clear ──
            The menus open to the right edge, where the pills sit. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField
            id="audit-search"
            label="Search audit records"
            placeholder="Search by user, action, or details…"
            inputRef={searchRef}
            value={searchInput}
            onChange={setSearchInput}
            onEnter={() => { setSearch(searchInput); setPage(1); }}
            onClear={() => { setSearchInput(""); setSearch(""); setPage(1); }}
          />

          <FilterMenu
            label="Role"
            valueLabel={roleFilter === "all" ? "All" : roleLabel}
            active={roleFilter !== "all"}
            options={roleOptions}
            value={roleFilter}
            onChange={applyFilter(setRoleFilter)}
            align="end"
            menuWidth={200}
          />

          <FilterMenu
            label="Module"
            valueLabel={moduleFilter === "all" ? "All" : moduleFilter}
            active={moduleFilter !== "all"}
            options={moduleOptions}
            value={moduleFilter}
            onChange={applyFilter(setModuleFilter)}
            align="end"
            menuWidth={220}
          />

          <RangeMenu
            label="When"
            valueLabel={when}
            active={Boolean(dateFilter || timeFrom || timeTo)}
            fields={[
              { key: "date", label: "Day",       type: "date", value: dateFilter, wide: true },
              { key: "from", label: "From time", type: "time", value: timeFrom },
              { key: "to",   label: "To time",   type: "time", value: timeTo },
            ]}
            presets={whenPresets()}
            onApply={({ date, from, to }) => {
              setDateFilter(date ?? ""); setTimeFrom(from ?? ""); setTimeTo(to ?? "");
              setPage(1);
            }}
          />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="focus-ring flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-error-600 transition-colors duration-150 hover:bg-brand-100"
            >
              <i className="ti ti-filter-off text-[14px]" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>

        <AnimatePresence>
          {invalidCount > 0 && (
            <Alert key="warn" variant="warning" icon="ti-alert-triangle">
              {invalidCount} log record{invalidCount === 1 ? "" : "s"} contain missing or invalid date/time values.
            </Alert>
          )}
        </AnimatePresence>

        {/* ── Table ── */}
        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.1 : 0 }}
        >
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-baseline gap-2.5 border-b border-neutral-200 px-5 py-4">
              <h2 className="text-md font-bold text-neutral-900">
                {statusFilter === "all" ? "All records" : `${AUDIT_STATUS_MAP[statusFilter]?.label} records`}
              </h2>
              {!loading && !error && (
                <span className="text-sm text-neutral-500 tabular-nums">{totalCount.toLocaleString()}</span>
              )}
            </div>
            <Table
              headerVariant="quiet"
              columns={TABLE_COLUMNS}
              loading={loading}
              error={error}
              onRetry={loadLogs}
              errorSubject="the audit trail"
              isEmpty={logs.length === 0}
              skeletonRows={Math.min(pageSize, 10)}
              sortKey={sort.key}
              sortDir={sort.direction}
              onSort={toggleSort}
              empty={{
                icon: "ti-file-search",
                title: hasActiveFilters ? "No records match these filters" : "No records yet",
                subtitle: hasActiveFilters
                  ? "Try a different status, role, module or time."
                  : "Sign-ins and changes show here as they happen.",
                withAvatar: false,
                action: hasActiveFilters && (
                  <Button variant="secondary" size="sm" icon="ti-filter-off" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ),
              }}
            >
              {logs.map(log => <LogRow key={log.id} log={log} />)}
            </Table>
          </Card>
        </motion.div>

        {!loading && !error && totalCount > 0 && (
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
