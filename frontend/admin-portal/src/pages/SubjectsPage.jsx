import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ── API ───────────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8003/api";

function getToken() { return sessionStorage.getItem("access_token") || ""; }

async function apiCall(method, url, body = null) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
  const opts = { method, headers };
  if (body && method !== "GET") opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) { const e = await res.text(); throw new Error(`${res.status}: ${e}`); }
  return res.json();
}

const getSubjects         = (p = {}) => apiCall("GET",    `${API_BASE}/subjects/?${new URLSearchParams(p)}`);
const createSubject       = (p)      => apiCall("POST",   `${API_BASE}/subjects/`, p);
const updateSubject       = (id, p)  => apiCall("PATCH",  `${API_BASE}/subjects/${id}/`, p);
const deleteSubject       = (id)     => apiCall("DELETE", `${API_BASE}/subjects/${id}/`).catch(() => null);
const getTemplates        = ()       => apiCall("GET",    `${API_BASE}/grading-templates/?is_active=true`);

// ── NAV ───────────────────────────────────────────────────────────────────────
const NAV = [
  { section: "Main", items: [
    { label: "Dashboard",   icon: "ti-layout-dashboard", path: "/dashboard"   },
    { label: "Students",    icon: "ti-users",             path: "/students"    },
    { label: "Enrollments", icon: "ti-clipboard-list",    path: "/enrollments" },
    { label: "Subjects",    icon: "ti-book",              path: "/subjects"    },
    { label: "Grades",      icon: "ti-chart-bar",         path: "/grades"      },
  ]},
  { section: "Finance", items: [
    { label: "Invoices",     icon: "ti-receipt",  path: "/invoices"     },
    { label: "Payments",     icon: "ti-cash",     path: "/payments"     },
    { label: "Scholarships", icon: "ti-discount", path: "/scholarships" },
  ]},
  { section: "Settings", items: [
    { label: "Users",           icon: "ti-user-cog", path: "/users"    },
    { label: "School Settings", icon: "ti-settings", path: "/settings" },
    { label: "Grading Templates", icon: "ti-report-analytics", path: "/grading-templates" },
  ]},
];

// ── Constants ─────────────────────────────────────────────────────────────────
const SCHOOL_LEVELS = [
  { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", color: "#be185d", bg: "#fde8f8" },
  { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          color: "#d97706", bg: "#fdf5e8" },
  { value: "elementary",        label: "Elementary",   icon: "ti-book",          color: "#2e6b0d", bg: "#e8f5e0" },
  { value: "junior_highschool", label: "Junior HS",    icon: "ti-school",        color: "#1455a0", bg: "#e3f0fd" },
  { value: "senior_highschool", label: "Senior HS",    icon: "ti-certificate",   color: "#7c3aed", bg: "#f0e8fd" },
];

const GRADE_LEVELS_BY_LEVEL = {
  nursery:           ["Nursery"],
  kindergarten:      ["Kindergarten"],
  elementary:        ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"],
  junior_highschool: ["Grade 7","Grade 8","Grade 9","Grade 10"],
  senior_highschool: ["Grade 11","Grade 12"],
};

const SHS_STRANDS = ["STEM","ABM","HUMSS","GAS","TVL-ICT","TVL-HE","TVL-IA","TVL-AFA","Arts and Design","Sports"];

const getLevelMeta = (level) => SCHOOL_LEVELS.find((l) => l.value === level) ?? SCHOOL_LEVELS[2];

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: "linear-gradient(90deg, #f0e8e8 25%, #fde8e8 50%, #f0e8e8 75%)",
    backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite",
  }} />
);

// ── Form Modal ────────────────────────────────────────────────────────────────
function SubjectModal({ subject, templates, onSave, onClose }) {
  const isEdit = Boolean(subject?.subject_id);
  const [form, setForm] = useState({
    subject_code:        subject?.subject_code        ?? "",
    subject_name:        subject?.subject_name        ?? "",
    school_level:        subject?.school_level        ?? "elementary",
    grade_level:         subject?.grade_level         ?? "Grade 1",
    strand:              subject?.strand              ?? "",
    semester:            subject?.semester            ?? "",
    grading_template:    subject?.grading_template    ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const isSHS = form.school_level === "senior_highschool";
  const gradeOptions = GRADE_LEVELS_BY_LEVEL[form.school_level] ?? [];

  const setF = (k, v) => setForm((f) => {
    const next = { ...f, [k]: v };
    if (k === "school_level") {
      next.grade_level = (GRADE_LEVELS_BY_LEVEL[v] ?? [])[0] ?? "";
      if (v !== "senior_highschool") { next.strand = ""; next.semester = ""; }
      else if (!next.semester) next.semester = "1st";
    }
    return next;
  });

  const handleSave = async () => {
    if (!form.subject_code.trim()) { setError("Subject code is required."); return; }
    if (!form.subject_name.trim()) { setError("Subject name is required."); return; }
    if (isSHS && !form.semester)   { setError("Semester is required for Senior HS."); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        subject_code:     form.subject_code.trim(),
        subject_name:     form.subject_name.trim(),
        school_level:     form.school_level,
        grade_level:      form.grade_level,
        strand:           isSHS && form.strand ? form.strand : null,
        semester:         isSHS ? form.semester : null,
        grading_template: form.grading_template || null,
      };
      await onSave(isEdit ? subject.subject_id : null, payload);
    } catch (e) {
      setError(e.message || "Failed to save subject.");
    } finally {
      setSaving(false);
    }
  };

  const inp = {
    width: "100%", border: "1.5px solid #fde2de", borderRadius: 10,
    padding: "10px 14px", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
    color: "#1a0a0a", background: "#fffbfb", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 999, backdropFilter: "blur(4px)", animation: "fadeIn 0.15s ease",
    }}>
      <div style={{
        background: "white", borderRadius: 20, width: 560, maxHeight: "90vh",
        overflowY: "auto", boxShadow: "0 24px 64px rgba(224,49,49,0.18)",
        animation: "slideUp 0.2s ease",
      }}>
        {/* Modal header */}
        <div style={{
          padding: "22px 28px 18px", borderBottom: "1px solid #f5eaea",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "linear-gradient(to right, #fdfafa, white)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-book" style={{ fontSize: 18, color: "#e03131" }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a", fontFamily: "'Playfair Display', serif" }}>
                {isEdit ? "Edit Subject" : "New Subject"}
              </div>
              <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>
                {isEdit ? "Update subject details" : "Add a new subject to the curriculum"}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", fontSize: 20, display: "flex", alignItems: "center" }}>
            <i className="ti ti-x" />
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: "22px 28px" }}>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{error}
            </div>
          )}

          {/* School level chips */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>School Level *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SCHOOL_LEVELS.map((lvl) => {
                const active = form.school_level === lvl.value;
                return (
                  <button key={lvl.value} type="button" onClick={() => setF("school_level", lvl.value)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 99, border: `1.5px solid ${active ? lvl.color : "#f0e4e4"}`, background: active ? lvl.bg : "white", color: active ? lvl.color : "#9a7070", fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all .15s" }}>
                    <i className={`ti ${lvl.icon}`} style={{ fontSize: 13 }} />{lvl.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grid fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Subject Code *</label>
              <input value={form.subject_code} onChange={(e) => setF("subject_code", e.target.value)} placeholder="e.g. MATH-7" style={inp} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Grade Level *</label>
              <select value={form.grade_level} onChange={(e) => setF("grade_level", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Subject Name *</label>
            <input value={form.subject_name} onChange={(e) => setF("subject_name", e.target.value)} placeholder="e.g. Mathematics 7" style={inp} />
          </div>

          {/* SHS fields */}
          {isSHS && (
            <div style={{ padding: "14px 16px", background: "#fff8f6", border: "1px dashed #fca5a5", borderRadius: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, color: "#e03131", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>Senior HS specifics</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                <div style={{ marginBottom: 0 }}>
                  <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Strand</label>
                  <select value={form.strand} onChange={(e) => setF("strand", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                    <option value="">— Any strand —</option>
                    {SHS_STRANDS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Semester *</label>
                  <select value={form.semester} onChange={(e) => setF("semester", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                    <option value="1st">1st Semester</option>
                    <option value="2nd">2nd Semester</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Grading template */}
          <div style={{ marginBottom: 6 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Grading Template</label>
            <select value={form.grading_template || ""} onChange={(e) => setF("grading_template", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
              <option value="">— No template assigned —</option>
              {templates.map((t) => (
                <option key={t.grading_template_id} value={t.grading_template_id}>
                  {t.template_name} ({t.school_level})
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: "#b09090", marginTop: 5, fontStyle: "italic" }}>
              Determines how raw scores are weighted into a final grade.
            </div>
          </div>
        </div>

        {/* Modal footer */}
        <div style={{ padding: "16px 28px 24px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ background: "transparent", color: "#9a7070", border: "1.5px solid #fde2de", borderRadius: 50, padding: "9px 22px", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{ background: saving ? "#e87474" : "linear-gradient(135deg, #e03131, #c92a2a)", color: "white", border: "none", borderRadius: 50, padding: "9px 24px", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: saving ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
            {saving ? <><i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 1s linear infinite" }} />Saving…</> : <><i className="ti ti-check" style={{ fontSize: 13 }} />{isEdit ? "Update Subject" : "Create Subject"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Modal ──────────────────────────────────────────────────────────────
function DeleteModal({ subject, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "white", borderRadius: 20, padding: "32px 36px", width: 400, boxShadow: "0 24px 64px rgba(224,49,49,0.18)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, animation: "slideUp 0.2s ease" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className="ti ti-trash" style={{ fontSize: 24, color: "#e03131" }} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1a0a0a", fontFamily: "'Playfair Display', serif" }}>Delete Subject?</div>
        <div style={{ fontSize: 13, color: "#7a5050", textAlign: "center", lineHeight: 1.7 }}>
          You're about to delete <strong style={{ color: "#1a0a0a" }}>{subject.subject_name}</strong>. This cannot be undone and may affect existing grades.
        </div>
        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
          <button onClick={onCancel} style={{ flex: 1, height: 42, border: "1.5px solid #f0e0e0", borderRadius: 10, background: "white", fontSize: 13, color: "#7a5050", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, height: 42, border: "none", borderRadius: 10, background: "linear-gradient(135deg, #e03131, #c92a2a)", fontSize: 13, color: "white", cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.3)" }}>Yes, delete</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function SubjectsPage() {
  const navigate = useNavigate();

  const [subjects,    setSubjects]    = useState([]);
  const [templates,   setTemplates]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [inputVal,    setInputVal]    = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [page,        setPage]        = useState(1);
  const [pageMeta,    setPageMeta]    = useState({ count: 0, next: null, previous: null });
  const [modal,       setModal]       = useState(null); // null | { mode: "create"|"edit", subject? }
  const [toDelete,    setToDelete]    = useState(null);

  const fetchSubjects = useCallback(async (p = 1, term = search, level = levelFilter) => {
    setLoading(true);
    try {
      const params = { page: p };
      if (term) params.search = term;
      if (level !== "all") params.school_level = level;
      const data = await getSubjects(params);
      setSubjects(data.results || []);
      setPageMeta({ count: data.count, next: data.next, previous: data.previous });
      setPage(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, levelFilter]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchSubjects(1, "", "all");
    getTemplates().then((d) => setTemplates(Array.isArray(d) ? d : d?.results ?? [])).catch(() => {});
  }, []);

  const handleSave = async (id, payload) => {
    if (id) await updateSubject(id, payload);
    else    await createSubject(payload);
    setModal(null);
    fetchSubjects(page, search, levelFilter);
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    await deleteSubject(toDelete.subject_id);
    setToDelete(null);
    fetchSubjects(page, search, levelFilter);
  };

  const totalPages = Math.ceil(pageMeta.count / 20);

  // Counts per level for chips
  const levelCounts = {};
  subjects.forEach((s) => { levelCounts[s.school_level] = (levelCounts[s.school_level] || 0) + 1; });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes rowIn   { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:translateX(0)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }
        .nav-item { transition:background 0.12s,color 0.12s; }
        .nav-item:hover { background:#fff4f4 !important; color:#e03131 !important; }
        .nav-active { background:#fff0f0 !important; color:#e03131 !important; font-weight:600 !important; }
        .sub-row { transition:background 0.12s; cursor:pointer; }
        .sub-row:hover td { background:#fff8f6 !important; }
        .sub-row:hover .sub-name { color:#e03131 !important; }
        .row-action { width:30px;height:30px;border:1px solid #f0e4e4;border-radius:8px;background:white;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#9a7070;transition:all 0.12s;font-family:'DM Sans',sans-serif; }
        .row-action:hover { background:#fff0f0 !important;color:#e03131 !important;border-color:#fca5a5 !important; }
        .chip-btn { display:flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:99px;border:1.5px solid #f0e4e4;background:white;font-size:12px;color:#9a7070;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;transition:all 0.14s; }
        .chip-btn:hover { border-color:#fca5a5;color:#e03131;background:#fff8f6; }
        .chip-btn.active { background:#fff0f0;border-color:#e03131;color:#e03131;font-weight:700; }
        .new-btn { transition:all 0.16s !important; }
        .new-btn:hover { background:#c92a2a !important;box-shadow:0 8px 28px rgba(224,49,49,0.32) !important;transform:translateY(-1px); }
        .page-btn:hover:not(:disabled) { background:#fff0f0 !important;border-color:#e03131 !important;color:#e03131 !important; }
        .page-btn:disabled { opacity:0.3;cursor:not-allowed; }
        .search-wrap:focus-within { border-color:#e03131 !important;box-shadow:0 0 0 3px rgba(224,49,49,0.09) !important; }
      `}</style>

      <div style={{ display:"flex", height:"100vh", background:"#fdf8f6", fontFamily:"'DM Sans',sans-serif", overflow:"hidden" }}>

        {/* ── Sidebar ── */}
        <aside style={{ width:224, flexShrink:0, background:"white", borderRight:"1px solid #f5eaea", display:"flex", flexDirection:"column", boxShadow:"2px 0 12px rgba(224,49,49,0.04)" }}>
          <div style={{ padding:"22px 18px 18px", borderBottom:"1px solid #f5eaea" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 12px rgba(224,49,49,0.3)" }}>
                <i className="ti ti-school" style={{ fontSize:17, color:"white" }} />
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>South Lakes IS</div>
                <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>Admin Portal</div>
              </div>
            </div>
          </div>
          <nav style={{ flex:1, padding:"14px 10px", display:"flex", flexDirection:"column", gap:2, overflowY:"auto" }}>
            {NAV.map((group) => (
              <div key={group.section} style={{ marginBottom:6 }}>
                <div style={{ fontSize:9.5, color:"#cdb0b0", letterSpacing:"0.1em", textTransform:"uppercase", padding:"10px 10px 4px", fontWeight:600 }}>{group.section}</div>
                {group.items.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <div key={item.path} className={`nav-item${active ? " nav-active" : ""}`}
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
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px", borderRadius:10, background:"#fff8f6", cursor:"pointer" }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#fde8e8,#fca5a5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#e03131", flexShrink:0 }}>SA</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>Super Admin</div>
                <div style={{ fontSize:11, color:"#b09090" }}>super_admin</div>
              </div>
              <i className="ti ti-chevron-right" style={{ fontSize:13, color:"#c0a0a0", marginLeft:"auto" }} />
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Topbar */}
          <div style={{ background:"white", borderBottom:"1px solid #f5eaea", padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif", letterSpacing:"-0.01em" }}>Subjects</div>
              <div style={{ fontSize:11.5, color:"#b09090", marginTop:1 }}>
                {loading ? "Loading…" : `${pageMeta.count.toLocaleString()} subjects in curriculum`}
              </div>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <button style={{ width:36, height:36, border:"1px solid #f5eaea", borderRadius:10, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070", position:"relative" }}>
                <i className="ti ti-bell" style={{ fontSize:16 }} />
                <span style={{ width:8, height:8, background:"#e03131", borderRadius:"50%", position:"absolute", top:6, right:6, border:"2px solid white" }} />
              </button>
              <button className="new-btn"
                style={{ display:"flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}
                onClick={() => setModal({ mode: "create" })}>
                <i className="ti ti-plus" style={{ fontSize:15 }} />New Subject
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Search + filters */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", gap:10 }}>
                <div className="search-wrap" style={{ flex:1, display:"flex", alignItems:"center", gap:10, background:"white", border:"1.5px solid #f0e4e4", borderRadius:12, padding:"0 16px", height:42, transition:"border 0.15s,box-shadow 0.15s" }}>
                  <i className="ti ti-search" style={{ fontSize:15, color:"#c0a0a0", flexShrink:0 }} />
                  <input placeholder="Search by code or name…" value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { setSearch(inputVal); fetchSubjects(1, inputVal, levelFilter); }}}
                    style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0a0a", fontFamily:"'DM Sans',sans-serif", outline:"none" }} />
                  {inputVal && (
                    <button style={{ background:"none", border:"none", cursor:"pointer", color:"#c0a0a0", display:"flex", alignItems:"center", padding:2 }}
                      onClick={() => { setInputVal(""); setSearch(""); fetchSubjects(1, "", levelFilter); }}>
                      <i className="ti ti-x" style={{ fontSize:13 }} />
                    </button>
                  )}
                </div>
                <button style={{ height:42, padding:"0 20px", background:"white", border:"1.5px solid #f0e4e4", borderRadius:12, fontSize:13, fontWeight:600, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.14s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor="#e03131"; e.currentTarget.style.color="#e03131"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor="#f0e4e4"; e.currentTarget.style.color="#7a5050"; }}
                  onClick={() => { setSearch(inputVal); fetchSubjects(1, inputVal, levelFilter); }}>
                  Search
                </button>
              </div>

              {/* Level filter chips */}
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                <button className={`chip-btn${levelFilter==="all"?" active":""}`} onClick={() => { setLevelFilter("all"); fetchSubjects(1, inputVal, "all"); }}>
                  All Subjects
                  {levelFilter==="all" && !loading && <span style={{ background:"#e03131", color:"white", borderRadius:99, fontSize:10, fontWeight:700, padding:"1px 7px", marginLeft:2 }}>{pageMeta.count}</span>}
                </button>
                {SCHOOL_LEVELS.map((lvl) => (
                  <button key={lvl.value} className={`chip-btn${levelFilter===lvl.value?" active":""}`}
                    onClick={() => { setLevelFilter(lvl.value); fetchSubjects(1, inputVal, lvl.value); }}
                    style={{ borderColor: levelFilter===lvl.value ? lvl.color : "#f0e4e4", color: levelFilter===lvl.value ? lvl.color : "#9a7070", background: levelFilter===lvl.value ? lvl.bg : "white" }}>
                    <i className={`ti ${lvl.icon}`} style={{ fontSize:12 }} />
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div style={{ background:"white", border:"1px solid #f5eaea", borderRadius:16, overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:"#fdfafa" }}>
                    {[
                      { label:"Subject",         w:"28%" },
                      { label:"Code",            w:"12%" },
                      { label:"Level",           w:"14%" },
                      { label:"Grade",           w:"11%" },
                      { label:"Strand / Sem",    w:"16%" },
                      { label:"Grading Template",w:"15%" },
                      { label:"",                w:"4%"  },
                    ].map(({ label, w }) => (
                      <th key={label} style={{ textAlign:"left", fontSize:10.5, fontWeight:600, color:"#c0a0a0", padding:"13px 18px", borderBottom:"1px solid #f5eaea", textTransform:"uppercase", letterSpacing:"0.07em", width:w }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>
                          <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <Sk w={32} h={32} r={8} />
                              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                                <Sk w={130} h={13} />
                                <Sk w={80} h={11} />
                              </div>
                            </div>
                          </td>
                          {[70,80,70,100,110,36].map((w, j) => (
                            <td key={j} style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0" }}><Sk w={w} h={13} /></td>
                          ))}
                        </tr>
                      ))
                    : subjects.length === 0
                      ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign:"center", padding:"64px 16px" }}>
                            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                              <div style={{ width:56, height:56, borderRadius:16, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                                <i className="ti ti-book-off" style={{ fontSize:24, color:"#e08080" }} />
                              </div>
                              <div style={{ fontSize:15, color:"#7a5050", fontWeight:600, fontFamily:"'Playfair Display',serif" }}>No subjects found</div>
                              <div style={{ fontSize:12, color:"#b09090" }}>Try a different search or add a new subject</div>
                            </div>
                          </td>
                        </tr>
                      )
                      : subjects.map((sub, idx) => {
                          const lvlMeta = getLevelMeta(sub.school_level);
                          const hasTpl  = sub.grading_template_detail;
                          return (
                            <tr key={sub.subject_id} className="sub-row"
                              style={{ animation:`rowIn 0.2s ease both`, animationDelay:`${idx*20}ms` }}>
                              {/* Subject name */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                  <div style={{ width:34, height:34, borderRadius:9, background:lvlMeta.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                    <i className={`ti ${lvlMeta.icon}`} style={{ fontSize:15, color:lvlMeta.color }} />
                                  </div>
                                  <div>
                                    <div className="sub-name" style={{ fontSize:13, fontWeight:600, color:"#1a0a0a", transition:"color 0.12s" }}>{sub.subject_name}</div>
                                  </div>
                                </div>
                              </td>
                              {/* Code */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                <span style={{ fontFamily:"monospace", fontSize:12, color:"#5a4a4a", background:"#f9f4f4", padding:"3px 8px", borderRadius:6 }}>{sub.subject_code}</span>
                              </td>
                              {/* Level */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, padding:"4px 10px", borderRadius:99, background:lvlMeta.bg, color:lvlMeta.color }}>
                                  <i className={`ti ${lvlMeta.icon}`} style={{ fontSize:11 }} />{lvlMeta.label}
                                </span>
                              </td>
                              {/* Grade */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle", fontSize:13, color:"#5a4a4a" }}>
                                {sub.grade_level}
                              </td>
                              {/* Strand / Sem */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                {sub.strand || sub.semester
                                  ? <div style={{ fontSize:12, color:"#7a5a5a" }}>
                                      {sub.strand && <span style={{ display:"block" }}>{sub.strand}</span>}
                                      {sub.semester && <span style={{ color:"#b09090", fontSize:11 }}>{sub.semester === "1st" ? "1st Semester" : "2nd Semester"}</span>}
                                    </div>
                                  : <span style={{ color:"#d0b8b8", fontStyle:"italic", fontSize:12 }}>—</span>
                                }
                              </td>
                              {/* Grading template */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                {hasTpl
                                  ? <div>
                                      <div style={{ fontSize:12, fontWeight:600, color:"#1a0a0a" }}>{hasTpl.template_name}</div>
                                      <div style={{ fontSize:11, color:"#b09090", marginTop:2 }}>
                                        {hasTpl.components?.length ?? 0} components · {hasTpl.total_weight ?? 0}% total
                                      </div>
                                    </div>
                                  : <span style={{ fontSize:12, color:"#d0b8b8", fontStyle:"italic" }}>No template</span>
                                }
                              </td>
                              {/* Actions */}
                              <td style={{ padding:"13px 14px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }} onClick={(e) => e.stopPropagation()}>
                                <div style={{ display:"flex", gap:4 }}>
                                  <button className="row-action" title="Edit" onClick={() => setModal({ mode:"edit", subject: sub })}>
                                    <i className="ti ti-pencil" style={{ fontSize:13 }} />
                                  </button>
                                  <button className="row-action" title="Delete" style={{ color:"#c09090" }} onClick={() => setToDelete(sub)}>
                                    <i className="ti ti-trash" style={{ fontSize:13 }} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                  }
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!loading && pageMeta.count > 0 && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontSize:12, color:"#b09090" }}>
                  Page <strong style={{ color:"#7a5050" }}>{page}</strong> of <strong style={{ color:"#7a5050" }}>{totalPages||1}</strong> · {pageMeta.count.toLocaleString()} subjects
                </span>
                <div style={{ display:"flex", gap:4 }}>
                  <button className="page-btn" style={pgBtn} disabled={!pageMeta.previous} onClick={() => fetchSubjects(page-1, search, levelFilter)}>
                    <i className="ti ti-chevron-left" style={{ fontSize:13 }} />
                  </button>
                  {Array.from({ length: Math.min(totalPages,5) }, (_, i) => {
                    const start = Math.max(1, page-2);
                    const p = start + i;
                    if (p > totalPages) return null;
                    const isActive = p === page;
                    return (
                      <button key={p} className="page-btn" style={{ ...pgBtn, ...(isActive ? pgBtnActive : {}) }} onClick={() => fetchSubjects(p, search, levelFilter)}>{p}</button>
                    );
                  })}
                  <button className="page-btn" style={pgBtn} disabled={!pageMeta.next} onClick={() => fetchSubjects(page+1, search, levelFilter)}>
                    <i className="ti ti-chevron-right" style={{ fontSize:13 }} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal && (
        <SubjectModal
          subject={modal.mode === "edit" ? modal.subject : null}
          templates={templates}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
      {toDelete && (
        <DeleteModal subject={toDelete} onConfirm={handleDelete} onCancel={() => setToDelete(null)} />
      )}
    </>
  );
}

const pgBtn = {
  width:32, height:32, border:"1px solid #f0e4e4", borderRadius:8,
  background:"white", display:"flex", alignItems:"center", justifyContent:"center",
  cursor:"pointer", fontSize:12, color:"#9a7070", fontFamily:"'DM Sans',sans-serif", transition:"all 0.12s",
};
const pgBtnActive = {
  background:"#fff0f0", borderColor:"#e03131", color:"#e03131", fontWeight:700,
};
