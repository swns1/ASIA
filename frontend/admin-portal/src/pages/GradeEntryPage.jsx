import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getVisibleNavGroups } from "../utils/navigation";
import { clearAuthSession } from "../utils/auth";
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
  if (method === "DELETE") return null;
  return res.json();
}

const getStudents      = (p = {}) => apiCall("GET",    `${AUTH_API}/api/students/?${new URLSearchParams(p)}`);
const getEnrollments   = (p = {}) => apiCall("GET",    `${API_BASE}/enrollments/?${new URLSearchParams(p)}`);
const getSubjects      = (p = {}) => apiCall("GET",    `${API_BASE}/subjects/?${new URLSearchParams(p)}`);
const getScoreEntries  = (p = {}) => apiCall("GET",    `${API_BASE}/score-entries/?${new URLSearchParams(p)}`);
const createScore      = (p)      => apiCall("POST",   `${API_BASE}/score-entries/`, p);
const updateScore      = (id, p)  => apiCall("PATCH",  `${API_BASE}/score-entries/${id}/`, p);
const deleteScore      = (id)     => apiCall("DELETE", `${API_BASE}/score-entries/${id}/`);
const computeGrade     = (p = {}) => apiCall("GET",    `${API_BASE}/score-entries/compute/?${new URLSearchParams(p)}`);
const saveGrade        = (p)      => apiCall("POST",   `${API_BASE}/grades/`, p);
const updateGrade      = (id, p)  => apiCall("PATCH",  `${API_BASE}/grades/${id}/`, p);
const getGrades        = (p = {}) => apiCall("GET",    `${API_BASE}/grades/?${new URLSearchParams(p)}`);

// ── NAV ───────────────────────────────────────────────────────────────────────
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
  "1st_quarter":  "1st Quarter",
  "2nd_quarter":  "2nd Quarter",
  "3rd_quarter":  "3rd Quarter",
  "4th_quarter":  "4th Quarter",
  "1st_semester": "1st Semester",
  "2nd_semester": "2nd Semester",
};

const COMPONENT_COLORS = ["#e03131","#1455a0","#2e6b0d","#d97706","#7c3aed","#be185d","#0891b2"];

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

function gradeColor(g) {
  if (g >= 90) return { color:"#1455a0", bg:"#e3f0fd" };
  if (g >= 75) return { color:"#2e6b0d", bg:"#e8f5e0" };
  if (g >  0)  return { color:"#9b2020", bg:"#fde8e8" };
  return { color:"#7a5050", bg:"#f9f4f4" };
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
      <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", border:"1.5px solid #fde2de", borderRadius:12, background:"linear-gradient(to right,#fff8f6,white)" }}>
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
        <div style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:6, background:"white", borderRadius:12, border:`1px solid #fde2de`, boxShadow:"0 12px 40px rgba(224,49,49,0.14)", maxHeight:280, overflowY:"auto", zIndex:1000 }}>
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
                  <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>LRN {st.lrn}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Score Row ─────────────────────────────────────────────────────────────────
function ScoreRow({ entry, onUpdate, onDelete, color }) {
  const [editing, setEditing]   = useState(false);
  const [label,   setLabel]     = useState(entry.label);
  const [score,   setScore]     = useState(String(entry.score));
  const [max,     setMax]       = useState(String(entry.max_score));
  const [saving,  setSaving]    = useState(false);

  const pct = entry.max_score > 0 ? Math.round((entry.score / entry.max_score) * 100) : 0;
  const gc  = gradeColor(pct);

  const handleSave = async () => {
    if (!label.trim() || !score || !max || parseFloat(max) <= 0) return;
    if (parseFloat(score) > parseFloat(max)) return;
    setSaving(true);
    await onUpdate(entry.score_entry_id, { label: label.trim(), score: parseFloat(score), max_score: parseFloat(max) });
    setEditing(false);
    setSaving(false);
  };

  const inp = { border:"1.5px solid #fde2de", borderRadius:8, padding:"6px 10px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a", background:"#fffbfb", outline:"none" };

  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"#fdfafa", border:"1px solid #f5eaea", borderRadius:10, transition:"border-color 0.12s" }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor="#fca5a5"}
      onMouseLeave={(e) => e.currentTarget.style.borderColor="#f5eaea"}>
      <div style={{ width:8, height:8, borderRadius:"50%", background:color, flexShrink:0 }} />
      {editing ? (
        <>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" style={{ ...inp, flex:1, minWidth:0 }} />
          <input type="number" value={score} onChange={(e) => setScore(e.target.value)} placeholder="Score" style={{ ...inp, width:70, textAlign:"right" }} />
          <span style={{ fontSize:12, color:"#b09090" }}>/</span>
          <input type="number" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Max" style={{ ...inp, width:70, textAlign:"right" }} />
          <button onClick={handleSave} disabled={saving}
            style={{ background:"#e03131", color:"white", border:"none", borderRadius:7, padding:"6px 12px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:4 }}>
            {saving ? <i className="ti ti-loader-2" style={{ fontSize:12, animation:"spin 1s linear infinite" }} /> : <i className="ti ti-check" style={{ fontSize:12 }} />}
          </button>
          <button onClick={() => { setEditing(false); setLabel(entry.label); setScore(String(entry.score)); setMax(String(entry.max_score)); }}
            style={{ background:"white", color:"#9a7070", border:"1px solid #f0e4e4", borderRadius:7, padding:"6px 10px", fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
            <i className="ti ti-x" style={{ fontSize:12 }} />
          </button>
        </>
      ) : (
        <>
          <span style={{ flex:1, fontSize:13, color:"#1a0a0a", fontWeight:500 }}>{entry.label}</span>
          <span style={{ fontSize:13, color:"#5a4a4a" }}>{entry.score} / {entry.max_score}</span>
          <span style={{ fontSize:12, fontWeight:700, padding:"2px 8px", borderRadius:6, background:gc.bg, color:gc.color }}>{pct}%</span>
          <button onClick={() => setEditing(true)}
            style={{ width:26, height:26, border:"1px solid #f0e4e4", borderRadius:7, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070", transition:"all 0.12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background="#fff0f0"; e.currentTarget.style.color="#e03131"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background="white"; e.currentTarget.style.color="#9a7070"; }}>
            <i className="ti ti-pencil" style={{ fontSize:11 }} />
          </button>
          <button onClick={() => onDelete(entry.score_entry_id)}
            style={{ width:26, height:26, border:"1px solid #f0e4e4", borderRadius:7, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#c09090", transition:"all 0.12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background="#fff0f0"; e.currentTarget.style.color="#e03131"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background="white"; e.currentTarget.style.color="#c09090"; }}>
            <i className="ti ti-trash" style={{ fontSize:11 }} />
          </button>
        </>
      )}
    </div>
  );
}

// ── Add Score Form ────────────────────────────────────────────────────────────
function AddScoreForm({ componentId, enrollmentId, subjectId, gradingPeriod, onAdded, color }) {
  const [label, setLabel] = useState("");
  const [score, setScore] = useState("");
  const [max,   setMax]   = useState("");
  const [saving,setSaving]= useState(false);
  const [error, setError] = useState("");

  const handleAdd = async () => {
    if (!label.trim())              { setError("Label required."); return; }
    if (!score || parseFloat(score) < 0) { setError("Score required."); return; }
    if (!max || parseFloat(max) <= 0)    { setError("Max score required."); return; }
    if (parseFloat(score) > parseFloat(max)) { setError("Score cannot exceed max."); return; }
    setSaving(true); setError("");
    try {
      await createScore({
        enrollment:         enrollmentId,
        subject:            subjectId,
        grading_component:  componentId,
        grading_period:     gradingPeriod,
        label:              label.trim(),
        score:              parseFloat(score),
        max_score:          parseFloat(max),
      });
      setLabel(""); setScore(""); setMax("");
      onAdded();
    } catch (e) { setError(e.message || "Failed to add score."); }
    finally { setSaving(false); }
  };

  const inp = { border:"1.5px solid #fde2de", borderRadius:8, padding:"7px 10px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a", background:"#fffbfb", outline:"none" };

  return (
    <div style={{ marginTop:8 }}>
      {error && <div style={{ fontSize:11, color:"#b91c1c", marginBottom:6 }}>{error}</div>}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:color, flexShrink:0, opacity:0.4 }} />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Quiz 1"
          style={{ ...inp, flex:1, minWidth:0 }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        <input type="number" value={score} onChange={(e) => setScore(e.target.value)} placeholder="Score" min="0"
          style={{ ...inp, width:70, textAlign:"right" }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        <span style={{ fontSize:12, color:"#b09090" }}>/</span>
        <input type="number" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Max" min="0"
          style={{ ...inp, width:70, textAlign:"right" }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        <button onClick={handleAdd} disabled={saving}
          style={{ background:saving?"#e87474":"#fff0f0", color:"#e03131", border:"1px solid #fca5a5", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:700, cursor:saving?"not-allowed":"pointer", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap" }}>
          {saving ? <i className="ti ti-loader-2" style={{ fontSize:12, animation:"spin 1s linear infinite" }} /> : <i className="ti ti-plus" style={{ fontSize:12 }} />}
          Add
        </button>
      </div>
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
        <div style={{ fontSize:17, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>Log out?</div>
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

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function GradeEntryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ── Selection state ──
  const [student,       setStudent]       = useState(null);
  const [enrollment,    setEnrollment]    = useState(null);
  const [enrollments,   setEnrollments]   = useState([]);
  const [subject,       setSubject]       = useState(null);
  const [subjects,      setSubjects]      = useState([]);
  const [gradingPeriod, setGradingPeriod] = useState("");

  // ── Data state ──
  const [scoreEntries,  setScoreEntries]  = useState([]);
  const [computation,   setComputation]   = useState(null);
  const [existingGrade, setExistingGrade] = useState(null);
  const [loadingScores, setLoadingScores] = useState(false);
  const [computing,     setComputing]     = useState(false);
  const [savingFinal,   setSavingFinal]   = useState(false);
  const [savedMsg,      setSavedMsg]      = useState("");
  const [error,         setError]         = useState("");

  const [showLogout, setShowLogout] = useState(false);

  // ── Load enrollments when student changes ──
  useEffect(() => {
    if (!student) { setEnrollments([]); setEnrollment(null); return; }
    getEnrollments({ student: student.student_id, enrollment_status: "enrolled", page_size: 20 })
      .then((d) => setEnrollments(Array.isArray(d) ? d : d?.results ?? []))
      .catch(() => setEnrollments([]));
  }, [student]);

  // ── Load subjects when enrollment changes ──
  useEffect(() => {
    if (!enrollment) { setSubjects([]); setSubject(null); return; }
    getSubjects({
      school_level: enrollment.school_level,
      grade_level:  enrollment.grade_level,
      page_size:    100,
    })
      .then((d) => setSubjects(Array.isArray(d) ? d : d?.results ?? []))
      .catch(() => setSubjects([]));
    // Set default grading period
    const periods = GRADING_PERIODS_BY_LEVEL[enrollment.school_level] ?? [];
    setGradingPeriod(periods[0] ?? "");
    setSubject(null);
  }, [enrollment]);

  // ── Load scores when subject + period changes ──
  const loadScores = useCallback(async () => {
    if (!enrollment || !subject || !gradingPeriod) return;
    setLoadingScores(true);
    try {
      const data = await getScoreEntries({
        enrollment_id: enrollment.enrollment_id,
        subject_id:    subject.subject_id,
        grading_period: gradingPeriod,
        page_size:     200,
      });
      setScoreEntries(Array.isArray(data) ? data : data?.results ?? []);

      // Check for existing final grade
      const grades = await getGrades({
        enrollment: enrollment.enrollment_id,
        subject:    subject.subject_id,
        grading_period: gradingPeriod,
      });
      const existing = (Array.isArray(grades) ? grades : grades?.results ?? [])[0] ?? null;
      setExistingGrade(existing);
      setComputation(null);
    } catch (e) { console.error(e); }
    finally { setLoadingScores(false); }
  }, [enrollment, subject, gradingPeriod]);

  useEffect(() => { loadScores(); }, [loadScores]);

  // ── Compute grade ──
  const handleCompute = async () => {
    if (!enrollment || !subject || !gradingPeriod) return;
    setComputing(true); setError("");
    try {
      const result = await computeGrade({
        enrollment_id:  enrollment.enrollment_id,
        subject_id:     subject.subject_id,
        grading_period: gradingPeriod,
      });
      setComputation(result);
    } catch (e) { setError(e.message || "Failed to compute grade."); }
    finally { setComputing(false); }
  };

  // ── Save final grade ──
  const handleSaveFinal = async () => {
    if (!computation) return;
    setSavingFinal(true); setError("");
    try {
      const payload = {
        enrollment:     enrollment.enrollment_id,
        subject:        subject.subject_id,
        grading_period: gradingPeriod,
        numeric_grade:  computation.final_grade,
        remarks:        computation.remarks,
      };
      if (existingGrade) {
        await updateGrade(existingGrade.grade_id, { numeric_grade: computation.final_grade, remarks: computation.remarks });
      } else {
        await saveGrade(payload);
      }
      setSavedMsg("Final grade saved successfully!");
      setTimeout(() => setSavedMsg(""), 3000);
      await loadScores();
    } catch (e) { setError(e.message || "Failed to save grade."); }
    finally { setSavingFinal(false); }
  };

  const handleUpdateScore = async (id, payload) => {
    await updateScore(id, payload);
    await loadScores();
    setComputation(null);
  };

  const handleDeleteScore = async (id) => {
    await deleteScore(id);
    await loadScores();
    setComputation(null);
  };

  const periods = enrollment ? (GRADING_PERIODS_BY_LEVEL[enrollment.school_level] ?? []) : [];
  const template = subject?.grading_template_detail;
  const components = template?.components ?? [];

  // Group score entries by component
  const scoresByComponent = useMemo(() => {
    const map = {};
    scoreEntries.forEach((e) => {
      const cid = e.grading_component;
      if (!map[cid]) map[cid] = [];
      map[cid].push(e);
    });
    return map;
  }, [scoreEntries]);

  const gc = computation ? gradeColor(computation.final_grade) : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.5} }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }
        .nav-item { transition:background 0.12s,color 0.12s; }
        .nav-item:hover { background:#fff4f4 !important; color:#e03131 !important; }
        .nav-active { background:#fff0f0 !important; color:#e03131 !important; font-weight:600 !important; }
        .period-chip { display:inline-flex;align-items:center;padding:8px 16px;border-radius:99px;border:1.5px solid #f0e4e4;background:white;font-size:13px;color:#9a7070;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;transition:all 0.14s; }
        .period-chip:hover { border-color:#fca5a5;color:#e03131;background:#fff8f6; }
        .period-chip.active { background:#fff0f0;border-color:#e03131;color:#e03131;font-weight:700; }
        .subject-chip { display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;border:1.5px solid #f0e4e4;background:white;font-size:13px;color:#7a5050;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;transition:all 0.14s;text-align:left; }
        .subject-chip:hover { border-color:#fca5a5;color:#e03131;background:#fff8f6; }
        .subject-chip.active { background:#fff0f0;border-color:#e03131;color:#e03131;font-weight:700; }
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
              <span style={{ fontSize:13, color:"#1a0a0a", fontWeight:600 }}>Grade Entry</span>
            </div>
            <button onClick={() => navigate("/grades/summary")}
              style={{ display:"flex", alignItems:"center", gap:6, height:34, padding:"0 14px", border:"1px solid #f0e4e4", borderRadius:9, background:"white", fontSize:13, color:"#9a7070", fontFamily:"'DM Sans',sans-serif", fontWeight:500, cursor:"pointer", transition:"all 0.14s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor="#fca5a5"; e.currentTarget.style.color="#e03131"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor="#f0e4e4"; e.currentTarget.style.color="#9a7070"; }}>
              <i className="ti ti-table" style={{ fontSize:13 }} />Grade Summary
            </button>
          </div>

          {/* Content */}
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Page title */}
            <div>
              <div style={{ fontSize:22, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif", letterSpacing:"-0.01em" }}>Grade Entry</div>
              <div style={{ fontSize:13, color:"#b09090", marginTop:4 }}>Select a student, enrollment, subject, and period to enter raw scores.</div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#b91c1c", display:"flex", alignItems:"center", gap:8 }}>
                <i className="ti ti-alert-circle" style={{ fontSize:15 }} />{error}
                <button onClick={() => setError("")} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color:"#b91c1c" }}><i className="ti ti-x" style={{ fontSize:13 }} /></button>
              </div>
            )}

            {/* Success */}
            {savedMsg && (
              <div style={{ background:"#e8f5e0", border:"1px solid #a3d977", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#2e6b0d", display:"flex", alignItems:"center", gap:8 }}>
                <i className="ti ti-circle-check" style={{ fontSize:15 }} />{savedMsg}
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"340px 1fr", gap:16, alignItems:"start" }}>

              {/* ── Left panel: selectors ── */}
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

                {/* Step 1: Student */}
                <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
                  <div style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:24, height:24, borderRadius:"50%", background:"#e03131", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"white", flexShrink:0 }}>1</div>
                    <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>Select Student</span>
                  </div>
                  <div style={{ padding:"14px 18px" }}>
                    <StudentPicker value={student} onChange={(s) => { setStudent(s); setEnrollment(null); setSubject(null); setComputation(null); }} />
                  </div>
                </div>

                {/* Step 2: Enrollment */}
                {student && (
                  <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", animation:"fadeUp 0.2s ease both" }}>
                    <div style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:24, height:24, borderRadius:"50%", background:"#e03131", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"white", flexShrink:0 }}>2</div>
                      <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>Select Enrollment</span>
                    </div>
                    <div style={{ padding:"14px 18px", display:"flex", flexDirection:"column", gap:6 }}>
                      {enrollments.length === 0
                        ? <div style={{ fontSize:13, color:"#b09090", textAlign:"center", padding:"12px 0", fontStyle:"italic" }}>No active enrollments found.</div>
                        : enrollments.map((en) => (
                            <button key={en.enrollment_id} className={`subject-chip${enrollment?.enrollment_id===en.enrollment_id?" active":""}`}
                              onClick={() => { setEnrollment(en); setSubject(null); setComputation(null); }}>
                              <i className="ti ti-clipboard-list" style={{ fontSize:14, flexShrink:0 }} />
                              <div style={{ minWidth:0 }}>
                                <div style={{ fontSize:13, fontWeight:600 }}>{en.school_year} — {en.grade_level}</div>
                                <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>{en.section} · {en.enrollment_status}</div>
                              </div>
                            </button>
                          ))
                      }
                    </div>
                  </div>
                )}

                {/* Step 3: Subject */}
                {enrollment && (
                  <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", animation:"fadeUp 0.2s ease both" }}>
                    <div style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:24, height:24, borderRadius:"50%", background:"#e03131", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"white", flexShrink:0 }}>3</div>
                      <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>Select Subject</span>
                    </div>
                    <div style={{ padding:"14px 18px", display:"flex", flexDirection:"column", gap:6, maxHeight:260, overflowY:"auto" }}>
                      {subjects.length === 0
                        ? <div style={{ fontSize:13, color:"#b09090", textAlign:"center", padding:"12px 0", fontStyle:"italic" }}>No subjects for this level.</div>
                        : subjects.map((sub) => (
                            <button key={sub.subject_id} className={`subject-chip${subject?.subject_id===sub.subject_id?" active":""}`}
                              onClick={() => { setSubject(sub); setComputation(null); }}>
                              <i className="ti ti-book" style={{ fontSize:14, flexShrink:0 }} />
                              <div style={{ minWidth:0 }}>
                                <div style={{ fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sub.subject_name}</div>
                                <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>
                                  {sub.subject_code}
                                  {sub.grading_template_detail
                                    ? ` · ${sub.grading_template_detail.template_name}`
                                    : " · No template"}
                                </div>
                              </div>
                            </button>
                          ))
                      }
                    </div>
                  </div>
                )}

                {/* Step 4: Period */}
                {subject && (
                  <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", animation:"fadeUp 0.2s ease both" }}>
                    <div style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:24, height:24, borderRadius:"50%", background:"#e03131", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"white", flexShrink:0 }}>4</div>
                      <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>Grading Period</span>
                    </div>
                    <div style={{ padding:"14px 18px", display:"flex", flexWrap:"wrap", gap:6 }}>
                      {periods.map((p) => (
                        <button key={p} className={`period-chip${gradingPeriod===p?" active":""}`}
                          onClick={() => { setGradingPeriod(p); setComputation(null); }}>
                          {PERIOD_LABELS[p]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Right panel: score entry ── */}
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {!subject ? (
                  <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"64px 24px", textAlign:"center", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
                    <div style={{ width:56, height:56, borderRadius:16, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
                      <i className="ti ti-pencil" style={{ fontSize:24, color:"#e08080" }} />
                    </div>
                    <div style={{ fontSize:15, color:"#7a5050", fontWeight:600, fontFamily:"'Playfair Display',serif" }}>Select a student and subject</div>
                    <div style={{ fontSize:13, color:"#b09090", marginTop:6 }}>Use the steps on the left to get started</div>
                  </div>
                ) : !template ? (
                  <div style={{ background:"#fef3e2", border:"1px solid #f6c96a", borderRadius:16, padding:"24px", display:"flex", alignItems:"flex-start", gap:14 }}>
                    <i className="ti ti-alert-triangle" style={{ fontSize:22, color:"#854f0b", flexShrink:0, marginTop:2 }} />
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:"#854f0b" }}>No grading template assigned</div>
                      <div style={{ fontSize:13, color:"#7a4a08", marginTop:4, lineHeight:1.6 }}>
                        "{subject.subject_name}" doesn't have a grading template. Go to <strong>Subjects</strong> and assign a template before entering scores.
                      </div>
                      <button onClick={() => navigate("/subjects")}
                        style={{ marginTop:12, display:"inline-flex", alignItems:"center", gap:6, background:"#854f0b", color:"white", border:"none", borderRadius:8, padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                        <i className="ti ti-book" style={{ fontSize:12 }} />Go to Subjects
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Subject header */}
                    <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"18px 22px", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
                      <div>
                        <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>{subject.subject_name}</div>
                        <div style={{ fontSize:12, color:"#b09090", marginTop:3 }}>
                          {subject.subject_code} · {template.template_name} · {PERIOD_LABELS[gradingPeriod]}
                        </div>
                      </div>
                      {existingGrade && (
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:11, color:"#b09090" }}>Saved grade:</span>
                          <span style={{ fontSize:18, fontWeight:700, padding:"4px 14px", borderRadius:99, ...gradeColor(existingGrade.numeric_grade) }}>
                            {parseFloat(existingGrade.numeric_grade).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Components */}
                    {loadingScores ? (
                      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                        {[1,2,3].map((i) => <div key={i} style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"20px 22px" }}><Sk w="40%" h={16} /><div style={{ marginTop:12 }}><Sk w="100%" h={40} /></div></div>)}
                      </div>
                    ) : (
                      components.map((comp, ci) => {
                        const color    = COMPONENT_COLORS[ci % COMPONENT_COLORS.length];
                        const entries  = scoresByComponent[comp.grading_component_id] ?? [];
                        const avgPct   = entries.length > 0
                          ? entries.reduce((s, e) => s + (e.score / e.max_score) * 100, 0) / entries.length
                          : null;
                        const weighted = avgPct !== null ? (avgPct * comp.weight) / 100 : null;

                        return (
                          <div key={comp.grading_component_id} style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", animation:`fadeUp 0.2s ease ${ci*60}ms both` }}>
                            {/* Component header */}
                            <div style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(to right,#fdfafa,white)" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                <div style={{ width:10, height:10, borderRadius:"50%", background:color }} />
                                <span style={{ fontSize:14, fontWeight:700, color:"#1a0a0a" }}>{comp.component_name}</span>
                                <span style={{ fontSize:11, color:"#b09090", background:"#f9f4f4", padding:"2px 8px", borderRadius:6 }}>{comp.weight}% weight</span>
                                <span style={{ fontSize:11, color:"#b09090" }}>{entries.length} score{entries.length !== 1 ? "s" : ""}</span>
                              </div>
                              {weighted !== null && (
                                <div style={{ textAlign:"right" }}>
                                  <div style={{ fontSize:11, color:"#b09090" }}>Contribution</div>
                                  <div style={{ fontSize:15, fontWeight:700, color }}>+{weighted.toFixed(2)}</div>
                                </div>
                              )}
                            </div>

                            {/* Scores */}
                            <div style={{ padding:"12px 18px", display:"flex", flexDirection:"column", gap:6 }}>
                              {entries.map((entry) => (
                                <ScoreRow key={entry.score_entry_id} entry={entry} color={color}
                                  onUpdate={handleUpdateScore} onDelete={handleDeleteScore} />
                              ))}
                              <AddScoreForm
                                componentId={comp.grading_component_id}
                                enrollmentId={enrollment.enrollment_id}
                                subjectId={subject.subject_id}
                                gradingPeriod={gradingPeriod}
                                onAdded={() => { loadScores(); setComputation(null); }}
                                color={color}
                              />
                            </div>

                            {/* Component average */}
                            {avgPct !== null && (
                              <div style={{ padding:"10px 18px", borderTop:"1px solid #f9f0f0", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#fdfafa" }}>
                                <span style={{ fontSize:12, color:"#b09090" }}>Component average</span>
                                <span style={{ fontSize:13, fontWeight:700, ...gradeColor(avgPct), padding:"2px 10px", borderRadius:6 }}>{avgPct.toFixed(2)}%</span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}

                    {/* Compute + Save */}
                    {!loadingScores && scoreEntries.length > 0 && (
                      <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"20px 22px", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", animation:"fadeUp 0.2s ease both" }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:14 }}>
                          <div>
                            <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a" }}>Final Grade</div>
                            <div style={{ fontSize:12, color:"#b09090", marginTop:2 }}>Compute weighted grade from all scores above</div>
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                            {computation && (
                              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                <span style={{ fontSize:28, fontWeight:700, padding:"6px 18px", borderRadius:12, ...gc }}>{computation.final_grade}</span>
                                <span style={{ fontSize:13, fontWeight:600, padding:"4px 12px", borderRadius:99, background: computation.remarks==="passed"?"#e8f5e0":"#fde8e8", color: computation.remarks==="passed"?"#2e6b0d":"#9b2020" }}>
                                  {computation.remarks ?? "—"}
                                </span>
                              </div>
                            )}
                            <button onClick={handleCompute} disabled={computing}
                              style={{ display:"inline-flex", alignItems:"center", gap:6, background:"white", color:"#e03131", border:"1.5px solid #fca5a5", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:computing?"not-allowed":"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.14s" }}
                              onMouseEnter={(e) => { if(!computing){ e.currentTarget.style.background="#fff0f0"; }}}
                              onMouseLeave={(e) => { e.currentTarget.style.background="white"; }}>
                              {computing ? <i className="ti ti-loader-2" style={{ fontSize:14, animation:"spin 1s linear infinite" }} /> : <i className="ti ti-calculator" style={{ fontSize:14 }} />}
                              {computing ? "Computing…" : "Compute"}
                            </button>
                            {computation && (
                              <button onClick={handleSaveFinal} disabled={savingFinal}
                                style={{ display:"inline-flex", alignItems:"center", gap:6, background:savingFinal?"#e87474":"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:savingFinal?"not-allowed":"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.26)", transition:"all 0.14s" }}>
                                {savingFinal ? <i className="ti ti-loader-2" style={{ fontSize:14, animation:"spin 1s linear infinite" }} /> : <i className="ti ti-device-floppy" style={{ fontSize:14 }} />}
                                {savingFinal ? "Saving…" : existingGrade ? "Update Grade" : "Save Grade"}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Breakdown table */}
                        {computation && (
                          <div style={{ marginTop:16, borderTop:"1px solid #f5eaea", paddingTop:14 }}>
                            <div style={{ fontSize:11, color:"#b09090", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>Grade Breakdown</div>
                            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                              {computation.components.map((comp, i) => (
                                <div key={comp.component_id} style={{ display:"flex", alignItems:"center", gap:10 }}>
                                  <div style={{ width:8, height:8, borderRadius:"50%", background:COMPONENT_COLORS[i%COMPONENT_COLORS.length], flexShrink:0 }} />
                                  <span style={{ flex:1, fontSize:13, color:"#1a0a0a" }}>{comp.component_name}</span>
                                  <span style={{ fontSize:12, color:"#b09090" }}>{comp.average_percentage}% avg</span>
                                  <span style={{ fontSize:12, color:"#b09090" }}>× {comp.weight}%</span>
                                  <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a", minWidth:36, textAlign:"right" }}>= {comp.weighted_score}</span>
                                </div>
                              ))}
                              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:6, paddingTop:10, borderTop:"1px solid #f5eaea" }}>
                                <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>Final Grade</span>
                                <span style={{ fontSize:18, fontWeight:700, padding:"3px 14px", borderRadius:99, ...gc }}>{computation.final_grade}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
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
