import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getEnrollments, getSubjects, getGrades } from "../../api/enrollmentApi";
import { getStudent } from "../../api/studentApi";
import { getGuardiansByStudent } from "../../api/guardianApi";
import { getAttendance } from "../../api/attendanceApi";
import { getSchoolSettings } from "../../api/billingApi";
import { downloadAsPDF } from "../../utils/pdfExport";
import { levelConfig, attIndex, gradeColor, GRADE_ORDER, promotionRemark } from "../../utils/grading";
import { PRINT_COLORS as C } from "../../components/print/theme";
import { PrintToolbar, ToolbarButton } from "../../components/print/PrintToolbar";
import { PrintShell, PrintLoading, PrintError } from "../../components/print/PrintShell";
import { PrintLetterhead } from "../../components/print/PrintLetterhead";
import { InfoGrid, InfoItem } from "../../components/print/InfoGrid";
import { SignatureRow, SignatureBlock, GeneratedStamp } from "../../components/print/SignatureBlock";
import { SectionBar } from "../../components/print/SectionBar";

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) : "—";
}

export default function SF10PrintPage() {
  const { studentId }    = useParams();
  const [searchParams]   = useSearchParams();
  const region   = searchParams.get("region")   || "";
  const division = searchParams.get("division") || "";
  const district = searchParams.get("district") || "";

  const [student,        setStudent]        = useState(null);
  const [guardians,      setGuardians]      = useState([]);
  const [records,        setRecords]        = useState([]);
  const [schoolName,     setSchoolName]     = useState("South Lakes Integrated School");
  const [schoolAddress,  setSchoolAddress]  = useState("");
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [downloading,    setDownloading]    = useState(false);

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
        if (settings?.school_address) setSchoolAddress(settings.school_address);

        const enrollments = (Array.isArray(enrData) ? enrData : enrData.results ?? [])
          .sort((a, b) => {
            const gi = GRADE_ORDER.indexOf(a.grade_level) - GRADE_ORDER.indexOf(b.grade_level);
            if (gi !== 0) return gi;
            return (a.school_year || "").localeCompare(b.school_year || "");
          });

        const built = await Promise.all(
          enrollments.map(async (enr) => {
            const cfg = levelConfig(enr.school_level);
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

  const handleDownload = async () => {
    setDownloading(true);
    await downloadAsPDF("sf10-doc", `SF10-${student?.lrn || studentId}.pdf`);
    setDownloading(false);
  };

  if (loading) return <PrintLoading label="Loading SF10…" />;
  if (error || !student) return <PrintError message={error || "Student not found."} />;

  const fullName = [student.last_name, student.first_name, student.middle_name].filter(Boolean).join(", ");
  const father   = guardians.find(g => g.relationship === "father");
  const mother   = guardians.find(g => g.relationship === "mother");
  const guardian = guardians.find(g => g.relationship === "guardian");

  const TH = (extra = {}) => ({
    background: C.dark, color: "white", fontWeight: 700, fontSize: 8.5,
    padding: "5px 6px", border: `1px solid ${C.border}`, textAlign: "center", verticalAlign: "middle",
    lineHeight: 1.3, ...extra,
  });
  const TD = (extra = {}) => ({
    padding: "4px 6px", border: `1px solid ${C.border}`, fontSize: 9, verticalAlign: "middle", ...extra,
  });

  return (
    <>
      <PrintToolbar
        onBack={() => window.close()}
        title={`SF10 — ${fullName}`}
        actions={
          <>
            <ToolbarButton onClick={handleDownload} disabled={downloading} icon="download">
              {downloading ? "Generating…" : "Download PDF"}
            </ToolbarButton>
            <ToolbarButton onClick={() => window.print()} primary icon="printer">Print</ToolbarButton>
          </>
        }
      />

      <PrintShell id="sf10-doc" maxWidth={820} orientation="portrait">
        <PrintLetterhead
          variant="deped"
          schoolName={schoolName}
          schoolAddress={schoolAddress}
          region={region}
          division={division}
          district={district}
          formCode="SF 10"
          title="Learner's Permanent Academic Record"
        />

        <SectionBar>Learner's Personal Information</SectionBar>
        <InfoGrid columns={3} bordered>
          <InfoItem bordered label="LRN"           value={student.lrn} />
          <InfoItem bordered label="Student No."   value={student.student_number} />
          <InfoItem bordered label="Sex"           value={student.sex} />
          <InfoItem bordered label="Last Name"     value={student.last_name} />
          <InfoItem bordered label="First Name"    value={student.first_name} />
          <InfoItem bordered label="Middle Name"   value={student.middle_name} />
          <InfoItem bordered label="Date of Birth" value={fmtDate(student.birth_date)} />
          <InfoItem bordered label="Religion"      value={student.religion} />
          <InfoItem bordered label="Contact No."   value={student.mobile_number} />
          <InfoItem bordered label="Address"       value={student.current_address} span={3} />
        </InfoGrid>

        <SectionBar>Family Background</SectionBar>
        <InfoGrid columns={3} bordered>
          <InfoItem bordered label="Father's Name"   value={father?.full_name} />
          <InfoItem bordered label="Occupation"      value={father?.occupation} />
          <InfoItem bordered label="Contact No."     value={father?.mobile_number} />
          <InfoItem bordered label="Mother's Name"   value={mother?.full_name} />
          <InfoItem bordered label="Occupation"      value={mother?.occupation} />
          <InfoItem bordered label="Contact No."     value={mother?.mobile_number} />
          <InfoItem bordered label="Guardian's Name" value={guardian?.full_name} />
          <InfoItem bordered label="Occupation"      value={guardian?.occupation} />
          <InfoItem bordered label="Contact No."     value={guardian?.mobile_number} />
        </InfoGrid>

        <SectionBar>Academic Record</SectionBar>

        {records.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px", color: C.muted, fontSize: 12, border: `1px solid ${C.border}`, marginBottom: 10 }}>
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

            const gwaLabelSpan = 1 + cfg.cols.length + (isAnnual ? 0 : 1);
            const totalPresent = pP.reduce((a,b) => a+b, 0);
            const totalAbsent  = pA.reduce((a,b) => a+b, 0);

            return (
              <div key={enr.enrollment_id} style={{ marginBottom: idx < records.length - 1 ? 14 : 0 }}>

                <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "5px 5px 0 0", padding: "5px 10px", display: "flex", gap: 18, flexWrap: "wrap", fontSize: 9.5, fontWeight: 700, color: C.dark, breakAfter: "avoid", pageBreakAfter: "avoid" }}>
                  <span>Grade Level: <strong>{enr.grade_level}</strong></span>
                  <span>School Year: <strong>{enr.school_year}</strong></span>
                  {enr.section  && <span>Section: <strong>{enr.section}</strong></span>}
                  {enr.strand   && <span>Strand: <strong>{enr.strand}</strong></span>}
                  {enr.semester && <span>Semester: <strong>{enr.semester === "1st" ? "1st Semester" : "2nd Semester"}</strong></span>}
                  <span>School: <strong>{schoolName}</strong></span>
                </div>

                {subjects.length === 0 ? (
                  <div style={{ border: `1px solid ${C.border}`, borderTop: "none", padding: "10px", fontSize: 10, color: C.muted, textAlign: "center" }}>
                    No subjects on record for this enrollment.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={TH({ textAlign: "left", width: "36%" })}>Learning Area / Subject</th>
                        {cfg.cols.map(c => <th key={c} style={TH({ width: isAnnual ? "14%" : "9%" })}>{c}</th>)}
                        {!isAnnual && <th style={TH({ width: "10%" })}>Final</th>}
                        <th style={TH({ width: "12%" })}>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ sub, pGrades, final }, i) => {
                        const displayGrade = isAnnual ? pGrades[0] : final;
                        const passed = displayGrade != null ? displayGrade >= 75 : null;
                        return (
                          <tr key={sub.subject_id ?? i} style={{ background: i%2===0 ? "white" : C.bg }}>
                            <td style={TD({ textAlign: "left" })}>{sub.subject_name}</td>
                            {pGrades.map((g, pi) => (
                              <td key={pi} style={TD({ textAlign: "center", fontWeight: g!=null?700:400, color: g!=null?gradeColor(g):"#ccc" })}>
                                {g != null ? Math.round(g) : "—"}
                              </td>
                            ))}
                            {!isAnnual && (
                              <td style={TD({ textAlign: "center", fontWeight: 800, color: final!=null?gradeColor(final):"#ccc" })}>
                                {final != null ? final.toFixed(2) : "—"}
                              </td>
                            )}
                            <td style={TD({ textAlign: "center" })}>
                              {passed === true ? "Passed" : passed === false ? "Failed" : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: C.redBg }}>
                        <td colSpan={gwaLabelSpan}
                          style={TD({ textAlign: "right", fontWeight: 800, fontSize: 9.5 })}>
                          General Weighted Average
                        </td>
                        <td style={TD({ textAlign: "center", fontWeight: 900, fontSize: 11, color: gwa!=null?gradeColor(gwa):"#aaa" })}>
                          {gwa != null ? gwa.toFixed(2) : "—"}
                        </td>
                        <td style={TD({ textAlign: "center", fontWeight: 700, fontSize: 9 })}>
                          {promotionRemark(enr, gwa)}
                        </td>
                      </tr>
                      <tr style={{ background: C.bg }}>
                        <td style={TD({ textAlign: "right", fontWeight: 700, fontSize: 9 })}>Attendance</td>
                        {pP.map((p, ci) => (
                          <td key={ci} style={TD({ textAlign: "center", fontSize: 8, lineHeight: 1.6 })}>
                            <div><strong>P:</strong> {p}</div>
                            <div><strong>A:</strong> {pA[ci]}</div>
                          </td>
                        ))}
                        {!isAnnual && (
                          <td style={TD({ textAlign: "center", fontSize: 8, lineHeight: 1.6 })}>
                            <div><strong>P:</strong> {totalPresent}</div>
                            <div><strong>A:</strong> {totalAbsent}</div>
                          </td>
                        )}
                        <td style={TD({ textAlign: "center", fontSize: 8, color: C.muted })}>
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

        <SignatureRow>
          <GeneratedStamp />
          <SignatureBlock heading="Prepared by:" role="Class Adviser" caption="Signature over Printed Name / Date" />
          <SignatureBlock heading="Certified by:" role="Registrar" caption="Signature over Printed Name / Date" />
          <SignatureBlock heading="Noted by:" role="School Head / Principal" caption="Signature over Printed Name / Date" />
        </SignatureRow>
      </PrintShell>
    </>
  );
}
