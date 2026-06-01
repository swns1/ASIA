import { useState, useEffect } from "react";
import AppLayout from "../components/AppLayout";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";


// ── API ───────────────────────────────────────────────────────────────────────
import { getStudents as _getStudents } from "../api/studentApi";
import {
  getEnrollments as _getEnrollments,
  getEnrollmentScholarships as _getEnrollmentScholarships,
  getSubjects as _getSubjects,
} from "../api/enrollmentApi";
import { getInvoices as _getInvoices } from "../api/billingApi";

// ── NAV ───────────────────────────────────────────────────────────────────────

// ── Filter constants ──────────────────────────────────────────────────────────
const SCHOOL_YEARS = (() => {
  const now = new Date();
  const cur = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 5 }, (_, i) => {
    const y = cur - i;
    return `${y}-${y + 1}`;
  });
})();

const LEVEL_GRADES = {
  "":                [],
  nursery:           ["Nursery"],
  kindergarten:      ["Kinder"],
  elementary:        ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"],
  junior_highschool: ["Grade 7","Grade 8","Grade 9","Grade 10"],
  senior_highschool: ["Grade 11","Grade 12"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const LEVEL_LABELS = {
  nursery:           "Nursery",
  kindergarten:      "Kindergarten",
  elementary:        "Elementary",
  junior_highschool: "Junior HS",
  senior_highschool: "Senior HS",
};
const LEVEL_ICONS = {
  nursery:           "ti-baby-carriage",
  kindergarten:      "ti-star",
  elementary:        "ti-book",
  junior_highschool: "ti-school",
  senior_highschool: "ti-certificate",
};
const LEVEL_COLORS = {
  nursery:           { color: "#be185d", bg: "#fde8f8" },
  kindergarten:      { color: "#d97706", bg: "#fdf5e8" },
  elementary:        { color: "#2e6b0d", bg: "#e8f5e0" },
  junior_highschool: { color: "#1455a0", bg: "#e3f0fd" },
  senior_highschool: { color: "#7c3aed", bg: "#f0e8fd" },
};

function pillStyle(status) {
  const map = {
    enrolled:  { bg: "#eaf3de", color: "#3b6d11" },
    pending:   { bg: "#faeeda", color: "#854f0b" },
    cancelled: { bg: "#fcebeb", color: "#a32d2d" },
    completed: { bg: "#e6f1fb", color: "#185fa5" },
  };
  return map[status] ?? { bg: "#f1efe8", color: "#5f5e5a" };
}

// ── Live clock ────────────────────────────────────────────────────────────────
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// Current school year helper
function currentSchoolYear() {
  const now = new Date();
  const yr  = now.getFullYear();
  return now.getMonth() >= 5 ? `${yr}-${yr + 1}` : `${yr - 1}-${yr}`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 18, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "#e8e6e0", animation: "pulse 1.4s ease-in-out infinite" }} />
);

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, chipText, chipType, loading, filters, filterValues, onFilterChange }) {
  const [showFilters, setShowFilters] = useState(false);
  const chips = {
    up:      { bg: "#eaf3de", color: "#3b6d11" },
    down:    { bg: "#fcebeb", color: "#a32d2d" },
    neutral: { bg: "#f1efe8", color: "#5f5e5a" },
    info:    { bg: "#e3f0fd", color: "#1455a0" },
  };
  const chip = chips[chipType] ?? chips.neutral;
  const hasActiveFilter = filters?.some((f) => filterValues?.[f.key]);
  const selStyle = {
    flex: 1, padding: "4px 6px", borderRadius: 6, border: "1px solid #f0e0e0",
    fontSize: 11, color: "#5a3a3a", background: "white", cursor: "pointer",
    fontFamily: "'DM Sans',sans-serif", outline: "none", minWidth: 0,
  };
  return (
    <div style={s.statCard}>
      <div style={s.statTop}>
        <span style={s.statLabel}>{label}</span>
        <div style={s.statIcon}>
          <i className={`ti ${icon}`} style={{ fontSize: 15, color: "#e03131" }} />
        </div>
      </div>
      {loading ? <Sk h={30} w="60%" /> : <div style={s.statValue}>{value}</div>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {loading
          ? <Sk h={16} w="70%" />
          : <span style={{ ...s.chip, background: chip.bg, color: chip.color }}>{chipText}</span>
        }
        {filters?.length > 0 && (
          <div style={{ display: "flex", gap: 4 }}>
            {hasActiveFilter && (
              <button
                onClick={() => filters.forEach((f) => onFilterChange(f.key, null))}
                style={{
                  display: "flex", alignItems: "center", gap: 3,
                  fontSize: 10.5, padding: "2px 7px", borderRadius: 99,
                  border: "1px solid #f0e0e0", background: "white",
                  color: "#b09090", cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif", fontWeight: 500,
                  transition: "all 0.12s",
                }}
              >
                <i className="ti ti-x" style={{ fontSize: 10 }} />
                Clear
              </button>
            )}
            <button
              onClick={() => setShowFilters((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 3,
                fontSize: 10.5, padding: "2px 7px", borderRadius: 99,
                border: `1px solid ${hasActiveFilter ? "#e03131" : "#f0e0e0"}`,
                background: hasActiveFilter ? "#fff0f0" : "white",
                color: hasActiveFilter ? "#e03131" : "#b09090",
                cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 500,
                transition: "all 0.12s",
              }}
            >
              <i className="ti ti-adjustments-horizontal" style={{ fontSize: 10 }} />
              {hasActiveFilter ? "Filtered" : "Filter"}
            </button>
          </div>
        )}
      </div>
      {showFilters && filters?.length > 0 && (
        <div style={{ display: "flex", gap: 4, paddingTop: 6, borderTop: "1px solid #f9f0f0", marginTop: 2 }}>
          {filters.map((f) => (
            <select
              key={f.key}
              value={filterValues?.[f.key] ?? ""}
              onChange={(e) => onFilterChange(f.key, e.target.value || null)}
              style={selStyle}
            >
              <option value="">{f.placeholder ?? "All"}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ))}
        </div>
      )}
    </div>
  );
}
// ── Panel ─────────────────────────────────────────────────────────────────────
function Panel({ title, action, onAction, children }) {
  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <span style={s.panelTitle}>{title}</span>
        {action && <button style={s.panelAction} onClick={onAction}>{action}</button>}
      </div>
      {children}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const navigate     = useNavigate();
  const currentUser  = getCurrentUser();
  const now          = useClock();

  // ── per-card filter state ──
  const [studentsFilters,    setStudentsFilters]    = useState({ level: null, grade: null });
  const [enrolledFilters,    setEnrolledFilters]    = useState({ year: null, level: null, grade: null });
  const [pendingFilters,     setPendingFilters]     = useState({ year: null, level: null, grade: null });
  const [scholarshipFilters, setScholarshipFilters] = useState({ year: null, level: null, grade: null });

  function updateFilter(setter) {
    return (key, val) => setter((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "level") next.grade = null;
      return next;
    });
  }

  // ── data state ──
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  const [totalStudents,    setTotalStudents]    = useState(0);
  const [activeStudents,   setActiveStudents]   = useState(0);
  const [enrolledCount,    setEnrolledCount]    = useState(0);
  const [pendingCount,     setPendingCount]     = useState(0);
  const [scholarshipCount, setScholarshipCount] = useState(0);
  const [subjectCount,     setSubjectCount]     = useState(0);

  const [recentEnrollments, setRecentEnrollments] = useState([]);
  const [levelBreakdown,    setLevelBreakdown]    = useState([]);
  const [recentStudents,    setRecentStudents]    = useState([]);
  const [scholarships,      setScholarships]      = useState([]);

  // ── Alert state ──
  const [alerts, setAlerts] = useState([]);

  const schoolYear = currentSchoolYear();

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchAll();
  }, []);

  useEffect(() => { fetchStudentStats(); },    [studentsFilters]);
  useEffect(() => { fetchEnrollmentStats(); }, [enrolledFilters]);
  useEffect(() => { fetchPendingStats(); },    [pendingFilters]);
  useEffect(() => { fetchScholarships(); },    [scholarshipFilters]);

  async function fetchAll() {
    setLoading(true);
    try {
      await Promise.all([
        fetchStudentStats(),
        fetchEnrollmentStats(),
        fetchPendingStats(),
        fetchRecentEnrollments(),
        fetchLevelBreakdown(),
        fetchRecentStudents(),
        fetchScholarships(),
        fetchSubjectCount(),
        fetchAlerts(),
      ]);
    } catch (e) {
      console.error("Dashboard fetch error:", e);
      setError("");
    } finally {
      setLoading(false);
    }
  }

  function buildGp(f) {
    if (f.grade) return `&grade_level=${encodeURIComponent(f.grade)}`;
    if (f.level) return `&school_level=${f.level}`;
    return "";
  }

  function parseGp(f) {
    if (f.grade) return { grade_level: f.grade };
    if (f.level) return { school_level: f.level };
    return {};
  }

  async function fetchStudentStats() {
    const gpParams = parseGp(studentsFilters);
    const [data, active] = await Promise.all([
      _getStudents({ page_size: 1, ...gpParams }),
      _getStudents({ status: "active", page_size: 1, ...gpParams }),
    ]);
    setTotalStudents(data.count ?? 0);
    setActiveStudents(active.count ?? 0);
  }

  async function fetchEnrollmentStats() {
    const sy = enrolledFilters.year ?? schoolYear;
    const data = await _getEnrollments({ enrollment_status: "enrolled", school_year: sy, page_size: 1, ...parseGp(enrolledFilters) });
    setEnrolledCount(data.count ?? 0);
  }

  async function fetchPendingStats() {
    const sy = pendingFilters.year ?? schoolYear;
    const data = await _getEnrollments({ enrollment_status: "pending", school_year: sy, page_size: 1, ...parseGp(pendingFilters) });
    setPendingCount(data.count ?? 0);
  }

  async function fetchRecentEnrollments() {
    const data = await _getEnrollments({ school_year: schoolYear, page_size: 10, ordering: "-enrollment_id" });
    setRecentEnrollments((data.results ?? []).slice(0, 5));
  }

  async function fetchLevelBreakdown() {
    const levels = ["nursery","kindergarten","elementary","junior_highschool","senior_highschool"];
    const counts = await Promise.all(
      levels.map((lv) =>
        _getEnrollments({ school_level: lv, school_year: schoolYear, enrollment_status: "enrolled", page_size: 1 })
          .then((d) => ({ school_level: lv, count: d.count ?? 0 }))
          .catch(() => ({ school_level: lv, count: 0 }))
      )
    );
    setLevelBreakdown(counts.filter((c) => c.count > 0));
  }

  async function fetchRecentStudents() {
    const data = await _getStudents({ page_size: 5, ordering: "-student_id" });
    setRecentStudents((data.results ?? []).slice(0, 5));
  }

  async function fetchScholarships() {
    const sy = scholarshipFilters.year ?? schoolYear;
    const data = await _getEnrollmentScholarships({ page_size: 100, school_year: sy, ...parseGp(scholarshipFilters) });
    const results = Array.isArray(data) ? data : data.results ?? [];
    setScholarships(results);
    setScholarshipCount(results.length);
  }

  async function fetchSubjectCount() {
    const data = await _getSubjects({ page_size: 1 });
    setSubjectCount(data.count ?? 0);
  }

  async function fetchAlerts() {
    const newAlerts = [];
    try {
      const [unpaidData, pendingEnrData] = await Promise.all([
        _getInvoices({ status: "unpaid", page_size: 1 }).catch(() => null),
        _getEnrollments({ enrollment_status: "pending", school_year: currentSchoolYear(), page_size: 1 }).catch(() => null),
      ]);
      if (unpaidData?.count > 0) {
        newAlerts.push({ id: "unpaid", icon: "ti-receipt-off", color: "#a32d2d", bg: "#fde8e8", message: `${unpaidData.count} unpaid invoice${unpaidData.count !== 1 ? "s" : ""}`, link: "/invoices" });
      }
      if (pendingEnrData?.count > 0) {
        newAlerts.push({ id: "pending_enr", icon: "ti-clock", color: "#854f0b", bg: "#faeeda", message: `${pendingEnrData.count} enrollment${pendingEnrData.count !== 1 ? "s" : ""} pending approval`, link: "/enrollments" });
      }
    } catch { /* alerts are non-critical */ }
    setAlerts(newAlerts);
  }

  // ── derived ──
  const maxLevel = Math.max(...levelBreakdown.map((l) => l.count), 1);
  const enrollmentRate = totalStudents > 0 ? Math.round((enrolledCount / totalStudents) * 100) : 0;

  const scholarshipsByType = scholarships.reduce((acc, s) => {
    const name = s.scholarship_type_detail?.scholarship_name ?? "Unknown";
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
  const topScholarships = Object.entries(scholarshipsByType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  // ── filter option lists ──
  const yearOpts  = SCHOOL_YEARS.map((y) => ({ value: y, label: y }));
  const levelOpts = Object.entries(LEVEL_LABELS).map(([v, l]) => ({ value: v, label: l }));
  function gradeOpts(f) {
    return (LEVEL_GRADES[f.level] ?? []).map((g) => ({ value: g, label: g }));
  }

  return (
    <AppLayout>

          {/* Topbar */}
          <div style={s.topbar}>
            <div>
              <div style={s.topbarTitle}>Dashboard</div>
              <div style={s.topbarSub}>S.Y. {schoolYear} · {now.toLocaleDateString("en-PH", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                {now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
              <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>
                {now.toLocaleTimeString("en-PH", { timeZoneName: "short" }).split(" ").pop()}
              </div>
            </div>
          </div>

          {/* Content */}
          <div style={s.content}>

            {/* Error banner */}
            {error && (
              <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"10px 16px", fontSize:13, color:"#b91c1c", display:"flex", alignItems:"center", gap:8 }}>
                <i className="ti ti-alert-circle" style={{ fontSize:14 }} />{error}
              </div>
            )}

            {/* ── Alert cards ── */}
            {alerts.length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                {alerts.map((al) => (
                  <div key={al.id}
                    onClick={() => navigate(al.link)}
                    style={{ display:"flex", alignItems:"center", gap:10, background:al.bg, border:`1px solid ${al.color}33`, borderRadius:10, padding:"9px 16px", cursor:"pointer", fontSize:13, fontWeight:600, color:al.color, flex:"1 1 220px", minWidth:200 }}>
                    <i className={`ti ${al.icon}`} style={{ fontSize:16 }} />
                    {al.message}
                    <i className="ti ti-arrow-right" style={{ fontSize:12, marginLeft:"auto" }} />
                  </div>
                ))}
              </div>
            )}

            {/* ── Stat cards ── */}
            <div style={s.statGrid}>
              <StatCard
                label="Total Students"
                icon="ti-users"
                value={totalStudents.toLocaleString()}
                chipText={`${activeStudents.toLocaleString()} active`}
                chipType="up"
                loading={loading}
                filters={[
                  { key: "level", options: levelOpts, placeholder: "All Levels" },
                  ...(studentsFilters.level ? [{ key: "grade", options: gradeOpts(studentsFilters), placeholder: "All Grades" }] : []),
                ]}
                filterValues={studentsFilters}
                onFilterChange={updateFilter(setStudentsFilters)}
              />
              <StatCard
                label="Enrolled this S.Y."
                icon="ti-calendar-event"
                value={enrolledCount.toLocaleString()}
                chipText={`S.Y. ${enrolledFilters.year ?? schoolYear}`}
                chipType="neutral"
                loading={loading}
                filters={[
                  { key: "year",  options: yearOpts,  placeholder: "S.Y." },
                  { key: "level", options: levelOpts, placeholder: "All Levels" },
                  ...(enrolledFilters.level ? [{ key: "grade", options: gradeOpts(enrolledFilters), placeholder: "All Grades" }] : []),
                ]}
                filterValues={enrolledFilters}
                onFilterChange={updateFilter(setEnrolledFilters)}
              />
              <StatCard
                label="Pending Enrollment"
                icon="ti-clipboard-list"
                value={pendingCount.toLocaleString()}
                chipText={pendingCount > 0 ? "needs action" : "all clear"}
                chipType={pendingCount > 0 ? "down" : "up"}
                loading={loading}
                filters={[
                  { key: "year",  options: yearOpts,  placeholder: "S.Y." },
                  { key: "level", options: levelOpts, placeholder: "All Levels" },
                  ...(pendingFilters.level ? [{ key: "grade", options: gradeOpts(pendingFilters), placeholder: "All Grades" }] : []),
                ]}
                filterValues={pendingFilters}
                onFilterChange={updateFilter(setPendingFilters)}
              />
              <StatCard
                label="Scholarships Awarded"
                icon="ti-award"
                value={scholarshipCount.toLocaleString()}
                chipText={`S.Y. ${scholarshipFilters.year ?? schoolYear}`}
                chipType="info"
                loading={loading}
                filters={[
                  { key: "year",  options: yearOpts,  placeholder: "S.Y." },
                  { key: "level", options: levelOpts, placeholder: "All Levels" },
                  ...(scholarshipFilters.level ? [{ key: "grade", options: gradeOpts(scholarshipFilters), placeholder: "All Grades" }] : []),
                ]}
                filterValues={scholarshipFilters}
                onFilterChange={updateFilter(setScholarshipFilters)}
              />
            </div>

            {/* ── Recent enrollments + Level breakdown ── */}
            <div style={s.twoCol}>

              <Panel title="Recent Enrollments" action="View all →" onAction={() => navigate("/enrollments")}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {["Student","Level / Grade","Section","Status"].map((h) => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 10 }).map((_, i) => (
                          <tr key={i}>
                            {[130,90,70,60].map((w, j) => (
                              <td key={j} style={s.td}><Sk w={w} h={13} /></td>
                            ))}
                          </tr>
                        ))
                      : recentEnrollments.length === 0
                        ? <tr><td colSpan={4} style={{ ...s.td, textAlign:"center", color:"#b09090", fontStyle:"italic" }}>No enrollments for this school year yet</td></tr>
                        : recentEnrollments.map((en, idx) => {
                            const pill = pillStyle(en.enrollment_status);
                            const name = en.student_name ?? `Student #${en.student}`;
                            return (
                              <tr key={en.enrollment_id} className="enroll-row"
                                style={{ animation:`rowIn 0.18s ease both`, animationDelay:`${idx*30}ms` }}
                                onClick={() => navigate(`/enrollments`)}>
                                <td style={{ ...s.td, fontWeight:600 }}>{name}</td>
                                <td style={s.td}>
                                  <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
                                    <i className={`ti ${LEVEL_ICONS[en.school_level] ?? "ti-school"}`}
                                      style={{ fontSize:12, color: LEVEL_COLORS[en.school_level]?.color ?? "#9a7070" }} />
                                    {LEVEL_LABELS[en.school_level] ?? en.school_level} · {en.grade_level}
                                  </span>
                                </td>
                                <td style={s.td}>{en.section}</td>
                                <td style={s.td}>
                                  <span style={{ ...s.pill, background:pill.bg, color:pill.color }}>
                                    {en.enrollment_status.charAt(0).toUpperCase() + en.enrollment_status.slice(1)}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                    }
                  </tbody>
                </table>
              </Panel>

              <Panel title="Students by Level" action="View →" onAction={() => navigate("/enrollments")}>
                <div>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} style={s.levelRow}>
                          <Sk w={28} h={28} r={8} />
                          <Sk w={90} h={13} />
                          <div style={{ flex:1 }} />
                          <Sk w={30} h={13} />
                        </div>
                      ))
                    : levelBreakdown.length === 0
                      ? <div style={{ padding:"24px 18px", textAlign:"center", color:"#b09090", fontSize:13, fontStyle:"italic" }}>No enrollment data yet</div>
                      : levelBreakdown.map((lv) => {
                          const lc = LEVEL_COLORS[lv.school_level] ?? { color:"#9a7070", bg:"#f0ede8" };
                          return (
                            <div key={lv.school_level} style={s.levelRow}>
                              <div style={{ ...s.levelIcon, background:lc.bg }}>
                                <i className={`ti ${LEVEL_ICONS[lv.school_level] ?? "ti-school"}`} style={{ fontSize:14, color:lc.color }} />
                              </div>
                              <span style={s.levelName}>{LEVEL_LABELS[lv.school_level] ?? lv.school_level}</span>
                              <div style={s.barWrap}>
                                <div style={{ ...s.bar, width:`${Math.round((lv.count / maxLevel) * 100)}%`, background:lc.color }} />
                              </div>
                              <span style={{ ...s.levelCount, color:lc.color }}>{lv.count.toLocaleString()}</span>
                            </div>
                          );
                        })
                  }
                  {!loading && levelBreakdown.length > 0 && (
                    <div style={{ padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:12, color:"#b09090" }}>Total enrolled</span>
                      <span style={{ fontSize:14, fontWeight:700, color:"#e03131" }}>{enrolledCount.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </Panel>
            </div>

            {/* ── Quick actions + Recent students + Scholarships ── */}
            <div style={s.threeCol}>

              <Panel title="Quick Actions">
                <div style={s.qaGrid}>
                  {[
                    { label: "New Student",    icon: "ti-user-plus",      path: "/students/new"    },
                    { label: "New Enrollment", icon: "ti-clipboard-list", path: "/enrollments/new" },
                    { label: "Enter Grades",   icon: "ti-pencil",         path: "/grades/entry"    },
                    { label: "Scholarships",   icon: "ti-award",          path: "/scholarships"    },
                    { label: "Invoices",       icon: "ti-receipt",        path: "/invoices"        },
                    { label: "Payments",       icon: "ti-cash",           path: "/payments"        },
                    { label: "Requirements",   icon: "ti-file-check",     path: "/requirements"   },
                    { label: "Analytics",      icon: "ti-chart-dots-3",   path: "/analytics"       },
                    { label: "Subjects",       icon: "ti-book",           path: "/subjects"        },
                  ].map((qa) => (
                    <button key={qa.label} className="qa-btn" style={s.qaBtn} onClick={() => navigate(qa.path)}>
                      <i className={`ti ${qa.icon}`} style={{ fontSize:16, color:"#e03131" }} />
                      {qa.label}
                    </button>
                  ))}
                </div>
              </Panel>

              <Panel title="Recently Added Students" action="View all →" onAction={() => navigate("/students")}>
                <div>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 18px", borderBottom:"1px solid #f9f0f0" }}>
                          <Sk w={32} h={32} r={99} />
                          <div style={{ flex:1 }}>
                            <Sk w={110} h={13} />
                            <div style={{ marginTop:5 }}><Sk w={70} h={11} /></div>
                          </div>
                        </div>
                      ))
                    : recentStudents.length === 0
                      ? <div style={{ padding:"24px 18px", textAlign:"center", color:"#b09090", fontSize:13, fontStyle:"italic" }}>No students yet</div>
                      : recentStudents.map((st, idx) => {
                          const initials = `${st.first_name?.[0]??""}${st.last_name?.[0]??""}`.toUpperCase();
                          const pal = [
                            { bg:"#fde8e8", color:"#c0392b" },{ bg:"#e8f0fd", color:"#2563eb" },
                            { bg:"#e8fdf0", color:"#16a34a" },{ bg:"#fdf5e8", color:"#d97706" },
                            { bg:"#f0e8fd", color:"#7c3aed" },
                          ][st.student_id % 5];
                          return (
                            <div key={st.student_id}
                              style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 18px", borderBottom:"1px solid #f9f0f0", cursor:"pointer", transition:"background 0.12s", animation:`rowIn 0.18s ease both`, animationDelay:`${idx*30}ms` }}
                              onClick={() => navigate(`/students/${st.student_id}`)}
                              onMouseEnter={(e) => e.currentTarget.style.background="#fff8f6"}
                              onMouseLeave={(e) => e.currentTarget.style.background="transparent"}>
                              <div style={{ width:32, height:32, borderRadius:"50%", background:pal.bg, color:pal.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>
                                {initials}
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                  {st.last_name}, {st.first_name}
                                </div>
                                <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>
                                  LRN {st.lrn} ·
                                  <span style={{ marginLeft:4, fontSize:10.5, fontWeight:600, padding:"1px 6px", borderRadius:99, background: st.status==="active" ? "#e8f5e0" : "#f0ede8", color: st.status==="active" ? "#2e6b0d" : "#5c5752" }}>
                                    {st.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                  }
                </div>
              </Panel>

              <Panel title="Scholarships Awarded" action="View all →" onAction={() => navigate("/scholarships")}>
                <div>
                  {loading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} style={s.levelRow}>
                          <Sk w={28} h={28} r={8} />
                          <Sk w={110} h={13} />
                          <Sk w={30} h={13} />
                        </div>
                      ))
                    : scholarships.length === 0
                      ? (
                        <div style={{ padding:"24px 18px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                          <i className="ti ti-award-off" style={{ fontSize:22, color:"#e08080" }} />
                          <div style={{ fontSize:13, color:"#b09090", fontStyle:"italic" }}>No scholarships awarded yet</div>
                          <button onClick={() => navigate("/scholarships")}
                            style={{ fontSize:12, color:"#e03131", background:"#fff0f0", border:"none", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
                            Award now
                          </button>
                        </div>
                      )
                      : (
                        <>
                          {topScholarships.map(([name, count], i) => (
                            <div key={name} style={s.levelRow}>
                              <div style={{ ...s.levelIcon, background:"#e3f0fd" }}>
                                <i className="ti ti-award" style={{ fontSize:13, color:"#1455a0" }} />
                              </div>
                              <span style={{ ...s.levelName, fontSize:12 }}>{name}</span>
                              <span style={{ fontSize:13, fontWeight:700, color:"#1455a0", background:"#e3f0fd", padding:"2px 8px", borderRadius:6 }}>{count}</span>
                            </div>
                          ))}
                          <div style={{ padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", borderTop:"1px solid #f5eaea" }}>
                            <span style={{ fontSize:12, color:"#b09090" }}>Total awarded</span>
                            <span style={{ fontSize:14, fontWeight:700, color:"#1455a0" }}>{scholarshipCount}</span>
                          </div>
                        </>
                      )
                  }
                </div>
              </Panel>
            </div>

          </div>
    </AppLayout>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  shell:       { display:"flex", height:"100vh", background:"#fdf8f6", fontFamily:"'DM Sans',sans-serif", overflow:"hidden" },
  main:        { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  topbar:      { background:"white", borderBottom:"1px solid #f5eaea", padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" },
  topbarTitle: { fontSize:15, fontWeight:700, color:"#1a0a0a", letterSpacing:"-0.01em" },
  topbarSub:   { fontSize:11.5, color:"#b09090", marginTop:1 },
  iconBtn:     { width:36, height:36, border:"1px solid #f5eaea", borderRadius:10, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070", position:"relative" },
  badgeDot:    { width:8, height:8, background:"#e03131", borderRadius:"50%", position:"absolute", top:6, right:6, border:"2px solid white" },
  content:     { flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:18 },

  statGrid:    { display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:12 },
  statCard:    { background:"white", border:"1px solid #f5eaea", borderRadius:14, padding:16, display:"flex", flexDirection:"column", gap:10, boxShadow:"0 2px 12px rgba(224,49,49,0.06)" },
  statTop:     { display:"flex", alignItems:"center", justifyContent:"space-between" },
  statLabel:   { fontSize:12, color:"#a07878", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.06em" },
  statIcon:    { width:30, height:30, borderRadius:8, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" },
  statValue:   { fontSize:26, fontWeight:700, color:"#1a0a0a", lineHeight:1 },
  statFooter:  { display:"flex", alignItems:"center", gap:5, fontSize:12, color:"#a07070" },
  chip:        { fontSize:11, padding:"2px 7px", borderRadius:99, fontWeight:500 },

  twoCol:      { display:"grid", gridTemplateColumns:"minmax(0,1.5fr) minmax(0,1fr)", gap:12 },
  threeCol:    { display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:12 },

  panel:       { background:"white", border:"1px solid #f5eaea", borderRadius:16, display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" },
  panelHeader: { padding:"14px 18px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between" },
  panelTitle:  { fontSize:13, fontWeight:700, color:"#1a0a0a" },
  panelAction: { fontSize:12, color:"#e03131", cursor:"pointer", border:"none", background:"none", fontFamily:"'DM Sans',sans-serif", fontWeight:600 },

  table:       { width:"100%", borderCollapse:"collapse", fontSize:13 },
  th:          { textAlign:"left", fontSize:10.5, fontWeight:600, color:"#c0a0a0", padding:"13px 18px", borderBottom:"1px solid #f5eaea", textTransform:"uppercase", letterSpacing:"0.07em" },
  td:          { padding:"10px 18px", borderBottom:"1px solid #f9f0f0", color:"#1a0a0a", verticalAlign:"middle" },
  pill:        { display:"inline-block", fontSize:11, padding:"4px 10px", borderRadius:99, fontWeight:600 },

  levelRow:    { display:"flex", alignItems:"center", gap:12, padding:"11px 18px", borderBottom:"1px solid #f9f0f0" },
  levelIcon:   { width:28, height:28, borderRadius:8, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  levelName:   { fontSize:13, color:"#1a0a0a", flex:1 },
  levelCount:  { fontSize:13, fontWeight:600, color:"#1a0a0a" },
  barWrap:     { width:60, height:4, background:"#f0e8e8", borderRadius:99, overflow:"hidden" },
  bar:         { height:"100%", borderRadius:99, background:"#e03131" },

  qaGrid:      { display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:8, padding:14 },
  qaBtn:       { display:"flex", alignItems:"center", gap:8, padding:"10px 12px", border:"1px solid #f5eaea", borderRadius:8, background:"#fff8f6", cursor:"pointer", fontSize:13, color:"#1a0a0a", fontFamily:"'DM Sans',sans-serif", transition:"background 0.1s" },
};
