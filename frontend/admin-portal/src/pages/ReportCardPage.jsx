import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { getReportCard } from "../api/enrollmentApi";
import { getSchoolSettings } from "../api/billingApi";
import { downloadAsPDF } from "../utils/pdfExport";
import { gradeColor } from "../utils/grading";
import { PRINT_COLORS as C } from "../components/print/theme";
import { PrintToolbar, ToolbarButton } from "../components/print/PrintToolbar";
import { PrintShell, PrintLoading } from "../components/print/PrintShell";
import { PrintLetterhead } from "../components/print/PrintLetterhead";
import { InfoGrid, InfoItem } from "../components/print/InfoGrid";
import { SignatureRow, SignatureBlock, GeneratedStamp } from "../components/print/SignatureBlock";
import { StatusBadge } from "../components/print/StatusBadge";
import { ENROLLMENT_STATUS_META, GRADE_REMARKS_META } from "../components/print/statusMeta";

const LEVEL_LABELS = {
  nursery: "Nursery", kindergarten: "Kindergarten", elementary: "Elementary",
  junior_highschool: "Junior High School", senior_highschool: "Senior High School",
};

export default function ReportCardPage() {
  usePageTitle("Report Card");
  const { enrollmentId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [data,           setData]           = useState(null);
  const [schoolName,     setSchoolName]     = useState("South Lakes Integrated School");
  const [schoolAddress,  setSchoolAddress]  = useState("");
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [period,         setPeriod]         = useState(searchParams.get("period") || "");
  const [downloading,    setDownloading]    = useState(false);

  useEffect(() => {
    if (!data) setLoading(true);
    Promise.all([
      getReportCard(enrollmentId, period ? { grading_period: period } : {}),
      getSchoolSettings().catch(() => null),
    ])
      .then(([rc, settings]) => {
        setData(rc);
        if (settings?.school_name) setSchoolName(settings.school_name);
        if (settings?.school_address) setSchoolAddress(settings.school_address);
      })
      .catch((e) => setError(e.response?.data?.detail || e.message || "Failed to load report card."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollmentId, period]);

  const handleDownload = async () => {
    setDownloading(true);
    await downloadAsPDF("report-card-print", `Report-Card-${enrollmentId}.pdf`);
    setDownloading(false);
  };

  if (loading) return <PrintLoading label="Loading report card…" />;

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.red, fontSize: 15, marginBottom: 12 }}>{error}</div>
          <button onClick={() => navigate(-1)} style={{ padding: "8px 20px", border: `1px solid ${C.border}`, borderRadius: 8, background: "white", cursor: "pointer", fontSize: 13, color: C.muted }}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const { enrollment, student, grading_periods, subjects, overall_gpa, available_periods } = data;
  const fullName = [student.last_name, student.first_name, student.middle_name]
    .filter(Boolean).join(", ");

  // Tallies for the summary band. Incomplete and Dropped earn a tile only
  // when a teacher actually recorded one, so an ordinary card still shows the
  // same four tiles — but a card where they do occur no longer reads as
  // "3 subjects, 2 passed, 0 failed" with the third silently unaccounted for.
  const countRemarks = (r) => subjects.filter((s) => s.overall_remarks === r).length;
  const incompleteCount = countRemarks("incomplete");
  const droppedCount    = countRemarks("dropped");

  return (
    <>
      <PrintToolbar
        onBack={() => navigate(-1)}
        backLabel="Back"
        middle={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>Grading Period:</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "white", padding: "6px 10px", fontSize: 13, cursor: "pointer" }}>
              <option value="" style={{ background: C.dark }}>All Periods</option>
              {available_periods.map((p) => (
                <option key={p.key} value={p.key} style={{ background: C.dark }}>{p.label}</option>
              ))}
            </select>
          </div>
        }
        title={`Report Card — ${fullName} · SY ${enrollment.school_year}`}
        actions={
          <>
            <ToolbarButton onClick={handleDownload} disabled={downloading} icon="download">
              {downloading ? "Generating…" : "Download PDF"}
            </ToolbarButton>
            <ToolbarButton onClick={() => window.print()} primary icon="printer">Print</ToolbarButton>
          </>
        }
      />

      <PrintShell id="report-card-print" maxWidth={960} orientation="portrait" padding="40px 48px" accent>
        <PrintLetterhead
          variant="standard"
          size="lg"
          schoolName={schoolName}
          schoolAddress={schoolAddress}
          subtitle={`Student Report Card — School Year ${enrollment.school_year}`}
        />

        <InfoGrid columns={3}>
          <InfoItem label="Name" value={fullName} span />
          <InfoItem label="LRN" value={student.lrn} />
          <InfoItem label="Student No." value={student.student_number} />
          <InfoItem label="Sex" value={student.sex} />
          <InfoItem label="Birth Date" value={student.birth_date ? new Date(student.birth_date).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) : "—"} />
          <InfoItem label="Grade Level" value={enrollment.grade_level} />
          <InfoItem label="Section" value={enrollment.section} />
          <InfoItem label="School Level" value={LEVEL_LABELS[enrollment.school_level] || enrollment.school_level} />
          {enrollment.strand && <InfoItem label="Strand" value={enrollment.strand} />}
          {enrollment.semester && <InfoItem label="Semester" value={enrollment.semester === "1st" ? "1st Semester" : "2nd Semester"} />}
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
          /* 22 to match the gap below the table, so the three content blocks
             share one rhythm and the signature footer's larger 32 reads as a
             deliberate break. It has to be the full 22 rather than a 6px
             top-up on InfoGrid's own 16px bottom margin: these are adjacent
             siblings in normal block flow, so the two margins collapse to the
             larger of the pair rather than adding together. */
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginTop: 22 }}>
            <thead>
              <tr style={{ background: C.dark }}>
                <th style={{ textAlign: "left", padding: "15px 16px", color: "white", fontWeight: 700, borderRadius: "8px 0 0 0", width: "30%" }}>
                  Subject
                </th>
                {grading_periods.map((p) => (
                  <th key={p.key} style={{ textAlign: "center", padding: "15px 10px", color: "white", fontWeight: 700, fontSize: 13 }}>
                    {p.label}
                  </th>
                ))}
                <th style={{ textAlign: "center", padding: "15px 10px", color: "white", fontWeight: 700 }}>
                  Average
                </th>
                <th style={{ textAlign: "center", padding: "15px 16px", color: "white", fontWeight: 700, borderRadius: "0 8px 0 0" }}>
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((subj, idx) => (
                <tr
                  key={subj.subject_id}
                  style={{ background: idx % 2 === 0 ? "white" : C.bg, borderBottom: `1px solid ${C.border}` }}
                >
                  <td style={{ padding: "15px 16px", color: C.dark, fontWeight: 500 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{subj.subject_name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{subj.subject_code}</div>
                  </td>
                  {grading_periods.map((p) => {
                    const g = subj.grades[p.key];
                    return (
                      <td key={p.key} style={{ textAlign: "center", padding: "15px 10px", color: g ? gradeColor(g.numeric_grade) : "#ccc", fontWeight: g ? 600 : 400 }}>
                        {g ? g.numeric_grade?.toFixed(2) ?? "—" : "—"}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "center", padding: "15px 10px", fontWeight: 700, color: gradeColor(subj.average) }}>
                    {subj.average != null ? subj.average.toFixed(2) : "—"}
                  </td>
                  {/* Guarded rather than handed straight to StatusBadge: its
                      unknown-key fallback is the first entry in the meta map,
                      which would print "Passed" for a subject with no remark
                      recorded at all. */}
                  <td style={{ textAlign: "center", padding: "15px 16px" }}>
                    {subj.overall_remarks
                      ? <StatusBadge status={subj.overall_remarks} meta={GRADE_REMARKS_META} />
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: C.redBg, borderTop: `2px solid ${C.border}` }}>
                <td colSpan={grading_periods.length + 1} style={{ padding: "15px 16px", fontWeight: 700, color: C.dark, textAlign: "right" }}>
                  General Average
                </td>
                <td style={{ textAlign: "center", padding: "15px 10px", fontWeight: 800, fontSize: 18, color: gradeColor(overall_gpa) }}>
                  {overall_gpa != null ? overall_gpa.toFixed(2) : "—"}
                </td>
                <td style={{ textAlign: "center", padding: "15px 16px" }}>
                  {overall_gpa != null ? (
                    <span style={{
                      fontSize: 12, fontWeight: 700, borderRadius: 50, padding: "4px 14px",
                      color: overall_gpa >= 75 ? C.green : C.red,
                      background: overall_gpa >= 75 ? C.greenBg : C.redBg,
                    }}>
                      {overall_gpa >= 75 ? "Passed" : "Failed"}
                    </span>
                  ) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* marginTop is the point of this line: the band used to butt straight
            up against the General Average row with nothing between them, so
            the tiles read as a fifth table row rather than as a summary. */}
        <div style={{ display: "flex", gap: 12, marginTop: 22, marginBottom: 32 }}>
          {[
            { label: "Subjects", value: subjects.length,        color: C.dark,  bg: C.bg },
            { label: "Passed",   value: countRemarks("passed"), color: C.green, bg: C.greenBg },
            { label: "Failed",   value: countRemarks("failed"), color: C.red,   bg: C.redBg },
            ...(incompleteCount ? [{ label: "Incomplete", value: incompleteCount, color: C.amber, bg: C.amberBg }] : []),
            ...(droppedCount    ? [{ label: "Dropped",    value: droppedCount,    color: C.gray,  bg: C.grayBg  }] : []),
            { label: "GWA",      value: overall_gpa != null ? overall_gpa.toFixed(2) : "—", color: overall_gpa != null ? gradeColor(overall_gpa) : C.muted, bg: C.redBg, bold: true },
          ].map(({ label, value, color, bg, bold }) => (
            <div key={label} style={{ flex: 1, background: bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: bold ? 20 : 18, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>

        <SignatureRow>
          <SignatureBlock role="Class Adviser" />
          <SignatureBlock role="Registrar's Signature over Printed Name" />
          <SignatureBlock role="School Principal's Signature" />
        </SignatureRow>
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <GeneratedStamp />
        </div>
      </PrintShell>
    </>
  );
}
