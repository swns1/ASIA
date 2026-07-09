import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getReportCard } from "../api/enrollmentApi";
import logo from "../assets/logo.png";

const C = {
  dark: "#1a0a0a", muted: "#7a5050", border: "#e8d8d8",
  red: "#e03131", bg: "#fff8f6",
};

const LEVEL_LABELS = {
  nursery: "Nursery", kindergarten: "Kindergarten", elementary: "Elementary",
  junior_highschool: "Junior High School", senior_highschool: "Senior High School",
};

const STATUS_META = {
  enrolled:  { label: "Enrolled",  color: "#2e6b0d", bg: "#e8f5e0" },
  pending:   { label: "Pending",   color: "#854f0b", bg: "#faeeda" },
  completed: { label: "Completed", color: "#1455a0", bg: "#e3f0fd" },
  cancelled: { label: "Cancelled", color: "#5c5752", bg: "#f0ede8" },
};

function gradeColor(avg) {
  if (avg == null) return "#7a5050";
  if (avg >= 90) return "#1a6b0d";
  if (avg >= 75) return "#1455a0";
  return "#c92a2a";
}

export default function ReportCardPage() {
  usePageTitle("Report Card");
  const { enrollmentId } = useParams();
  const navigate = useNavigate();
  const printRef = useRef();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    getReportCard(enrollmentId)
      .then(setData)
      .catch((e) => setError(e.response?.data?.detail || e.message || "Failed to load report card."))
      .finally(() => setLoading(false));
  }, [enrollmentId]);

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
        <div style={{ color: C.muted, fontSize: 15 }}>Loading report card…</div>
      </div>
    );
  }

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

  const { enrollment, student, grading_periods, subjects, overall_gpa } = data;
  const fullName = [student.last_name, student.first_name, student.middle_name]
    .filter(Boolean).join(", ");
  const statusMeta = STATUS_META[enrollment.enrollment_status] || STATUS_META.enrolled;

  return (
    <>
      {/* Print controls — hidden when printing */}
      <div className="no-print" style={{ background: "#1a0a0a", padding: "12px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 13 }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }} /> Back
        </button>
        <div style={{ flex: 1, color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
          Report Card — {fullName} · SY {enrollment.school_year}
        </div>
        <button
          onClick={handlePrint}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 20px", border: "none", borderRadius: 8, background: C.red, color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
        >
          <i className="ti ti-printer" style={{ fontSize: 15 }} /> Print / Save PDF
        </button>
      </div>

      {/* Print-ready card */}
      <div
        ref={printRef}
        style={{
          maxWidth: 900, margin: "32px auto", background: "white",
          border: `1px solid ${C.border}`, borderRadius: 12,
          padding: "32px 40px", fontFamily: "'DM Sans', Arial, sans-serif",
        }}
        id="report-card-print"
      >
        {/* School header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, borderBottom: `2px solid ${C.border}`, paddingBottom: 16 }}>
          <img src={logo} alt="Logo" style={{ width: 52, height: 76, objectFit: "contain" }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
              Republic of the Philippines — Department of Education
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, lineHeight: 1.2 }}>
              South Lakes Integrated School
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              Student Report Card — School Year {enrollment.school_year}
            </div>
          </div>
        </div>

        {/* Student info strip */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 24px", marginBottom: 20, padding: "14px 18px", background: "#fff8f6", borderRadius: 8, border: `1px solid ${C.border}` }}>
          <InfoRow label="Name" value={fullName} span />
          <InfoRow label="LRN" value={student.lrn} />
          <InfoRow label="Student No." value={student.student_number} />
          <InfoRow label="Sex" value={student.sex} />
          <InfoRow label="Birth Date" value={student.birth_date ? new Date(student.birth_date).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) : "—"} />
          <InfoRow label="Grade Level" value={enrollment.grade_level} />
          <InfoRow label="Section" value={enrollment.section} />
          <InfoRow label="School Level" value={LEVEL_LABELS[enrollment.school_level] || enrollment.school_level} />
          {enrollment.strand && <InfoRow label="Strand" value={enrollment.strand} />}
          {enrollment.semester && <InfoRow label="Semester" value={enrollment.semester === "1st" ? "1st Semester" : "2nd Semester"} />}
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: statusMeta.color, background: statusMeta.bg, padding: "2px 10px", borderRadius: 50 }}>{statusMeta.label}</span>
          </div>
        </div>

        {/* Grades table */}
        {subjects.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 14 }}>
            No grade records found for this enrollment.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.dark }}>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "white", fontWeight: 700, borderRadius: "6px 0 0 0", width: "30%" }}>
                  Subject
                </th>
                {grading_periods.map((p) => (
                  <th key={p.key} style={{ textAlign: "center", padding: "10px 8px", color: "white", fontWeight: 700, fontSize: 12 }}>
                    {p.label}
                  </th>
                ))}
                <th style={{ textAlign: "center", padding: "10px 8px", color: "white", fontWeight: 700 }}>
                  Average
                </th>
                <th style={{ textAlign: "center", padding: "10px 12px", color: "white", fontWeight: 700, borderRadius: "0 6px 0 0" }}>
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((subj, idx) => (
                <tr
                  key={subj.subject_id}
                  style={{ background: idx % 2 === 0 ? "white" : "#fff8f6", borderBottom: `1px solid ${C.border}` }}
                >
                  <td style={{ padding: "9px 12px", color: C.dark, fontWeight: 500 }}>
                    <div style={{ fontWeight: 600 }}>{subj.subject_name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{subj.subject_code}</div>
                  </td>
                  {grading_periods.map((p) => {
                    const g = subj.grades[p.key];
                    return (
                      <td key={p.key} style={{ textAlign: "center", padding: "9px 8px", color: g ? gradeColor(g.numeric_grade) : "#ccc", fontWeight: g ? 600 : 400 }}>
                        {g ? g.numeric_grade?.toFixed(2) ?? "—" : "—"}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "center", padding: "9px 8px", fontWeight: 700, color: gradeColor(subj.average) }}>
                    {subj.average != null ? subj.average.toFixed(2) : "—"}
                  </td>
                  <td style={{ textAlign: "center", padding: "9px 12px" }}>
                    {subj.overall_remarks ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, borderRadius: 50, padding: "2px 10px",
                        color: subj.overall_remarks === "passed" ? "#2e6b0d" : subj.overall_remarks === "failed" ? "#c92a2a" : "#854f0b",
                        background: subj.overall_remarks === "passed" ? "#e8f5e0" : subj.overall_remarks === "failed" ? "#fde8e8" : "#faeeda",
                      }}>
                        {subj.overall_remarks.charAt(0).toUpperCase() + subj.overall_remarks.slice(1)}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#fff0f0", borderTop: `2px solid ${C.border}` }}>
                <td colSpan={grading_periods.length + 1} style={{ padding: "10px 12px", fontWeight: 700, color: C.dark, textAlign: "right" }}>
                  General Average
                </td>
                <td style={{ textAlign: "center", padding: "10px 8px", fontWeight: 800, fontSize: 16, color: gradeColor(overall_gpa) }}>
                  {overall_gpa != null ? overall_gpa.toFixed(2) : "—"}
                </td>
                <td style={{ textAlign: "center", padding: "10px 12px" }}>
                  {overall_gpa != null ? (
                    <span style={{
                      fontSize: 12, fontWeight: 700, borderRadius: 50, padding: "3px 12px",
                      color: overall_gpa >= 75 ? "#2e6b0d" : "#c92a2a",
                      background: overall_gpa >= 75 ? "#e8f5e0" : "#fde8e8",
                    }}>
                      {overall_gpa >= 75 ? "Passed" : "Failed"}
                    </span>
                  ) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* Footer */}
        <div style={{ marginTop: 32, borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            Generated: {new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ borderTop: `1px solid ${C.dark}`, width: 200, marginBottom: 4 }} />
            <div style={{ fontSize: 11, color: C.muted }}>Registrar's Signature over Printed Name</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ borderTop: `1px solid ${C.dark}`, width: 200, marginBottom: 4 }} />
            <div style={{ fontSize: 11, color: C.muted }}>School Principal's Signature</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          #report-card-print {
            max-width: 100% !important;
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 24px 32px !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </>
  );
}

function InfoRow({ label, value, span }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.dark, fontWeight: 600, marginTop: 1 }}>{value || "—"}</div>
    </div>
  );
}
