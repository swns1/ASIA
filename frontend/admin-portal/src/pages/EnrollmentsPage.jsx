import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "../components/AppLayout";
import EmptyState from "../components/EmptyState";
import { modalVariants, springTransition } from "../utils/motion";


// ── API ───────────────────────────────────────────────────────────────────────
import {
  getEnrollments as apiGetEnrollments,
  getEnrollmentEligibility as apiGetEligibility,
  updateEnrollment as apiPatchEnrollment,
  bulkCreateEnrollments as apiBulkEnroll,
  promotePreview,
  promoteConfirm,
} from "../api/enrollmentApi";
import { getStudents as apiGetStudents } from "../api/studentApi";
import { getCurrentUser, hasAnyRole, ACADEMIC_STAFF } from "../utils/auth";
import { useSchoolYear } from "../context/SchoolYearContext";

// ── Grade progression helpers ─────────────────────────────────────────────────
const ALL_GRADES_ORDERED = [
  "Nursery","Kindergarten",
  "Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6",
  "Grade 7","Grade 8","Grade 9","Grade 10",
  "Grade 11","Grade 12",
];

function getNextGrade(g) {
  const i = ALL_GRADES_ORDERED.indexOf(g);
  return i === -1 || i === ALL_GRADES_ORDERED.length - 1 ? null : ALL_GRADES_ORDERED[i + 1];
}

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

// ─── Mass Enroll Modal ────────────────────────────────────────────────────────
const SCHOOL_LEVELS_MODAL = [
  { value: "nursery",           label: "Nursery"            },
  { value: "kindergarten",      label: "Kindergarten"       },
  { value: "elementary",        label: "Elementary"         },
  { value: "junior_highschool", label: "Junior High School" },
  { value: "senior_highschool", label: "Senior High School" },
];
const GRADE_LEVELS_BY_LEVEL_MODAL = {
  nursery:           ["Nursery"],
  kindergarten:      ["Kindergarten"],
  elementary:        ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"],
  junior_highschool: ["Grade 7","Grade 8","Grade 9","Grade 10"],
  senior_highschool: ["Grade 11","Grade 12"],
};
const SHS_STRANDS = ["STEM","ABM","HUMSS","GAS","TVL-ICT","TVL-HE","TVL-IA","TVL-AFA","Arts and Design","Sports"];
const SEMESTERS   = [{ value:"1st", label:"1st Semester" },{ value:"2nd", label:"2nd Semester" }];

const inp = {
  border:"1.5px solid #fde2de", borderRadius:9, padding:"8px 12px",
  fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a",
  background:"#fffbfb", outline:"none", width:"100%", boxSizing:"border-box",
};
const sel = { ...inp, cursor:"pointer" };
const lbl = { display:"block", fontSize:10, fontWeight:700, color:"#9a7070", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:5 };

function MassEnrollModal({ onClose, onSuccess, initSchoolYear, initSchoolLevel, initGradeLevel }) {
  const [schoolYear,  setSchoolYear]  = useState(initSchoolYear  || "");
  const [schoolLevel, setSchoolLevel] = useState(initSchoolLevel || "elementary");
  const [gradeLevel,  setGradeLevel]  = useState(initGradeLevel  || "Grade 1");
  const [section,     setSection]     = useState("");
  const [strand,      setStrand]      = useState("");
  const [semester,    setSemester]    = useState("1st");

  const [searchQuery,    setSearchQuery]    = useState("");
  const [candidates,     setCandidates]     = useState([]);
  const [candLoading,    setCandLoading]    = useState(false);
  const [enrolled,       setEnrolled]       = useState([]);
  const [enrollLoading,  setEnrollLoading]  = useState(false);
  const [selected,       setSelected]       = useState(new Set());
  const [saving,         setSaving]         = useState(false);
  const [saveResult,     setSaveResult]     = useState(null); // { created, failed }
  const [error,          setError]          = useState("");
  const [removing,       setRemoving]       = useState(new Set());
  const [pendingRemove,  setPendingRemove]  = useState(null); // enrollment obj awaiting confirm
  // eligibilityMap: { [student_id]: { is_eligible, missing_docs, blocking_reasons } }
  const [eligibilityMap, setEligibilityMap] = useState({});

  const isSHS = schoolLevel === "senior_highschool";
  const gradeOpts = GRADE_LEVELS_BY_LEVEL_MODAL[schoolLevel] ?? [];
  // SHS also requires strand before the class is considered ready
  const classReady = schoolYear && schoolLevel && gradeLevel && section.trim()
    && (!isSHS || strand.trim());

  // When school level changes, reset grade to first option and clear strand
  useEffect(() => {
    const opts = GRADE_LEVELS_BY_LEVEL_MODAL[schoolLevel] ?? [];
    setGradeLevel(opts[0] ?? "");
    setStrand("");
  }, [schoolLevel]);

  const reloadEnrolled = () => {
    if (!classReady) return;
    setEnrollLoading(true);
    const params = new URLSearchParams({
      school_year: schoolYear, school_level: schoolLevel,
      grade_level: gradeLevel, section: section.trim(), page_size: 200,
    });
    apiGetEnrollments(Object.fromEntries(params))
      .then((d) => setEnrolled((d.results ?? []).filter((e) => e.enrollment_status !== "cancelled")))
      .catch(() => setEnrolled([]))
      .finally(() => setEnrollLoading(false));
  };

  // Fetch enrolled students when class fields are complete
  useEffect(() => {
    if (!classReady) { setEnrolled([]); return; }
    reloadEnrolled();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolYear, schoolLevel, gradeLevel, section, strand]);

  // Debounced candidate search — uses last *completed* enrollment as progression baseline
  const searchTimer = useRef(null);
  useEffect(() => {
    if (!classReady) { setCandidates([]); setEligibilityMap({}); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setCandLoading(true);
      try {
        const params = new URLSearchParams({ status: "active", page_size: 50, school_level: schoolLevel, grade_level: gradeLevel });
        if (searchQuery.trim()) params.set("search", searchQuery.trim());
        const data = await apiGetStudents(Object.fromEntries(params));
        const students = data.results ?? [];

        const enrolledIds = new Set(enrolled.map((e) => e.student_id ?? e.student));

        // Fetch last COMPLETED enrollment for each student in parallel
        const pairs = await Promise.all(
          students.map(async (st) => {
            if (enrolledIds.has(st.student_id)) return null; // already in this class
            try {
              const d = await apiGetEnrollments({
                student: st.student_id, enrollment_status: "completed", page_size: 100,
              });
              const completed = d.results ?? [];
              if (!completed.length) return { ...st, lastGrade: null }; // new student
              const latest = completed.reduce((a, b) =>
                (a.school_year > b.school_year || (a.school_year === b.school_year && a.enrollment_id > b.enrollment_id)) ? a : b
              );
              return { ...st, lastGrade: latest.grade_level ?? null };
            } catch { return { ...st, lastGrade: null }; }
          })
        );

        const eligible = pairs.filter((st) => {
          if (!st) return false;
          if (st.lastGrade === null) return true; // new student — eligible for any grade
          return getNextGrade(st.lastGrade) === gradeLevel || st.lastGrade === gradeLevel; // promotion or retention
        });
        setCandidates(eligible);

        // Fetch eligibility details for visible candidates (non-blocking)
        const eligMap = {};
        await Promise.all(
          eligible.map(async (st) => {
            try {
              const e = await apiGetEligibility(st.student_id);
              eligMap[st.student_id] = e;
            } catch { /* non-critical */ }
          })
        );
        setEligibilityMap(eligMap);
      } catch { setCandidates([]); }
      finally { setCandLoading(false); }
    }, 320);
    return () => clearTimeout(searchTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, classReady, gradeLevel, enrolled]);

  const toggleSelect = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const allSelected = candidates.length > 0 && candidates.every((c) => selected.has(c.student_id));
  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(candidates.map((c) => c.student_id)));

  // Single bulk API call — creates students as Pending
  const handleEnroll = async () => {
    setError("");
    setSaveResult(null);
    setSaving(true);
    try {
      const result = await apiBulkEnroll({
        students:          [...selected],
        school_year:       schoolYear,
        school_level:      schoolLevel,
        grade_level:       gradeLevel,
        section:           section.trim(),
        enrollment_status: "pending",
        strand:   isSHS ? (strand   || null) : null,
        semester: isSHS ? (semester || null) : null,
      });
      setSelected(new Set());
      setSaveResult(result);
      reloadEnrolled();
      if (!result.failed?.length) onSuccess?.();
    } catch (e) {
      setError(e.message || "Bulk enrollment failed.");
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    const en = pendingRemove;
    setPendingRemove(null);
    const eid = en.enrollment_id;
    setRemoving((prev) => new Set([...prev, eid]));
    try {
      await apiPatchEnrollment(eid, { enrollment_status: "cancelled" });
      setEnrolled((prev) => prev.filter((e) => e.enrollment_id !== eid));
      onSuccess?.();
    } catch { setError("Failed to remove student from class."); }
    finally { setRemoving((prev) => { const n = new Set(prev); n.delete(eid); return n; }); }
  };

  const avatarFor = (name = "X") => {
    const palettes = [
      { bg:"#fde8e8",color:"#c0392b" },{ bg:"#e8f0fd",color:"#2563eb" },
      { bg:"#e8fdf0",color:"#16a34a" },{ bg:"#fdf5e8",color:"#d97706" },
      { bg:"#f0e8fd",color:"#7c3aed" },{ bg:"#fde8f8",color:"#be185d" },
      { bg:"#e8fdfd",color:"#0891b2" },
    ];
    return palettes[name.charCodeAt(0) % palettes.length];
  };

  return (
    <div style={{ position:"fixed", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:1200 }}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{ position:"absolute", inset:0, background:"rgba(26,10,10,0.45)", backdropFilter:"blur(4px)" }}
      />
      {/* Dialog */}
      <motion.div
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={springTransition}
        style={{ position:"relative", background:"white", borderRadius:20, width:"min(960px,96vw)", maxHeight:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 24px 64px rgba(224,49,49,0.18)", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ padding:"20px 26px 16px", borderBottom:"1px solid #f5eaea", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <i className="ti ti-users-plus" style={{ fontSize:17, color:"#e03131" }} />
              </div>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:"#1a0a0a" }}>Mass Enroll</div>
                <div style={{ fontSize:11.5, color:"#b09090" }}>Bulk-assign students to a class section · Created as <strong>Pending</strong></div>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.08, backgroundColor: "#fff0f0", color: "#e03131" }}
              whileTap={{ scale: 0.93 }}
              transition={{ duration: 0.12 }}
              onClick={onClose}
              style={{ background:"none", border:"1px solid #f0e4e4", borderRadius:8, width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070" }}>
              <i className="ti ti-x" style={{ fontSize:14 }} />
            </motion.button>
          </div>

          {/* Class config row */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1.2fr 1fr", gap:10 }}>
            <div>
              <label style={lbl}>School Level</label>
              <select value={schoolLevel} onChange={(e) => setSchoolLevel(e.target.value)} style={sel}>
                {SCHOOL_LEVELS_MODAL.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Grade Level</label>
              <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} style={sel}>
                {gradeOpts.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Section <span style={{ color:"#e03131" }}>*</span></label>
              <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Sampaguita" style={inp} />
            </div>
            <div>
              <label style={lbl}>School Year</label>
              <select value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} style={sel}>
                <option value="">— Select year —</option>
                {(() => {
                  const d = new Date();
                  const base = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
                  return Array.from({ length: 4 }, (_, i) => { const y = base + 1 - i; return `${y}-${y+1}`; });
                })().map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          {isSHS && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10, marginTop:10 }}>
              <div style={{ gridColumn:"1/3" }}>
                <label style={lbl}>Strand <span style={{ color:"#e03131" }}>*</span></label>
                <select value={strand} onChange={(e) => setStrand(e.target.value)} style={{ ...sel, borderColor: isSHS && !strand ? "#fca5a5" : undefined }}>
                  <option value="">— Select strand —</option>
                  {SHS_STRANDS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {isSHS && !strand && (
                  <div style={{ fontSize:10, color:"#e03131", marginTop:3 }}>Strand is required for Senior HS</div>
                )}
              </div>
              <div style={{ gridColumn:"3/5" }}>
                <label style={lbl}>Semester</label>
                <select value={semester} onChange={(e) => setSemester(e.target.value)} style={sel}>
                  {SEMESTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Body — two panels */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", flex:1, minHeight:0, overflow:"hidden" }}>

          {/* Left panel — Add Students */}
          <div style={{ display:"flex", flexDirection:"column", borderRight:"1px solid #f5eaea", minHeight:0 }}>
            <div style={{ padding:"12px 18px 10px", borderBottom:"1px solid #f5eaea", flexShrink:0 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#7a5050", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>
                Add Students {candidates.length > 0 && <span style={{ color:"#b09090", fontWeight:400 }}>({candidates.length} eligible)</span>}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, background:"white", border:"1.5px solid #f0e4e4", borderRadius:9, padding:"0 12px", height:36 }}>
                <i className="ti ti-search" style={{ fontSize:13, color:"#c0a0a0" }} />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={classReady ? "Search by name or LRN…" : "Fill class fields above first"}
                  disabled={!classReady}
                  style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0a0a", fontFamily:"'DM Sans',sans-serif", outline:"none" }} />
                {candLoading && <i className="ti ti-loader-2" style={{ fontSize:13, color:"#e03131", animation:"spin 1s linear infinite" }} />}
              </div>
            </div>

            <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
              {!classReady && (
                <div style={{ padding:"40px 18px", textAlign:"center", color:"#b09090", fontSize:12 }}>
                  <i className="ti ti-arrow-up" style={{ fontSize:20, display:"block", marginBottom:8 }} />
                  Complete the class fields above to search for students.
                </div>
              )}
              {classReady && !candLoading && candidates.length === 0 && (
                <div style={{ padding:"40px 18px", textAlign:"center", color:"#b09090", fontSize:12 }}>
                  {searchQuery ? `No eligible students match "${searchQuery}".` : "No eligible students found for this grade. Try searching by name."}
                </div>
              )}
              {candidates.length > 0 && (
                <>
                  <div style={{ padding:"6px 18px", display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid #f9f0f0" }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      style={{ width:15, height:15, accentColor:"#e03131", cursor:"pointer" }} />
                    <span style={{ fontSize:11.5, color:"#9a7070", fontWeight:600 }}>{allSelected ? "Deselect all" : "Select all"}</span>
                    {selected.size > 0 && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={{ marginLeft:"auto", fontSize:11, background:"#fff0f0", color:"#e03131", border:"1px solid #fca5a5", borderRadius:99, padding:"2px 8px", fontWeight:700 }}>
                        {selected.size} selected
                      </motion.span>
                    )}
                  </div>
                  <AnimatePresence mode="popLayout">
                    {candidates.map((st, idx) => {
                      const p = avatarFor(st.last_name ?? "X");
                      const initials = `${st.first_name?.[0]??""}${st.last_name?.[0]??""}`.toUpperCase();
                      const name = [st.last_name+",", st.first_name, st.middle_name].filter(Boolean).join(" ");
                      const isSelected = selected.has(st.student_id);
                      const elig = eligibilityMap[st.student_id];
                      const eligBadge = elig == null ? null
                        : elig.blocking_reasons?.length > 0
                          ? { bg:"#fef2f2", color:"#991b1b", border:"#fca5a5", icon:"ti-circle-x", label:"Blocked" }
                          : elig.missing_docs?.length > 0
                            ? { bg:"#fffbeb", color:"#92400e", border:"#fde68a", icon:"ti-file-x", label:`Docs (${elig.missing_docs.length})` }
                            : { bg:"#f0fdf4", color:"#15803d", border:"#bbf7d0", icon:"ti-circle-check", label:"Eligible" };
                      return (
                        <motion.div key={st.student_id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15, ease: "easeOut", delay: Math.min(idx * 0.018, 0.22) }}
                          onClick={() => toggleSelect(st.student_id)}
                          style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 18px", cursor:"pointer", background: isSelected ? "#fff8f6" : "white", borderBottom:"1px solid #f9f0f0" }}
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background="#fff8f6"; }}
                          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background="white"; }}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(st.student_id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width:15, height:15, accentColor:"#e03131", cursor:"pointer", flexShrink:0 }} />
                          <div style={{ width:30, height:30, borderRadius:"50%", background:p.bg, color:p.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>{initials||"?"}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12.5, fontWeight:600, color:"#1a0a0a", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{name}</div>
                            <div style={{ fontSize:10.5, color:"#b09090", marginTop:1, display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                              <span>LRN {st.lrn ?? "—"}</span>
                              {st.lastGrade ? (
                                <span style={{ background:"#fff0e8", color:"#b45309", border:"1px solid #fcd9a8", borderRadius:99, padding:"1px 6px", fontSize:10, fontWeight:700 }}>
                                  {st.lastGrade} → <span style={{ color:"#e03131" }}>{gradeLevel}</span>
                                </span>
                              ) : (
                                <span style={{ background:"#f0fdf4", color:"#15803d", border:"1px solid #bbf7d0", borderRadius:99, padding:"1px 6px", fontSize:10, fontWeight:700 }}>New</span>
                              )}
                              {eligBadge && (
                                <span style={{ display:"inline-flex", alignItems:"center", gap:3, background:eligBadge.bg, color:eligBadge.color, border:`1px solid ${eligBadge.border}`, borderRadius:99, padding:"1px 6px", fontSize:10, fontWeight:700 }}>
                                  <i className={`ti ${eligBadge.icon}`} style={{ fontSize:10 }} />{eligBadge.label}
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </>
              )}
            </div>
          </div>

          {/* Right panel — Enrolled */}
          <div style={{ display:"flex", flexDirection:"column", minHeight:0 }}>
            <div style={{ padding:"12px 18px 10px", borderBottom:"1px solid #f5eaea", flexShrink:0 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#7a5050", textTransform:"uppercase", letterSpacing:"0.07em" }}>
                In This Class
                <span style={{ marginLeft:6, fontWeight:400, color:"#b09090" }}>
                  {enrollLoading ? "loading…" : `(${enrolled.length})`}
                </span>
              </div>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
              {!classReady && (
                <div style={{ padding:"40px 18px", textAlign:"center", color:"#b09090", fontSize:12 }}>
                  Fill in the class fields to see enrolled students.
                </div>
              )}
              {classReady && !enrollLoading && enrolled.length === 0 && (
                <div style={{ padding:"40px 18px", textAlign:"center", color:"#b09090", fontSize:12 }}>No students in this class yet.</div>
              )}
              <AnimatePresence mode="popLayout">
                {enrolled.map((en) => {
                  const name = en.student_name ?? en.student_detail
                    ? [en.student_detail?.first_name, en.student_detail?.last_name].filter(Boolean).join(" ")
                    : `Student #${en.student}`;
                  const p = avatarFor(name);
                  const initials = name.split(" ").map((w) => w[0]).filter(Boolean).join("").slice(0,2).toUpperCase();
                  const isRemoving = removing.has(en.enrollment_id);
                  const isPendingThisRemove = pendingRemove?.enrollment_id === en.enrollment_id;
                  const statusPill = STATUS_META[en.enrollment_status];
                  return (
                    <motion.div key={en.enrollment_id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 16 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      style={{ borderBottom:"1px solid #f9f0f0" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 18px" }}>
                        <div style={{ width:30, height:30, borderRadius:"50%", background:p.bg, color:p.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>{initials||"?"}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12.5, fontWeight:600, color:"#1a0a0a", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{name}</div>
                          <div style={{ fontSize:10.5, color:"#b09090", marginTop:1, display:"flex", gap:6, alignItems:"center" }}>
                            <span>#{en.enrollment_id}</span>
                            {statusPill && (
                              <span style={{ display:"inline-flex", alignItems:"center", gap:3, background:statusPill.bg, color:statusPill.color, borderRadius:99, padding:"1px 6px", fontSize:10, fontWeight:700 }}>
                                <span style={{ width:5, height:5, borderRadius:"50%", background:statusPill.dot }} />{statusPill.label}
                              </span>
                            )}
                          </div>
                        </div>
                        <motion.button
                          whileHover={!isRemoving ? { scale: 1.08, backgroundColor: "#fff0f0", color: "#e03131", borderColor: "#fca5a5" } : {}}
                          whileTap={!isRemoving ? { scale: 0.93 } : {}}
                          transition={{ duration: 0.12 }}
                          onClick={() => setPendingRemove(isPendingThisRemove ? null : en)}
                          disabled={isRemoving}
                          title="Remove from class"
                          style={{ width:28, height:28, border:"1px solid #fde2de", borderRadius:7, background: isPendingThisRemove ? "#fff0f0" : "white", display:"flex", alignItems:"center", justifyContent:"center", cursor: isRemoving ? "wait" : "pointer", color: isPendingThisRemove ? "#e03131" : "#c0a0a0", flexShrink:0 }}>
                          {isRemoving
                            ? <i className="ti ti-loader-2" style={{ fontSize:12, animation:"spin 1s linear infinite" }} />
                            : <i className="ti ti-x" style={{ fontSize:12 }} />}
                        </motion.button>
                      </div>
                      {/* Inline remove confirmation */}
                      <AnimatePresence>
                        {isPendingThisRemove && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                            style={{ margin:"0 18px 10px", padding:"10px 14px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:9, display:"flex", alignItems:"center", gap:10 }}>
                            <span style={{ flex:1, fontSize:12, color:"#991b1b" }}>Remove <strong>{name}</strong> from this class?</span>
                            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }} transition={{ duration: 0.1 }}
                              onClick={confirmRemove}
                              style={{ padding:"5px 12px", background:"#e03131", color:"white", border:"none", borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                              Confirm
                            </motion.button>
                            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }} transition={{ duration: 0.1 }}
                              onClick={() => setPendingRemove(null)}
                              style={{ padding:"5px 12px", background:"white", color:"#7a5050", border:"1px solid #f0e4e4", borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                              Cancel
                            </motion.button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"14px 26px", borderTop:"1px solid #f5eaea", flexShrink:0 }}>
          <AnimatePresence>
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"9px 13px", fontSize:12.5, color:"#b91c1c", marginBottom:12, display:"flex", alignItems:"flex-start", gap:7 }}>
                <i className="ti ti-alert-circle" style={{ fontSize:14, flexShrink:0, marginTop:1 }} />
                <span style={{ whiteSpace:"pre-wrap" }}>{error}</span>
              </motion.div>
            )}
            {saveResult && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                style={{ background: saveResult.failed?.length ? "#fffbeb" : "#f0fdf4", border:`1px solid ${saveResult.failed?.length ? "#fde68a" : "#bbf7d0"}`, borderRadius:8, padding:"9px 13px", fontSize:12.5, color: saveResult.failed?.length ? "#92400e" : "#15803d", marginBottom:12 }}>
                <div style={{ fontWeight:700, marginBottom: saveResult.failed?.length ? 6 : 0 }}>
                  <i className={`ti ${saveResult.failed?.length ? "ti-alert-triangle" : "ti-circle-check"}`} style={{ marginRight:5 }} />
                  {saveResult.created?.length} student{saveResult.created?.length !== 1 ? "s" : ""} added as Pending.
                  {saveResult.failed?.length > 0 && ` ${saveResult.failed.length} failed.`}
                </div>
                {saveResult.failed?.map((f, i) => (
                  <div key={i} style={{ fontSize:11.5, marginTop:3 }}>· Student #{f.student_id}: {f.reason}</div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
            <div style={{ fontSize:11, color:"#b09090", fontStyle:"italic" }}>
              Students are added as <strong>Pending</strong> — activate each to Enrolled after documents are submitted.
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} transition={{ duration: 0.12 }}
                onClick={onClose}
                style={{ padding:"9px 22px", background:"white", border:"1.5px solid #fde2de", borderRadius:99, fontSize:13, fontWeight:600, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                Close
              </motion.button>
              <motion.button
                whileHover={selected.size > 0 && classReady && !saving ? { scale: 1.03 } : {}}
                whileTap={selected.size > 0 && classReady && !saving ? { scale: 0.96 } : {}}
                transition={{ duration: 0.12 }}
                onClick={handleEnroll} disabled={selected.size === 0 || saving || !classReady}
                style={{ padding:"9px 22px", background: (selected.size === 0 || saving || !classReady) ? "#f0c4c4" : "linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:99, fontSize:13, fontWeight:700, cursor: (selected.size === 0 || !classReady) ? "not-allowed" : "pointer", fontFamily:"'DM Sans',sans-serif", boxShadow: selected.size > 0 && classReady ? "0 4px 16px rgba(224,49,49,0.28)" : "none", display:"inline-flex", alignItems:"center", gap:7, opacity: saving ? 0.7 : 1 }}>
                {saving
                  ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:"spin 1s linear infinite" }} />Enrolling…</>
                  : <><i className="ti ti-check" style={{ fontSize:14 }} />Enroll Selected{selected.size > 0 ? ` (${selected.size})` : ""}</>}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PROMOTE SECTION MODAL
// ════════════════════════════════════════════════════════════════════════════
function PromoteSectionModal({ onClose, onSuccess, initSchoolYear, initGradeLevel, initSection }) {
  // Step: "input" → "preview" → "result"
  const STEP_ORDER = ["input", "preview", "result"];
  const [step, setStep] = useState("input");
  const [stepDir, setStepDir] = useState(1);
  const prevStepRef = useRef("input");

  const [fromSchoolYear,  setFromSchoolYear]  = useState(initSchoolYear  || "");
  const [fromGradeLevel,  setFromGradeLevel]  = useState(initGradeLevel  || "Grade 7");
  const [fromSection,     setFromSection]     = useState(initSection     || "");
  const [toSchoolYear,    setToSchoolYear]    = useState("");
  const [toSection,       setToSection]       = useState(initSection     || "");

  const [previewing,  setPreviewing]  = useState(false);
  const [previewData, setPreviewData] = useState(null); // { to_grade_level, to_promote, to_skip, ... }
  const [confirming,  setConfirming]  = useState(false);
  const [resultData,  setResultData]  = useState(null);
  const [error,       setError]       = useState("");

  function goStep(next) {
    const prevIdx = STEP_ORDER.indexOf(prevStepRef.current);
    const nextIdx = STEP_ORDER.indexOf(next);
    setStepDir(nextIdx > prevIdx ? 1 : -1);
    prevStepRef.current = next;
    setStep(next);
  }

  // Auto-populate toSection when fromSection changes (can be overridden)
  useEffect(() => { setToSection(initSection || fromSection); }, [fromSection, initSection]);

  const schoolYearOpts = (() => {
    const d = new Date();
    const base = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    return Array.from({ length: 5 }, (_, i) => { const y = base + 1 - i; return `${y}-${y + 1}`; });
  })();

  const allGrades = [
    "Nursery","Kindergarten",
    "Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6",
    "Grade 7","Grade 8","Grade 9","Grade 10","Grade 11",
    // Grade 12 excluded — nothing follows it
  ];

  const inputReady = fromSchoolYear && fromGradeLevel && fromSection.trim() && toSchoolYear;

  async function handlePreview() {
    setError("");
    setPreviewing(true);
    try {
      const data = await promotePreview({
        from_school_year: fromSchoolYear,
        from_grade_level: fromGradeLevel,
        from_section:     fromSection.trim(),
        to_school_year:   toSchoolYear,
        to_section:       toSection.trim() || fromSection.trim(),
      });
      setPreviewData(data);
      goStep("preview");
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Preview failed.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirm() {
    setError("");
    setConfirming(true);
    try {
      const data = await promoteConfirm({
        from_school_year: fromSchoolYear,
        from_grade_level: fromGradeLevel,
        from_section:     fromSection.trim(),
        to_school_year:   toSchoolYear,
        to_section:       toSection.trim() || fromSection.trim(),
      });
      setResultData(data);
      goStep("result");
      onSuccess?.();
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Promotion failed.");
    } finally {
      setConfirming(false);
    }
  }

  const dir = stepDir;
  const stepVariants = {
    enter:  { x: dir * 28, opacity: 0 },
    center: { x: 0,        opacity: 1 },
    exit:   { x: dir * -28, opacity: 0 },
  };

  return (
    <div style={{ position:"fixed", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:1200 }}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{ position:"absolute", inset:0, background:"rgba(26,10,10,0.45)", backdropFilter:"blur(4px)" }}
      />
      {/* Dialog */}
      <motion.div
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={springTransition}
        style={{ position:"relative", background:"white", borderRadius:20, width:"min(780px,96vw)", maxHeight:"88vh", display:"flex", flexDirection:"column", boxShadow:"0 24px 64px rgba(224,49,49,0.18)", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ padding:"20px 26px 16px", borderBottom:"1px solid #f5eaea", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:"#e8f0fd", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <i className="ti ti-arrow-up-right" style={{ fontSize:17, color:"#2563eb" }} />
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:"#1a0a0a" }}>Promote Section</div>
              <AnimatePresence mode="wait">
                <motion.div key={step}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14 }}
                  style={{ fontSize:11.5, color:"#b09090" }}>
                  {step === "input"   && "Move a completed section to the next grade level"}
                  {step === "preview" && `Preview · ${previewData?.to_promote?.length ?? 0} to promote, ${previewData?.to_skip?.length ?? 0} to skip`}
                  {step === "result"  && `Done · ${resultData?.created?.length ?? 0} promoted`}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.08, backgroundColor: "#fff0f0", color: "#e03131" }}
            whileTap={{ scale: 0.93 }}
            transition={{ duration: 0.12 }}
            onClick={onClose}
            style={{ background:"none", border:"1px solid #f0e4e4", borderRadius:8, width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070" }}>
            <i className="ti ti-x" style={{ fontSize:14 }} />
          </motion.button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px 26px", position:"relative" }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeOut" }}>

              {/* ── Step 1: Input ── */}
              {step === "input" && (
                <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                  <div style={{ background:"#f0f5ff", border:"1px solid #c7d9f8", borderRadius:10, padding:"12px 16px", fontSize:12.5, color:"#1455a0", display:"flex", gap:10, alignItems:"flex-start" }}>
                    <i className="ti ti-info-circle" style={{ fontSize:15, flexShrink:0, marginTop:1 }} />
                    Only students with <strong>completed</strong> status and <strong>no failed/incomplete subjects</strong> will be promoted. You'll see a preview before anything is saved.
                  </div>

                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:"#9a7070", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>From (Source Section)</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                      <div>
                        <label style={lbl}>School Year <span style={{ color:"#e03131" }}>*</span></label>
                        <select value={fromSchoolYear} onChange={(e) => setFromSchoolYear(e.target.value)} style={sel}>
                          <option value="">— Select —</option>
                          {schoolYearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Grade Level <span style={{ color:"#e03131" }}>*</span></label>
                        <select value={fromGradeLevel} onChange={(e) => setFromGradeLevel(e.target.value)} style={sel}>
                          {allGrades.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Section <span style={{ color:"#e03131" }}>*</span></label>
                        <input value={fromSection} onChange={(e) => setFromSection(e.target.value)} placeholder="e.g. Rizal" style={inp} />
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop:"1px dashed #f0e4e4", paddingTop:18 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#9a7070", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>To (Destination)</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                      <div>
                        <label style={lbl}>School Year <span style={{ color:"#e03131" }}>*</span></label>
                        <select value={toSchoolYear} onChange={(e) => setToSchoolYear(e.target.value)} style={sel}>
                          <option value="">— Select —</option>
                          {schoolYearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Grade Level</label>
                        <input
                          value={fromGradeLevel ? (getNextGrade(fromGradeLevel) ?? "—") : "—"}
                          readOnly
                          style={{ ...inp, background:"#f8f4f4", color:"#7a5050", cursor:"default" }}
                        />
                        <div style={{ fontSize:10, color:"#b09090", marginTop:3 }}>Auto-computed from source grade</div>
                      </div>
                      <div>
                        <label style={lbl}>Section</label>
                        <input value={toSection} onChange={(e) => setToSection(e.target.value)} placeholder="Same as source if blank" style={inp} />
                        <div style={{ fontSize:10, color:"#b09090", marginTop:3 }}>Defaults to source section name</div>
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.16 }}
                        style={{ color:"#c92a2a", fontSize:13, background:"#fde8e8", borderRadius:8, padding:"10px 14px" }}>
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ── Step 2: Preview ── */}
              {step === "preview" && previewData && (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  {/* Summary stat cards — stagger in */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10 }}>
                    {[
                      { label:"From",         value:`${fromGradeLevel} · ${fromSection}`,                         color:"#1a0a0a" },
                      { label:"To",           value:`${previewData.to_grade_level} · ${previewData.to_section}`,  color:"#1a0a0a" },
                      { label:"Will Promote", value:previewData.to_promote.length,                                color:"#2e6b0d" },
                      { label:"Will Skip",    value:previewData.to_skip.length,                                   color: previewData.to_skip.length ? "#c92a2a" : "#7a5050" },
                    ].map(({ label, value, color }, i) => (
                      <motion.div key={label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut", delay: i * 0.055 }}
                        style={{ background:"#fff8f6", border:"1px solid #f5eaea", borderRadius:10, padding:"12px 16px" }}>
                        <div style={{ fontSize:10, fontWeight:700, color:"#b09090", textTransform:"uppercase", letterSpacing:"0.07em" }}>{label}</div>
                        <div style={{ fontSize:15, fontWeight:700, color, marginTop:4 }}>{value}</div>
                      </motion.div>
                    ))}
                  </div>

                  {previewData.to_promote.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
                      style={{ background:"#faeeda", border:"1px solid #f0c070", borderRadius:10, padding:"14px 18px", fontSize:13, color:"#7a4a00" }}>
                      <i className="ti ti-alert-triangle" style={{ marginRight:7 }} />
                      No students are eligible for promotion from this section.
                    </motion.div>
                  )}

                  {/* Promote list */}
                  {previewData.to_promote.length > 0 && (
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"#2e6b0d", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>
                        Will be promoted ({previewData.to_promote.length})
                      </div>
                      <div style={{ border:"1px solid #d4edda", borderRadius:10, overflow:"hidden" }}>
                        {previewData.to_promote.map((s, i) => (
                          <motion.div key={s.student_id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.18, ease: "easeOut", delay: Math.min(i * 0.03, 0.3) }}
                            style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", background: i % 2 === 0 ? "white" : "#f8fff8", borderBottom: i < previewData.to_promote.length - 1 ? "1px solid #e8f5e0" : "none" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <div style={{ width:28, height:28, borderRadius:"50%", background:"#e8f5e0", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#2e6b0d", flexShrink:0 }}>
                                {s.student_name.charAt(0)}
                              </div>
                              <span style={{ fontSize:13, color:"#1a0a0a", fontWeight:500 }}>{s.student_name}</span>
                            </div>
                            {s.average != null && (
                              <span style={{ fontSize:12, fontWeight:700, color:"#2e6b0d", background:"#e8f5e0", padding:"2px 10px", borderRadius:50 }}>
                                Avg: {s.average.toFixed(2)}
                              </span>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skip list */}
                  {previewData.to_skip.length > 0 && (
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:"#c92a2a", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>
                        Will be skipped ({previewData.to_skip.length})
                      </div>
                      <div style={{ border:"1px solid #fca5a5", borderRadius:10, overflow:"hidden" }}>
                        {previewData.to_skip.map((s, i) => (
                          <motion.div key={s.student_id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.18, ease: "easeOut", delay: Math.min(i * 0.03, 0.3) }}
                            style={{ padding:"10px 16px", background: i % 2 === 0 ? "white" : "#fff8f8", borderBottom: i < previewData.to_skip.length - 1 ? "1px solid #fde8e8" : "none" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:3 }}>
                              <div style={{ width:28, height:28, borderRadius:"50%", background:"#fde8e8", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#c92a2a", flexShrink:0 }}>
                                {s.student_name.charAt(0)}
                              </div>
                              <span style={{ fontSize:13, color:"#1a0a0a", fontWeight:500 }}>{s.student_name}</span>
                            </div>
                            <div style={{ fontSize:11.5, color:"#9a5050", marginLeft:38 }}>{s.reason}</div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.16 }}
                        style={{ color:"#c92a2a", fontSize:13, background:"#fde8e8", borderRadius:8, padding:"10px 14px" }}>
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ── Step 3: Result ── */}
              {step === "result" && resultData && (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  <div style={{ textAlign:"center", padding:"20px 0 8px" }}>
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type:"spring", stiffness: 380, damping: 22 }}
                      style={{ width:56, height:56, borderRadius:"50%", background:"#e8f5e0", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}>
                      <i className="ti ti-circle-check" style={{ fontSize:28, color:"#2e6b0d" }} />
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, delay: 0.1 }}
                      style={{ fontSize:17, fontWeight:700, color:"#1a0a0a" }}>
                      Promotion Complete
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, delay: 0.18 }}
                      style={{ fontSize:13, color:"#7a5050", marginTop:4 }}>
                      {resultData.created.length} student{resultData.created.length !== 1 ? "s" : ""} promoted to{" "}
                      <strong>{resultData.to_grade_level}</strong> · {resultData.to_section} · SY {resultData.to_school_year}
                      {" "}as <strong>Pending</strong>
                    </motion.div>
                  </div>

                  {resultData.skipped?.length > 0 && (
                    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ duration:0.2, delay:0.24 }}
                      style={{ background:"#faeeda", border:"1px solid #f0c070", borderRadius:10, padding:"12px 16px", fontSize:12.5, color:"#7a4a00" }}>
                      <div style={{ fontWeight:700, marginBottom:6 }}>
                        <strong>{resultData.skipped.length}</strong> student{resultData.skipped.length !== 1 ? "s were" : " was"} skipped:
                      </div>
                      {resultData.skipped.map((s, i) => (
                        <div key={s.student_id ?? i} style={{ fontSize:11.5, marginTop:3 }}>
                          · {s.student_name ?? `Student #${s.student_id}`}: {s.reason}
                        </div>
                      ))}
                    </motion.div>
                  )}
                  {resultData.failed?.length > 0 && (
                    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ duration:0.2, delay:0.3 }}
                      style={{ background:"#fde8e8", border:"1px solid #fca5a5", borderRadius:10, padding:"12px 16px", fontSize:12.5, color:"#9a2020" }}>
                      <div style={{ fontWeight:700, marginBottom:6 }}>
                        <strong>{resultData.failed.length}</strong> student{resultData.failed.length !== 1 ? "s" : ""} failed to create:
                      </div>
                      {resultData.failed.map((s, i) => (
                        <div key={s.student_id ?? i} style={{ fontSize:11.5, marginTop:3 }}>
                          · {s.student_name ?? `Student #${s.student_id}`}: {s.reason}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div style={{ padding:"14px 26px 18px", borderTop:"1px solid #f5eaea", flexShrink:0, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:11, color:"#b09090", fontStyle:"italic" }}>
            {step === "input"   && "Promoted students are created as Pending — activate to Enrolled after documents."}
            {step === "preview" && "Review the lists above, then click Confirm to create the enrollment records."}
            {step === "result"  && "You can find the new enrollments under the destination school year."}
          </div>
          <div style={{ display:"flex", gap:10 }}>
            {step === "input" && (
              <>
                <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.96 }} transition={{ duration:0.12 }}
                  onClick={onClose} style={{ padding:"9px 22px", background:"white", border:"1.5px solid #fde2de", borderRadius:99, fontSize:13, fontWeight:600, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={inputReady && !previewing ? { scale:1.03 } : {}}
                  whileTap={inputReady && !previewing ? { scale:0.96 } : {}}
                  transition={{ duration:0.12 }}
                  onClick={handlePreview} disabled={!inputReady || previewing}
                  style={{ padding:"9px 22px", background: (!inputReady || previewing) ? "#f0c4c4" : "linear-gradient(135deg,#2563eb,#1d4ed8)", color:"white", border:"none", borderRadius:99, fontSize:13, fontWeight:700, cursor: (!inputReady || previewing) ? "not-allowed" : "pointer", fontFamily:"'DM Sans',sans-serif", display:"inline-flex", alignItems:"center", gap:7 }}>
                  {previewing
                    ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:"spin 1s linear infinite" }} />Loading…</>
                    : <><i className="ti ti-eye" style={{ fontSize:13 }} />Preview</>}
                </motion.button>
              </>
            )}
            {step === "preview" && (
              <>
                <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.96 }} transition={{ duration:0.12 }}
                  onClick={() => { goStep("input"); setError(""); }} style={{ padding:"9px 22px", background:"white", border:"1.5px solid #fde2de", borderRadius:99, fontSize:13, fontWeight:600, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                  Back
                </motion.button>
                <motion.button
                  whileHover={!confirming && previewData?.to_promote?.length ? { scale:1.03 } : {}}
                  whileTap={!confirming && previewData?.to_promote?.length ? { scale:0.96 } : {}}
                  transition={{ duration:0.12 }}
                  onClick={handleConfirm} disabled={confirming || previewData?.to_promote?.length === 0}
                  style={{ padding:"9px 22px", background: (confirming || !previewData?.to_promote?.length) ? "#f0c4c4" : "linear-gradient(135deg,#2e6b0d,#1a5c05)", color:"white", border:"none", borderRadius:99, fontSize:13, fontWeight:700, cursor: (confirming || !previewData?.to_promote?.length) ? "not-allowed" : "pointer", fontFamily:"'DM Sans',sans-serif", display:"inline-flex", alignItems:"center", gap:7 }}>
                  {confirming
                    ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:"spin 1s linear infinite" }} />Promoting…</>
                    : <><i className="ti ti-arrow-up-right" style={{ fontSize:13 }} />Confirm & Promote {previewData?.to_promote?.length ? `(${previewData.to_promote.length})` : ""}</>}
                </motion.button>
              </>
            )}
            {step === "result" && (
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.96 }} transition={{ duration:0.12 }}
                onClick={onClose} style={{ padding:"9px 22px", background:"linear-gradient(135deg,#2e6b0d,#1a5c05)", color:"white", border:"none", borderRadius:99, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                Done
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Stat card — matches StudentsPage / SubjectsPage exactly ──────────────────
function StatCard({ label, value, icon, color, bg, loading }) {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(224,49,49,0.12)" }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.16 }}
      style={{
        background: "white", borderRadius: 14, padding: "16px 20px",
        border: "1px solid #f5eaea", width: "100%",
        display: "flex", alignItems: "center", gap: 14,
        boxShadow: "0 2px 12px rgba(224,49,49,0.06)",
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 18, color }} />
      </div>
      <div>
        {loading
          ? <Sk w={40} h={20} r={4} />
          : <div style={{ fontSize: 22, fontWeight: 700, color: "#1a0a0a", lineHeight: 1 }}>{value?.toLocaleString() ?? "—"}</div>
        }
        <div style={{ fontSize: 11, color: "#a07878", marginTop: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      </div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
export default function EnrollmentsPage() {
  usePageTitle("Enrollments");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canManage = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);
  const token = sessionStorage.getItem("access_token");
  const [rowsAnimated, setRowsAnimated] = useState(false);
  const [enrollments,    setEnrollments]    = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [page,           setPage]           = useState(1);
  const [pageMeta,       setPageMeta]       = useState({ count: 0, next: null, previous: null });
  const [showMassEnroll,  setShowMassEnroll]  = useState(false);
  const [showPromote,     setShowPromote]     = useState(false);
  const [statusCounts,   setStatusCounts]   = useState({ total: 0, enrolled: 0, pending: 0, completed: 0, cancelled: 0 });
  const [countsLoading,  setCountsLoading]  = useState(true);

  // Filters — seeded from the URL so links from elsewhere (e.g. Dashboard cards) can land pre-filtered,
  // falling back to the global school-year selector (Sidebar) rather than "All Years".
  const { schoolYear: globalSchoolYear, options: globalYearOptions } = useSchoolYear();
  const [schoolYear,   setSchoolYear]   = useState(() => searchParams.get("school_year") ?? globalSchoolYear ?? "");
  const [schoolLevel,  setSchoolLevel]  = useState(() => searchParams.get("school_level") ?? "");
  const [gradeLevel,   setGradeLevel]   = useState(() => searchParams.get("grade_level") ?? "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("enrollment_status") ?? "");
  const [search,       setSearch]       = useState("");
  const [searchInput,  setSearchInput]  = useState("");

  // Follow the global school year while this page stays mounted — unless the
  // URL explicitly pinned one (e.g. a Dashboard card link), in which case we
  // honor that once and resync on subsequent global changes after.
  const skipYearSync = useRef(Boolean(searchParams.get("school_year")));
  useEffect(() => {
    if (skipYearSync.current) { skipYearSync.current = false; return; }
    setSchoolYear(globalSchoolYear);
  }, [globalSchoolYear]);

  const schoolYearOptions = [{ value: "", label: "All Years" }, ...globalYearOptions.map((y) => ({ value: y, label: y }))];
  const gradeOptions      = GRADE_LEVELS_BY_LEVEL[schoolLevel] ?? ["All Grades"];

  // Reset grade when level changes — but not on the initial mount, so a URL-seeded
  // grade_level (alongside school_level) isn't immediately wiped out.
  const skipLevelReset = useRef(true);
  useEffect(() => {
    if (skipLevelReset.current) { skipLevelReset.current = false; return; }
    setGradeLevel("");
  }, [schoolLevel]);

  // Fetch status counts once on mount for stat cards
  useEffect(() => {
    if (!token) return;
    setCountsLoading(true);
    Promise.all([
      apiGetEnrollments({ page_size: 1 }),
      apiGetEnrollments({ page_size: 1, enrollment_status: "enrolled"  }),
      apiGetEnrollments({ page_size: 1, enrollment_status: "pending"   }),
      apiGetEnrollments({ page_size: 1, enrollment_status: "completed" }),
      apiGetEnrollments({ page_size: 1, enrollment_status: "cancelled" }),
    ]).then(([all, enrolled, pending, completed, cancelled]) => {
      setStatusCounts({
        total:     all.count       ?? 0,
        enrolled:  enrolled.count  ?? 0,
        pending:   pending.count   ?? 0,
        completed: completed.count ?? 0,
        cancelled: cancelled.count ?? 0,
      });
    }).catch(() => {}).finally(() => setCountsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      const data = await apiGetEnrollments(Object.fromEntries(params));
      setEnrollments(data.results ?? []);
      setPageMeta({ count: data.count, next: data.next, previous: data.previous });
      setPage(pg);
      setRowsAnimated(true);
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

  const isFirstRender    = useIsFirstRender();
  const isFirstRowRender = !rowsAnimated;

  return (
    <>
    <AppLayout>
      <style>{`
        ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }

        .nav-item { transition:background .12s,color .12s; }
        .nav-item:hover { background:#fff4f4 !important; color:#e03131 !important; }
        .nav-active { background:#fff0f0 !important; color:#e03131 !important; font-weight:600 !important; }

        .enroll-row { transition:background .12s; cursor:pointer; }
        .enroll-row:hover td { background:#fff8f6 !important; }
        .enroll-row:hover .row-name { color:#e03131 !important; }

@keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

        .page-btn:disabled { opacity:.3; cursor:not-allowed; }

        .search-wrap:focus-within { border-color:#e03131 !important; box-shadow:0 0 0 3px rgba(224,49,49,0.09) !important; }
      `}</style>


          {/* Topbar */}
          <motion.div
            initial={isFirstRender ? { opacity: 0, y: -10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{ background:"white", borderBottom:"1px solid #f5eaea", padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a", letterSpacing:"-0.01em" }}>Enrollments</div>
              <div style={{ fontSize:11.5, color:"#b09090", marginTop:1 }}>
                {loading ? "Loading…" : `${pageMeta.count.toLocaleString()} enrollment${pageMeta.count !== 1 ? "s" : ""} found`}
              </div>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              {canManage && (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  style={{ display:"flex", alignItems:"center", gap:7, background:"white", color:"#2563eb", border:"1.5px solid #93c5fd", borderRadius:10, padding:"8px 16px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                  onClick={() => setShowPromote(true)}
                  onMouseEnter={(e) => { e.currentTarget.style.background="#eff6ff"; e.currentTarget.style.borderColor="#2563eb"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background="white"; e.currentTarget.style.borderColor="#93c5fd"; }}>
                  <i className="ti ti-arrow-up-right" style={{ fontSize:15 }} />Promote Section
                </motion.button>
              )}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.12 }}
                style={{ display:"flex", alignItems:"center", gap:7, background:"white", color:"#e03131", border:"1.5px solid #fca5a5", borderRadius:10, padding:"8px 16px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
                onClick={() => setShowMassEnroll(true)}
                onMouseEnter={(e) => { e.currentTarget.style.background="#fff0f0"; e.currentTarget.style.borderColor="#e03131"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background="white"; e.currentTarget.style.borderColor="#fca5a5"; }}>
                <i className="ti ti-users-plus" style={{ fontSize:15 }} />Mass Enroll
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.12 }}
                style={{ display:"flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.26)", letterSpacing:"0.01em" }}
                onClick={() => navigate("/enrollments/new")}>
                <i className="ti ti-clipboard-plus" style={{ fontSize:15 }} />New Enrollment
              </motion.button>
            </div>
          </motion.div>

          {/* Content */}
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:18 }}>

            {/* ── Stat cards ── */}
            <div style={{ display:"flex", gap:12 }}>
              {[
                { label:"Total Enrollments", icon:"ti-clipboard-list", value: statusCounts.total,     color:"#e03131", bg:"#fff0f0" },
                { label:"Enrolled",          icon:"ti-user-check",     value: statusCounts.enrolled,  color:"#2e6b0d", bg:"#e8f5e0" },
                { label:"Pending",           icon:"ti-clock",          value: statusCounts.pending,   color:"#7a4a08", bg:"#fef3e2" },
                { label:"Completed",         icon:"ti-certificate",    value: statusCounts.completed, color:"#1455a0", bg:"#e3f0fd" },
                { label:"Cancelled",         icon:"ti-user-x",         value: statusCounts.cancelled, color:"#9b2020", bg:"#fde8e8" },
              ].map((card, i) => (
                <motion.div
                  key={card.label}
                  initial={isFirstRender ? { y: 14, opacity: 0 } : false}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.28, ease: "easeOut", delay: isFirstRender ? i * 0.06 : 0 }}
                  style={{ flex:1, minWidth:0 }}
                >
                  <StatCard {...card} loading={countsLoading} />
                </motion.div>
              ))}
            </div>

            {/* ── Search + filters ── */}
            <motion.div
              initial={isFirstRender ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.22 : 0 }}
              style={{
                background: "white", border: "1px solid #f5eaea",
                borderRadius: 14, padding: "18px 20px",
                boxShadow: "0 2px 12px rgba(224,49,49,0.05)",
                display: "flex", flexDirection: "column", gap: 0,
              }}
            >

              {/* Row 1: Search + Search btn + Clear */}
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <div className="search-wrap"
                  style={{ flex:1, display:"flex", alignItems:"center", gap:10, background:"white", border:"1.5px solid #f0e4e4", borderRadius:12, padding:"0 16px", height:42, transition:"border .15s,box-shadow .15s" }}>
                  <i className="ti ti-search" style={{ fontSize:15, color:"#c0a0a0", flexShrink:0 }} />
                  <input
                    placeholder="Search student name or section…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0a0a", fontFamily:"'DM Sans',sans-serif", outline:"none" }}
                  />
                  {searchInput && (
                    <button onClick={() => { setSearchInput(""); setSearch(""); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#c0a0a0", display:"flex", alignItems:"center", padding:2, borderRadius:4 }}>
                      <i className="ti ti-x" style={{ fontSize:13 }} />
                    </button>
                  )}
                </div>
                <button
                  onClick={handleSearch}
                  style={{ height:42, padding:"0 20px", background:"white", border:"1.5px solid #f0e4e4", borderRadius:12, fontSize:13, fontWeight:600, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.14s", flexShrink:0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor="#e03131"; e.currentTarget.style.color="#e03131"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor="#f0e4e4"; e.currentTarget.style.color="#7a5050"; }}>
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
                      style={{ height:42, padding:"0 14px", background:"white", border:"1.5px solid #fca5a5", borderRadius:12, fontSize:12, fontWeight:600, color:"#b91c1c", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
                      <i className="ti ti-filter-off" style={{ fontSize:13 }} />Clear
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* Divider */}
              <div style={{ height:1, background:"#f5eaea", margin:"14px 0" }} />

              {/* Chip rows */}
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

                {/* Row 2: School Year chips */}
                <div>
                  <div style={{ fontSize:10, fontWeight:700, color:"#c0a0a0", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>School Year</div>
                  <motion.div layout style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                    {schoolYearOptions.map((o) => {
                      const active = schoolYear === o.value;
                      return (
                        <motion.button key={o.value}
                          layout
                          initial={false}
                          animate={{
                            backgroundColor: active ? "#fff0f0" : "#ffffff",
                            color:           active ? "#e03131" : "#9a7070",
                            borderColor:     active ? "#e03131" : "#f0e4e4",
                          }}
                          transition={{ layout: { type:"spring", stiffness:400, damping:36 }, duration:0.18, ease:"easeOut" }}
                          onClick={() => setSchoolYear(o.value)}
                          style={{ display:"inline-flex", alignItems:"center", gap:6, height:32, padding:"0 14px", borderRadius:99, fontSize:12, fontWeight:600, border:"1.5px solid", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                          <i className="ti ti-calendar" style={{ fontSize:12 }} />
                          {o.label}
                          {active && o.value !== "" && !loading && (
                            <span style={{ display:"inline-block", background:"#e03131", color:"white", borderRadius:99, fontSize:10, fontWeight:700, padding:"1px 7px", marginLeft:2, whiteSpace:"nowrap", flexShrink:0 }}>
                              {pageMeta.count}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </div>

                {/* Row 3: School Level chips */}
                <div>
                  <div style={{ fontSize:10, fontWeight:700, color:"#c0a0a0", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>School Level</div>
                  <motion.div layout style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                    {[
                      { value:"",                  label:"All Levels",   icon:"ti-layout-grid",   bg:"#fff0f0", color:"#e03131" },
                      { value:"nursery",           label:"Nursery",      icon:"ti-baby-carriage", bg:"#fdf5e8", color:"#c27a12" },
                      { value:"kindergarten",      label:"Kindergarten", icon:"ti-star",          bg:"#f0e8fd", color:"#7c3aed" },
                      { value:"elementary",        label:"Elementary",   icon:"ti-book",          bg:"#e8f0fd", color:"#2563eb" },
                      { value:"junior_highschool", label:"Junior High",  icon:"ti-school",        bg:"#e8fdf0", color:"#16a34a" },
                      { value:"senior_highschool", label:"Senior High",  icon:"ti-certificate",   bg:"#fde8f8", color:"#be185d" },
                    ].map((lvl) => {
                      const active = schoolLevel === lvl.value;
                      return (
                        <motion.button key={lvl.value}
                          layout
                          initial={false}
                          animate={{
                            backgroundColor: active ? lvl.bg    : "#ffffff",
                            color:           active ? lvl.color : "#9a7070",
                            borderColor:     active ? lvl.color : "#f0e4e4",
                          }}
                          transition={{ layout: { type:"spring", stiffness:400, damping:36 }, duration:0.18, ease:"easeOut" }}
                          onClick={() => setSchoolLevel(lvl.value)}
                          style={{ display:"inline-flex", alignItems:"center", gap:6, height:32, padding:"0 14px", borderRadius:99, fontSize:12, fontWeight:600, border:"1.5px solid", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                          <i className={`ti ${lvl.icon}`} style={{ fontSize:12 }} />
                          {lvl.label}
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </div>

                {/* Row 4: Grade Level chips — slides open/closed with CSS max-height, no reflow on siblings */}
                <div style={{
                  maxHeight: schoolLevel !== "" ? 200 : 0,
                  overflow: "hidden",
                  opacity: schoolLevel !== "" ? 1 : 0,
                  marginTop: schoolLevel !== "" ? 0 : -12,
                  transition: "max-height 0.22s ease, opacity 0.18s ease, margin-top 0.22s ease",
                  pointerEvents: schoolLevel !== "" ? "auto" : "none",
                }}>
                  <div style={{ paddingTop: 0 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"#c0a0a0", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Grade Level</div>
                    <motion.div layout style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                      {gradeOptions.map((g, idx) => {
                        const val = g === "All Grades" ? "" : g;
                        const active = gradeLevel === val;
                        return (
                          <motion.button key={`${schoolLevel}-${g}`}
                            layout
                            initial={{ opacity: 0, y: 6, backgroundColor: "#ffffff", color: "#9a7070", borderColor: "#f0e4e4" }}
                            animate={{
                              opacity: 1, y: 0,
                              backgroundColor: active ? "#fff0f0" : "#ffffff",
                              color:           active ? "#e03131" : "#9a7070",
                              borderColor:     active ? "#e03131" : "#f0e4e4",
                            }}
                            transition={{
                              opacity: { duration: 0.16, ease: "easeOut", delay: idx * 0.03 },
                              y:       { duration: 0.16, ease: "easeOut", delay: idx * 0.03 },
                              backgroundColor: { duration: 0.18, ease: "easeOut" },
                              color:           { duration: 0.18, ease: "easeOut" },
                              borderColor:     { duration: 0.18, ease: "easeOut" },
                              layout:          { type: "spring", stiffness: 400, damping: 36 },
                            }}
                            onClick={() => setGradeLevel(val)}
                            style={{ display:"inline-flex", alignItems:"center", gap:6, height:32, padding:"0 14px", borderRadius:99, fontSize:12, fontWeight:600, border:"1.5px solid", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                            {g}
                          </motion.button>
                        );
                      })}
                    </motion.div>
                  </div>
                </div>

                {/* Row 5: Status chips */}
                <div>
                  <div style={{ fontSize:10, fontWeight:700, color:"#c0a0a0", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Status</div>
                  <motion.div layout style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                    {[
                      { value:"",          label:"All",       bg:"#fff0f0", color:"#e03131", dot:null       },
                      { value:"enrolled",  label:"Enrolled",  bg:"#e8f5e0", color:"#2e6b0d", dot:"#4caf50" },
                      { value:"pending",   label:"Pending",   bg:"#fef3e2", color:"#7a4a08", dot:"#ff9800" },
                      { value:"completed", label:"Completed", bg:"#e3f0fd", color:"#1455a0", dot:"#2196f3" },
                      { value:"cancelled", label:"Cancelled", bg:"#fde8e8", color:"#9b2020", dot:"#f44336" },
                    ].map((s) => {
                      const active = statusFilter === s.value;
                      return (
                        <motion.button key={s.value}
                          layout
                          initial={false}
                          animate={{
                            backgroundColor: active ? s.bg    : "#ffffff",
                            color:           active ? s.color : "#9a7070",
                            borderColor:     active ? s.color : "#f0e4e4",
                          }}
                          transition={{ layout: { type:"spring", stiffness:400, damping:36 }, duration:0.18, ease:"easeOut" }}
                          onClick={() => setStatusFilter(s.value)}
                          style={{ display:"inline-flex", alignItems:"center", gap:6, height:32, padding:"0 14px", borderRadius:99, fontSize:12, fontWeight:600, border:"1.5px solid", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                          {s.dot && (
                            <motion.span
                              animate={{ background: active ? s.dot : "#c0b0b0" }}
                              transition={{ duration:0.18, ease:"easeOut" }}
                              style={{ width:7, height:7, borderRadius:"50%", flexShrink:0, display:"inline-block" }}
                            />
                          )}
                          {s.label}
                          {active && s.value !== "" && !loading && (
                            <span style={{ display:"inline-block", background: s.dot ?? "#e03131", color:"white", borderRadius:99, fontSize:10, fontWeight:700, padding:"1px 7px", marginLeft:2, whiteSpace:"nowrap", flexShrink:0 }}>
                              {pageMeta.count}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </div>

              </div>

            </motion.div>

            {/* ── Table ── */}
              <motion.div
                initial={isFirstRender ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.1 : 0 }}
                style={{
                background: "white", border: "1px solid #f5eaea",
                borderRadius: 16, overflow: "hidden",
                boxShadow: "0 2px 16px rgba(224,49,49,0.06)",
                maxHeight: "calc(100vh - 420px)",
                overflowY: "auto",
              }}>
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
                <AnimatePresence mode="popLayout">
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
                          <td colSpan={7}>
                            <EmptyState
                              icon="ti-clipboard-off"
                              title="No enrollments found"
                              subtitle="Try adjusting your filters or enroll a new student"
                              action={
                                <button onClick={() => navigate("/enrollments/new")}
                                  style={{ marginTop:8, padding:"9px 20px", background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:99, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                                  + New Enrollment
                                </button>
                              }
                            />
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
                            <motion.tr key={en.enrollment_id} className="enroll-row"
                              initial={isFirstRowRender ? { opacity: 0, x: -6 } : false}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 6 }}
                              transition={{ duration: 0.18, ease: "easeOut", delay: isFirstRowRender ? Math.min(idx * 0.025, 0.3) : 0 }}
                              style={{ cursor: "pointer" }}
                              onClick={() => navigate(`/enrollments/${en.enrollment_id}`)}>

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
                                  <i className="ti ti-pencil" style={{ fontSize: 14 }} />
                                </button>
                              </td>
                            </motion.tr>
                          );
                        })
                  }
                </tbody>
                </AnimatePresence>
              </table>
            </motion.div>

            {/* ── Pagination ── */}
            {!loading && pageMeta.count > 0 && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontSize:12, color:"#b09090" }}>
                  Page <strong style={{ color:"#7a5050" }}>{page}</strong> of <strong style={{ color:"#7a5050" }}>{totalPages || 1}</strong>
                  &nbsp;·&nbsp;{pageMeta.count.toLocaleString()} total records
                </span>
                <div style={{ display:"flex", gap:4 }}>
                  <motion.button
                    whileHover={pageMeta.previous ? { scale: 1.08, backgroundColor: "#fff0f0", borderColor: "#e03131", color: "#e03131" } : {}}
                    whileTap={pageMeta.previous ? { scale: 0.93 } : {}}
                    transition={{ duration: 0.12 }}
                    style={{ ...pgBtn, opacity: pageMeta.previous ? 1 : 0.3, cursor: pageMeta.previous ? "pointer" : "not-allowed" }}
                    disabled={!pageMeta.previous}
                    onClick={() => fetchEnrollments(page - 1)}>
                    <i className="ti ti-chevron-left" style={{ fontSize:13 }} />
                  </motion.button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const start = Math.max(1, page - 2);
                    const p = start + i;
                    if (p > totalPages) return null;
                    const isActive = p === page;
                    return (
                      <motion.button key={p}
                        whileHover={!isActive ? { scale: 1.08, backgroundColor: "#fff0f0", borderColor: "#e03131", color: "#e03131" } : {}}
                        whileTap={{ scale: 0.93 }}
                        transition={{ duration: 0.12 }}
                        style={{ ...pgBtn, ...(isActive ? pgActive : {}) }}
                        onClick={() => fetchEnrollments(p)}>{p}
                      </motion.button>
                    );
                  })}
                  <motion.button
                    whileHover={pageMeta.next ? { scale: 1.08, backgroundColor: "#fff0f0", borderColor: "#e03131", color: "#e03131" } : {}}
                    whileTap={pageMeta.next ? { scale: 0.93 } : {}}
                    transition={{ duration: 0.12 }}
                    style={{ ...pgBtn, opacity: pageMeta.next ? 1 : 0.3, cursor: pageMeta.next ? "pointer" : "not-allowed" }}
                    disabled={!pageMeta.next}
                    onClick={() => fetchEnrollments(page + 1)}>
                    <i className="ti ti-chevron-right" style={{ fontSize:13 }} />
                  </motion.button>
                </div>
              </div>
            )}

          </div>
    </AppLayout>
    <AnimatePresence>
      {showMassEnroll && (
        <MassEnrollModal
          onClose={() => setShowMassEnroll(false)}
          onSuccess={() => fetchEnrollments(page)}
          initSchoolYear={schoolYear   || undefined}
          initSchoolLevel={schoolLevel || undefined}
          initGradeLevel={gradeLevel   || undefined}
        />
      )}
    </AnimatePresence>
    <AnimatePresence>
      {showPromote && (
        <PromoteSectionModal
          onClose={() => setShowPromote(false)}
          onSuccess={() => fetchEnrollments(page)}
          initSchoolYear={schoolYear  || undefined}
          initSchoolLevel={schoolLevel || undefined}
          initGradeLevel={gradeLevel  || undefined}
          initSection={undefined}
        />
      )}
    </AnimatePresence>
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
