import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getEnrollment, getSubjects, getGrades } from "../../api/enrollmentApi";
import { getStudent } from "../../api/studentApi";
import { getAttendance } from "../../api/attendanceApi";
import { getSchoolSettings } from "../../api/billingApi";
import logo from "../../assets/logo.png";

const BLUE  = "#003087";
const LBLUE = "#e8f0fb";
const BDR   = "1px solid #888";

const LEVEL_CONFIG = {
  Nursery:      { type: "annual",    periods: ["annual"],                                                 cols: ["Annual Grade"] },
  Kindergarten: { type: "annual",    periods: ["annual"],                                                 cols: ["Annual Grade"] },
  Elementary:   { type: "quarterly", periods: ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"],  cols: ["Q1","Q2","Q3","Q4"] },
  JHS:          { type: "quarterly", periods: ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"],  cols: ["Q1","Q2","Q3","Q4"] },
  SHS:          { type: "semester",  periods: ["1st_semester","2nd_semester"],                            cols: ["Sem 1","Sem 2"] },
};

// Philippine school calendar quarter index (0-based)
function attIndex(dateStr, type) {
  const m = new Date(dateStr).getMonth() + 1;
  if (type === "quarterly") {
    if ([8,9,10].includes(m))  return 0;
    if ([11,12,1].includes(m)) return 1;
    if ([2,3].includes(m))     return 2;
    return 3;
  }
  if (type === "semester") {
    return [8,9,10,11,12,1].includes(m) ? 0 : 1;
  }
  return 0;
}

function gradeColor(g) {
  if (g >= 90) return "#1a6b0d";
  if (g >= 75) return "#1455a0";
  return "#c92a2a";
}

function nextGrade(grade) {
  if (!grade) return "___";
  if (/nursery/i.test(grade))      return "Kindergarten";
  if (/kindergarten/i.test(grade)) return "Grade 1";
  const m = grade.match(/(\d+)/);
  if (!m) return "___";
  return grade.replace(m[1], String(parseInt(m[1]) + 1));
}

export default function SF9PrintPage() {
  const { enrollmentId } = useParams();
  const [enrollment, setEnrollment] = useState(null);
  const [student,    setStudent]    = useState(null);
  const [subjects,   setSubjects]   = useState([]);
  const [gradeMap,   setGradeMap]   = useState({});
  const [attRecs,    setAttRecs]    = useState([]);
  const [schoolName, setSchoolName] = useState("South Lakes Integrated School");
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const enr = await getEnrollment(enrollmentId);
        setEnrollment(enr);
        const studentId = enr.student_detail?.student_id ?? enr.student;

        const [stu, subs, allGrades, recs, settings] = await Promise.all([
          getStudent(studentId),
          getSubjects({
            school_level: enr.school_level,
            ...(enr.strand   ? { strand:   enr.strand   } : {}),
            ...(enr.semester ? { semester: enr.semester } : {}),
          }),
          getGrades({ enrollment: enrollmentId }),
          getAttendance({ enrollment: enrollmentId, page_size: 500 }).catch(() => []),
          getSchoolSettings().catch(() => null),
        ]);

        setStudent(stu);
        setSubjects(Array.isArray(subs) ? subs : subs.results ?? []);

        const grades = Array.isArray(allGrades) ? allGrades : allGrades.results ?? [];
        const gm = {};
        grades.forEach(g => {
          const key = g.subject ?? g.subject_id;
          if (!gm[key]) gm[key] = {};
          if (g.grade != null) gm[key][g.grading_period] = parseFloat(g.grade);
        });
        setGradeMap(gm);

        setAttRecs(Array.isArray(recs) ? recs : recs.results ?? []);
        if (settings?.school_name) setSchoolName(settings.school_name);
      } catch (e) {
        setError(e.message || "Failed to load data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [enrollmentId]);

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Arial,sans-serif", color:"#666" }}>
      Loading SF9…
    </div>
  );

  if (error || !enrollment || !student) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Arial,sans-serif" }}>
      <div style={{ color:"#c92a2a" }}>{error || "Enrollment not found."}</div>
    </div>
  );

  const cfg      = LEVEL_CONFIG[enrollment.school_level] ?? LEVEL_CONFIG.Elementary;
  const isAnnual = cfg.type === "annual";
  const fullName = [student.last_name, student.first_name, student.middle_name].filter(Boolean).join(", ");

  // ── Build subject rows ────────────────────────────────────────────────────────
  const rows = subjects.map(sub => {
    const sg      = gradeMap[sub.subject_id] ?? {};
    const pGrades = cfg.periods.map(p => sg[p] ?? null);
    const valid   = pGrades.filter(g => g != null);
    const final   = valid.length
      ? parseFloat((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2))
      : null;
    return { sub, pGrades, final };
  });

  const allFinals = rows.map(r => r.final).filter(g => g != null);
  const gwa = allFinals.length
    ? parseFloat((allFinals.reduce((a, b) => a + b, 0) / allFinals.length).toFixed(2))
    : null;

  // ── Build attendance table ────────────────────────────────────────────────────
  const n  = cfg.periods.length;
  const pP = Array(n).fill(0);
  const pA = Array(n).fill(0);
  attRecs.forEach(rec => {
    const i = attIndex(rec.date, cfg.type);
    if (i >= 0 && i < n) {
      if (rec.status === "P" || rec.status === "L") pP[i]++;
      else pA[i]++;
    }
  });

  // ── Shared cell styles ────────────────────────────────────────────────────────
  const TH = (extra = {}) => ({
    background: BLUE, color: "white", fontWeight: 700,
    padding: "7px 6px", border: BDR, fontSize: 10, ...extra,
  });
  const TD = (extra = {}) => ({
    padding: "5px 7px", border: BDR, fontSize: 10, ...extra,
  });

  return (
    <>
      {/* Toolbar */}
      <div className="no-print" style={{ background: BLUE, padding: "10px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={() => window.close()}
          style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", border:"1px solid rgba(255,255,255,0.25)", borderRadius:6, background:"transparent", color:"rgba(255,255,255,0.75)", cursor:"pointer", fontSize:13, fontFamily:"Arial,sans-serif" }}>
          <i className="ti ti-arrow-left" style={{ fontSize:13 }} /> Close
        </button>
        <div style={{ flex:1, color:"rgba(255,255,255,0.6)", fontSize:13 }}>
          SF9 — {fullName} · SY {enrollment.school_year}
        </div>
        <button onClick={() => window.print()}
          style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 18px", border:"none", borderRadius:6, background:"#e03131", color:"white", cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"Arial,sans-serif" }}>
          <i className="ti ti-printer" style={{ fontSize:14 }} />
          Print
        </button>
      </div>

      {/* SF9 Document */}
      <div id="sf9-doc" style={{ maxWidth:720, margin:"28px auto 48px", background:"white", border:"1px solid #ccc", fontFamily:"Arial, sans-serif", padding:"28px 32px" }}>

        {/* DepEd Header */}
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:12, paddingBottom:10, borderBottom:"2.5px solid #000" }}>
          <img src={logo} alt="Logo" style={{ width:54, height:72, objectFit:"contain" }} />
          <div style={{ flex:1, textAlign:"center" }}>
            <div style={{ fontSize:9, letterSpacing:"0.08em", textTransform:"uppercase", color:"#555", marginBottom:1 }}>
              Republic of the Philippines · Department of Education
            </div>
            <div style={{ fontSize:18, fontWeight:900, color:"#000", lineHeight:1.2 }}>{schoolName}</div>
            <div style={{ fontSize:13, fontWeight:800, color: BLUE, marginTop:6, letterSpacing:"0.05em" }}>
              LEARNER'S PROGRESS REPORT CARD (SF9)
            </div>
            <div style={{ fontSize:10, color:"#444", marginTop:1 }}>School Year {enrollment.school_year}</div>
          </div>
        </div>

        {/* Learner Info */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"5px 16px", padding:"9px 12px", border:"1px solid #aaa", background: LBLUE, marginBottom:12 }}>
          <InfoCell label="Learner's Name"  value={fullName}                span={3} />
          <InfoCell label="LRN"             value={student.lrn} />
          <InfoCell label="Grade Level"     value={enrollment.grade_level} />
          <InfoCell label="Section"         value={enrollment.section} />
          {enrollment.strand && <InfoCell label="Track / Strand" value={enrollment.strand} />}
          <InfoCell label="Sex"             value={student.sex} />
          <InfoCell label="Date of Birth"   value={student.birth_date
            ? new Date(student.birth_date).toLocaleDateString("en-PH", { month:"long", day:"numeric", year:"numeric" })
            : "—"} />
          <InfoCell label="School Year"     value={enrollment.school_year} />
        </div>

        {/* ── Academic Performance ──────────────────────────────────────────── */}
        <BarTitle>ACADEMIC PERFORMANCE</BarTitle>
        <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:12 }}>
          <thead>
            <tr>
              <th style={TH({ textAlign:"left", width:"38%" })}>Learning Areas</th>
              {cfg.cols.map(c => <th key={c} style={TH({ textAlign:"center" })}>{c}</th>)}
              {!isAnnual && <th style={TH({ textAlign:"center" })}>Final Grade</th>}
              <th style={TH({ textAlign:"center" })}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sub, pGrades, final }, i) => {
              const displayGrade = isAnnual ? pGrades[0] : final;
              const passed = displayGrade != null ? displayGrade >= 75 : null;
              return (
                <tr key={sub.subject_id ?? i} style={{ background: i % 2 === 0 ? "white" : LBLUE }}>
                  <td style={TD()}>{sub.subject_name}</td>
                  {pGrades.map((g, pi) => (
                    <td key={pi} style={TD({ textAlign:"center", fontWeight: g != null ? 700 : 400, color: g != null ? gradeColor(g) : "#bbb" })}>
                      {g != null ? Math.round(g) : "—"}
                    </td>
                  ))}
                  {!isAnnual && (
                    <td style={TD({ textAlign:"center", fontWeight:800, fontSize:11, color: final != null ? gradeColor(final) : "#bbb" })}>
                      {final != null ? final.toFixed(2) : "—"}
                    </td>
                  )}
                  <td style={TD({ textAlign:"center", fontSize:10 })}>
                    {passed === true ? "Passed" : passed === false ? "Failed" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background:"#d0e4ff" }}>
              <td colSpan={cfg.cols.length + (isAnnual ? 1 : 2)}
                style={TD({ textAlign:"right", fontWeight:800, fontSize:11 })}>
                General Average (GWA)
              </td>
              <td style={TD({ textAlign:"center", fontWeight:900, fontSize:13, color: gwa != null ? gradeColor(gwa) : "#aaa" })}>
                {gwa != null ? gwa.toFixed(2) : "—"}
              </td>
              <td style={TD({ textAlign:"center", fontWeight:700 })}>
                {gwa != null ? (gwa >= 75 ? "Passed" : "Failed") : ""}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* ── Attendance ────────────────────────────────────────────────────── */}
        <BarTitle>ATTENDANCE</BarTitle>
        <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:12 }}>
          <thead>
            <tr>
              <th style={TH({ textAlign:"left", width:"28%" })}></th>
              {cfg.cols.map(c => <th key={c} style={TH({ textAlign:"center" })}>{c}</th>)}
              <th style={TH({ textAlign:"center" })}>Total</th>
            </tr>
          </thead>
          <tbody>
            {[{ label:"Days Present", data: pP }, { label:"Days Absent", data: pA }].map(({ label, data }, ri) => (
              <tr key={ri} style={{ background: ri === 0 ? "white" : LBLUE }}>
                <td style={TD({ fontWeight:600 })}>{label}</td>
                {data.map((v, i) => (
                  <td key={i} style={TD({ textAlign:"center", fontWeight: v > 0 ? 700 : 400, color: v === 0 ? "#aaa" : "#000" })}>
                    {v}
                  </td>
                ))}
                <td style={TD({ textAlign:"center", fontWeight:800 })}>
                  {data.reduce((a, b) => a + b, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Remarks ───────────────────────────────────────────────────────── */}
        <BarTitle>REMARKS</BarTitle>
        <div style={{ border:"1px solid #aaa", padding:"10px 14px", marginBottom:16, background: LBLUE }}>
          <div style={{ display:"flex", gap:20, flexWrap:"wrap", fontSize:11 }}>
            {[
              `Promoted to ${nextGrade(enrollment.grade_level)}`,
              `Retained in ${enrollment.grade_level}`,
              "Transferred",
              "Dropped",
              "Completed Program",
            ].map(r => (
              <span key={r} style={{ display:"flex", alignItems:"center", gap:5 }}>
                <span style={{ display:"inline-block", width:13, height:13, border:"1px solid #555", borderRadius:2, background:"white", flexShrink:0 }} />
                {r}
              </span>
            ))}
          </div>
        </div>

        {/* ── Signatures ────────────────────────────────────────────────────── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:20, marginTop:8 }}>
          <SigLine topLabel="Prepared by:" name="Class Adviser" sub="Signature over Printed Name / Date" />
          <SigLine topLabel="Noted by:"    name="School Head / Principal" sub="Signature over Printed Name / Date" />
          <SigLine topLabel="Received by:" name="Parent / Guardian" sub="Signature over Printed Name / Date" />
        </div>

        <div style={{ textAlign:"center", fontSize:9, color:"#888", marginTop:14 }}>
          Generated: {new Date().toLocaleDateString("en-PH", { month:"long", day:"numeric", year:"numeric" })}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          #sf9-doc {
            max-width: 100% !important;
            margin: 0 !important;
            border: none !important;
            padding: 10mm 14mm !important;
          }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoCell({ label, value, span }) {
  return (
    <div style={span ? { gridColumn:`1 / ${span + 1}` } : {}}>
      <div style={{ fontSize:9, color:"#555", textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700, marginBottom:1 }}>
        {label}
      </div>
      <div style={{ fontSize:12, fontWeight:700, color:"#000", borderBottom:"1px solid #999", paddingBottom:1, minHeight:16 }}>
        {value || "—"}
      </div>
    </div>
  );
}

function BarTitle({ children }) {
  return (
    <div style={{ background: BLUE, color:"white", fontSize:10, fontWeight:800, padding:"5px 10px", marginBottom:4, letterSpacing:"0.06em", textTransform:"uppercase" }}>
      {children}
    </div>
  );
}

function SigLine({ topLabel, name, sub }) {
  return (
    <div style={{ textAlign:"center" }}>
      <div style={{ fontSize:9, color:"#555", marginBottom:30, textAlign:"left" }}>{topLabel}</div>
      <div style={{ borderTop:"1px solid #000", marginBottom:3 }} />
      <div style={{ fontSize:10, fontWeight:700 }}>{name}</div>
      <div style={{ fontSize:9, color:"#777" }}>{sub}</div>
    </div>
  );
}