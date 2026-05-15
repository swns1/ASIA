import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { canViewAuditTrail, clearAuthSession, getCurrentUser } from "../utils/auth";
import AIInsightPanel, { callGemini } from "../components/AIInsightPanel";
import logo from "../assets/logo.png";
import logoutIcon from "../assets/logout.svg";

// ── API ───────────────────────────────────────────────────────────────────────
const ENROLLMENT_API = "http://localhost:8003/api";

function getToken() { return sessionStorage.getItem("access_token") || ""; }

async function apiFetch(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) { const e = await res.text(); throw new Error(`${res.status}: ${e}`); }
  return res.json();
}

// ── NAV ───────────────────────────────────────────────────────────────────────
const NAV = [
  {
    section: "Main",
    items: [
      { label: "Dashboard",    icon: "ti-layout-dashboard", path: "/dashboard"    },
      { label: "Students",     icon: "ti-users",             path: "/students"     },
      { label: "Enrollments",  icon: "ti-clipboard-list",    path: "/enrollments"  },
      { label: "Subjects",     icon: "ti-book",              path: "/subjects"     },
      { label: "Grades",       icon: "ti-chart-bar",         path: "/grades"       },
      { label: "Requirements", icon: "ti-file-check",        path: "/requirements" },
      { label: "Analytics",    icon: "ti-chart-dots-3",      path: "/analytics"    },
    ],
  },
  {
    section: "Finance",
    items: [
      { label: "Invoices",     icon: "ti-receipt",  path: "/invoices"     },
      { label: "Payments",     icon: "ti-cash",     path: "/payments"     },
      { label: "Scholarships", icon: "ti-discount", path: "/scholarships" },
    ],
  },
  {
    section: "Settings",
    items: [
      { label: "Users",             icon: "ti-user-cog",         path: "/users"             },
      { label: "Audit Trail",       icon: "ti-shield-check",     path: "/audit-trail", adminOnly: true },
      { label: "School Settings",   icon: "ti-settings",         path: "/settings"          },
      { label: "Grading Templates", icon: "ti-report-analytics", path: "/grading-templates" },
      { label: "Scholarship Types", icon: "ti-discount",         path: "/scholarship-types" },
      { label: "Fee Schedules",     icon: "ti-cash",             path: "/fee-schedules"     },
    ],
  },
];

// ── Constants ─────────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { value: "overall",      label: "Overall (All Periods)" },
  { value: "1st_quarter",  label: "1st Quarter"           },
  { value: "2nd_quarter",  label: "2nd Quarter"           },
  { value: "3rd_quarter",  label: "3rd Quarter"           },
  { value: "4th_quarter",  label: "4th Quarter"           },
  { value: "1st_semester", label: "1st Semester"          },
  { value: "2nd_semester", label: "2nd Semester"          },
];

const GRADE_LEVEL_OPTIONS = [
  { value: "",         label: "All Grade Levels" },
  { value: "Nursery",  label: "Nursery"      },
  { value: "Kinder",   label: "Kindergarten" },
  { value: "Grade 1",  label: "Grade 1"      },
  { value: "Grade 2",  label: "Grade 2"      },
  { value: "Grade 3",  label: "Grade 3"      },
  { value: "Grade 4",  label: "Grade 4"      },
  { value: "Grade 5",  label: "Grade 5"      },
  { value: "Grade 6",  label: "Grade 6"      },
  { value: "Grade 7",  label: "Grade 7"      },
  { value: "Grade 8",  label: "Grade 8"      },
  { value: "Grade 9",  label: "Grade 9"      },
  { value: "Grade 10", label: "Grade 10"     },
  { value: "Grade 11", label: "Grade 11"     },
  { value: "Grade 12", label: "Grade 12"     },
];

function currentSchoolYear() {
  const now = new Date();
  const yr  = now.getFullYear();
  return now.getMonth() >= 5 ? `${yr}-${yr + 1}` : `${yr - 1}-${yr}`;
}

// ── LogoutModal ───────────────────────────────────────────────────────────────
function LogoutModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "white", borderRadius: 20, padding: "32px 36px", width: 380, boxShadow: "0 24px 64px rgba(224,49,49,0.18)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, animation: "slideUp 0.2s ease" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className="ti ti-logout" style={{ fontSize: 24, color: "#e03131" }} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1a0a0a" }}>Log out?</div>
        <div style={{ fontSize: 13, color: "#7a5050", textAlign: "center", lineHeight: 1.7 }}>
          You'll be returned to the login page. Any unsaved changes will be lost.
        </div>
        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
          <button onClick={onCancel} style={{ flex: 1, height: 42, border: "1.5px solid #f0e0e0", borderRadius: 10, background: "white", fontSize: 13, color: "#7a5050", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
            Stay
          </button>
          <button onClick={onConfirm} style={{ flex: 1, height: 42, border: "none", borderRadius: 10, background: "linear-gradient(135deg,#e03131,#c92a2a)", fontSize: 13, color: "white", cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.3)" }}>
            Yes, logout
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Panel — mirrors DashboardPage exactly (no inner padding wrapper) ───────────
// Children are responsible for their own padding/layout, just like in Dashboard.
function Panel({ title, subtitle, action, onAction, children }) {
  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <div>
          <span style={s.panelTitle}>{title}</span>
          {subtitle && (
            <span style={{ fontSize: 12, color: "#a07878", fontWeight: 400, marginLeft: 8 }}>
              {subtitle}
            </span>
          )}
        </div>
        {action && (
          <button style={s.panelAction} onClick={onAction}>{action}</button>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Scatter Plot ──────────────────────────────────────────────────────────────
function ScatterPlot({ clusters, selectedStudent, onSelectStudent }) {
  if (!clusters || clusters.length === 0) return null;

  const allPoints = clusters.flatMap((c) =>
    c.students.map((st) => ({ ...st, color: c.color, clusterLabel: c.label }))
  );

  const W = 700, H = 420, PAD = 50;
  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const scaleX = (v) => PAD + ((v - xMin) / xRange) * (W - 2 * PAD);
  const scaleY = (v) => H - PAD - ((v - yMin) / yRange) * (H - 2 * PAD);

  const [hovered, setHovered] = useState(null);

  return (
    // No border here — the Panel card is the container
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxHeight: 420, background: "#fff8f6", display: "block" }}>
      {[0.25, 0.5, 0.75].map((frac) => (
        <g key={frac}>
          <line x1={PAD} x2={W - PAD} y1={scaleY(yMin + frac * yRange)} y2={scaleY(yMin + frac * yRange)} stroke="#f5eaea" strokeDasharray="4,4" />
          <line y1={PAD} y2={H - PAD} x1={scaleX(xMin + frac * xRange)} x2={scaleX(xMin + frac * xRange)} stroke="#f5eaea" strokeDasharray="4,4" />
        </g>
      ))}
      <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="#e8d8d8" />
      <line x1={PAD} x2={PAD} y1={PAD} y2={H - PAD} stroke="#e8d8d8" />
      <text x={W / 2} y={H - 10} textAnchor="middle" fontSize="11" fill="#a07878" fontFamily="DM Sans">PCA Component 1</text>
      <text x={14} y={H / 2} textAnchor="middle" fontSize="11" fill="#a07878" fontFamily="DM Sans" transform={`rotate(-90, 14, ${H / 2})`}>PCA Component 2</text>

      {allPoints.map((pt) => {
        const cx = scaleX(pt.x);
        const cy = scaleY(pt.y);
        const isSelected = selectedStudent?.student_id === pt.student_id;
        const isHov      = hovered?.student_id === pt.student_id;
        const r          = isSelected ? 8 : isHov ? 7 : 5;
        return (
          <g key={pt.student_id}>
            <circle
              cx={cx} cy={cy} r={r}
              fill={pt.color}
              fillOpacity={isSelected ? 1 : 0.75}
              stroke={isSelected ? "#1a0a0a" : isHov ? "#fff" : "none"}
              strokeWidth={isSelected ? 2.5 : 1.5}
              style={{ cursor: "pointer", transition: "r 0.15s, stroke 0.15s" }}
              onMouseEnter={() => setHovered(pt)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelectStudent(pt)}
            />
          </g>
        );
      })}

      {hovered && (() => {
        const tx = scaleX(hovered.x);
        const ty = scaleY(hovered.y);
        const tipW = 185, tipH = 52;
        const flipX = tx + tipW + 10 > W - PAD;
        const flipY = ty - tipH - 10 < PAD;
        const rx = flipX ? tx - tipW - 10 : tx + 12;
        const ry = flipY ? ty + 12 : ty - tipH - 8;
        return (
          <g>
            <rect x={rx} y={ry} width={tipW} height={tipH} rx={8} fill="white" stroke="#f5eaea" strokeWidth={1} filter="drop-shadow(0 2px 6px rgba(224,49,49,0.08))" />
            <text x={rx + 10} y={ry + 18} fontSize="12" fontWeight="700" fill="#1a0a0a" fontFamily="DM Sans">{hovered.student_name}</text>
            <text x={rx + 10} y={ry + 33} fontSize="11" fill="#b09090" fontFamily="DM Sans">{hovered.student_number}</text>
            <text x={rx + 10} y={ry + 46} fontSize="11" fontWeight="600" fill={hovered.color} fontFamily="DM Sans">Grade: {hovered.grade} · {hovered.clusterLabel}</text>
          </g>
        );
      })()}
    </svg>
  );
}

// ── Cluster Legend ────────────────────────────────────────────────────────────
function ClusterLegend({ clusters }) {
  if (!clusters) return null;
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "14px 18px" }}>
      {clusters.map((c) => (
        <div key={c.cluster_id} style={{
          flex: "1 1 180px", padding: "14px 16px", borderRadius: 12,
          border: `2px solid ${c.color}28`, background: `${c.color}0a`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.color }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>{c.label}</span>
          </div>
          <div style={{ fontSize: 12, color: "#7a5a5a", lineHeight: 1.7 }}>
            <span style={{ fontWeight: 600 }}>{c.student_count}</span> student{c.student_count !== 1 ? "s" : ""}
            <span style={{ margin: "0 6px", color: "#d8c0c0" }}>·</span>
            Avg <span style={{ fontWeight: 600 }}>{c.avg_grade}</span>
            <span style={{ margin: "0 6px", color: "#d8c0c0" }}>·</span>
            Range {c.min_grade}–{c.max_grade}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Student Detail Panel ──────────────────────────────────────────────────────
function StudentDetailPanel({ student, onClose }) {
  if (!student) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 18px", borderTop: "1px solid #f5eaea",
      background: "#fff8f6",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: `${student.color || "#e03131"}18`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <i className="ti ti-user" style={{ fontSize: 17, color: student.color || "#e03131" }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>{student.student_name}</div>
          <div style={{ fontSize: 12, color: "#b09090", marginTop: 1 }}>
            {student.student_number} · Grade: <strong style={{ color: "#1a0a0a" }}>{student.grade}</strong> · {student.clusterLabel}
          </div>
        </div>
      </div>
      <button onClick={onClose} style={{
        background: "none", border: "1px solid #f5eaea", borderRadius: 8,
        padding: "5px 12px", fontSize: 12, color: "#a07878", cursor: "pointer",
        fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
      }}>
        Close
      </button>
    </div>
  );
}

// ── Student Table ─────────────────────────────────────────────────────────────
// Rendered flush inside Panel — no outer border/borderRadius (Panel provides that)
function StudentTable({ clusters, selectedStudent, onSelectStudent }) {
  if (!clusters) return null;

  const allStudents = clusters.flatMap((c) =>
    c.students.map((st) => ({ ...st, color: c.color, clusterLabel: c.label }))
  ).sort((a, b) => a.grade - b.grade);

  return (
    <div style={{ maxHeight: 360, overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#fff8f6" }}>
            <th style={thStyle}>Student</th>
            <th style={thStyle}>Number</th>
            <th style={thStyle}>Grade</th>
            <th style={thStyle}>Cluster</th>
          </tr>
        </thead>
        <tbody>
          {allStudents.map((st) => {
            const isSelected = selectedStudent?.student_id === st.student_id;
            return (
              <tr
                key={st.student_id}
                onClick={() => onSelectStudent(st)}
                style={{
                  borderBottom: "1px solid #f9f0f0",
                  cursor: "pointer",
                  background: isSelected ? `${st.color}10` : "white",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#fff8f6"; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isSelected ? `${st.color}10` : "white"; }}
              >
                <td style={tdStyle}>{st.student_name}</td>
                <td style={tdStyle}>{st.student_number}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: "#1a0a0a" }}>{st.grade}</td>
                <td style={tdStyle}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: `${st.color}14`, color: st.color,
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.color }} />
                    {st.clusterLabel}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = {
  padding: "10px 18px", textAlign: "left", fontSize: 10.5,
  fontWeight: 600, color: "#c0a0a0", textTransform: "uppercase",
  letterSpacing: "0.07em", borderBottom: "1px solid #f5eaea",
  position: "sticky", top: 0, background: "#fff8f6", zIndex: 1,
};
const tdStyle = { padding: "10px 18px", color: "#1a0a0a", verticalAlign: "middle" };

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function AnalyticsPage() {
  const navigate          = useNavigate();
  const schoolYearDefault = currentSchoolYear();
  const currentUser       = getCurrentUser();
  const navGroups         = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || canViewAuditTrail(currentUser)),
  }));

  // ── state ──
  const [schoolYear,      setSchoolYear]      = useState(schoolYearDefault);
  const [gradingPeriod,   setGradingPeriod]   = useState("1st_quarter");
  const [subjectId,       setSubjectId]       = useState("");
  const [gradeLevel,      setGradeLevel]      = useState("");
  const [nClusters,       setNClusters]       = useState(3);
  const [subjects,        setSubjects]        = useState([]);
  const [result,          setResult]          = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showLogout,      setShowLogout]      = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    apiFetch(`${ENROLLMENT_API}/subjects/`).then((data) => {
      const list = Array.isArray(data) ? data : data.results || [];
      setSubjects(list);
    }).catch(() => {});
  }, []);

  const runClustering = useCallback(async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setSelectedStudent(null);

    const params = new URLSearchParams({
      school_year:    schoolYear,
      grading_period: gradingPeriod,
      n_clusters:     String(nClusters),
    });
    if (subjectId)  params.set("subject_id",  subjectId);
    if (gradeLevel) params.set("grade_level", gradeLevel);

    try {
      const data = await apiFetch(`${ENROLLMENT_API}/ai/cluster/?${params}`);
      setResult(data);
    } catch (e) {
      const msg = e.message || "Clustering failed.";
      try {
        const parsed = JSON.parse(msg.split(": ").slice(1).join(": "));
        setError(parsed.error || msg);
      } catch { setError(msg); }
    } finally {
      setLoading(false);
    }
  }, [schoolYear, gradingPeriod, subjectId, gradeLevel, nClusters]);

  function buildOnFetch(currentResult) {
    return () => {
      const clusterSummary = currentResult.clusters.map((c) =>
        `${c.label}: ${c.student_count} students, avg=${c.avg_grade}, range=[${c.min_grade}-${c.max_grade}]`
      ).join("\n");
      return callGemini("dashboard_insights", {
        analysis_type:   "student_performance_clustering",
        school_year:     currentResult.meta.school_year,
        grading_period:  currentResult.meta.grading_period,
        grade_level:     currentResult.meta.grade_level,
        subject:         currentResult.meta.subject,
        total_students:  currentResult.meta.total_students,
        n_clusters:      currentResult.meta.n_clusters,
        cluster_summary: clusterSummary,
      });
    };
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.45} }
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }
        .nav-item { transition:background 0.12s,color 0.12s; }
        .nav-item:hover { background:#fff4f4 !important; color:#e03131 !important; }
        .nav-active { background:#fff0f0 !important; color:#e03131 !important; font-weight:600 !important; }
        .filter-select:focus { outline:none; border-color:#fca5a5; box-shadow:0 0 0 3px rgba(224,49,49,0.08); }
      `}</style>

      <div style={s.shell}>

        {/* ── Sidebar ── */}
        <aside style={{ width: 224, flexShrink: 0, background: "white", borderRight: "1px solid #f5eaea", display: "flex", flexDirection: "column", boxShadow: "2px 0 12px rgba(224,49,49,0.04)" }}>

          {/* Logo */}
          <div style={{ padding: "22px 18px 18px", borderBottom: "1px solid #f5eaea" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logo} alt="Logo" style={{ width: 20, height: 30 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>South Lakes IS</div>
                <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>Admin Portal</div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
            {navGroups.map((group) => (
              <div key={group.section} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9.5, color: "#cdb0b0", letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 10px 4px", fontWeight: 600 }}>
                  {group.section}
                </div>
                {group.items.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <div
                      key={item.path}
                      className={`nav-item${active ? " nav-active" : ""}`}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 9, fontSize: 13, color: active ? "#e03131" : "#7a5a5a", cursor: "pointer" }}
                      onClick={() => navigate(item.path)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && navigate(item.path)}
                    >
                      <i className={`ti ${item.icon}`} style={{ fontSize: 16, width: 20, textAlign: "center" }} />
                      {item.label}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* User + Logout */}
          <div style={{ padding: "14px 10px", borderTop: "1px solid #f5eaea" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px", borderRadius: 10, background: "#fff8f6" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#fde8e8,#fca5a5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#e03131", flexShrink: 0 }}>
                {(currentUser?.name || "SA").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a" }}>{currentUser?.name || "Super Admin"}</div>
                <div style={{ fontSize: 11, color: "#b09090" }}>{currentUser?.role || "super_admin"}</div>
              </div>
              <button
                title="Logout"
                onClick={() => setShowLogout(true)}
                style={{ width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090", transition: "all 0.12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#fff0f0"; e.currentTarget.style.color = "#e03131"; e.currentTarget.style.borderColor = "#fca5a5"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.color = "#c09090"; e.currentTarget.style.borderColor = "#f0e4e4"; }}
              >
                <img src={logoutIcon} alt="Logout" style={{ width: 20, height: 20 }} />
              </button>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div style={s.main}>

          {/* Topbar */}
          <div style={s.topbar}>
            <div>
              <div style={s.topbarTitle}>Analytics</div>
              <div style={s.topbarSub}>
                S.Y. {schoolYearDefault} · K-Means clustering with AI-powered interpretation
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div style={s.content}>

            {/* ── Filters ── */}
            <Panel title="Analysis Filters">
              <div style={{ padding: "16px 18px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>

                <div style={s.filterGroup}>
                  <label style={s.filterLabel}>School Year</label>
                  <input
                    type="text"
                    value={schoolYear}
                    onChange={(e) => setSchoolYear(e.target.value)}
                    placeholder="2024-2025"
                    className="filter-select"
                    style={{ ...s.select, width: 130 }}
                  />
                </div>

                <div style={s.filterGroup}>
                  <label style={s.filterLabel}>Grading Period</label>
                  <select value={gradingPeriod} onChange={(e) => setGradingPeriod(e.target.value)} className="filter-select" style={s.select}>
                    {PERIOD_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div style={s.filterGroup}>
                  <label style={s.filterLabel}>Grade Level</label>
                  <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} className="filter-select" style={{ ...s.select, minWidth: 150 }}>
                    {GRADE_LEVEL_OPTIONS.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </div>

                <div style={s.filterGroup}>
                  <label style={s.filterLabel}>Subject</label>
                  <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="filter-select" style={{ ...s.select, minWidth: 200 }}>
                    <option value="">Overall (All Subjects)</option>
                    {subjects.map((sub) => (
                      <option key={sub.subject_id} value={sub.subject_id}>
                        {sub.subject_code} — {sub.subject_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={s.filterGroup}>
                  <label style={s.filterLabel}>Clusters</label>
                  <select value={nClusters} onChange={(e) => setNClusters(Number(e.target.value))} className="filter-select" style={{ ...s.select, width: 70 }}>
                    {[2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={runClustering}
                  disabled={loading}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    height: 38, padding: "0 20px", borderRadius: 10,
                    background: loading ? "#e8b4b4" : "linear-gradient(135deg,#e03131,#c92a2a)",
                    color: "white", border: "none", fontSize: 13, fontWeight: 700,
                    cursor: loading ? "not-allowed" : "pointer",
                    fontFamily: "'DM Sans',sans-serif",
                    boxShadow: loading ? "none" : "0 4px 14px rgba(224,49,49,0.25)",
                    transition: "all 0.12s", alignSelf: "flex-end",
                  }}
                >
                  {loading ? (
                    <>
                      <i className="ti ti-loader-2" style={{ fontSize: 14, animation: "spin 0.8s linear infinite" }} />
                      Running…
                    </>
                  ) : (
                    <>
                      <i className="ti ti-chart-dots-3" style={{ fontSize: 14 }} />
                      Run Analysis
                    </>
                  )}
                </button>

              </div>
            </Panel>

            {/* Error banner */}
            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#b91c1c", display: "flex", alignItems: "center", gap: 8 }}>
                <i className="ti ti-alert-circle" style={{ fontSize: 16, color: "#e03131" }} />
                <span>{error}</span>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <Panel title="Running Analysis">
                <div style={{ padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#fff0f0,#fde8e8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ti ti-loader-2" style={{ fontSize: 22, color: "#e03131", animation: "spin 0.8s linear infinite" }} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a0a0a" }}>Running K-Means clustering…</div>
                  <div style={{ fontSize: 12, color: "#b09090" }}>Analyzing grades and generating AI interpretation</div>
                </div>
              </Panel>
            )}

            {/* Empty state */}
            {!loading && !result && !error && (
              <Panel title="No Analysis Yet">
                <div style={{ padding: "64px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg,#fff0f0,#fde8e8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ti ti-chart-dots-3" style={{ fontSize: 26, color: "#e8a0a0" }} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a0a0a" }}>No analysis yet</div>
                  <div style={{ fontSize: 13, color: "#b09090", maxWidth: 340, lineHeight: 1.7 }}>
                    Select your filters above and click{" "}
                    <strong style={{ color: "#e03131" }}>Run Analysis</strong>{" "}
                    to cluster students by their academic performance.
                  </div>
                </div>
              </Panel>
            )}

            {/* ── Results ── */}
            {result && (
              <>
                {/* Meta stat cards — same grid as Dashboard */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 12 }}>
                  {[
                    { label: "Students",    value: result.meta.total_students, icon: "ti-users"        },
                    { label: "Grade Level", value: result.meta.grade_level,    icon: "ti-school"       },
                    { label: "Subject",     value: result.meta.subject,        icon: "ti-book"         },
                    { label: "Period",      value: PERIOD_OPTIONS.find((p) => p.value === result.meta.grading_period)?.label || result.meta.grading_period, icon: "ti-calendar" },
                    { label: "Clusters",    value: result.meta.n_clusters,     icon: "ti-chart-dots-3" },
                  ].map((m) => (
                    <div key={m.label} style={s.statCard}>
                      <div style={s.statTop}>
                        <span style={s.statLabel}>{m.label}</span>
                        <div style={s.statIcon}>
                          <i className={`ti ${m.icon}`} style={{ fontSize: 15, color: "#e03131" }} />
                        </div>
                      </div>
                      <div style={{ fontSize: m.label === "Subject" ? 12 : 22, fontWeight: 700, color: "#1a0a0a", lineHeight: 1.2, wordBreak: "break-word" }}>
                        {m.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Cluster Overview */}
                <Panel title="Cluster Overview">
                  <ClusterLegend clusters={result.clusters} />
                </Panel>

                {/* Scatter Plot — SVG rendered flush, detail panel attached below */}
                <Panel title="Student Distribution" subtitle="Click any dot to see student details">
                  <ScatterPlot
                    clusters={result.clusters}
                    selectedStudent={selectedStudent}
                    onSelectStudent={setSelectedStudent}
                  />
                  {selectedStudent && (
                    <StudentDetailPanel
                      student={selectedStudent}
                      onClose={() => setSelectedStudent(null)}
                    />
                  )}
                </Panel>

                {/* Student List — table rendered flush to panel edges */}
                <Panel title="Student List" subtitle="Sorted by grade (lowest first)">
                  <StudentTable
                    clusters={result.clusters}
                    selectedStudent={selectedStudent}
                    onSelectStudent={setSelectedStudent}
                  />
                </Panel>

                {/* AI Interpretation */}
                <AIInsightPanel
                  title="Cluster Interpretation"
                  description="AI analysis of the clustering results — click Analyze to generate"
                  disabled={false}
                  onFetch={buildOnFetch(result)}
                />
              </>
            )}

          </div>
        </div>
      </div>

      {showLogout && (
        <LogoutModal
          onConfirm={() => { clearAuthSession(); navigate("/"); }}
          onCancel={() => setShowLogout(false)}
        />
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  // Shell — matches Dashboard exactly
  shell:       { display: "flex", height: "100vh", background: "#fdf8f6", fontFamily: "'DM Sans',sans-serif", overflow: "hidden" },
  main:        { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topbar:      { background: "white", borderBottom: "1px solid #f5eaea", padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 8px rgba(224,49,49,0.04)" },
  topbarTitle: { fontSize: 15, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.01em" },
  topbarSub:   { fontSize: 11.5, color: "#b09090", marginTop: 1 },
  content:     { flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 },

  // Stat cards — same as Dashboard
  statCard:    { background: "white", border: "1px solid #f5eaea", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 2px 12px rgba(224,49,49,0.06)" },
  statTop:     { display: "flex", alignItems: "center", justifyContent: "space-between" },
  statLabel:   { fontSize: 12, color: "#a07878", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" },
  statIcon:    { width: 30, height: 30, borderRadius: 8, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" },

  // Panel — matches Dashboard Panel exactly (no overflow:hidden so content isn't clipped)
  panel:       { background: "white", border: "1px solid #f5eaea", borderRadius: 16, display: "flex", flexDirection: "column", boxShadow: "0 2px 16px rgba(224,49,49,0.06)" },
  panelHeader: { padding: "14px 18px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", justifyContent: "space-between" },
  panelTitle:  { fontSize: 13, fontWeight: 700, color: "#1a0a0a" },
  panelAction: { fontSize: 12, color: "#e03131", cursor: "pointer", border: "none", background: "none", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 },

  // Filters
  filterGroup: { display: "flex", flexDirection: "column", gap: 4 },
  filterLabel: { fontSize: 11, fontWeight: 600, color: "#a07878", textTransform: "uppercase", letterSpacing: "0.06em" },
  select:      { padding: "8px 12px", borderRadius: 8, border: "1px solid #f0e0e0", fontSize: 13, color: "#1a0a0a", background: "white", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "border-color 0.12s" },
};