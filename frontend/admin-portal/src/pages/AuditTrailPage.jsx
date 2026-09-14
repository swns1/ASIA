import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import ChipGroup from "../components/ui/ChipGroup";
import FilterBar, { FilterRow } from "../components/ui/FilterBar";
import Pagination from "../components/Pagination";
import Card from "../components/ui/Card";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Alert from "../components/ui/Alert";
import { StatusBadge } from "../components/ui/Badge";
import { AUDIT_STATUS_MAP, ROLE_MAP } from "../constants/statusMaps";
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
  { key: "user",    label: "User" },
  { key: "role",    label: "Role",    sortable: true },
  { key: "action",  label: "Action" },
  { key: "module",  label: "Module" },
  { key: "date",    label: "Date",    sortable: true },
  { key: "time",    label: "Time",    sortable: true },
  { key: "status",  label: "Status" },
  { key: "details", label: "Details" },
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

// ── Log Row ───────────────────────────────────────────────────────────────────

function LogRow({ log }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-sm font-bold text-neutral-900">
        {log.userName}
      </TableCell>

      <TableCell>
        <StatusBadge status={log.userRole} map={ROLE_MAP} size="sm" />
      </TableCell>

      <TableCell className="max-w-[240px] text-sm text-neutral-900">{log.action}</TableCell>

      <TableCell>
        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-700">
          <i className="ti ti-folder text-[13px] text-brand-500" aria-hidden="true" />
          {log.module}
        </span>
      </TableCell>

      {/* A missing or unparseable timestamp is called out in red — an audit
          record without a reliable time is the one thing worth noticing here. */}
      <TableCell className={`whitespace-nowrap text-sm ${log.invalidDate ? "font-bold text-error-600" : "text-neutral-900"}`}>
        {formatDate(log)}
      </TableCell>

      <TableCell className={`whitespace-nowrap text-sm ${log.invalidDate ? "font-bold text-error-600" : "text-neutral-900"}`}>
        {formatTime(log)}
      </TableCell>

      <TableCell>
        <StatusBadge status={log.status} map={AUDIT_STATUS_MAP} size="sm" />
      </TableCell>

      <TableCell className="max-w-[260px] text-xs text-neutral-700">
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AuditTrailPage() {
  usePageTitle("Audit Trail");
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const allowed = canViewAuditTrail(currentUser);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState([]);
  // No `source` state: it only ever fed the unreachable "sample records"
  // banner (see the note where that banner used to render).

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
      ...Object.entries(AUDIT_STATUS_MAP).map(([key, meta]) => ({
        value: key,
        label: meta.label,
        tone: meta.variant,
        icon: meta.icon,
        count: counts[key] ?? 0,
      })),
    ];
  }, [facets.statusCounts]);

  const roleOptions = useMemo(() => ([
    { value: "all", label: "All" },
    ...roles.map(r => ({
      value: r,
      label: ROLE_MAP[r]?.label ?? normalizeRole(r),
      tone: ROLE_MAP[r]?.variant ?? "muted",
    })),
  ]), [roles]);

  const isFirstRender = useIsFirstRender();

  if (!allowed && !loading) return <AccessDenied navigate={navigate} />;

  return (
    <>
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
        {/* The "Showing local sample records until the audit API endpoint is
            connected" banner used to sit here. It was unreachable:
            auditTrailApi hardcodes source: "api" on success and throws on
            failure, so `source` can never be "sample", and the local sample
            dataset it referred to no longer exists. Unreachable UI that
            promises mock data is worse than none — it suggests to anyone
            reading the file that this page might not be live. */}
        <AnimatePresence>
          {error && (
            <Alert key="error" variant="error" icon="ti-alert-circle">{error}</Alert>
          )}
          {invalidCount > 0 && (
            <Alert key="warn" variant="warning" icon="ti-alert-triangle">
              {invalidCount} log record{invalidCount === 1 ? "" : "s"} contain missing or invalid date/time values.
            </Alert>
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
        >
          <Card padding="none" className="overflow-hidden">
            <Table
              columns={TABLE_COLUMNS}
              loading={loading}
              isEmpty={logs.length === 0}
              skeletonRows={pageSize}
              sortKey={sort.key}
              sortDir={sort.direction}
              onSort={toggleSort}
              empty={{
                icon: "ti-file-search",
                title: "No log records found",
                subtitle: "Try adjusting your status, role, module, or date filters.",
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
