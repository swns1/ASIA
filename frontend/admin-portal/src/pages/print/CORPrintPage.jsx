import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getEnrollment, getSubjects } from "../../api/enrollmentApi";
import { getStudent } from "../../api/studentApi";
import { getSchoolSettings } from "../../api/billingApi";
import { downloadAsPDF } from "../../utils/pdfExport";
import { PRINT_COLORS as C } from "../../components/print/theme";
import { PrintToolbar, ToolbarButton } from "../../components/print/PrintToolbar";
import { PrintShell, PrintLoading, PrintError } from "../../components/print/PrintShell";
import { PrintLetterhead } from "../../components/print/PrintLetterhead";
import { InfoGrid, InfoItem } from "../../components/print/InfoGrid";
import { SignatureRow, SignatureBlock, GeneratedStamp } from "../../components/print/SignatureBlock";
import { StatusBadge } from "../../components/print/StatusBadge";
import { ENROLLMENT_STATUS_META } from "../../components/print/statusMeta";

export default function CORPrintPage() {
  const { enrollmentId } = useParams();
  const [enrollment,     setEnrollment]     = useState(null);
  const [student,        setStudent]        = useState(null);
  const [subjects,       setSubjects]       = useState([]);
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
        if (settings?.school_address) setSchoolAddress(settings.school_address);
      } catch (e) {
        setError(e.message || "Failed to load enrollment data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [enrollmentId]);

  const handleDownload = async () => {
    setDownloading(true);
    await downloadAsPDF("cor-doc", `COR-${enrollmentId}.pdf`);
    setDownloading(false);
  };

  if (loading) return <PrintLoading label="Loading…" />;
  if (error || !enrollment || !student) return <PrintError message={error || "Enrollment not found."} />;

  const fullName  = [student.last_name, student.first_name, student.middle_name].filter(Boolean).join(", ");
  const isSHS     = enrollment.school_level === "senior_highschool";

  return (
    <>
      <PrintToolbar
        onBack={() => window.close()}
        title={`Certificate of Registration — ${fullName} · SY ${enrollment.school_year}`}
        actions={
          <>
            <ToolbarButton onClick={handleDownload} disabled={downloading} icon="download">
              {downloading ? "Generating…" : "Download PDF"}
            </ToolbarButton>
            <ToolbarButton onClick={() => window.print()} primary icon="printer">Print</ToolbarButton>
          </>
        }
      />

      <PrintShell id="cor-doc" maxWidth={900} orientation="portrait">
        <PrintLetterhead
          variant="standard"
          schoolName={schoolName}
          schoolAddress={schoolAddress}
          subtitle={`Certificate of Registration — School Year ${enrollment.school_year}`}
        />

        <InfoGrid columns={3}>
          <InfoItem label="Name"          value={fullName}          span />
          <InfoItem label="LRN"           value={student.lrn} />
          <InfoItem label="Student No."   value={student.student_number} />
          <InfoItem label="Sex"           value={student.sex} />
          <InfoItem label="Date of Birth" value={student.birth_date
            ? new Date(student.birth_date).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })
            : null} />
          <InfoItem label="Grade Level"   value={enrollment.grade_level} />
          <InfoItem label="Section"       value={enrollment.section} />
          {enrollment.strand   && <InfoItem label="Strand"   value={enrollment.strand} />}
          {enrollment.semester && <InfoItem label="Semester" value={enrollment.semester === "1st" ? "1st Semester" : "2nd Semester"} />}
          <InfoItem label="School Year"   value={enrollment.school_year} />
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</span>
            <StatusBadge status={enrollment.enrollment_status} meta={ENROLLMENT_STATUS_META} defaultKey="enrolled" />
          </div>
        </InfoGrid>

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
                {isSHS && <th style={{ textAlign: "center", padding: "10px 12px", color: "white", fontWeight: 700, fontSize: 12 }}>Strand</th>}
                {isSHS
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
                  {isSHS && <td style={{ textAlign: "center", padding: "9px 12px", color: C.muted, fontSize: 12 }}>{s.strand || "—"}</td>}
                  {isSHS && <td style={{ textAlign: "center", padding: "9px 12px", color: C.muted, fontSize: 12 }}>{s.semester || "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}

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

        <SignatureRow>
          <GeneratedStamp />
          <SignatureBlock role="Registrar's Signature over Printed Name" />
          <SignatureBlock role="School Principal's Signature" />
        </SignatureRow>
      </PrintShell>
    </>
  );
}
