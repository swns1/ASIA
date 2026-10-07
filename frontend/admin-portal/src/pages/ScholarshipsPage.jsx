import { usePageTitle } from "../hooks/usePageTitle";
import useYearFilter from "../hooks/useYearFilter";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Tabs from "../components/ui/Tabs";
import Pagination from "../components/Pagination";
import StatusBand from "../components/ui/StatusBand";
import FilterMenu from "../components/ui/FilterMenu";
import RangeMenu from "../components/ui/RangeMenu";
import SearchField from "../components/ui/SearchField";
import SchoolYearMenu from "../components/ui/SchoolYearMenu";
import Card from "../components/ui/Card";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Modal from "../components/ui/Modal";
import Alert from "../components/ui/Alert";
import { Field, Select, Textarea } from "../components/FormField";
import ConfirmModal from "../components/ConfirmModal";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
import { fmtDate } from "../utils/format";
import { dateRangeLabel, datePresets } from "../utils/ranges";
import { groupYears } from "../utils/schoolYear";
import { seriesDot } from "../constants/statusTones";
import { GRADE_LEVELS_BY_LEVEL, LEVEL_FILTER_OPTIONS } from "../constants/schoolLevels";
import fetchAllPages from "../utils/fetchAllPages";

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
import useArchivedYears from "../hooks/useArchivedYears";
import ArchivedYearNotice from "../components/schoolYears/ArchivedYearNotice";

const getEnrollmentScholarships   = (p = {}) => _getEnrollmentScholarships(p);
// Every type, retired ones too: the page names and counts awards made with
// them. Only active types are offered when awarding.
const getScholarshipTypes         = ()       => _getScholarshipTypes({ page_size: 100 });
const getEnrollments              = (p = {}) => _getEnrollments(p);
const getGrades                   = (p = {}) => _getGrades(p);
const createEnrollmentScholarship = (p)      => _createEnrollmentScholarship(p);
const deleteEnrollmentScholarship = (id)     => _deleteEnrollmentScholarship(id);

// ── Constants ─────────────────────────────────────────────────────────────────
const ELIGIBILITY_THRESHOLD = 95;
const PAGE_SIZE = 20;

// Long enough that a word is finished, short enough that the list keeps up.
// The same wait as the other list pages.
const SEARCH_DEBOUNCE_MS = 300;

const AWARD_COLUMNS = [
  { key: "student",     label: "Student",     width: "28%" },
  { key: "scholarship", label: "Scholarship", width: "26%" },
  { key: "discount",    label: "Discount",    width: "11%" },
  { key: "awarded_on",  label: "Awarded on",  width: "12%" },
  { key: "notes",       label: "Notes",       width: "17%" },
  { key: "actions",     label: "",            width: "6%"  },
];

const ELIGIBLE_COLUMNS = [
  { key: "student",  label: "Student",          width: "44%" },
  { key: "grade",    label: "Grade / section",  width: "22%" },
  { key: "subjects", label: "Subjects graded",  width: "18%" },
  { key: "average",  label: "General average",  width: "16%", align: "right" },
];

const PERIOD_OPTIONS = [
  { value:"1st_quarter",  label:"1st Quarter"  },
  { value:"2nd_quarter",  label:"2nd Quarter"  },
  { value:"3rd_quarter",  label:"3rd Quarter"  },
  { value:"4th_quarter",  label:"4th Quarter"  },
  { value:"1st_semester", label:"1st Semester" },
  { value:"2nd_semester", label:"2nd Semester" },
];
const PERIOD_LABELS = Object.fromEntries(PERIOD_OPTIONS.map((p) => [p.value, p.label]));


// ── Award Modal ───────────────────────────────────────────────────────────────
function AwardModal({ scholarshipTypes, schoolYear, onClose, onSaved }) {
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

  // Searches the year the awards list is showing (the current year when it
  // shows all years), so a new award lands where the user is looking.
  useEffect(() => {
    if (!search.trim()) { setStudents([]); return; }
    setLoadingSt(true);
    const t = setTimeout(async () => {
      try {
        const data = await getEnrollments({ search, enrollment_status:"enrolled", school_year:schoolYear, page_size:100 });
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
  }, [search, schoolYear]);

  useEffect(() => {
    if (!student) { setEnrollments([]); setEnrollment(null); return; }
    if (student._enrollment) { setEnrollments([student._enrollment]); setEnrollment(student._enrollment); return; }
    getEnrollments({ student:student.student_id, enrollment_status:"enrolled", school_year:schoolYear, page_size:20 })
      .then((d) => setEnrollments(Array.isArray(d) ? d : d?.results ?? []))
      .catch(() => setEnrollments([]));
  }, [student, schoolYear]);

  const handleSave = async () => {
    if (!enrollment) { setError("Please select an enrollment."); return; }
    if (!schTypeId)  { setError("Please select a scholarship type."); return; }
    setSaving(true); setError("");
    try {
      const award = await createEnrollmentScholarship({ enrollment:enrollment.enrollment_id, scholarship_type:parseInt(schTypeId), notes:notes.trim()||null });
      // An invoice is priced from the scholarships on file when it is built,
      // so one already issued stays as it was until it is re-issued.
      if (award?.invoice_to_reissue) {
        toast.success(`Scholarship awarded. Re-issue invoice ${award.invoice_to_reissue} in Invoices to apply it.`, { duration: 8000 });
      } else {
        toast.success("Scholarship awarded.");
      }
      onSaved(); onClose();
    } catch (e) {
      const msg = e.message || "Failed to award scholarship.";
      setError(msg);
      toast.error(msg);
    }
    finally { setSaving(false); }
  };

  return (
    <Modal
      onClose={onClose}
      size="md"
      showClose
      loading={saving}
      icon="ti-award"
      title="Award Scholarship"
      description="Manually assign a scholarship to an enrollment"
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button icon="ti-award" loading={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Award Scholarship"}
          </Button>
        </div>
      }
    >
        <div>
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }} transition={{ duration:0.16 }}
                style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#b91c1c", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
                <i className="ti ti-alert-circle" style={{ fontSize:14 }} />{error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* A search-driven autocomplete rather than a plain control, so the
              body stays bespoke — but the label still goes through Field so it
              matches the others and gets a real htmlFor/aria wiring. */}
          <Field label="Student" required htmlFor="award-student-search">
            {student ? (
              <motion.div initial={{ opacity:0, scale:0.97 }} animate={{ opacity:1, scale:1 }}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", border:"1.5px solid #fde2de", borderRadius:10, background:"#fff8f6" }}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:getAvatarPalette(student.last_name).bg, color:getAvatarPalette(student.last_name).color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:13, flexShrink:0 }}>
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
                  <input id="award-student-search" placeholder="Search student by name or LRN…" value={search}
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
                          className="flex cursor-pointer items-center gap-2.5 border-b border-neutral-200/70 px-3.5 py-2.5 transition-colors hover:bg-brand-50">
                          <div style={{ width:30, height:30, borderRadius:"50%", background:getAvatarPalette(st.last_name).bg, color:getAvatarPalette(st.last_name).color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>
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
          </Field>

          {student && (
            <Field label="Enrollment" required>
              {enrollments.length === 0 ? (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-sm italic text-neutral-500">
                  No active enrollments found for this student.
                </div>
              ) : (
                <Select
                  value={enrollment?.enrollment_id ?? ""}
                  onChange={(e) => setEnrollment(enrollments.find((en) => en.enrollment_id === parseInt(e.target.value)) ?? null)}
                >
                  <option value="">— Select enrollment —</option>
                  {enrollments.map((en) => (
                    <option key={en.enrollment_id} value={en.enrollment_id}>
                      S.Y. {en.school_year} · {en.grade_level} · {en.section}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          <Field label="Scholarship Type" required>
            <Select value={schTypeId} onChange={(e) => setSchTypeId(e.target.value)}>
              <option value="">— Select scholarship —</option>
              {scholarshipTypes.map((sc) => (
                <option key={sc.scholarship_type_id} value={sc.scholarship_type_id}>
                  {sc.scholarship_name} ({sc.discount_mode === "percentage" ? `${parseFloat(sc.discount_value)}%` : `₱${parseFloat(sc.discount_value).toLocaleString()}`} off)
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional remarks…" rows={2} />
          </Field>
        </div>
    </Modal>
  );
}

// ── Revoke Modal ──────────────────────────────────────────────────────────────
// ── Apply Eligibility Modal ───────────────────────────────────────────────────
function ApplyEligibilityModal({ eligible, scholarshipTypes, onClose, onSaved }) {
  const [schTypeId, setSchTypeId] = useState("");
  const [notes,     setNotes]     = useState(`Awarded based on general average ≥ ${ELIGIBILITY_THRESHOLD}%`);
  const [applying,  setApplying]  = useState(false);
  const [results,   setResults]   = useState(null);
  const [error,     setError]     = useState("");

  const handleApply = async () => {
    if (!schTypeId) { setError("Please select a scholarship type."); return; }
    if (eligible.length === 0) { setError("No students to award."); return; }
    setApplying(true); setError("");
    const res = { success:[], failed:[], reissue:[] };
    for (const elig of eligible) {
      try {
        const award = await createEnrollmentScholarship({ enrollment:elig.enrollment_id, scholarship_type:parseInt(schTypeId), notes:notes.trim()||null });
        res.success.push(elig.student_name);
        if (award?.invoice_to_reissue) res.reissue.push(`${elig.student_name} — ${award.invoice_to_reissue}`);
      } catch (e) { res.failed.push(e?.message ? `${elig.student_name} — ${e.message}` : elig.student_name); }
    }
    setResults(res);
    setApplying(false);
    if (res.success.length > 0) onSaved();
  };

  return (
    <Modal
      onClose={onClose}
      size="md"
      showClose
      loading={applying}
      icon="ti-award"
      iconTone="brand"
      title="Apply Grade-Based Scholarship"
      description={`${eligible.length} eligible student${eligible.length !== 1 ? "s" : ""} with avg ≥ ${ELIGIBILITY_THRESHOLD}%`}
      closeOnBackdrop={false}
      footer={
        results ? (
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={applying}>
              Cancel
            </Button>
            <Button icon="ti-award" loading={applying} onClick={handleApply}>
              {applying ? "Applying…" : `Award to All (${eligible.length})`}
            </Button>
          </div>
        )
      }
    >
        <div>
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
                    {results.failed.length} not awarded
                  </div>
                  {results.failed.map((n, i) => <div key={i} style={{ fontSize:12, color:"#b91c1c", marginLeft:20 }}>• {n}</div>)}
                </motion.div>
              )}
              {results.reissue?.length > 0 && (
                <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.12 }}
                  style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:"14px 16px", marginTop:12 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#7a4a08", marginBottom:8 }}>
                    <i className="ti ti-file-invoice" style={{ fontSize:15, marginRight:6 }} />
                    Already invoiced — re-issue these in Invoices to apply the scholarship
                  </div>
                  {results.reissue.map((n, i) => <div key={i} style={{ fontSize:12, color:"#7a4a08", marginLeft:20 }}>• {n}</div>)}
                </motion.div>
              )}
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
              <Field label="Scholarship Type" required>
                <Select value={schTypeId} onChange={(e) => setSchTypeId(e.target.value)}>
                  <option value="">— Select scholarship to award —</option>
                  {scholarshipTypes.map((sc) => (
                    <option key={sc.scholarship_type_id} value={sc.scholarship_type_id}>
                      {sc.scholarship_name} ({sc.discount_mode === "percentage" ? `${parseFloat(sc.discount_value)}%` : `₱${parseFloat(sc.discount_value).toLocaleString()}`} off)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </Field>
              <div style={{ marginBottom:14 }}>
                {/* Not a Field: this is a read-only roster, not a labelled
                    form control, so there's no input for a label to point at. */}
                <div className="mb-2 block text-xs font-bold uppercase tracking-[0.07em] text-neutral-700">
                  Eligible Students ({eligible.length})
                </div>
                <div style={{ maxHeight:240, overflowY:"auto", border:"1px solid #f5eaea", borderRadius:10, overflow:"hidden" }}>
                  {eligible.map((elig, i) => (
                    <div key={elig.enrollment_id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderBottom:i < eligible.length - 1 ? "1px solid #f9f0f0" : "none", background:"white" }}>
                      <div style={{ width:34, height:34, borderRadius:"50%", background:getAvatarPalette(elig.last_name ?? "X").bg, color:getAvatarPalette(elig.last_name ?? "X").color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>
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
            </>
          )}
        </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 1: MANUAL AWARDS
// ════════════════════════════════════════════════════════════════════════════
// The year comes from the page (see ScholarshipsPage) rather than living here.
// `scholarshipTypes` is every type, inactive ones included: awards made with a
// type that has since been retired still count, and still need a name.
function ManualAwardsTab({ scholarshipTypes, schoolYear, onSchoolYearChange, yearIsDefault }) {
  const isArchived = useArchivedYears();
  const [awards,      setAwards]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  // A failed load used to read as "No scholarships awarded".
  const [loadError,   setLoadError]   = useState(null);
  const [toRevoke,    setToRevoke]    = useState(null);
  const [search,      setSearch]      = useState("");
  const [inputVal,    setInputVal]    = useState("");
  const [schFilter,   setSchFilter]   = useState("");   // scholarship_type_id string
  const [schoolLevel, setSchoolLevel] = useState("");
  const [gradeLevel,  setGradeLevel]  = useState("");
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  const [page,        setPage]        = useState(1);
  const [pageMeta,    setPageMeta]    = useState({ count: 0, next: null, previous: null });
  const searchRef = useRef(null);

  // The current year is where the page opens, so it isn't a filter to clear.
  const hasFilters = !yearIsDefault || search || schFilter || schoolLevel || gradeLevel || dateFrom || dateTo;

  const clearFilters = () => {
    onSchoolYearChange(null); // back to the current school year
    setSearch(""); setInputVal(""); setSchFilter("");
    setSchoolLevel(""); setGradeLevel("");
    setDateFrom(""); setDateTo("");
    setPage(1);
    searchRef.current?.focus();
  };

  // What the band counts: the year, level, grade and award dates. The search
  // and the scholarship picked in the legend narrow only the rows, as on the
  // other list pages.
  const scope = {
    ...(schoolYear  && { school_year: schoolYear }),
    ...(schoolLevel && { school_level: schoolLevel }),
    ...(gradeLevel  && { grade_level: gradeLevel }),
    ...(dateFrom    && { approved_after: dateFrom }),
    ...(dateTo      && { approved_before: dateTo }),
  };
  const scopeKey = JSON.stringify(scope);

  // Awards open on the current school year, matching every other list page.
  // Unscoped, the list spans every year at once, which the old 100-row cap
  // silently truncated; "All years" is still there as a deliberate choice.
  const fetchAwards = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = { ...JSON.parse(scopeKey), page, page_size: PAGE_SIZE };
      if (search.trim()) params.search           = search.trim();
      if (schFilter)     params.scholarship_type = schFilter;
      const data = await getEnrollmentScholarships(params);
      setAwards(Array.isArray(data) ? data : data?.results ?? []);
      setPageMeta({
        count:    data?.count ?? (Array.isArray(data) ? data.length : 0),
        next:     data?.next ?? null,
        previous: data?.previous ?? null,
      });
    } catch (e) {
      console.error(e);
      setLoadError(e);
      setAwards([]);
      setPageMeta({ count: 0, next: null, previous: null });
    } finally {
      setLoading(false);
    }
  }, [scopeKey, page, search, schFilter]);

  // One effect drives every fetch: `page` is a dependency alongside the facets,
  // so paging and filtering go through the same path. Facet setters reset the
  // page to 1 themselves (see `applyFilter`) rather than this effect doing it —
  // setting state from an effect would render twice and briefly disagree about
  // which page is loaded.
  useEffect(() => { fetchAwards(); }, [fetchAwards]); // eslint-disable-line react-hooks/set-state-in-effect

  // The band's numbers, per scholarship type. Kept with the scope they were
  // counted for, so another scope's numbers never show while the next load.
  const [summary, setSummary] = useState({ key: null, data: null });
  const [countsReload, setCountsReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getEnrollmentScholarshipSummary(JSON.parse(scopeKey))
      .then((d) => { if (!cancelled) setSummary({ key: scopeKey, data: d ?? {} }); })
      // Non-critical: the band reads "—" and the list still works.
      .catch(() => { if (!cancelled) setSummary({ key: scopeKey, data: null }); });
    return () => { cancelled = true; };
  }, [scopeKey, countsReload]);
  const counts = summary.key === scopeKey ? summary.data : null;

  // Search as you type: the box applies itself once typing pauses.
  useEffect(() => {
    if (inputVal === search) return;
    const timer = setTimeout(() => { setSearch(inputVal); setPage(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputVal, search]);

  // Every facet change resets to page 1: staying on page 5 of a narrower result
  // set would show an empty table.
  const applyFilter = (setter) => (v) => { setter(v); setPage(1); };

  const handleRevoke = async () => {
    if (!toRevoke) return;
    const result = await deleteEnrollmentScholarship(toRevoke.enrollment_scholarship_id);
    if (result?.invoice_to_reissue) {
      toast(`Scholarship revoked. Re-issue invoice ${result.invoice_to_reissue} in Invoices to remove it from the bill.`, { duration: 8000 });
    }
    setToRevoke(null);
    fetchAwards();
    setCountsReload((k) => k + 1);
  };

  // A type keeps its colour whatever the filters do: it's handed out by the
  // type's place among all types, never by how many awards it has. A retired
  // type shows only while it has awards in view.
  const typeDot = useMemo(
    () => Object.fromEntries(scholarshipTypes.map((sc, i) => [String(sc.scholarship_type_id), seriesDot(i)])),
    [scholarshipTypes],
  );
  const legendTypes = scholarshipTypes.filter(
    (sc) => sc.is_active || counts?.[String(sc.scholarship_type_id)] > 0 || schFilter === String(sc.scholarship_type_id),
  );

  const formatDiscount = (sc) => sc
    ? sc.discount_mode === "percentage"
      ? `${parseFloat(sc.discount_value).toFixed(0)}% off`
      : `₱${parseFloat(sc.discount_value).toLocaleString()} off`
    : "—";

  const levelLabel = LEVEL_FILTER_OPTIONS.find((l) => l.value === schoolLevel)?.label;
  const bandCaption = [
    `award${counts?.total === 1 ? "" : "s"} in ${schoolYear ? `S.Y. ${schoolYear}` : "all school years"}`,
    schoolLevel && levelLabel,
    gradeLevel,
    (dateFrom || dateTo) && `awarded ${dateRangeLabel(dateFrom, dateTo).replace(/^(From|Until)/, (w) => w.toLowerCase())}`,
  ].filter(Boolean).join(" · ");
  const gradeMenuOptions = [
    { value: "", label: "All grades" },
    ...(GRADE_LEVELS_BY_LEVEL[schoolLevel] ?? []).map((g) => ({ value: g, label: g })),
  ];
  const picked = scholarshipTypes.find((sc) => String(sc.scholarship_type_id) === schFilter);

  return (
    <div className="space-y-4">
      {/* ── How the year's awards split by scholarship, and the filter ──
          The school year sits in the band because its numbers are counted
          for it. */}
      <StatusBand
        total={counts?.total}
        caption={bandCaption}
        aside={<SchoolYearMenu value={schoolYear} onChange={applyFilter(onSchoolYearChange)} />}
        options={[
          { value: "", label: "All", count: counts?.total },
          ...legendTypes.map((sc) => ({
            value: String(sc.scholarship_type_id),
            label: sc.scholarship_name,
            count: counts ? (counts[String(sc.scholarship_type_id)] ?? 0) : undefined,
            dot: typeDot[String(sc.scholarship_type_id)],
          })),
        ]}
        value={schFilter}
        allValue=""
        onChange={applyFilter(setSchFilter)}
        label="Filter by scholarship"
      />

      {/* ── Toolbar: search, the filter menus, Clear ──
          The menus open to the right edge, where the pills sit. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchField
          id="scholarships-search"
          label="Search awards by student name"
          placeholder="Search by student name or scholarship…"
          inputRef={searchRef}
          value={inputVal}
          onChange={setInputVal}
          onEnter={() => { setSearch(inputVal); setPage(1); }}
          onClear={() => { setInputVal(""); setSearch(""); setPage(1); }}
        />

        <FilterMenu
          label="Level"
          valueLabel={levelLabel ?? "All levels"}
          active={Boolean(schoolLevel)}
          options={LEVEL_FILTER_OPTIONS}
          value={schoolLevel}
          // A grade from the previous level can't apply to the new one.
          onChange={applyFilter((v) => { setSchoolLevel(v); setGradeLevel(""); })}
          align="end"
          menuWidth={220}
        />

        {/* A grade only narrows within a level. */}
        {schoolLevel && (
          <FilterMenu
            label="Grade"
            valueLabel={gradeLevel || "All grades"}
            active={Boolean(gradeLevel)}
            options={gradeMenuOptions}
            value={gradeLevel}
            onChange={applyFilter(setGradeLevel)}
            align="end"
            menuWidth={180}
          />
        )}

        <RangeMenu
          label="Awarded"
          valueLabel={dateRangeLabel(dateFrom, dateTo)}
          active={Boolean(dateFrom || dateTo)}
          fields={[
            { key: "from", label: "From", type: "date", value: dateFrom },
            { key: "to",   label: "To",   type: "date", value: dateTo },
          ]}
          presets={datePresets().filter((p) => p.label !== "Today")}
          onApply={({ from, to }) => { setDateFrom(from); setDateTo(to); setPage(1); }}
        />

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="focus-ring flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-error-600 transition-colors duration-150 hover:bg-brand-100"
          >
            <i className="ti ti-filter-off text-[14px]" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>

      <ArchivedYearNotice schoolYear={schoolYear} records="scholarship awards" />

      {/* ── Awards table ── */}
      <Card padding="none" className="overflow-hidden">
        <div className="flex items-baseline gap-2.5 border-b border-neutral-200 px-5 py-4">
          <h2 className="text-md font-bold text-neutral-900">{picked?.scholarship_name ?? "All awards"}</h2>
          {!loading && !loadError && (
            <span className="text-sm text-neutral-500 tabular-nums">{pageMeta.count.toLocaleString()}</span>
          )}
        </div>
        <Table
          headerVariant="quiet"
          columns={AWARD_COLUMNS}
          loading={loading}
          error={loadError}
          onRetry={fetchAwards}
          errorSubject="scholarship awards"
          isEmpty={awards.length === 0}
          skeletonRows={5}
          empty={{
            icon: "ti-award-off",
            // With filters on, an empty table means the filters are too
            // narrow — not that nothing has ever been awarded.
            title: hasFilters
              ? "No awards match these filters"
              : `No scholarships awarded for S.Y. ${schoolYear}`,
            subtitle: hasFilters
              ? "Try widening the search or clearing a filter"
              : 'Click "Award Scholarship" to manually assign one',
          }}
        >
          {awards.map((award) => {
            const sc   = award.scholarship_type_detail;
            const en   = award.enrollment_detail;
            const name = en?.student_name ?? `Enrollment #${award.enrollment_id}`;
            const pal  = getAvatarPalette(name);
            return (
              <TableRow key={award.enrollment_scholarship_id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                      style={{ background: pal.bg, color: pal.color }}
                      aria-hidden="true"
                    >
                      {initialsFrom(name)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-neutral-900">{name}</div>
                      <div className="truncate text-[11.5px] text-neutral-500">
                        {en ? `S.Y. ${en.school_year} · ${en.grade_level} · ${en.section}` : `Enrollment #${award.enrollment_id}`}
                      </div>
                    </div>
                  </div>
                </TableCell>

                {/* The same dot as the band's legend. */}
                <TableCell>
                  {sc ? (
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-neutral-900">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${typeDot[String(sc.scholarship_type_id)] ?? "bg-neutral-400"}`}
                          aria-hidden="true"
                        />
                        <span className="truncate">{sc.scholarship_name}</span>
                      </div>
                      <div className="pl-4 font-mono text-[11px] text-neutral-500">{sc.scholarship_code}</div>
                    </div>
                  ) : (
                    <span className="text-sm italic text-neutral-500">—</span>
                  )}
                </TableCell>

                <TableCell>
                  <span className="text-[13px] font-bold text-neutral-900 tabular-nums">{formatDiscount(sc)}</span>
                </TableCell>

                <TableCell>
                  <span className="whitespace-nowrap text-sm text-neutral-800">{fmtDate(award.approved_at)}</span>
                </TableCell>

                <TableCell>
                  {award.notes
                    ? <span className="block max-w-[220px] truncate text-sm text-neutral-700" title={award.notes}>{award.notes}</span>
                    : <span className="text-sm italic text-neutral-500">—</span>}
                </TableCell>

                <TableCell align="right">
                  {!isArchived(en?.school_year) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="ti-award-off"
                      aria-label={`Revoke scholarship from ${name}`}
                      className="hover:bg-error-50 hover:text-error-500"
                      onClick={() => setToRevoke(award)}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </Table>
      </Card>

      {!loading && !loadError && pageMeta.count > 0 && (
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
          <ConfirmModal
            icon="ti-award-off"
            title="Revoke Scholarship?"
            message="This will remove the scholarship award from this enrollment. The student may need to reapply."
            confirmLabel="Yes, revoke"
            onConfirm={handleRevoke}
            onCancel={() => setToRevoke(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 2: GRADE-BASED ELIGIBILITY
// ════════════════════════════════════════════════════════════════════════════
function EligibilityTab({ scholarshipTypes }) {
  const isArchived = useArchivedYears();
  const [eligible,      setEligible]      = useState([]);
  const [loading,       setLoading]       = useState(false);
  // A scan covers one year's enrolled learners, so there's no "All years".
  const [schoolYear,    setSchoolYear]    = useYearFilter({ allowAll: false });
  const [gradingPeriod, setGradingPeriod] = useState("1st_quarter");
  const [scanned,       setScanned]       = useState(false);
  // Learners whose grades couldn't be read. They are not in the list, and
  // that must not look like "not eligible".
  const [unchecked,     setUnchecked]     = useState(0);
  const [scanError,     setScanError]     = useState("");
  const [applyModal,    setApplyModal]    = useState(false);
  const [, setSavedCount] = useState(0);

  const { options: syOptions, currentYear } = useSchoolYear();

  const handleScan = async () => {
    if (!schoolYear) return;
    setLoading(true); setScanned(false); setEligible([]); setUnchecked(0); setScanError("");
    try {
      // Every enrolled learner, not the first 200: the scan is meant to be
      // school-wide, and a larger school's remaining learners were never
      // considered.
      const enrs = await fetchAllPages(getEnrollments, { school_year:schoolYear, enrollment_status:"enrolled" });
      let failures = 0;
      const results = await Promise.all(
        enrs.map(async (en) => {
          try {
            const gradeData = await getGrades({ enrollment:en.enrollment_id, grading_period:gradingPeriod, page_size:100 });
            const grades = Array.isArray(gradeData) ? gradeData : gradeData?.results ?? [];
            if (grades.length === 0) return null;
            const avg = grades.reduce((s, g) => s + parseFloat(g.numeric_grade), 0) / grades.length;
            if (avg < ELIGIBILITY_THRESHOLD) return null;
            const studentName = en.student_name ?? `Student #${en.student}`;
            return {
              enrollment_id:  en.enrollment_id,
              student_name:   studentName,
              school_year:    en.school_year,
              grade_level:    en.grade_level,
              section:        en.section,
              grading_period: gradingPeriod,
              avg:            avg,
              grades_count:   grades.length,
            };
          } catch { failures += 1; return null; }
        })
      );
      const eligibleList = results.filter(Boolean);
      eligibleList.sort((a, b) => b.avg - a.avg);
      setEligible(eligibleList);
      setUnchecked(failures);
      setScanned(true);
    } catch (e) {
      console.error(e);
      setScanError(e.message || "The scan couldn't load the enrolled students. Try again.");
    }
    finally { setLoading(false); }
  };

  const yearOptions = groupYears(syOptions, currentYear)
    .flatMap(([, group]) => group)
    .map((y) => ({ value: y, label: `S.Y. ${y}` }));

  return (
    <div className="space-y-4">
      {/* ── What to scan ── */}
      <Card padding="none">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-md font-bold text-neutral-900">Grade-based eligibility</h2>
            <p className="mt-0.5 text-[12.5px] text-neutral-500">
              Lists every enrolled learner whose general average for the period is {ELIGIBILITY_THRESHOLD} or above.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <FilterMenu
              label="School year"
              valueLabel={schoolYear}
              active={false}
              options={yearOptions}
              value={schoolYear}
              onChange={setSchoolYear}
              align="end"
              menuWidth={200}
            />
            <FilterMenu
              label="Period"
              valueLabel={PERIOD_LABELS[gradingPeriod]}
              active={false}
              options={PERIOD_OPTIONS}
              value={gradingPeriod}
              onChange={setGradingPeriod}
              align="end"
              menuWidth={180}
            />
            <Button icon="ti-scan" loading={loading} onClick={handleScan}>
              {loading ? "Scanning…" : "Scan Now"}
            </Button>
          </div>
        </div>
        {(scanError || (scanned && unchecked > 0)) && (
          <div className="border-t border-neutral-200 px-5 py-3">
            {scanError && <Alert variant="error">{scanError}</Alert>}
            {scanned && unchecked > 0 && (
              <Alert variant="warning">
                {unchecked} student{unchecked === 1 ? "" : "s"} couldn&apos;t be checked because their grades didn&apos;t load. Scan again before awarding.
              </Alert>
            )}
          </div>
        )}
      </Card>

      <ArchivedYearNotice schoolYear={schoolYear} records="scholarship awards" />

      {/* ── Results ── */}
      <AnimatePresence>
        {scanned && (
          <motion.div
            key="eligibility-results"
            initial={{ opacity:0, y:12 }}
            animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, y:12 }}
            transition={{ duration:0.24, ease:"easeOut" }}
          >
            <Card padding="none" className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="text-md font-bold text-neutral-900">
                      {eligible.length > 0 ? "Eligible learners" : "No eligible learners"}
                    </h2>
                    {eligible.length > 0 && (
                      <span className="text-sm text-neutral-500 tabular-nums">{eligible.length}</span>
                    )}
                  </div>
                  <div className="text-[12px] text-neutral-500">
                    S.Y. {schoolYear} · {PERIOD_LABELS[gradingPeriod]} · average {ELIGIBILITY_THRESHOLD} or above
                  </div>
                </div>
                {eligible.length > 0 && !isArchived(schoolYear) && (
                  <Button icon="ti-award" onClick={() => setApplyModal(true)}>
                    Award Scholarship to All
                  </Button>
                )}
              </div>

              <Table
                headerVariant="quiet"
                columns={ELIGIBLE_COLUMNS}
                isEmpty={eligible.length === 0}
                empty={{
                  icon: "ti-mood-empty",
                  withAvatar: false,
                  title: "No eligible students",
                  subtitle: `No students have a general average of ${ELIGIBILITY_THRESHOLD} or above for ${PERIOD_LABELS[gradingPeriod]} in S.Y. ${schoolYear}.`,
                }}
              >
                {eligible.map((elig) => {
                  const pal = getAvatarPalette(elig.student_name);
                  return (
                    <TableRow key={elig.enrollment_id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                            style={{ background: pal.bg, color: pal.color }}
                            aria-hidden="true"
                          >
                            {initialsFrom(elig.student_name)}
                          </div>
                          <span className="truncate text-[13px] font-semibold text-neutral-900">{elig.student_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-neutral-900">{elig.grade_level}</div>
                        <div className="text-[11.5px] text-neutral-500">{elig.section}</div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-neutral-800 tabular-nums">
                          {elig.grades_count} subject{elig.grades_count !== 1 ? "s" : ""}
                        </span>
                      </TableCell>
                      <TableCell align="right">
                        <span className="text-[13px] font-bold text-success-600 tabular-nums">{elig.avg.toFixed(2)}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Table>
            </Card>
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
  // Every type, so awards made with a retired one still have a name and a
  // colour; only the active ones can be awarded.
  const [scholarshipTypes, setScholarshipTypes] = useState([]);
  const activeTypes = useMemo(() => scholarshipTypes.filter((sc) => sc.is_active), [scholarshipTypes]);
  const [awardModal,       setAwardModal]       = useState(false);
  const [refreshKey,       setRefreshKey]       = useState(0);
  // The awards year lives here rather than in its tab: the tab is remounted
  // after every award (key={refreshKey}) and on every tab switch, and the
  // Award Scholarship form searches the same year.
  const [awardsYear, setAwardsYear, awardsYearIsDefault] = useYearFilter();
  const { currentYear } = useSchoolYear();
  // Awards go into the year on screen; an archived one takes none.
  const isArchived = useArchivedYears();
  const awardsYearArchived = isArchived(awardsYear || currentYear);

  useEffect(() => {
    getScholarshipTypes()
      .then((d) => {
        const types = Array.isArray(d) ? d : d?.results ?? [];
        setScholarshipTypes([...types].sort((a, b) => a.scholarship_type_id - b.scholarship_type_id));
      })
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
        actions={
          <>
            <Tabs variant="pill" tabs={TABS} value={activeTab} onChange={setActiveTab} />
            <Button variant="secondary" icon="ti-settings" onClick={() => navigate("/scholarship-types")}>
              Manage Types
            </Button>
            <Button icon={awardsYearArchived ? "ti-lock" : "ti-award"} disabled={awardsYearArchived}
              title={awardsYearArchived ? `S.Y. ${awardsYear || currentYear} is archived` : undefined}
              onClick={() => setAwardModal(true)}>
              Award Scholarship
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto px-7 py-6">
        <AnimatePresence mode="wait">
          {activeTab === "manual" && (
            <motion.div
              key="manual"
              initial={{ opacity:0, y:8 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:-8 }}
              transition={{ duration:0.18, ease:"easeOut" }}
            >
              <ManualAwardsTab
                key={refreshKey}
                scholarshipTypes={scholarshipTypes}
                schoolYear={awardsYear}
                onSchoolYearChange={setAwardsYear}
                yearIsDefault={awardsYearIsDefault}
              />
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
              <EligibilityTab scholarshipTypes={activeTypes} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {awardModal && (
          <AwardModal
            scholarshipTypes={activeTypes}
            schoolYear={awardsYear || currentYear}
            onClose={() => setAwardModal(false)}
            onSaved={() => setRefreshKey((k) => k + 1)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
