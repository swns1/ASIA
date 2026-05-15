import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getVisibleNavGroups } from "../utils/navigation";
import { clearAuthSession } from "../utils/auth";
import AIInsightPanel, { callGemini } from "../components/AIInsightPanel";
import logo from "../assets/logo.png";
import logoutIcon from "../assets/logout.svg";


// ── API ───────────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8003/api";
const AUTH_API = "http://localhost:8000";

function getToken() { return sessionStorage.getItem("access_token") || ""; }

async function apiCall(method, url, body = null) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
  const opts = { method, headers };
  if (body && method !== "GET") opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) { const e = await res.text(); throw new Error(`${res.status}: ${e}`); }
  return res.json();
}

const getStudents    = (p = {}) => apiCall("GET", `${AUTH_API}/api/students/?${new URLSearchParams(p)}`);
const getEnrollments = (p = {}) => apiCall("GET", `${API_BASE}/enrollments/?${new URLSearchParams(p)}`);
const getGrades      = (p = {}) => apiCall("GET", `${API_BASE}/grades/?${new URLSearchParams(p)}`);
const getSubjects    = (p = {}) => apiCall("GET", `${API_BASE}/subjects/?${new URLSearchParams(p)}`);

// ── NAV ───────────────────────────────────────────────────────────────────────
const NAV = [
  { section: "Main", items: [
    { label: "Dashboard",   icon: "ti-layout-dashboard", path: "/dashboard"   },
    { label: "Students",    icon: "ti-users",             path: "/students"    },
    { label: "Enrollments", icon: "ti-clipboard-list",    path: "/enrollments" },
    { label: "Subjects",    icon: "ti-book",              path: "/subjects"    },
    { label: "Grades",      icon: "ti-chart-bar",         path: "/grades"      },
    { label: "Requirements", icon: "ti-file-check",        path: "/requirements" },
    { label: "Analytics", icon: "ti-chart-dots-3", path: "/analytics" },
  ]},
  { section: "Finance", items: [
    { label: "Invoices",     icon: "ti-receipt",  path: "/invoices"     },
    { label: "Payments",     icon: "ti-cash",     path: "/payments"     },
    { label: "Scholarships", icon: "ti-discount", path: "/scholarships" },
  ]},
  { section: "Settings", items: [
    { label: "Users",             icon: "ti-user-cog",         path: "/users"             },
    { label: "School Settings",   icon: "ti-settings",         path: "/settings"          },
    { label: "Grading Templates", icon: "ti-report-analytics", path: "/grading-templates" },
    { label: "Scholarship Types", icon: "ti-discount",         path: "/scholarship-types" },
    { label: "Fee Schedules",     icon: "ti-cash",             path: "/fee-schedules"     },
  ]},
];

// ── Constants ─────────────────────────────────────────────────────────────────
const GRADING_PERIODS_BY_LEVEL = {
  nursery:           ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"],
  kindergarten:      ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"],
  elementary:        ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"],
  junior_highschool: ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"],
  senior_highschool: ["1st_semester","2nd_semester"],
};

const PERIOD_LABELS = {
  "1st_quarter":  "Q1",
  "2nd_quarter":  "Q2",
  "3rd_quarter":  "Q3",
  "4th_quarter":  "Q4",
  "1st_semester": "Sem 1",
  "2nd_semester": "Sem 2",
};

const PERIOD_FULL = {
  "1st_quarter":  "1st Quarter",
  "2nd_quarter":  "2nd Quarter",
  "3rd_quarter":  "3rd Quarter",
  "4th_quarter":  "4th Quarter",
  "1st_semester": "1st Semester",
  "2nd_semester": "2nd Semester",
};

const SCHOOL_LEVEL_META = {
  nursery:           { label:"Nursery",      color:"#be185d", bg:"#fde8f8" },
  kindergarten:      { label:"Kindergarten", color:"#d97706", bg:"#fdf5e8" },
  elementary:        { label:"Elementary",   color:"#2e6b0d", bg:"#e8f5e0" },
  junior_highschool: { label:"Junior HS",    color:"#1455a0", bg:"#e3f0fd" },
  senior_highschool: { label:"Senior HS",    color:"#7c3aed", bg:"#f0e8fd" },
};

const PALETTES = [
  { bg:"#fde8e8", color:"#c0392b" },{ bg:"#e8f0fd", color:"#2563eb" },
  { bg:"#e8fdf0", color:"#16a34a" },{ bg:"#fdf5e8", color:"#d97706" },
  { bg:"#f0e8fd", color:"#7c3aed" },{ bg:"#fde8f8", color:"#be185d" },
  { bg:"#e8fdfd", color:"#0891b2" },
];
const getPalette = (name = "X") => PALETTES[name.charCodeAt(0) % PALETTES.length];

// ── Helpers ───────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width:w, height:h, borderRadius:r, background:"linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.6s ease-in-out infinite" }} />
);

function gradeStyle(g) {
  if (g === null || g === undefined) return { color:"#c0a0a0", bg:"transparent", label:"—" };
  const n = parseFloat(g);
  if (n >= 90) return { color:"#1455a0", bg:"#e3f0fd",  label:"Outstanding" };
  if (n >= 85) return { color:"#2e6b0d", bg:"#e8f5e0",  label:"Very Satisfactory" };
  if (n >= 80) return { color:"#2e6b0d", bg:"#eaf3de",  label:"Satisfactory" };
  if (n >= 75) return { color:"#854f0b", bg:"#faeeda",  label:"Fairly Satisfactory" };
  return { color:"#9b2020", bg:"#fde8e8", label:"Did Not Meet" };
}

function GradeCell({ grade }) {
  if (grade === null || grade === undefined) {
    return <td style={tdStyle}><span style={{ color:"#d0b8b8", fontSize:13 }}>—</span></td>;
  }
  const n = parseFloat(grade);
  const gs = gradeStyle(n);
  return (
    <td style={tdStyle}>
      <span style={{ fontSize:13, fontWeight:700, padding:"3px 10px", borderRadius:8, background:gs.bg, color:gs.color }}>
        {n.toFixed(2)}
      </span>
    </td>
  );
}

function GeneralAverageCell({ grades }) {
  const valid = grades.filter((g) => g !== null && g !== undefined);
  if (valid.length === 0) return <td style={{ ...tdStyle, background:"#fdfafa" }}><span style={{ color:"#d0b8b8", fontSize:13 }}>—</span></td>;
  const avg = valid.reduce((s, g) => s + parseFloat(g), 0) / valid.length;
  const gs = gradeStyle(avg);
  return (
    <td style={{ ...tdStyle, background:"#fdfafa" }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
        <span style={{ fontSize:14, fontWeight:700, padding:"3px 12px", borderRadius:8, background:gs.bg, color:gs.color }}>{avg.toFixed(2)}</span>
      </div>
    </td>
  );
}

// ── Student Search Picker ─────────────────────────────────────────────────────
function StudentPicker({ value, onChange }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await getStudents({ search: query, page_size: 100 });
        setResults(data.results || []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  if (value) {
    const p = getPalette(value.last_name ?? "X");
    const initials = `${value.first_name?.[0]??""}${value.last_name?.[0]??""}`.toUpperCase();
    const fullName = [value.first_name, value.middle_name, value.last_name, value.suffix].filter(Boolean).join(" ");
    return (
      <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px", border:"1.5px solid #fde2de", borderRadius:12, background:"linear-gradient(to right,#fff8f6,white)" }}>
        <div style={{ width:46, height:46, borderRadius:"50%", background:p.bg, color:p.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:15, flexShrink:0 }}>{initials}</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a" }}>{fullName}</div>
          <div style={{ fontSize:12, color:"#b09090", marginTop:2 }}>LRN {value.lrn} · {value.student_number}</div>
        </div>
        <button type="button" onClick={() => onChange(null)}
          style={{ background:"transparent", border:"1px solid #fde2de", borderRadius:8, padding:"6px 12px", fontSize:12, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div style={{ position:"relative" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, background:"white", border:"1.5px solid #fde2de", borderRadius:12, padding:"0 14px", height:46 }}>
        <i className="ti ti-search" style={{ fontSize:15, color:"#c0a0a0" }} />
        <input placeholder="Search student by name or LRN…" value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={{ flex:1, border:"none", background:"transparent", fontSize:14, color:"#1a0a0a", outline:"none", fontFamily:"'DM Sans',sans-serif" }} />
        {loading && <i className="ti ti-loader-2" style={{ fontSize:14, color:"#e03131", animation:"spin 1s linear infinite" }} />}
      </div>
      {open && query && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:6, background:"white", borderRadius:12, border:"1px solid #fde2de", boxShadow:"0 12px 40px rgba(224,49,49,0.14)", maxHeight:280, overflowY:"auto", zIndex:20 }}>
          {results.length === 0 && !loading && <div style={{ padding:"20px 16px", textAlign:"center", color:"#b09090", fontSize:13 }}>No students match "{query}".</div>}
          {results.map((st) => {
            const p = getPalette(st.last_name ?? "X");
            const initials = `${st.first_name?.[0]??""}${st.last_name?.[0]??""}`.toUpperCase();
            return (
              <div key={st.student_id} onClick={() => { onChange(st); setOpen(false); setQuery(""); }}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", cursor:"pointer", borderBottom:"1px solid #f9f0f0" }}
                onMouseEnter={(e) => e.currentTarget.style.background="#fff8f6"}
                onMouseLeave={(e) => e.currentTarget.style.background="transparent"}>
                <div style={{ width:34, height:34, borderRadius:"50%", background:p.bg, color:p.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>{initials}</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{st.last_name}, {st.first_name}</div>
                  <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>LRN {st.lrn} · {st.status}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LogoutModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"white", borderRadius:20, padding:"32px 36px", width:380, boxShadow:"0 24px 64px rgba(224,49,49,0.18)", display:"flex", flexDirection:"column", alignItems:"center", gap:14, animation:"slideUp 0.2s ease" }}>
        <div style={{ width:56, height:56, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <i className="ti ti-logout" style={{ fontSize:24, color:"#e03131" }} />
        </div>
        <div style={{ fontSize:17, fontWeight:700, color:"#1a0a0a"}}>Log out?</div>
        <div style={{ fontSize:13, color:"#7a5050", textAlign:"center", lineHeight:1.7 }}>
          You'll be returned to the login page. Any unsaved changes will be lost.
        </div>
        <div style={{ display:"flex", gap:10, width:"100%", marginTop:4 }}>
          <button onClick={onCancel} style={{ flex:1, height:42, border:"1.5px solid #f0e0e0", borderRadius:10, background:"white", fontSize:13, color:"#7a5050", cursor:"pointer", fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
            Stay
          </button>
          <button onClick={onConfirm} style={{ flex:1, height:42, border:"none", borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", fontSize:13, color:"white", cursor:"pointer", fontWeight:700, fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.3)" }}>
            Yes, logout
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Grade Summary Table ───────────────────────────────────────────────────────
function SummaryTable({ enrollment, grades, subjects, loading }) {
  const periods = GRADING_PERIODS_BY_LEVEL[enrollment.school_level] ?? [];
  const lvlMeta = SCHOOL_LEVEL_META[enrollment.school_level] ?? SCHOOL_LEVEL_META.elementary;

  // Build grade map: subjectId → { period → numeric_grade }
  const gradeMap = useMemo(() => {
    const map = {};
    grades.forEach((g) => {
      if (!map[g.subject]) map[g.subject] = {};
      map[g.subject][g.grading_period] = g.numeric_grade;
    });
    return map;
  }, [grades]);

  // General average per period
  const periodAverages = useMemo(() => {
    const avgs = {};
    periods.forEach((p) => {
      const vals = subjects.map((s) => gradeMap[s.subject_id]?.[p]).filter((v) => v !== undefined);
      avgs[p] = vals.length > 0 ? vals.reduce((s, v) => s + parseFloat(v), 0) / vals.length : null;
    });
    return avgs;
  }, [gradeMap, subjects, periods]);

  // Overall general average
  const overallAvg = useMemo(() => {
    const allGrades = grades.map((g) => parseFloat(g.numeric_grade));
    if (allGrades.length === 0) return null;
    return allGrades.reduce((s, g) => s + g, 0) / allGrades.length;
  }, [grades]);

  const overallGs = gradeStyle(overallAvg);

  if (loading) return (
    <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"24px", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
      {[1,2,3,4,5].map((i) => <div key={i} style={{ marginBottom:12 }}><Sk w="100%" h={36} r={8} /></div>)}
    </div>
  );

  return (
    <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)", animation:"fadeUp 0.25s ease both" }}>

      {/* Table header info */}
      <div style={{ padding:"18px 22px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, background:"linear-gradient(to right,#fdfafa,white)" }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:"#1a0a0a"}}>
            {enrollment.grade_level} — {enrollment.section}
          </div>
          <div style={{ fontSize:12, color:"#b09090", marginTop:3 }}>
            S.Y. {enrollment.school_year} ·
            <span style={{ display:"inline-flex", alignItems:"center", gap:4, marginLeft:6, fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:99, background:lvlMeta.bg, color:lvlMeta.color }}>
              {lvlMeta.label}
            </span>
            {enrollment.strand && <span style={{ marginLeft:6, color:"#b09090" }}>· {enrollment.strand}</span>}
          </div>
        </div>
        {overallAvg !== null && (
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:11, color:"#b09090", marginBottom:4, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em" }}>General Average</div>
            <div style={{ fontSize:32, fontWeight:700, padding:"6px 20px", borderRadius:12, background:overallGs.bg, color:overallGs.color, lineHeight:1 }}>
              {overallAvg.toFixed(2)}
            </div>
            <div style={{ fontSize:11, color:overallGs.color, fontWeight:600, marginTop:4 }}>{overallGs.label}</div>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#fdfafa" }}>
              <th style={{ ...thStyle, textAlign:"left", width:"35%" }}>Subject</th>
              {periods.map((p) => (
                <th key={p} style={{ ...thStyle, width:`${50/periods.length}%` }}>{PERIOD_FULL[p]}</th>
              ))}
              <th style={{ ...thStyle, background:"#f9f4f4", width:"15%" }}>Average</th>
            </tr>
          </thead>
          <tbody>
            {subjects.length === 0 ? (
              <tr>
                <td colSpan={periods.length + 2} style={{ ...tdStyle, textAlign:"center", padding:"40px", color:"#b09090", fontStyle:"italic" }}>
                  No subjects found for this enrollment level.
                </td>
              </tr>
            ) : subjects.map((sub, idx) => {
              const subGrades = periods.map((p) => gradeMap[sub.subject_id]?.[p] ?? null);
              return (
                <tr key={sub.subject_id} style={{ animation:`rowIn 0.18s ease both`, animationDelay:`${idx*20}ms` }}
                  onMouseEnter={(e) => { Array.from(e.currentTarget.cells).forEach((c) => c.style.background="#fff8f6"); }}
                  onMouseLeave={(e) => { Array.from(e.currentTarget.cells).forEach((c, i) => c.style.background = i === periods.length+1 ? "#fdfafa" : ""); }}>
                  <td style={{ ...tdStyle, textAlign:"left" }}>
                    <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{sub.subject_name}</div>
                    <div style={{ fontSize:11, color:"#b09090", marginTop:1, fontFamily:"monospace" }}>{sub.subject_code}</div>
                  </td>
                  {subGrades.map((g, i) => <GradeCell key={i} grade={g} />)}
                  <GeneralAverageCell grades={subGrades} />
                </tr>
              );
            })}

            {/* Period averages row */}
            {subjects.length > 0 && (
              <tr style={{ background:"#fdfafa", borderTop:"2px solid #f5eaea" }}>
                <td style={{ ...tdStyle, textAlign:"left", fontWeight:700, color:"#1a0a0a", background:"#fdfafa" }}>
                  Period Average
                </td>
                {periods.map((p) => {
                  const avg = periodAverages[p];
                  const gs = gradeStyle(avg);
                  return (
                    <td key={p} style={{ ...tdStyle, background:"#fdfafa" }}>
                      {avg !== null
                        ? <span style={{ fontSize:13, fontWeight:700, padding:"3px 10px", borderRadius:8, background:gs.bg, color:gs.color }}>{avg.toFixed(2)}</span>
                        : <span style={{ color:"#d0b8b8", fontSize:13 }}>—</span>
                      }
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, background:"#f9f4f4" }}>
                  {overallAvg !== null
                    ? <span style={{ fontSize:14, fontWeight:700, padding:"3px 12px", borderRadius:8, background:overallGs.bg, color:overallGs.color }}>{overallAvg.toFixed(2)}</span>
                    : <span style={{ color:"#d0b8b8", fontSize:13 }}>—</span>
                  }
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ padding:"14px 22px", borderTop:"1px solid #f5eaea", display:"flex", gap:16, flexWrap:"wrap", alignItems:"center" }}>
        <span style={{ fontSize:11, color:"#b09090", fontWeight:600 }}>Legend:</span>
        {[
          { range:"90–100", label:"Outstanding",         color:"#1455a0", bg:"#e3f0fd" },
          { range:"85–89",  label:"Very Satisfactory",   color:"#2e6b0d", bg:"#e8f5e0" },
          { range:"80–84",  label:"Satisfactory",        color:"#2e6b0d", bg:"#eaf3de" },
          { range:"75–79",  label:"Fairly Satisfactory", color:"#854f0b", bg:"#faeeda" },
          { range:"< 75",   label:"Did Not Meet",        color:"#9b2020", bg:"#fde8e8" },
        ].map((l) => (
          <div key={l.range} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ fontSize:11, fontWeight:700, padding:"2px 7px", borderRadius:6, background:l.bg, color:l.color }}>{l.range}</span>
            <span style={{ fontSize:11, color:"#b09090" }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function GradeSummaryPage() {
  const navigate = useNavigate();

  const [student,     setStudent]     = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [enrollment,  setEnrollment]  = useState(null);
  const [grades,      setGrades]      = useState([]);
  const [subjects,    setSubjects]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [loadingEnr,  setLoadingEnr]  = useState(false);

  const [showLogout, setShowLogout] = useState(false);

  // ── Load enrollments when student changes ──
  useEffect(() => {
    if (!student) { setEnrollments([]); setEnrollment(null); setGrades([]); setSubjects([]); return; }
    setLoadingEnr(true);
    getEnrollments({ student: student.student_id, page_size: 20 })
      .then((d) => setEnrollments(Array.isArray(d) ? d : d?.results ?? []))
      .catch(() => setEnrollments([]))
      .finally(() => setLoadingEnr(false));
  }, [student]);

  // ── Load grades + subjects when enrollment changes ──
  useEffect(() => {
    if (!enrollment) { setGrades([]); setSubjects([]); return; }
    setLoading(true);
    Promise.all([
      getGrades({ enrollment: enrollment.enrollment_id, page_size: 200 })
        .then((d) => Array.isArray(d) ? d : d?.results ?? []),
      getSubjects({ school_level: enrollment.school_level, grade_level: enrollment.grade_level, page_size: 100 })
        .then((d) => Array.isArray(d) ? d : d?.results ?? []),
    ])
      .then(([g, s]) => { setGrades(g); setSubjects(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enrollment]);

  const palette  = student ? getPalette(student.last_name ?? "X") : null;
  const initials = student ? `${student.first_name?.[0]??""}${student.last_name?.[0]??""}`.toUpperCase() : "";
  const fullName = student ? [student.first_name, student.middle_name, student.last_name, student.suffix].filter(Boolean).join(" ") : "";

  const gradeCount    = grades.length;
  const passedCount   = grades.filter((g) => parseFloat(g.numeric_grade) >= 75).length;
  const failedCount   = grades.filter((g) => parseFloat(g.numeric_grade) < 75).length;
  const overallAvg    = gradeCount > 0 ? grades.reduce((s, g) => s + parseFloat(g.numeric_grade), 0) / gradeCount : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes rowIn   { from{opacity:0;transform:translateX(-4px)} to{opacity:1;transform:translateX(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }
        .nav-item { transition:background 0.12s,color 0.12s; }
        .nav-item:hover { background:#fff4f4 !important; color:#e03131 !important; }
        .nav-active { background:#fff0f0 !important; color:#e03131 !important; font-weight:600 !important; }
        .enr-chip { display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;border:1.5px solid #f0e4e4;background:white;font-size:13px;color:#7a5050;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;transition:all 0.14s;text-align:left;width:100%; }
        .enr-chip:hover { border-color:#fca5a5;color:#e03131;background:#fff8f6; }
        .enr-chip.active { background:#fff0f0;border-color:#e03131;color:#e03131;font-weight:700; }
        .new-btn { transition:all 0.16s !important; }
        .new-btn:hover { background:#c92a2a !important;box-shadow:0 8px 28px rgba(224,49,49,0.32) !important;transform:translateY(-1px); }
      `}</style>

      <div style={{ display:"flex", height:"100vh", background:"#fdf8f6", fontFamily:"'DM Sans',sans-serif", overflow:"hidden" }}>

        {/* ── Sidebar ── */}
        <aside style={{ width:224, flexShrink:0, background:"white", borderRight:"1px solid #f5eaea", display:"flex", flexDirection:"column", boxShadow:"2px 0 12px rgba(224,49,49,0.04)" }}>
          <div style={{ padding:"22px 18px 18px", borderBottom:"1px solid #f5eaea" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <img src={logo} alt="Logo" style={{ width:20, height:30 }} />
              
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>South Lakes IS</div>
                <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>Admin Portal</div>
              </div>
            </div>
          </div>
          <nav style={{ flex:1, padding:"14px 10px", display:"flex", flexDirection:"column", gap:2, overflowY:"auto" }}>
            {getVisibleNavGroups(NAV).map((group) => (
              <div key={group.section} style={{ marginBottom:6 }}>
                <div style={{ fontSize:9.5, color:"#cdb0b0", letterSpacing:"0.1em", textTransform:"uppercase", padding:"10px 10px 4px", fontWeight:600 }}>{group.section}</div>
                {group.items.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <div key={item.path} className={`nav-item${active?" nav-active":""}`}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:9, fontSize:13, color:active?"#e03131":"#7a5a5a", cursor:"pointer" }}
                      onClick={() => navigate(item.path)} role="button" tabIndex={0}
                      onKeyDown={(e) => e.key==="Enter" && navigate(item.path)}>
                      <i className={`ti ${item.icon}`} style={{ fontSize:16, width:20, textAlign:"center" }} />
                      {item.label}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>
            <div style={{ padding:"14px 10px", borderTop:"1px solid #f5eaea" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px", borderRadius:10, background:"#fff8f6" }}>
                <div style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#fde8e8,#fca5a5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#e03131", flexShrink:0 }}>SA</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>Super Admin</div>
                  <div style={{ fontSize:11, color:"#b09090" }}>super_admin</div>
                </div>
                <button
                  title="Logout"
                  onClick={() => setShowLogout(true)}
                  style={{
                    width:30, height:30, border:"1px solid #f0e4e4", borderRadius:8,
                    background:"white", display:"flex", alignItems:"center", justifyContent:"center",
                    cursor:"pointer", color:"#c09090", transition:"all 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background="#fff0f0"; e.currentTarget.style.color="#e03131"; e.currentTarget.style.borderColor="#fca5a5"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background="white"; e.currentTarget.style.color="#c09090"; e.currentTarget.style.borderColor="#f0e4e4"; }}
                >
                  <img src={logoutIcon} alt="Logout" style={{ width: 20, height: 20 }} />
                </button>
              </div>
            </div>
        </aside>

        {/* ── Main ── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Topbar */}
          <div style={{ background:"white", borderBottom:"1px solid #f5eaea", padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <button onClick={() => navigate("/grades")}
                style={{ display:"flex", alignItems:"center", gap:6, height:34, padding:"0 14px", border:"1px solid #f0e4e4", borderRadius:9, background:"white", fontSize:13, color:"#9a7070", fontFamily:"'DM Sans',sans-serif", fontWeight:500, cursor:"pointer" }}>
                <i className="ti ti-arrow-left" style={{ fontSize:13 }} />Grades
              </button>
              <i className="ti ti-chevron-right" style={{ fontSize:12, color:"#d0b8b8" }} />
              <span style={{ fontSize:13, color:"#1a0a0a", fontWeight:600 }}>Grade Summary</span>
            </div>
            <button className="new-btn"
              onClick={() => navigate("/grades/entry")}
              style={{ display:"flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}>
              <i className="ti ti-pencil" style={{ fontSize:14 }} />Enter Grades
            </button>
          </div>

          {/* Content */}
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Page title */}
            <div>
              <div style={{ fontSize:22, fontWeight:700, color:"#1a0a0a", letterSpacing:"-0.01em" }}>Grade Summary</div>
              <div style={{ fontSize:13, color:"#b09090", marginTop:4 }}>View a student's complete grade report across all subjects and periods.</div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"300px 1fr", gap:16, alignItems:"start" }}>

              {/* ── Left: selectors ── */}
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

                {/* Student picker */}
                <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
                  <div style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:8 }}>
                    <i className="ti ti-user-search" style={{ fontSize:15, color:"#e03131" }} />
                    <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>Select Student</span>
                  </div>
                  <div style={{ padding:"14px 18px" }}>
                    <StudentPicker value={student} onChange={(s) => { setStudent(s); setEnrollment(null); }} />
                  </div>
                </div>

                {/* Student profile card */}
                {student && (
                  <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", animation:"fadeUp 0.2s ease both" }}>
                    <div style={{ height:5, background:"linear-gradient(to right,#e03131,#ff6b6b,#fca5a5)" }} />
                    <div style={{ padding:"18px 18px 14px", display:"flex", alignItems:"center", gap:14 }}>
                      <div style={{ width:52, height:52, borderRadius:"50%", background:palette.bg, color:palette.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:18, flexShrink:0, border:`2px solid ${palette.color}33` }}>{initials}</div>
                      <div>
                        <div style={{ fontSize:15, fontWeight:700, color:"#1a0a0a"}}>{fullName}</div>
                        <div style={{ fontSize:12, color:"#b09090", marginTop:3 }}>LRN {student.lrn}</div>
                        <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:99, background: student.status==="active"?"#e8f5e0":"#f0ede8", color: student.status==="active"?"#2e6b0d":"#5c5752", marginTop:4, display:"inline-block" }}>
                          {student.status}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Enrollment picker */}
                {student && (
                  <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", animation:"fadeUp 0.2s ease both" }}>
                    <div style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:8 }}>
                      <i className="ti ti-clipboard-list" style={{ fontSize:15, color:"#e03131" }} />
                      <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>Select School Year</span>
                    </div>
                    <div style={{ padding:"14px 18px", display:"flex", flexDirection:"column", gap:6 }}>
                      {loadingEnr
                        ? [1,2].map((i) => <div key={i} style={{ padding:"10px 14px", borderRadius:10, border:"1px solid #f5eaea" }}><Sk w="80%" h={14} /><div style={{ marginTop:6 }}><Sk w="50%" h={11} /></div></div>)
                        : enrollments.length === 0
                          ? <div style={{ fontSize:13, color:"#b09090", textAlign:"center", padding:"16px 0", fontStyle:"italic" }}>No enrollments found.</div>
                          : enrollments.map((en) => {
                              const lvlMeta = SCHOOL_LEVEL_META[en.school_level] ?? SCHOOL_LEVEL_META.elementary;
                              return (
                                <button key={en.enrollment_id} className={`enr-chip${enrollment?.enrollment_id===en.enrollment_id?" active":""}`}
                                  onClick={() => setEnrollment(en)}>
                                  <div style={{ width:32, height:32, borderRadius:8, background:enrollment?.enrollment_id===en.enrollment_id?lvlMeta.bg:"#f9f4f4", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                    <i className="ti ti-clipboard-list" style={{ fontSize:14, color:enrollment?.enrollment_id===en.enrollment_id?lvlMeta.color:"#9a7070" }} />
                                  </div>
                                  <div style={{ minWidth:0, flex:1 }}>
                                    <div style={{ fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                      S.Y. {en.school_year}
                                    </div>
                                    <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>
                                      {en.grade_level} · {en.section}
                                    </div>
                                  </div>
                                  <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:99, background:lvlMeta.bg, color:lvlMeta.color, flexShrink:0 }}>
                                    {lvlMeta.label}
                                  </span>
                                </button>
                              );
                            })
                      }
                    </div>
                  </div>
                )}

                {/* Stats */}
                {enrollment && !loading && grades.length > 0 && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, animation:"fadeUp 0.2s ease both" }}>
                    {[
                      { label:"Grades recorded", value:gradeCount,  color:"#e03131", bg:"#fff0f0", icon:"ti-clipboard-check" },
                      { label:"Passed",           value:passedCount, color:"#2e6b0d", bg:"#e8f5e0", icon:"ti-circle-check"   },
                      { label:"Failed",           value:failedCount, color:"#9b2020", bg:"#fde8e8", icon:"ti-circle-x"       },
                      { label:"Avg grade",        value:overallAvg?.toFixed(2)??"—", color:"#1455a0", bg:"#e3f0fd", icon:"ti-chart-bar" },
                    ].map((s) => (
                      <div key={s.label} style={{ background:"white", borderRadius:12, border:"1px solid #f5eaea", padding:"12px 14px", display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:32, height:32, borderRadius:8, background:s.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <i className={`ti ${s.icon}`} style={{ fontSize:15, color:s.color }} />
                        </div>
                        <div>
                          <div style={{ fontSize:17, fontWeight:700, color:"#1a0a0a", lineHeight:1 }}>{s.value}</div>
                          <div style={{ fontSize:10, color:"#a07878", marginTop:3, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:500 }}>{s.label}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Right: grade table ── */}
              <div>
                {!student ? (
                  <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"80px 24px", textAlign:"center", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
                    <div style={{ width:60, height:60, borderRadius:18, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
                      <i className="ti ti-table" style={{ fontSize:28, color:"#e08080" }} />
                    </div>
                    <div style={{ fontSize:16, color:"#7a5050", fontWeight:600}}>No student selected</div>
                    <div style={{ fontSize:13, color:"#b09090", marginTop:6 }}>Search for a student on the left to view their grade report</div>
                  </div>
                ) : !enrollment ? (
                  <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"80px 24px", textAlign:"center", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
                    <div style={{ width:60, height:60, borderRadius:18, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
                      <i className="ti ti-clipboard-list" style={{ fontSize:28, color:"#e08080" }} />
                    </div>
                    <div style={{ fontSize:16, color:"#7a5050", fontWeight:600}}>Select a school year</div>
                    <div style={{ fontSize:13, color:"#b09090", marginTop:6 }}>Pick an enrollment from the left to see the grade table</div>
                  </div>
                ) : (
                  <SummaryTable
                    enrollment={enrollment}
                    grades={grades}
                    subjects={subjects}
                    loading={loading}
                  />
                )}

                {/* Empty grades state */}
                {enrollment && !loading && grades.length === 0 && (
                  <div style={{ marginTop:14, background:"#fef3e2", border:"1px solid #f6c96a", borderRadius:16, padding:"24px 28px", display:"flex", alignItems:"flex-start", gap:14, animation:"fadeUp 0.2s ease both" }}>
                    <i className="ti ti-alert-triangle" style={{ fontSize:22, color:"#854f0b", flexShrink:0, marginTop:2 }} />
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:"#854f0b" }}>No grades recorded yet</div>
                      <div style={{ fontSize:13, color:"#7a4a08", marginTop:4, lineHeight:1.6 }}>
                        No grades have been entered for this enrollment. Use the Grade Entry page to start recording scores.
                      </div>
                      <button onClick={() => navigate("/grades/entry")}
                        style={{ marginTop:12, display:"inline-flex", alignItems:"center", gap:6, background:"#854f0b", color:"white", border:"none", borderRadius:8, padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                        <i className="ti ti-pencil" style={{ fontSize:12 }} />Go to Grade Entry
                      </button>
                    </div>
                  </div>
                )}
                            {/* ── AI Insight Panel ── */}
                {enrollment && !loading && grades.length > 0 && (
                  <div style={{ marginTop:14 }}>
                    <AIInsightPanel
                      title="AI Grade Interpretation"
                      description="Gemini-powered analysis of this student's academic performance"
                      disabled={grades.length === 0}
                      onFetch={() => {
                        const subjectMap = {};
                        subjects.forEach((s) => { subjectMap[s.subject_id] = s.subject_name; });

                        const gradesBySubject = {};
                        grades.forEach((g) => {
                          const name = subjectMap[g.subject] ?? `Subject #${g.subject}`;
                          if (!gradesBySubject[name]) gradesBySubject[name] = {};
                          gradesBySubject[name][g.grading_period] = parseFloat(g.numeric_grade);
                        });

                        const overallAvg = grades.length > 0
                          ? grades.reduce((s, g) => s + parseFloat(g.numeric_grade), 0) / grades.length
                          : null;

                        return callGemini("grade_report", {
                          student_name:      fullName,
                          grade_level:       enrollment.grade_level,
                          school_level:      enrollment.school_level,
                          section:           enrollment.section,
                          school_year:       enrollment.school_year,
                          overall_average:   overallAvg?.toFixed(2),
                          passed_subjects:   grades.filter((g) => parseFloat(g.numeric_grade) >= 75).length,
                          failed_subjects:   grades.filter((g) => parseFloat(g.numeric_grade) < 75).length,
                          total_grades:      grades.length,
                          grades_by_subject: gradesBySubject,
                        });
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {showLogout && (
        <LogoutModal
          onConfirm={() => {
            clearAuthSession();
            navigate("/");
          }}
          onCancel={() => setShowLogout(false)}
        />
      )}
    </>
  );
}

// ── Table styles ──────────────────────────────────────────────────────────────
const thStyle = {
  textAlign:"center", fontSize:10.5, fontWeight:600, color:"#c0a0a0",
  padding:"12px 16px", borderBottom:"1px solid #f5eaea",
  textTransform:"uppercase", letterSpacing:"0.07em",
};
const tdStyle = {
  textAlign:"center", padding:"12px 16px", borderBottom:"1px solid #f9f0f0",
  verticalAlign:"middle", transition:"background 0.1s",
};
