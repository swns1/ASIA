import { useState, useEffect, useCallback, useMemo } from "react";
import AppLayout from "../components/AppLayout";
import { useNavigate } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";

// ── API ───────────────────────────────────────────────────────────────────────
import {
  getEnrollmentScholarships as _getEnrollmentScholarships,
  getScholarshipTypes as _getScholarshipTypes,
  getEnrollments as _getEnrollments,
  getGrades as _getGrades,
  createEnrollmentScholarship as _createEnrollmentScholarship,
  deleteEnrollmentScholarship as _deleteEnrollmentScholarship,
} from "../api/enrollmentApi";
import { getStudents as _getStudents } from "../api/studentApi";

const getEnrollmentScholarships   = (p = {}) => _getEnrollmentScholarships(p);
const getScholarshipTypes         = ()       => _getScholarshipTypes({ is_active: true, page_size: 100 });
const getEnrollments              = (p = {}) => _getEnrollments(p);
const getGrades                   = (p = {}) => _getGrades(p);
const createEnrollmentScholarship = (p)      => _createEnrollmentScholarship(p);
const deleteEnrollmentScholarship = (id)     => _deleteEnrollmentScholarship(id);

// ── NAV ───────────────────────────────────────────────────────────────────────

// ── Constants ─────────────────────────────────────────────────────────────────
const ELIGIBILITY_THRESHOLD = 95;

const PALETTES = [
  { bg:"#fde8e8", color:"#c0392b" },{ bg:"#e8f0fd", color:"#2563eb" },
  { bg:"#e8fdf0", color:"#16a34a" },{ bg:"#fdf5e8", color:"#d97706" },
  { bg:"#f0e8fd", color:"#7c3aed" },{ bg:"#fde8f8", color:"#be185d" },
  { bg:"#e8fdfd", color:"#0891b2" },
];
const getPalette = (name = "X") => PALETTES[name.charCodeAt(0) % PALETTES.length];

const PERIOD_LABELS = {
  "1st_quarter":  "1st Quarter",
  "2nd_quarter":  "2nd Quarter",
  "3rd_quarter":  "3rd Quarter",
  "4th_quarter":  "4th Quarter",
  "1st_semester": "1st Semester",
  "2nd_semester": "2nd Semester",
};

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width:w, height:h, borderRadius:r, background:"linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.6s ease-in-out infinite" }} />
);

// ── Logout Modal ──────────────────────────────────────────────────────────────

// ── Award Modal (Manual) ──────────────────────────────────────────────────────
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

  const currentSY = (() => {
    const now = new Date();
    const yr = now.getFullYear();
    return now.getMonth() >= 5 ? `${yr}-${yr + 1}` : `${yr - 1}-${yr}`;
  })();

  useEffect(() => {
    if (!search.trim()) { setStudents([]); return; }
    setLoadingSt(true);
    const t = setTimeout(async () => {
      try {
        const data = await getEnrollments({ search, enrollment_status: "enrolled", school_year: currentSY, page_size: 100 });
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
    if (student._enrollment) {
      setEnrollments([student._enrollment]);
      setEnrollment(student._enrollment);
      return;
    }
    getEnrollments({ student: student.student_id, enrollment_status: "enrolled", school_year: currentSY, page_size: 20 })
      .then((d) => setEnrollments(Array.isArray(d) ? d : d?.results ?? []))
      .catch(() => setEnrollments([]));
  }, [student]);

  const handleSave = async () => {
    if (!enrollment) { setError("Please select an enrollment."); return; }
    if (!schTypeId)  { setError("Please select a scholarship type."); return; }
    setSaving(true); setError("");
    try {
      await createEnrollmentScholarship({ enrollment: enrollment.enrollment_id, scholarship_type: parseInt(schTypeId), notes: notes.trim() || null });
      onSaved();
      onClose();
    } catch (e) { setError(e.message || "Failed to award scholarship."); }
    finally { setSaving(false); }
  };

  const inp = { width:"100%", border:"1.5px solid #fde2de", borderRadius:10, padding:"10px 14px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a", background:"#fffbfb", outline:"none", boxSizing:"border-box" };
  const lbl = { display:"block", fontSize:10.5, fontWeight:700, color:"#7a5050", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:6 };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)", animation:"fadeIn 0.15s ease" }}>
      <div style={{ background:"white", borderRadius:20, width:520, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(224,49,49,0.18)", animation:"slideUp 0.2s ease" }}>
        <div style={{ padding:"22px 28px 18px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(to right,#fdfafa,white)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <i className="ti ti-award" style={{ fontSize:18, color:"#e03131" }} />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a"}}>Award Scholarship</div>
              <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>Manually assign a scholarship to an enrollment</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#c0a0a0", fontSize:20 }}>
            <i className="ti ti-x" />
          </button>
        </div>

        <div style={{ padding:"22px 28px" }}>
          {error && (
            <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#b91c1c", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
              <i className="ti ti-alert-circle" style={{ fontSize:14 }} />{error}
            </div>
          )}

          <div style={{ marginBottom:14 }}>
            <label style={lbl}>Student *</label>
            {student ? (
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", border:"1.5px solid #fde2de", borderRadius:10, background:"#fff8f6" }}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:getPalette(student.last_name).bg, color:getPalette(student.last_name).color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:13, flexShrink:0 }}>
                  {`${student.first_name?.[0]??""}${student.last_name?.[0]??""}`.toUpperCase()}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{student.first_name} {student.last_name}</div>
                  <div style={{ fontSize:11, color:"#b09090" }}>LRN {student.lrn}</div>
                </div>
                <button onClick={() => { setStudent(null); setEnrollment(null); }} style={{ background:"transparent", border:"1px solid #fde2de", borderRadius:7, padding:"5px 10px", fontSize:12, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Change</button>
              </div>
            ) : (
              <div style={{ position:"relative" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, background:"white", border:"1.5px solid #fde2de", borderRadius:10, padding:"0 14px", height:44 }}>
                  <i className="ti ti-search" style={{ fontSize:14, color:"#c0a0a0" }} />
                  <input placeholder="Search student by name or LRN…" value={search}
                    onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0a0a", outline:"none", fontFamily:"'DM Sans',sans-serif" }} />
                  {loadingSt && <i className="ti ti-loader-2" style={{ fontSize:13, color:"#e03131", animation:"spin 1s linear infinite" }} />}
                </div>
                {open && search && (
                  <div style={{ position:"absolute", top:"100%", left:0, right:0, marginTop:6, background:"white", borderRadius:10, border:"1px solid #fde2de", boxShadow:"0 12px 40px rgba(224,49,49,0.14)", maxHeight:220, overflowY:"auto", zIndex:1000 }}>
                    {students.length === 0 && !loadingSt && <div style={{ padding:"16px", textAlign:"center", color:"#b09090", fontSize:13 }}>No students found.</div>}
                    {students.map((st) => (
                      <div key={st.student_id} onClick={() => { setStudent(st); setOpen(false); setSearch(""); }}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", cursor:"pointer", borderBottom:"1px solid #f9f0f0" }}
                        onMouseEnter={(e) => e.currentTarget.style.background="#fff8f6"}
                        onMouseLeave={(e) => e.currentTarget.style.background="transparent"}>
                        <div style={{ width:30, height:30, borderRadius:"50%", background:getPalette(st.last_name).bg, color:getPalette(st.last_name).color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>
                          {`${st.first_name?.[0]??""}${st.last_name?.[0]??""}`.toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{st.last_name}, {st.first_name}</div>
                          <div style={{ fontSize:11, color:"#b09090" }}>LRN {st.lrn}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {student && (
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>Enrollment *</label>
              {enrollments.length === 0
                ? <div style={{ fontSize:13, color:"#b09090", padding:"12px 14px", background:"#fdfafa", borderRadius:10, border:"1px solid #f5eaea", fontStyle:"italic" }}>No active enrollments found for this student.</div>
                : <select value={enrollment?.enrollment_id ?? ""} onChange={(e) => setEnrollment(enrollments.find((en) => en.enrollment_id === parseInt(e.target.value)) ?? null)} style={{ ...inp, cursor:"pointer" }}>
                    <option value="">— Select enrollment —</option>
                    {enrollments.map((en) => (
                      <option key={en.enrollment_id} value={en.enrollment_id}>
                        S.Y. {en.school_year} · {en.grade_level} · {en.section}
                      </option>
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
          <button onClick={onClose} style={{ background:"transparent", color:"#9a7070", border:"1.5px solid #fde2de", borderRadius:50, padding:"9px 22px", fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ background:saving?"#e87474":"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:50, padding:"9px 24px", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:saving?"not-allowed":"pointer", display:"inline-flex", alignItems:"center", gap:8, boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}>
            {saving ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:"spin 1s linear infinite" }} />Saving…</> : <><i className="ti ti-award" style={{ fontSize:13 }} />Award Scholarship</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Revoke Modal ──────────────────────────────────────────────────────────────
function RevokeModal({ award, onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"white", borderRadius:20, padding:"32px 36px", width:400, boxShadow:"0 24px 64px rgba(224,49,49,0.18)", display:"flex", flexDirection:"column", alignItems:"center", gap:14, animation:"slideUp 0.2s ease" }}>
        <div style={{ width:56, height:56, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <i className="ti ti-award-off" style={{ fontSize:24, color:"#e03131" }} />
        </div>
        <div style={{ fontSize:17, fontWeight:700, color:"#1a0a0a"}}>Revoke Scholarship?</div>
        <div style={{ fontSize:13, color:"#7a5050", textAlign:"center", lineHeight:1.7 }}>
          This will remove the scholarship award from this enrollment. The student may need to reapply.
        </div>
        <div style={{ display:"flex", gap:10, width:"100%", marginTop:4 }}>
          <button onClick={onCancel} style={{ flex:1, height:42, border:"1.5px solid #f0e0e0", borderRadius:10, background:"white", fontSize:13, color:"#7a5050", cursor:"pointer", fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex:1, height:42, border:"none", borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", fontSize:13, color:"white", cursor:"pointer", fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>Yes, revoke</button>
        </div>
      </div>
    </div>
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
    const res = { success: [], failed: [] };
    for (const elig of eligible) {
      try {
        await createEnrollmentScholarship({ enrollment: elig.enrollment_id, scholarship_type: parseInt(schTypeId), notes: notes.trim() || null });
        res.success.push(elig.student_name);
      } catch { res.failed.push(elig.student_name); }
    }
    setResults(res);
    setApplying(false);
    if (res.success.length > 0) onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)", animation:"fadeIn 0.15s ease" }}>
      <div style={{ background:"white", borderRadius:20, width:560, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(224,49,49,0.18)", animation:"slideUp 0.2s ease" }}>
        <div style={{ padding:"22px 28px 18px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(to right,#fdfafa,white)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"#e8f5e0", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <i className="ti ti-award" style={{ fontSize:18, color:"#2e6b0d" }} />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a"}}>Apply Grade-Based Scholarship</div>
              <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>{eligible.length} eligible student{eligible.length !== 1 ? "s" : ""} with avg ≥ {ELIGIBILITY_THRESHOLD}%</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#c0a0a0", fontSize:20 }}>
            <i className="ti ti-x" />
          </button>
        </div>

        <div style={{ padding:"22px 28px" }}>
          {results ? (
            <div>
              {results.success.length > 0 && (
                <div style={{ background:"#e8f5e0", border:"1px solid #a3d977", borderRadius:10, padding:"14px 16px", marginBottom:12 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#2e6b0d", marginBottom:8 }}>
                    <i className="ti ti-circle-check" style={{ fontSize:15, marginRight:6 }} />
                    {results.success.length} scholarship{results.success.length !== 1 ? "s" : ""} awarded successfully
                  </div>
                  {results.success.map((n, i) => <div key={i} style={{ fontSize:12, color:"#2e6b0d", marginLeft:20 }}>• {n}</div>)}
                </div>
              )}
              {results.failed.length > 0 && (
                <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#b91c1c", marginBottom:8 }}>
                    <i className="ti ti-alert-circle" style={{ fontSize:15, marginRight:6 }} />
                    {results.failed.length} failed (may already have this scholarship)
                  </div>
                  {results.failed.map((n, i) => <div key={i} style={{ fontSize:12, color:"#b91c1c", marginLeft:20 }}>• {n}</div>)}
                </div>
              )}
              <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
                <button onClick={onClose} style={{ background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:50, padding:"9px 24px", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>Done</button>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#b91c1c", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
                  <i className="ti ti-alert-circle" style={{ fontSize:14 }} />{error}
                </div>
              )}
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
                    <div key={elig.enrollment_id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderBottom: i < eligible.length - 1 ? "1px solid #f9f0f0" : "none", background:"white" }}>
                      <div style={{ width:34, height:34, borderRadius:"50%", background:getPalette(elig.last_name ?? "X").bg, color:getPalette(elig.last_name ?? "X").color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>
                        {elig.initials}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{elig.student_name}</div>
                        <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>
                          S.Y. {elig.school_year} · {elig.grade_level} · {PERIOD_LABELS[elig.grading_period] ?? elig.grading_period}
                        </div>
                      </div>
                      <span style={{ fontSize:14, fontWeight:700, padding:"3px 12px", borderRadius:99, background:"#e8f5e0", color:"#2e6b0d" }}>
                        {elig.avg.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
                <button onClick={onClose} style={{ background:"transparent", color:"#9a7070", border:"1.5px solid #fde2de", borderRadius:50, padding:"9px 22px", fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", cursor:"pointer" }}>Cancel</button>
                <button onClick={handleApply} disabled={applying}
                  style={{ background:applying?"#e87474":"linear-gradient(135deg,#2e6b0d,#256009)", color:"white", border:"none", borderRadius:50, padding:"9px 24px", fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif", cursor:applying?"not-allowed":"pointer", display:"inline-flex", alignItems:"center", gap:8, boxShadow:"0 4px 16px rgba(46,107,13,0.26)" }}>
                  {applying ? <><i className="ti ti-loader-2" style={{ fontSize:13, animation:"spin 1s linear infinite" }} />Applying…</> : <><i className="ti ti-award" style={{ fontSize:13 }} />Award to All ({eligible.length})</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 1: MANUAL AWARDS
// ════════════════════════════════════════════════════════════════════════════
function ManualAwardsTab({ scholarshipTypes, onAward }) {
  const [awards,   setAwards]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [toRevoke, setToRevoke] = useState(null);
  const [search,   setSearch]   = useState("");
  const [inputVal, setInputVal] = useState("");

  const fetchAwards = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEnrollmentScholarships({ page_size: 100 });
      setAwards(Array.isArray(data) ? data : data?.results ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAwards(); }, []);

  const handleRevoke = async () => {
    if (!toRevoke) return;
    await deleteEnrollmentScholarship(toRevoke.enrollment_scholarship_id);
    setToRevoke(null);
    fetchAwards();
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return awards;
    const q = search.toLowerCase();
    return awards.filter((a) =>
      a.scholarship_type_detail?.scholarship_name?.toLowerCase().includes(q) ||
      a.enrollment_detail?.student_name?.toLowerCase().includes(q) ||
      String(a.enrollment_id).includes(q)
    );
  }, [awards, search]);

  const formatDiscount = (sc) => sc
    ? sc.discount_mode === "percentage"
      ? `${parseFloat(sc.discount_value).toFixed(0)}% off`
      : `₱${parseFloat(sc.discount_value).toLocaleString()} off`
    : "—";

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
        <div style={{ flex:1, display:"flex", alignItems:"center", gap:10, background:"white", border:"1.5px solid #f0e4e4", borderRadius:12, padding:"0 16px", height:42 }}>
          <i className="ti ti-search" style={{ fontSize:15, color:"#c0a0a0" }} />
          <input placeholder="Search by student name or scholarship…" value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => { if (e.key==="Enter") setSearch(inputVal); }}
            style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0a0a", fontFamily:"'DM Sans',sans-serif", outline:"none" }} />
          {inputVal && <button style={{ background:"none", border:"none", cursor:"pointer", color:"#c0a0a0" }} onClick={() => { setInputVal(""); setSearch(""); }}><i className="ti ti-x" style={{ fontSize:13 }} /></button>}
        </div>
        <button onClick={() => setSearch(inputVal)}
          style={{ height:42, padding:"0 20px", background:"white", border:"1.5px solid #f0e4e4", borderRadius:12, fontSize:13, fontWeight:600, color:"#7a5050", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor="#e03131"; e.currentTarget.style.color="#e03131"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor="#f0e4e4"; e.currentTarget.style.color="#7a5050"; }}>
          Search
        </button>
        <button onClick={onAward}
          style={{ height:42, padding:"0 18px", background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:12, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", display:"inline-flex", alignItems:"center", gap:8, boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}>
          <i className="ti ti-plus" style={{ fontSize:14 }} />Award Scholarship
        </button>
      </div>

      <div style={{ background:"white", border:"1px solid #f5eaea", borderRadius:16, overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:"#fdfafa" }}>
              {["Student / Enrollment","Scholarship","Discount","Awarded On","Notes",""].map((h) => (
                <th key={h} style={{ textAlign:"left", fontSize:10.5, fontWeight:600, color:"#c0a0a0", padding:"13px 18px", borderBottom:"1px solid #f5eaea", textTransform:"uppercase", letterSpacing:"0.07em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[1,2,3,4,5,6].map((j) => (
                      <td key={j} style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0" }}><Sk w={j===1?140:90} h={13} /></td>
                    ))}
                  </tr>
                ))
              : filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign:"center", padding:"56px 16px" }}>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                        <div style={{ width:52, height:52, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <i className="ti ti-award-off" style={{ fontSize:22, color:"#e08080" }} />
                        </div>
                        <div style={{ fontSize:14, color:"#7a5050", fontWeight:600}}>No scholarships awarded yet</div>
                        <div style={{ fontSize:12, color:"#b09090" }}>Click "Award Scholarship" to manually assign one</div>
                      </div>
                    </td>
                  </tr>
                )
                : filtered.map((award, idx) => {
                    const sc   = award.scholarship_type_detail;
                    const en   = award.enrollment_detail;
                    const name = en?.student_name ?? `Enrollment #${award.enrollment_id}`;
                    const pal  = getPalette(name);
                    const initials = name.split(" ").map((w) => w[0]).join("").slice(0,2).toUpperCase();
                    const awardedOn = award.approved_at
                      ? new Date(award.approved_at).toLocaleDateString("en-PH", { year:"numeric", month:"short", day:"numeric" })
                      : "—";
                    return (
                      <tr key={award.enrollment_scholarship_id} className="award-row"
                        style={{ animation:`rowIn 0.18s ease both`, animationDelay:`${idx*20}ms` }}>
                        <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <div style={{ width:34, height:34, borderRadius:"50%", background:pal.bg, color:pal.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>{initials}</div>
                            <div>
                              <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{name}</div>
                              <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>
                                {en ? `S.Y. ${en.school_year} · ${en.grade_level} · ${en.section}` : `Enrollment #${award.enrollment_id}`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                          {sc ? <div>
                            <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{sc.scholarship_name}</div>
                            <div style={{ fontSize:11, color:"#b09090", fontFamily:"monospace", marginTop:1 }}>{sc.scholarship_code}</div>
                          </div> : <span style={{ color:"#d0b8b8", fontStyle:"italic", fontSize:12 }}>—</span>}
                        </td>
                        <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                          <span style={{ fontSize:13, fontWeight:700, color: sc?.discount_mode==="percentage" ? "#1455a0" : "#2e6b0d" }}>
                            {formatDiscount(sc)}
                          </span>
                        </td>
                        <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle", fontSize:12, color:"#7a5a5a" }}>{awardedOn}</td>
                        <td style={{ padding:"13px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                          {award.notes
                            ? <span style={{ fontSize:12, color:"#7a5a5a" }}>{award.notes}</span>
                            : <span style={{ color:"#d0b8b8", fontStyle:"italic", fontSize:12 }}>—</span>}
                        </td>
                        <td style={{ padding:"13px 14px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                          <button className="row-action" title="Revoke" style={{ color:"#c09090" }} onClick={() => setToRevoke(award)}>
                            <i className="ti ti-award-off" style={{ fontSize:13 }} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
            }
          </tbody>
        </table>
      </div>

      {toRevoke && <RevokeModal award={toRevoke} onConfirm={handleRevoke} onCancel={() => setToRevoke(null)} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 2: GRADE-BASED ELIGIBILITY
// ════════════════════════════════════════════════════════════════════════════
function EligibilityTab({ scholarshipTypes }) {
  const [eligible,      setEligible]      = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [schoolYear,    setSchoolYear]    = useState("");
  const [gradingPeriod, setGradingPeriod] = useState("1st_quarter");
  const [scanned,       setScanned]       = useState(false);
  const [applyModal,    setApplyModal]    = useState(false);
  const [savedCount,    setSavedCount]    = useState(0);

  const PERIODS = [
    { value:"1st_quarter",  label:"1st Quarter"  },
    { value:"2nd_quarter",  label:"2nd Quarter"  },
    { value:"3rd_quarter",  label:"3rd Quarter"  },
    { value:"4th_quarter",  label:"4th Quarter"  },
    { value:"1st_semester", label:"1st Semester" },
    { value:"2nd_semester", label:"2nd Semester" },
  ];

  const syOptions = useMemo(() => {
    const d = new Date();
    const base = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
    return Array.from({ length: 4 }, (_, i) => { const y = base + 1 - i; return `${y}-${y+1}`; });
  }, []);

  useEffect(() => { setSchoolYear(syOptions[0]); }, []);

  const handleScan = async () => {
    if (!schoolYear) return;
    setLoading(true); setScanned(false); setEligible([]);
    try {
      const enrData = await getEnrollments({ school_year: schoolYear, enrollment_status: "enrolled", page_size: 200 });
      const enrs = Array.isArray(enrData) ? enrData : enrData?.results ?? [];
      const eligibleList = [];
      for (const en of enrs) {
        const gradeData = await getGrades({ enrollment: en.enrollment_id, grading_period: gradingPeriod, page_size: 100 });
        const grades = Array.isArray(gradeData) ? gradeData : gradeData?.results ?? [];
        if (grades.length === 0) continue;
        const avg = grades.reduce((s, g) => s + parseFloat(g.numeric_grade), 0) / grades.length;
        if (avg >= ELIGIBILITY_THRESHOLD) {
          const studentName = en.student_name ?? `Student #${en.student}`;
          const lastName = studentName.split(" ").pop() ?? "X";
          eligibleList.push({
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
          });
        }
      }
      eligibleList.sort((a, b) => b.avg - a.avg);
      setEligible(eligibleList);
      setScanned(true);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ background:"linear-gradient(to right,#e8f5e0,#f0faea)", border:"1px solid #a3d977", borderRadius:14, padding:"16px 20px", display:"flex", alignItems:"flex-start", gap:14 }}>
        <div style={{ width:40, height:40, borderRadius:10, background:"#2e6b0d22", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <i className="ti ti-info-circle" style={{ fontSize:20, color:"#2e6b0d" }} />
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:"#2e6b0d" }}>Grade-Based Eligibility</div>
          <div style={{ fontSize:13, color:"#3a6020", marginTop:4, lineHeight:1.6 }}>
            The system scans all enrolled students for the selected school year and grading period.
            Students with a general average of <strong>≥ {ELIGIBILITY_THRESHOLD}%</strong> across all their recorded grades are considered eligible.
          </div>
        </div>
      </div>

      <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"20px 22px", boxShadow:"0 2px 12px rgba(224,49,49,0.05)" }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#1a0a0a", marginBottom:14 }}>Scan Parameters</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:12, alignItems:"flex-end" }}>
          <div>
            <label style={{ display:"block", fontSize:10.5, fontWeight:700, color:"#7a5050", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:6 }}>School Year</label>
            <select value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)}
              style={{ width:"100%", border:"1.5px solid #fde2de", borderRadius:10, padding:"10px 14px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a", background:"#fffbfb", outline:"none", cursor:"pointer" }}>
              {syOptions.map((sy) => <option key={sy} value={sy}>{sy}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display:"block", fontSize:10.5, fontWeight:700, color:"#7a5050", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:6 }}>Grading Period</label>
            <select value={gradingPeriod} onChange={(e) => setGradingPeriod(e.target.value)}
              style={{ width:"100%", border:"1.5px solid #fde2de", borderRadius:10, padding:"10px 14px", fontSize:13, fontFamily:"'DM Sans',sans-serif", color:"#1a0a0a", background:"#fffbfb", outline:"none", cursor:"pointer" }}>
              {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <button onClick={handleScan} disabled={loading}
            style={{ height:44, padding:"0 24px", background:loading?"#e87474":"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, fontSize:13, fontWeight:700, cursor:loading?"not-allowed":"pointer", fontFamily:"'DM Sans',sans-serif", display:"inline-flex", alignItems:"center", gap:8, boxShadow:"0 4px 16px rgba(224,49,49,0.26)", whiteSpace:"nowrap" }}>
            {loading ? <><i className="ti ti-loader-2" style={{ fontSize:14, animation:"spin 1s linear infinite" }} />Scanning…</> : <><i className="ti ti-scan" style={{ fontSize:14 }} />Scan Now</>}
          </button>
        </div>
      </div>

      {scanned && (
        <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", overflow:"hidden", boxShadow:"0 2px 16px rgba(224,49,49,0.06)", animation:"fadeUp 0.25s ease both" }}>
          <div style={{ padding:"16px 22px", borderBottom:"1px solid #f5eaea", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(to right,#fdfafa,white)" }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:"#1a0a0a" }}>
                {eligible.length > 0
                  ? <><span style={{ color:"#2e6b0d" }}>{eligible.length}</span> student{eligible.length !== 1 ? "s" : ""} eligible</>
                  : "No eligible students found"
                }
              </div>
              <div style={{ fontSize:11, color:"#b09090", marginTop:2 }}>
                S.Y. {schoolYear} · {PERIOD_LABELS[gradingPeriod]} · avg ≥ {ELIGIBILITY_THRESHOLD}%
              </div>
            </div>
            {eligible.length > 0 && (
              <button onClick={() => setApplyModal(true)}
                style={{ display:"inline-flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#2e6b0d,#256009)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(46,107,13,0.26)" }}>
                <i className="ti ti-award" style={{ fontSize:14 }} />Award Scholarship to All
              </button>
            )}
          </div>

          {eligible.length === 0 ? (
            <div style={{ padding:"48px 24px", textAlign:"center" }}>
              <div style={{ width:52, height:52, borderRadius:14, background:"#faeeda", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}>
                <i className="ti ti-mood-empty" style={{ fontSize:22, color:"#854f0b" }} />
              </div>
              <div style={{ fontSize:14, color:"#7a5050", fontWeight:600
              }}>No eligible students</div>
              <div style={{ fontSize:12, color:"#b09090", marginTop:6 }}>
                No students have a general average ≥ {ELIGIBILITY_THRESHOLD}% for {PERIOD_LABELS[gradingPeriod]} in S.Y. {schoolYear}.
              </div>
            </div>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#fdfafa" }}>
                  {["Student","School Year","Grade / Section","Subjects Graded","General Average",""].map((h) => (
                    <th key={h} style={{ textAlign:"left", fontSize:10.5, fontWeight:600, color:"#c0a0a0", padding:"12px 18px", borderBottom:"1px solid #f5eaea", textTransform:"uppercase", letterSpacing:"0.07em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eligible.map((elig, idx) => (
                  <tr key={elig.enrollment_id} className="award-row"
                    style={{ animation:`rowIn 0.18s ease both`, animationDelay:`${idx*20}ms` }}>
                    <td style={{ padding:"12px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:34, height:34, borderRadius:"50%", background:getPalette(elig.last_name).bg, color:getPalette(elig.last_name).color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>{elig.initials}</div>
                        <span style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{elig.student_name}</span>
                      </div>
                    </td>
                    <td style={{ padding:"12px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle", fontSize:13, color:"#5a4a4a" }}>{elig.school_year}</td>
                    <td style={{ padding:"12px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle", fontSize:13, color:"#5a4a4a" }}>{elig.grade_level} · {elig.section}</td>
                    <td style={{ padding:"12px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                      <span style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>{elig.grades_count}</span>
                      <span style={{ fontSize:11, color:"#b09090", marginLeft:4 }}>subject{elig.grades_count !== 1 ? "s" : ""}</span>
                    </td>
                    <td style={{ padding:"12px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                      <span style={{ fontSize:15, fontWeight:700, padding:"3px 12px", borderRadius:99, background:"#e8f5e0", color:"#2e6b0d" }}>
                        {elig.avg.toFixed(2)}
                      </span>
                    </td>
                    <td style={{ padding:"12px 18px", borderBottom:"1px solid #f9f0f0", verticalAlign:"middle" }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:99, background:"#e8f5e0", color:"#2e6b0d", display:"inline-flex", alignItems:"center", gap:4 }}>
                        <i className="ti ti-check" style={{ fontSize:11 }} />Eligible
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {applyModal && (
        <ApplyEligibilityModal
          eligible={eligible}
          scholarshipTypes={scholarshipTypes}
          onClose={() => setApplyModal(false)}
          onSaved={() => setSavedCount((c) => c + 1)}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function ScholarshipsPage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

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
    { id:"manual",      label:"Manual Awards",          icon:"ti-award"     },
    { id:"eligibility", label:"Grade-Based Eligibility", icon:"ti-chart-bar" },
  ];

  return (
    <AppLayout>


          {/* Topbar */}
          <div style={{ background:"white", borderBottom:"1px solid #f5eaea", padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a"}}>Scholarships</div>
              <div style={{ fontSize:11.5, color:"#b09090", marginTop:1 }}>Manage scholarship awards and check grade-based eligibility</div>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <button onClick={() => navigate("/scholarship-types")}
                style={{ display:"flex", alignItems:"center", gap:8, background:"white", color:"#7a5050", border:"1.5px solid #f0e4e4", borderRadius:10, padding:"8px 16px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.14s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor="#fca5a5"; e.currentTarget.style.color="#e03131"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor="#f0e4e4"; e.currentTarget.style.color="#7a5050"; }}>
                <i className="ti ti-settings" style={{ fontSize:14 }} />Manage Types
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Tab bar */}
            <div style={{ display:"flex", gap:2, background:"white", borderRadius:14, border:"1px solid #f5eaea", padding:6, boxShadow:"0 2px 10px rgba(224,49,49,0.04)", alignSelf:"flex-start" }}>
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button key={tab.id}
                    style={{ display:"flex", alignItems:"center", gap:8, height:38, padding:"0 20px", borderRadius:10, border:"none", background:isActive?"linear-gradient(135deg,#e03131,#c92a2a)":"transparent", color:isActive?"white":"#9a7070", fontSize:13, fontWeight:isActive?700:500, fontFamily:"'DM Sans',sans-serif", cursor:"pointer", boxShadow:isActive?"0 4px 14px rgba(224,49,49,0.24)":"none", transition:"all 0.14s", whiteSpace:"nowrap" }}
                    onClick={() => setActiveTab(tab.id)}>
                    <i className={`ti ${tab.icon}`} style={{ fontSize:14 }} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeTab === "manual" && (
              <ManualAwardsTab key={refreshKey} scholarshipTypes={scholarshipTypes} onAward={() => setAwardModal(true)} />
            )}
            {activeTab === "eligibility" && (
              <EligibilityTab scholarshipTypes={scholarshipTypes} />
            )}
          </div>

      {awardModal && (
        <AwardModal
          scholarshipTypes={scholarshipTypes}
          onClose={() => setAwardModal(false)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </AppLayout>
  );
}