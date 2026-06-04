import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getEnrollments, getSubjects, getGrades } from "../../api/enrollmentApi";
import { getStudent } from "../../api/studentApi";
import { getGuardiansByStudent } from "../../api/guardianApi";
import { getAttendance } from "../../api/attendanceApi";
import { getSchoolSettings } from "../../api/billingApi";
import { downloadAsPDF } from "../../utils/pdfExport";
import logo from "../../assets/logo.png";

const PURPLE  = "#5b21b6";
const LPURPLE = "#f5f0ff";
const BDR     = "1px solid #bbb";

const GRADE_ORDER = [
  "Nursery", "Kindergarten",
  "Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6",
  "Grade 7","Grade 8","Grade 9","Grade 10",
  "Grade 11","Grade 12",
];

const LEVEL_CONFIG = {
  Nursery:      { type:"annual",    periods:["annual"],                                                cols:["Annual"] },
  Kindergarten: { type:"annual",    periods:["annual"],                                                cols:["Annual"] },
  Elementary:   { type:"quarterly", periods:["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"], cols:["Q1","Q2","Q3","Q4"] },
  JHS:          { type:"quarterly", periods:["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"], cols:["Q1","Q2","Q3","Q4"] },
  SHS:          { type:"semester",  periods:["1st_semester","2nd_semester"],                           cols:["Sem 1","Sem 2"] },
};

function attIndex(dateStr, type) {
  const m = new Date(dateStr).getMonth() + 1;
  if (type === "quarterly") {
    if ([8,9,10].includes(m))  return 0;
    if ([11,12,1].includes(m)) return 1;
    if ([2,3].includes(m))     return 2;
    return 3;
  }
  if (type === "semester") return [8,9,10,11,12,1].includes(m) ? 0 : 1;
  return 0;
}

function gradeColor(g) {
  if (g >= 90) return "#1a6b0d";
  if (g >= 75) return "#1455a0";
  return "#c92a2a";
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString("en-PH", { month:"long", day:"numeric", year:"numeric" }) : "—";
}

function promotionRemark(enr, gwa) {
  if (enr.enrollment_status !== "completed") {
    return enr.enrollment_status
      ? enr.enrollment_status.charAt(0).toUpperCase() + enr.enrollment_status.slice(1)
      : "—";
  }
  if (gwa == null) return "Completed";
  const idx = GRADE_ORDER.indexOf(enr.grade_level);
  const next = idx >= 0 && idx < GRADE_ORDER.length - 1 ? GRADE_ORDER[idx + 1] : null;
  if (gwa >= 75) return next ? `Promoted to ${next}` : "Completed Program";
  return `Retained in ${enr.grade_level}`;
}

export default function SF10PrintPage() {
  const { studentId }    = useParams();
  const [student,      setStudent]      = useState(null);
  const [guardians,    setGuardians]    = useState([]);
  const [records,      setRecords]      = useState([]);
  const [schoolName,   setSchoolName]   = useState("South Lakes Integrated School");
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [downloading,  setDownloading]  = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [stu, gds, enrData, settings] = await Promise.all([
          getStudent(studentId),
          getGuardiansByStudent(studentId)
            .then(d => Array.isArray(d) ? d : d.results ?? [])
            .catch(() => []),
          getEnrollments({ student: studentId, page_size: 100 }),
          getSchoolSettings().catch(() => null),
        ]);

        setStudent(stu);
        setGuardians(gds);
        if (settings?.school_name) setSchoolName(settings.school_name);

        const enrollments = (Array.isArray(enrData) ? enrData : enrData.results ?? [])
          .sort((a, b) => {
            const gi = GRADE_ORDER.indexOf(a.grade_level) - GRADE_ORDER.indexOf(b.grade_level);
            if (gi !== 0) return gi;
            return (a.school_year || "").localeCompare(b.school_year || "");
          });

        const built = await Promise.all(
          enrollments.map(async (enr) => {
            const cfg = LEVEL_CONFIG[enr.school_level] ?? LEVEL_CONFIG.Elementary;
            const [subs, allGrades, attData] = await Promise.all([
              getSubjects({
                school_level: enr.school_level,
                ...(enr.strand   ? { strand:   enr.strand   } : {}),
                ...(enr.semester ? { semester: enr.semester } : {}),
              }).then(d => Array.isArray(d) ? d : d.results ?? []).catch(() => []),
              getGrades({ enrollment: enr.enrollment_id })
                .then(d => Array.isArray(d) ? d : d.results ?? []).catch(() => []),
              getAttendance({ enrollment: enr.enrollment_id, page_size: 500 })
                .then(d => Array.isArray(d) ? d : d.results ?? []).catch(() => []),
            ]);

            const gm = {};
            allGrades.forEach(g => {
              const key = g.subject ?? g.subject_id;
              if (!gm[key]) gm[key] = {};
              if (g.grade != null) gm[key][g.grading_period] = parseFloat(g.grade);
            });

            const n  = cfg.periods.length;
            const pP = Array(n).fill(0);
            const pA = Array(n).fill(0);
            attData.forEach(rec => {
              const i = attIndex(rec.date, cfg.type);
              if (i >= 0 && i < n) {
                if (rec.status === "P" || rec.status === "L") pP[i]++;
                else pA[i]++;
              }
            });

            return { enr, subjects: subs, gradeMap: gm, pP, pA, cfg };
          })
        );

        setRecords(built);
      } catch (e) {
        setError(e.message || "Failed to load data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId]);

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Arial,sans-serif", color:"#666" }}>
      Loading SF10…
    </div>
  );

  if (error || !student) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Arial,sans-serif" }}>
      <div style={{ color:"#c92a2a" }}>{error || "Student not found."}</div>
    </div>
  );

  const fullName = [student.last_name, student.first_name, student.middle_name].filter(Boolean).join(", ");
  const father   = guardians.find(g => g.relationship === "father");
  const mother   = guardians.find(g => g.relationship === "mother");
  const guardian = guardians.find(g => g.relationship === "guardian");

  const TH = (extra = {}) => ({
    background: PURPLE, color:"white", fontWeight:700, fontSize:8.5,
    padding:"5px 6px", border:BDR, textAlign:"center", verticalAlign:"middle",
    lineHeight:1.3, ...extra,
  });
  const TD = (extra = {}) => ({
    padding:"4px 6px", border:BDR, fontSize:9, verticalAlign:"middle", ...extra,
  });

  return (
    <>
      {/* Toolbar */}
      <div className="no-print" style={{ background:PURPLE, padding:"10px 20px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={() => window.close()}
          style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", border:"1px solid rgba(255,255,255,0.25)", borderRadius:6, background:"transparent", color:"rgba(255,255,255,0.75)", cursor:"pointer", fontSize:13, fontFamily:"Arial,sans-serif" }}>
          <i className="ti ti-arrow-left" style={{ fontSize:13 }} /> Close
        </button>
        <div style={{ flex:1, color:"rgba(255,255,255,0.6)", fontSize:13 }}>
          SF10 — {fullName}
        </div>
        <button onClick={() => window.print()}
          style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 18px", border:"none", borderRadius:6, background:"#e03131", color:"white", cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"Arial,sans-serif" }}>
          <i className="ti ti-printer" style={{ fontSize:14 }} /> Print
        </button>
        <button
          onClick={async () => {
            setDownloading(true);
            await downloadAsPDF("sf10-doc", `SF10-${student.lrn || studentId}.pdf`);
            setDownloading(false);
          }}
          disabled={downloading}
          style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 18px", border:"none", borderRadius:6, background:"white", color:PURPLE, cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"Arial,sans-serif", opacity:downloading ? 0.7 : 1 }}>
          <i className="ti ti-download" style={{ fontSize:14 }} />
          {downloading ? "Generating…" : "Download PDF"}
        </button>
      </div>

      {/* Document */}
      <div id="sf10-doc" style={{ maxWidth:820, margin:"24px auto 48px", background:"white", border:"1px solid #ccc", fontFamily:"Arial,sans-serif", padding:"24px 28px" }}>

        {/* DepEd Header */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10, paddingBottom:8, borderBottom:"2.5px solid #000" }}>
          <img src={logo} alt="Logo" style={{ width:48, height:64, objectFit:"contain" }} />
          <div style={{ flex:1, textAlign:"center" }}>
            <div style={{ fontSize:8, letterSpacing:"0.08em", textTransform:"uppercase", color:"#555" }}>
              Republic of the Philippines · Department of Education
            </div>
            <div style={{ fontSize:16, fontWeight:900, color:"#000", lineHeight:1.2 }}>{schoolName}</div>
            <div style={{ fontSize:12, fontWeight:800, color:PURPLE, marginTop:5, letterSpacing:"0.04em" }}>
              LEARNER'S PERMANENT ACADEMIC RECORD (SF10)
            </div>
          </div>
        </div>

        {/* ── Personal Information ── */}
        <SectionBar color={PURPLE}>LEARNER'S PERSONAL INFORMATION</SectionBar>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"5px 14px", padding:"8px 10px", border:"1px solid #aaa", background:LPURPLE, marginBottom:10 }}>
          <InfoCell label="LRN"           value={student.lrn} />
          <InfoCell label="Student No."   value={student.student_number} />
          <InfoCell label="Sex"           value={student.sex} />
          <InfoCell label="Last Name"     value={student.last_name} />
          <InfoCell label="First Name"    value={student.first_name} />
          <InfoCell label="Middle Name"   value={student.middle_name} />
          <InfoCell label="Date of Birth" value={fmtDate(student.birth_date)} />
          <InfoCell label="Religion"      value={student.religion} />
          <InfoCell label="Contact No."   value={student.mobile_number} />
          <InfoCell label="Address"       value={student.current_address} span={3} />
        </div>

        {/* ── Family Background ── */}
        <SectionBar color={PURPLE}>FAMILY BACKGROUND</SectionBar>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"5px 14px", padding:"8px 10px", border:"1px solid #aaa", background:LPURPLE, marginBottom:10 }}>
          <InfoCell label="Father's Name"   value={father?.full_name} />
          <InfoCell label="Occupation"      value={father?.occupation} />
          <InfoCell label="Contact No."     value={father?.mobile_number} />
          <InfoCell label="Mother's Name"   value={mother?.full_name} />
          <InfoCell label="Occupation"      value={mother?.occupation} />
          <InfoCell label="Contact No."     value={mother?.mobile_number} />
          <InfoCell label="Guardian's Name" value={guardian?.full_name} />
          <InfoCell label="Occupation"      value={guardian?.occupation} />
          <InfoCell label="Contact No."     value={guardian?.mobile_number} />
        </div>

        {/* ── Academic Record ── */}
        <SectionBar color={PURPLE}>ACADEMIC RECORD</SectionBar>

        {records.length === 0 ? (
          <div style={{ textAlign:"center", padding:"24px", color:"#888", fontSize:12, border:"1px solid #ccc", marginBottom:10 }}>
            No enrollment records found for this learner.
          </div>
        ) : (
          records.map(({ enr, subjects, gradeMap, pP, pA, cfg }, idx) => {
            const isAnnual = cfg.type === "annual";

            const rows = subjects.map(sub => {
              const sg      = gradeMap[sub.subject_id] ?? {};
              const pGrades = cfg.periods.map(p => sg[p] ?? null);
              const valid   = pGrades.filter(g => g != null);
              const final   = valid.length
                ? parseFloat((valid.reduce((a,b) => a+b, 0) / valid.length).toFixed(2))
                : null;
              return { sub, pGrades, final };
            });

            const allFinals = rows.map(r => r.final).filter(g => g != null);
            const gwa = allFinals.length
              ? parseFloat((allFinals.reduce((a,b) => a+b, 0) / allFinals.length).toFixed(2))
              : null;

            // colSpan for the GWA label = subject col + period cols + (final col if not annual)
            const gwaLabelSpan = 1 + cfg.cols.length + (isAnnual ? 0 : 1);
            const totalPresent = pP.reduce((a,b) => a+b, 0);
            const totalAbsent  = pA.reduce((a,b) => a+b, 0);

            return (
              <div key={enr.enrollment_id} style={{ marginBottom: idx < records.length - 1 ? 14 : 0 }}>

                {/* Enrollment header bar */}
                <div style={{ background:"#ede9fe", border:"1px solid #c4b5fd", borderRadius:"5px 5px 0 0", padding:"5px 10px", display:"flex", gap:18, flexWrap:"wrap", fontSize:9.5, fontWeight:700, color:"#4c1d95" }}>
                  <span>Grade Level: <strong>{enr.grade_level}</strong></span>
                  <span>School Year: <strong>{enr.school_year}</strong></span>
                  {enr.section  && <span>Section: <strong>{enr.section}</strong></span>}
                  {enr.strand   && <span>Strand: <strong>{enr.strand}</strong></span>}
                  {enr.semester && <span>Semester: <strong>{enr.semester === "1st" ? "1st Semester" : "2nd Semester"}</strong></span>}
                  <span>School: <strong>{schoolName}</strong></span>
                </div>

                {subjects.length === 0 ? (
                  <div style={{ border:"1px solid #ccc", borderTop:"none", padding:"10px", fontSize:10, color:"#888", textAlign:"center" }}>
                    No subjects on record for this enrollment.
                  </div>
                ) : (
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead>
                      <tr>
                        <th style={TH({ textAlign:"left", width:"36%" })}>Learning Area / Subject</th>
                        {cfg.cols.map(c => <th key={c} style={TH({ width: isAnnual ? "14%" : "9%" })}>{c}</th>)}
                        {!isAnnual && <th style={TH({ width:"10%" })}>Final</th>}
                        <th style={TH({ width:"12%" })}>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ sub, pGrades, final }, i) => {
                        const displayGrade = isAnnual ? pGrades[0] : final;
                        const passed = displayGrade != null ? displayGrade >= 75 : null;
                        return (
                          <tr key={sub.subject_id ?? i} style={{ background: i%2===0 ? "white" : LPURPLE }}>
                            <td style={TD({ textAlign:"left" })}>{sub.subject_name}</td>
                            {pGrades.map((g, pi) => (
                              <td key={pi} style={TD({ textAlign:"center", fontWeight:g!=null?700:400, color:g!=null?gradeColor(g):"#ccc" })}>
                                {g != null ? Math.round(g) : "—"}
                              </td>
                            ))}
                            {!isAnnual && (
                              <td style={TD({ textAlign:"center", fontWeight:800, color:final!=null?gradeColor(final):"#ccc" })}>
                                {final != null ? final.toFixed(2) : "—"}
                              </td>
                            )}
                            <td style={TD({ textAlign:"center" })}>
                              {passed === true ? "Passed" : passed === false ? "Failed" : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {/* GWA row */}
                      <tr style={{ background:"#ddd6fe" }}>
                        <td colSpan={gwaLabelSpan}
                          style={TD({ textAlign:"right", fontWeight:800, fontSize:9.5 })}>
                          General Weighted Average
                        </td>
                        <td style={TD({ textAlign:"center", fontWeight:900, fontSize:11, color:gwa!=null?gradeColor(gwa):"#aaa" })}>
                          {gwa != null ? gwa.toFixed(2) : "—"}
                        </td>
                        <td style={TD({ textAlign:"center", fontWeight:700, fontSize:9 })}>
                          {promotionRemark(enr, gwa)}
                        </td>
                      </tr>
                      {/* Attendance row */}
                      <tr style={{ background:"#ede9fe" }}>
                        <td style={TD({ textAlign:"right", fontWeight:700, fontSize:9 })}>Attendance</td>
                        {pP.map((p, ci) => (
                          <td key={ci} style={TD({ textAlign:"center", fontSize:8, lineHeight:1.6 })}>
                            <div><strong>P:</strong> {p}</div>
                            <div><strong>A:</strong> {pA[ci]}</div>
                          </td>
                        ))}
                        {!isAnnual && (
                          <td style={TD({ textAlign:"center", fontSize:8, lineHeight:1.6 })}>
                            <div><strong>P:</strong> {totalPresent}</div>
                            <div><strong>A:</strong> {totalAbsent}</div>
                          </td>
                        )}
                        <td style={TD({ textAlign:"center", fontSize:8, color:"#555" })}>
                          Total: {totalPresent + totalAbsent} days
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            );
          })
        )}

        {/* ── Signatures ── */}
        <div style={{ marginTop:20, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:20 }}>
          <SigLine topLabel="Prepared by:" name="Class Adviser" sub="Signature over Printed Name / Date" />
          <SigLine topLabel="Certified by:" name="Registrar" sub="Signature over Printed Name / Date" />
          <SigLine topLabel="Noted by:" name="School Head / Principal" sub="Signature over Printed Name / Date" />
        </div>

        <div style={{ textAlign:"center", fontSize:8, color:"#888", marginTop:12 }}>
          Generated: {new Date().toLocaleDateString("en-PH", { month:"long", day:"numeric", year:"numeric" })}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          #sf10-doc {
            max-width: 100% !important; margin: 0 !important;
            border: none !important; padding: 10mm 12mm !important;
          }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </>
  );
}

function SectionBar({ children, color }) {
  return (
    <div style={{ background:color, color:"white", fontSize:9.5, fontWeight:800, padding:"4px 10px", marginBottom:4, letterSpacing:"0.06em", textTransform:"uppercase" }}>
      {children}
    </div>
  );
}

function InfoCell({ label, value, span }) {
  return (
    <div style={span ? { gridColumn:`1 / ${span + 1}` } : {}}>
      <div style={{ fontSize:8, color:"#555", textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700, marginBottom:1 }}>
        {label}
      </div>
      <div style={{ fontSize:11, fontWeight:700, color:"#000", borderBottom:"1px solid #bbb", paddingBottom:1, minHeight:14 }}>
        {value || "—"}
      </div>
    </div>
  );
}

function SigLine({ topLabel, name, sub }) {
  return (
    <div style={{ textAlign:"center" }}>
      <div style={{ fontSize:9, color:"#555", marginBottom:28, textAlign:"left" }}>{topLabel}</div>
      <div style={{ borderTop:"1px solid #000", marginBottom:3 }} />
      <div style={{ fontSize:10, fontWeight:700 }}>{name}</div>
      <div style={{ fontSize:9, color:"#777" }}>{sub}</div>
    </div>
  );
}