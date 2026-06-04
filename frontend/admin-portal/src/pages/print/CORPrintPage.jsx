import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getEnrollment, getSubjects } from "../../api/enrollmentApi";
import { getStudent } from "../../api/studentApi";
import { getSchoolSettings } from "../../api/billingApi";
import logo from "../../assets/logo.png";

const C = {
  dark: "#1a0a0a", muted: "#7a5050", border: "#e8d8d8",
  red: "#e03131", bg: "#fff8f6",
};

const STATUS_META = {
  enrolled:  { label: "Enrolled",  color: "#2e6b0d", bg: "#e8f5e0" },
  pending:   { label: "Pending",   color: "#854f0b", bg: "#faeeda" },
  completed: { label: "Completed", color: "#1455a0", bg: "#e3f0fd" },
  cancelled: { label: "Cancelled", color: "#5c5752", bg: "#f0ede8" },
};

function InfoRow({ label, value, span }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.dark, fontWeight: 600, marginTop: 1 }}>{value || "—"}</div>
    </div>
  );
}

export default function CORPrintPage() {
  const { enrollmentId } = useParams();
  const [enrollment,  setEnrollment]  = useState(null);
  const [student,     setStudent]     = useState(null);
  const [subjects,    setSubjects]    = useState([]);
  const [schoolName,  setSchoolName]  = useState("South Lakes Integrated School");
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const enr = await getEnrollment(enrollmentId);
        setEnrollment(enr);
        const studentId = enr.student_detail?.student_id ?? enr.student;
        const [stu, subs, settings] = await Promise.all([
          getStudent(studentId),
          getSubjects({
            school_level: enr.school_level,
            ...(enr.strand   ? { strand:   enr.strand   } : {}),
            ...(enr.semester ? { semester: enr.semester } : {}),
          }),
          getSchoolSettings().catch(() => null),
        ]);
        setStudent(stu);
        setSubjects(Array.isArray(subs) ? subs : subs.results ?? []);
        if (settings?.school_name) setSchoolName(settings.school_name);
      } catch (e) {
        setError(e.message || "Failed to load enrollment data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [enrollmentId]);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', Arial, sans-serif", color: C.muted, fontSize: 15 }}>
      Loading…
    </div>
  );

  if (error || !enrollment || !student) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', Arial, sans-serif" }}>
      <div style={{ textAlign: "center", color: C.red }}>{error || "Enrollment not found."}</div>
    </div>
  );

  const fullName   = [student.last_name, student.first_name, student.middle_name].filter(Boolean).join(", ");
  const statusMeta = STATUS_META[enrollment.enrollment_status] ?? STATUS_META.enrolled;

  return (
    <>
      {/* Toolbar */}
      <div className="no-print" style={{ background: C.dark, padding: "12px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={() => window.close()}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }} /> Close
        </button>
        <div style={{ flex: 1, color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
          Certificate of Registration — {fullName} · SY {enrollment.school_year}
        </div>
        <button onClick={() => window.print()}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 20px", border: "none", borderRadius: 8, background: C.red, color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
          <i className="ti ti-printer" style={{ fontSize: 15 }} />
          Print
        </button>
      </div>

      {/* Document */}
      <div id="cor-doc" style={{ maxWidth: 900, margin: "32px auto", background: "white", border: `1px solid ${C.border}`, borderRadius: 12, padding: "32px 40px", fontFamily: "'DM Sans', Arial, sans-serif" }}>

        {/* School header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, borderBottom: `2px solid ${C.border}`, paddingBottom: 16 }}>
          <img src={logo} alt="Logo" style={{ width: 52, height: 76, objectFit: "contain" }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
              Republic of the Philippines — Department of Education
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, lineHeight: 1.2 }}>{schoolName}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              Certificate of Registration — School Year {enrollment.school_year}
            </div>
          </div>
        </div>

        {/* Student info strip */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 24px", marginBottom: 20, padding: "14px 18px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <InfoRow label="Name"          value={fullName}          span />
          <InfoRow label="LRN"           value={student.lrn} />
          <InfoRow label="Student No."   value={student.student_number} />
          <InfoRow label="Sex"           value={student.sex} />
          <InfoRow label="Date of Birth" value={student.date_of_birth
            ? new Date(student.date_of_birth).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })
            : null} />
          <InfoRow label="Grade Level"   value={enrollment.grade_level} />
          <InfoRow label="Section"       value={enrollment.section} />
          {enrollment.strand   && <InfoRow label="Strand"   value={enrollment.strand} />}
          {enrollment.semester && <InfoRow label="Semester" value={enrollment.semester === "1st" ? "1st Semester" : "2nd Semester"} />}
          <InfoRow label="School Year"   value={enrollment.school_year} />
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: statusMeta.color, background: statusMeta.bg, padding: "2px 10px", borderRadius: 50 }}>
              {statusMeta.label}
            </span>
          </div>
        </div>

        {/* Subjects table */}
        {subjects.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 14 }}>
            No subjects on record for this enrollment.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 24 }}>
            <thead>
              <tr style={{ background: C.dark }}>
                <th style={{ textAlign: "center", padding: "10px 12px", color: "white", fontWeight: 700, fontSize: 12, width: 40, borderRadius: "6px 0 0 0" }}>#</th>
                <th style={{ textAlign: "center", padding: "10px 12px", color: "white", fontWeight: 700, fontSize: 12, width: 110 }}>Code</th>
                <th style={{ textAlign: "left",   padding: "10px 12px", color: "white", fontWeight: 700, fontSize: 12 }}>Subject Name</th>
                {enrollment.school_level === "SHS" && <th style={{ textAlign: "center", padding: "10px 12px", color: "white", fontWeight: 700, fontSize: 12 }}>Strand</th>}
                {enrollment.school_level === "SHS"
                  ? <th style={{ textAlign: "center", padding: "10px 12px", color: "white", fontWeight: 700, fontSize: 12, borderRadius: "0 6px 0 0" }}>Semester</th>
                  : <th style={{ borderRadius: "0 6px 0 0", padding: 0, width: 0 }} />}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s, i) => (
                <tr key={s.subject_id ?? i} style={{ background: i % 2 === 0 ? "white" : C.bg, borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ textAlign: "center", padding: "9px 12px", color: C.muted, fontSize: 12 }}>{i + 1}</td>
                  <td style={{ textAlign: "center", padding: "9px 12px", color: C.muted, fontSize: 12, fontFamily: "monospace" }}>{s.subject_code}</td>
                  <td style={{ textAlign: "left",   padding: "9px 12px", color: C.dark, fontWeight: 500 }}>{s.subject_name}</td>
                  {enrollment.school_level === "SHS" && <td style={{ textAlign: "center", padding: "9px 12px", color: C.muted, fontSize: 12 }}>{s.strand || "—"}</td>}
                  {enrollment.school_level === "SHS" && <td style={{ textAlign: "center", padding: "9px 12px", color: C.muted, fontSize: 12 }}>{s.semester || "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Certification text */}
        <div style={{ padding: "12px 16px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 28, fontSize: 12, color: C.muted, lineHeight: 1.8, fontStyle: "italic" }}>
          This certifies that{" "}
          <strong style={{ color: C.dark }}>
            {student.first_name} {student.middle_name ? student.middle_name[0] + ". " : ""}{student.last_name}
          </strong>{" "}
          is officially enrolled for School Year <strong style={{ color: C.dark }}>{enrollment.school_year}</strong> at{" "}
          <strong style={{ color: C.dark }}>{schoolName}</strong> under{" "}
          <strong style={{ color: C.dark }}>{enrollment.grade_level}</strong>
          {enrollment.section ? `, Section ${enrollment.section}` : ""}.
        </div>

        {/* Footer */}
        <div style={{ marginTop: 32, borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            Generated: {new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
          </div>
          <SigBlock label="Registrar's Signature over Printed Name" />
          <SigBlock label="School Principal's Signature" />
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          #cor-doc { max-width: 100% !important; margin: 0 !important; border: none !important; border-radius: 0 !important; padding: 24px 32px !important; }
        }
      `}</style>
    </>
  );
}

function SigBlock({ label }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ borderTop: `1px solid ${C.dark}`, width: 200, marginBottom: 4 }} />
      <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
    </div>
  );
}