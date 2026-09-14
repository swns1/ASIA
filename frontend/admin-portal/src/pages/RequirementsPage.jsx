import { usePageTitle } from "../hooks/usePageTitle";
import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import { StatCard } from "../components/ui/Card";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getStudent, getStudents } from "../api/studentApi";
import RequirementDocumentsPanel from "../components/requirements/RequirementDocumentsPanel";


// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  red: "#e03131", redDark: "#c92a2a", redLight: "#fff0f0", redBorder: "#fca5a5",
  green: "#2e7d32", greenLight: "#e8f5e0", greenBorder: "#a5d6a7",
  border: "#f5eaea", softBorder: "#f9f0f0",
  text: "#1a0a0a", muted: "#7a5050", pale: "#8a6a6a",
  bg: "#fdf8f6", white: "#ffffff",
};

// ── Avatar palette ────────────────────────────────────────────────────────────
const AVATAR_PALETTES = [
  { bg: "#fde8e8", color: "#c0392b" },
  { bg: "#e8f0fd", color: "#2563eb" },
  { bg: "#e8fdf0", color: "#2e6b0d" },
  { bg: "#fdf5e8", color: "#854f0b" },
  { bg: "#f0e8fd", color: "#7c3aed" },
  { bg: "#fde8f8", color: "#be185d" },
  { bg: "#e8fdfd", color: "#1455a0" },
];
function getAvatarPalette(name = "X") {
  return AVATAR_PALETTES[name.charCodeAt(0) % AVATAR_PALETTES.length];
}


// ── Filter constants ──────────────────────────────────────────────────────────
const SCHOOL_LEVELS = [
  { value: "",                  label: "All Levels",   icon: "ti-layout-grid",   bg: "#fff0f0", color: "#c92a2a" },
  { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", bg: "#fdf5e8", color: "#854f0b" },
  { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          bg: "#f0e8fd", color: "#7c3aed" },
  { value: "elementary",        label: "Elementary",   icon: "ti-book",          bg: "#e8f0fd", color: "#2563eb" },
  { value: "junior_highschool", label: "Junior High",  icon: "ti-school",        bg: "#e8fdf0", color: "#2e6b0d" },
  { value: "senior_highschool", label: "Senior High",  icon: "ti-certificate",   bg: "#fde8f8", color: "#be185d" },
];

const GRADE_LEVELS_BY_LEVEL = {
  "":                ["All Grades"],
  nursery:           ["All Grades", "Nursery"],
  kindergarten:      ["All Grades", "Kindergarten"],
  elementary:        ["All Grades", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  junior_highschool: ["All Grades", "Grade 7", "Grade 8", "Grade 9", "Grade 10"],
  senior_highschool: ["All Grades", "Grade 11", "Grade 12"],
};


// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
);


// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function RequirementsPage() {
  usePageTitle("Requirements");
  const navigate = useNavigate();

  // Filter state
  const [levelFilter, setLevelFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const gradeOptions = GRADE_LEVELS_BY_LEVEL[levelFilter] ?? ["All Grades"];

  // Reset grade when level changes
  useEffect(() => { setGradeFilter(""); }, [levelFilter]);

  const hasFilters = levelFilter || gradeFilter;

  // Search state
  const [searchInput,   setSearchInput]   = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const searchRef = useRef(null);
  const suppressSearch = useRef(false);

  // Recent students
  const [recentStudents,        setRecentStudents]        = useState([]);
  const [recentStudentsLoading, setRecentStudentsLoading] = useState(false);
  const [recentPage,            setRecentPage]            = useState(1);
  const [recentPageMeta,        setRecentPageMeta]        = useState({ count: 0, next: null, previous: null });
  const RECENT_PAGE_SIZE = 10;

  // Document counts, reported up by RequirementDocumentsPanel. The panel owns
  // the fetching now, so this page no longer loads the same summary a second
  // time purely to fill in the stat cards.
  const [reqCounts,  setReqCounts]  = useState({ total: 0, submitted: 0, requiredMissing: 0 });
  const [reqLoading, setReqLoading] = useState(false);
  const [reqRefresh, setReqRefresh] = useState(0);

  const handleReqChange = useCallback((counts) => {
    setReqCounts(counts);
    setReqLoading(false);
  }, []);

  // Deep link: /requirements?student=123.
  //
  // This page used to take no parameters at all, so the only way in was the
  // sidebar followed by re-searching for a student by name. That is the whole
  // reason a registrar blocked by "missing required documents" on an
  // enrollment had nowhere to go — the enrollment pages now link straight
  // here for the learner already on screen.
  const [searchParams] = useSearchParams();
  const deepLinkId = searchParams.get("student");
  useEffect(() => {
    if (!deepLinkId) return;
    let cancelled = false;
    getStudent(deepLinkId)
      .then((student) => { if (!cancelled && student) selectStudent(student); })
      .catch(() => { /* a bad id just leaves the picker empty */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId]);

  // Load recent students — re-fetches when filters or page change
  const fetchRecentStudents = useCallback((page = 1) => {
    setRecentStudentsLoading(true);
    getStudents({
      ordering: "-student_id",
      page,
      page_size: RECENT_PAGE_SIZE,
      school_level: levelFilter,
      grade_level: gradeFilter,
    })
      .then((data) => {
        setRecentStudents(data?.results ?? []);
        setRecentPageMeta({ count: data?.count ?? 0, next: data?.next, previous: data?.previous });
        setRecentPage(page);
      })
      .catch(() => {})
      .finally(() => setRecentStudentsLoading(false));
  }, [levelFilter, gradeFilter]);

  useEffect(() => { fetchRecentStudents(1); }, [levelFilter, gradeFilter]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Live debounced student search
  useEffect(() => {
    if (suppressSearch.current) { suppressSearch.current = false; return; }
    if (!searchInput.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    setSearchLoading(true);
    setShowDropdown(true);
    const t = setTimeout(async () => {
      try {
        const data = await getStudents({ search: searchInput.trim() });
        setSearchResults(Array.isArray(data) ? data : data?.results ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Select a student → load requirements
  function selectStudent(student) {
    suppressSearch.current = true;
    setSelectedStudent(student);
    setShowDropdown(false);
    setSearchResults([]);
    setSearchInput(`${student.first_name} ${student.last_name}`);
    setReqLoading(true);
    setReqCounts({ total: 0, submitted: 0, requiredMissing: 0 });
  }

  const reloadRequirements = useCallback(() => {
    if (!selectedStudent) return;
    setReqLoading(true);
    setReqRefresh((v) => v + 1);
  }, [selectedStudent]);

  const submitted = reqCounts.submitted;
  const pending   = Math.max(reqCounts.total - reqCounts.submitted, 0);

  return (
    <>
      <style>{baseCss}</style>
          <PageHeader
            title="Student Requirements"
            icon="ti-file-check"
            subtitle="Enrollment documents and submission tracker"
            actions={
              selectedStudent && (
                <Button variant="secondary" icon="ti-refresh" onClick={reloadRequirements}>
                  Refresh
                </Button>
              )
            }
          />

          <div style={s.content}>

            {/* ── Filter + Search panel ── */}
            <motion.div
              style={{
                background: "white", border: `1px solid ${C.border}`,
                borderRadius: 14, padding: "18px 20px",
                boxShadow: "0 2px 12px rgba(224,49,49,0.05)",
                display: "flex", flexDirection: "column", gap: 0,
                position: "relative", zIndex: 100,
              }}
            >
              {/* Search row */}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ flex: 1, position: "relative" }} ref={searchRef}>
                  <div
                    className="search-wrap"
                    style={{ display: "flex", alignItems: "center", gap: 10, background: "white", border: "1.5px solid #f0e4e4", borderRadius: 12, padding: "0 16px", height: 42, transition: "border .15s, box-shadow .15s" }}
                  >
                    <i className="ti ti-search" style={{ fontSize: 15, color: "#8a6a6a", flexShrink: 0 }} />
                    <input
                      value={searchInput}
                      onChange={(e) => {
                        setSearchInput(e.target.value);
                        if (!e.target.value) { setSelectedStudent(null); setShowDropdown(false); }
                      }}
                      placeholder="Search student name, LRN, or student number…"
                      style={{ flex: 1, border: "none", background: "transparent", fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: "none", color: C.text }}
                    />
                    {searchInput && (
                      <button
                        onClick={() => { setSearchInput(""); setSelectedStudent(null); setShowDropdown(false); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#8a6a6a", display: "flex", alignItems: "center", padding: 2, borderRadius: 4 }}
                      >
                        <i className="ti ti-x" style={{ fontSize: 13 }} />
                      </button>
                    )}
                    {searchLoading && (
                      <i className="ti ti-loader-2" style={{ fontSize: 13, color: C.red, animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                    )}
                  </div>

                  {/* Dropdown */}
                  {showDropdown && (
                    <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "white", border: `1.5px solid ${C.border}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(224,49,49,0.14)", zIndex: 9999, maxHeight: 280, overflowY: "auto" }}>
                      {searchLoading && (
                        <div style={{ padding: "14px 16px", color: C.pale, fontSize: 13 }}>Searching…</div>
                      )}
                      {!searchLoading && searchResults.length === 0 && (
                        <div style={{ padding: "14px 16px", color: C.pale, fontSize: 13 }}>No students found.</div>
                      )}
                      {!searchLoading && searchResults.map((st) => {
                        const ap = getAvatarPalette(st.last_name ?? "X");
                        return (
                        <div key={st.student_id}
                          className="dropdown-item"
                          onClick={() => selectStudent(st)}
                          style={{ padding: "11px 16px", cursor: "pointer", borderBottom: `1px solid ${C.softBorder}`, display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 34, height: 34, borderRadius: "50%", background: ap.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: ap.color, flexShrink: 0 }}>
                            {st.first_name?.[0]}{st.last_name?.[0]}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                              {st.first_name} {st.middle_name ? st.middle_name + " " : ""}{st.last_name}
                            </div>
                            <div style={{ fontSize: 11, color: C.pale }}>LRN: {st.lrn} · {st.student_number}</div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  style={{ height: 42, padding: "0 20px", background: "white", border: "1.5px solid #f0e4e4", borderRadius: 12, fontSize: 13, fontWeight: 600, color: "#7a5050", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.14s", flexShrink: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#e03131"; e.currentTarget.style.color = "#c92a2a"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#f0e4e4"; e.currentTarget.style.color = "#7a5050"; }}
                  onClick={() => { if (searchInput.trim()) setShowDropdown(true); }}
                >
                  Search
                </button>
                <AnimatePresence>
                  {hasFilters && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.88 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.88 }}
                      transition={{ duration: 0.14 }}
                      whileTap={{ scale: 0.93 }}
                      onClick={() => { setLevelFilter(""); setGradeFilter(""); }}
                      style={{ height: 42, padding: "0 14px", background: "white", border: "1.5px solid #fca5a5", borderRadius: 12, fontSize: 12, fontWeight: 600, color: "#b91c1c", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}
                    >
                      <i className="ti ti-filter-off" style={{ fontSize: 13 }} />Clear
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "#f5eaea", margin: "14px 0" }} />

              {/* Chip rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                {/* School Level chips */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#8a6a6a", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>School Level</div>
                  <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {SCHOOL_LEVELS.map((lvl) => {
                      const active = levelFilter === lvl.value;
                      return (
                        <motion.button
                          key={lvl.value}
                          layout
                          initial={false}
                          animate={{
                            backgroundColor: active ? lvl.bg    : "#ffffff",
                            color:           active ? lvl.color : "#855c5c",
                            borderColor:     active ? lvl.color : "#f0e4e4",
                          }}
                          transition={{ layout: { type: "spring", stiffness: 400, damping: 36 }, duration: 0.18, ease: "easeOut" }}
                          onClick={() => setLevelFilter(lvl.value)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: "1.5px solid", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                        >
                          <i className={`ti ${lvl.icon}`} style={{ fontSize: 12 }} />
                          {lvl.label}
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </div>

                {/* Grade Level chips — CSS max-height cascade */}
                <div style={{
                  maxHeight: levelFilter !== "" ? 200 : 0,
                  overflow: "hidden",
                  opacity: levelFilter !== "" ? 1 : 0,
                  marginTop: levelFilter !== "" ? 0 : -12,
                  transition: "max-height 0.22s ease, opacity 0.18s ease, margin-top 0.22s ease",
                  pointerEvents: levelFilter !== "" ? "auto" : "none",
                }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#8a6a6a", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Grade Level</div>
                    <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {gradeOptions.map((g, idx) => {
                        const val = g === "All Grades" ? "" : g;
                        const active = gradeFilter === val;
                        return (
                          <motion.button
                            key={`${levelFilter}-${g}`}
                            layout
                            initial={{ opacity: 0, y: 6, backgroundColor: "#ffffff", color: "#855c5c", borderColor: "#f0e4e4" }}
                            animate={{
                              opacity: 1, y: 0,
                              backgroundColor: active ? "#fff0f0" : "#ffffff",
                              color:           active ? "#c92a2a" : "#855c5c",
                              borderColor:     active ? "#e03131" : "#f0e4e4",
                            }}
                            transition={{
                              opacity:         { duration: 0.16, ease: "easeOut", delay: idx * 0.03 },
                              y:               { duration: 0.16, ease: "easeOut", delay: idx * 0.03 },
                              backgroundColor: { duration: 0.18, ease: "easeOut" },
                              color:           { duration: 0.18, ease: "easeOut" },
                              borderColor:     { duration: 0.18, ease: "easeOut" },
                              layout:          { type: "spring", stiffness: 400, damping: 36 },
                            }}
                            onClick={() => setGradeFilter(val)}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: "1.5px solid", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                          >
                            {g}
                          </motion.button>
                        );
                      })}
                    </motion.div>
                  </div>
                </div>

              </div>
            </motion.div>

            {/* ── Selected student stats ── */}
            {selectedStudent && (() => {
              const selAp = getAvatarPalette(selectedStudent.last_name ?? "X");
              return (
              <div className="grid grid-cols-4 gap-3">
                <div className="flex items-center gap-3.5 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: selAp.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: selAp.color, flexShrink: 0 }}>
                    {selectedStudent.first_name?.[0]}{selectedStudent.last_name?.[0]}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selectedStudent.first_name} {selectedStudent.last_name}
                    </div>
                    <div style={{ fontSize: 11, color: C.pale }}>LRN: {selectedStudent.lrn}</div>
                    <div style={{ fontSize: 11, color: C.pale }}>{selectedStudent.student_number}</div>
                    <button
                      onClick={() => navigate(`/students/${selectedStudent.student_id}`)}
                      style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 7, background: "white", color: C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                    >
                      <i className="ti ti-user" style={{ fontSize: 12 }} />View Profile
                    </button>
                  </div>
                </div>
                <StatCard label="Total Requirements" value={reqCounts.total} icon="ti-list" iconTone="brand" loading={reqLoading} />
                <StatCard label="Submitted" value={submitted} icon="ti-circle-check" iconTone="success" loading={reqLoading} />
                <StatCard label="Pending" value={pending} icon="ti-clock" iconTone="warning" loading={reqLoading} />
              </div>
              );
            })()}

            {/* The document checklist itself lives in a shared panel so the
                enrollment pages can embed the same thing — that is where the
                completeness gate blocks a registrar, and where fixing it
                belongs. This page keeps the search, the level/grade filters
                and the recent-students table; only the per-student document
                block moved. */}
            {selectedStudent && (
              <section style={{ ...s.panel, padding: 20 }}>
                <RequirementDocumentsPanel
                  studentId={selectedStudent.student_id}
                  student={selectedStudent}
                  variant="table"
                  refreshKey={reqRefresh}
                  onChange={handleReqChange}
                />
              </section>
            )}

            {/* ── Recently enrolled students ── */}
            {!selectedStudent && (
              <>
              <section style={s.panel}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#fdfafa" }}>

                      {[
                        { label: "Student",  w: "35%" },
                        { label: "LRN",      w: "20%" },
                        { label: "Grade",    w: "20%" },
                        { label: "Status",   w: "15%" },
                        { label: "",         w: "10%" },
                      ].map(({ label, w }, i, arr) => (
                        <th key={label} style={{
                          textAlign: "left", fontSize: 10.5, fontWeight: 600,
                          color: "#8a6a6a", padding: "13px 18px",
                          borderBottom: `1px solid ${C.border}`,
                          textTransform: "uppercase", letterSpacing: "0.07em",
                          width: w,
                          background: "#fdfafa",
                          borderRadius: i === 0 ? "16px 0 0 0" : i === arr.length - 1 ? "0 16px 0 0" : 0,
                        }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentStudentsLoading
                      ? Array.from({ length: RECENT_PAGE_SIZE }).map((_, i) => (
                          <tr key={i}>
                            <td style={{ padding: "14px 18px", borderBottom: "1px solid #f9f0f0" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <Sk w={36} h={36} r={99} />
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  <Sk w={130} h={13} /><Sk w={90} h={11} />
                                </div>
                              </div>
                            </td>
                            {[88, 100, 70, 40].map((w, j) => (
                              <td key={j} style={{ padding: "14px 18px", borderBottom: "1px solid #f9f0f0" }}>
                                <Sk w={w} h={13} />
                              </td>
                            ))}
                          </tr>
                        ))
                      : recentStudents.length === 0
                        ? (
                          <tr>
                            <td colSpan={5} style={{ textAlign: "center", padding: "56px 16px" }}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                                <div style={{ width: 52, height: 52, borderRadius: 14, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                                  <i className="ti ti-users" style={{ fontSize: 22, color: C.red }} />
                                </div>
                                <div style={{ fontSize: 14, color: "#7a5050", fontWeight: 600 }}>No students found</div>
                                <div style={{ fontSize: 12, color: C.pale }}>Try adjusting the level or grade filter above</div>
                              </div>
                            </td>
                          </tr>
                        )
                        : recentStudents.map((st, idx) => {
                            const isLast = idx === recentStudents.length - 1;
                            const tdStyle = (extra = {}) => ({ padding: "13px 18px", borderBottom: isLast ? "none" : "1px solid #f9f0f0", verticalAlign: "middle", ...extra });
                            const rap = getAvatarPalette(st.last_name ?? "X");
                            const initials = `${st.first_name?.[0] ?? ""}${st.last_name?.[0] ?? ""}`.toUpperCase();
                            const fullName = [st.last_name, ",", st.first_name, st.middle_name ? st.middle_name[0] + "." : "", st.suffix ?? ""].filter(Boolean).join(" ");
                            const statusMeta = {
                              active:      { bg: "#e8f5e0", color: "#2e6b0d", dot: "#4caf50", label: "Active" },
                              inactive:    { bg: "#f0ede8", color: "#5c5752", dot: "#9e9e9e", label: "Inactive" },
                              transferred: { bg: "#fef3e2", color: "#7a4a08", dot: "#ff9800", label: "Transferred" },
                              graduated:   { bg: "#e3f0fd", color: "#1455a0", dot: "#2196f3", label: "Graduated" },
                              dropped:     { bg: "#fde8e8", color: "#9b2020", dot: "#f44336", label: "Dropped" },
                            };
                            const pill = statusMeta[st.status] ?? statusMeta.inactive;
                            const gradeLabel = st.grade_level
                              ? st.grade_level.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
                              : st.school_level
                                ? st.school_level.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
                                : null;
                            return (
                              <tr
                                key={st.student_id}
                                className="student-row"
                                onClick={() => selectStudent(st)}
                              >
                                {/* Student */}
                                <td style={tdStyle()}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <div style={{
                                      width: 36, height: 36, borderRadius: "50%",
                                      background: rap.bg, flexShrink: 0,
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      fontSize: 12, fontWeight: 700, color: rap.color,
                                    }}>
                                      {initials}
                                    </div>
                                    <div>
                                      <div className="row-name" style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a", lineHeight: 1.3, transition: "color 0.12s" }}>
                                        {fullName}
                                      </div>
                                      <div style={{ fontSize: 11, color: "#8a6a6a", marginTop: 2 }}>
                                        {st.student_number
                                          ? st.student_number
                                          : <span style={{ fontStyle: "italic", color: "#8a6a6a" }}>no student number</span>}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* LRN */}
                                <td style={tdStyle()}>
                                  {st.lrn
                                    ? <span style={{ fontFamily: "monospace", fontSize: 12, color: "#5a4a4a", background: "#f9f4f4", padding: "3px 8px", borderRadius: 6 }}>{st.lrn}</span>
                                    : <span style={{ color: "#8a6a6a", fontStyle: "italic", fontSize: 12 }}>—</span>}
                                </td>

                                {/* Grade */}
                                <td style={tdStyle()}>
                                  {gradeLabel
                                    ? <span style={{ fontSize: 12, color: "#5a4a4a" }}>{gradeLabel}</span>
                                    : <span style={{ color: "#8a6a6a", fontStyle: "italic", fontSize: 12 }}>—</span>}
                                </td>

                                {/* Status */}
                                <td style={tdStyle()}>
                                  <span style={{
                                    display: "inline-flex", alignItems: "center", gap: 5,
                                    fontSize: 11.5, fontWeight: 600,
                                    padding: "4px 10px", borderRadius: 99,
                                    background: pill.bg, color: pill.color,
                                  }}>
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: pill.dot, flexShrink: 0 }} />
                                    {pill.label}
                                  </span>
                                </td>

                                {/* Arrow */}
                                <td style={tdStyle({ padding: "13px 14px" })}>
                                  <i className="ti ti-chevron-right" style={{ fontSize: 14, color: "#8a6a6a" }} />
                                </td>
                              </tr>
                            );
                          })
                    }
                  </tbody>
                </table>

              </section>

              {/* Pagination */}
              {!recentStudentsLoading && recentPageMeta.count > RECENT_PAGE_SIZE && (() => {
                const totalPages = Math.ceil(recentPageMeta.count / RECENT_PAGE_SIZE);
                const windowSize = Math.min(totalPages, 5);
                const start = Math.min(Math.max(1, recentPage - 2), Math.max(1, totalPages - windowSize + 1));
                const pages = Array.from({ length: windowSize }, (_, i) => start + i);
                return (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#8a6a6a" }}>
                      Page <strong style={{ color: "#7a5050" }}>{recentPage}</strong> of{" "}
                      <strong style={{ color: "#7a5050" }}>{totalPages}</strong>
                      &nbsp;·&nbsp;{recentPageMeta.count.toLocaleString()} total records
                    </span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        style={{ ...pgBtn, opacity: !recentPageMeta.previous ? 0.4 : 1, cursor: !recentPageMeta.previous ? "default" : "pointer" }}
                        disabled={!recentPageMeta.previous}
                        onClick={() => fetchRecentStudents(recentPage - 1)}
                      >
                        <i className="ti ti-chevron-left" style={{ fontSize: 13 }} />
                      </button>
                      {pages.map((p) => (
                        <button
                          key={p}
                          style={{ ...pgBtn, ...(p === recentPage ? pgBtnActive : {}) }}
                          onClick={() => fetchRecentStudents(p)}
                        >
                          {p}
                        </button>
                      ))}
                      <button
                        style={{ ...pgBtn, opacity: !recentPageMeta.next ? 0.4 : 1, cursor: !recentPageMeta.next ? "default" : "pointer" }}
                        disabled={!recentPageMeta.next}
                        onClick={() => fetchRecentStudents(recentPage + 1)}
                      >
                        <i className="ti ti-chevron-right" style={{ fontSize: 13 }} />
                      </button>
                    </div>
                  </div>
                );
              })()}
              </>
            )}
          </div>
    </>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
// Page-specific rules only. The keyframes, the `*`/body resets, the scrollbar
// styling and `.search-wrap:focus-within` all live in index.css now, and the
// `.nav-item`/`.nav-active` overrides were dead weight — the sidebar no longer
// uses those class names, so the rules matched nothing.
const baseCss = `
  .dropdown-item:hover { background:#fff8f6; }
  .dropdown-item:last-child { border-bottom:none !important; }
  .student-row:last-child td { border-bottom:none !important; }
  tbody tr:last-child td { border-bottom:none !important; }
`;

const s = {
  shell:       { display: "flex", height: "100vh", background: C.bg, fontFamily: "'DM Sans',sans-serif", overflow: "hidden" },
  sidebar:     { width: 224, flexShrink: 0, background: C.white, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", boxShadow: "2px 0 12px rgba(224,49,49,0.04)" },
  brandWrap:   { padding: "22px 18px 18px", borderBottom: `1px solid ${C.border}` },
  nav:         { flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" },
  navSection:  { fontSize: 9.5, color: "#8a6a6a", letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 10px 4px", fontWeight: 600 },
  navItem:     { display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 9, fontSize: 13, cursor: "pointer" },
  userBox:     { display: "flex", alignItems: "center", gap: 10, padding: "10px", borderRadius: 10, background: "#fff8f6" },
  avatar:      { width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#fde8e8,#fca5a5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: C.red, flexShrink: 0 },
  userName:    { fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  userRole:    { fontSize: 11, color: C.pale, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  logoutBtn:   { width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: C.white, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8a6a6a", transition: "all 0.12s" },
  main:        { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topbar:      { background: C.white, borderBottom: `1px solid ${C.border}`, padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 8px rgba(224,49,49,0.04)" },
  topbarTitle: { fontSize: 16, fontWeight: 700, color: C.text},
  topbarSub:   { fontSize: 11.5, color: C.pale, marginTop: 1 },
  content:     { flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 },
  panel:       { background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "visible", boxShadow: "0 2px 16px rgba(224,49,49,0.06)" },
  panelHeader: { padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" },
  panelTitle:  { fontSize: 14, fontWeight: 700, color: C.text},
  primaryBtn:  { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: `linear-gradient(135deg,#e03131,#c92a2a)`, color: C.white, border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.24)" },
  secondaryBtn:{ flex: 1, height: 42, border: "1.5px solid #f0e0e0", borderRadius: 10, background: C.white, fontSize: 13, color: C.muted, cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" },
  dangerBtn:   { flex: 1, height: 42, border: "none", borderRadius: 10, background: `linear-gradient(135deg,#e03131,#c92a2a)`, fontSize: 13, color: C.white, cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans',sans-serif" },
  errorBanner: { background: "#fef2f2", border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", display: "flex", alignItems: "center", gap: 8, marginBottom: 16 },
};

const pgBtn = {
  width: 32, height: 32, border: "1px solid #f0e4e4", borderRadius: 8,
  background: "white", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", fontSize: 12, color: "#855c5c",
  fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s",
};

const pgBtnActive = {
  background: "#fff0f0", borderColor: "#e03131", color: "#c92a2a", fontWeight: 700,
};
