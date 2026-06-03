import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getEnrollment, getSubjects, getGrades } from "../../api/enrollmentApi";
import { getSchoolSettings } from "../../api/billingApi";
import { downloadAsPDF } from "../../utils/pdfExport";
import logo from "../../assets/logo.png";

const C = {
  dark: "#1a0a0a", muted: "#7a5050", border: "#e8d8d8",
  red: "#e03131", bg: "#fff8f6",
};

const PERIODS = {
  Nursery:      ["annual"],
  Kindergarten: ["annual"],
  Elementary:   ["1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter"],
  JHS:          ["1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter"],
  SHS:          ["1st_semester", "2nd_semester"],
};

const PERIOD_LABEL = {
  "1st_quarter":  "1st Quarter",
  "2nd_quarter":  "2nd Quarter",
  "3rd_quarter":  "3rd Quarter",
  "4th_quarter":  "4th Quarter",
  "1st_semester": "1st Semester",
  "2nd_semester": "2nd Semester",
  "annual":       "Annual",
};

const STATUS_META = {
  enrolled:  { label: "Enrolled",  color: "#2e6b0d", bg: "#e8f5e0" },
  pending:   { label: "Pending",   color: "#854f0b", bg: "#faeeda" },
  completed: { label: "Completed", color: "#1455a0", bg: "#e3f0fd" },
  cancelled: { label: "Cancelled", color: "#5c5752", bg: "#f0ede8" },
};

function gradeColor(g) {
  if (g == null) return C.muted;
  if (g >= 90) return "#1a6b0d";
  if (g >= 75) return "#1455a0";
  return "#c92a2a";
}

function InfoRow({ label, value, span }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.dark, fontWeight: 600, marginTop: 1 }}>{value || "—"}</div>
    </div>
  );
}

export default function GradeSlipPrintPage() {
  const { enrollmentId } = useParams();
  const [searchParams]   = useSearchParams();

  const [enrollment,  setEnrollment]  = useState(null);
  const [subjects,    setSubjects]    = useState([]);
  const [grades,      setGrades]      = useState([]);
  const [schoolName,  setSchoolName]  = useState("South Lakes Integrated School");
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [period,      setPeriod]      = useState(searchParams.get("period") || "");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const enr = await getEnrollment(enrollmentId);
        setEnrollment(enr);

        const available = PERIODS[enr.school_level] ?? PERIODS.Elementary;
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

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', Arial, sans-serif", color: C.muted, fontSize: 15 }}>
      Loading…
    </div>
  );

  if (error || !enrollment) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', Arial, sans-serif" }}>
      <div style={{ textAlign: "center", color: C.red }}>{error || "Enrollment not found."}</div>
    </div>
  );

  const fullName = [
    enrollment.student_detail?.last_name,
    enrollment.student_detail?.first_name,
    enrollment.student_detail?.middle_name,
  ].filter(Boolean).join(", ") || enrollment.student_name || "—";

  const statusMeta    = STATUS_META[enrollment.enrollment_status] ?? STATUS_META.enrolled;
  const available     = PERIODS[enrollment.school_level] ?? PERIODS.Elementary;
  const gradeMap      = {};
  grades.forEach((g) => { gradeMap[g.subject ?? g.subject_id] = g; });

  const numericGrades = grades.filter((g) => g.grade != null).map((g) => parseFloat(g.grade));
  const gwa    = numericGrades.length ? (numericGrades.reduce((a, b) => a + b, 0) / numericGrades.length).toFixed(2) : null;
  const passed = grades.filter((g) => g.remarks?.toLowerCase() === "passed").length;
  const failed = grades.filter((g) => g.remarks?.toLowerCase() === "failed").length;

  const handleDownload = async () => {
    setDownloading(true);
    await downloadAsPDF(
      "grade-slip-doc",
      `GradeSlip-${enrollment.student_detail?.student_number}-${period}-SY${enrollment.school_year}.pdf`
    );
    setDownloading(false);
  };

  return (
    <>
      {/* Toolbar */}
      <div className="no-print" style={{ background: C.dark, padding: "12px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={() => window.close()}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }} /> Close
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>Grading Period:</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "white", padding: "6px 10px", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            {available.map((p) => (
              <option key={p} value={p} style={{ background: C.dark }}>{PERIOD_LABEL[p]}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
          Grade Slip — {fullName} · SY {enrollment.school_year}
        </div>
        <button onClick={handleDownload} disabled={downloading}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 20px", border: "none", borderRadius: 8, background: C.red, color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", opacity: downloading ? 0.7 : 1 }}>
          <i className="ti ti-download" style={{ fontSize: 15 }} />
          {downloading ? "Generating…" : "Download PDF"}
        </button>
      </div>

      {/* Document */}
      <div id="grade-slip-doc" style={{ maxWidth: 900, margin: "32px auto", background: "white", border: `1px solid ${C.border}`, borderRadius: 12, padding: "32px 40px", fontFamily: "'DM Sans', Arial, sans-serif" }}>

        {/* School header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, borderBottom: `2px solid ${C.border}`, paddingBottom: 16 }}>
          <img src={logo} alt="Logo" style={{ width: 52, height: 76, objectFit: "contain" }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
              Republic of the Philippines — Department of Education
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, lineHeight: 1.2 }}>{schoolName}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              Grade Slip — {PERIOD_LABEL[period]} · School Year {enrollment.school_year}
            </div>
          </div>
        </div>

        {/* Student info strip */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 24px", marginBottom: 20, padding: "14px 18px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <InfoRow label="Name"        value={fullName} span />
          <InfoRow label="LRN"         value={enrollment.student_detail?.lrn} />
          <InfoRow label="Student No." value={enrollment.student_detail?.student_number} />
          <InfoRow label="Grade Level" value={enrollment.grade_level} />
          <InfoRow label="Section"     value={enrollment.section} />
          {enrollment.strand   && <InfoRow label="Strand"   value={enrollment.strand} />}
          {enrollment.semester && <InfoRow label="Semester" value={enrollment.semester === "1st" ? "1st Semester" : "2nd Semester"} />}
          <InfoRow label="School Year" value={enrollment.school_year} />
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: statusMeta.color, background: statusMeta.bg, padding: "2px 10px", borderRadius: 50 }}>
              {statusMeta.label}
            </span>
          </div>
        </div>

        {/* Grades table */}
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
                const remarkColor = remarks?.toLowerCase() === "passed" ? "#2e6b0d"
                  : remarks?.toLowerCase() === "failed" ? "#c92a2a" : C.muted;
                const remarkBg = remarks?.toLowerCase() === "passed" ? "#e8f5e0"
                  : remarks?.toLowerCase() === "failed" ? "#fde8e8" : "#f0ede8";
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
                <tr style={{ background: "#fff0f0", borderTop: `2px solid ${C.border}` }}>
                  <td colSpan={2} style={{ padding: "10px 12px", fontWeight: 700, color: C.dark, textAlign: "right", fontSize: 13 }}>
                    General Weighted Average
                  </td>
                  <td style={{ textAlign: "center", padding: "10px 8px", fontWeight: 800, fontSize: 16, color: gradeColor(parseFloat(gwa)) }}>
                    {gwa}
                  </td>
                  <td style={{ textAlign: "center", padding: "10px 12px" }}>
                    {parseFloat(gwa) >= 75 ? (
                      <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 50, padding: "3px 12px", color: "#2e6b0d", background: "#e8f5e0" }}>Passed</span>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 50, padding: "3px 12px", color: "#c92a2a", background: "#fde8e8" }}>Failed</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {/* Summary chips */}
        <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Subjects", value: subjects.length, color: C.dark,    bg: C.bg },
            { label: "Passed",   value: passed,          color: "#2e6b0d", bg: "#e8f5e0" },
            { label: "Failed",   value: failed,          color: "#c92a2a", bg: "#fde8e8" },
            { label: "GWA",      value: gwa ?? "—",      color: gwa != null ? gradeColor(parseFloat(gwa)) : C.muted, bg: "#fff0f0", bold: true },
          ].map(({ label, value, color, bg, bold }) => (
            <div key={label} style={{ flex: 1, background: bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: bold ? 20 : 18, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 32, borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            Generated: {new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
          </div>
          <SigBlock label="Class Adviser" />
          <SigBlock label="Registrar's Signature over Printed Name" />
          <SigBlock label="School Principal's Signature" />
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          #grade-slip-doc { max-width: 100% !important; margin: 0 !important; border: none !important; border-radius: 0 !important; padding: 24px 32px !important; }
        }
      `}</style>
    </>
  );
}

function SigBlock({ label }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ borderTop: `1px solid ${C.dark}`, width: 160, marginBottom: 4 }} />
      <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
    </div>
  );
}