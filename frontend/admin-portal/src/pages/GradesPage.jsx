import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import AppLayout from "../components/AppLayout";
import AIInsightPanel from "../components/AIInsightPanel";
import ConfirmModal from "../components/ConfirmModal";
import EmptyState from "../components/EmptyState";

// ── API ───────────────────────────────────────────────────────────────────────
import {
  getEnrollments as _getEnrollments,
  getSubjects as _getSubjects,
  getGrades as _getGrades,
  getScoreEntries as _getScoreEntries,
  createScoreEntry as _createScore,
  updateScoreEntry as _updateScore,
  deleteScoreEntry as _deleteScore,
  computeGrade as _computeGrade,
  saveGrade as _saveGrade,
  updateGrade as _updateGrade,
  getNarrativeCategories as _getNarrativeCategories,
  getNarrativeReports as _getNarrativeReports,
  createNarrativeReport as _createNarrativeReport,
  updateNarrativeReport as _updateNarrativeReport,
  deleteNarrativeReport as _deleteNarrativeReport,
  callGemini,
} from "../api/enrollmentApi";
import { getStudents as _getStudents, getStudent as _getStudent } from "../api/studentApi";

const getStudents            = (p = {}) => _getStudents(p);
const getStudent              = (id)     => _getStudent(id);
const getEnrollments         = (p = {}) => _getEnrollments(p);
const getSubjects            = (p = {}) => _getSubjects(p);
const getGrades              = (p = {}) => _getGrades(p);
const getScoreEntries        = (p = {}) => _getScoreEntries(p);
const createScore            = (p)      => _createScore(p);
const updateScore            = (id, p)  => _updateScore(id, p);
const deleteScore            = (id)     => _deleteScore(id);
const computeGrade           = (p = {}) => _computeGrade(p);
const saveGrade              = (p)      => _saveGrade(p);
const updateGrade            = (id, p)  => _updateGrade(id, p);
const getNarrativeCategories = (p = {}) => _getNarrativeCategories(p);
const getNarrativeReports    = (p = {}) => _getNarrativeReports(p);
const createNarrativeReport  = (p)      => _createNarrativeReport(p);
const updateNarrativeReport  = (id, p)  => _updateNarrativeReport(id, p);
const deleteNarrativeReport  = (id)     => _deleteNarrativeReport(id);

// ── School year chip options (same helper as EnrollmentsPage) ─────────────────
function buildSchoolYearOptions() {
  const current = new Date().getFullYear();
  const opts = [{ value: "", label: "All Years" }];
  for (let y = current + 1; y >= current - 3; y--) {
    opts.push({ value: `${y - 1}-${y}`, label: `${y - 1}–${y}` });
  }
  return opts;
}

const OVERVIEW_SCHOOL_LEVELS = [
  { value: "",                  label: "All Levels",   icon: "ti-layout-grid",   bg: "#fff0f0", color: "#e03131" },
  { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", bg: "#fdf5e8", color: "#c27a12" },
  { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          bg: "#f0e8fd", color: "#7c3aed" },
  { value: "elementary",        label: "Elementary",   icon: "ti-book",          bg: "#e8f0fd", color: "#2563eb" },
  { value: "junior_highschool", label: "Junior High",  icon: "ti-school",        bg: "#e8fdf0", color: "#16a34a" },
  { value: "senior_highschool", label: "Senior High",  icon: "ti-certificate",   bg: "#fde8f8", color: "#be185d" },
];

const OVERVIEW_GRADE_LEVELS = {
  nursery:           ["Nursery"],
  kindergarten:      ["Kindergarten"],
  elementary:        ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"],
  junior_highschool: ["Grade 7","Grade 8","Grade 9","Grade 10"],
  senior_highschool: ["Grade 11","Grade 12"],
};

const OVERVIEW_PAGE_SIZE = 20;

function SortIcon({ k, sortKey, sortDir }) {
  if (sortKey !== k) return <i className="ti ti-selector" style={{ fontSize: 11, color: "#d0b8b8", marginLeft: 4 }} />;
  return <i className={`ti ti-sort-${sortDir === "asc" ? "ascending" : "descending"}`} style={{ fontSize: 11, color: "#e03131", marginLeft: 4 }} />;
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ onNavigate }) {

  const [schoolYear,    setSchoolYear]    = useState("");
  const [schoolLevel,   setSchoolLevel]   = useState("");
  const [gradeLevel,    setGradeLevel]    = useState("");
  const [gradingPeriod, setGradingPeriod] = useState("");
  const [remarks,       setRemarks]       = useState("");
  const [search,        setSearch]        = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [rows,     setRows]     = useState([]);
  const [pageMeta, setPageMeta] = useState({ count: 0, next: null, previous: null });
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [sortKey,  setSortKey]  = useState("avg");
  const [sortDir,  setSortDir]  = useState("asc");
  const searchInputRef = useRef(null);

  // Debounce search so we don't fire an API call on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const schoolYearOptions = buildSchoolYearOptions();
  const gradeLevelOptions = schoolLevel ? (OVERVIEW_GRADE_LEVELS[schoolLevel] ?? []) : [];
  const periodOptions     = schoolLevel
    ? (GRADING_PERIODS_BY_LEVEL[schoolLevel] ?? [])
    : ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter","1st_semester","2nd_semester"];

  // reset cascaded filters + page when level changes
  useEffect(() => { setGradeLevel(""); setGradingPeriod(""); }, [schoolLevel]);

  const hasFilters = schoolYear || schoolLevel || gradeLevel || gradingPeriod || remarks || search;

  const clearFilters = () => {
    setSchoolYear(""); setSchoolLevel(""); setGradeLevel("");
    setGradingPeriod(""); setRemarks(""); setSearch(""); setPage(1);
  };

  const fetchPage = useCallback(async (nextPage, opts = {}) => {
    const sy  = opts.schoolYear    ?? schoolYear;
    const sl  = opts.schoolLevel   ?? schoolLevel;
    const gl  = opts.gradeLevel    ?? gradeLevel;
    const gp  = opts.gradingPeriod ?? gradingPeriod;
    const rm  = opts.remarks       ?? remarks;
    const srch = opts.search       ?? debouncedSearch;

    setLoading(true);
    try {
      const params = {
        page: nextPage,
        page_size: OVERVIEW_PAGE_SIZE,
        enrollment_status: "enrolled",
      };
      if (sy)   params.school_year  = sy;
      if (sl)   params.school_level = sl;
      if (gl)   params.grade_level  = gl;
      if (srch) params.search       = srch;

      const d = await getEnrollments(params);
      const enrollments = Array.isArray(d) ? d : d?.results ?? [];
      const meta = { count: d?.count ?? enrollments.length, next: d?.next ?? null, previous: d?.previous ?? null };

      const gradeParams = {};
      if (gp) gradeParams.grading_period = gp;

      const gradeResults = await Promise.all(
        enrollments.map((en) =>
          getGrades({ enrollment: en.enrollment_id, page_size: 200, ...gradeParams })
            .then((g) => Array.isArray(g) ? g : g?.results ?? [])
            .catch(() => [])
        )
      );

      let built = enrollments.map((en, i) => {
        const grades = gradeResults[i];
        const nums   = grades.map((g) => parseFloat(g.numeric_grade)).filter((n) => !isNaN(n));
        const avg    = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
        const passed = grades.filter((g) => parseFloat(g.numeric_grade) >= 75).length;
        const failed = grades.filter((g) => parseFloat(g.numeric_grade) < 75 && !isNaN(parseFloat(g.numeric_grade))).length;
        const sd     = en.student_detail ?? {};
        const name   = sd.full_name ?? [sd.first_name, sd.middle_name, sd.last_name, sd.suffix].filter(Boolean).join(" ");
        return { enrollment_id: en.enrollment_id, name, lrn: sd.lrn, student_number: sd.student_number, grade_level: en.grade_level, section: en.section, school_year: en.school_year, school_level: en.school_level, avg, passed, failed, total: grades.length, _student: sd, _enrollment: en };
      });

      if (rm) {
        built = built.filter((r) => {
          if (rm === "passed") return r.avg !== null && r.avg >= 75;
          if (rm === "failed") return r.avg !== null && r.avg < 75;
          return true;
        });
      }

      setRows(built);
      setPageMeta(meta);
      setPage(nextPage);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [schoolYear, schoolLevel, gradeLevel, gradingPeriod, remarks, debouncedSearch]);

  // Refetch from page 1 whenever filters change
  useEffect(() => { fetchPage(1); }, [schoolYear, schoolLevel, gradeLevel, gradingPeriod, remarks, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (av === null || av === undefined) av = sortDir === "asc" ? Infinity : -Infinity;
      if (bv === null || bv === undefined) bv = sortDir === "asc" ? Infinity : -Infinity;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [rows, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const totalPages   = Math.ceil(pageMeta.count / OVERVIEW_PAGE_SIZE);
  const passedCount  = rows.filter((r) => r.avg !== null && r.avg >= 75).length;
  const failedCount  = rows.filter((r) => r.avg !== null && r.avg <  75).length;
  const noGradeCount = rows.filter((r) => r.avg === null).length;
  const overallMean  = (() => { const n = rows.filter((r) => r.avg !== null); return n.length > 0 ? n.reduce((s, r) => s + r.avg, 0) / n.length : null; })();

  const isFirstRender = useIsFirstRender();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* ── Stat cards (always visible, stagger in on first render) ── */}
      <div style={{ display: "flex", gap: 12 }}>
        {[
          { label: "Total Students", icon: "ti-users",          value: loading ? null : rows.length,     color: "#e03131", bg: "#fff0f0" },
          { label: "Passing",        icon: "ti-circle-check",   value: loading ? null : passedCount,     color: "#2e6b0d", bg: "#e8f5e0" },
          { label: "Failing",        icon: "ti-circle-x",       value: loading ? null : failedCount,     color: "#9b2020", bg: "#fde8e8" },
          { label: "No Grades Yet",  icon: "ti-alert-triangle", value: loading ? null : noGradeCount,    color: "#854f0b", bg: "#faeeda" },
          { label: "Class Average",  icon: "ti-chart-bar",      value: loading ? null : (overallMean !== null ? overallMean.toFixed(2) : "—"), color: "#1455a0", bg: "#e3f0fd" },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={isFirstRender ? { y: 14, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.28, ease: "easeOut", delay: isFirstRender ? i * 0.06 : 0 }}
            style={{ flex: 1, minWidth: 0 }}
          >
            <motion.div
              whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(224,49,49,0.12)" }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.16 }}
              style={{ background: "white", borderRadius: 14, padding: "16px 20px", border: "1px solid #f5eaea", width: "100%", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 12px rgba(224,49,49,0.06)" }}
            >
              <div style={{ width: 42, height: 42, borderRadius: 12, background: card.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <i className={`ti ${card.icon}`} style={{ fontSize: 18, color: card.color }} />
              </div>
              <div>
                {loading
                  ? <Sk w={40} h={20} r={4} />
                  : <div style={{ fontSize: 22, fontWeight: 700, color: "#1a0a0a", lineHeight: 1 }}>{card.value ?? "—"}</div>
                }
                <div style={{ fontSize: 11, color: "#a07878", marginTop: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{card.label}</div>
              </div>
            </motion.div>
          </motion.div>
        ))}
      </div>

      {/* ── Filter white card ── */}
      <motion.div
        initial={isFirstRender ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.28 : 0 }}
        style={{ background: "white", border: "1px solid #f5eaea", borderRadius: 14, padding: "18px 20px", boxShadow: "0 2px 12px rgba(224,49,49,0.05)", display: "flex", flexDirection: "column", gap: 0, position: "relative", zIndex: 2 }}
      >
        {/* Search row */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div className="search-wrap" style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "white", border: "1.5px solid #f0e4e4", borderRadius: 12, padding: "0 16px", height: 42, transition: "border .15s,box-shadow .15s" }}>
            <i className="ti ti-search" style={{ fontSize: 15, color: "#c0a0a0", flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              placeholder="Search student name or LRN…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchInputRef.current?.blur()}
              style={{ flex: 1, border: "none", background: "transparent", fontSize: 13, color: "#1a0a0a", fontFamily: "'DM Sans',sans-serif", outline: "none" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", display: "flex", alignItems: "center", padding: 2, borderRadius: 4 }}>
                <i className="ti ti-x" style={{ fontSize: 13 }} />
              </button>
            )}
          </div>
          <button
            onClick={() => searchInputRef.current?.focus()}
            style={{ height: 42, padding: "0 20px", background: "white", border: "1.5px solid #f0e4e4", borderRadius: 12, fontSize: 13, fontWeight: 600, color: "#7a5050", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.14s", flexShrink: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#e03131"; e.currentTarget.style.color = "#e03131"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#f0e4e4"; e.currentTarget.style.color = "#7a5050"; }}
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
                onClick={clearFilters}
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

          {/* School Year */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>School Year</div>
            <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {schoolYearOptions.map((o) => {
                const active = schoolYear === o.value;
                return (
                  <motion.button
                    key={o.value}
                    layout
                    initial={false}
                    animate={{ backgroundColor: active ? "#fff0f0" : "#ffffff", color: active ? "#e03131" : "#9a7070", borderColor: active ? "#e03131" : "#f0e4e4" }}
                    transition={{ layout: { type: "spring", stiffness: 400, damping: 36 }, duration: 0.18, ease: "easeOut" }}
                    onClick={() => setSchoolYear(o.value)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: "1.5px solid", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                  >
                    <i className="ti ti-calendar" style={{ fontSize: 12 }} />
                    {o.label}
                  </motion.button>
                );
              })}
            </motion.div>
          </div>

          {/* School Level */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>School Level</div>
            <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {OVERVIEW_SCHOOL_LEVELS.map((lvl) => {
                const active = schoolLevel === lvl.value;
                return (
                  <motion.button
                    key={lvl.value}
                    layout
                    initial={false}
                    animate={{ backgroundColor: active ? lvl.bg : "#ffffff", color: active ? lvl.color : "#9a7070", borderColor: active ? lvl.color : "#f0e4e4" }}
                    transition={{ layout: { type: "spring", stiffness: 400, damping: 36 }, duration: 0.18, ease: "easeOut" }}
                    onClick={() => setSchoolLevel(lvl.value)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: "1.5px solid", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                  >
                    <i className={`ti ${lvl.icon}`} style={{ fontSize: 12 }} />
                    {lvl.label}
                  </motion.button>
                );
              })}
            </motion.div>
          </div>

          {/* Grade Level — CSS max-height cascade, no layout shift on siblings */}
          <div style={{
            maxHeight: schoolLevel !== "" ? 200 : 0,
            overflow: "hidden",
            opacity: schoolLevel !== "" ? 1 : 0,
            marginTop: schoolLevel !== "" ? 0 : -12,
            transition: "max-height 0.22s ease, opacity 0.18s ease, margin-top 0.22s ease",
            pointerEvents: schoolLevel !== "" ? "auto" : "none",
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Grade Level</div>
              <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {["All Grades", ...gradeLevelOptions].map((g, idx) => {
                  const val    = g === "All Grades" ? "" : g;
                  const active = gradeLevel === val;
                  return (
                    <motion.button
                      key={`${schoolLevel}-${g}`}
                      layout
                      initial={{ opacity: 0, y: 6, backgroundColor: "#ffffff", color: "#9a7070", borderColor: "#f0e4e4" }}
                      animate={{ opacity: 1, y: 0, backgroundColor: active ? "#fff0f0" : "#ffffff", color: active ? "#e03131" : "#9a7070", borderColor: active ? "#e03131" : "#f0e4e4" }}
                      transition={{
                        opacity:         { duration: 0.16, ease: "easeOut", delay: idx * 0.03 },
                        y:               { duration: 0.16, ease: "easeOut", delay: idx * 0.03 },
                        backgroundColor: { duration: 0.18, ease: "easeOut" },
                        color:           { duration: 0.18, ease: "easeOut" },
                        borderColor:     { duration: 0.18, ease: "easeOut" },
                        layout:          { type: "spring", stiffness: 400, damping: 36 },
                      }}
                      onClick={() => setGradeLevel(val)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: "1.5px solid", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                    >
                      {g}
                    </motion.button>
                  );
                })}
              </motion.div>
            </div>
          </div>

          {/* Grading Period — CSS max-height cascade, tied to school level */}
          <div style={{
            maxHeight: schoolLevel !== "" ? 200 : 0,
            overflow: "hidden",
            opacity: schoolLevel !== "" ? 1 : 0,
            marginTop: schoolLevel !== "" ? 0 : -12,
            transition: "max-height 0.22s ease, opacity 0.18s ease, margin-top 0.22s ease",
            pointerEvents: schoolLevel !== "" ? "auto" : "none",
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Grading Period</div>
              <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {["All Periods", ...periodOptions].map((p, idx) => {
                  const val    = p === "All Periods" ? "" : p;
                  const active = gradingPeriod === val;
                  return (
                    <motion.button
                      key={`${schoolLevel}-period-${p}`}
                      layout
                      initial={{ opacity: 0, y: 6, backgroundColor: "#ffffff", color: "#9a7070", borderColor: "#f0e4e4" }}
                      animate={{ opacity: 1, y: 0, backgroundColor: active ? "#e3f0fd" : "#ffffff", color: active ? "#1455a0" : "#9a7070", borderColor: active ? "#1455a0" : "#f0e4e4" }}
                      transition={{
                        opacity:         { duration: 0.16, ease: "easeOut", delay: idx * 0.03 },
                        y:               { duration: 0.16, ease: "easeOut", delay: idx * 0.03 },
                        backgroundColor: { duration: 0.18, ease: "easeOut" },
                        color:           { duration: 0.18, ease: "easeOut" },
                        borderColor:     { duration: 0.18, ease: "easeOut" },
                        layout:          { type: "spring", stiffness: 400, damping: 36 },
                      }}
                      onClick={() => setGradingPeriod(val)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: "1.5px solid", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                    >
                      {p === "All Periods" ? p : PERIOD_LABELS[p]}
                    </motion.button>
                  );
                })}
              </motion.div>
            </div>
          </div>

          {/* Remarks / Status */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Status</div>
            <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {[
                { value: "",       label: "All",    bg: "#fff0f0", color: "#e03131", dot: null       },
                { value: "passed", label: "Passed", bg: "#e8f5e0", color: "#2e6b0d", dot: "#4caf50" },
                { value: "failed", label: "Failed", bg: "#fde8e8", color: "#9b2020", dot: "#f44336" },
              ].map((s) => {
                const active = remarks === s.value;
                return (
                  <motion.button
                    key={s.value}
                    layout
                    initial={false}
                    animate={{ backgroundColor: active ? s.bg : "#ffffff", color: active ? s.color : "#9a7070", borderColor: active ? s.color : "#f0e4e4" }}
                    transition={{ layout: { type: "spring", stiffness: 400, damping: 36 }, duration: 0.18, ease: "easeOut" }}
                    onClick={() => setRemarks(s.value)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: "1.5px solid", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                  >
                    {s.dot && (
                      <motion.span
                        animate={{ backgroundColor: active ? s.dot : "#c0b8b8" }}
                        transition={{ duration: 0.18 }}
                        style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block" }}
                      />
                    )}
                    {s.label}
                  </motion.button>
                );
              })}
            </motion.div>
          </div>

        </div>
      </motion.div>

      {/* ── Table ── */}
      <motion.div
        initial={isFirstRender ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut", delay: isFirstRender ? 0.38 : 0 }}
        style={{ background: "white", borderRadius: 16, border: "1px solid #f5eaea", overflow: "hidden", boxShadow: "0 2px 16px rgba(224,49,49,0.06)", position: "relative", zIndex: 1 }}
      >
        {/* Table toolbar */}

        {/* Loading skeleton */}
        {loading && (
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            {[1,2,3,4,5,6].map((i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
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
        {!loading && sorted.length > 0 && (
          <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 520px)", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#fdfafa" }}>
                  <th style={{ ...thStyle, textAlign: "left", paddingLeft: 20, position: "sticky", top: 0, zIndex: 1, background: "#fdfafa" }}>Student</th>
                  <th style={{ ...thStyle, cursor: "pointer", position: "sticky", top: 0, zIndex: 1, background: "#fdfafa" }} onClick={() => toggleSort("grade_level")}>Grade / Section <SortIcon k="grade_level" sortKey={sortKey} sortDir={sortDir} /></th>
                  <th style={{ ...thStyle, cursor: "pointer", position: "sticky", top: 0, zIndex: 1, background: "#fdfafa" }} onClick={() => toggleSort("total")}>Grades <SortIcon k="total" sortKey={sortKey} sortDir={sortDir} /></th>
                  <th style={{ ...thStyle, cursor: "pointer", position: "sticky", top: 0, zIndex: 1, background: "#fdfafa" }} onClick={() => toggleSort("passed")}>Passed <SortIcon k="passed" sortKey={sortKey} sortDir={sortDir} /></th>
                  <th style={{ ...thStyle, cursor: "pointer", position: "sticky", top: 0, zIndex: 1, background: "#fdfafa" }} onClick={() => toggleSort("failed")}>Failed <SortIcon k="failed" sortKey={sortKey} sortDir={sortDir} /></th>
                  <th style={{ ...thStyle, cursor: "pointer", background: "#f9f4f4", position: "sticky", top: 0, zIndex: 1 }} onClick={() => toggleSort("avg")}>Average <SortIcon k="avg" sortKey={sortKey} sortDir={sortDir} /></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, idx) => {
                  const gs  = gradeStyle(r.avg);
                  const pal = getPalette(r.name.split(" ").pop() ?? "X");
                  const ini = r.name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                  return (
                    <motion.tr
                      key={r.enrollment_id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut", delay: Math.min(idx * 0.018, 0.28) }}
                      onMouseEnter={(e) => Array.from(e.currentTarget.cells).forEach((c) => c.style.background = "#fff8f6")}
                      onMouseLeave={(e) => Array.from(e.currentTarget.cells).forEach((c, i) => c.style.background = i === 5 ? "#fdfafa" : "")}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={{ ...tdStyle, textAlign: "left", paddingLeft: 20 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: pal.bg, color: pal.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{ini}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a" }}>{r.name}</div>
                            <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>LRN {r.lrn} · {r.student_number}</div>
                          </div>
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            <motion.button
                              initial={false}
                              whileHover={{ scale: 1.06, backgroundColor: "#e3f0fd", color: "#1455a0", borderColor: "#1455a0" }}
                              whileTap={{ scale: 0.94 }}
                              transition={{ duration: 0.12 }}
                              onClick={(e) => { e.stopPropagation(); onNavigate("summary", r._student, r._enrollment); }}
                              title="View Grade Summary"
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 26, padding: "0 8px", borderRadius: 7, border: "1.5px solid #f0e4e4", background: "white", fontSize: 11, fontWeight: 600, color: "#9a7070", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}
                            >
                              <i className="ti ti-table" style={{ fontSize: 11 }} />Summary
                            </motion.button>
                            <motion.button
                              initial={false}
                              whileHover={{ scale: 1.06, backgroundColor: "#fff0f0", color: "#e03131", borderColor: "#e03131" }}
                              whileTap={{ scale: 0.94 }}
                              transition={{ duration: 0.12 }}
                              onClick={(e) => { e.stopPropagation(); onNavigate("entry", r._student, r._enrollment); }}
                              title="Go to Grade Entry"
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 26, padding: "0 8px", borderRadius: 7, border: "1.5px solid #f0e4e4", background: "white", fontSize: 11, fontWeight: 600, color: "#9a7070", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}
                            >
                              <i className="ti ti-pencil" style={{ fontSize: 11 }} />Entry
                            </motion.button>
                          </div>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1a0a0a" }}>{r.grade_level}</div>
                        <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>{r.section}</div>
                      </td>
                      <td style={tdStyle}><span style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a" }}>{r.total}</span></td>
                      <td style={tdStyle}><span style={{ fontSize: 13, fontWeight: 700, color: "#2e6b0d" }}>{r.passed}</span></td>
                      <td style={tdStyle}><span style={{ fontSize: 13, fontWeight: 700, color: r.failed > 0 ? "#9b2020" : "#b09090" }}>{r.failed}</span></td>
                      <td style={{ ...tdStyle, background: "#fdfafa" }}>
                        {r.avg !== null
                          ? <span style={{ fontSize: 13, fontWeight: 700, padding: "3px 12px", borderRadius: 8, background: gs.bg, color: gs.color }}>{r.avg.toFixed(2)}</span>
                          : <span style={{ fontSize: 12, color: "#c0a0a0", fontStyle: "italic" }}>No grades</span>
                        }
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* No results */}
        {!loading && sorted.length === 0 && rows.length === 0 && (
          <EmptyState icon="ti-users" title="No students found" subtitle="Try adjusting the filters above." />
        )}

        {/* Search filtered to zero */}
        {!loading && sorted.length === 0 && rows.length > 0 && (
          <div style={{ padding: "40px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#b09090" }}>No students match "<strong>{search}</strong>".</div>
          </div>
        )}

        {/* Legend */}
        {!loading && sorted.length > 0 && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #f5eaea", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#b09090", fontWeight: 600 }}>Legend:</span>
            {[
              { range: "90–100", label: "Outstanding",         color: "#1455a0", bg: "#e3f0fd" },
              { range: "85–89",  label: "Very Satisfactory",   color: "#2e6b0d", bg: "#e8f5e0" },
              { range: "80–84",  label: "Satisfactory",        color: "#2e6b0d", bg: "#eaf3de" },
              { range: "75–79",  label: "Fairly Satisfactory", color: "#854f0b", bg: "#faeeda" },
              { range: "< 75",   label: "Did Not Meet",        color: "#9b2020", bg: "#fde8e8" },
            ].map((l) => (
              <div key={l.range} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: l.bg, color: l.color }}>{l.range}</span>
                <span style={{ fontSize: 11, color: "#b09090" }}>{l.label}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ── Pagination ── */}
      {!loading && pageMeta.count > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "#b09090" }}>
            Page <strong style={{ color: "#7a5050" }}>{page}</strong> of{" "}
            <strong style={{ color: "#7a5050" }}>{totalPages || 1}</strong>
            &nbsp;·&nbsp; {pageMeta.count.toLocaleString()} total records
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <motion.button
              whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
              style={{ ...ovPgBtn, opacity: !pageMeta.previous ? 0.4 : 1, cursor: !pageMeta.previous ? "default" : "pointer" }}
              disabled={!pageMeta.previous}
              onClick={() => fetchPage(page - 1)}
            >
              <i className="ti ti-chevron-left" style={{ fontSize: 13 }} />
            </motion.button>
            {(() => {
              const windowSize = Math.min(totalPages, 5);
              const start = Math.min(Math.max(1, page - 2), Math.max(1, totalPages - windowSize + 1));
              return Array.from({ length: windowSize }, (_, i) => start + i);
            })().map((p) => (
              <motion.button
                key={p}
                whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
                style={{ ...ovPgBtn, ...(p === page ? ovPgBtnActive : {}) }}
                onClick={() => fetchPage(p)}
              >
                {p}
              </motion.button>
            ))}
            <motion.button
              whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
              style={{ ...ovPgBtn, opacity: !pageMeta.next ? 0.4 : 1, cursor: !pageMeta.next ? "default" : "pointer" }}
              disabled={!pageMeta.next}
              onClick={() => fetchPage(page + 1)}
            >
              <i className="ti ti-chevron-right" style={{ fontSize: 13 }} />
            </motion.button>
          </div>
        </div>
      )}
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

// ── Overview pagination button styles ─────────────────────────────────────────
const ovPgBtn = {
  width: 32, height: 32, border: "1px solid #f0e4e4", borderRadius: 8,
  background: "white", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", fontSize: 12, color: "#9a7070",
  fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s",
};
const ovPgBtnActive = {
  background: "#fff0f0", borderColor: "#e03131", color: "#e03131", fontWeight: 700,
};

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
      <div style={{ height:4, background:"linear-gradient(to right,#e03131,#ff6b6b,#fca5a5)" }} />
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(entry.score_entry_id);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
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
          <button onClick={() => setConfirmDelete(true)} aria-label={`Delete score entry ${entry.label}`}
            style={{ width:26, height:26, border:"1px solid #f0e4e4", borderRadius:7, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#c09090", transition:"all 0.12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background="#fff0f0"; e.currentTarget.style.color="#e03131"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background="white"; e.currentTarget.style.color="#c09090"; }}>
            <i className="ti ti-trash" style={{ fontSize:11 }} />
          </button>
        </>
      )}
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmModal
            icon="ti-trash"
            title="Delete score entry?"
            message={<>Remove <strong>{entry.label}</strong> ({entry.score}/{entry.max_score})? This cannot be undone.</>}
            loading={deleting}
            onConfirm={handleConfirmDelete}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
      </AnimatePresence>
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
// ── Narrative Rating constants ────────────────────────────────────────────────
const NARRATIVE_RATINGS = [
  { value: "outstanding",       label: "Outstanding",       color: "#1455a0", bg: "#e3f0fd" },
  { value: "satisfactory",      label: "Satisfactory",      color: "#2e6b0d", bg: "#e8f5e0" },
  { value: "needs_improvement", label: "Needs Improvement", color: "#854f0b", bg: "#faeeda" },
];

function NarrativeSection({ enrollment, gradingPeriod, periods, onPeriodChange, categories, reports, loading, savingStates, onRatingChange }) {
  const reportMap = {};
  reports.forEach((r) => { reportMap[r.category] = r; });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      style={{ background: "white", borderRadius: 16, border: "1px solid #ede8fd", overflow: "hidden", boxShadow: "0 2px 16px rgba(124,58,237,0.07)" }}
    >
      <div style={{ height: 4, background: "linear-gradient(to right,#7c3aed,#a78bfa,#c4b5fd)" }} />
      <div style={{ padding: "18px 22px", borderBottom: "1px solid #f0ecfd", background: "linear-gradient(to right,#fdfaff,white)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a0a0a", display: "flex", alignItems: "center", gap: 8 }}>
              <i className="ti ti-clipboard-text" style={{ fontSize: 16, color: "#7c3aed" }} />
              Narrative Report
            </div>
            <div style={{ fontSize: 12, color: "#b09090", marginTop: 3 }}>
              Behavioral &amp; learning assessment for {enrollment.grade_level} · {enrollment.section}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {periods.map((p) => {
              const active = gradingPeriod === p;
              return (
                <motion.button key={p} initial={false}
                  animate={{ backgroundColor: active ? "#f0e8fd" : "#ffffff", color: active ? "#7c3aed" : "#9a7070", borderColor: active ? "#7c3aed" : "#e8e0f0" }}
                  transition={{ duration: 0.16 }} whileTap={{ scale: 0.96 }} onClick={() => onPeriodChange(p)}
                  style={{ height: 28, padding: "0 12px", borderRadius: 99, border: "1.5px solid", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                  {PERIOD_LABELS[p]}
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
          {[1,2,3].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fdfafa", borderRadius: 10 }}>
              <Sk w="28%" h={14} />
              <div style={{ flex: 1, display: "flex", gap: 6 }}><Sk w={110} h={28} r={99} /><Sk w={110} h={28} r={99} /><Sk w={140} h={28} r={99} /></div>
            </div>
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div style={{ padding: "32px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#b09090" }}>
            No narrative categories configured.{" "}
            <a href="/narrative-categories" style={{ color: "#7c3aed", fontWeight: 600 }}>Go to Settings → Narrative Categories</a>{" "}to add some.
          </div>
        </div>
      ) : (
        <div style={{ padding: "12px 22px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          {categories.map((cat) => {
            const existing      = reportMap[cat.category_id] ?? null;
            const currentRating = existing?.rating ?? null;
            const saving        = savingStates[cat.category_id] ?? false;
            return (
              <div key={cat.category_id}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", background: "#fdfafa", borderRadius: 10, border: "1px solid #f0ecfd" }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "#c4b5fd"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "#f0ecfd"}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "#1a0a0a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.name}</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
                  {NARRATIVE_RATINGS.map((r) => {
                    const active = currentRating === r.value;
                    return (
                      <motion.button key={r.value} onClick={() => !saving && onRatingChange(cat, existing, r.value)} disabled={saving}
                        initial={false}
                        animate={{ backgroundColor: active ? r.bg : "#ffffff", color: active ? r.color : "#9a7070", borderColor: active ? r.color : "#e8e0f0" }}
                        transition={{ duration: 0.15 }} whileTap={{ scale: 0.96 }}
                        style={{ height: 28, padding: "0 10px", borderRadius: 99, border: "1.5px solid", fontSize: 11, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 4, opacity: saving && !active ? 0.5 : 1 }}>
                        {saving && active && <i className="ti ti-loader-2" style={{ fontSize: 10, animation: "spin 1s linear infinite" }} />}
                        {r.label}
                      </motion.button>
                    );
                  })}
                  {currentRating && (
                    <motion.button onClick={() => !saving && onRatingChange(cat, existing, null)} disabled={saving}
                      whileHover={{ backgroundColor: "#fff0f0", color: "#e03131", borderColor: "#fca5a5" }} whileTap={{ scale: 0.96 }} transition={{ duration: 0.12 }}
                      title="Clear rating"
                      style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px solid #e8e0f0", background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: saving ? "not-allowed" : "pointer", color: "#c0a0c0" }}>
                      <i className="ti ti-x" style={{ fontSize: 10 }} />
                    </motion.button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

export default function GradesPage() {
  usePageTitle("Grades");
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

    // ── Narrative report state ────────────────────────────────────────────────
  const [narrativeCategories,   setNarrativeCategories]   = useState([]);
  const [narrativeReports,      setNarrativeReports]      = useState([]);
  const [loadingNarrative,      setLoadingNarrative]      = useState(false);
  const [narrativeSavingStates, setNarrativeSavingStates] = useState({});

  // ── Deep link: /grades?student=<id> preselects a student (e.g. from a
  // "View Grades" quick-link on the Students list) so staff land straight on
  // the overview tab instead of using the manual picker. ──────────────────────
  useEffect(() => {
    const studentId = new URLSearchParams(location.search).get("student");
    if (!studentId) return;
    getStudent(studentId)
      .then((s) => { if (s) setStudent(s); })
      .catch(() => toast.error("Could not load the requested student."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

    useEffect(() => {
    getNarrativeCategories({ is_active: true, page_size: 100 })
      .then((d) => setNarrativeCategories(Array.isArray(d) ? d : d?.results ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "entry" || !enrollment || !gradingPeriod) { setNarrativeReports([]); return; }
    setLoadingNarrative(true);
    getNarrativeReports({ enrollment: enrollment.enrollment_id, grading_period: gradingPeriod, page_size: 100 })
      .then((d) => setNarrativeReports(Array.isArray(d) ? d : d?.results ?? []))
      .catch(() => {})
      .finally(() => setLoadingNarrative(false));
  }, [tab, enrollment, gradingPeriod]);

  const handleNarrativeRating = useCallback(async (category, existingReport, newRating) => {
    const catId = category.category_id;
    setNarrativeSavingStates((prev) => ({ ...prev, [catId]: true }));
    try {
      if (newRating === null) {
        if (existingReport) {
          await deleteNarrativeReport(existingReport.report_id);
          setNarrativeReports((prev) => prev.filter((r) => r.report_id !== existingReport.report_id));
        }
      } else if (existingReport) {
        const updated = await updateNarrativeReport(existingReport.report_id, { rating: newRating });
        setNarrativeReports((prev) => prev.map((r) => r.report_id === updated.report_id ? updated : r));
      } else {
        const created = await createNarrativeReport({ enrollment: enrollment.enrollment_id, category: catId, grading_period: gradingPeriod, rating: newRating });
        setNarrativeReports((prev) => [...prev, created]);
      }
    } catch (e) {
      console.error("Failed to save narrative report:", e);
      toast.error(e?.message || "Failed to save narrative rating.");
    }
    finally { setNarrativeSavingStates((prev) => ({ ...prev, [catId]: false })); }
  }, [enrollment, gradingPeriod]);

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
      toast.success("Final grade saved.");
      await loadScores();
      // Refresh summary grades too
      if (enrollment) {
        getGrades({ enrollment: enrollment.enrollment_id, page_size: 200 })
          .then((d) => setSumGrades(Array.isArray(d) ? d : d?.results ?? []))
          .catch(() => {});
      }
    } catch (e) {
      const msg = e.message || "Failed to save grade.";
      setEntryError(msg);
      toast.error(msg);
    }
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

  // ── Shared enrollment chip renderer (used in both summary + entry left panels) ─
  const EnrollmentChip = ({ en, onClick }) => {
    const lvlMeta = SCHOOL_LEVEL_META[en.school_level] ?? SCHOOL_LEVEL_META.elementary;
    const active  = enrollment?.enrollment_id === en.enrollment_id;
    return (
      <motion.button
        onClick={onClick}
        whileHover={{ backgroundColor: active ? lvlMeta.bg : "#fff8f6" }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.12 }}
        style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:12, border:`1.5px solid ${active ? lvlMeta.color : "#f0e4e4"}`, background: active ? lvlMeta.bg : "white", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif", transition:"border-color 0.14s" }}
      >
        <div style={{ width:34, height:34, borderRadius:9, background: active ? lvlMeta.color + "22" : "#f5f0f0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <i className="ti ti-clipboard-list" style={{ fontSize:15, color: active ? lvlMeta.color : "#9a7070" }} />
        </div>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ fontSize:13, fontWeight:700, color: active ? lvlMeta.color : "#1a0a0a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>S.Y. {en.school_year}</div>
          <div style={{ fontSize:11, color:"#b09090", marginTop:2 }}>{en.grade_level} · {en.section}</div>
        </div>
        <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background: lvlMeta.bg, color: lvlMeta.color, flexShrink:0 }}>
          {lvlMeta.label}
        </span>
      </motion.button>
    );
  };

  // ── Left panel (shared) ───────────────────────────────────────────────────
  const leftPanel = (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Student picker */}
      <motion.div
        initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
        transition={{ duration:0.22, ease:"easeOut" }}
        style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"visible", boxShadow:"0 2px 12px rgba(224,49,49,0.05)", position:"relative", zIndex:10 }}
      >
        <div style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:10, borderRadius:"16px 16px 0 0" }}>
          <div style={{ width:28, height:28, borderRadius:8, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <i className="ti ti-user-search" style={{ fontSize:14, color:"#e03131" }} />
          </div>
          <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>Select Student</span>
        </div>
        <div style={{ padding:"14px 18px", borderRadius:"0 0 16px 16px", overflow:"visible" }}>
          <StudentPicker value={student} onChange={(s) => { setStudent(s); setEnrollment(null); setSubject(null); setComputation(null); }} />
        </div>
      </motion.div>

      {/* Student profile card */}
      <AnimatePresence>
        {student && (
          <motion.div
            key="profile"
            initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }}
            transition={{ duration:0.2, ease:"easeOut" }}
            style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}
          >
            <div style={{ height:4, background:"linear-gradient(to right,#e03131,#ff6b6b,#fca5a5)" }} />
            <div style={{ padding:"16px 18px", display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:48, height:48, borderRadius:"50%", background:palette.bg, color:palette.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:17, flexShrink:0, border:`2px solid ${palette.color}33` }}>{initials}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fullName}</div>
                <div style={{ fontSize:12, color:"#b09090", marginTop:2 }}>LRN {student.lrn}</div>
                <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:99, background: student.status==="active"?"#e8f5e0":"#f0ede8", color: student.status==="active"?"#2e6b0d":"#5c5752", marginTop:4, display:"inline-block" }}>
                  {student.status}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enrollment picker — same card style for both tabs */}
      <AnimatePresence>
        {student && (
          <motion.div
            key="enrollments"
            initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }}
            transition={{ duration:0.2, ease:"easeOut", delay:0.05 }}
            style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}
          >
            <div style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:28, height:28, borderRadius:8, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <i className="ti ti-clipboard-list" style={{ fontSize:14, color:"#e03131" }} />
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>
                {tab === "entry" ? "Select Enrollment" : "Select School Year"}
              </span>
            </div>
            <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:8, maxHeight:260, overflowY:"auto" }}>
              {loadingEnr
                ? [1,2].map((i) => (
                    <div key={i} style={{ padding:"10px 14px", borderRadius:12, border:"1px solid #f5eaea" }}>
                      <Sk w="80%" h={14} /><div style={{ marginTop:6 }}><Sk w="50%" h={11} /></div>
                    </div>
                  ))
                : enrollments.length === 0
                  ? <div style={{ fontSize:13, color:"#b09090", textAlign:"center", padding:"16px 0", fontStyle:"italic" }}>
                      {tab === "entry" ? "No active enrollments found." : "No enrollments found."}
                    </div>
                  : enrollments.map((en) => (
                      <EnrollmentChip
                        key={en.enrollment_id}
                        en={en}
                        onClick={() => { setEnrollment(en); setSubject(null); setComputation(null); }}
                      />
                    ))
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary: mini stat cards */}
      <AnimatePresence>
        {tab === "summary" && enrollment && !loadingSum && sumGrades.length > 0 && (
          <motion.div
            key="sum-stats"
            initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
            transition={{ duration:0.2, ease:"easeOut" }}
            style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}
          >
            {[
              { label:"Recorded", value:gradeCount,                   color:"#e03131", bg:"#fff0f0", icon:"ti-clipboard-check" },
              { label:"Passed",   value:passedCount,                  color:"#2e6b0d", bg:"#e8f5e0", icon:"ti-circle-check"   },
              { label:"Failed",   value:failedCount,                  color:"#9b2020", bg:"#fde8e8", icon:"ti-circle-x"       },
              { label:"Average",  value:overallAvg?.toFixed(2) ?? "—", color:"#1455a0", bg:"#e3f0fd", icon:"ti-chart-bar"     },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                transition={{ duration:0.18, ease:"easeOut", delay: i * 0.05 }}
                whileHover={{ y:-2, boxShadow:"0 6px 18px rgba(224,49,49,0.10)" }}
                style={{ background:"white", borderRadius:12, border:"1px solid #f5eaea", padding:"12px 14px", display:"flex", alignItems:"center", gap:10, boxShadow:"0 2px 8px rgba(224,49,49,0.04)" }}
              >
                <div style={{ width:32, height:32, borderRadius:8, background:s.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize:15, color:s.color }} />
                </div>
                <div>
                  <div style={{ fontSize:18, fontWeight:700, color:"#1a0a0a", lineHeight:1 }}>{s.value}</div>
                  <div style={{ fontSize:10, color:"#a07878", marginTop:3, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:500 }}>{s.label}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entry: subject picker (step 3) */}
      <AnimatePresence>
        {tab === "entry" && enrollment && (
          <motion.div
            key="subjects"
            initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }}
            transition={{ duration:0.2, ease:"easeOut" }}
            style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}
          >
            <div style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:28, height:28, borderRadius:8, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <i className="ti ti-book" style={{ fontSize:14, color:"#e03131" }} />
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>Select Subject</span>
            </div>
            <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:6, maxHeight:240, overflowY:"auto" }}>
              {entSubjects.length === 0
                ? <div style={{ fontSize:13, color:"#b09090", textAlign:"center", padding:"16px 0", fontStyle:"italic" }}>No subjects for this level.</div>
                : entSubjects.map((sub) => {
                    const active = subject?.subject_id === sub.subject_id;
                    const hasTpl = Boolean(sub.grading_template_detail);
                    return (
                      <motion.button
                        key={sub.subject_id}
                        onClick={() => { setSubject(sub); setComputation(null); }}
                        whileHover={{ backgroundColor: active ? "#fff0f0" : "#fff8f6" }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.12 }}
                        style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:12, border:`1.5px solid ${active ? "#e03131" : "#f0e4e4"}`, background: active ? "#fff0f0" : "white", cursor:"pointer", textAlign:"left", fontFamily:"'DM Sans',sans-serif", transition:"border-color 0.14s" }}
                      >
                        <div style={{ width:34, height:34, borderRadius:9, background: active ? "#fde8e8" : "#f5f0f0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <i className="ti ti-book" style={{ fontSize:15, color: active ? "#e03131" : "#9a7070" }} />
                        </div>
                        <div style={{ minWidth:0, flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:700, color: active ? "#e03131" : "#1a0a0a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sub.subject_name}</div>
                          <div style={{ fontSize:11, color:"#b09090", marginTop:2, display:"flex", alignItems:"center", gap:5 }}>
                            <span style={{ fontFamily:"monospace" }}>{sub.subject_code}</span>
                            {hasTpl
                              ? <span style={{ color:"#2e6b0d", fontSize:10, fontWeight:600 }}>· {sub.grading_template_detail.template_name}</span>
                              : <span style={{ color:"#c0a0a0", fontSize:10, fontStyle:"italic" }}>· No template</span>
                            }
                          </div>
                        </div>
                      </motion.button>
                    );
                  })
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entry: grading period (step 4) */}
      <AnimatePresence>
        {tab === "entry" && subject && (
          <motion.div
            key="periods"
            initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }}
            transition={{ duration:0.2, ease:"easeOut" }}
            style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}
          >
            <div style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:28, height:28, borderRadius:8, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <i className="ti ti-calendar-event" style={{ fontSize:14, color:"#e03131" }} />
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>Grading Period</span>
            </div>
            <div style={{ padding:"14px 18px", display:"flex", flexWrap:"wrap", gap:8 }}>
              {periods.map((p) => {
                const active = gradingPeriod === p;
                return (
                  <motion.button
                    key={p}
                    initial={false}
                    animate={{ backgroundColor: active ? "#e3f0fd" : "#ffffff", color: active ? "#1455a0" : "#9a7070", borderColor: active ? "#1455a0" : "#f0e4e4" }}
                    transition={{ duration:0.16, ease:"easeOut" }}
                    whileTap={{ scale:0.96 }}
                    onClick={() => { setGradingPeriod(p); setComputation(null); }}
                    style={{ display:"inline-flex", alignItems:"center", gap:6, height:32, padding:"0 14px", borderRadius:99, fontSize:12, fontWeight:600, border:"1.5px solid", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                  >
                    {PERIOD_LABELS[p]}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );

  // ── Summary right panel ───────────────────────────────────────────────────
  const summaryPanel = !student ? (
    <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.2, ease:"easeOut" }}
      style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"80px 24px", textAlign:"center", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
      <div style={{ width:60, height:60, borderRadius:18, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
        <i className="ti ti-table" style={{ fontSize:28, color:"#e08080" }} />
      </div>
      <div style={{ fontSize:16, color:"#7a5050", fontWeight:600 }}>No student selected</div>
      <div style={{ fontSize:13, color:"#b09090", marginTop:6 }}>Search for a student on the left to view their grade report.</div>
    </motion.div>
  ) : !enrollment ? (
    <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.2, ease:"easeOut" }}
      style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"80px 24px", textAlign:"center", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
      <div style={{ width:60, height:60, borderRadius:18, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
        <i className="ti ti-clipboard-list" style={{ fontSize:28, color:"#e08080" }} />
      </div>
      <div style={{ fontSize:16, color:"#7a5050", fontWeight:600 }}>Select a school year</div>
      <div style={{ fontSize:13, color:"#b09090", marginTop:6 }}>Pick an enrollment from the left to see the grade table.</div>
    </motion.div>
  ) : (
    <motion.div
      key={enrollment.enrollment_id}
      initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
      transition={{ duration:0.22, ease:"easeOut" }}
      style={{ display:"flex", flexDirection:"column", gap:14 }}
    >
      <SummaryTable enrollment={enrollment} grades={sumGrades} subjects={sumSubjects} loading={loadingSum} />

      {!loadingSum && sumGrades.length === 0 && (
        <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.18 }}
          style={{ background:"#fef3e2", border:"1px solid #f6c96a", borderRadius:16, padding:"24px 28px", display:"flex", alignItems:"flex-start", gap:14 }}>
          <i className="ti ti-alert-triangle" style={{ fontSize:22, color:"#854f0b", flexShrink:0, marginTop:2 }} />
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#854f0b" }}>No grades recorded yet</div>
            <div style={{ fontSize:13, color:"#7a4a08", marginTop:4, lineHeight:1.6 }}>Use the Grade Entry tab to start recording scores.</div>
            <motion.button
              onClick={() => setTab("entry")}
              whileHover={{ opacity:0.88 }} whileTap={{ scale:0.97 }} transition={{ duration:0.12 }}
              style={{ marginTop:12, display:"inline-flex", alignItems:"center", gap:6, background:"#854f0b", color:"white", border:"none", borderRadius:8, padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
              <i className="ti ti-pencil" style={{ fontSize:12 }} />Go to Grade Entry
            </motion.button>
          </div>
        </motion.div>
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
    </motion.div>
  );

  // ── Entry right panel ─────────────────────────────────────────────────────
  const entryPanel = (
    <>
    {!student || !enrollment ? (
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

      {/* ── Subject header card — mirrors SummaryTable header ── */}
      <motion.div
        initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
        transition={{ duration:0.22, ease:"easeOut" }}
        style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}
      >
        <div style={{ height:4, background:"linear-gradient(to right,#e03131,#ff6b6b,#fca5a5)" }} />
        <div style={{ padding:"18px 22px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, background:"linear-gradient(to right,#fdfafa,white)" }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:"#1a0a0a" }}>{subject.subject_name}</div>
            <div style={{ fontSize:12, color:"#b09090", marginTop:3, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
              <span style={{ fontFamily:"monospace", background:"#f5f0f0", padding:"1px 7px", borderRadius:5, fontSize:11 }}>{subject.subject_code}</span>
              <span>·</span>
              <span>{template.template_name}</span>
              <span>·</span>
              <span style={{ fontWeight:600, color:"#1455a0" }}>{PERIOD_LABELS[gradingPeriod]}</span>
            </div>
          </div>
          {existingGrade && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:11, color:"#b09090", marginBottom:4, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em" }}>Saved Grade</div>
              <div style={{ fontSize:28, fontWeight:700, padding:"5px 18px", borderRadius:12, lineHeight:1, ...gradeColor(existingGrade.numeric_grade) }}>
                {parseFloat(existingGrade.numeric_grade).toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {/* Mini stat cards inside header — scores entered, components, weight total */}
        <div style={{ padding:"14px 22px", display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
          {[
            { label:"Scores Entered",  value: scoreEntries.length,      color:"#e03131", bg:"#fff0f0", icon:"ti-list-numbers"   },
            { label:"Components",      value: components.length,         color:"#1455a0", bg:"#e3f0fd", icon:"ti-layout-columns" },
            { label:"Template Weight", value: template.total_weight != null ? `${template.total_weight}%` : "—", color:"#2e6b0d", bg:"#e8f5e0", icon:"ti-percentage" },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
              transition={{ duration:0.18, ease:"easeOut", delay: i * 0.05 }}
              style={{ background:"#fdfafa", borderRadius:10, border:"1px solid #f5eaea", padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}
            >
              <div style={{ width:28, height:28, borderRadius:7, background:s.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <i className={`ti ${s.icon}`} style={{ fontSize:13, color:s.color }} />
              </div>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:"#1a0a0a", lineHeight:1 }}>{loadingScores ? "—" : s.value}</div>
                <div style={{ fontSize:9.5, color:"#a07878", marginTop:2, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:500 }}>{s.label}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Notifications */}
      <AnimatePresence>
        {entryError && (
          <motion.div key="err" initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }} transition={{ duration:0.16 }}
            style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#b91c1c", display:"flex", alignItems:"center", gap:8 }}>
            <i className="ti ti-alert-circle" style={{ fontSize:15 }} />{entryError}
            <button onClick={() => setEntryError("")} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color:"#b91c1c" }}><i className="ti ti-x" style={{ fontSize:13 }} /></button>
          </motion.div>
        )}
        {savedMsg && (
          <motion.div key="ok" initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }} transition={{ duration:0.16 }}
            style={{ background:"#e8f5e0", border:"1px solid #a3d977", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#2e6b0d", display:"flex", alignItems:"center", gap:8 }}>
            <i className="ti ti-circle-check" style={{ fontSize:15 }} />{savedMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grading components */}
      {loadingScores ? (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {[1,2,3].map((i) => (
            <div key={i} style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"20px 22px" }}>
              <Sk w="40%" h={16} /><div style={{ marginTop:12 }}><Sk w="100%" h={40} /></div>
            </div>
          ))}
        </div>
      ) : (
        components.map((comp, ci) => {
          const color    = COMPONENT_COLORS[ci % COMPONENT_COLORS.length];
          const entries  = scoresByComponent[comp.grading_component_id] ?? [];
          const avgPct   = entries.length > 0 ? entries.reduce((s, e) => s + (e.score / e.max_score) * 100, 0) / entries.length : null;
          const weighted = avgPct !== null ? (avgPct * comp.weight) / 100 : null;
          return (
            <motion.div
              key={comp.grading_component_id}
              initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
              transition={{ duration:0.22, ease:"easeOut", delay: ci * 0.06 }}
              style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}
            >
              <div style={{ padding:"14px 18px", borderBottom:"1px solid #f9f0f0", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(to right,#fdfafa,white)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:10, height:10, borderRadius:"50%", background:color, flexShrink:0 }} />
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
            </motion.div>
          );
        })
      )}

      {/* Compute & save */}
      {!loadingScores && scoreEntries.length > 0 && (
        <motion.div
          initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
          transition={{ duration:0.22, ease:"easeOut" }}
          style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}
        >
          <div style={{ padding:"16px 22px", borderBottom: computation ? "1px solid #f5eaea" : "none", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:14, background:"linear-gradient(to right,#fdfafa,white)" }}>
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
              <motion.button
                onClick={handleCompute} disabled={computing}
                whileHover={!computing ? { backgroundColor:"#fff0f0" } : {}}
                whileTap={!computing ? { scale:0.97 } : {}}
                transition={{ duration:0.12 }}
                style={{ display:"inline-flex", alignItems:"center", gap:6, background:"white", color:"#e03131", border:"1.5px solid #fca5a5", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:computing?"not-allowed":"pointer", fontFamily:"'DM Sans',sans-serif" }}
              >
                {computing ? <i className="ti ti-loader-2" style={{ fontSize:14, animation:"spin 1s linear infinite" }} /> : <i className="ti ti-calculator" style={{ fontSize:14 }} />}
                {computing ? "Computing…" : "Compute"}
              </motion.button>
              {computation && (
                <motion.button
                  onClick={handleSaveFinal} disabled={savingFinal}
                  whileHover={!savingFinal ? { opacity:0.88 } : {}}
                  whileTap={!savingFinal ? { scale:0.97 } : {}}
                  transition={{ duration:0.12 }}
                  style={{ display:"inline-flex", alignItems:"center", gap:6, background:savingFinal?"#e87474":"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:savingFinal?"not-allowed":"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}
                >
                  {savingFinal ? <i className="ti ti-loader-2" style={{ fontSize:14, animation:"spin 1s linear infinite" }} /> : <i className="ti ti-device-floppy" style={{ fontSize:14 }} />}
                  {savingFinal ? "Saving…" : existingGrade ? "Update Grade" : "Save Grade"}
                </motion.button>
              )}
            </div>
          </div>

          {computation && (
            <div style={{ padding:"16px 22px" }}>
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
        </motion.div>
      )}
    </div>
  )}
    {enrollment && (
      <div style={{ marginTop: 14 }}>
        <NarrativeSection
          enrollment={enrollment}
          gradingPeriod={gradingPeriod}
          periods={periods}
          onPeriodChange={(p) => { setGradingPeriod(p); setComputation(null); }}
          categories={narrativeCategories}
          reports={narrativeReports}
          loading={loadingNarrative}
          savingStates={narrativeSavingStates}
          onRatingChange={handleNarrativeRating}
        />
      </div>
    )}
    </>
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
        {tab === "overview" ? (
          <OverviewTab onNavigate={(targetTab, studentObj, enrollmentObj) => {
            setStudent(studentObj);
            setEnrollment(enrollmentObj);
            setSubject(null);
            setComputation(null);
            setTab(targetTab);
          }} />
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
