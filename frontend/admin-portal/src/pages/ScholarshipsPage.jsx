import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Tabs from "../components/ui/Tabs";
import ChipGroup from "../components/ui/ChipGroup";
import Pagination from "../components/Pagination";
import FilterBar, { FilterRow, CollapsibleFilterRow } from "../components/ui/FilterBar";
import { modalVariants, springTransition } from "../utils/motion";

// ── API ───────────────────────────────────────────────────────────────────────
import {
  getEnrollmentScholarships as _getEnrollmentScholarships,
  getEnrollmentScholarshipSummary,
  getScholarshipTypes as _getScholarshipTypes,
  getEnrollments as _getEnrollments,
  getGrades as _getGrades,
  createEnrollmentScholarship as _createEnrollmentScholarship,
  deleteEnrollmentScholarship as _deleteEnrollmentScholarship,
} from "../api/enrollmentApi";
import { useSchoolYear } from "../context/SchoolYearContext";

const getEnrollmentScholarships   = (p = {}) => _getEnrollmentScholarships(p);
const getScholarshipTypes         = ()       => _getScholarshipTypes({ is_active: true, page_size: 100 });
const getEnrollments              = (p = {}) => _getEnrollments(p);
const getGrades                   = (p = {}) => _getGrades(p);
const createEnrollmentScholarship = (p)      => _createEnrollmentScholarship(p);
const deleteEnrollmentScholarship = (id)     => _deleteEnrollmentScholarship(id);

// ── Constants ─────────────────────────────────────────────────────────────────
const ELIGIBILITY_THRESHOLD = 95;
const PAGE_SIZE = 20;

// Mirrors EnrollmentsPage — awards are filtered through their enrollment, so
// the level/grade vocabulary has to match the one enrollments are recorded with.
const SCHOOL_LEVELS = [
  { value: "nursery",           label: "Nursery",            tone: "nursery"      },
  { value: "kindergarten",      label: "Kindergarten",       tone: "kindergarten" },
  { value: "elementary",        label: "Elementary",         tone: "elementary"   },
  { value: "junior_highschool", label: "Junior High School", tone: "juniorhigh"   },
  { value: "senior_highschool", label: "Senior High School", tone: "seniorhigh"   },
];

const GRADE_LEVELS_BY_LEVEL = {
  "":                [],
  nursery:           ["Nursery"],
  kindergarten:      ["Kindergarten"],
  elementary:        ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  junior_highschool: ["Grade 7", "Grade 8", "Grade 9", "Grade 10"],
  senior_highschool: ["Grade 11", "Grade 12"],
};

const PALETTES = [
  { bg:"#fde8e8", color:"#c0392b" }, { bg:"#e8f0fd", color:"#2563eb" },
  { bg:"#e8fdf0", color:"#2e6b0d" }, { bg:"#fdf5e8", color:"#854f0b" },
  { bg:"#f0e8fd", color:"#7c3aed" }, { bg:"#fde8f8", color:"#be185d" },
  { bg:"#e8fdfd", color:"#1455a0" },
];
const getPalette = (name = "X") => PALETTES[name.charCodeAt(0) % PALETTES.length];

const PERIOD_OPTIONS = [
  { value:"1st_quarter",  label:"1st Quarter"  },
  { value:"2nd_quarter",  label:"2nd Quarter"  },
  { value:"3rd_quarter",  label:"3rd Quarter"  },
  { value:"4th_quarter",  label:"4th Quarter"  },
  { value:"1st_semester", label:"1st Semester" },
  { value:"2nd_semester", label:"2nd Semester" },
];
const PERIOD_LABELS = Object.fromEntries(PERIOD_OPTIONS.map((p) => [p.value, p.label]));

const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width:w, height:h, borderRadius:r, background:"linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.6s ease-in-out infinite" }} />
);

// ── Shared modal shell ────────────────────────────────────────────────────────
function ModalShell({ onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:999 }}>
      <motion.div
        initial={{ opacity:0 }}
        animate={{ opacity:1 }}
        exit={{ opacity:0 }}
        transition={{ duration:0.18 }}
        onClick={onClose}
        style={{ position:"absolute", inset:0, background:"rgba(26,10,10,0.4)", backdropFilter:"blur(4px)" }}
      />
      <motion.div
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={springTransition}
        style={{ position:"relative" }}
      >
        {children}
      </motion.div>
    </div>
  );
}

// ── Award Modal ───────────────────────────────────────────────────────────────
function AwardModal({ scholarshipTypes, onClose, onSaved }) {
  const [search,      setSearch]      = useState("");
  const [students,    setStudents]    = useState([]);
  const [loadingSt,   setLoadingSt]   = useState(false);
  const [student,     setStudent]     = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [enrollment,  setEnrollment]  = useState(null);
  const [schTypeId,   setSchTypeId]   = useState("");
  const [notes,       setNotes]       = useState("");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");
  const [open,        setOpen]        = useState(false);

  const { schoolYear: currentSY } = useSchoolYear();

  useEffect(() => {
    if (!search.trim()) { setStudents([]); return; }
    setLoadingSt(true);
    const t = setTimeout(async () => {
      try {
        const data = await getEnrollments({ search, enrollment_status:"enrolled", school_year:currentSY, page_size:100 });
        const results = Array.isArray(data) ? data : data?.results ?? [];
        setStudents(results.map((en) => ({
          student_id:  en.student,
          first_name:  en.student_name?.split(" ")[0] ?? "",
          last_name:   en.student_name?.split(" ").slice(-1)[0] ?? "",
          lrn:         en.lrn ?? "",
          _enrollment: en,
        })));
      } catch { setStudents([]); }
      finally { setLoadingSt(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!student) { setEnrollments([]); setEnrollment(null); return; }
    if (student._enrollment) { setEnrollments([student._enrollment]); setEnrollment(student._enrollment); return; }
    getEnrollments({ student:student.student_id, enrollment_status:"enrolled", school_year:currentSY, page_size:20 })
      .then((d) => setEnrollments(Array.isArray(d) ? d : d?.results ?? []))
      .catch(() => setEnrollments([]));
  }, [student]);

  const handleSave = async () => {
    if (!enrollment) { setError("Please select an enrollment."); return; }
    if (!schTypeId)  { setError("Please select a scholarship type."); return; }
    setSaving(true); setError("");
    try {
      await createEnrollmentScholarship({ enrollment:enrollment.enrollment_id, scholarship_type:parseInt(schTypeId), notes:notes.trim()||null });
      toast.success("Scholarship awarded.");
      onSaved(); onClose();
    } catch (e) {
      const msg = e.message || "Failed to award scholarship.";
      setError(msg);
      toast.error(msg);
    }
    finally { setSaving(false); }
  };

  const inp = { width:"100%", border:"1.5px solid #fde2de", borderRadius:10, padding:"10px 14px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a", background:"#fffbfb", outline:"none", boxSizing:"border-box" };
  const lbl = { display:"block", fontSize:10.5, fontWeight:700, color:"#7a5050", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:6 };

  return (
    <ModalShell onClose={onClose}>
      <div style={{ background:"white", borderRadius:20, width:520, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(224,49,49,0.18)" }}>
        <div style={{ padding:"22px 28px 18px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(to right,#fdfafa,white)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <i className="ti ti-award" style={{ fontSize:18, color:"#c92a2a" }} />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a" }}>Award Scholarship</div>
              <div style={{ fontSize:11, color:"#8a6a6a", marginTop:1 }}>Manually assign a scholarship to an enrollment</div>
            </div>
          </div>
          <motion.button onClick={onClose} whileHover={{ scale:1.1, color:"#c92a2a" }} whileTap={{ scale:0.9 }} transition={{ duration:0.12 }}
            style={{ background:"none", border:"none", cursor:"pointer", color:"#8a6a6a", fontSize:20, display:"flex", alignItems:"center" }}>
            <i className="ti ti-x" />
          </motion.button>
        </div>

        <div style={{ padding:"22px 28px" }}>
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }} transition={{ duration:0.16 }}
                style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#b91c1c", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
                <i className="ti ti-alert-circle" style={{ fontSize:14 }} />{error}
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ marginBottom:14 }}>
            <label style={lbl}>Student *</label>
            {student ? (
              <motion.div initial={{ opacity:0, scale:0.97 }} animate={{ opacity:1, scale:1 }}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", border:"1.5px solid #fde2de", borderRadius:10, background:"#fff8f6" }}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:getPalette(student.last_name).bg, color:getPalette(student.last_name).color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:13, flexShrink:0 }}>
                  {`${student.first_name?.[0]??""}${student.last_name?.[0]??""}`.toUpperCase()}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{student.first_name} {student.last_name}</div>
                  <div style={{ fontSize:11, color:"#8a6a6a" }}>LRN {student.lrn}</div>
                </div>
                <button onClick={() => { setStudent(null); setEnrollment(null); }}
                  style={{ background:"transparent", border:"1px solid #fde2de", borderRadius:7, padding:"5px 10px", fontSize:12, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Change</button>
              </motion.div>
            ) : (
              <div style={{ position:"relative" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, background:"white", border:"1.5px solid #fde2de", borderRadius:10, padding:"0 14px", height:44 }}>
                  <i className="ti ti-search" style={{ fontSize:14, color:"#8a6a6a" }} />
                  <input placeholder="Search student by name or LRN…" value={search}
                    onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0a0a", outline:"none", fontFamily:"'DM Sans',sans-serif" }} />
                  {loadingSt && <i className="ti ti-loader-2" style={{ fontSize:13, color:"#c92a2a", animation:"spin 1s linear infinite" }} />}
                </div>
                <AnimatePresence>
                  {open && search && (
                    <motion.div initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }} transition={{ duration:0.14 }}
                      style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:6, background:"white", borderRadius:10, border:"1px solid #fde2de", boxShadow:"0 12px 40px rgba(224,49,49,0.14)", maxHeight:220, overflowY:"auto", zIndex:1000 }}>
                      {students.length === 0 && !loadingSt && <div style={{ padding:"16px", textAlign:"center", color:"#8a6a6a", fontSize:13 }}>No students found.</div>}
                      {students.map((st) => (
                        <div key={st.student_id} onClick={() => { setStudent(st); setOpen(false); setSearch(""); }}
                          style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", cursor:"pointer", borderBottom:"1px solid #f9f0f0", transition:"background 0.1s" }}
                          onMouseEnter={(e) => e.currentTarget.style.background="#fff8f6"}
                          onMouseLeave={(e) => e.currentTarget.style.background="transparent"}>
                          <div style={{ width:30, height:30, borderRadius:"50%", background:getPalette(st.last_name).bg, color:getPalette(st.last_name).color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>
                            {`${st.first_name?.[0]??""}${st.last_name?.[0]??""}`.toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{st.last_name}, {st.first_name}</div>
                            <div style={{ fontSize:11, color:"#8a6a6a" }}>LRN {st.lrn}</div>
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {student && (
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>Enrollment *</label>
              {enrollments.length === 0
                ? <div style={{ fontSize:13, color:"#8a6a6a", padding:"12px 14px", background:"#fdfafa", borderRadius:10, border:"1px solid #f5eaea", fontStyle:"italic" }}>No active enrollments found for this student.</div>
                : <select value={enrollment?.enrollment_id ?? ""} onChange={(e) => setEnrollment(enrollments.find((en) => en.enrollment_id === parseInt(e.target.value)) ?? null)} style={{ ...inp, cursor:"pointer" }}>
                    <option value="">— Select enrollment —</option>
                    {enrollments.map((en) => (
                      <option key={en.enrollment_id} value={en.enrollment_id}>S.Y. {en.school_year} · {en.grade_level} · {en.section}</option>
                    ))}
                  </select>
              }
            </div>
          )}

          <div style={{ marginBottom:14 }}>
            <label style={lbl}>Scholarship Type *</label>
            <select value={schTypeId} onChange={(e) => setSchTypeId(e.target.value)} style={{ ...inp, cursor:"pointer" }}>
              <option value="">— Select scholarship —</option>
              {scholarshipTypes.map((sc) => (
                <option key={sc.scholarship_type_id} value={sc.scholarship_type_id}>
                  {sc.scholarship_name} ({sc.discount_mode === "percentage" ? `${parseFloat(sc.discount_value)}%` : `₱${parseFloat(sc.discount_value).toLocaleString()}`} off)
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom:6 }}>
            <label style={lbl}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional remarks…" rows={2} style={{ ...inp, resize:"vertical" }} />
          </div>
        </div>

        <div style={{ padding:"16px 28px 24px", display:"flex", justifyContent:"flex-end", gap:10, borderTop:"1px solid #f5eaea" }}>
          <motion.button onClick={onClose} whileHover={{ borderColor:"#e03131", color:"#c92a2a" }} whileTap={{ scale:0.97 }} transition={{ duration:0.12 }}
            style={{ background:"transparent", color:"#855c5c", border:"1.5px solid #fde2de", borderRadius:50, padding:"9px 22px", fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>
            Cancel
          </motion.button>
          <motion.button onClick={handleSave} disabled={saving}
            whileHover={saving ? {} : { scale:1.02, boxShadow:"0 6px 20px rgba(224,49,49,0.35)" }}
            whileTap={saving ? {} : { scale:0.97 }}
            transition={{ duration:0.12 }}
            style={{ background:saving?"#e87474":"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:50, padding:"9px 24px", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:saving?"not-allowed":"pointer", display:"inline-flex", alignItems:"center", gap:8, boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}>
            {saving ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:"spin 1s linear infinite" }} />Saving…</> : <><i className="ti ti-award" style={{ fontSize:13 }} />Award Scholarship</>}
          </motion.button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Revoke Modal ──────────────────────────────────────────────────────────────
function RevokeModal({ onConfirm, onCancel }) {
  return (
    <ModalShell onClose={onCancel}>
      <div style={{ background:"white", borderRadius:20, padding:"32px 36px", width:400, boxShadow:"0 24px 64px rgba(224,49,49,0.18)", display:"flex", flexDirection:"column", alignItems:"center", gap:14 }}>
        <div style={{ width:56, height:56, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <i className="ti ti-award-off" style={{ fontSize:24, color:"#c92a2a" }} />
        </div>
        <div style={{ fontSize:17, fontWeight:700, color:"#1a0a0a" }}>Revoke Scholarship?</div>
        <div style={{ fontSize:13, color:"#7a5050", textAlign:"center", lineHeight:1.7 }}>
          This will remove the scholarship award from this enrollment. The student may need to reapply.
        </div>
        <div style={{ display:"flex", gap:10, width:"100%", marginTop:4 }}>
          <motion.button onClick={onCancel} whileHover={{ borderColor:"#e03131", color:"#c92a2a" }} whileTap={{ scale:0.97 }} transition={{ duration:0.12 }}
            style={{ flex:1, height:42, border:"1.5px solid #f0e0e0", borderRadius:10, background:"white", fontSize:13, color:"#7a5050", cursor:"pointer", fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
            Cancel
          </motion.button>
          <motion.button onClick={onConfirm}
            whileHover={{ scale:1.02, boxShadow:"0 6px 18px rgba(224,49,49,0.32)" }}
            whileTap={{ scale:0.97 }}
            transition={{ duration:0.12 }}
            style={{ flex:1, height:42, border:"none", borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", fontSize:13, color:"white", cursor:"pointer", fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>
            Yes, revoke
          </motion.button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Apply Eligibility Modal ───────────────────────────────────────────────────
function ApplyEligibilityModal({ eligible, scholarshipTypes, onClose, onSaved }) {
  const [schTypeId, setSchTypeId] = useState("");
  const [notes,     setNotes]     = useState(`Awarded based on general average ≥ ${ELIGIBILITY_THRESHOLD}%`);
  const [applying,  setApplying]  = useState(false);
  const [results,   setResults]   = useState(null);
  const [error,     setError]     = useState("");

  const inp = { width:"100%", border:"1.5px solid #fde2de", borderRadius:10, padding:"10px 14px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a", background:"#fffbfb", outline:"none", boxSizing:"border-box" };
  const lbl = { display:"block", fontSize:10.5, fontWeight:700, color:"#7a5050", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:6 };

  const handleApply = async () => {
    if (!schTypeId) { setError("Please select a scholarship type."); return; }
    if (eligible.length === 0) { setError("No students to award."); return; }
    setApplying(true); setError("");
    const res = { success:[], failed:[] };
    for (const elig of eligible) {
      try {
        await createEnrollmentScholarship({ enrollment:elig.enrollment_id, scholarship_type:parseInt(schTypeId), notes:notes.trim()||null });
        res.success.push(elig.student_name);
      } catch { res.failed.push(elig.student_name); }
    }
    setResults(res);
    setApplying(false);
    if (res.success.length > 0) onSaved();
  };

  return (
    <ModalShell onClose={onClose}>
      <div style={{ background:"white", borderRadius:20, width:560, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(224,49,49,0.18)" }}>
        <div style={{ padding:"22px 28px 18px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(to right,#fdfafa,white)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"#e8f5e0", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <i className="ti ti-award" style={{ fontSize:18, color:"#2e6b0d" }} />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a" }}>Apply Grade-Based Scholarship</div>
              <div style={{ fontSize:11, color:"#8a6a6a", marginTop:1 }}>{eligible.length} eligible student{eligible.length !== 1 ? "s" : ""} with avg ≥ {ELIGIBILITY_THRESHOLD}%</div>
            </div>
          </div>
          <motion.button onClick={onClose} whileHover={{ scale:1.1, color:"#c92a2a" }} whileTap={{ scale:0.9 }} transition={{ duration:0.12 }}
            style={{ background:"none", border:"none", cursor:"pointer", color:"#8a6a6a", fontSize:20, display:"flex", alignItems:"center" }}>
            <i className="ti ti-x" />
          </motion.button>
        </div>

        <div style={{ padding:"22px 28px" }}>
          {results ? (
            <div>
              {results.success.length > 0 && (
                <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                  style={{ background:"#e8f5e0", border:"1px solid #a3d977", borderRadius:10, padding:"14px 16px", marginBottom:12 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#2e6b0d", marginBottom:8 }}>
                    <i className="ti ti-circle-check" style={{ fontSize:15, marginRight:6 }} />
                    {results.success.length} scholarship{results.success.length !== 1 ? "s" : ""} awarded successfully
                  </div>
                  {results.success.map((n, i) => <div key={i} style={{ fontSize:12, color:"#2e6b0d", marginLeft:20 }}>• {n}</div>)}
                </motion.div>
              )}
              {results.failed.length > 0 && (
                <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.06 }}
                  style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#b91c1c", marginBottom:8 }}>
                    <i className="ti ti-alert-circle" style={{ fontSize:15, marginRight:6 }} />
                    {results.failed.length} failed (may already have this scholarship)
                  </div>
                  {results.failed.map((n, i) => <div key={i} style={{ fontSize:12, color:"#b91c1c", marginLeft:20 }}>• {n}</div>)}
                </motion.div>
              )}
              <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
                <motion.button onClick={onClose} whileHover={{ scale:1.02, boxShadow:"0 6px 20px rgba(224,49,49,0.35)" }} whileTap={{ scale:0.97 }} transition={{ duration:0.12 }}
                  style={{ background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:50, padding:"9px 24px", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>
                  Done
                </motion.button>
              </div>
            </div>
          ) : (
            <>
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }} transition={{ duration:0.16 }}
                    style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#b91c1c", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
                    <i className="ti ti-alert-circle" style={{ fontSize:14 }} />{error}
                  </motion.div>
                )}
              </AnimatePresence>
              <div style={{ marginBottom:14 }}>
                <label style={lbl}>Scholarship Type *</label>
                <select value={schTypeId} onChange={(e) => setSchTypeId(e.target.value)} style={{ ...inp, cursor:"pointer" }}>
                  <option value="">— Select scholarship to award —</option>
                  {scholarshipTypes.map((sc) => (
                    <option key={sc.scholarship_type_id} value={sc.scholarship_type_id}>
                      {sc.scholarship_name} ({sc.discount_mode === "percentage" ? `${parseFloat(sc.discount_value)}%` : `₱${parseFloat(sc.discount_value).toLocaleString()}`} off)
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={lbl}>Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inp, resize:"vertical" }} />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ ...lbl, marginBottom:8 }}>Eligible Students ({eligible.length})</label>
                <div style={{ maxHeight:240, overflowY:"auto", border:"1px solid #f5eaea", borderRadius:10, overflow:"hidden" }}>
                  {eligible.map((elig, i) => (
                    <div key={elig.enrollment_id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderBottom:i < eligible.length - 1 ? "1px solid #f9f0f0" : "none", background:"white" }}>
                      <div style={{ width:34, height:34, borderRadius:"50%", background:getPalette(elig.last_name ?? "X").bg, color:getPalette(elig.last_name ?? "X").color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>
                        {elig.initials}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{elig.student_name}</div>
                        <div style={{ fontSize:11, color:"#8a6a6a", marginTop:1 }}>S.Y. {elig.school_year} · {elig.grade_level} · {PERIOD_LABELS[elig.grading_period] ?? elig.grading_period}</div>
                      </div>
                      <span style={{ fontSize:14, fontWeight:700, padding:"3px 12px", borderRadius:99, background:"#e8f5e0", color:"#2e6b0d" }}>{elig.avg.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
                <motion.button onClick={onClose} whileHover={{ borderColor:"#e03131", color:"#c92a2a" }} whileTap={{ scale:0.97 }} transition={{ duration:0.12 }}
                  style={{ background:"transparent", color:"#855c5c", border:"1.5px solid #fde2de", borderRadius:50, padding:"9px 22px", fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>
                  Cancel
                </motion.button>
                <motion.button onClick={handleApply} disabled={applying}
                  whileHover={applying ? {} : { scale:1.02, boxShadow:"0 6px 20px rgba(46,107,13,0.32)" }}
                  whileTap={applying ? {} : { scale:0.97 }}
                  transition={{ duration:0.12 }}
                  style={{ background:applying?"#a3c98a":"linear-gradient(135deg,#2e6b0d,#256009)", color:"white", border:"none", borderRadius:50, padding:"9px 24px", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:applying?"not-allowed":"pointer", display:"inline-flex", alignItems:"center", gap:8, boxShadow:"0 4px 16px rgba(46,107,13,0.26)" }}>
                  {applying ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:"spin 1s linear infinite" }} />Applying…</> : <><i className="ti ti-award" style={{ fontSize:13 }} />Award to All ({eligible.length})</>}
                </motion.button>
              </div>
            </>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 1: MANUAL AWARDS
// ════════════════════════════════════════════════════════════════════════════
function ManualAwardsTab({ scholarshipTypes }) {
  const [awards,      setAwards]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [toRevoke,    setToRevoke]    = useState(null);
  const [search,      setSearch]      = useState("");
  const [inputVal,    setInputVal]    = useState("");
  const [schFilter,   setSchFilter]   = useState("");   // scholarship_type_id string
  const [schoolLevel, setSchoolLevel] = useState("");
  const [gradeLevel,  setGradeLevel]  = useState("");
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  const [rowsAnimated, setRowsAnimated] = useState(false);
  const [page,        setPage]        = useState(1);
  const [pageMeta,    setPageMeta]    = useState({ count: 0, next: null, previous: null });
  const [counts,      setCounts]      = useState({});
  // Separate from `loading` so the chip counts hold their last value while a
  // refetch is in flight, instead of blanking on every keystroke.
  const [countsLoading, setCountsLoading] = useState(true);

  const { schoolYear } = useSchoolYear();

  const hasFilters = search || schFilter || schoolLevel || gradeLevel || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch(""); setInputVal(""); setSchFilter("");
    setSchoolLevel(""); setGradeLevel("");
    setDateFrom(""); setDateTo("");
    setPage(1);
  };

  // Awards are scoped to the sidebar's school year, matching every other list
  // page. Without it the list spans every year at once, which the old 100-row
  // cap silently truncated.
  const buildParams = (p = page, overrides = {}) => {
    const params = { page: p, page_size: PAGE_SIZE, school_year: schoolYear };
    if (search.trim()) params.search           = search.trim();
    if (schFilter)     params.scholarship_type = schFilter;
    if (schoolLevel)   params.school_level     = schoolLevel;
    if (gradeLevel)    params.grade_level      = gradeLevel;
    if (dateFrom)      params.approved_after   = dateFrom;
    if (dateTo)        params.approved_before  = dateTo;
    return { ...params, ...overrides };
  };

  const fetchAwards = useCallback(async () => {
    setLoading(true);
    const listParams = buildParams(page);
    // The summary deliberately keeps every facet except the scholarship type,
    // so each chip's count says how many it *would* show.
    const summaryParams = { ...listParams };
    delete summaryParams.page;
    delete summaryParams.page_size;
    delete summaryParams.scholarship_type;
    try {
      const [data, summary] = await Promise.all([
        getEnrollmentScholarships(listParams),
        getEnrollmentScholarshipSummary(summaryParams),
      ]);
      setAwards(Array.isArray(data) ? data : data?.results ?? []);
      setPageMeta({
        count:    data?.count ?? (Array.isArray(data) ? data.length : 0),
        next:     data?.next ?? null,
        previous: data?.previous ?? null,
      });
      setCounts(summary ?? {});
    } catch (e) { console.error(e); }
    finally { setLoading(false); setCountsLoading(false); setRowsAnimated(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, schFilter, schoolLevel, gradeLevel, dateFrom, dateTo, schoolYear]);

  // One effect drives every fetch: `page` is a dependency alongside the facets,
  // so paging and filtering go through the same path. Facet setters reset the
  // page to 1 themselves (see `applyFilter`) rather than this effect doing it —
  // setting state from an effect would render twice and briefly disagree about
  // which page is loaded.
  useEffect(() => { fetchAwards(); }, [fetchAwards]);

  // Every facet change resets to page 1: staying on page 5 of a narrower result
  // set would show an empty table.
  const applyFilter = (setter) => (v) => { setter(v); setPage(1); };

  const handleRevoke = async () => {
    if (!toRevoke) return;
    await deleteEnrollmentScholarship(toRevoke.enrollment_scholarship_id);
    setToRevoke(null);
    fetchAwards();
  };

  // Options come from the full scholarship-type list rather than what's present
  // in the current page, so a chip never disappears mid-filter — only its count
  // moves. A type with no awards this year still shows, reading 0.
  const schOptions = useMemo(() => {
    const total = Object.entries(counts)
      .filter(([k]) => k !== "total")
      .reduce((s, [, v]) => s + v, 0);
    return [
      { value: "", label: "All", count: countsLoading ? null : (counts.total ?? total) },
      ...scholarshipTypes.map((sc) => ({
        value: String(sc.scholarship_type_id),
        label: sc.scholarship_name,
        count: countsLoading ? null : (counts[String(sc.scholarship_type_id)] ?? 0),
      })),
    ];
  }, [scholarshipTypes, counts, countsLoading]);

  const gradeOptions = GRADE_LEVELS_BY_LEVEL[schoolLevel] ?? [];

  const formatDiscount = (sc) => sc
    ? sc.discount_mode === "percentage"
      ? `${parseFloat(sc.discount_value).toFixed(0)}% off`
      : `₱${parseFloat(sc.discount_value).toLocaleString()} off`
    : "—";

  // Presets for the date drawer. Each sets both bounds at once — the common
  // case is a whole month or year, not a hand-picked pair of dates.
  const iso = (d) => d.toISOString().slice(0, 10);
  const datePresets = [
    {
      label: "This Month",
      fn: () => {
        const n = new Date();
        setDateFrom(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`);
        setDateTo(iso(new Date()));
      },
    },
    {
      label: "Last Month",
      fn: () => {
        const n = new Date();
        const y = n.getMonth() === 0 ? n.getFullYear() - 1 : n.getFullYear();
        const m = n.getMonth() === 0 ? 12 : n.getMonth();
        const last = new Date(n.getFullYear(), n.getMonth(), 0).getDate();
        setDateFrom(`${y}-${String(m).padStart(2, "0")}-01`);
        setDateTo(`${y}-${String(m).padStart(2, "0")}-${last}`);
      },
    },
    {
      label: "This Year",
      fn: () => {
        const n = new Date();
        setDateFrom(`${n.getFullYear()}-01-01`);
        setDateTo(iso(new Date()));
      },
    },
  ];

  const dateFieldLabel = "mb-2 block text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500";
  const dateInput = "h-[34px] min-w-[150px] rounded-lg border-[1.5px] border-neutral-300 bg-white px-2.5 text-[12px] text-neutral-900 outline-none focus:border-brand-500";

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <FilterBar
        searchValue={inputVal}
        onSearchChange={setInputVal}
        onSearch={() => { setSearch(inputVal); setPage(1); }}
        onClearSearch={() => { setInputVal(""); setSearch(""); setPage(1); }}
        searchPlaceholder="Search by student name or scholarship…"
        searchLabel="Search awards"
        searchInputId="scholarships-search"
        hasFilters={Boolean(hasFilters)}
        onClearFilters={clearFilters}
        advancedLabel="Award date"
        advancedIcon="ti-calendar-search"
        advancedActive={Boolean(dateFrom || dateTo)}
        advanced={
          <>
            <div>
              <label htmlFor="award-date-from" className={dateFieldLabel}>Awarded from</label>
              <input id="award-date-from" type="date" value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className={dateInput} />
            </div>
            <div>
              <label htmlFor="award-date-to" className={dateFieldLabel}>Awarded to</label>
              <input id="award-date-to" type="date" value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className={dateInput} />
            </div>
            <div>
              <span className={dateFieldLabel}>Quick</span>
              <div className="flex gap-1.5">
                {datePresets.map((q) => (
                  <button key={q.label} type="button" onClick={q.fn}
                    className="focus-ring h-[34px] rounded-lg border border-neutral-300 bg-white px-2.5 text-[12px] font-semibold text-neutral-700 transition-colors duration-150 hover:border-brand-500 hover:text-brand-600">
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        }
      >
        {schOptions.length > 1 && (
          <FilterRow label="Scholarship">
            <ChipGroup
              options={schOptions}
              value={schFilter}
              onChange={applyFilter((v) => setSchFilter(v === schFilter ? "" : v))}
              label="Filter by scholarship"
            />
          </FilterRow>
        )}

        <FilterRow label="School Level">
          <ChipGroup
            options={[{ value: "", label: "All Levels" }, ...SCHOOL_LEVELS]}
            value={schoolLevel}
            onChange={applyFilter((v) => {
              setSchoolLevel(v);
              // A grade from the previous level can't apply to the new one.
              setGradeLevel("");
            })}
            label="Filter by school level"
          />
        </FilterRow>

        {/* Stays mounted and animates open so picking a level slides the grades
            in rather than shoving the rows below it down. */}
        <CollapsibleFilterRow open={gradeOptions.length > 0} label="Grade Level">
          <ChipGroup
            options={[{ value: "", label: "All Grades" }, ...gradeOptions.map((g) => ({ value: g, label: g }))]}
            value={gradeLevel}
            onChange={applyFilter(setGradeLevel)}
            label="Filter by grade level"
            stagger
            generation={schoolLevel}
          />
        </CollapsibleFilterRow>
      </FilterBar>

      {/* Awards table */}
      <div style={{ background:"white", border:"1px solid #f5eaea", borderRadius:16, overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#fdfafa" }}>
              {["Student / Enrollment","Scholarship","Discount","Awarded On","Notes",""].map((h) => (
                <th key={h} style={{ textAlign:"left", fontSize:10.5, fontWeight:600, color:"#8a6a6a", padding:"13px 18px", borderBottom:"1px solid #f5eaea", textTransform:"uppercase", letterSpacing:"0.07em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length:5 }).map((_, i) => (
                <tr key={i}>
                  {[1,2,3,4,5,6].map((j) => (
                    <td key={j} style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0" }}><Sk w={j===1?140:90} h={13} /></td>
                  ))}
                </tr>
              ))
            ) : awards.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign:"center", padding:"56px 16px" }}>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                    <div style={{ width:52, height:52, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <i className="ti ti-award-off" style={{ fontSize:22, color:"#8a6a6a" }} />
                    </div>
                    {/* With filters on, an empty table means the filters are too
                        narrow — not that nothing has ever been awarded. */}
                    {hasFilters ? (
                      <>
                        <div style={{ fontSize:14, color:"#7a5050", fontWeight:600 }}>No awards match these filters</div>
                        <div style={{ fontSize:12, color:"#8a6a6a" }}>Try widening the search or clearing a filter</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize:14, color:"#7a5050", fontWeight:600 }}>No scholarships awarded for S.Y. {schoolYear}</div>
                        <div style={{ fontSize:12, color:"#8a6a6a" }}>Click "Award Scholarship" to manually assign one</div>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {awards.map((award, idx) => {
                  const sc   = award.scholarship_type_detail;
                  const en   = award.enrollment_detail;
                  const name = en?.student_name ?? `Enrollment #${award.enrollment_id}`;
                  const pal  = getPalette(name);
                  const initials = name.split(" ").map((w) => w[0]).join("").slice(0,2).toUpperCase();
                  const awardedOn = award.approved_at
                    ? new Date(award.approved_at).toLocaleDateString("en-PH", { year:"numeric", month:"short", day:"numeric" })
                    : "—";
                  const isFirst = !rowsAnimated;
                  return (
                    <motion.tr
                      key={award.enrollment_scholarship_id}
                      initial={isFirst ? { opacity:0, x:-6 } : false}
                      animate={{ opacity:1, x:0 }}
                      transition={{ duration:0.18, ease:"easeOut", delay: isFirst ? Math.min(idx * 0.025, 0.3) : 0 }}
                      style={{ borderBottom:"1px solid #f9f0f0", backgroundColor:"white", transition:"background-color 0.12s ease" }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor="#fffbfb"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor="white"}
                    >
                      <td style={{ padding:"13px 18px", verticalAlign:"middle" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:34, height:34, borderRadius:"50%", background:pal.bg, color:pal.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>{initials}</div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{name}</div>
                            <div style={{ fontSize:11, color:"#8a6a6a", marginTop:1 }}>
                              {en ? `S.Y. ${en.school_year} · ${en.grade_level} · ${en.section}` : `Enrollment #${award.enrollment_id}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:"13px 18px", verticalAlign:"middle" }}>
                        {sc ? <div>
                          <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{sc.scholarship_name}</div>
                          <div style={{ fontSize:11, color:"#8a6a6a", fontFamily:"monospace", marginTop:1 }}>{sc.scholarship_code}</div>
                        </div> : <span style={{ color:"#8a6a6a", fontStyle:"italic", fontSize:12 }}>—</span>}
                      </td>
                      <td style={{ padding:"13px 18px", verticalAlign:"middle" }}>
                        <span style={{ fontSize:13, fontWeight:700, color:sc?.discount_mode==="percentage" ? "#1455a0" : "#2e6b0d" }}>
                          {formatDiscount(sc)}
                        </span>
                      </td>
                      <td style={{ padding:"13px 18px", verticalAlign:"middle", fontSize:12, color:"#855c5c" }}>{awardedOn}</td>
                      <td style={{ padding:"13px 18px", verticalAlign:"middle" }}>
                        {award.notes
                          ? <span style={{ fontSize:12, color:"#855c5c" }}>{award.notes}</span>
                          : <span style={{ color:"#8a6a6a", fontStyle:"italic", fontSize:12 }}>—</span>}
                      </td>
                      <td style={{ padding:"13px 14px", verticalAlign:"middle" }}>
                        <motion.button
                          title="Revoke"
                          onClick={() => setToRevoke(award)}
                          whileHover={{ color:"#c92a2a", scale:1.1 }}
                          whileTap={{ scale:0.9 }}
                          transition={{ duration:0.12 }}
                          style={{ background:"none", border:"none", cursor:"pointer", color:"#8a6a6a", display:"flex", alignItems:"center", padding:4, borderRadius:6 }}>
                          <i className="ti ti-award-off" style={{ fontSize:14 }} />
                        </motion.button>
                      </td>
                    </motion.tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>

      {!loading && pageMeta.count > 0 && (
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(pageMeta.count / PAGE_SIZE))}
          count={pageMeta.count}
          hasPrevious={Boolean(pageMeta.previous)}
          hasNext={Boolean(pageMeta.next)}
          onPageChange={setPage}
        />
      )}

      <AnimatePresence>
        {toRevoke && (
          <RevokeModal award={toRevoke} onConfirm={handleRevoke} onCancel={() => setToRevoke(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 2: GRADE-BASED ELIGIBILITY
// ════════════════════════════════════════════════════════════════════════════
function EligibilityTab({ scholarshipTypes }) {
  const [eligible,      setEligible]      = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [rowsAnimated, setRowsAnimated] = useState(false);
  const [schoolYear,    setSchoolYear]    = useState("");
  const [gradingPeriod, setGradingPeriod] = useState("1st_quarter");
  const [scanned,       setScanned]       = useState(false);
  const [applyModal,    setApplyModal]    = useState(false);
  const [, setSavedCount] = useState(0);

  const { schoolYear: globalSchoolYear, options: syOptions } = useSchoolYear();

  // Follow the global school year selector while this tab stays mounted.
  useEffect(() => { setSchoolYear(globalSchoolYear); }, [globalSchoolYear]);

  const handleScan = async () => {
    if (!schoolYear) return;
    setLoading(true); setScanned(false); setEligible([]);
    try {
      const enrData = await getEnrollments({ school_year:schoolYear, enrollment_status:"enrolled", page_size:200 });
      const enrs = Array.isArray(enrData) ? enrData : enrData?.results ?? [];
      const results = await Promise.all(
        enrs.map(async (en) => {
          try {
            const gradeData = await getGrades({ enrollment:en.enrollment_id, grading_period:gradingPeriod, page_size:100 });
            const grades = Array.isArray(gradeData) ? gradeData : gradeData?.results ?? [];
            if (grades.length === 0) return null;
            const avg = grades.reduce((s, g) => s + parseFloat(g.numeric_grade), 0) / grades.length;
            if (avg < ELIGIBILITY_THRESHOLD) return null;
            const studentName = en.student_name ?? `Student #${en.student}`;
            const lastName = studentName.split(" ").pop() ?? "X";
            return {
              enrollment_id:  en.enrollment_id,
              student_name:   studentName,
              last_name:      lastName,
              initials:       studentName.split(" ").map((w) => w[0]).join("").slice(0,2).toUpperCase(),
              school_year:    en.school_year,
              grade_level:    en.grade_level,
              section:        en.section,
              grading_period: gradingPeriod,
              avg:            avg,
              grades_count:   grades.length,
            };
          } catch { return null; }
        })
      );
      const eligibleList = results.filter(Boolean);
      eligibleList.sort((a, b) => b.avg - a.avg);
      setEligible(eligibleList);
      setScanned(true);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRowsAnimated(true); }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Info banner */}
      <div style={{ background:"linear-gradient(to right,#e8f5e0,#f0faea)", border:"1px solid #a3d977", borderRadius:14, padding:"16px 20px", display:"flex", alignItems:"flex-start", gap:14 }}>
        <div style={{ width:40, height:40, borderRadius:10, background:"#2e6b0d22", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <i className="ti ti-info-circle" style={{ fontSize:20, color:"#2e6b0d" }} />
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:"#2e6b0d" }}>Grade-Based Eligibility</div>
          <div style={{ fontSize:13, color:"#3a6020", marginTop:4, lineHeight:1.6 }}>
            Scans all enrolled students for the selected school year and grading period.
            Students with a general average of <strong>≥ {ELIGIBILITY_THRESHOLD}%</strong> are considered eligible.
          </div>
        </div>
      </div>

      {/* Scan params card */}
      <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"20px 22px", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#1a0a0a", marginBottom:14 }}>Scan Parameters</div>

        <FilterRow label="School Year">
          <ChipGroup
            options={syOptions.map((sy) => ({ value: sy, label: sy, icon: "ti-calendar" }))}
            value={schoolYear}
            onChange={setSchoolYear}
            label="School year to scan"
          />
        </FilterRow>

        <div className="mt-3 mb-4">
          <FilterRow label="Grading Period">
            <ChipGroup
              options={PERIOD_OPTIONS}
              value={gradingPeriod}
              onChange={setGradingPeriod}
              label="Grading period to scan"
            />
          </FilterRow>
        </div>

        <motion.button onClick={handleScan} disabled={loading}
          whileHover={loading ? {} : { scale:1.02, boxShadow:"0 6px 20px rgba(224,49,49,0.35)" }}
          whileTap={loading ? {} : { scale:0.97 }}
          transition={{ duration:0.12 }}
          style={{ height:42, padding:"0 28px", background:loading?"#e87474":"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, fontSize:13, fontWeight:700, cursor:loading?"not-allowed":"pointer", fontFamily:"'DM Sans',sans-serif", display:"inline-flex", alignItems:"center", gap:8, boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}>
          {loading ? <><i className="ti ti-loader-2" style={{ fontSize:14, animation:"spin 1s linear infinite" }} />Scanning…</> : <><i className="ti ti-scan" style={{ fontSize:14 }} />Scan Now</>}
        </motion.button>
      </div>

      {/* Results */}
      <AnimatePresence>
        {scanned && (
          <motion.div
            key="eligibility-results"
            initial={{ opacity:0, y:12 }}
            animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, y:12 }}
            transition={{ duration:0.24, ease:"easeOut" }}
            style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}
          >
            <div style={{ padding:"16px 22px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(to right,#fdfafa,white)" }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a" }}>
                  {eligible.length > 0
                    ? <><span style={{ color:"#2e6b0d" }}>{eligible.length}</span> student{eligible.length !== 1 ? "s" : ""} eligible</>
                    : "No eligible students found"
                  }
                </div>
                <div style={{ fontSize:11, color:"#8a6a6a", marginTop:2 }}>
                  S.Y. {schoolYear} · {PERIOD_LABELS[gradingPeriod]} · avg ≥ {ELIGIBILITY_THRESHOLD}%
                </div>
              </div>
              {eligible.length > 0 && (
                <motion.button onClick={() => setApplyModal(true)}
                  whileHover={{ scale:1.02, boxShadow:"0 6px 20px rgba(46,107,13,0.32)" }}
                  whileTap={{ scale:0.97 }}
                  transition={{ duration:0.12 }}
                  style={{ display:"inline-flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#2e6b0d,#256009)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(46,107,13,0.26)" }}>
                  <i className="ti ti-award" style={{ fontSize:14 }} />Award Scholarship to All
                </motion.button>
              )}
            </div>

            {eligible.length === 0 ? (
              <div style={{ padding:"48px 24px", textAlign:"center" }}>
                <div style={{ width:52, height:52, borderRadius:14, background:"#faeeda", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}>
                  <i className="ti ti-mood-empty" style={{ fontSize:22, color:"#854f0b" }} />
                </div>
                <div style={{ fontSize:14, color:"#7a5050", fontWeight:600 }}>No eligible students</div>
                <div style={{ fontSize:12, color:"#8a6a6a", marginTop:6 }}>
                  No students have a general average ≥ {ELIGIBILITY_THRESHOLD}% for {PERIOD_LABELS[gradingPeriod]} in S.Y. {schoolYear}.
                </div>
              </div>
            ) : (
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:"#fdfafa" }}>
                    {["Student","School Year","Grade / Section","Subjects Graded","General Average",""].map((h) => (
                      <th key={h} style={{ textAlign:"left", fontSize:10.5, fontWeight:600, color:"#8a6a6a", padding:"12px 18px", borderBottom:"1px solid #f5eaea", textTransform:"uppercase", letterSpacing:"0.07em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <>
                    {eligible.map((elig, idx) => {
                      const isFirst = !rowsAnimated;
                      return (
                      <motion.tr
                        key={elig.enrollment_id}
                        initial={isFirst ? { opacity:0, x:-6 } : false}
                        animate={{ opacity:1, x:0 }}
                        transition={{ duration:0.18, ease:"easeOut", delay: isFirst ? Math.min(idx * 0.025, 0.3) : 0 }}
                        style={{ borderBottom:"1px solid #f9f0f0", backgroundColor:"white", transition:"background-color 0.12s ease" }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor="#fffbfb"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor="white"}
                      >
                        <td style={{ padding:"12px 18px", verticalAlign:"middle" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <div style={{ width:34, height:34, borderRadius:"50%", background:getPalette(elig.last_name).bg, color:getPalette(elig.last_name).color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>{elig.initials}</div>
                            <span style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{elig.student_name}</span>
                          </div>
                        </td>
                        <td style={{ padding:"12px 18px", verticalAlign:"middle", fontSize:13, color:"#5a4a4a" }}>{elig.school_year}</td>
                        <td style={{ padding:"12px 18px", verticalAlign:"middle", fontSize:13, color:"#5a4a4a" }}>{elig.grade_level} · {elig.section}</td>
                        <td style={{ padding:"12px 18px", verticalAlign:"middle" }}>
                          <span style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{elig.grades_count}</span>
                          <span style={{ fontSize:11, color:"#8a6a6a", marginLeft:4 }}>subject{elig.grades_count !== 1 ? "s" : ""}</span>
                        </td>
                        <td style={{ padding:"12px 18px", verticalAlign:"middle" }}>
                          <span style={{ fontSize:15, fontWeight:700, padding:"3px 12px", borderRadius:99, background:"#e8f5e0", color:"#2e6b0d" }}>
                            {elig.avg.toFixed(2)}
                          </span>
                        </td>
                        <td style={{ padding:"12px 18px", verticalAlign:"middle" }}>
                          <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:99, background:"#e8f5e0", color:"#2e6b0d", display:"inline-flex", alignItems:"center", gap:4 }}>
                            <i className="ti ti-check" style={{ fontSize:11 }} />Eligible
                          </span>
                        </td>
                      </motion.tr>
                    ); })}
                  </>
                </tbody>
              </table>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {applyModal && (
          <ApplyEligibilityModal
            eligible={eligible}
            scholarshipTypes={scholarshipTypes}
            onClose={() => setApplyModal(false)}
            onSaved={() => setSavedCount((c) => c + 1)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function ScholarshipsPage() {
  usePageTitle("Scholarships");
  const navigate = useNavigate();

  const [activeTab,        setActiveTab]        = useState("manual");
  const [scholarshipTypes, setScholarshipTypes] = useState([]);
  const [awardModal,       setAwardModal]       = useState(false);
  const [refreshKey,       setRefreshKey]       = useState(0);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    getScholarshipTypes()
      .then((d) => setScholarshipTypes(Array.isArray(d) ? d : d?.results ?? []))
      .catch(() => {});
  }, []);

  const TABS = [
    { id:"manual",      label:"Manual Awards",           icon:"ti-award"     },
    { id:"eligibility", label:"Grade-Based Eligibility", icon:"ti-chart-bar" },
  ];


  return (
    <>
      <PageHeader
        title="Scholarships"
        icon="ti-discount"
        subtitle="Manage scholarship awards and check grade-based eligibility"
        actions={
          <>
            <Tabs variant="pill" tabs={TABS} value={activeTab} onChange={setActiveTab} />
            <Button variant="secondary" icon="ti-settings" onClick={() => navigate("/scholarship-types")}>
              Manage Types
            </Button>
            <Button icon="ti-award" onClick={() => setAwardModal(true)}>
              Award Scholarship
            </Button>
          </>
        }
      />

      {/* Content */}
      <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 }}>

        {/* Tab content with AnimatePresence */}
        <AnimatePresence mode="wait">
          {activeTab === "manual" && (
            <motion.div
              key="manual"
              initial={{ opacity:0, y:8 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:-8 }}
              transition={{ duration:0.18, ease:"easeOut" }}
            >
              <ManualAwardsTab key={refreshKey} scholarshipTypes={scholarshipTypes} onAward={() => setAwardModal(true)} />
            </motion.div>
          )}
          {activeTab === "eligibility" && (
            <motion.div
              key="eligibility"
              initial={{ opacity:0, y:8 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:-8 }}
              transition={{ duration:0.18, ease:"easeOut" }}
            >
              <EligibilityTab scholarshipTypes={scholarshipTypes} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {awardModal && (
          <AwardModal
            scholarshipTypes={scholarshipTypes}
            onClose={() => setAwardModal(false)}
            onSaved={() => setRefreshKey((k) => k + 1)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
