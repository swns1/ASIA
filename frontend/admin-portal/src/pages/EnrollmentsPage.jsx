import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import useYearFilter from "../hooks/useYearFilter";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card, { StatCard } from "../components/ui/Card";
import ChipGroup from "../components/ui/ChipGroup";
import FilterBar, { FilterRow, CollapsibleFilterRow } from "../components/ui/FilterBar";
import SchoolYearPicker from "../components/ui/SchoolYearPicker";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Modal from "../components/ui/Modal";
import Pagination from "../components/Pagination";
import { StatusBadge } from "../components/ui/Badge";
import { ENROLLMENT_STATUS_MAP, GUARDIAN_RESPONSE_MAP } from "../constants/statusMaps";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";


// ── API ───────────────────────────────────────────────────────────────────────
import {
  getEnrollments as apiGetEnrollments,
  getEnrollmentEligibility as apiGetEligibility,
  updateEnrollment as apiPatchEnrollment,
  bulkCreateEnrollments as apiBulkEnroll,
  promotePreview,
  promoteConfirm,
  completeSection,
  getUnplacedStudents,
  closeSchoolYear,
} from "../api/enrollmentApi";
import { getStudents as apiGetStudents, markStudentsGraduated } from "../api/studentApi";
import toast from "react-hot-toast";
import { getCurrentUser, hasAnyRole, ACADEMIC_STAFF } from "../utils/auth";
import { useSchoolYear } from "../context/SchoolYearContext";
import { followingSchoolYear, yearOptionsForEntry } from "../utils/schoolYear";

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

// Column widths carry over from the hand-rolled <thead>. No `sortable` flags:
// this list has no server-side ordering wired up, and Table only renders a
// sort control for columns that declare one.
const TABLE_COLUMNS = [
  { key: "student",     label: "Student",     width: "28%" },
  { key: "level",       label: "Level",       width: "16%" },
  { key: "grade",       label: "Grade",       width: "12%" },
  { key: "section",     label: "Section",     width: "12%" },
  { key: "school_year", label: "School Year", width: "13%" },
  { key: "status",      label: "Status",      width: "11%" },
  { key: "actions",     label: "",            width: "8%"  },
];

const LEVEL_ICONS = {
  nursery:           "ti-baby-carriage",
  kindergarten:      "ti-star",
  elementary:        "ti-book",
  junior_highschool: "ti-school",
  senior_highschool: "ti-certificate",
};


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
const lbl = { display:"block", fontSize:10, fontWeight:700, color:"#855c5c", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:5 };

function MassEnrollModal({ onClose, onSuccess, initSchoolYear, initSchoolLevel, initGradeLevel }) {
  // Years that exist in the data, plus next year — you enrol into September
  // from March, before that year has a single record. This used to be a
  // 4-year window generated from new Date(), which ignored the real list and
  // went stale the same way the old sidebar window did.
  const { options: yearOptions, currentYear } = useSchoolYear();
  const yearOpts = useMemo(
    () => yearOptionsForEntry(yearOptions, currentYear),
    [yearOptions, currentYear],
  );

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
              // The placement MUST be passed. Which documents a learner owes
              // is decided per school level and entry status, so with no
              // placement the server cannot resolve applicability and reports
              // nothing as missing — every brand-new student rendered as
              // document-complete here even when they had submitted nothing.
              // This class's own level and grade are exactly the placement
              // these candidates are being considered for.
              const e = await apiGetEligibility(st.student_id, {
                schoolLevel, gradeLevel,
              });
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
      { bg:"#e8fdf0",color:"#2e6b0d" },{ bg:"#fdf5e8",color:"#854f0b" },
      { bg:"#f0e8fd",color:"#7c3aed" },{ bg:"#fde8f8",color:"#be185d" },
      { bg:"#e8fdfd",color:"#1455a0" },
    ];
    return palettes[name.charCodeAt(0) % palettes.length];
  };

  return (
    <Modal
      onClose={onClose}
      size="xl"
      showClose
      loading={saving}
      // A roster of ticked students is expensive to rebuild, so a stray
      // backdrop click must not discard it.
      closeOnBackdrop={false}
      footer={
        <div className="flex items-center justify-between gap-2.5">
          <div className="text-xs italic text-neutral-500">
            Students are added as <strong>Pending</strong> — activate each to Enrolled after documents are submitted.
          </div>
          <div className="flex gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Close
            </Button>
            <Button
              icon="ti-check"
              loading={saving}
              disabled={selected.size === 0 || !classReady}
              onClick={handleEnroll}
            >
              {saving ? "Enrolling…" : `Enroll Selected${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Header — a config grid rather than Modal's centred icon/title
            stack, so it goes in the body and Modal's own header is unused. */}
        <div className="mb-4 shrink-0">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-100">
              <i className="ti ti-users-plus text-[17px] text-brand-600" aria-hidden="true" />
            </div>
            <div>
              <div className="text-[15px] font-bold text-neutral-900">Mass Enroll</div>
              <div className="text-[11.5px] text-neutral-500">
                Bulk-assign students to a class section · Created as <strong>Pending</strong>
              </div>
            </div>
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
              <label style={lbl}>Section <span style={{ color:"#c92a2a" }}>*</span></label>
              <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Sampaguita" style={inp} />
            </div>
            <div>
              <label style={lbl}>School Year</label>
              <select value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} style={sel}>
                <option value="">— Select year —</option>
                {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          {isSHS && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10, marginTop:10 }}>
              <div style={{ gridColumn:"1/3" }}>
                <label style={lbl}>Strand <span style={{ color:"#c92a2a" }}>*</span></label>
                <select value={strand} onChange={(e) => setStrand(e.target.value)} style={{ ...sel, borderColor: isSHS && !strand ? "#fca5a5" : undefined }}>
                  <option value="">— Select strand —</option>
                  {SHS_STRANDS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {isSHS && !strand && (
                  <div style={{ fontSize:10, color:"#c92a2a", marginTop:3 }}>Strand is required for Senior HS</div>
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
                Add Students {candidates.length > 0 && <span style={{ color:"#8a6a6a", fontWeight:400 }}>({candidates.length} eligible)</span>}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, background:"white", border:"1.5px solid #f0e4e4", borderRadius:9, padding:"0 12px", height:36 }}>
                <i className="ti ti-search" style={{ fontSize:13, color:"#8a6a6a" }} />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={classReady ? "Search by name or LRN…" : "Fill class fields above first"}
                  disabled={!classReady}
                  style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0a0a", fontFamily:"'DM Sans',sans-serif", outline:"none" }} />
                {candLoading && <i className="ti ti-loader-2" style={{ fontSize:13, color:"#c92a2a", animation:"spin 1s linear infinite" }} />}
              </div>
            </div>

            <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
              {!classReady && (
                <div style={{ padding:"40px 18px", textAlign:"center", color:"#8a6a6a", fontSize:12 }}>
                  <i className="ti ti-arrow-up" style={{ fontSize:20, display:"block", marginBottom:8 }} />
                  Complete the class fields above to search for students.
                </div>
              )}
              {classReady && !candLoading && candidates.length === 0 && (
                <div style={{ padding:"40px 18px", textAlign:"center", color:"#8a6a6a", fontSize:12 }}>
                  {searchQuery ? `No eligible students match "${searchQuery}".` : "No eligible students found for this grade. Try searching by name."}
                </div>
              )}
              {candidates.length > 0 && (
                <>
                  <div style={{ padding:"6px 18px", display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid #f9f0f0" }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      style={{ width:15, height:15, accentColor:"#e03131", cursor:"pointer" }} />
                    <span style={{ fontSize:11.5, color:"#855c5c", fontWeight:600 }}>{allSelected ? "Deselect all" : "Select all"}</span>
                    {selected.size > 0 && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={{ marginLeft:"auto", fontSize:11, background:"#fff0f0", color:"#c92a2a", border:"1px solid #fca5a5", borderRadius:99, padding:"2px 8px", fontWeight:700 }}>
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
                      // `documents_assessed: false` means the server could not
                      // work out which documents apply — an empty missing_docs
                      // then says nothing, so it must not read as a green
                      // "Eligible". Drawing it green would vouch for a
                      // checklist nobody ran.
                      const eligBadge = elig == null ? null
                        : elig.blocking_reasons?.length > 0
                          ? { bg:"#fef2f2", color:"#991b1b", border:"#fca5a5", icon:"ti-circle-x", label:"Blocked" }
                          : elig.missing_docs?.length > 0
                            ? { bg:"#fffbeb", color:"#92400e", border:"#fde68a", icon:"ti-file-x", label:`Docs (${elig.missing_docs.length})` }
                            : elig.documents_assessed === false
                              ? { bg:"#f5f5f4", color:"#57534e", border:"#d6d3d1", icon:"ti-help-circle", label:"Docs not checked" }
                              : { bg:"#f0fdf4", color:"#15803d", border:"#bbf7d0", icon:"ti-circle-check", label:"Eligible" };
                      return (
                        <motion.div key={st.student_id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15, ease: "easeOut", delay: Math.min(idx * 0.018, 0.22) }}
                          onClick={() => toggleSelect(st.student_id)}
                          className={`flex cursor-pointer items-center gap-2.5 border-b border-neutral-200/70 px-[18px] py-2.5 transition-colors ${
                            isSelected ? "bg-brand-50" : "bg-white hover:bg-brand-50"
                          }`}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(st.student_id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width:15, height:15, accentColor:"#e03131", cursor:"pointer", flexShrink:0 }} />
                          <div style={{ width:30, height:30, borderRadius:"50%", background:p.bg, color:p.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>{initials||"?"}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12.5, fontWeight:600, color:"#1a0a0a", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{name}</div>
                            <div style={{ fontSize:10.5, color:"#8a6a6a", marginTop:1, display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                              <span>LRN {st.lrn ?? "—"}</span>
                              {st.lastGrade ? (
                                <span style={{ background:"#fff0e8", color:"#b45309", border:"1px solid #fcd9a8", borderRadius:99, padding:"1px 6px", fontSize:10, fontWeight:700 }}>
                                  {st.lastGrade} → <span style={{ color:"#c92a2a" }}>{gradeLevel}</span>
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
                <span style={{ marginLeft:6, fontWeight:400, color:"#8a6a6a" }}>
                  {enrollLoading ? "loading…" : `(${enrolled.length})`}
                </span>
              </div>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
              {!classReady && (
                <div style={{ padding:"40px 18px", textAlign:"center", color:"#8a6a6a", fontSize:12 }}>
                  Fill in the class fields to see enrolled students.
                </div>
              )}
              {classReady && !enrollLoading && enrolled.length === 0 && (
                <div style={{ padding:"40px 18px", textAlign:"center", color:"#8a6a6a", fontSize:12 }}>No students in this class yet.</div>
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
                          <div style={{ fontSize:10.5, color:"#8a6a6a", marginTop:1, display:"flex", gap:6, alignItems:"center" }}>
                            <span>#{en.enrollment_id}</span>
                            {en.enrollment_status && (
                              <StatusBadge
                                status={en.enrollment_status}
                                map={ENROLLMENT_STATUS_MAP}
                                size="sm"
                              />
                            )}
                          </div>
                        </div>
                        {/* Removing cancels the enrollment, which only a pending or
                            enrolled row can be — a completed year stays on record. */}
                        {(en.enrollment_status === "pending" || en.enrollment_status === "enrolled") && (
                        <motion.button
                          whileHover={!isRemoving ? { scale: 1.08, backgroundColor: "#fff0f0", color: "#c92a2a", borderColor: "#fca5a5" } : {}}
                          whileTap={!isRemoving ? { scale: 0.93 } : {}}
                          transition={{ duration: 0.12 }}
                          onClick={() => setPendingRemove(isPendingThisRemove ? null : en)}
                          disabled={isRemoving}
                          title="Remove from class"
                          style={{ width:28, height:28, border:"1px solid #fde2de", borderRadius:7, background: isPendingThisRemove ? "#fff0f0" : "white", display:"flex", alignItems:"center", justifyContent:"center", cursor: isRemoving ? "wait" : "pointer", color: isPendingThisRemove ? "#c92a2a" : "#8a6a6a", flexShrink:0 }}>
                          {isRemoving
                            ? <i className="ti ti-loader-2" style={{ fontSize:12, animation:"spin 1s linear infinite" }} />
                            : <i className="ti ti-x" style={{ fontSize:12 }} />}
                        </motion.button>
                        )}
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
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PROMOTE SECTION MODAL
// ════════════════════════════════════════════════════════════════════════════
function PromoteSectionModal({ onClose, onSuccess, onOpenMassEnroll, initSchoolYear, initGradeLevel, initSection }) {
  const navigate = useNavigate();
  // Step: "input" → "preview" → "result"
  const STEP_ORDER = ["input", "preview", "result"];
  const [step, setStep] = useState("input");
  const [stepDir, setStepDir] = useState(1);
  const prevStepRef = useRef("input");

  const [fromSchoolYear,  setFromSchoolYear]  = useState(initSchoolYear  || "");
  const [fromGradeLevel,  setFromGradeLevel]  = useState(initGradeLevel  || "Grade 7");
  const [fromSection,     setFromSection]     = useState(initSection     || "");
  // Always the year after: promoting into the same year, or skipping years,
  // is refused by the server, so the choice isn't offered.
  const toSchoolYear = fromSchoolYear ? followingSchoolYear(fromSchoolYear) : "";
  const [toSection,       setToSection]       = useState(initSection     || "");

  const [previewing,  setPreviewing]  = useState(false);
  const [previewData, setPreviewData] = useState(null); // { to_grade_level, to_promote, to_skip, ... }
  const [confirming,  setConfirming]  = useState(false);
  const [resultData,  setResultData]  = useState(null);
  const [error,       setError]       = useState("");
  // The server's "level_transition" refusal (Grade 6 -> 7, 10 -> 11, K -> 1).
  // Those learners are placed per class through Mass Enroll, so this is shown
  // as a next step rather than as an error.
  const [levelTransition, setLevelTransition] = useState(null);
  const [closing,     setClosing]     = useState(false);

  function goStep(next) {
    const prevIdx = STEP_ORDER.indexOf(prevStepRef.current);
    const nextIdx = STEP_ORDER.indexOf(next);
    setStepDir(nextIdx > prevIdx ? 1 : -1);
    prevStepRef.current = next;
    setStep(next);
  }

  // Auto-populate toSection when fromSection changes (can be overridden)
  useEffect(() => { setToSection(initSection || fromSection); }, [fromSection, initSection]);

  // Same list as the enrolment form: a promotion's target year is next year,
  // which by definition has no records yet. This was a *5*-year new Date()
  // window while the form above used 4 — two different answers to the same
  // question, on the same page.
  const { options: promoteYearOptions, currentYear: promoteCurrentYear } = useSchoolYear();
  const schoolYearOpts = useMemo(
    () => yearOptionsForEntry(promoteYearOptions, promoteCurrentYear),
    [promoteYearOptions, promoteCurrentYear],
  );

  const allGrades = [
    "Nursery","Kindergarten",
    "Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6",
    "Grade 7","Grade 8","Grade 9","Grade 10","Grade 11",
    // Grade 12 excluded — nothing follows it
  ];

  const inputReady = fromSchoolYear && fromGradeLevel && fromSection.trim() && toSchoolYear;

  const promotePayload = () => ({
    from_school_year: fromSchoolYear,
    from_grade_level: fromGradeLevel,
    from_section:     fromSection.trim(),
    to_school_year:   toSchoolYear,
    to_section:       toSection.trim() || fromSection.trim(),
  });

  async function handlePreview() {
    setError("");
    setLevelTransition(null);
    setPreviewing(true);
    try {
      const data = await promotePreview(promotePayload());
      setPreviewData(data);
      goStep("preview");
    } catch (e) {
      if (e.response?.data?.reason === "level_transition") setLevelTransition(e.response.data);
      setError(e.response?.data?.detail || e.message || "Preview failed.");
    } finally {
      setPreviewing(false);
    }
  }

  // Promote reads only learners whose year is Completed. Closing the section
  // here replaces one "Mark Completed" click per learner, then re-runs the
  // preview so the lists reflect it.
  async function handleCloseYear() {
    setError("");
    setClosing(true);
    try {
      await completeSection({
        school_year: fromSchoolYear,
        grade_level: fromGradeLevel,
        section:     fromSection.trim(),
        // Grade 11 is enrolled per semester; the year ends with the 2nd.
        ...(fromGradeLevel === "Grade 11" ? { semester: "2nd" } : {}),
      });
      setPreviewData(await promotePreview(promotePayload()));
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Could not close the section's year.");
    } finally {
      setClosing(false);
    }
  }

  // A learner held back is re-enrolled in the same grade, one at a time, on
  // the enrollment form -- which opens on "Repeat" for this link.
  const repeaterLink = (studentId) =>
    `/enrollments/new?student=${studentId}&retain=1${toSchoolYear ? `&school_year=${encodeURIComponent(toSchoolYear)}` : ""}`;

  async function handleConfirm() {
    setError("");
    setConfirming(true);
    try {
      const data = await promoteConfirm(promotePayload());
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
    <Modal
      onClose={onClose}
      size="lg"
      showClose
      loading={previewing || confirming}
      // Mid-wizard state (a fetched preview) shouldn't vanish on a stray
      // backdrop click.
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end gap-2.5">
          {step === "input" && (
            <>
              <Button variant="secondary" onClick={onClose} disabled={previewing}>
                Cancel
              </Button>
              <Button icon="ti-eye" loading={previewing} disabled={!inputReady} onClick={handlePreview}>
                {previewing ? "Loading…" : "Preview"}
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button
                variant="secondary"
                disabled={confirming}
                onClick={() => { goStep("input"); setError(""); }}
              >
                Back
              </Button>
              <Button
                icon="ti-arrow-up-right"
                loading={confirming}
                disabled={!previewData?.to_promote?.length}
                onClick={handleConfirm}
              >
                {confirming
                  ? "Promoting…"
                  : `Confirm & Promote${previewData?.to_promote?.length ? ` (${previewData.to_promote.length})` : ""}`}
              </Button>
            </>
          )}
          {step === "result" && <Button onClick={onClose}>Done</Button>}
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* The subtitle tracks the wizard step, so this uses its own header
            rather than Modal's static title/description. */}
        <div className="mb-4 flex shrink-0 items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-info-50">
            <i className="ti ti-arrow-up-right text-[17px] text-info-600" aria-hidden="true" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-neutral-900">Promote Section</div>
            <AnimatePresence mode="wait">
              <motion.div key={step}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14 }}
                className="text-[11.5px] text-neutral-500">
                {step === "input"   && "Move a completed section to the next grade level"}
                {step === "preview" && `Preview · ${previewData?.to_promote?.length ?? 0} to promote, ${previewData?.to_skip?.length ?? 0} to skip`}
                {step === "result"  && `Done · ${resultData?.created?.length ?? 0} promoted`}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Body */}
        <div className="relative min-h-0 flex-1">
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
                    Only students with <strong>completed</strong> status and <strong>no failed/incomplete subjects</strong> will be promoted. If the section is still marked Enrolled, you can close its year from the preview. Nothing is saved until you confirm.
                  </div>

                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:"#855c5c", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>From (Source Section)</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                      <div>
                        <label style={lbl}>School Year <span style={{ color:"#c92a2a" }}>*</span></label>
                        <select value={fromSchoolYear} onChange={(e) => setFromSchoolYear(e.target.value)} style={sel}>
                          <option value="">— Select —</option>
                          {schoolYearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Grade Level <span style={{ color:"#c92a2a" }}>*</span></label>
                        <select value={fromGradeLevel} onChange={(e) => { setFromGradeLevel(e.target.value); setLevelTransition(null); }} style={sel}>
                          {allGrades.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Section <span style={{ color:"#c92a2a" }}>*</span></label>
                        <input value={fromSection} onChange={(e) => setFromSection(e.target.value)} placeholder="e.g. Rizal" style={inp} />
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop:"1px dashed #f0e4e4", paddingTop:18 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#855c5c", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>To (Destination)</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                      <div>
                        <label style={lbl}>School Year</label>
                        <input
                          aria-label="Destination school year"
                          value={toSchoolYear || "—"}
                          readOnly
                          style={{ ...inp, background:"#f8f4f4", color:"#7a5050", cursor:"default" }}
                        />
                        <div style={{ fontSize:10, color:"#8a6a6a", marginTop:3 }}>The year after the source year</div>
                      </div>
                      <div>
                        <label style={lbl}>Grade Level</label>
                        <input
                          value={fromGradeLevel ? (getNextGrade(fromGradeLevel) ?? "—") : "—"}
                          readOnly
                          style={{ ...inp, background:"#f8f4f4", color:"#7a5050", cursor:"default" }}
                        />
                        <div style={{ fontSize:10, color:"#8a6a6a", marginTop:3 }}>Auto-computed from source grade</div>
                      </div>
                      <div>
                        <label style={lbl}>Section</label>
                        <input value={toSection} onChange={(e) => setToSection(e.target.value)} placeholder="Same as source if blank" style={inp} />
                        <div style={{ fontSize:10, color:"#8a6a6a", marginTop:3 }}>Defaults to source section name</div>
                      </div>
                    </div>
                  </div>

                  {levelTransition && (
                    <div style={{ background:"#f0f5ff", border:"1px solid #c7d9f8", borderRadius:10, padding:"12px 16px", fontSize:12.5, color:"#1455a0", display:"flex", flexDirection:"column", gap:10 }}>
                      <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                        <i className="ti ti-info-circle" style={{ fontSize:15, flexShrink:0, marginTop:1 }} />
                        <div>
                          {levelTransition.detail}{" "}
                          Place them with <strong>Mass Enroll</strong>: it lists every learner whose last completed grade is {levelTransition.from_grade_level}.
                        </div>
                      </div>
                      {onOpenMassEnroll && (
                        <div>
                          <Button size="sm" icon="ti-users-plus" onClick={() => onOpenMassEnroll({
                            schoolYear:  toSchoolYear || undefined,
                            schoolLevel: levelTransition.to_school_level,
                            gradeLevel:  levelTransition.to_grade_level,
                          })}>
                            Open Mass Enroll for {levelTransition.to_grade_level}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  <AnimatePresence>
                    {error && !levelTransition && (
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
                        <div style={{ fontSize:10, fontWeight:700, color:"#8a6a6a", textTransform:"uppercase", letterSpacing:"0.07em" }}>{label}</div>
                        <div style={{ fontSize:15, fontWeight:700, color, marginTop:4 }}>{value}</div>
                      </motion.div>
                    ))}
                  </div>

                  {previewData.still_enrolled?.length > 0 && (
                    <div style={{ background:"#faeeda", border:"1px solid #f0c070", borderRadius:10, padding:"12px 16px", fontSize:12.5, color:"#7a4a00", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                      <div>
                        <i className="ti ti-alert-triangle" style={{ marginRight:7 }} />
                        <strong>{previewData.still_enrolled.length}</strong> learner{previewData.still_enrolled.length !== 1 ? "s are" : " is"} still marked <strong>Enrolled</strong> for SY {fromSchoolYear}. Promote only reads learners whose year is <strong>Completed</strong>.
                      </div>
                      <Button size="sm" icon="ti-flag-check" loading={closing} onClick={handleCloseYear}>
                        Mark {previewData.still_enrolled.length} completed
                      </Button>
                    </div>
                  )}

                  {previewData.to_promote.length === 0 && !previewData.still_enrolled?.length && (
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
                            {s.kind === "failed" && (
                              <button type="button" onClick={() => navigate(repeaterLink(s.student_id))}
                                style={{ marginLeft:38, marginTop:4, background:"none", border:"none", padding:0, fontSize:11.5, fontWeight:700, color:"#1455a0", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                                Enroll as repeater →
                              </button>
                            )}
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
                          {s.kind === "failed" && (
                            <button type="button" onClick={() => navigate(repeaterLink(s.student_id))}
                              style={{ marginLeft:6, background:"none", border:"none", padding:0, fontSize:11.5, fontWeight:700, color:"#1455a0", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                              Enroll as repeater →
                            </button>
                          )}
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

        {/* The step hint sits above the buttons; the buttons themselves are in
            Modal's footer slot. */}
        <div className="mt-4 shrink-0 text-xs italic text-neutral-500">
          {step === "input"   && "Promoted students are created as Pending — activate to Enrolled after documents."}
          {step === "preview" && "Review the lists above, then click Confirm to create the enrollment records."}
          {step === "result"  && "You can find the new enrollments under the destination school year."}
        </div>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
/** Completed the 2nd semester of Grade 12: finished, not waiting for a class. */
function isGrade12Finisher(st) {
  const last = st.last_enrollment;
  return Boolean(
    last && last.grade_level === "Grade 12" && last.semester === "2nd" && last.enrollment_status === "completed",
  );
}

export default function EnrollmentsPage() {
  usePageTitle("Enrollments");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canManage = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);
  const token = sessionStorage.getItem("access_token");
  const [enrollments,    setEnrollments]    = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [page,           setPage]           = useState(1);
  const [pageMeta,       setPageMeta]       = useState({ count: 0, next: null, previous: null });
  const [showMassEnroll,  setShowMassEnroll]  = useState(false);
  // Set when Promote hands a level crossing (e.g. Grade 6 -> 7) over to Mass
  // Enroll, so it opens on the destination class instead of the page filters.
  const [massEnrollInit,  setMassEnrollInit]  = useState(null);
  const [showPromote,     setShowPromote]     = useState(false);
  // Active students with no enrolled/pending row in the selected year.
  const [unplaced,        setUnplaced]        = useState(null);
  const [unplacedOpen,    setUnplacedOpen]    = useState(false);
  const [unplacedReload,  setUnplacedReload]  = useState(0);
  const [markingGraduated, setMarkingGraduated] = useState(false);
  const [statusCounts,   setStatusCounts]   = useState({ total: 0, enrolled: 0, pending: 0, completed: 0, cancelled: 0 });
  const [countsLoading,  setCountsLoading]  = useState(true);
  const [countsReload,   setCountsReload]   = useState(0);
  // "Close SY": a finished year that still has learners marked Enrolled.
  const { currentYear } = useSchoolYear();
  const [closeYearAsk,   setCloseYearAsk]   = useState(false);
  const [closingYear,    setClosingYear]    = useState(false);

  // Filters — seeded from the URL so links from elsewhere (e.g. Dashboard cards) can land pre-filtered.
  // The year follows hooks/useYearFilter: the link's year if it names one, else the current school year.
  const [schoolYear,   setSchoolYear, yearIsDefault] = useYearFilter();
  const [schoolLevel,  setSchoolLevel]  = useState(() => searchParams.get("school_level") ?? "");
  const [gradeLevel,   setGradeLevel]   = useState(() => searchParams.get("grade_level") ?? "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("enrollment_status") ?? "");
  // The guardian's answer on pending rows: returning / not_returning / none.
  const [parentAnswer, setParentAnswer] = useState("");
  const [search,       setSearch]       = useState("");
  const [searchInput,  setSearchInput]  = useState("");

  const gradeOptions      = GRADE_LEVELS_BY_LEVEL[schoolLevel] ?? ["All Grades"];

  // Only pending rows carry a guardian's answer, so the filter applies only
  // while Pending is selected.
  const activeParentAnswer = statusFilter === "pending" ? parentAnswer : "";

  // Not-yet-placed worklist for the selected year. Staff who manage
  // enrollments only; the endpoint refuses everyone else. Rendered only when
  // it matches the selected year, so a stale list never shows.
  useEffect(() => {
    if (!token || !canManage || !schoolYear) return;
    let cancelled = false;
    getUnplacedStudents(schoolYear)
      .then((d) => { if (!cancelled) setUnplaced(d); })
      .catch(() => { if (!cancelled) setUnplaced(null); });
    return () => { cancelled = true; };
  }, [token, canManage, schoolYear, unplacedReload]);

  // Learners who finished Grade 12 are not waiting for a class -- they have
  // graduated. Nothing used to record that, so they stayed "active" and sat
  // on this list every year; they get "Mark graduated" instead of "Enroll".
  const finishedGrade12 = (unplaced?.results ?? []).filter(isGrade12Finisher);

  async function handleMarkGraduated(studentIds) {
    setMarkingGraduated(true);
    try {
      const res = await markStudentsGraduated(studentIds);
      const done = res.graduated.length;
      if (done) toast.success(`${done} student${done === 1 ? "" : "s"} marked graduated.`);
      if (res.skipped.length) {
        toast.error(`${res.skipped.length} not changed: ${res.skipped[0].reason}`, { duration: 8000 });
      }
      setUnplacedReload((k) => k + 1);
    } catch (e) {
      toast.error(e.message || "Could not mark them graduated.");
    } finally {
      setMarkingGraduated(false);
    }
  }

  // Reset grade when level changes — but not on the initial mount, so a URL-seeded
  // grade_level (alongside school_level) isn't immediately wiped out.
  const skipLevelReset = useRef(true);
  useEffect(() => {
    if (skipLevelReset.current) { skipLevelReset.current = false; return; }
    setGradeLevel("");
  }, [schoolLevel]);

  // Fetch status counts scoped to the same school year / level / grade as the list below,
  // so the stat-card numbers always match what clicking into them actually shows.
  useEffect(() => {
    if (!token) return;
    setCountsLoading(true);
    const scope = {};
    if (schoolYear)  scope.school_year  = schoolYear;
    if (schoolLevel) scope.school_level = schoolLevel;
    if (gradeLevel)  scope.grade_level  = gradeLevel;

    Promise.all([
      apiGetEnrollments({ ...scope, page_size: 1 }),
      apiGetEnrollments({ ...scope, page_size: 1, enrollment_status: "enrolled"  }),
      apiGetEnrollments({ ...scope, page_size: 1, enrollment_status: "pending"   }),
      apiGetEnrollments({ ...scope, page_size: 1, enrollment_status: "completed" }),
      apiGetEnrollments({ ...scope, page_size: 1, enrollment_status: "cancelled" }),
    ]).then(([all, enrolled, pending, completed, cancelled]) => {
      setStatusCounts({
        total:     all.count       ?? 0,
        enrolled:  enrolled.count  ?? 0,
        pending:   pending.count   ?? 0,
        completed: completed.count ?? 0,
        cancelled: cancelled.count ?? 0,
      });
    }).catch(() => {}).finally(() => setCountsLoading(false));
  }, [token, schoolYear, schoolLevel, gradeLevel, countsReload]);

  // A year that has ended but still lists learners as Enrolled was never
  // closed: they read as enrolled in two years, their old advisers can still
  // edit them, and analytics sees that year through the leftovers. Offered
  // only for a past year, on the unfiltered counts, so the number is the
  // whole year's.
  const openPastYear = canManage && schoolYear && currentYear && schoolYear < currentYear
    && !schoolLevel && !gradeLevel && !countsLoading && statusCounts.enrolled > 0;
  useEffect(() => { setCloseYearAsk(false); }, [schoolYear]);

  async function handleCloseYear() {
    setClosingYear(true);
    try {
      const res = await closeSchoolYear(schoolYear);
      toast.success(`SY ${res.school_year} closed — ${res.completed} enrollment${res.completed === 1 ? "" : "s"} marked completed.`);
      setCloseYearAsk(false);
      setCountsReload((k) => k + 1);
      setUnplacedReload((k) => k + 1);
      fetchEnrollments(1);
    } catch (e) {
      toast.error(e.message || "Could not close the school year.");
    } finally {
      setClosingYear(false);
    }
  }

  // Distinguishes "this request failed" from "there are no enrollments".
  const [loadError, setLoadError] = useState(null);

  const fetchEnrollments = useCallback(async (pg = 1) => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: pg });
      if (schoolYear)   params.set("school_year",        schoolYear);
      if (schoolLevel)  params.set("school_level",       schoolLevel);
      if (gradeLevel)   params.set("grade_level",        gradeLevel);
      if (statusFilter) params.set("enrollment_status",  statusFilter);
      if (activeParentAnswer) params.set("guardian_response", activeParentAnswer);
      if (search)       params.set("search",             search);

      const data = await apiGetEnrollments(Object.fromEntries(params));
      setEnrollments(data.results ?? []);
      setPageMeta({ count: data.count, next: data.next, previous: data.previous });
      setPage(pg);
    } catch (err) {
      console.error(err);
      // Surface the failure instead of falling through to the empty state,
      // which invited the user to "+ New Enrollment" during an outage.
      setLoadError(err);
      setEnrollments([]);
      setPageMeta({ count: 0, next: null, previous: null });
    } finally {
      setLoading(false);
    }
  }, [token, schoolYear, schoolLevel, gradeLevel, statusFilter, activeParentAnswer, search]);

  useEffect(() => { fetchEnrollments(1); }, [fetchEnrollments]);

  const handleSearch = () => { setSearch(searchInput); };
  const clearFilters = () => {
    setSchoolYear(null); // back to the current school year, not All years
    setSchoolLevel(""); setGradeLevel("");
    setStatusFilter(""); setParentAnswer(""); setSearch(""); setSearchInput("");
  };

  // The current year is where the page opens, so it isn't a filter to clear.
  const hasFilters = !yearIsDefault || schoolLevel || gradeLevel || statusFilter || activeParentAnswer || search;
  const totalPages = Math.ceil(pageMeta.count / 20);

  const isFirstRender    = useIsFirstRender();

  return (
    <>
    <>

          <PageHeader
            title="Enrollments"
            icon="ti-clipboard-list"
            subtitle={loading ? "Loading…" : `${pageMeta.count.toLocaleString()} enrollment${pageMeta.count !== 1 ? "s" : ""} found`}
            actions={
              <>
                {canManage && (
                  <Button variant="secondary" icon="ti-arrow-up-right" onClick={() => setShowPromote(true)}>
                    Promote Section
                  </Button>
                )}
                <Button variant="secondary" icon="ti-users-plus" onClick={() => setShowMassEnroll(true)}>
                  Mass Enroll
                </Button>
                <Button icon="ti-clipboard-plus" onClick={() => navigate("/enrollments/new")}>
                  New Enrollment
                </Button>
              </>
            }
          />

          {/* Content */}
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:18 }}>

            {/* ── Stat cards ── */}
            <div className="flex gap-3">
              {[
                { label:"Total Enrollments", icon:"ti-clipboard-list", value: statusCounts.total,     tone:"brand",   status:"" },
                { label:"Enrolled",          icon:"ti-user-check",     value: statusCounts.enrolled,  tone:"success", status:"enrolled" },
                { label:"Pending",           icon:"ti-clock",          value: statusCounts.pending,   tone:"warning", status:"pending" },
                { label:"Completed",         icon:"ti-certificate",    value: statusCounts.completed, tone:"info",    status:"completed" },
                { label:"Cancelled",         icon:"ti-user-x",         value: statusCounts.cancelled, tone:"error",   status:"cancelled" },
              ].map((card, i) => (
                <div key={card.label} className="min-w-0 flex-1">
                  <StatCard
                    label={card.label}
                    icon={card.icon}
                    iconTone={card.tone}
                    value={card.value?.toLocaleString() ?? "—"}
                    loading={countsLoading}
                    active={statusFilter === card.status}
                    onClick={() => setStatusFilter(statusFilter === card.status ? "" : card.status)}
                    animate={isFirstRender}
                    animateDelay={isFirstRender ? i * 0.06 : 0}
                  />
                </div>
              ))}
            </div>

            {/* ── A finished year still open ── */}
            {openPastYear && (
              <Card padding="none" className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-2.5 text-sm text-neutral-800">
                    <i className="ti ti-calendar-exclamation text-lg text-warning-500" aria-hidden="true" />
                    <span>
                      SY {schoolYear} has ended, but <strong>{statusCounts.enrolled}</strong> learner{statusCounts.enrolled !== 1 ? "s are" : " is"} still marked Enrolled.
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {closeYearAsk ? (
                      <>
                        <span className="text-xs text-neutral-600">Mark all {statusCounts.enrolled} completed?</span>
                        <Button variant="primary" size="sm" loading={closingYear} onClick={handleCloseYear}>
                          Close SY {schoolYear}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={closingYear} onClick={() => setCloseYearAsk(false)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button variant="secondary" size="sm" icon="ti-lock" onClick={() => setCloseYearAsk(true)}>
                        Close SY {schoolYear}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* ── Not yet placed ── */}
            {canManage && unplaced?.school_year === schoolYear && unplaced.count > 0 && (
              <Card padding="none" className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-2.5 text-sm text-neutral-800">
                    <i className="ti ti-user-question text-lg text-warning-500" aria-hidden="true" />
                    <span>
                      <strong>{unplaced.count}</strong> active student{unplaced.count !== 1 ? "s have" : " has"} no enrollment in SY {unplaced.school_year}.
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {finishedGrade12.length > 1 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="ti-certificate"
                        loading={markingGraduated}
                        onClick={() => handleMarkGraduated(finishedGrade12.map((st) => st.student_id))}
                      >
                        Mark {finishedGrade12.length} Grade 12 finishers graduated
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={unplacedOpen ? "ti-chevron-up" : "ti-chevron-down"}
                      aria-expanded={unplacedOpen}
                      onClick={() => setUnplacedOpen((v) => !v)}
                    >
                      {unplacedOpen ? "Hide" : "Show"}
                    </Button>
                  </div>
                </div>
                {unplacedOpen && (
                  <ul className="max-h-72 divide-y divide-neutral-100 overflow-y-auto border-t border-neutral-100">
                    {unplaced.results.map((st) => (
                      <li key={st.student_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-neutral-900">{st.full_name}</div>
                          <div className="truncate text-xs text-neutral-500">
                            {st.last_enrollment
                              ? `Last: ${st.last_enrollment.grade_level} · SY ${st.last_enrollment.school_year} · ${ENROLLMENT_STATUS_MAP[st.last_enrollment.enrollment_status]?.label ?? st.last_enrollment.enrollment_status}`
                              : "No enrollment on record"}
                          </div>
                        </div>
                        {isGrade12Finisher(st) ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon="ti-certificate"
                            loading={markingGraduated}
                            onClick={() => handleMarkGraduated([st.student_id])}
                          >
                            Mark graduated
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon="ti-clipboard-plus"
                            onClick={() => navigate(`/enrollments/new?student=${st.student_id}&school_year=${encodeURIComponent(unplaced.school_year)}`)}
                          >
                            Enroll
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {/* ── Search + filters ── */}
            <FilterBar
              animate={isFirstRender}
              animateDelay={isFirstRender ? 0.22 : 0}
              searchInputId="enrollment-search"
              searchLabel="Search students"
              searchPlaceholder="Search student name or section…"
              searchValue={searchInput}
              onSearchChange={setSearchInput}
              onSearch={handleSearch}
              onClearSearch={() => { setSearchInput(""); setSearch(""); }}
              hasFilters={Boolean(hasFilters)}
              onClearFilters={clearFilters}
              scope={<SchoolYearPicker value={schoolYear} onChange={setSchoolYear} />}
            >
              <FilterRow label="School Level">
                <ChipGroup
                  label="Filter by school level"
                  value={schoolLevel}
                  onChange={setSchoolLevel}
                  options={[
                    { value: "",                  label: "All Levels",   icon: "ti-layout-grid",   tone: "brand" },
                    { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", tone: "nursery" },
                    { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          tone: "kindergarten" },
                    { value: "elementary",        label: "Elementary",   icon: "ti-book",          tone: "elementary" },
                    { value: "junior_highschool", label: "Junior High",  icon: "ti-school",        tone: "juniorhigh" },
                    { value: "senior_highschool", label: "Senior High",  icon: "ti-certificate",   tone: "seniorhigh" },
                  ]}
                />
              </FilterRow>

              <CollapsibleFilterRow open={schoolLevel !== ""} label="Grade Level">
                <ChipGroup
                  label="Filter by grade level"
                  stagger
                  generation={schoolLevel}
                  value={gradeLevel}
                  onChange={setGradeLevel}
                  options={gradeOptions.map((g) => ({
                    value: g === "All Grades" ? "" : g,
                    label: g,
                  }))}
                />
              </CollapsibleFilterRow>

              <FilterRow label="Status">
                <ChipGroup
                  label="Filter by status"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  // Each chip shows ITS OWN count, from statusCounts.
                  //
                  // All four used to read `pageMeta.count`, which is the size
                  // of the currently filtered list -- so with "Enrolled"
                  // selected and 68 results, every chip read 68, including
                  // Cancelled when there were none. The per-status numbers
                  // were already being fetched for the stat cards directly
                  // above; the chips just were not reading them.
                  options={[
                    { value: "",          label: "All",       tone: "brand",   count: !countsLoading ? statusCounts.total     : null },
                    { value: "enrolled",  label: "Enrolled",  tone: "success", dot: "#4caf50", count: !countsLoading ? statusCounts.enrolled  : null },
                    { value: "pending",   label: "Pending",   tone: "warning", dot: "#ff9800", count: !countsLoading ? statusCounts.pending   : null },
                    { value: "completed", label: "Completed", tone: "info",    dot: "#2196f3", count: !countsLoading ? statusCounts.completed : null },
                    { value: "cancelled", label: "Cancelled", tone: "error",   dot: "#f44336", count: !countsLoading ? statusCounts.cancelled : null },
                  ]}
                />
              </FilterRow>

              {/* Guardians answer "returning next year?" on pending rows, so
                  this only appears with the Pending filter. */}
              <CollapsibleFilterRow open={statusFilter === "pending"} label="Parent answer">
                <ChipGroup
                  label="Filter by parent answer"
                  value={parentAnswer}
                  onChange={setParentAnswer}
                  options={[
                    { value: "",              label: "All",           tone: "brand" },
                    { value: "returning",     label: "Returning",     tone: "success", icon: "ti-user-check" },
                    { value: "not_returning", label: "Not returning", tone: "error",   icon: "ti-user-x" },
                    { value: "none",          label: "No answer",     tone: "warning", icon: "ti-help-circle" },
                  ]}
                />
              </CollapsibleFilterRow>
            </FilterBar>

            {/* ── Table ── */}
            <motion.div
              initial={isFirstRender ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.1 : 0 }}
            >
              <Card padding="none" className="overflow-hidden">
                <Table
                  columns={TABLE_COLUMNS}
                  loading={loading}
                  error={loadError}
                  onRetry={() => fetchEnrollments(page)}
                  errorSubject="enrollments"
                  isEmpty={enrollments.length === 0}
                  empty={{
                    icon: "ti-clipboard-off",
                    title: "No enrollments found",
                    subtitle: "Try adjusting your filters or enroll a new student",
                    action: (
                      <Button size="sm" icon="ti-plus" onClick={() => navigate("/enrollments/new")}>
                        New Enrollment
                      </Button>
                    ),
                  }}
                >
                  {enrollments.map((en) => {
                    const name = en.student_name ?? `Student #${en.student}`;
                    const palette = getAvatarPalette(name);
                    const levelIcon = LEVEL_ICONS[en.school_level] ?? "ti-school";
                    return (
                      <TableRow
                        key={en.enrollment_id}
                        onClick={() => navigate(`/enrollments/${en.enrollment_id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                              style={{ background: palette.bg, color: palette.color }}
                              aria-hidden="true"
                            >
                              {initialsFrom(name) || "?"}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-neutral-900 transition-colors group-hover:text-brand-600">
                                {name}
                              </div>
                              <div className="truncate text-xs text-neutral-500">
                                ID #{en.enrollment_id}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <i className={`ti ${levelIcon} text-sm text-brand-600`} aria-hidden="true" />
                            <span className="text-xs text-neutral-700">
                              {SCHOOL_LEVELS.find((l) => l.value === en.school_level)?.label ?? en.school_level}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="text-xs font-medium text-neutral-700">
                          {en.grade_level}
                        </TableCell>

                        <TableCell className="text-xs text-neutral-700">
                          {en.section}
                        </TableCell>

                        <TableCell>
                          <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-700">
                            {en.school_year}
                          </span>
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge
                              status={en.enrollment_status}
                              map={ENROLLMENT_STATUS_MAP}
                            />
                            {en.enrollment_status === "pending" && en.guardian_response && (
                              <StatusBadge
                                size="sm"
                                status={en.guardian_response.response}
                                map={GUARDIAN_RESPONSE_MAP}
                                title={en.guardian_response.reason ? `Parent: ${en.guardian_response.reason}` : "Parent's answer"}
                              />
                            )}
                          </div>
                        </TableCell>

                        {/* Stop propagation so the edit action doesn't also
                            trigger the row's navigate-to-detail. */}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="ti-pencil"
                            aria-label={`Edit enrollment ${en.enrollment_id}`}
                            onClick={() => navigate(`/enrollments/${en.enrollment_id}/edit`)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Table>
              </Card>
            </motion.div>

            {!loading && !loadError && pageMeta.count > 0 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                count={pageMeta.count}
                hasPrevious={Boolean(pageMeta.previous)}
                hasNext={Boolean(pageMeta.next)}
                onPageChange={(p) => fetchEnrollments(p)}
              />
            )}


          </div>
    </>
    <AnimatePresence>
      {showMassEnroll && (
        <MassEnrollModal
          onClose={() => { setShowMassEnroll(false); setMassEnrollInit(null); }}
          onSuccess={() => fetchEnrollments(page)}
          initSchoolYear={massEnrollInit?.schoolYear   ?? (schoolYear   || undefined)}
          initSchoolLevel={massEnrollInit?.schoolLevel ?? (schoolLevel || undefined)}
          initGradeLevel={massEnrollInit?.gradeLevel   ?? (gradeLevel   || undefined)}
        />
      )}
    </AnimatePresence>
    <AnimatePresence>
      {showPromote && (
        <PromoteSectionModal
          onClose={() => setShowPromote(false)}
          onSuccess={() => fetchEnrollments(page)}
          onOpenMassEnroll={(init) => {
            setShowPromote(false);
            setMassEnrollInit(init);
            setShowMassEnroll(true);
          }}
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

