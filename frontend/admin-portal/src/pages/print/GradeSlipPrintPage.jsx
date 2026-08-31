import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getEnrollment, getSubjects, getGrades } from "../../api/enrollmentApi";
import { getSchoolSettings } from "../../api/billingApi";
import { downloadAsPDF } from "../../utils/pdfExport";
import { levelConfig, PERIOD_LABEL, gradeColor } from "../../utils/grading";
import { PRINT_COLORS as C } from "../../components/print/theme";
import { PrintToolbar, ToolbarButton } from "../../components/print/PrintToolbar";
import { PrintShell, PrintLoading, PrintError } from "../../components/print/PrintShell";
import { PrintLetterhead } from "../../components/print/PrintLetterhead";
import { InfoGrid, InfoItem } from "../../components/print/InfoGrid";
import { SignatureRow, SignatureBlock, GeneratedStamp } from "../../components/print/SignatureBlock";
import { StatusBadge } from "../../components/print/StatusBadge";
import { ENROLLMENT_STATUS_META } from "../../components/print/statusMeta";

export default function GradeSlipPrintPage() {
  const { enrollmentId } = useParams();
  const [searchParams]   = useSearchParams();

  const [enrollment,     setEnrollment]     = useState(null);
  const [subjects,       setSubjects]       = useState([]);
  const [grades,         setGrades]         = useState([]);
  const [schoolName,     setSchoolName]     = useState("South Lakes Integrated School");
  const [schoolAddress,  setSchoolAddress]  = useState("");
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [period,         setPeriod]         = useState(searchParams.get("period") || "");
  const [downloading,    setDownloading]    = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const enr = await getEnrollment(enrollmentId);
        setEnrollment(enr);

        const available = levelConfig(enr.school_level).periods;
        if (!period) setPeriod(available[0]);

        const [subs, settings] = await Promise.all([
          getSubjects({
            school_level: enr.school_level,
            ...(enr.strand   ? { strand:   enr.strand   } : {}),
            ...(enr.semester ? { semester: enr.semester } : {}),
          }),
          getSchoolSettings().catch(() => null),
        ]);

        setSubjects(Array.isArray(subs) ? subs : subs.results ?? []);
        if (settings?.school_name) setSchoolName(settings.school_name);
        if (settings?.school_address) setSchoolAddress(settings.school_address);
      } catch (e) {
        setError(e.message || "Failed to load data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [enrollmentId]);

  useEffect(() => {
    if (!enrollmentId || !period) return;
    getGrades({ enrollment: enrollmentId, grading_period: period })
      .then((d) => setGrades(Array.isArray(d) ? d : d.results ?? []))
      .catch(console.error);
  }, [enrollmentId, period]);

  const handleDownload = async () => {
    setDownloading(true);
    await downloadAsPDF("grade-slip-doc", `Grade-Slip-${enrollmentId}-${period}.pdf`);
    setDownloading(false);
  };

  if (loading) return <PrintLoading label="Loading…" />;
  if (error || !enrollment) return <PrintError message={error || "Enrollment not found."} />;

  const fullName = [
    enrollment.student_detail?.last_name,
    enrollment.student_detail?.first_name,
    enrollment.student_detail?.middle_name,
  ].filter(Boolean).join(", ") || enrollment.student_name || "—";

  const available     = levelConfig(enrollment.school_level).periods;
  const gradeMap      = {};
  grades.forEach((g) => { gradeMap[g.subject ?? g.subject_id] = g; });

  const numericGrades = grades.filter((g) => g.grade != null).map((g) => parseFloat(g.grade));
  const gwa    = numericGrades.length ? (numericGrades.reduce((a, b) => a + b, 0) / numericGrades.length).toFixed(2) : null;
  const passed = grades.filter((g) => g.remarks?.toLowerCase() === "passed").length;
  const failed = grades.filter((g) => g.remarks?.toLowerCase() === "failed").length;

  return (
    <>
      <PrintToolbar
        onBack={() => window.close()}
        middle={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>Grading Period:</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "white", padding: "6px 10px", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              {available.map((p) => (
                <option key={p} value={p} style={{ background: C.dark }}>{PERIOD_LABEL[p]}</option>
              ))}
            </select>
          </div>
        }
        title={`Grade Slip — ${fullName} · SY ${enrollment.school_year}`}
        actions={
          <>
            <ToolbarButton onClick={handleDownload} disabled={downloading} icon="download">
              {downloading ? "Generating…" : "Download PDF"}
            </ToolbarButton>
            <ToolbarButton onClick={() => window.print()} primary icon="printer">Print</ToolbarButton>
          </>
        }
      />

      <PrintShell id="grade-slip-doc" maxWidth={900} orientation="portrait">
        <PrintLetterhead
          variant="standard"
          schoolName={schoolName}
          schoolAddress={schoolAddress}
          subtitle={`Grade Slip — ${PERIOD_LABEL[period]} · School Year ${enrollment.school_year}`}
        />

        <InfoGrid columns={3}>
          <InfoItem label="Name"        value={fullName} span />
          <InfoItem label="LRN"         value={enrollment.student_detail?.lrn} />
          <InfoItem label="Student No." value={enrollment.student_detail?.student_number} />
          <InfoItem label="Grade Level" value={enrollment.grade_level} />
          <InfoItem label="Section"     value={enrollment.section} />
          {enrollment.strand   && <InfoItem label="Strand"   value={enrollment.strand} />}
          {enrollment.semester && <InfoItem label="Semester" value={enrollment.semester === "1st" ? "1st Semester" : "2nd Semester"} />}
          <InfoItem label="School Year" value={enrollment.school_year} />
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</span>
            <StatusBadge status={enrollment.enrollment_status} meta={ENROLLMENT_STATUS_META} defaultKey="enrolled" />
          </div>
        </InfoGrid>

        {subjects.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 14 }}>
            No grade records found for this enrollment.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 20 }}>
            <thead>
              <tr style={{ background: C.dark }}>
                <th style={{ textAlign: "left",   padding: "10px 12px", color: "white", fontWeight: 700, borderRadius: "6px 0 0 0", width: "45%" }}>Subject</th>
                <th style={{ textAlign: "center", padding: "10px 8px",  color: "white", fontWeight: 700, fontSize: 12, width: 90 }}>Code</th>
                <th style={{ textAlign: "center", padding: "10px 8px",  color: "white", fontWeight: 700, width: 70 }}>Grade</th>
                <th style={{ textAlign: "center", padding: "10px 12px", color: "white", fontWeight: 700, borderRadius: "0 6px 0 0" }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((sub, i) => {
                const g       = gradeMap[sub.subject_id];
                const gv      = g?.grade != null ? parseFloat(g.grade) : null;
                const remarks = g?.remarks;
                const remarkColor = remarks?.toLowerCase() === "passed" ? C.green
                  : remarks?.toLowerCase() === "failed" ? C.red : C.muted;
                const remarkBg = remarks?.toLowerCase() === "passed" ? C.greenBg
                  : remarks?.toLowerCase() === "failed" ? C.redBg : C.grayBg;
                return (
                  <tr key={sub.subject_id ?? i} style={{ background: i % 2 === 0 ? "white" : C.bg, borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "9px 12px", color: C.dark }}>
                      <div style={{ fontWeight: 600 }}>{sub.subject_name}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{sub.subject_code}</div>
                    </td>
                    <td style={{ textAlign: "center", padding: "9px 8px", color: C.muted, fontSize: 12, fontFamily: "monospace" }}>
                      {sub.subject_code}
                    </td>
                    <td style={{ textAlign: "center", padding: "9px 8px", fontWeight: 700, fontSize: 14, color: gv != null ? gradeColor(gv) : "#ccc" }}>
                      {gv != null ? gv.toFixed(2) : "—"}
                    </td>
                    <td style={{ textAlign: "center", padding: "9px 12px" }}>
                      {remarks ? (
                        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 50, padding: "2px 10px", color: remarkColor, background: remarkBg }}>
                          {remarks.charAt(0).toUpperCase() + remarks.slice(1)}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {gwa != null && (
              <tfoot>
                <tr style={{ background: C.redBg, borderTop: `2px solid ${C.border}` }}>
                  <td colSpan={2} style={{ padding: "10px 12px", fontWeight: 700, color: C.dark, textAlign: "right", fontSize: 13 }}>
                    General Weighted Average
                  </td>
                  <td style={{ textAlign: "center", padding: "10px 8px", fontWeight: 800, fontSize: 16, color: gradeColor(parseFloat(gwa)) }}>
                    {gwa}
                  </td>
                  <td style={{ textAlign: "center", padding: "10px 12px" }}>
                    {parseFloat(gwa) >= 75 ? (
                      <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 50, padding: "3px 12px", color: C.green, background: C.greenBg }}>Passed</span>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 50, padding: "3px 12px", color: C.red, background: C.redBg }}>Failed</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Subjects", value: subjects.length, color: C.dark,  bg: C.bg },
            { label: "Passed",   value: passed,          color: C.green, bg: C.greenBg },
            { label: "Failed",   value: failed,          color: C.red,   bg: C.redBg },
            { label: "GWA",      value: gwa ?? "—",       color: gwa != null ? gradeColor(parseFloat(gwa)) : C.muted, bg: C.redBg, bold: true },
          ].map(({ label, value, color, bg, bold }) => (
            <div key={label} style={{ flex: 1, background: bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: bold ? 20 : 18, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>

        <SignatureRow>
          <GeneratedStamp />
          <SignatureBlock role="Class Adviser" width={160} />
          <SignatureBlock role="Registrar's Signature over Printed Name" width={160} />
          <SignatureBlock role="School Principal's Signature" width={160} />
        </SignatureRow>
      </PrintShell>
    </>
  );
}
