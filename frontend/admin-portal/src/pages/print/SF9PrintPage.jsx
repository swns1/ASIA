import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  getEnrollment,
  getSubjects,
  getGrades,
  getNarrativeCategories,
  getNarrativeReports,
} from "../../api/enrollmentApi";
import { getStudent } from "../../api/studentApi";
import { getAttendance } from "../../api/attendanceApi";
import { getSchoolSettings } from "../../api/billingApi";
import { downloadAsPDF } from "../../utils/pdfExport";
import { levelConfig, attIndex, gradeColor, GRADE_ORDER } from "../../utils/grading";
import { PRINT_COLORS as C } from "../../components/print/theme";
import { PrintToolbar, ToolbarButton } from "../../components/print/PrintToolbar";
import { PrintShell, PrintLoading, PrintError } from "../../components/print/PrintShell";
import { PrintLetterhead } from "../../components/print/PrintLetterhead";
import { InfoGrid, InfoItem } from "../../components/print/InfoGrid";
import { SignatureRow, SignatureBlock, GeneratedStamp } from "../../components/print/SignatureBlock";
import { SectionBar } from "../../components/print/SectionBar";

export default function SF9PrintPage() {
  const { enrollmentId } = useParams();
  const [searchParams]   = useSearchParams();
  const region   = searchParams.get("region")   || "";
  const division = searchParams.get("division") || "";
  const district = searchParams.get("district") || "";

  const [enrollment,     setEnrollment]     = useState(null);
  const [student,        setStudent]        = useState(null);
  const [subjects,       setSubjects]       = useState([]);
  const [gradeMap,       setGradeMap]       = useState({});
  const [attRecs,        setAttRecs]        = useState([]);
  const [observedValues, setObservedValues] = useState([]);
  const [schoolName,     setSchoolName]     = useState("South Lakes Integrated School");
  const [schoolAddress,  setSchoolAddress]  = useState("");
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [downloading,    setDownloading]    = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const enr = await getEnrollment(enrollmentId);
        setEnrollment(enr);
        const studentId = enr.student_detail?.student_id ?? enr.student;

        const [stu, subs, allGrades, recs, settings, valueCats, valueReports] = await Promise.all([
          getStudent(studentId),
          getSubjects({
            school_level: enr.school_level,
            ...(enr.strand   ? { strand:   enr.strand   } : {}),
            ...(enr.semester ? { semester: enr.semester } : {}),
          }),
          getGrades({ enrollment: enrollmentId }),
          getAttendance({ enrollment: enrollmentId, page_size: 500 }).catch(() => []),
          getSchoolSettings().catch(() => null),
          getNarrativeCategories({ is_active: true }).catch(() => []),
          getNarrativeReports({ enrollment: enrollmentId }).catch(() => []),
        ]);

        setStudent(stu);
        setSubjects(Array.isArray(subs) ? subs : subs.results ?? []);

        const grades = Array.isArray(allGrades) ? allGrades : allGrades.results ?? [];
        const gm = {};
        // GradeSerializer emits `numeric_grade` — reading `g.grade` here left
        // every subject, quarter, remark and the general average printing "—"
        // on an otherwise complete report card.
        grades.forEach(g => {
          const key = g.subject ?? g.subject_id;
          if (!gm[key]) gm[key] = {};
          if (g.numeric_grade != null) gm[key][g.grading_period] = parseFloat(g.numeric_grade);
        });
        setGradeMap(gm);

        setAttRecs(Array.isArray(recs) ? recs : recs.results ?? []);

        // Report on Learner's Observed Values (DepEd Order 8, s.2015). SF9
        // never fetched these, so the mandated half of the report card was
        // simply absent from the printed form.
        const cats    = Array.isArray(valueCats) ? valueCats : valueCats.results ?? [];
        const reports = Array.isArray(valueReports) ? valueReports : valueReports.results ?? [];
        const byCategory = {};
        reports.forEach(r => {
          const key = r.category ?? r.category_id;
          if (!byCategory[key]) byCategory[key] = {};
          byCategory[key][r.grading_period] = r.rating;
        });
        setObservedValues(
          cats
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map(c => ({
              id:     c.category_id,
              name:   c.name,
              marks:  byCategory[c.category_id] ?? {},
            })),
        );
        if (settings?.school_name) setSchoolName(settings.school_name);
        if (settings?.school_address) setSchoolAddress(settings.school_address);
      } catch (e) {
        setError(e.message || "Failed to load data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [enrollmentId]);

  const handleDownload = async () => {
    setDownloading(true);
    await downloadAsPDF("sf9-doc", `SF9-${enrollmentId}.pdf`);
    setDownloading(false);
  };

  if (loading) return <PrintLoading label="Loading SF9…" />;
  if (error || !enrollment || !student) return <PrintError message={error || "Enrollment not found."} />;

  const cfg      = levelConfig(enrollment.school_level);
  const isAnnual = cfg.type === "annual";
  const fullName = [student.last_name, student.first_name, student.middle_name].filter(Boolean).join(", ");

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

  const gradeIdx  = GRADE_ORDER.indexOf(enrollment.grade_level);
  const nextGrade = gradeIdx >= 0 && gradeIdx < GRADE_ORDER.length - 1 ? GRADE_ORDER[gradeIdx + 1] : null;
  const isCompleted = enrollment.enrollment_status === "completed";
  const remarkChecks = {
    promoted:    isCompleted && gwa != null && gwa >= 75 && nextGrade != null,
    retained:    isCompleted && gwa != null && gwa < 75,
    transferred: enrollment.enrollment_status === "transferred_out",
    dropped:     enrollment.enrollment_status === "cancelled",
    completed:   isCompleted && gwa != null && gwa >= 75 && nextGrade == null,
  };
  const remarkOptions = [
    { key: "promoted",    label: `Promoted to ${nextGrade || "___"}` },
    { key: "retained",    label: `Retained in ${enrollment.grade_level}` },
    { key: "transferred", label: "Transferred" },
    { key: "dropped",     label: "Dropped" },
    { key: "completed",   label: "Completed Program" },
  ];

  const TH = (extra = {}) => ({
    background: C.dark, color: "white", fontWeight: 700,
    padding: "7px 6px", border: `1px solid ${C.border}`, fontSize: 10, ...extra,
  });
  const TD = (extra = {}) => ({
    padding: "5px 7px", border: `1px solid ${C.border}`, fontSize: 10, ...extra,
  });

  return (
    <>
      <PrintToolbar
        onBack={() => window.close()}
        title={`SF9 — ${fullName} · SY ${enrollment.school_year}`}
        actions={
          <>
            <ToolbarButton onClick={handleDownload} disabled={downloading} icon="download">
              {downloading ? "Generating…" : "Download PDF"}
            </ToolbarButton>
            <ToolbarButton onClick={() => window.print()} primary icon="printer">Print</ToolbarButton>
          </>
        }
      />

      <PrintShell id="sf9-doc" maxWidth={720} orientation="portrait">
        <PrintLetterhead
          variant="deped"
          schoolName={schoolName}
          schoolAddress={schoolAddress}
          region={region}
          division={division}
          district={district}
          formCode="SF 9"
          title="Learner's Progress Report Card"
          subtitle={`School Year ${enrollment.school_year}`}
        />

        <InfoGrid columns={3} bordered>
          <InfoItem bordered label="Learner's Name"  value={fullName}                span={3} />
          <InfoItem bordered label="LRN"             value={student.lrn} />
          <InfoItem bordered label="Grade Level"     value={enrollment.grade_level} />
          <InfoItem bordered label="Section"         value={enrollment.section} />
          {enrollment.strand && <InfoItem bordered label="Track / Strand" value={enrollment.strand} />}
          <InfoItem bordered label="Sex"             value={student.sex} />
          <InfoItem bordered label="Date of Birth"   value={student.birth_date
            ? new Date(student.birth_date).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })
            : "—"} />
          <InfoItem bordered label="School Year"     value={enrollment.school_year} />
        </InfoGrid>

        <SectionBar>Academic Performance</SectionBar>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={TH({ textAlign: "left", width: "38%" })}>Learning Areas</th>
              {cfg.cols.map(c => <th key={c} style={TH({ textAlign: "center" })}>{c}</th>)}
              {!isAnnual && <th style={TH({ textAlign: "center" })}>Final Grade</th>}
              <th style={TH({ textAlign: "center" })}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sub, pGrades, final }, i) => {
              const displayGrade = isAnnual ? pGrades[0] : final;
              const passed = displayGrade != null ? displayGrade >= 75 : null;
              return (
                <tr key={sub.subject_id ?? i} style={{ background: i % 2 === 0 ? "white" : C.bg }}>
                  <td style={TD()}>{sub.subject_name}</td>
                  {pGrades.map((g, pi) => (
                    <td key={pi} style={TD({ textAlign: "center", fontWeight: g != null ? 700 : 400, color: g != null ? gradeColor(g) : "#bbb" })}>
                      {g != null ? Math.round(g) : "—"}
                    </td>
                  ))}
                  {!isAnnual && (
                    <td style={TD({ textAlign: "center", fontWeight: 800, fontSize: 11, color: final != null ? gradeColor(final) : "#bbb" })}>
                      {final != null ? final.toFixed(2) : "—"}
                    </td>
                  )}
                  <td style={TD({ textAlign: "center", fontSize: 10 })}>
                    {passed === true ? "Passed" : passed === false ? "Failed" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: C.redBg }}>
              <td colSpan={cfg.cols.length + (isAnnual ? 0 : 1)}
                style={TD({ textAlign: "right", fontWeight: 800, fontSize: 11 })}>
                General Average
              </td>
              <td style={TD({ textAlign: "center", fontWeight: 900, fontSize: 13, color: gwa != null ? gradeColor(gwa) : "#aaa" })}>
                {gwa != null ? Math.round(gwa) : "—"}
              </td>
              <td style={TD({ textAlign: "center", fontWeight: 700 })}>
                {gwa != null ? (gwa >= 75 ? "Passed" : "Failed") : ""}
              </td>
            </tr>
          </tfoot>
        </table>

        <SectionBar>Attendance</SectionBar>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={TH({ textAlign: "left", width: "28%" })}></th>
              {cfg.cols.map(c => <th key={c} style={TH({ textAlign: "center" })}>{c}</th>)}
              <th style={TH({ textAlign: "center" })}>Total</th>
            </tr>
          </thead>
          <tbody>
            {[{ label: "Days Present", data: pP }, { label: "Days Absent", data: pA }].map(({ label, data }, ri) => (
              <tr key={ri} style={{ background: ri === 0 ? "white" : C.bg }}>
                <td style={TD({ fontWeight: 600 })}>{label}</td>
                {data.map((v, i) => (
                  <td key={i} style={TD({ textAlign: "center", fontWeight: v > 0 ? 700 : 400, color: v === 0 ? "#aaa" : C.dark })}>
                    {v}
                  </td>
                ))}
                <td style={TD({ textAlign: "center", fontWeight: 800 })}>
                  {data.reduce((a, b) => a + b, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Report on Learner's Observed Values — DepEd Order No. 8, s. 2015.
            Marked AO / SO / RO / NO, one column per grading period. */}
        <SectionBar>Report on Learner&apos;s Observed Values</SectionBar>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6 }}>
          <thead>
            <tr>
              <th style={TH({ textAlign: "left", width: "40%" })}>Core Values</th>
              {cfg.cols.map(c => <th key={c} style={TH({ textAlign: "center" })}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {observedValues.length === 0 ? (
              <tr>
                <td colSpan={cfg.cols.length + 1} style={TD({ textAlign: "center", color: "#aaa" })}>
                  No observed values recorded for this enrolment.
                </td>
              </tr>
            ) : observedValues.map((v, ri) => (
              <tr key={v.id} style={{ background: ri % 2 === 0 ? "white" : C.bg }}>
                <td style={TD({ fontWeight: 600 })}>{v.name}</td>
                {cfg.periods.map((p, i) => (
                  <td key={i} style={TD({ textAlign: "center", fontWeight: 700 })}>
                    {v.marks[p] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 9, color: C.muted, marginBottom: 12 }}>
          <b>Marking:</b> AO — Always Observed &nbsp;·&nbsp; SO — Sometimes Observed
          &nbsp;·&nbsp; RO — Rarely Observed &nbsp;·&nbsp; NO — Not Observed
        </div>

        {/* The descriptor table is mandated on the report card itself; it used
            to live only as a legend on the admin Grades page. */}
        <SectionBar>Learner Progress and Achievement</SectionBar>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={TH({ textAlign: "left" })}>Descriptor</th>
              <th style={TH({ textAlign: "center" })}>Grading Scale</th>
              <th style={TH({ textAlign: "center" })}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Outstanding",               "90 – 100",   "Passed"],
              ["Very Satisfactory",         "85 – 89",    "Passed"],
              ["Satisfactory",              "80 – 84",    "Passed"],
              ["Fairly Satisfactory",       "75 – 79",    "Passed"],
              ["Did Not Meet Expectations", "Below 75",   "Failed"],
            ].map(([label, scale, remark], ri) => (
              <tr key={label} style={{ background: ri % 2 === 0 ? "white" : C.bg }}>
                <td style={TD({ fontWeight: 600 })}>{label}</td>
                <td style={TD({ textAlign: "center" })}>{scale}</td>
                <td style={TD({ textAlign: "center" })}>{remark}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <SectionBar>Remarks</SectionBar>
        <div style={{ border: `1px solid ${C.border}`, padding: "10px 14px", marginBottom: 16, background: C.bg }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 11 }}>
            {remarkOptions.map(({ key, label }) => (
              <span key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 13, height: 13, border: `1px solid ${C.muted}`, borderRadius: 2,
                  background: remarkChecks[key] ? C.dark : "white", color: "white", fontSize: 10, flexShrink: 0,
                }}>
                  {remarkChecks[key] ? "✓" : ""}
                </span>
                {label}
              </span>
            ))}
          </div>
        </div>

        <SignatureRow>
          <SignatureBlock heading="Prepared by:" role="Class Adviser" caption="Signature over Printed Name / Date" />
          <SignatureBlock heading="Noted by:"    role="School Head / Principal" caption="Signature over Printed Name / Date" />
          <SignatureBlock heading="Received by:" role="Parent / Guardian" caption="Signature over Printed Name / Date" />
        </SignatureRow>
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <GeneratedStamp />
        </div>
      </PrintShell>
    </>
  );
}
