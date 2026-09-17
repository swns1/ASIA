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
import { localISODate } from "../../utils/format";

function getDaysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const days = [], d = new Date(y, m - 1, 1);
  while (d.getMonth() === m - 1) {
    const dow = d.getDay();
    days.push({ date: localISODate(d), day: d.getDate(), isWeekend: dow === 0 || dow === 6 });
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}

// DepEd SF2 legend: a BLANK cell means the learner was present, "x" marks an
// absence, and "/" marks a tardy. The previous map inverted this — it put a
// mark on every present learner and left absences blank, so a perfect-
// attendance register and a fully-absent one printed identically.
//
// The official daily grid does not distinguish excused from unexcused
// absence; both print "x". The distinction is preserved in the data and in
// the app, just not on this form.
const MARK = { P: "", L: "/", A: "x", E: "x" };

// DepEd requires learners listed MALE first (alphabetically), then FEMALE
// (alphabetically), with per-sex subtotals. Anything else is the first thing
// a registrar notices on a printed form.
const SEX_RANK = { male: 0, female: 1 };

function learnerSortKey(en) {
  const st = en.student_detail || {};
  return `${st.last_name ?? ""} ${st.first_name ?? ""}`.trim().toLowerCase();
}

// StandardPagination caps page_size at 500 (enrollment_service/pagination.py),
// so the old `page_size: 5000` silently returned only the first 500 records.
// Default ordering is "-date", so a normal-size section (40 learners × ~22
// school days ≈ 880 rows) lost its earliest days for everyone, and Days
// Present / Days Absent printed short. Walk every page instead.
const ATTENDANCE_PAGE_SIZE = 500;
const ATTENDANCE_MAX_PAGES = 20;

async function fetchAllAttendance(params) {
  const out = [];
  for (let page = 1; page <= ATTENDANCE_MAX_PAGES; page += 1) {
    const res  = await getAttendance({ ...params, page, page_size: ATTENDANCE_PAGE_SIZE });
    const rows = Array.isArray(res) ? res : (res?.results ?? []);
    out.push(...rows);
    // A plain array means the endpoint isn't paginated; one pass is all there is.
    if (Array.isArray(res) || !res?.next) break;
  }
  return out;
}

function bySexThenName(a, b) {
  const ra = SEX_RANK[(a.student_detail?.sex ?? "").toLowerCase()] ?? 2;
  const rb = SEX_RANK[(b.student_detail?.sex ?? "").toLowerCase()] ?? 2;
  if (ra !== rb) return ra - rb;
  return learnerSortKey(a).localeCompare(learnerSortKey(b));
}

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
          .sort(bySexThenName);
        setEnrollments(list);

        const [y, m] = month.split("-").map(Number);
        const recs = await fetchAllAttendance({
          date__gte: `${month}-01`,
          date__lte: localISODate(new Date(y, m, 0)),
          enrollment__school_year: school_year,
          enrollment__grade_level: grade_level,
          enrollment__section:     section,
        });
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
  const sexOf     = (e) => (e.student_detail?.sex || "").toLowerCase();
  const maleRows   = enrollments.filter(e => sexOf(e) === "male");
  const femaleRows = enrollments.filter(e => sexOf(e) === "female");
  // Learners whose sex isn't recorded still have to appear somewhere — DepEd
  // has no such column, so they print after the two named groups rather than
  // being silently dropped from the register.
  const otherRows  = enrollments.filter(e => sexOf(e) !== "male" && sexOf(e) !== "female");
  const males   = maleRows.length;
  const females = femaleRows.length;

  // One learner's month: days with a record, split present (incl. tardy) vs
  // absent. Hoisted so the subtotal rows can reuse it.
  const tally = (en) => {
    const rec = attMap[en.enrollment_id] || {};
    let present = 0, absent = 0;
    schoolDays.forEach(d => {
      const s = rec[d.date];
      if (!s) return;
      if (isPresentStatus(s)) present++;
      else absent++;
    });
    return { present, absent };
  };

  const sumTally = (rows) => rows.reduce(
    (acc, en) => { const t = tally(en); return { present: acc.present + t.present, absent: acc.absent + t.absent }; },
    { present: 0, absent: 0 },
  );

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
            {/* Learner rows are grouped by sex, and numbering restarts within
                each group, as the official register does. */}
            {[
              { key: "male",   rows: maleRows,   label: "TOTAL MALE" },
              { key: "female", rows: femaleRows, label: "TOTAL FEMALE" },
              { key: "other",  rows: otherRows,  label: "TOTAL (SEX NOT RECORDED)" },
            ].flatMap(group => {
              if (group.rows.length === 0) return [];
              const groupTotal = sumTally(group.rows);

              const learnerRows = group.rows.map((en, idx) => {
                const st   = en.student_detail || {};
                const rec  = attMap[en.enrollment_id] || {};
                const name = `${st.last_name || "—"}, ${st.first_name || ""}${st.middle_name ? " " + st.middle_name[0] + "." : ""}${st.suffix ? " " + st.suffix : ""}`;
                const { present, absent } = tally(en);

                return (
                  <tr key={en.enrollment_id}>
                    <td title={name} style={TD({ textAlign: "left", paddingLeft: 3, fontSize: 7, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" })}>
                      {idx + 1}. {name}
                    </td>
                    <td style={TD({ fontSize: 6 })}>{st.lrn || ""}</td>
                    {days.flatMap(d => {
                      if (d.isWeekend) return [<td key={d.date} style={WK} />];
                      const mark = MARK[rec[d.date]] ?? "";
                      return [
                        <td key={`${d.date}-am`} style={TD({ fontSize: 9, fontWeight: 700 })}>{mark}</td>,
                        <td key={`${d.date}-pm`} style={TD({ fontSize: 9, fontWeight: 700 })}>{mark}</td>,
                      ];
                    })}
                    <td style={TD({ fontWeight: 700, fontSize: 8 })}>{present || ""}</td>
                    <td style={TD({ fontWeight: 700, fontSize: 8 })}>{absent || ""}</td>
                  </tr>
                );
              });

              return [
                ...learnerRows,
                <tr key={`${group.key}-total`}>
                  <td colSpan={2} style={TD({ textAlign: "right", fontWeight: 700, fontSize: 7, paddingRight: 4, background: C.bg })}>
                    {group.label} — {group.rows.length}
                  </td>
                  {days.flatMap(d => d.isWeekend
                    ? [<td key={d.date} style={WK} />]
                    : [<td key={`${d.date}-a`} style={TD({ background: C.bg })} />, <td key={`${d.date}-p`} style={TD({ background: C.bg })} />]
                  )}
                  <td style={TD({ fontWeight: 700, fontSize: 8, background: C.bg })}>{groupTotal.present || ""}</td>
                  <td style={TD({ fontWeight: 700, fontSize: 8, background: C.bg })}>{groupTotal.absent || ""}</td>
                </tr>,
              ];
            })}

            {/* Combined total. The headcount belongs in the label, not in the
                Days Absent column, which is where it used to print. */}
            <tr>
              <td colSpan={2} style={TD({ textAlign: "right", fontWeight: 700, fontSize: 7, paddingRight: 4, background: C.bg })}>
                COMBINED TOTAL — {enrollments.length}
              </td>
              {days.flatMap(d => d.isWeekend
                ? [<td key={d.date} style={WK} />]
                : [<td key={`${d.date}-a`} style={TD({ background: C.bg })} />, <td key={`${d.date}-p`} style={TD({ background: C.bg })} />]
              )}
              <td style={TD({ fontWeight: 700, fontSize: 8, background: C.bg })}>{sumTally(enrollments).present || ""}</td>
              <td style={TD({ fontWeight: 700, fontSize: 8, background: C.bg })}>{sumTally(enrollments).absent || ""}</td>
            </tr>
          </tbody>
        </table>

        {/* The official register carries its legend on the form itself —
            without it the marks are unreadable to anyone but the encoder. */}
        <div style={{ marginTop: 6, fontSize: 7.5, display: "flex", gap: 24, color: C.dark, flexWrap: "wrap" }}>
          <span><b>Legend:</b> blank = Present &nbsp;·&nbsp; <b>x</b> = Absent &nbsp;·&nbsp; <b>/</b> = Tardy</span>
        </div>

        <div style={{ marginTop: 4, fontSize: 7.5, display: "flex", gap: 24, color: C.dark, flexWrap: "wrap" }}>
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
