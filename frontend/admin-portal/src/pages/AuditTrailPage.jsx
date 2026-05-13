import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAuditLogs } from "../api/auditTrailApi";
import { canViewAuditTrail, clearAuthSession, getCurrentUser } from "../utils/auth";
import logo from "../assets/logo.png";
import logoutIcon from "../assets/logout.svg";


const NAV = [
  { section: "Main", items: [
    { label: "Dashboard",   icon: "ti-layout-dashboard", path: "/dashboard"   },
    { label: "Students",    icon: "ti-users",             path: "/students"    },
    { label: "Enrollments", icon: "ti-clipboard-list",    path: "/enrollments" },
    { label: "Subjects",    icon: "ti-book",              path: "/subjects"    },
    { label: "Grades",      icon: "ti-chart-bar",         path: "/grades"      },
    { label: "Requirements", icon: "ti-file-check",        path: "/requirements" },
  ]},
  { section: "Finance", items: [
    { label: "Invoices",     icon: "ti-receipt",  path: "/invoices"     },
    { label: "Payments",     icon: "ti-cash",     path: "/payments"     },
    { label: "Scholarships", icon: "ti-discount", path: "/scholarships" },
  ]},
  { section: "Settings", items: [
    { label: "Users",             icon: "ti-user-cog",         path: "/users" },
    { label: "Audit Trail",       icon: "ti-shield-check",     path: "/audit-trail", adminOnly: true },
    { label: "School Settings",   icon: "ti-settings",         path: "/settings" },
    { label: "Grading Templates", icon: "ti-report-analytics", path: "/grading-templates" },
    { label: "Scholarship Types", icon: "ti-discount",         path: "/scholarship-types" },
    { label: "Fee Schedules",     icon: "ti-cash",             path: "/fee-schedules" },
  ]},
];

const C = {
  red: "#e03131",
  redDark: "#c92a2a",
  redLight: "#fff0f0",
  redBorder: "#fca5a5",
  border: "#f5eaea",
  softBorder: "#f9f0f0",
  text: "#1a0a0a",
  muted: "#7a5050",
  pale: "#b09090",
  bg: "#fdf8f6",
  white: "#ffffff",
};

const statusMeta = {
  success: { label: "Success", bg: "#e8f5e0", color: "#2e6b0d", icon: "ti-circle-check" },
  failed:  { label: "Failed",  bg: "#fde8e8", color: "#9b2020", icon: "ti-circle-x" },
  warning: { label: "Warning", bg: "#fef3e2", color: "#7a4a08", icon: "ti-alert-triangle" },
  pending: { label: "Pending", bg: "#e3f0fd", color: "#1455a0", icon: "ti-clock" },
};

function normalizeRole(role) {
  return String(role || "unknown").replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

const legacyDetailSubjects = {
  "students": "student record",
  "households": "household record",
  "guardians": "guardian record",
  "student_siblings": "student sibling record",
  "siblings": "sibling record",
  "previous_schools": "previous school record",
  "requirement_types": "requirement type",
  "student_requirement_submissions": "student requirement submission",
  "enrollments": "enrollment record",
  "subjects": "subject",
  "grades": "grade record",
  "grading-templates": "grading template",
  "grading-components": "grading component",
  "score-entries": "score entry",
  "scholarship-types": "scholarship type",
  "enrollment-scholarships": "scholarship award",
  "school-settings": "school settings",
  "fee-schedules": "fee schedule",
  "fee-schedule-items": "fee schedule item",
  "discount-types": "discount type",
  "invoices": "invoice",
  "payments": "payment",
};

const moduleSubjects = {
  Students: "student record",
  Households: "household record",
  Guardians: "guardian record",
  "Student Siblings": "student sibling record",
  Siblings: "sibling record",
  "Previous Schools": "previous school record",
  Requirements: "requirement record",
  Enrollments: "enrollment record",
  Subjects: "subject",
  Grades: "grade record",
  Scholarships: "scholarship award",
  "Scholarship Types": "scholarship type",
  "School Settings": "school settings",
  "Fee Schedules": "fee schedule",
  "Fee Schedule Items": "fee schedule item",
  "Discount Types": "discount type",
  Invoices: "invoice",
  Payments: "payment",
};

const legacyMethodWords = {
  POST: ["Created", "created", "create"],
  PUT: ["Updated", "updated", "update"],
  PATCH: ["Updated", "updated", "update"],
  DELETE: ["Deleted", "deleted", "delete"],
};

function sentenceCase(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function parseTechnicalDetail(value, metadata = {}) {
  const detail = String(value || "").trim();
  const metadataPath = metadata?.path;
  const metadataMethod = metadata?.method;
  const metadataStatus = metadata?.status_code;

  if (metadataPath && metadataMethod && metadataStatus !== undefined) {
    const parts = String(metadataPath).split("/").filter(Boolean);
    const key = parts[0] === "api" ? parts[1] : parts[0];
    return {
      method: String(metadataMethod).toUpperCase(),
      key: key || "system",
      path: String(metadataPath),
      success: Number(metadataStatus) < 400,
    };
  }

  const match = detail.match(/^([A-Z]+)\s+(\/api\/[^\s]+)\s+returned HTTP\s+(\d+)\.?$/i);
  if (!match) return null;

  const parts = match[2].split("/").filter(Boolean);
  return {
    method: match[1].toUpperCase(),
    key: parts[0] === "api" ? parts[1] : parts[0],
    path: match[2],
    success: Number(match[3]) < 400,
  };
}

function actionFromTechnicalInfo(info) {
  if (info.key === "payments" && info.method === "POST") return "Recorded payment";
  if (info.key === "score-entries" && info.method === "POST") return "Added score entry";
  if (info.key === "send-enrollment-email" && info.method === "POST") return "Sent enrollment email";
  if (info.key === "enrollment-scholarships" && info.method === "POST") return "Awarded scholarship";
  if (info.key === "invoices" && info.path.includes("/generate")) return "Generated invoice";
  if (info.key === "students" && info.path.includes("/bulk-create")) return "Saved student information";

  const [titleVerb] = legacyMethodWords[info.method] || ["Changed", "changed", "change"];
  const subject = legacyDetailSubjects[info.key] || `${info.key.replaceAll("-", " ").replaceAll("_", " ")} record`;
  return `${titleVerb} ${subject}`;
}

function detailsFromTechnicalInfo(info) {
  if (info.key === "payments" && info.method === "POST") {
    return info.success ? "Payment was recorded successfully." : "Payment could not be recorded. Please review the payment details.";
  }
  if (info.key === "score-entries" && info.method === "POST") {
    return info.success ? "Score entry was added successfully." : "Score entry could not be added. Please review the grade details.";
  }
  if (info.key === "send-enrollment-email" && info.method === "POST") {
    return info.success ? "Enrollment email was sent successfully." : "Enrollment email could not be sent. Please review the student's email address.";
  }
  if (info.key === "enrollment-scholarships" && info.method === "POST") {
    return info.success ? "Scholarship was awarded successfully." : "Scholarship could not be awarded. Please review the scholarship details.";
  }
  if (info.key === "invoices" && info.path.includes("/generate")) {
    return info.success ? "Invoice was generated successfully." : "Invoice could not be generated. Please review the enrollment and payment plan.";
  }
  if (info.key === "students" && info.path.includes("/bulk-create")) {
    return info.success ? "Student information was saved successfully." : "Student information could not be saved. Please review the student details.";
  }

  const [, pastTense, baseVerb] = legacyMethodWords[info.method] || ["Changed", "changed", "change"];
  const subject = legacyDetailSubjects[info.key] || `${info.key.replaceAll("-", " ").replaceAll("_", " ")} record`;
  const beWord = info.key === "school-settings" ? "were" : "was";

  if (info.success) return `${sentenceCase(subject)} ${beWord} ${pastTense} successfully.`;
  return `${sentenceCase(subject)} could not be ${baseVerb}d. Please review the submitted information.`;
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
function normalizeLog(row, index) {
  const date = row.occurred_at ? new Date(row.occurred_at) : null;
  const invalidDate = !date || Number.isNaN(date.getTime());
  return {
    id: row.id ?? row.log_id ?? row.audit_log_id ?? index + 1,
    userName: row.user_name ?? row.user?.name ?? "Unknown user",
    userRole: row.user_role ?? row.user?.role ?? "unknown",
    action: humanizeAuditAction(row.action, row.details ?? row.remarks ?? "", row.metadata ?? {}, row.module ?? row.section ?? ""),
    module: row.module ?? row.section ?? "General",
    occurredAt: row.occurred_at ?? "",
    date,
    invalidDate,
    status: String(row.status ?? row.result ?? "success").toLowerCase(),
    details: humanizeTechnicalDetails(row.details ?? row.remarks ?? "", row.metadata ?? {}),
  };
}

function dateValue(log) {
  return log.invalidDate ? "" : log.date.toISOString().slice(0, 10);
}

function timeValue(log) {
  return log.invalidDate ? "" : log.date.toTimeString().slice(0, 5);
}

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

const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width:w, height:h, borderRadius:r, background:"linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.6s ease-in-out infinite" }} />
);

function LogoutModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"white", borderRadius:20, padding:"32px 36px", width:380, boxShadow:"0 24px 64px rgba(224,49,49,0.18)", display:"flex", flexDirection:"column", alignItems:"center", gap:14, animation:"slideUp 0.2s ease" }}>
        <div style={{ width:56, height:56, borderRadius:14, background:C.redLight, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <i className="ti ti-logout" style={{ fontSize:24, color:C.red }} />
        </div>
        <div style={{ fontSize:17, fontWeight:700, color:C.text}}>Log out?</div>
        <div style={{ fontSize:13, color:C.muted, textAlign:"center", lineHeight:1.7 }}>You'll be returned to the login page. Any unsaved changes will be lost.</div>
        <div style={{ display:"flex", gap:10, width:"100%", marginTop:4 }}>
          <button onClick={onCancel} style={s.secondaryBtn}>Stay</button>
          <button onClick={onConfirm} style={s.dangerBtn}>Yes, logout</button>
        </div>
      </div>
    </div>
  );
}

function AccessDenied({ navigate }) {
  return (
    <div style={s.centerShell}>
      <style>{baseCss}</style>
      <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:18, padding:"34px 38px", width:420, boxShadow:"0 18px 50px rgba(224,49,49,0.12)", textAlign:"center" }}>
        <div style={{ width:58, height:58, borderRadius:16, background:C.redLight, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
          <i className="ti ti-shield-lock" style={{ fontSize:26, color:C.red }} />
        </div>
        <div style={{ fontSize:18, fontWeight:700, color:C.text}}>Access denied</div>
        <div style={{ fontSize:13, color:C.muted, lineHeight:1.7, marginTop:8 }}>Only Admin and Super Admin users can view log records.</div>
        <button onClick={() => navigate("/dashboard")} style={{ ...s.primaryBtn, marginTop:22 }}>
          <i className="ti ti-arrow-left" style={{ fontSize:14 }} />Back to Dashboard
        </button>
      </div>
    </div>
  );
}

export default function AuditTrailPage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const allowed = canViewAuditTrail(currentUser);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState([]);
  const [source, setSource] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [sort, setSort] = useState({ key: "date", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showLogout, setShowLogout] = useState(false);

  const navGroups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || allowed),
  }));

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) {
      navigate("/");
      return;
    }
    if (!allowed) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    fetchAuditLogs()
      .then((data) => {
        setLogs((data.results || []).map(normalizeLog));
        setSource(data.source);
      })
      .catch((e) => setError(e.message || "Failed to load log records."))
      .finally(() => setLoading(false));
  }, [allowed, navigate]);

  const roles = useMemo(() => {
    const unique = Array.from(new Set(logs.map((log) => log.userRole).filter(Boolean)));
    return unique.sort((a, b) => normalizeRole(a).localeCompare(normalizeRole(b)));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs
      .filter((log) => roleFilter === "all" || log.userRole === roleFilter)
      .filter((log) => !dateFilter || dateValue(log) === dateFilter)
      .filter((log) => !timeFrom || (timeValue(log) && timeValue(log) >= timeFrom))
      .filter((log) => !timeTo || (timeValue(log) && timeValue(log) <= timeTo))
      .sort((a, b) => {
        if (sort.key === "role") return compareValues(normalizeRole(a.userRole), normalizeRole(b.userRole), sort.direction);
        if (sort.key === "time") return compareValues(timeValue(a), timeValue(b), sort.direction);
        return compareValues(a.invalidDate ? 0 : a.date.getTime(), b.invalidDate ? 0 : b.date.getTime(), sort.direction);
      });
  }, [dateFilter, logs, roleFilter, sort, timeFrom, timeTo]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const pageLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize);
  const invalidCount = logs.filter((log) => log.invalidDate).length;

  useEffect(() => {
    setPage(1);
  }, [roleFilter, dateFilter, timeFrom, timeTo, pageSize]);

  function toggleSort(key) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  function clearFilters() {
    setRoleFilter("all");
    setDateFilter("");
    setTimeFrom("");
    setTimeTo("");
  }

  if (!allowed && !loading) {
    return <AccessDenied navigate={navigate} />;
  }

  return (
    <>
      <style>{baseCss}</style>
      <div style={s.shell}>
        <aside style={s.sidebar}>
          <div style={s.brandWrap}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={s.brandIcon}>
                <img src={logo} alt="Logo" style={{ width: 20, height: 30 }} />
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:C.text }}>South Lakes IS</div>
                <div style={{ fontSize:11, color:C.pale, marginTop:1 }}>Admin Portal</div>
              </div>
            </div>
          </div>

          <nav style={s.nav}>
            {navGroups.map((group) => (
              <div key={group.section} style={{ marginBottom:6 }}>
                <div style={s.navSection}>{group.section}</div>
                {group.items.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <div key={item.path} className={`nav-item${active ? " nav-active" : ""}`}
                      style={{ ...s.navItem, color:active ? C.red : "#7a5a5a" }}
                      onClick={() => navigate(item.path)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && navigate(item.path)}>
                      <i className={`ti ${item.icon}`} style={{ fontSize:16, width:20, textAlign:"center" }} />
                      {item.label}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>

          <div style={{ padding:"14px 10px", borderTop:`1px solid ${C.border}` }}>
            <div style={s.userBox}>
              <div style={s.avatar}>{(currentUser?.name || "SA").slice(0, 2).toUpperCase()}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={s.userName}>{currentUser?.name || "Super Admin"}</div>
                <div style={s.userRole}>{currentUser?.role || "super_admin"}</div>
              </div>
              <button title="Logout" onClick={() => setShowLogout(true)} style={s.logoutBtn}>
                <img src={logoutIcon} alt="Logout" style={{ width: 20, height: 20 }} />
              </button>
            </div>
          </div>
        </aside>

        <main style={s.main}>
          <div style={s.topbar}>
            <div>
              <div style={s.topbarTitle}>Audit Trail</div>
              <div style={s.topbarSub}>Log Records / Administrative Review</div>
            </div>
            <button onClick={() => window.location.reload()} style={s.primaryBtn}>
              <i className="ti ti-refresh" style={{ fontSize:14 }} />Refresh
            </button>
          </div>

          <div style={s.content}>
            {source === "sample" && (
              <div style={s.infoBanner}>
                <i className="ti ti-info-circle" style={{ fontSize:15 }} />
                Showing local sample records until the audit API endpoint is connected.
              </div>
            )}
            {error && (
              <div style={s.errorBanner}>
                <i className="ti ti-alert-circle" style={{ fontSize:15 }} />
                {error}
              </div>
            )}
            {invalidCount > 0 && (
              <div style={s.warningBanner}>
                <i className="ti ti-alert-triangle" style={{ fontSize:15 }} />
                {invalidCount} log record{invalidCount === 1 ? "" : "s"} contain missing or invalid date/time values.
              </div>
            )}

            <div style={s.statGrid}>
              <SummaryCard label="Total Logs" value={logs.length} icon="ti-list-details" loading={loading} />
              <SummaryCard label="Visible Records" value={filteredLogs.length} icon="ti-filter-check" loading={loading} />
              <SummaryCard label="Failed Actions" value={logs.filter((log) => log.status === "failed").length} icon="ti-circle-x" loading={loading} />
              <SummaryCard label="Invalid Dates" value={invalidCount} icon="ti-calendar-x" loading={loading} />
            </div>

            <section style={s.panel}>
              <div style={s.panelHeader}>
                <div>
                  <div style={s.panelTitle}>System Log Records</div>
                  <div style={{ fontSize:11.5, color:C.pale, marginTop:2 }}>{filteredLogs.length} record{filteredLogs.length === 1 ? "" : "s"} found</div>
                </div>
                <button onClick={clearFilters} style={s.filterReset}>
                  <i className="ti ti-eraser" style={{ fontSize:13 }} />Clear filters
                </button>
              </div>

              <div style={s.filters}>
                <Field label="Role">
                  <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={s.input}>
                    <option value="all">All roles</option>
                    {roles.map((role) => <option key={role} value={role}>{normalizeRole(role)}</option>)}
                  </select>
                </Field>
                <Field label="Date">
                  <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} style={s.input} />
                </Field>
                <Field label="From">
                  <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} style={s.input} />
                </Field>
                <Field label="To">
                  <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} style={s.input} />
                </Field>
                <Field label="Rows">
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={s.input}>
                    {[5, 10, 15, 25].map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </Field>
              </div>

              <div style={{ overflowX:"auto" }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <Th>User name</Th>
                      <Th sortable active={sort.key === "role"} direction={sort.direction} onClick={() => toggleSort("role")}>Role</Th>
                      <Th>Action performed</Th>
                      <Th>Module</Th>
                      <Th sortable active={sort.key === "date"} direction={sort.direction} onClick={() => toggleSort("date")}>Date</Th>
                      <Th sortable active={sort.key === "time"} direction={sort.direction} onClick={() => toggleSort("time")}>Time</Th>
                      <Th>Status</Th>
                      <Th>Details</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && Array.from({ length: pageSize }).map((_, idx) => (
                      <tr key={idx}>
                        {Array.from({ length: 8 }).map((__, cell) => (
                          <td key={cell} style={s.td}><Sk h={14} /></td>
                        ))}
                      </tr>
                    ))}
                    {!loading && pageLogs.map((log) => {
                      const status = statusMeta[log.status] || statusMeta.pending;
                      return (
                        <tr key={log.id} className="audit-row">
                          <td style={s.td}>
                            <div style={{ fontWeight:700, color:C.text }}>{log.userName}</div>
                          </td>
                          <td style={s.td}><span style={s.rolePill}>{normalizeRole(log.userRole)}</span></td>
                          <td style={s.td}>{log.action}</td>
                          <td style={s.td}>
                            <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                              <i className="ti ti-folder" style={{ fontSize:13, color:C.red }} />
                              {log.module}
                            </span>
                          </td>
                          <td style={s.td}>
                            <span style={log.invalidDate ? s.invalidText : undefined}>{formatDate(log)}</span>
                          </td>
                          <td style={s.td}>
                            <span style={log.invalidDate ? s.invalidText : undefined}>{formatTime(log)}</span>
                          </td>
                          <td style={s.td}>
                            <span style={{ ...s.statusPill, background:status.bg, color:status.color }}>
                              <i className={`ti ${status.icon}`} style={{ fontSize:12 }} />
                              {status.label}
                            </span>
                          </td>
                          <td style={{ ...s.td, color:C.muted, minWidth:220 }}>{log.details || "No remarks"}</td>
                        </tr>
                      );
                    })}
                    {!loading && pageLogs.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ padding:"38px 18px", textAlign:"center" }}>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                            <i className="ti ti-file-search" style={{ fontSize:28, color:"#e08080" }} />
                            <div style={{ fontSize:14, fontWeight:700, color:C.text }}>No log records found</div>
                            <div style={{ fontSize:12, color:C.pale }}>Try changing the selected role, date, or time filters.</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={s.pagination}>
                <div style={{ fontSize:12, color:C.pale }}>
                  Page {page} of {totalPages}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={page === 1 ? s.pageBtnDisabled : s.pageBtn}>
                    <i className="ti ti-chevron-left" style={{ fontSize:13 }} />Previous
                  </button>
                  {Array.from({ length: totalPages }).slice(0, 5).map((_, i) => {
                    const pageNumber = i + 1;
                    return (
                      <button key={pageNumber} onClick={() => setPage(pageNumber)} style={page === pageNumber ? s.pageBtnActive : s.pageBtn}>
                        {pageNumber}
                      </button>
                    );
                  })}
                  <button disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={page === totalPages ? s.pageBtnDisabled : s.pageBtn}>
                    Next<i className="ti ti-chevron-right" style={{ fontSize:13 }} />
                  </button>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      {showLogout && (
        <LogoutModal
          onCancel={() => setShowLogout(false)}
          onConfirm={() => { clearAuthSession(); navigate("/"); }}
        />
      )}
    </>
  );
}

function SummaryCard({ label, value, icon, loading }) {
  return (
    <div style={s.statCard}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={s.statLabel}>{label}</span>
        <div style={s.statIcon}><i className={`ti ${icon}`} style={{ fontSize:15, color:C.red }} /></div>
      </div>
      {loading ? <Sk h={30} w="60%" /> : <div style={s.statValue}>{value.toLocaleString()}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display:"flex", flexDirection:"column", gap:5 }}>
      <span style={s.label}>{label}</span>
      {children}
    </label>
  );
}

function Th({ children, sortable, active, direction, onClick }) {
  return (
    <th style={s.th}>
      {sortable ? (
        <button onClick={onClick} style={s.sortBtn}>
          {children}
          <i className={`ti ${active && direction === "asc" ? "ti-sort-ascending" : "ti-sort-descending"}`} style={{ fontSize:12, color:active ? C.red : "#c0a0a0" }} />
        </button>
      ) : children}
    </th>
  );
}

const baseCss = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'DM Sans',sans-serif; }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }
  .nav-item { transition:background 0.12s,color 0.12s; }
  .nav-item:hover { background:#fff4f4 !important; color:#e03131 !important; }
  .nav-active { background:#fff0f0 !important; color:#e03131 !important; font-weight:600 !important; }
  .audit-row:hover td { background:#fff8f6; }
`;

const s = {
  shell: { display:"flex", height:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif", overflow:"hidden" },
  centerShell: { minHeight:"100vh", background:C.bg, fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", padding:24 },
  sidebar: { width:224, flexShrink:0, background:C.white, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", boxShadow:"2px 0 12px rgba(224,49,49,0.04)" },
  brandWrap: { padding:"22px 18px 18px", borderBottom:`1px solid ${C.border}` },
  nav: { flex:1, padding:"14px 10px", display:"flex", flexDirection:"column", gap:2, overflowY:"auto" },
  navSection: { fontSize:9.5, color:"#cdb0b0", letterSpacing:"0.1em", textTransform:"uppercase", padding:"10px 10px 4px", fontWeight:600 },
  navItem: { display:"flex", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:9, fontSize:13, cursor:"pointer" },
  userBox: { display:"flex", alignItems:"center", gap:10, padding:"10px", borderRadius:10, background:"#fff8f6" },
  avatar: { width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#fde8e8,#fca5a5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:C.red, flexShrink:0 },
  userName: { fontSize:13, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  userRole: { fontSize:11, color:C.pale, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  logoutBtn: { width:30, height:30, border:"1px solid #f0e4e4", borderRadius:8, background:C.white, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#c09090" },
  main: { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  topbar: { background:C.white, borderBottom:`1px solid ${C.border}`, padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" },
  topbarTitle: { fontSize:16, fontWeight:700, color:C.text},
  topbarSub: { fontSize:11.5, color:C.pale, marginTop:1 },
  content: { flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 },
  primaryBtn: { display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, background:`linear-gradient(135deg,${C.red},${C.redDark})`, color:C.white, border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.24)" },
  secondaryBtn: { flex:1, height:42, border:"1.5px solid #f0e0e0", borderRadius:10, background:C.white, fontSize:13, color:C.muted, cursor:"pointer", fontWeight:600, fontFamily:"'DM Sans',sans-serif" },
  dangerBtn: { flex:1, height:42, border:"none", borderRadius:10, background:`linear-gradient(135deg,${C.red},${C.redDark})`, fontSize:13, color:C.white, cursor:"pointer", fontWeight:700, fontFamily:"'DM Sans',sans-serif" },
  statGrid: { display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:12 },
  statCard: { background:C.white, border:`1px solid ${C.border}`, borderRadius:14, padding:16, display:"flex", flexDirection:"column", gap:10, boxShadow:"0 2px 12px rgba(224,49,49,0.06)" },
  statLabel: { fontSize:12, color:"#a07878", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em" },
  statIcon: { width:30, height:30, borderRadius:8, background:C.redLight, display:"flex", alignItems:"center", justifyContent:"center" },
  statValue: { fontSize:26, fontWeight:700, color:C.text, lineHeight:1 },
  panel: { background:C.white, border:`1px solid ${C.border}`, borderRadius:16, display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" },
  panelHeader: { padding:"16px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" },
  panelTitle: { fontSize:14, fontWeight:700, color:C.text},
  filters: { display:"grid", gridTemplateColumns:"1.1fr repeat(4, minmax(110px, 0.7fr))", gap:10, padding:"14px 18px", borderBottom:`1px solid ${C.softBorder}`, background:"#fffdfd" },
  label: { fontSize:10.5, color:"#9f7777", textTransform:"uppercase", letterSpacing:"0.07em", fontWeight:700 },
  input: { width:"100%", height:36, border:"1.5px solid #f0ceca", borderRadius:10, padding:"0 10px", background:"#fffbfb", color:C.text, fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:"none" },
  filterReset: { display:"inline-flex", alignItems:"center", gap:6, border:`1px solid ${C.border}`, borderRadius:9, background:C.white, color:C.muted, padding:"8px 12px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
  table: { width:"100%", borderCollapse:"collapse", fontSize:13, minWidth:1040 },
  th: { textAlign:"left", fontSize:10.5, fontWeight:700, color:"#c0a0a0", padding:"13px 18px", borderBottom:`1px solid ${C.border}`, textTransform:"uppercase", letterSpacing:"0.07em", background:C.white, whiteSpace:"nowrap" },
  td: { padding:"12px 18px", borderBottom:`1px solid ${C.softBorder}`, color:C.text, verticalAlign:"middle" },
  sortBtn: { display:"inline-flex", alignItems:"center", gap:5, border:"none", background:"transparent", color:"inherit", font:"inherit", textTransform:"inherit", letterSpacing:"inherit", cursor:"pointer", padding:0 },
  rolePill: { display:"inline-flex", alignItems:"center", borderRadius:99, padding:"4px 9px", background:"#f7eeee", color:C.muted, fontSize:11, fontWeight:700, whiteSpace:"nowrap" },
  statusPill: { display:"inline-flex", alignItems:"center", gap:5, borderRadius:99, padding:"4px 10px", fontSize:11, fontWeight:700, whiteSpace:"nowrap" },
  invalidText: { color:"#b91c1c", fontWeight:700 },
  pagination: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderTop:`1px solid ${C.border}` },
  pageBtn: { display:"inline-flex", alignItems:"center", gap:5, minWidth:34, height:32, justifyContent:"center", padding:"0 10px", border:`1px solid ${C.border}`, borderRadius:8, background:C.white, color:C.muted, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
  pageBtnActive: { display:"inline-flex", alignItems:"center", minWidth:34, height:32, justifyContent:"center", padding:"0 10px", border:`1px solid ${C.redBorder}`, borderRadius:8, background:C.redLight, color:C.red, fontSize:12, fontWeight:800, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
  pageBtnDisabled: { display:"inline-flex", alignItems:"center", gap:5, minWidth:34, height:32, justifyContent:"center", padding:"0 10px", border:"1px solid #f0eeee", borderRadius:8, background:"#fbf8f8", color:"#d0bbbb", fontSize:12, fontWeight:700, cursor:"not-allowed", fontFamily:"'DM Sans',sans-serif" },
  infoBanner: { background:"#e3f0fd", border:"1px solid #a7c7ed", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#1455a0", display:"flex", alignItems:"center", gap:8 },
  errorBanner: { background:"#fef2f2", border:`1px solid ${C.redBorder}`, borderRadius:10, padding:"12px 16px", fontSize:13, color:"#b91c1c", display:"flex", alignItems:"center", gap:8 },
  warningBanner: { background:"#fef3e2", border:"1px solid #f4c27a", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#7a4a08", display:"flex", alignItems:"center", gap:8 },
};

