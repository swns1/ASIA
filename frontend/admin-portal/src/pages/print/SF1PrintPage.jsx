import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { getEnrollments } from "../../api/enrollmentApi";
import { getSchoolSettings } from "../../api/billingApi";
import { getGuardiansByStudent } from "../../api/guardianApi";
import { downloadAsPDF } from "../../utils/pdfExport";
import logo from "../../assets/logo.png";

const C = {
  dark: "#1a0a0a", muted: "#7a5050", border: "#d0c8c8", red: "#e03131", bg: "#fff8f6",
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—";

function ageAsOfJune1(birthDate, schoolYear) {
  if (!birthDate) return "—";
  const startYear = schoolYear ? parseInt(schoolYear.split("-")[0]) : new Date().getFullYear();
  const birth = new Date(birthDate);
  let age = startYear - birth.getFullYear();
  const m = 5 - birth.getMonth();
  if (m < 0 || (m === 0 && 1 < birth.getDate())) age--;
  return age > 0 ? age : "—";
}

const TH = ({ children, w, first, last }) => (
  <th style={{
    padding: "7px 5px", color: "white", fontWeight: 700, fontSize: 8.5,
    textAlign: "center", whiteSpace: "pre-line", lineHeight: 1.3, width: w,
    border: "1px solid rgba(255,255,255,0.25)",
    background: C.dark,
    ...(first && { borderRadius: "5px 0 0 0" }),
    ...(last  && { borderRadius: "0 5px 0 0" }),
  }}>
    {children}
  </th>
);

const TD = ({ children, left, bold, mono }) => (
  <td style={{
    padding: "6px 5px", fontSize: 9.5, color: C.dark, verticalAlign: "top",
    textAlign: left ? "left" : "center",
    fontWeight: bold ? 600 : 400,
    fontFamily: mono ? "monospace" : "'DM Sans',Arial,sans-serif",
    border: `1px solid ${C.border}`,
  }}>
    {children ?? "—"}
  </td>
);

export default function SF1PrintPage() {
  const [searchParams] = useSearchParams();
  const schoolYear = searchParams.get("school_year") || "";
  const gradeLevel = searchParams.get("grade_level") || "";
  const section    = searchParams.get("section")     || "";
  const adviser    = searchParams.get("adviser")     || "";
  const division   = searchParams.get("division")    || "";
  const region     = searchParams.get("region")      || "";

  const [rows,        setRows]        = useState([]);
  const [schoolName,  setSchoolName]  = useState("South Lakes Integrated School");
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [enrollData, settings] = await Promise.all([
          getEnrollments({ school_year: schoolYear, grade_level: gradeLevel, section, page_size: 100 }),
          getSchoolSettings().catch(() => null),
        ]);

        if (settings?.school_name) setSchoolName(settings.school_name);

        const enrollments = (Array.isArray(enrollData) ? enrollData : enrollData.results ?? [])
          .sort((a, b) => {
            const la = (a.student_detail?.last_name ?? "").toLowerCase();
            const lb = (b.student_detail?.last_name ?? "").toLowerCase();
            return la.localeCompare(lb);
          });

        const studentIds = enrollments.map((e) =>
          e.student_id ?? e.student ?? e.student_detail?.student_id
        );

        const guardiansArr = await Promise.all(
          studentIds.map((id) =>
            id
              ? getGuardiansByStudent(id)
                  .then((d) => Array.isArray(d) ? d : d.results ?? [])
                  .catch(() => [])
              : Promise.resolve([])
          )
        );

        setRows(
          enrollments.map((enr, i) => {
            const sd      = enr.student_detail ?? {};
            const gds     = guardiansArr[i] ?? [];
            const father   = gds.find((g) => g.relationship === "father");
            const mother   = gds.find((g) => g.relationship === "mother");
            const guardian = gds.find((g) => g.relationship === "guardian");
            const contact  = father?.mobile_number ?? mother?.mobile_number
                          ?? guardian?.mobile_number ?? sd.mobile_number ?? "";
            return { enr, sd, father, mother, guardian, contact };
          })
        );
      } catch (e) {
        setError(e.message || "Failed to load class data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [schoolYear, gradeLevel, section]);

  const handleDownload = async () => {
    setDownloading(true);
    await downloadAsPDF(
      "sf1-doc",
      `SF1-${gradeLevel}-${section}-SY${schoolYear}.pdf`,
      { landscape: true }
    );
    setDownloading(false);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',Arial,sans-serif", color: C.muted, fontSize: 15 }}>
      Loading class data…
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',Arial,sans-serif" }}>
      <div style={{ color: C.red, textAlign: "center" }}>{error}</div>
    </div>
  );

  return (
    <>
      {/* Toolbar */}
      <div className="no-print" style={{ background: C.dark, padding: "12px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={() => window.close()}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }} /> Close
        </button>
        <div style={{ flex: 1, color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
          SF1 School Register — {gradeLevel} · {section} · SY {schoolYear} · {rows.length} learner{rows.length !== 1 ? "s" : ""}
        </div>
        <button onClick={handleDownload} disabled={downloading}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 20px", border: "none", borderRadius: 8, background: C.red, color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", opacity: downloading ? 0.7 : 1 }}>
          <i className="ti ti-download" style={{ fontSize: 15 }} />
          {downloading ? "Generating…" : "Download PDF (Landscape)"}
        </button>
      </div>

      {/* Page bg */}
      <div style={{ background: "#ebebeb", minHeight: "100vh", padding: "24px", fontFamily: "'DM Sans',Arial,sans-serif" }}>
        <div id="sf1-doc" style={{ maxWidth: 1200, margin: "0 auto", background: "white", border: `1px solid ${C.border}`, borderRadius: 8, padding: "24px 28px" }}>

          {/* DepEd Header */}
          <div style={{ borderBottom: `2px solid ${C.border}`, paddingBottom: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>

              {/* Left: Region + Division */}
              <div style={{ fontSize: 10, color: C.muted, minWidth: 180 }}>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Region: </span>
                  <span style={{ color: C.dark, fontWeight: 600 }}>{region || <span style={{ borderBottom: "1px solid #aaa", display: "inline-block", width: 120 }}>&nbsp;</span>}</span>
                </div>
                <div>
                  <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Division: </span>
                  <span style={{ color: C.dark, fontWeight: 600 }}>{division || <span style={{ borderBottom: "1px solid #aaa", display: "inline-block", width: 110 }}>&nbsp;</span>}</span>
                </div>
              </div>

              {/* Center: Logo + School + Title */}
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 4 }}>
                  <img src={logo} alt="Logo" style={{ width: 44, height: 64, objectFit: "contain" }} />
                  <div>
                    <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.07em", textTransform: "uppercase" }}>Republic of the Philippines — Department of Education</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, lineHeight: 1.2, marginTop: 2 }}>{schoolName}</div>
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.dark, textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 4 }}>
                  SCHOOL REGISTER
                </div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>(SF 1)</div>
              </div>

              {/* Right: spacer to balance */}
              <div style={{ minWidth: 180 }} />
            </div>
          </div>

          {/* Class info strip */}
          <div style={{ display: "flex", gap: 28, marginBottom: 10, fontSize: 11, flexWrap: "wrap", padding: "6px 2px", borderBottom: `1px solid ${C.border}` }}>
            <InfoItem label="School Year" value={schoolYear} />
            <InfoItem label="Grade / Year Level" value={gradeLevel} />
            <InfoItem label="Section" value={section} />
            <InfoItem label="Adviser" value={adviser} />
            <InfoItem label="No. of Learners" value={rows.length} />
          </div>

          {/* Table */}
          {rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: 14 }}>
              No enrolled learners found for <strong>{gradeLevel} — {section}</strong> (SY {schoolYear}).
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <TH w="3%"  first>#</TH>
                    <TH w="10%">LRN</TH>
                    <TH w="18%">{"LEARNER'S NAME\n(Last, First, Middle, Ext.)"}</TH>
                    <TH w="3.5%">SEX</TH>
                    <TH w="3.5%">{"AGE\n(June 1)"}</TH>
                    <TH w="8%">BIRTH DATE</TH>
                    <TH w="14%">ADDRESS</TH>
                    <TH w="9%">{"FATHER'S\nNAME"}</TH>
                    <TH w="9%">{"MOTHER'S\nNAME"}</TH>
                    <TH w="9%">{"GUARDIAN'S\nNAME"}</TH>
                    <TH w="8%">{"CONTACT\nNUMBER"}</TH>
                    <TH w="5%" last>REMARKS</TH>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ sd, father, mother, guardian, contact }, i) => {
                    const nameParts = [
                      sd.last_name,
                      sd.first_name,
                      sd.middle_name,
                      sd.suffix,
                    ].filter(Boolean);
                    const fullName = nameParts.join(", ");
                    const rowBg = i % 2 === 0 ? "white" : "#fff8f6";

                    return (
                      <tr key={sd.student_id ?? i} style={{ background: rowBg }}>
                        <TD>{i + 1}</TD>
                        <TD mono>{sd.lrn}</TD>
                        <TD left bold>{fullName || "—"}</TD>
                        <TD>{sd.sex === "male" ? "M" : sd.sex === "female" ? "F" : "—"}</TD>
                        <TD>{ageAsOfJune1(sd.birth_date, schoolYear)}</TD>
                        <TD>{fmtDate(sd.birth_date)}</TD>
                        <TD left>{sd.current_address}</TD>
                        <TD left>{father?.full_name}</TD>
                        <TD left>{mother?.full_name}</TD>
                        <TD left>{guardian?.full_name}</TD>
                        <TD>{contact || "—"}</TD>
                        <TD>{""}</TD>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Signatures */}
          <div style={{ marginTop: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ fontSize: 10, color: C.muted }}>
              <div style={{ fontWeight: 600, marginBottom: 20 }}>Prepared by:</div>
              <div style={{ borderTop: `1px solid ${C.dark}`, width: 220, marginBottom: 4 }} />
              <div style={{ fontWeight: 700, color: C.dark }}>{adviser || "________________________________"}</div>
              <div>Adviser / Class Teacher</div>
            </div>
            <div style={{ fontSize: 10, color: C.muted, textAlign: "center" }}>
              <div style={{ fontWeight: 600, marginBottom: 20 }}>Certified Correct:</div>
              <div style={{ borderTop: `1px solid ${C.dark}`, width: 240, marginBottom: 4, margin: "20px auto 4px" }} />
              <div>School Head / Principal</div>
            </div>
            <div style={{ fontSize: 10, color: C.muted, textAlign: "right" }}>
              Generated: {new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          #sf1-doc { max-width: 100% !important; margin: 0 !important; border: none !important; border-radius: 0 !important; padding: 10px 14px !important; }
        }
        @page { size: A4 landscape; margin: 8mm; }
      `}</style>
    </>
  );
}

function InfoItem({ label, value }) {
  return (
    <span>
      <span style={{ color: "#9a7070", fontWeight: 500 }}>{label}: </span>
      <strong style={{ color: "#1a0a0a" }}>{value || <span style={{ borderBottom: "1px solid #bbb", display: "inline-block", width: 80 }}>&nbsp;</span>}</strong>
    </span>
  );
}