import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import AIInsightPanel, { callGemini } from "../components/AIInsightPanel";

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

const getStudents     = (p = {}) => apiCall("GET",    `${AUTH_API}/api/students/?${new URLSearchParams(p)}`);
const getEnrollments  = (p = {}) => apiCall("GET",    `${API_BASE}/enrollments/?${new URLSearchParams(p)}`);
const getSubjects     = (p = {}) => apiCall("GET",    `${API_BASE}/subjects/?${new URLSearchParams(p)}`);
const getGrades       = (p = {}) => apiCall("GET",    `${API_BASE}/grades/?${new URLSearchParams(p)}`);
const getScoreEntries = (p = {}) => apiCall("GET",    `${API_BASE}/score-entries/?${new URLSearchParams(p)}`);
const createScore     = (p)      => apiCall("POST",   `${API_BASE}/score-entries/`, p);
const updateScore     = (id, p)  => apiCall("PATCH",  `${API_BASE}/score-entries/${id}/`, p);
const deleteScore     = (id)     => apiCall("DELETE", `${API_BASE}/score-entries/${id}/`);
const computeGrade    = (p = {}) => apiCall("GET",    `${API_BASE}/score-entries/compute/?${new URLSearchParams(p)}`);
const saveGrade       = (p)      => apiCall("POST",   `${API_BASE}/grades/`, p);
const updateGrade     = (id, p)  => apiCall("PATCH",  `${API_BASE}/grades/${id}/`, p);

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab() {
  const [filters, setFilters] = useState({ school_year:"", school_level:"", grade_level:"", section:"", grading_period:"", remarks:"" });
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState("avg");
  const [sortDir, setSortDir] = useState("asc");
  const [search,  setSearch]  = useState("");

  const GRADE_LEVELS = {
    nursery:           ["Nursery"],
    kindergarten:      ["Kindergarten"],
    elementary:        ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"],
    junior_highschool: ["Grade 7","Grade 8","Grade 9","Grade 10"],
    senior_highschool: ["Grade 11","Grade 12"],
  };

  const gradeLevelOptions = filters.school_level ? (GRADE_LEVELS[filters.school_level] ?? []) : [];
  const periodOptions = filters.school_level
    ? (GRADING_PERIODS_BY_LEVEL[filters.school_level] ?? [])
    : ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter","1st_semester","2nd_semester"];

  const canFetch = filters.school_year || filters.school_level || filters.grade_level || filters.section;

  useEffect(() => {
    if (!canFetch) { setRows([]); return; }
    setLoading(true);
    const params = { page_size: 200, enrollment_status: "enrolled" };
    if (filters.school_year)   params.school_year   = filters.school_year;
    if (filters.school_level)  params.school_level  = filters.school_level;
    if (filters.grade_level)   params.grade_level   = filters.grade_level;
    if (filters.section)       params.section       = filters.section;

    getEnrollments(params)
      .then(async (d) => {
        const enrollments = Array.isArray(d) ? d : d?.results ?? [];
        const gradeParams = {};
        if (filters.grading_period) gradeParams.grading_period = filters.grading_period;
        if (filters.remarks)        gradeParams.remarks        = filters.remarks;

        const gradeResults = await Promise.all(
          enrollments.map((en) =>
            getGrades({ enrollment: en.enrollment_id, page_size: 200, ...gradeParams })
              .then((g) => Array.isArray(g) ? g : g?.results ?? [])
              .catch(() => [])
          )
        );

        const built = enrollments.map((en, i) => {
          const grades  = gradeResults[i];
          const nums    = grades.map((g) => parseFloat(g.numeric_grade)).filter((n) => !isNaN(n));
          const avg     = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
          const passed  = grades.filter((g) => g.remarks === "passed"  || parseFloat(g.numeric_grade) >= 75).length;
          const failed  = grades.filter((g) => g.remarks === "failed"  || parseFloat(g.numeric_grade) <  75).length;
          const sd      = en.student_detail ?? {};
          const name    = sd.full_name ?? [sd.first_name, sd.middle_name, sd.last_name, sd.suffix].filter(Boolean).join(" ");
          return { enrollment_id: en.enrollment_id, name, lrn: sd.lrn, student_number: sd.student_number, grade_level: en.grade_level, section: en.section, school_year: en.school_year, school_level: en.school_level, avg, passed, failed, total: grades.length };
        });

        if (filters.remarks) {
          setRows(built.filter((r) => {
            if (filters.remarks === "passed") return r.avg !== null && r.avg >= 75;
            if (filters.remarks === "failed") return r.avg !== null && r.avg <  75;
            return true;
          }));
        } else {
          setRows(built);
        }
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [filters, canFetch]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.lrn?.includes(q) || r.student_number?.toLowerCase().includes(q));
  }, [rows, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (av === null || av === undefined) av = sortDir === "asc" ? Infinity : -Infinity;
      if (bv === null || bv === undefined) bv = sortDir === "asc" ? Infinity : -Infinity;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <i className="ti ti-selector" style={{ fontSize:11, color:"#d0b8b8", marginLeft:4 }} />;
    return <i className={`ti ti-sort-${sortDir === "asc" ? "ascending" : "descending"}`} style={{ fontSize:11, color:"#e03131", marginLeft:4 }} />;
  };

  const sel = { height:34, border:"1.5px solid #f0e4e4", borderRadius:9, padding:"0 10px", fontSize:12, fontFamily:"'DM Sans',sans-serif", color:"#3a2a2a", background:"white", outline:"none", cursor:"pointer" };

  const passedCount  = rows.filter((r) => r.avg !== null && r.avg >= 75).length;
  const failedCount  = rows.filter((r) => r.avg !== null && r.avg <  75).length;
  const noGradeCount = rows.filter((r) => r.avg === null).length;
  const overallMean  = (() => { const n = rows.filter((r) => r.avg !== null); return n.length > 0 ? n.reduce((s, r) => s + r.avg, 0) / n.length : null; })();

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* Filters */}
      <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"16px 20px", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#b09090", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>Filter Students</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"flex-end" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <label style={{ fontSize:11, color:"#b09090", fontWeight:600 }}>School Year</label>
            <input value={filters.school_year} onChange={(e) => setFilters((f) => ({ ...f, school_year: e.target.value, grade_level:"" }))}
              placeholder="e.g. 2024-2025" style={{ ...sel, width:130 }} />
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <label style={{ fontSize:11, color:"#b09090", fontWeight:600 }}>Level</label>
            <select value={filters.school_level} onChange={(e) => setFilters((f) => ({ ...f, school_level: e.target.value, grade_level:"" }))} style={{ ...sel, width:140 }}>
              <option value="">All levels</option>
              {Object.entries(SCHOOL_LEVEL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <label style={{ fontSize:11, color:"#b09090", fontWeight:600 }}>Grade Level</label>
            <select value={filters.grade_level} onChange={(e) => setFilters((f) => ({ ...f, grade_level: e.target.value }))} style={{ ...sel, width:130 }} disabled={gradeLevelOptions.length === 0}>
              <option value="">All grades</option>
              {gradeLevelOptions.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <label style={{ fontSize:11, color:"#b09090", fontWeight:600 }}>Section</label>
            <input value={filters.section} onChange={(e) => setFilters((f) => ({ ...f, section: e.target.value }))}
              placeholder="e.g. Rizal" style={{ ...sel, width:110 }} />
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <label style={{ fontSize:11, color:"#b09090", fontWeight:600 }}>Period</label>
            <select value={filters.grading_period} onChange={(e) => setFilters((f) => ({ ...f, grading_period: e.target.value }))} style={{ ...sel, width:130 }}>
              <option value="">All periods</option>
              {periodOptions.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
            </select>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <label style={{ fontSize:11, color:"#b09090", fontWeight:600 }}>Status</label>
            <select value={filters.remarks} onChange={(e) => setFilters((f) => ({ ...f, remarks: e.target.value }))} style={{ ...sel, width:110 }}>
              <option value="">All</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          {canFetch && (
            <button onClick={() => setFilters({ school_year:"", school_level:"", grade_level:"", section:"", grading_period:"", remarks:"" })}
              style={{ height:34, padding:"0 14px", border:"1px solid #f0e4e4", borderRadius:9, background:"white", fontSize:12, color:"#9a7070", fontFamily:"'DM Sans',sans-serif", cursor:"pointer", marginTop:18 }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      {rows.length > 0 && !loading && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, animation:"fadeUp 0.2s ease both" }}>
          {[
            { label:"Total Students",  value:rows.length,             color:"#e03131", bg:"#fff0f0", icon:"ti-users"         },
            { label:"Passing",         value:passedCount,             color:"#2e6b0d", bg:"#e8f5e0", icon:"ti-circle-check"  },
            { label:"Failing",         value:failedCount,             color:"#9b2020", bg:"#fde8e8", icon:"ti-circle-x"      },
            { label:"No Grades Yet",   value:noGradeCount,            color:"#854f0b", bg:"#faeeda", icon:"ti-alert-triangle" },
          ].map((s) => (
            <div key={s.label} style={{ background:"white", borderRadius:14, border:"1px solid #f5eaea", padding:"14px 16px", display:"flex", alignItems:"center", gap:12, boxShadow:"0 2px 8px rgba(224,49,49,0.04)" }}>
              <div style={{ width:36, height:36, borderRadius:10, background:s.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <i className={`ti ${s.icon}`} style={{ fontSize:17, color:s.color }} />
              </div>
              <div>
                <div style={{ fontSize:20, fontWeight:700, color:"#1a0a0a", lineHeight:1 }}>{s.value}</div>
                <div style={{ fontSize:10, color:"#a07878", marginTop:3, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}>

        {/* Table toolbar */}
        <div style={{ padding:"14px 20px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, background:"linear-gradient(to right,#fdfafa,white)" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>
            {loading ? "Loading…" : canFetch ? `${sorted.length} student${sorted.length !== 1 ? "s" : ""}` : "Set a filter to load students"}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {overallMean !== null && (
              <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 12px", borderRadius:8, background:gradeStyle(overallMean).bg }}>
                <span style={{ fontSize:11, color:"#b09090", fontWeight:600 }}>Class avg</span>
                <span style={{ fontSize:14, fontWeight:700, color:gradeStyle(overallMean).color }}>{overallMean.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display:"flex", alignItems:"center", gap:8, background:"#fdfafa", border:"1px solid #f0e4e4", borderRadius:9, padding:"0 12px", height:34 }}>
              <i className="ti ti-search" style={{ fontSize:13, color:"#c0a0a0" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or LRN…"
                style={{ border:"none", background:"transparent", fontSize:12, color:"#1a0a0a", outline:"none", fontFamily:"'DM Sans',sans-serif", width:160 }} />
            </div>
          </div>
        </div>

        {/* Empty / prompt state */}
        {!loading && !canFetch && (
          <div style={{ padding:"60px 24px", textAlign:"center" }}>
            <div style={{ width:56, height:56, borderRadius:16, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
              <i className="ti ti-filter" style={{ fontSize:24, color:"#e08080" }} />
            </div>
            <div style={{ fontSize:15, color:"#7a5050", fontWeight:600 }}>Apply a filter to get started</div>
            <div style={{ fontSize:13, color:"#b09090", marginTop:6 }}>Select a school year, level, or section above to load the student grade overview.</div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:10 }}>
            {[1,2,3,4,5,6].map((i) => (
              <div key={i} style={{ display:"flex", gap:12, alignItems:"center" }}>
                <Sk w={32} h={32} r={8} />
                <Sk w="22%" h={13} />
                <Sk w="12%" h={13} />
                <Sk w="10%" h={13} />
                <Sk w="10%" h={13} />
                <Sk w="8%"  h={22} r={99} />
              </div>
            ))}
          </div>
        )}

        {/* Data table */}
        {!loading && canFetch && sorted.length > 0 && (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#fdfafa" }}>
                  <th style={{ ...thStyle, textAlign:"left", paddingLeft:20 }}>Student</th>
                  <th style={{ ...thStyle, cursor:"pointer" }} onClick={() => toggleSort("grade_level")}>Grade / Section <SortIcon k="grade_level" /></th>
                  <th style={{ ...thStyle, cursor:"pointer" }} onClick={() => toggleSort("total")}>Grades <SortIcon k="total" /></th>
                  <th style={{ ...thStyle, cursor:"pointer" }} onClick={() => toggleSort("passed")}>Passed <SortIcon k="passed" /></th>
                  <th style={{ ...thStyle, cursor:"pointer" }} onClick={() => toggleSort("failed")}>Failed <SortIcon k="failed" /></th>
                  <th style={{ ...thStyle, cursor:"pointer", background:"#f9f4f4" }} onClick={() => toggleSort("avg")}>Average <SortIcon k="avg" /></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, idx) => {
                  const gs  = gradeStyle(r.avg);
                  const pal = getPalette(r.name.split(" ").pop() ?? "X");
                  const ini = r.name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                  return (
                    <tr key={r.enrollment_id} style={{ animation:`rowIn 0.15s ease both`, animationDelay:`${idx * 15}ms` }}
                      onMouseEnter={(e) => Array.from(e.currentTarget.cells).forEach((c) => c.style.background = "#fff8f6")}
                      onMouseLeave={(e) => Array.from(e.currentTarget.cells).forEach((c, i) => c.style.background = i === 5 ? "#fdfafa" : "")}>
                      <td style={{ ...tdStyle, textAlign:"left", paddingLeft:20 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:8, background:pal.bg, color:pal.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>{ini}</div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{r.name}</div>
                            <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>LRN {r.lrn} · {r.student_number}</div>
                          </div>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontSize:12, fontWeight:600, color:"#1a0a0a" }}>{r.grade_level}</div>
                        <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>{r.section}</div>
                      </td>
                      <td style={tdStyle}><span style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{r.total}</span></td>
                      <td style={tdStyle}><span style={{ fontSize:13, fontWeight:700, color:"#2e6b0d" }}>{r.passed}</span></td>
                      <td style={tdStyle}><span style={{ fontSize:13, fontWeight:700, color: r.failed > 0 ? "#9b2020" : "#b09090" }}>{r.failed}</span></td>
                      <td style={{ ...tdStyle, background:"#fdfafa" }}>
                        {r.avg !== null
                          ? <span style={{ fontSize:13, fontWeight:700, padding:"3px 12px", borderRadius:8, background:gs.bg, color:gs.color }}>{r.avg.toFixed(2)}</span>
                          : <span style={{ fontSize:12, color:"#c0a0a0", fontStyle:"italic" }}>No grades</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* No results */}
        {!loading && canFetch && sorted.length === 0 && rows.length === 0 && (
          <div style={{ padding:"60px 24px", textAlign:"center" }}>
            <div style={{ width:56, height:56, borderRadius:16, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
              <i className="ti ti-users" style={{ fontSize:24, color:"#e08080" }} />
            </div>
            <div style={{ fontSize:15, color:"#7a5050", fontWeight:600 }}>No students found</div>
            <div style={{ fontSize:13, color:"#b09090", marginTop:6 }}>Try adjusting the filters above.</div>
          </div>
        )}

        {/* Search filtered to zero */}
        {!loading && canFetch && sorted.length === 0 && rows.length > 0 && (
          <div style={{ padding:"40px 24px", textAlign:"center" }}>
            <div style={{ fontSize:13, color:"#b09090" }}>No students match "<strong>{search}</strong>".</div>
          </div>
        )}

        {/* Legend */}
        {!loading && sorted.length > 0 && (
          <div style={{ padding:"12px 20px", borderTop:"1px solid #f5eaea", display:"flex", gap:14, flexWrap:"wrap", alignItems:"center" }}>
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
        )}
      </div>
    </div>
  );
}

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

const COMPONENT_COLORS = ["#e03131","#1455a0","#2e6b0d","#d97706","#7c3aed","#be185d","#0891b2"];

const PALETTES = [
  { bg:"#fde8e8", color:"#c0392b" },{ bg:"#e8f0fd", color:"#2563eb" },
  { bg:"#e8fdf0", color:"#16a34a" },{ bg:"#fdf5e8", color:"#d97706" },
  { bg:"#f0e8fd", color:"#7c3aed" },{ bg:"#fde8f8", color:"#be185d" },
  { bg:"#e8fdfd", color:"#0891b2" },
];
const getPalette = (name = "X") => PALETTES[name.charCodeAt(0) % PALETTES.length];

// ── Shared styles ─────────────────────────────────────────────────────────────
const thStyle = {
  textAlign:"center", fontSize:10.5, fontWeight:600, color:"#c0a0a0",
  padding:"12px 16px", borderBottom:"1px solid #f5eaea",
  textTransform:"uppercase", letterSpacing:"0.07em",
};
const tdStyle = {
  textAlign:"center", padding:"12px 16px", borderBottom:"1px solid #f9f0f0",
  verticalAlign:"middle", transition:"background 0.1s",
};

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

function gradeColor(g) {
  if (g >= 90) return { color:"#1455a0", bg:"#e3f0fd" };
  if (g >= 75) return { color:"#2e6b0d", bg:"#e8f5e0" };
  if (g >  0)  return { color:"#9b2020", bg:"#fde8e8" };
  return { color:"#7a5050", bg:"#f9f4f4" };
}

// ── Student Picker ────────────────────────────────────────────────────────────
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
        <div style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:6, background:"white", borderRadius:12, border:"1px solid #fde2de", boxShadow:"0 12px 40px rgba(224,49,49,0.14)", maxHeight:280, overflowY:"auto", zIndex:1000 }}>
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

// ── Grade Summary Table ───────────────────────────────────────────────────────
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

function SummaryTable({ enrollment, grades, subjects, loading }) {
  const periods = GRADING_PERIODS_BY_LEVEL[enrollment.school_level] ?? [];
  const lvlMeta = SCHOOL_LEVEL_META[enrollment.school_level] ?? SCHOOL_LEVEL_META.elementary;

  const gradeMap = useMemo(() => {
    const map = {};
    grades.forEach((g) => {
      if (!map[g.subject]) map[g.subject] = {};
      map[g.subject][g.grading_period] = g.numeric_grade;
    });
    return map;
  }, [grades]);

  const periodAverages = useMemo(() => {
    const avgs = {};
    periods.forEach((p) => {
      const vals = subjects.map((s) => gradeMap[s.subject_id]?.[p]).filter((v) => v !== undefined);
      avgs[p] = vals.length > 0 ? vals.reduce((s, v) => s + parseFloat(v), 0) / vals.length : null;
    });
    return avgs;
  }, [gradeMap, subjects, periods]);

  const overallAvg = useMemo(() => {
    const all = grades.map((g) => parseFloat(g.numeric_grade));
    if (all.length === 0) return null;
    return all.reduce((s, g) => s + g, 0) / all.length;
  }, [grades]);

  const overallGs = gradeStyle(overallAvg);

  if (loading) return (
    <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"24px", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
      {[1,2,3,4,5].map((i) => <div key={i} style={{ marginBottom:12 }}><Sk w="100%" h={36} r={8} /></div>)}
    </div>
  );

  return (
    <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)", animation:"fadeUp 0.25s ease both" }}>
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
            {subjects.length > 0 && (
              <tr style={{ background:"#fdfafa", borderTop:"2px solid #f5eaea" }}>
                <td style={{ ...tdStyle, textAlign:"left", fontWeight:700, color:"#1a0a0a", background:"#fdfafa" }}>Period Average</td>
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

// ── Score Row ─────────────────────────────────────────────────────────────────
function ScoreRow({ entry, onUpdate, onDelete, color }) {
  const [editing, setEditing] = useState(false);
  const [label,   setLabel]   = useState(entry.label);
  const [score,   setScore]   = useState(String(entry.score));
  const [max,     setMax]     = useState(String(entry.max_score));
  const [saving,  setSaving]  = useState(false);

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
    if (!label.trim())                        { setError("Label required."); return; }
    if (!score || parseFloat(score) < 0)      { setError("Score required."); return; }
    if (!max   || parseFloat(max)   <= 0)     { setError("Max score required."); return; }
    if (parseFloat(score) > parseFloat(max))  { setError("Score cannot exceed max."); return; }
    setSaving(true); setError("");
    try {
      await createScore({
        enrollment:        enrollmentId,
        subject:           subjectId,
        grading_component: componentId,
        grading_period:    gradingPeriod,
        label:             label.trim(),
        score:             parseFloat(score),
        max_score:         parseFloat(max),
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

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function GradesPage() {
  const location = useLocation();
  const [tab, setTab] = useState(location.pathname === "/grades/entry" ? "entry" : location.pathname === "/grades/summary" ? "summary" : "overview");

  // ── Shared state (student + enrollment) ──────────────────────────────────
  const [student,     setStudent]     = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [enrollment,  setEnrollment]  = useState(null);
  const [loadingEnr,  setLoadingEnr]  = useState(false);

  // ── Summary tab state ────────────────────────────────────────────────────
  const [sumGrades,   setSumGrades]   = useState([]);
  const [sumSubjects, setSumSubjects] = useState([]);
  const [loadingSum,  setLoadingSum]  = useState(false);

  // ── Entry tab state ──────────────────────────────────────────────────────
  const [entSubjects,    setEntSubjects]    = useState([]);
  const [subject,        setSubject]        = useState(null);
  const [gradingPeriod,  setGradingPeriod]  = useState("");
  const [scoreEntries,   setScoreEntries]   = useState([]);
  const [computation,    setComputation]    = useState(null);
  const [existingGrade,  setExistingGrade]  = useState(null);
  const [loadingScores,  setLoadingScores]  = useState(false);
  const [computing,      setComputing]      = useState(false);
  const [savingFinal,    setSavingFinal]    = useState(false);
  const [savedMsg,       setSavedMsg]       = useState("");
  const [entryError,     setEntryError]     = useState("");

  // ── Load enrollments when student changes ──────────────────────────────────
  // Summary loads all enrollments (historical); Entry only loads active ones.
  useEffect(() => {
    if (!student) {
      setEnrollments([]); setEnrollment(null);
      setSumGrades([]); setSumSubjects([]);
      setSubject(null); setEntSubjects([]);
      return;
    }
    setLoadingEnr(true);
    const params = tab === "entry"
      ? { student: student.student_id, enrollment_status: "enrolled", page_size: 20 }
      : { student: student.student_id, page_size: 20 };
    getEnrollments(params)
      .then((d) => setEnrollments(Array.isArray(d) ? d : d?.results ?? []))
      .catch(() => setEnrollments([]))
      .finally(() => setLoadingEnr(false));
  }, [student, tab]);

  // ── Summary: load grades + subjects when enrollment changes ───────────────
  useEffect(() => {
    if (!enrollment) { setSumGrades([]); setSumSubjects([]); return; }
    setLoadingSum(true);
    Promise.all([
      getGrades({ enrollment: enrollment.enrollment_id, page_size: 200 })
        .then((d) => Array.isArray(d) ? d : d?.results ?? []),
      getSubjects({ school_level: enrollment.school_level, grade_level: enrollment.grade_level, page_size: 100 })
        .then((d) => Array.isArray(d) ? d : d?.results ?? []),
    ])
      .then(([g, s]) => { setSumGrades(g); setSumSubjects(s); })
      .catch(() => {})
      .finally(() => setLoadingSum(false));
  }, [enrollment]);

  // ── Entry: load subjects when enrollment changes ──────────────────────────
  useEffect(() => {
    if (!enrollment) { setEntSubjects([]); setSubject(null); return; }
    getSubjects({ school_level: enrollment.school_level, grade_level: enrollment.grade_level, page_size: 100 })
      .then((d) => setEntSubjects(Array.isArray(d) ? d : d?.results ?? []))
      .catch(() => setEntSubjects([]));
    const periods = GRADING_PERIODS_BY_LEVEL[enrollment.school_level] ?? [];
    setGradingPeriod(periods[0] ?? "");
    setSubject(null);
    setComputation(null);
  }, [enrollment]);

  // ── Entry: load scores when subject/period changes ────────────────────────
  const loadScores = useCallback(async () => {
    if (!enrollment || !subject || !gradingPeriod) return;
    setLoadingScores(true);
    try {
      const data = await getScoreEntries({
        enrollment_id:  enrollment.enrollment_id,
        subject_id:     subject.subject_id,
        grading_period: gradingPeriod,
        page_size:      200,
      });
      setScoreEntries(Array.isArray(data) ? data : data?.results ?? []);
      const g = await getGrades({ enrollment: enrollment.enrollment_id, subject: subject.subject_id, grading_period: gradingPeriod });
      setExistingGrade((Array.isArray(g) ? g : g?.results ?? [])[0] ?? null);
      setComputation(null);
    } catch (e) { console.error(e); }
    finally { setLoadingScores(false); }
  }, [enrollment, subject, gradingPeriod]);

  useEffect(() => { loadScores(); }, [loadScores]);

  const handleCompute = async () => {
    if (!enrollment || !subject || !gradingPeriod) return;
    setComputing(true); setEntryError("");
    try {
      const result = await computeGrade({ enrollment_id: enrollment.enrollment_id, subject_id: subject.subject_id, grading_period: gradingPeriod });
      setComputation(result);
    } catch (e) { setEntryError(e.message || "Failed to compute grade."); }
    finally { setComputing(false); }
  };

  const handleSaveFinal = async () => {
    if (!computation) return;
    setSavingFinal(true); setEntryError("");
    try {
      const payload = { enrollment: enrollment.enrollment_id, subject: subject.subject_id, grading_period: gradingPeriod, numeric_grade: computation.final_grade, remarks: computation.remarks };
      if (existingGrade) {
        await updateGrade(existingGrade.grade_id, { numeric_grade: computation.final_grade, remarks: computation.remarks });
      } else {
        await saveGrade(payload);
      }
      setSavedMsg("Final grade saved successfully!");
      setTimeout(() => setSavedMsg(""), 3000);
      await loadScores();
      // Refresh summary grades too
      if (enrollment) {
        getGrades({ enrollment: enrollment.enrollment_id, page_size: 200 })
          .then((d) => setSumGrades(Array.isArray(d) ? d : d?.results ?? []))
          .catch(() => {});
      }
    } catch (e) { setEntryError(e.message || "Failed to save grade."); }
    finally { setSavingFinal(false); }
  };

  const handleUpdateScore = async (id, payload) => { await updateScore(id, payload); await loadScores(); setComputation(null); };
  const handleDeleteScore = async (id) => { await deleteScore(id); await loadScores(); setComputation(null); };

  const periods    = enrollment ? (GRADING_PERIODS_BY_LEVEL[enrollment.school_level] ?? []) : [];
  const template   = subject?.grading_template_detail;
  const components = template?.components ?? [];

  const scoresByComponent = useMemo(() => {
    const map = {};
    scoreEntries.forEach((e) => {
      if (!map[e.grading_component]) map[e.grading_component] = [];
      map[e.grading_component].push(e);
    });
    return map;
  }, [scoreEntries]);

  const gc = computation ? gradeColor(computation.final_grade) : null;

  const palette  = student ? getPalette(student.last_name ?? "X") : null;
  const initials = student ? `${student.first_name?.[0]??""}${student.last_name?.[0]??""}`.toUpperCase() : "";
  const fullName = student ? [student.first_name, student.middle_name, student.last_name, student.suffix].filter(Boolean).join(" ") : "";

  const gradeCount  = sumGrades.length;
  const passedCount = sumGrades.filter((g) => parseFloat(g.numeric_grade) >= 75).length;
  const failedCount = sumGrades.filter((g) => parseFloat(g.numeric_grade) < 75).length;
  const overallAvg  = gradeCount > 0 ? sumGrades.reduce((s, g) => s + parseFloat(g.numeric_grade), 0) / gradeCount : null;

  // ── Left panel (shared) ───────────────────────────────────────────────────
  const leftPanel = (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* Student picker */}
      <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
        <div style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:10 }}>
          {tab === "entry"
            ? <div style={{ width:24, height:24, borderRadius:"50%", background:"#e03131", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"white", flexShrink:0 }}>1</div>
            : <i className="ti ti-user-search" style={{ fontSize:15, color:"#e03131" }} />
          }
          <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>Select Student</span>
        </div>
        <div style={{ padding:"14px 18px" }}>
          <StudentPicker value={student} onChange={(s) => { setStudent(s); setEnrollment(null); setSubject(null); setComputation(null); }} />
        </div>
      </div>

      {/* Student profile card */}
      {student && (
        <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", animation:"fadeUp 0.2s ease both" }}>
          <div style={{ height:4, background:"linear-gradient(to right,#e03131,#ff6b6b,#fca5a5)" }} />
          <div style={{ padding:"16px 18px", display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:48, height:48, borderRadius:"50%", background:palette.bg, color:palette.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:17, flexShrink:0, border:`2px solid ${palette.color}33` }}>{initials}</div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a"}}>{fullName}</div>
              <div style={{ fontSize:12, color:"#b09090", marginTop:2 }}>LRN {student.lrn}</div>
              <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:99, background: student.status==="active"?"#e8f5e0":"#f0ede8", color: student.status==="active"?"#2e6b0d":"#5c5752", marginTop:4, display:"inline-block" }}>
                {student.status}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Enrollment picker (summary tab only — entry has its own step-numbered version) */}
      {tab === "summary" && student && (
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
                    const active  = enrollment?.enrollment_id === en.enrollment_id;
                    return (
                      <button key={en.enrollment_id} className={`enr-chip${active?" active":""}`}
                        onClick={() => { setEnrollment(en); setSubject(null); setComputation(null); }}
                        style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:32, height:32, borderRadius:8, background:active?lvlMeta.bg:"#f9f4f4", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <i className="ti ti-clipboard-list" style={{ fontSize:14, color:active?lvlMeta.color:"#9a7070" }} />
                        </div>
                        <div style={{ minWidth:0, flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>S.Y. {en.school_year}</div>
                          <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>{en.grade_level} · {en.section}</div>
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

      {/* Stats (summary tab only) */}
      {tab === "summary" && enrollment && !loadingSum && sumGrades.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, animation:"fadeUp 0.2s ease both" }}>
          {[
            { label:"Recorded", value:gradeCount,              color:"#e03131", bg:"#fff0f0", icon:"ti-clipboard-check" },
            { label:"Passed",   value:passedCount,             color:"#2e6b0d", bg:"#e8f5e0", icon:"ti-circle-check"   },
            { label:"Failed",   value:failedCount,             color:"#9b2020", bg:"#fde8e8", icon:"ti-circle-x"       },
            { label:"Average",  value:overallAvg?.toFixed(2)??"—", color:"#1455a0", bg:"#e3f0fd", icon:"ti-chart-bar" },
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

      {/* Entry: enrollment (step 2) */}
      {tab === "entry" && student && (
        <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", animation:"fadeUp 0.2s ease both" }}>
          <div style={{ padding:"10px 14px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:20, height:20, borderRadius:"50%", background:"#e03131", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"white", flexShrink:0 }}>2</div>
            <span style={{ fontSize:12, fontWeight:700, color:"#1a0a0a" }}>Select Enrollment</span>
          </div>
          <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:4 }}>
            {loadingEnr
              ? [1,2].map((i) => <div key={i} style={{ padding:"8px 10px", borderRadius:8, border:"1px solid #f5eaea" }}><Sk w="80%" h={12} /><div style={{ marginTop:4 }}><Sk w="50%" h={10} /></div></div>)
              : enrollments.length === 0
                ? <div style={{ fontSize:12, color:"#b09090", textAlign:"center", padding:"10px 0", fontStyle:"italic" }}>No active enrollments found.</div>
                : enrollments.map((en) => {
                    const lvlMeta = SCHOOL_LEVEL_META[en.school_level] ?? SCHOOL_LEVEL_META.elementary;
                    const active  = enrollment?.enrollment_id === en.enrollment_id;
                    return (
                      <button key={en.enrollment_id} className={`enr-chip${active?" active":""}`}
                        onClick={() => { setEnrollment(en); setSubject(null); setComputation(null); }}
                        style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px" }}>
                        <div style={{ width:26, height:26, borderRadius:6, background:active?lvlMeta.bg:"#f9f4f4", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <i className="ti ti-clipboard-list" style={{ fontSize:12, color:active?lvlMeta.color:"#9a7070" }} />
                        </div>
                        <div style={{ minWidth:0, flex:1 }}>
                          <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>S.Y. {en.school_year}</div>
                          <div style={{ fontSize:10, color:"#b09090", marginTop:1 }}>{en.grade_level} · {en.section}</div>
                        </div>
                        <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:99, background:lvlMeta.bg, color:lvlMeta.color, flexShrink:0 }}>
                          {lvlMeta.label}
                        </span>
                      </button>
                    );
                  })
            }
          </div>
        </div>
      )}

      {/* Entry: subject (step 3) */}
      {tab === "entry" && enrollment && (
        <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", animation:"fadeUp 0.2s ease both" }}>
          <div style={{ padding:"10px 14px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:20, height:20, borderRadius:"50%", background:"#e03131", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"white", flexShrink:0 }}>3</div>
            <span style={{ fontSize:12, fontWeight:700, color:"#1a0a0a" }}>Select Subject</span>
          </div>
          <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:4, maxHeight:200, overflowY:"auto" }}>
            {entSubjects.length === 0
              ? <div style={{ fontSize:12, color:"#b09090", textAlign:"center", padding:"10px 0", fontStyle:"italic" }}>No subjects for this level.</div>
              : entSubjects.map((sub) => (
                  <button key={sub.subject_id} className={`subject-chip${subject?.subject_id===sub.subject_id?" active":""}`}
                    onClick={() => { setSubject(sub); setComputation(null); }}
                    style={{ padding:"7px 10px", textAlign:"left" }}>
                    <div style={{ minWidth:0, width:"100%" }}>
                      <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sub.subject_name}</div>
                      <div style={{ fontSize:10, color:"#b09090", marginTop:1 }}>
                        {sub.subject_code}
                        {sub.grading_template_detail ? ` · ${sub.grading_template_detail.template_name}` : " · No template"}
                      </div>
                    </div>
                  </button>
                ))
            }
          </div>
        </div>
      )}

      {/* Entry: period (step 4) */}
      {tab === "entry" && subject && (
        <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", animation:"fadeUp 0.2s ease both" }}>
          <div style={{ padding:"10px 14px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:20, height:20, borderRadius:"50%", background:"#e03131", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"white", flexShrink:0 }}>4</div>
            <span style={{ fontSize:12, fontWeight:700, color:"#1a0a0a" }}>Grading Period</span>
          </div>
          <div style={{ padding:"10px 14px", display:"flex", flexWrap:"wrap", gap:6 }}>
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
  );

  // ── Summary right panel ───────────────────────────────────────────────────
  const summaryPanel = !student ? (
    <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"80px 24px", textAlign:"center", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
      <div style={{ width:60, height:60, borderRadius:18, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
        <i className="ti ti-table" style={{ fontSize:28, color:"#e08080" }} />
      </div>
      <div style={{ fontSize:16, color:"#7a5050", fontWeight:600 }}>No student selected</div>
      <div style={{ fontSize:13, color:"#b09090", marginTop:6 }}>Search for a student on the left to view their grade report.</div>
    </div>
  ) : !enrollment ? (
    <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"80px 24px", textAlign:"center", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
      <div style={{ width:60, height:60, borderRadius:18, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
        <i className="ti ti-clipboard-list" style={{ fontSize:28, color:"#e08080" }} />
      </div>
      <div style={{ fontSize:16, color:"#7a5050", fontWeight:600 }}>Select a school year</div>
      <div style={{ fontSize:13, color:"#b09090", marginTop:6 }}>Pick an enrollment from the left to see the grade table.</div>
    </div>
  ) : (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <SummaryTable enrollment={enrollment} grades={sumGrades} subjects={sumSubjects} loading={loadingSum} />

      {!loadingSum && sumGrades.length === 0 && (
        <div style={{ background:"#fef3e2", border:"1px solid #f6c96a", borderRadius:16, padding:"24px 28px", display:"flex", alignItems:"flex-start", gap:14, animation:"fadeUp 0.2s ease both" }}>
          <i className="ti ti-alert-triangle" style={{ fontSize:22, color:"#854f0b", flexShrink:0, marginTop:2 }} />
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#854f0b" }}>No grades recorded yet</div>
            <div style={{ fontSize:13, color:"#7a4a08", marginTop:4, lineHeight:1.6 }}>Use the Grade Entry tab to start recording scores.</div>
            <button onClick={() => setTab("entry")}
              style={{ marginTop:12, display:"inline-flex", alignItems:"center", gap:6, background:"#854f0b", color:"white", border:"none", borderRadius:8, padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
              <i className="ti ti-pencil" style={{ fontSize:12 }} />Go to Grade Entry
            </button>
          </div>
        </div>
      )}

      {!loadingSum && sumGrades.length > 0 && (
        <AIInsightPanel
          title="AI Grade Interpretation"
          description="Gemini-powered analysis of this student's academic performance"
          disabled={sumGrades.length === 0}
          onFetch={() => {
            const subjectMap = {};
            sumSubjects.forEach((s) => { subjectMap[s.subject_id] = s.subject_name; });
            const gradesBySubject = {};
            sumGrades.forEach((g) => {
              const name = subjectMap[g.subject] ?? `Subject #${g.subject}`;
              if (!gradesBySubject[name]) gradesBySubject[name] = {};
              gradesBySubject[name][g.grading_period] = parseFloat(g.numeric_grade);
            });
            return callGemini("grade_report", {
              student_name:    fullName,
              grade_level:     enrollment.grade_level,
              school_level:    enrollment.school_level,
              section:         enrollment.section,
              school_year:     enrollment.school_year,
              overall_average: overallAvg?.toFixed(2),
              passed_subjects: passedCount,
              failed_subjects: failedCount,
              total_grades:    gradeCount,
              grades_by_subject: gradesBySubject,
            });
          }}
        />
      )}
    </div>
  );

  // ── Entry right panel ─────────────────────────────────────────────────────
  const entryPanel = !student || !enrollment ? (
    <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"80px 24px", textAlign:"center", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
      <div style={{ width:60, height:60, borderRadius:18, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
        <i className="ti ti-pencil" style={{ fontSize:28, color:"#e08080" }} />
      </div>
      <div style={{ fontSize:16, color:"#7a5050", fontWeight:600 }}>Select a student and enrollment</div>
      <div style={{ fontSize:13, color:"#b09090", marginTop:6 }}>Use the panel on the left to get started.</div>
    </div>
  ) : !subject ? (
    <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"80px 24px", textAlign:"center", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
      <div style={{ width:60, height:60, borderRadius:18, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
        <i className="ti ti-book" style={{ fontSize:28, color:"#e08080" }} />
      </div>
      <div style={{ fontSize:16, color:"#7a5050", fontWeight:600 }}>Select a subject</div>
      <div style={{ fontSize:13, color:"#b09090", marginTop:6 }}>Pick a subject from the left panel to enter scores.</div>
    </div>
  ) : !template ? (
    <div style={{ background:"#fef3e2", border:"1px solid #f6c96a", borderRadius:16, padding:"24px 28px", display:"flex", alignItems:"flex-start", gap:14 }}>
      <i className="ti ti-alert-triangle" style={{ fontSize:22, color:"#854f0b", flexShrink:0, marginTop:2 }} />
      <div>
        <div style={{ fontSize:14, fontWeight:700, color:"#854f0b" }}>No grading template assigned</div>
        <div style={{ fontSize:13, color:"#7a4a08", marginTop:4, lineHeight:1.6 }}>
          "{subject.subject_name}" doesn't have a grading template. Go to <strong>Subjects</strong> and assign one first.
        </div>
      </div>
    </div>
  ) : (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Notifications */}
      {entryError && (
        <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#b91c1c", display:"flex", alignItems:"center", gap:8 }}>
          <i className="ti ti-alert-circle" style={{ fontSize:15 }} />{entryError}
          <button onClick={() => setEntryError("")} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color:"#b91c1c" }}><i className="ti ti-x" style={{ fontSize:13 }} /></button>
        </div>
      )}
      {savedMsg && (
        <div style={{ background:"#e8f5e0", border:"1px solid #a3d977", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#2e6b0d", display:"flex", alignItems:"center", gap:8 }}>
          <i className="ti ti-circle-check" style={{ fontSize:15 }} />{savedMsg}
        </div>
      )}

      {/* Subject header */}
      <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"18px 22px", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a"}}>{subject.subject_name}</div>
          <div style={{ fontSize:12, color:"#b09090", marginTop:3 }}>{subject.subject_code} · {template.template_name} · {PERIOD_LABELS[gradingPeriod]}</div>
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

      {/* Grading components */}
      {loadingScores ? (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {[1,2,3].map((i) => <div key={i} style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"20px 22px" }}><Sk w="40%" h={16} /><div style={{ marginTop:12 }}><Sk w="100%" h={40} /></div></div>)}
        </div>
      ) : (
        components.map((comp, ci) => {
          const color   = COMPONENT_COLORS[ci % COMPONENT_COLORS.length];
          const entries = scoresByComponent[comp.grading_component_id] ?? [];
          const avgPct  = entries.length > 0 ? entries.reduce((s, e) => s + (e.score / e.max_score) * 100, 0) / entries.length : null;
          const weighted = avgPct !== null ? (avgPct * comp.weight) / 100 : null;

          return (
            <div key={comp.grading_component_id} style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", animation:`fadeUp 0.2s ease ${ci*60}ms both` }}>
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
              <div style={{ padding:"12px 18px", display:"flex", flexDirection:"column", gap:6 }}>
                {entries.map((entry) => (
                  <ScoreRow key={entry.score_entry_id} entry={entry} color={color} onUpdate={handleUpdateScore} onDelete={handleDeleteScore} />
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

      {/* Compute & save */}
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
    </div>
  );

  return (
    <AppLayout>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes rowIn   { from{opacity:0;transform:translateX(-4px)} to{opacity:1;transform:translateX(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
      `}</style>

      {/* Topbar */}
      <div style={{ background:"white", borderBottom:"1px solid #f5eaea", padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <i className="ti ti-chart-bar" style={{ fontSize:16, color:"#e03131" }} />
          <span style={{ fontSize:14, fontWeight:700, color:"#1a0a0a" }}>Grades</span>
        </div>
        {/* Tab switcher */}
        <div style={{ display:"flex", background:"#fdfafa", border:"1px solid #f5eaea", borderRadius:10, padding:3, gap:2 }}>
          {[
            { key:"overview", icon:"ti-layout-list",  label:"Overview" },
            { key:"summary",  icon:"ti-table",         label:"Summary"  },
            { key:"entry",    icon:"ti-pencil",        label:"Entry"    },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 16px", borderRadius:8, border:"none", fontSize:13, fontWeight:tab===t.key?700:500, fontFamily:"'DM Sans',sans-serif", cursor:"pointer", transition:"all 0.14s",
                background: tab===t.key?"white":"transparent",
                color:      tab===t.key?"#e03131":"#9a7070",
                boxShadow:  tab===t.key?"0 1px 6px rgba(224,49,49,0.12)":"none",
              }}>
              <i className={`ti ${t.icon}`} style={{ fontSize:13 }} />{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:700, color:"#1a0a0a", letterSpacing:"-0.01em" }}>
            {tab === "overview" ? "Grade Overview" : tab === "summary" ? "Grade Summary" : "Grade Entry"}
          </div>
          <div style={{ fontSize:13, color:"#b09090", marginTop:4 }}>
            {tab === "overview"
              ? "Filter and browse students by grade performance across an enrollment cohort."
              : tab === "summary"
              ? "View a student's complete grade report across all subjects and periods."
              : "Select a subject and grading period to enter raw scores."
            }
          </div>
        </div>

        {tab === "overview" ? (
          <OverviewTab />
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"300px 1fr", gap:16, alignItems:"start" }}>
            {leftPanel}
            <div key={tab}>
              {tab === "summary" ? summaryPanel : entryPanel}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
