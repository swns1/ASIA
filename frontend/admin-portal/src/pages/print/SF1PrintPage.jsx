import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { getEnrollments } from "../../api/enrollmentApi";
import { getSchoolSettings } from "../../api/billingApi";
import { getGuardiansByStudent } from "../../api/guardianApi";
import { downloadAsPDF } from "../../utils/pdfExport";
import { PRINT_COLORS as C, PRINT_FONT } from "../../components/print/theme";
import { PrintToolbar, ToolbarButton } from "../../components/print/PrintToolbar";
import { PrintShell, PrintLoading, PrintError } from "../../components/print/PrintShell";
import { PrintLetterhead } from "../../components/print/PrintLetterhead";
import { InfoStrip, InfoItem } from "../../components/print/InfoGrid";
import { SignatureRow, SignatureBlock, GeneratedStamp } from "../../components/print/SignatureBlock";

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
    fontFamily: mono ? "monospace" : PRINT_FONT,
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
  const district   = searchParams.get("district")    || "";

  const [rows,          setRows]          = useState([]);
  const [schoolName,    setSchoolName]    = useState("South Lakes Integrated School");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [downloading,   setDownloading]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [enrollData, settings] = await Promise.all([
          getEnrollments({ school_year: schoolYear, grade_level: gradeLevel, section, page_size: 100 }),
          getSchoolSettings().catch(() => null),
        ]);

        if (settings?.school_name) setSchoolName(settings.school_name);
        if (settings?.school_address) setSchoolAddress(settings.school_address);

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

  if (loading) return <PrintLoading label="Loading class data…" />;
  if (error) return <PrintError message={error} />;

  return (
    <>
      <PrintToolbar
        onBack={() => window.close()}
        title={`SF1 School Register — ${gradeLevel} · ${section} · SY ${schoolYear} · ${rows.length} learner${rows.length !== 1 ? "s" : ""}`}
        actions={
          <ToolbarButton onClick={handleDownload} disabled={downloading} primary icon="download">
            {downloading ? "Generating…" : "Download PDF (Landscape)"}
          </ToolbarButton>
        }
      />

      <PrintShell id="sf1-doc" maxWidth={1200} orientation="landscape" pageMargin="8mm" padding="24px 28px" backdrop>
        <PrintLetterhead
          variant="deped"
          schoolName={schoolName}
          schoolAddress={schoolAddress}
          region={region}
          division={division}
          district={district}
          formCode="SF 1"
          title="School Register"
        />

        <InfoStrip>
          <InfoItem inline label="School Year" value={schoolYear} />
          <InfoItem inline label="Grade / Year Level" value={gradeLevel} />
          <InfoItem inline label="Section" value={section} />
          <InfoItem inline label="Adviser" value={adviser} />
          <InfoItem inline label="No. of Learners" value={rows.length} />
        </InfoStrip>

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
                  const rowBg = i % 2 === 0 ? "white" : C.bg;

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

        <SignatureRow>
          <SignatureBlock heading="Prepared by:" printedName={adviser || "________________________________"} role="Adviser / Class Teacher" />
          <SignatureBlock heading="Certified Correct:" role="School Head / Principal" />
          <GeneratedStamp />
        </SignatureRow>
      </PrintShell>
    </>
  );
}
