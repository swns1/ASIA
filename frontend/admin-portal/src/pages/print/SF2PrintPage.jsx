import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { getSchoolSettings } from "../../api/billingApi";
import { getEnrollments } from "../../api/enrollmentApi";
import { getAttendance } from "../../api/attendanceApi";
import { downloadAsPDF } from "../../utils/pdfExport";
import { isPresentStatus } from "../../utils/attendance";
import { PRINT_COLORS as C, PRINT_FONT } from "../../components/print/theme";
import { PrintToolbar, ToolbarButton } from "../../components/print/PrintToolbar";
import { PrintShell, PrintLoading, PrintError } from "../../components/print/PrintShell";
import { PrintLetterhead } from "../../components/print/PrintLetterhead";
import { SignatureRow, SignatureBlock, GeneratedStamp } from "../../components/print/SignatureBlock";

function getDaysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const days = [], d = new Date(y, m - 1, 1);
  while (d.getMonth() === m - 1) {
    const dow = d.getDay();
    days.push({ date: d.toISOString().slice(0, 10), day: d.getDate(), isWeekend: dow === 0 || dow === 6 });
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}

const SLASH = { P: "/", L: "/", A: "", E: "" };

export default function SF2PrintPage() {
  const [sp] = useSearchParams();
  const school_year = sp.get("school_year") || "";
  const grade_level = sp.get("grade_level") || "";
  const section     = sp.get("section")     || "";
  const month       = sp.get("month")       || new Date().toISOString().slice(0, 7);
  const adviser     = sp.get("adviser")     || "";
  const division    = sp.get("division")    || "";
  const region      = sp.get("region")      || "";
  const district    = sp.get("district")    || "";

  const [settings,      setSettings]      = useState(null);
  const [enrollments,   setEnrollments]   = useState([]);
  const [attMap,        setAttMap]        = useState({});
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [downloading,   setDownloading]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [sett, enrData] = await Promise.all([
          getSchoolSettings().catch(() => null),
          getEnrollments({ school_year, grade_level, section, enrollment_status: "enrolled", page_size: 300 }),
        ]);
        setSettings(sett);
        const list = (Array.isArray(enrData) ? enrData : (enrData?.results ?? []))
          .sort((a, b) => (a.student_detail?.last_name ?? "").localeCompare(b.student_detail?.last_name ?? ""));
        setEnrollments(list);

        const [y, m] = month.split("-").map(Number);
        const att = await getAttendance({
          date__gte: `${month}-01`,
          date__lte: new Date(y, m, 0).toISOString().slice(0, 10),
          enrollment__school_year: school_year,
          enrollment__grade_level: grade_level,
          enrollment__section:     section,
          page_size: 5000,
        });
        const recs = Array.isArray(att) ? att : (att?.results ?? []);
        const map = {};
        list.forEach(e => { map[e.enrollment_id] = {}; });
        recs.forEach(r => {
          if (!map[r.enrollment]) map[r.enrollment] = {};
          map[r.enrollment][r.date] = r.status;
        });
        setAttMap(map);
      } catch (e) {
        setError(e.message || "Failed to load.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days       = getDaysInMonth(month);
  const schoolDays = days.filter(d => !d.isWeekend);

  const handleDownload = async () => {
    setDownloading(true);
    await downloadAsPDF("sf2-doc", `SF2-${grade_level}-${section}-${month}.pdf`, { landscape: true });
    setDownloading(false);
  };

  if (loading) return <PrintLoading label="Loading SF2…" />;
  if (error) return <PrintError message={error} />;

  const schoolName    = settings?.school_name || "South Lakes Integrated School";
  const schoolAddress = settings?.school_address || "";
  const males   = enrollments.filter(e => (e.student_detail?.sex || "").toLowerCase() === "male").length;
  const females = enrollments.filter(e => (e.student_detail?.sex || "").toLowerCase() === "female").length;

  const TH = (s = {}) => ({ border: `1px solid ${C.border}`, fontSize: 7, fontWeight: 700, textAlign: "center", verticalAlign: "middle", padding: "1px 0", background: C.bg, color: C.dark, lineHeight: 1.2, fontFamily: PRINT_FONT, ...s });
  const TD = (s = {}) => ({ border: `1px solid ${C.border}`, fontSize: 7, textAlign: "center", verticalAlign: "middle", padding: 0, height: 15, color: C.dark, ...s });
  const WK = TD({ background: "#eee" });

  return (
    <>
      <PrintToolbar
        onBack={() => window.close()}
        title={`SF2 Daily Attendance Register — ${grade_level} · ${section} · ${monthLabel(month)}`}
        actions={
          <>
            <ToolbarButton onClick={handleDownload} disabled={downloading} icon="download">
              {downloading ? "Generating…" : "Download PDF (Landscape)"}
            </ToolbarButton>
            <ToolbarButton onClick={() => window.print()} primary icon="printer">Print</ToolbarButton>
          </>
        }
      />

      <PrintShell id="sf2-doc" maxWidth={1240} orientation="landscape" pageMargin="5mm" padding="8mm 10mm" backdrop>
        <PrintLetterhead
          variant="deped"
          schoolName={schoolName}
          schoolAddress={schoolAddress}
          region={region}
          division={division}
          district={district}
          formCode="SF 2"
          title="Daily Attendance Register"
        />

        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4, fontSize: 8, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "3px 2px", marginBottom: 5 }}>
          <span><b>School Year:</b> {school_year}</span>
          <span><b>Grade Level &amp; Section:</b> {grade_level} — {section}</span>
          <span><b>Month:</b> {monthLabel(month)}</span>
          {adviser && <span><b>Adviser:</b> {adviser}</span>}
        </div>

        <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 150 }} />
            <col style={{ width: 60 }} />
            {days.flatMap(d => d.isWeekend
              ? [<col key={d.date} style={{ width: 8 }} />]
              : [<col key={`${d.date}-a`} style={{ width: 10 }} />, <col key={`${d.date}-p`} style={{ width: 10 }} />]
            )}
            <col style={{ width: 22 }} />
            <col style={{ width: 22 }} />
          </colgroup>

          <thead>
            <tr>
              <th rowSpan={2} style={TH({ textAlign: "left", paddingLeft: 3, fontSize: 7.5 })}>
                LEARNER'S NAME
                <div style={{ fontWeight: 400, fontSize: 6, marginTop: 1 }}>(Last Name, First Name, M.I.)</div>
              </th>
              <th rowSpan={2} style={TH({ fontSize: 7 })}>LRN</th>
              {days.flatMap(d => d.isWeekend
                ? [<th key={d.date} rowSpan={2} style={TH({ background: "#eee", fontSize: 6 })}>{d.day}</th>]
                : [<th key={d.date} colSpan={2} style={TH({ fontSize: 7 })}>{d.day}</th>]
              )}
              <th rowSpan={2} style={TH({ fontSize: 6.5 })}>Days<br />Present</th>
              <th rowSpan={2} style={TH({ fontSize: 6.5 })}>Days<br />Absent</th>
            </tr>

            <tr>
              {days.filter(d => !d.isWeekend).flatMap(d => [
                <th key={`${d.date}-am`} style={TH({ fontSize: 5.5, background: C.bg })}>AM</th>,
                <th key={`${d.date}-pm`} style={TH({ fontSize: 5.5, background: C.bg })}>PM</th>,
              ])}
            </tr>
          </thead>

          <tbody>
            {enrollments.map((en, idx) => {
              const st  = en.student_detail || {};
              const rec = attMap[en.enrollment_id] || {};
              const name = `${st.last_name || "—"}, ${st.first_name || ""}${st.middle_name ? " " + st.middle_name[0] + "." : ""}${st.suffix ? " " + st.suffix : ""}`;
              let present = 0, absent = 0;
              schoolDays.forEach(d => {
                const s = rec[d.date];
                if (!s) return;
                if (isPresentStatus(s)) present++;
                else absent++;
              });

              return (
                <tr key={en.enrollment_id}>
                  <td title={name} style={TD({ textAlign: "left", paddingLeft: 3, fontSize: 7, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" })}>
                    {idx + 1}. {name}
                  </td>
                  <td style={TD({ fontSize: 6 })}>{st.lrn || ""}</td>
                  {days.flatMap(d => {
                    if (d.isWeekend) return [<td key={d.date} style={WK} />];
                    const mark = SLASH[rec[d.date]] ?? "";
                    return [
                      <td key={`${d.date}-am`} style={TD({ fontSize: 9, fontWeight: 700 })}>{mark}</td>,
                      <td key={`${d.date}-pm`} style={TD({ fontSize: 9, fontWeight: 700 })}>{mark}</td>,
                    ];
                  })}
                  <td style={TD({ fontWeight: 700, fontSize: 8 })}>{present || ""}</td>
                  <td style={TD({ fontWeight: 700, fontSize: 8 })}>{absent || ""}</td>
                </tr>
              );
            })}

            <tr>
              <td colSpan={2} style={TD({ textAlign: "right", fontWeight: 700, fontSize: 7, paddingRight: 4, background: C.bg })}>
                TOTAL ENROLLED
              </td>
              {days.flatMap(d => d.isWeekend
                ? [<td key={d.date} style={WK} />]
                : [<td key={`${d.date}-a`} style={TD({ background: C.bg })} />, <td key={`${d.date}-p`} style={TD({ background: C.bg })} />]
              )}
              <td style={TD({ fontWeight: 700, fontSize: 8, background: C.bg })} />
              <td style={TD({ fontWeight: 700, fontSize: 8, background: C.bg })}>{enrollments.length}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 6, fontSize: 7.5, display: "flex", gap: 24, color: C.dark }}>
          <span><b>Total School Days:</b> {schoolDays.length}</span>
          <span><b>Total Enrolled:</b> {enrollments.length}</span>
          <span><b>Male:</b> {males}</span>
          <span><b>Female:</b> {females}</span>
        </div>

        <SignatureRow>
          <SignatureBlock heading="Prepared by:" role="Adviser / Class Teacher" caption="Signature over Printed Name / Date" width={180} />
          <SignatureBlock heading="Noted by:" role="School Principal" caption="Signature over Printed Name / Date" width={180} />
          <GeneratedStamp />
        </SignatureRow>
      </PrintShell>
    </>
  );
}
