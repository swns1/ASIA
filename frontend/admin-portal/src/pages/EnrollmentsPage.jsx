import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ── API ───────────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8003/api";

function getToken() {
  return sessionStorage.getItem("access_token") || "";
}

async function apiCall(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

// ── Nav config (same as other pages) ─────────────────────────────────────────
const NAV = [
  {
    section: "Main",
    items: [
      { label: "Dashboard",   icon: "ti-layout-dashboard", path: "/dashboard"      },
      { label: "Students",    icon: "ti-users",             path: "/students"       },
      { label: "Enrollments", icon: "ti-clipboard-list",    path: "/enrollments"    },
      { label: "Grades",      icon: "ti-chart-bar",         path: "/grades"         },
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
      { label: "Users",           icon: "ti-user-cog", path: "/users"    },
      { label: "School Settings", icon: "ti-settings", path: "/settings" },
    ],
  },
];

// ── Constants ─────────────────────────────────────────────────────────────────
const SCHOOL_LEVELS = [
  { value: "",                  label: "All Levels"        },
  { value: "nursery",           label: "Nursery"           },
  { value: "kindergarten",      label: "Kindergarten"      },
  { value: "elementary",        label: "Elementary"        },
  { value: "junior_highschool", label: "Junior High School"},
  { value: "senior_highschool", label: "Senior High School"},
];

const GRADE_LEVELS_BY_LEVEL = {
  "":                ["All Grades"],
  nursery:           ["All Grades", "Nursery"],
  kindergarten:      ["All Grades", "Kindergarten"],
  elementary:        ["All Grades", "Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"],
  junior_highschool: ["All Grades", "Grade 7","Grade 8","Grade 9","Grade 10"],
  senior_highschool: ["All Grades", "Grade 11","Grade 12"],
};

const STATUS_META = {
  enrolled:  { bg: "#e8f5e0", color: "#2e6b0d", dot: "#4caf50", label: "Enrolled"  },
  pending:   { bg: "#fef3e2", color: "#7a4a08", dot: "#ff9800", label: "Pending"   },
  cancelled: { bg: "#fde8e8", color: "#9b2020", dot: "#f44336", label: "Cancelled" },
  completed: { bg: "#e3f0fd", color: "#1455a0", dot: "#2196f3", label: "Completed" },
};

const LEVEL_ICONS = {
  nursery:           "ti-baby-carriage",
  kindergarten:      "ti-star",
  elementary:        "ti-book",
  junior_highschool: "ti-school",
  senior_highschool: "ti-certificate",
};

function buildSchoolYearOptions() {
  const d = new Date();
  const base = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  const opts = [{ value: "", label: "All Years" }];
  for (let i = 1; i >= -2; i--) {
    const y = base + i;
    opts.push({ value: `${y}-${y + 1}`, label: `${y}-${y + 1}` });
  }
  return opts;
}

const PALETTES = [
  { bg: "#fde8e8", color: "#c0392b" }, { bg: "#e8f0fd", color: "#2563eb" },
  { bg: "#e8fdf0", color: "#16a34a" }, { bg: "#fdf5e8", color: "#d97706" },
  { bg: "#f0e8fd", color: "#7c3aed" }, { bg: "#fde8f8", color: "#be185d" },
  { bg: "#e8fdfd", color: "#0891b2" },
];
const getPalette = (name = "X") => PALETTES[name.charCodeAt(0) % PALETTES.length];

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: "linear-gradient(90deg, #f0e8e8 25%, #fde8e8 50%, #f0e8e8 75%)",
    backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite",
  }} />
);

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
export default function EnrollmentsPage() {
  const navigate = useNavigate();
  const token = sessionStorage.getItem("access_token");

  const [enrollments, setEnrollments]   = useState([]);
  const [loading,     setLoading]       = useState(true);
  const [page,        setPage]          = useState(1);
  const [pageMeta,    setPageMeta]      = useState({ count: 0, next: null, previous: null });

  // Filters
  const [schoolYear,   setSchoolYear]   = useState("");
  const [schoolLevel,  setSchoolLevel]  = useState("");
  const [gradeLevel,   setGradeLevel]   = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search,       setSearch]       = useState("");
  const [searchInput,  setSearchInput]  = useState("");

  const schoolYearOptions = buildSchoolYearOptions();
  const gradeOptions      = GRADE_LEVELS_BY_LEVEL[schoolLevel] ?? ["All Grades"];

  // Reset grade when level changes
  useEffect(() => { setGradeLevel(""); }, [schoolLevel]);

  const fetchEnrollments = useCallback(async (pg = 1) => {
    if (!token) { navigate("/"); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg });
      if (schoolYear)   params.set("school_year",        schoolYear);
      if (schoolLevel)  params.set("school_level",       schoolLevel);
      if (gradeLevel)   params.set("grade_level",        gradeLevel);
      if (statusFilter) params.set("enrollment_status",  statusFilter);
      if (search)       params.set("search",             search);

      const data = await apiCall(`${API_BASE}/enrollments/?${params}`);
      setEnrollments(data.results ?? []);
      setPageMeta({ count: data.count, next: data.next, previous: data.previous });
      setPage(pg);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, schoolYear, schoolLevel, gradeLevel, statusFilter, search, navigate]);

  useEffect(() => { fetchEnrollments(1); }, [fetchEnrollments]);

  const handleSearch = () => { setSearch(searchInput); };
  const clearFilters = () => {
    setSchoolYear(""); setSchoolLevel(""); setGradeLevel("");
    setStatusFilter(""); setSearch(""); setSearchInput("");
  };

  const hasFilters = schoolYear || schoolLevel || gradeLevel || statusFilter || search;
  const totalPages = Math.ceil(pageMeta.count / 20);

  return (
    <>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes rowIn   { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:translateX(0)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }

        .nav-item { transition:background .12s,color .12s; }
        .nav-item:hover { background:#fff4f4 !important; color:#e03131 !important; }
        .nav-active { background:#fff0f0 !important; color:#e03131 !important; font-weight:600 !important; }

        .enroll-row { transition:background .12s; cursor:pointer; }
        .enroll-row:hover td { background:#fff8f6 !important; }
        .enroll-row:hover .row-name { color:#e03131 !important; }

        .filter-chip { transition:all .14s; cursor:pointer; border:1.5px solid #f0e4e4; background:white; font-family:'DM Sans',sans-serif; }
        .filter-chip:hover { border-color:#fca5a5; color:#e03131; background:#fff8f6; }
        .filter-chip.active { background:#fff0f0; border-color:#e03131; color:#e03131; font-weight:700; }

        .new-btn { transition:all .16s; }
        .new-btn:hover { background:#c92a2a !important; box-shadow:0 8px 28px rgba(224,49,49,0.32) !important; transform:translateY(-1px); }

        .page-btn:hover:not(:disabled) { background:#fff0f0 !important; border-color:#e03131 !important; color:#e03131 !important; }
        .page-btn:disabled { opacity:.3; cursor:not-allowed; }

        .search-wrap:focus-within { border-color:#e03131 !important; box-shadow:0 0 0 3px rgba(224,49,49,0.09) !important; }
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
                <div style={{ fontSize:13, fontWeight:700, color:"#1a0a0a", letterSpacing:"-0.01em" }}>South Lakes IS</div>
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
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:9, fontSize:13, color: active ? "#e03131" : "#7a5a5a", cursor:"pointer" }}
                      onClick={() => navigate(item.path)} role="button" tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && navigate(item.path)}>
                      <i className={`ti ${item.icon}`} style={{ fontSize:16, width:20, textAlign:"center" }} />{item.label}
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
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif", letterSpacing:"-0.01em" }}>Enrollments</div>
              <div style={{ fontSize:11.5, color:"#b09090", marginTop:1 }}>
                {loading ? "Loading…" : `${pageMeta.count.toLocaleString()} enrollment${pageMeta.count !== 1 ? "s" : ""} found`}
              </div>
            </div>
            <button className="new-btn"
              style={{ display:"flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.26)", letterSpacing:"0.01em" }}
              onClick={() => navigate("/enrollments/new")}>
              <i className="ti ti-clipboard-plus" style={{ fontSize:15 }} />New Enrollment
            </button>
          </div>

          {/* Content */}
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 }}>

            {/* ── Filter panel ── */}
            <div style={{ background:"white", border:"1px solid #f5eaea", borderRadius:14, padding:"18px 20px", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", display:"flex", flexDirection:"column", gap:14 }}>

              {/* Row 1: Search + School Year */}
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                {/* Search */}
                <div className="search-wrap"
                  style={{ flex:1, minWidth:220, display:"flex", alignItems:"center", gap:10, background:"white", border:"1.5px solid #f0e4e4", borderRadius:10, padding:"0 14px", height:40, transition:"border .15s,box-shadow .15s" }}>
                  <i className="ti ti-search" style={{ fontSize:14, color:"#c0a0a0", flexShrink:0 }} />
                  <input placeholder="Search student name or section…" value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0a0a", fontFamily:"'DM Sans',sans-serif", outline:"none" }} />
                  {searchInput && (
                    <button onClick={() => { setSearchInput(""); setSearch(""); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#c0a0a0", display:"flex" }}>
                      <i className="ti ti-x" style={{ fontSize:13 }} />
                    </button>
                  )}
                </div>
                <button onClick={handleSearch}
                  style={{ height:40, padding:"0 18px", background:"white", border:"1.5px solid #f0e4e4", borderRadius:10, fontSize:13, fontWeight:600, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor="#e03131"; e.currentTarget.style.color="#e03131"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor="#f0e4e4"; e.currentTarget.style.color="#7a5050"; }}>
                  Search
                </button>

                {/* School Year */}
                <select value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)}
                  style={{ height:40, padding:"0 12px", border:"1.5px solid #f0e4e4", borderRadius:10, fontSize:13, color:"#5a4a4a", fontFamily:"'DM Sans',sans-serif", background:"white", cursor:"pointer", outline:"none" }}>
                  {schoolYearOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                {hasFilters && (
                  <button onClick={clearFilters}
                    style={{ height:40, padding:"0 14px", border:"1.5px solid #f0e4e4", borderRadius:10, fontSize:12, color:"#a07070", cursor:"pointer", background:"white", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:6 }}>
                    <i className="ti ti-x" style={{ fontSize:13 }} />Clear
                  </button>
                )}
              </div>

              {/* Row 2: School level chips */}
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:"#c0a0a0", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>School Level</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {SCHOOL_LEVELS.map((lvl) => (
                    <button key={lvl.value} className={`filter-chip${schoolLevel === lvl.value ? " active" : ""}`}
                      onClick={() => setSchoolLevel(lvl.value)}
                      style={{ display:"inline-flex", alignItems:"center", gap:6, height:32, padding:"0 14px", borderRadius:99, fontSize:12 }}>
                      {lvl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 3: Grade level chips (cascades from school level) */}
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:"#c0a0a0", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Grade Level</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {gradeOptions.map((g) => {
                    const val = g === "All Grades" ? "" : g;
                    return (
                      <button key={g} className={`filter-chip${gradeLevel === val ? " active" : ""}`}
                        onClick={() => setGradeLevel(val)}
                        style={{ display:"inline-flex", alignItems:"center", gap:6, height:32, padding:"0 14px", borderRadius:99, fontSize:12 }}>
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 4: Status chips */}
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:"#c0a0a0", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Status</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {[{ value:"", label:"All" }, ...Object.entries(STATUS_META).map(([v, m]) => ({ value: v, label: m.label }))].map((s) => (
                    <button key={s.value} className={`filter-chip${statusFilter === s.value ? " active" : ""}`}
                      onClick={() => setStatusFilter(s.value)}
                      style={{ display:"inline-flex", alignItems:"center", gap:6, height:32, padding:"0 14px", borderRadius:99, fontSize:12 }}>
                      {s.value && <span style={{ width:7, height:7, borderRadius:"50%", background: statusFilter === s.value ? "#e03131" : STATUS_META[s.value]?.dot, flexShrink:0 }} />}
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Table ── */}
            <div style={{ background:"white", border:"1px solid #f5eaea", borderRadius:16, overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:"#fdfafa" }}>
                    {[
                      { label:"Student",    w:"28%" },
                      { label:"Level",      w:"16%" },
                      { label:"Grade",      w:"12%" },
                      { label:"Section",    w:"12%" },
                      { label:"School Year",w:"13%" },
                      { label:"Status",     w:"11%" },
                      { label:"",           w:"8%"  },
                    ].map(({ label, w }) => (
                      <th key={label} style={{ textAlign:"left", fontSize:10.5, fontWeight:600, color:"#c0a0a0", padding:"13px 18px", borderBottom:"1px solid #f5eaea", textTransform:"uppercase", letterSpacing:"0.07em", width:w }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>
                          <td style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <Sk w={36} h={36} r={99} /><div style={{ display:"flex", flexDirection:"column", gap:6 }}><Sk w={120} h={13} /><Sk w={80} h={11} /></div>
                            </div>
                          </td>
                          {[80, 70, 70, 80, 60, 40].map((w, j) => (
                            <td key={j} style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0" }}><Sk w={w} h={13} /></td>
                          ))}
                        </tr>
                      ))
                    : enrollments.length === 0
                      ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign:"center", padding:"64px 16px" }}>
                            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                              <div style={{ width:56, height:56, borderRadius:16, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                                <i className="ti ti-clipboard-off" style={{ fontSize:24, color:"#e08080" }} />
                              </div>
                              <div style={{ fontSize:15, color:"#7a5050", fontWeight:600, fontFamily:"'Playfair Display',serif" }}>No enrollments found</div>
                              <div style={{ fontSize:12, color:"#b09090" }}>Try adjusting your filters or enroll a new student</div>
                              <button onClick={() => navigate("/enrollments/new")}
                                style={{ marginTop:8, padding:"9px 20px", background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:99, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                                + New Enrollment
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                      : enrollments.map((en, idx) => {
                          const name = en.student_name ?? `Student #${en.student}`;
                          const palette = getPalette(name);
                          const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                          const pill = STATUS_META[en.enrollment_status] ?? STATUS_META.pending;
                          const levelIcon = LEVEL_ICONS[en.school_level] ?? "ti-school";
                          return (
                            <tr key={en.enrollment_id} className="enroll-row"
                              style={{ animation:`rowIn 0.2s ease both`, animationDelay:`${idx * 20}ms` }}
                              onClick={() => navigate(`/enrollments/${en.enrollment_id}/edit`)}>

                              {/* Student */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                  <div style={{ width:36, height:36, borderRadius:"50%", background:palette.bg, color:palette.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>{initials || "?"}</div>
                                  <div>
                                    <div className="row-name" style={{ fontSize:13, fontWeight:600, color:"#1a0a0a", transition:"color .12s" }}>{name}</div>
                                    <div style={{ fontSize:11, color:"#b09090", marginTop:2 }}>ID #{en.enrollment_id}</div>
                                  </div>
                                </div>
                              </td>

                              {/* Level */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                  <i className={`ti ${levelIcon}`} style={{ fontSize:14, color:"#e03131" }} />
                                  <span style={{ fontSize:12, color:"#5a4a4a" }}>
                                    {SCHOOL_LEVELS.find((l) => l.value === en.school_level)?.label ?? en.school_level}
                                  </span>
                                </div>
                              </td>

                              {/* Grade */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                <span style={{ fontSize:12, color:"#5a4a4a", fontWeight:500 }}>{en.grade_level}</span>
                              </td>

                              {/* Section */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                <span style={{ fontSize:12, color:"#5a4a4a" }}>{en.section}</span>
                              </td>

                              {/* School Year */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                <span style={{ fontSize:12, fontFamily:"monospace", color:"#5a4a4a", background:"#f9f4f4", padding:"3px 8px", borderRadius:6 }}>{en.school_year}</span>
                              </td>

                              {/* Status */}
                              <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                                <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, padding:"4px 10px", borderRadius:99, background:pill.bg, color:pill.color }}>
                                  <span style={{ width:6, height:6, borderRadius:"50%", background:pill.dot }} />{pill.label}
                                </span>
                              </td>

                              {/* Edit action */}
                              <td style={{ padding:"13px 14px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}
                                onClick={(e) => e.stopPropagation()}>
                                <button title="Edit"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/enrollments/${en.enrollment_id}/edit`); }}
                                  style={{ width:30, height:30, border:"1px solid #f0e4e4", borderRadius:8, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070", transition:"all .12s" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background="#fff0f0"; e.currentTarget.style.color="#e03131"; e.currentTarget.style.borderColor="#fca5a5"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background="white"; e.currentTarget.style.color="#9a7070"; e.currentTarget.style.borderColor="#f0e4e4"; }}>
                                  <i className="ti ti-pencil" style={{ fontSize:13 }} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                  }
                </tbody>
              </table>
            </div>

            {/* ── Pagination ── */}
            {!loading && pageMeta.count > 0 && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontSize:12, color:"#b09090" }}>
                  Page <strong style={{ color:"#7a5050" }}>{page}</strong> of <strong style={{ color:"#7a5050" }}>{totalPages || 1}</strong>
                  &nbsp;·&nbsp;{pageMeta.count.toLocaleString()} total records
                </span>
                <div style={{ display:"flex", gap:4 }}>
                  <button className="page-btn" style={pgBtn} disabled={!pageMeta.previous} onClick={() => fetchEnrollments(page - 1)}>
                    <i className="ti ti-chevron-left" style={{ fontSize:13 }} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const start = Math.max(1, page - 2);
                    const p = start + i;
                    if (p > totalPages) return null;
                    const isActive = p === page;
                    return (
                      <button key={p} className="page-btn" style={{ ...pgBtn, ...(isActive ? pgActive : {}) }} onClick={() => fetchEnrollments(p)}>{p}</button>
                    );
                  })}
                  <button className="page-btn" style={pgBtn} disabled={!pageMeta.next} onClick={() => fetchEnrollments(page + 1)}>
                    <i className="ti ti-chevron-right" style={{ fontSize:13 }} />
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

const pgBtn = {
  width:32, height:32, border:"1px solid #f0e4e4", borderRadius:8, background:"white",
  display:"flex", alignItems:"center", justifyContent:"center",
  cursor:"pointer", fontSize:12, color:"#9a7070",
  fontFamily:"'DM Sans',sans-serif", transition:"all .12s",
};
const pgActive = {
  background:"#fff0f0", borderColor:"#e03131", color:"#e03131", fontWeight:700,
};
