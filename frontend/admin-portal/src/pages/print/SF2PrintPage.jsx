import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { getSchoolSettings } from "../../api/billingApi";
import { getEnrollments } from "../../api/enrollmentApi";
import { getAttendance } from "../../api/attendanceApi";
import { downloadAsPDF } from "../../utils/pdfExport";
import { isPresentStatus } from "../../utils/attendance";
import logo from "../../assets/logo.png";

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

  const [settings,    setSettings]    = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [attMap,      setAttMap]      = useState({});
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

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
  }, []);

  const days       = getDaysInMonth(month);
  const schoolDays = days.filter(d => !d.isWeekend);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial, sans-serif", fontSize: 14, color: "#7a5050" }}>
      Loading SF2…
    </div>
  );
  if (error) return <div style={{ padding: 32, color: "#e03131", fontFamily: "Arial" }}>{error}</div>;

  const schoolName = settings?.school_name || "South Lakes Integrated School";
  const males   = enrollments.filter(e => (e.student_detail?.sex || "").toLowerCase() === "male").length;
  const females = enrollments.filter(e => (e.student_detail?.sex || "").toLowerCase() === "female").length;

  const TH = (s = {}) => ({ border: "1px solid #444", fontSize: 7, fontWeight: 700, textAlign: "center", verticalAlign: "middle", padding: "1px 0", background: "#f0f0f0", lineHeight: 1.2, ...s });
  const TD = (s = {}) => ({ border: "1px solid #444", fontSize: 7, textAlign: "center", verticalAlign: "middle", padding: 0, height: 15, ...s });
  const WK = TD({ background: "#aaa" });

  return (
    <div style={{ minHeight: "100vh", background: "#d0d0d0", padding: "20px 0", fontFamily: "Arial, sans-serif" }}>

      {/* Toolbar */}
      <div style={{ maxWidth: 1240, margin: "0 auto 12px", padding: "0 16px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={() => window.print()}
          style={{ height: 34, padding: "0 16px", background: "white", border: "1.5px solid #ccc", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
          <i className="ti ti-printer" style={{ fontSize: 14 }} /> Print
        </button>
        <button onClick={() => downloadAsPDF("sf2-doc", `SF2_${grade_level}_${section}_${month}.pdf`, { landscape: true })}
          style={{ height: 34, padding: "0 16px", background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 14px rgba(224,49,49,0.26)" }}>
          <i className="ti ti-download" style={{ fontSize: 14 }} /> Save PDF
        </button>
      </div>

      {/* Document */}
      <div id="sf2-doc" style={{ background: "white", maxWidth: 1240, margin: "0 auto", padding: "8mm 10mm", boxSizing: "border-box", boxShadow: "0 4px 24px rgba(0,0,0,0.15)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 5 }}>
          <img src={logo} alt="Logo" style={{ width: 40, height: 56, objectFit: "contain", marginRight: 10, flexShrink: 0 }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 8 }}>Republic of the Philippines</div>
            <div style={{ fontSize: 8, fontWeight: 700 }}>Department of Education</div>
            {(region || division) && (
              <div style={{ fontSize: 7 }}>
                {region && `Region ${region}`}{region && division && " | "}{division && `Division of ${division}`}
              </div>
            )}
            <div style={{ fontSize: 8.5, fontWeight: 700, marginTop: 1 }}>{schoolName}</div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginTop: 4 }}>
              School Form 2 (SF2)
            </div>
            <div style={{ fontSize: 9, fontWeight: 700 }}>Daily Attendance Register</div>
          </div>
          <div style={{ width: 50, flexShrink: 0 }} />
        </div>

        {/* Info bar */}
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4, fontSize: 8, borderTop: "1px solid #aaa", borderBottom: "1px solid #aaa", padding: "3px 2px", marginBottom: 5 }}>
          <span><b>School Year:</b> {school_year}</span>
          <span><b>Grade Level &amp; Section:</b> {grade_level} — {section}</span>
          <span><b>Month:</b> {monthLabel(month)}</span>
          {adviser && <span><b>Adviser:</b> {adviser}</span>}
        </div>

        {/* Attendance table */}
        <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 110 }} />
            <col style={{ width: 60 }} />
            {days.flatMap(d => d.isWeekend
              ? [<col key={d.date} style={{ width: 8 }} />]
              : [<col key={`${d.date}-a`} style={{ width: 10 }} />, <col key={`${d.date}-p`} style={{ width: 10 }} />]
            )}
            <col style={{ width: 22 }} />
            <col style={{ width: 22 }} />
          </colgroup>

          <thead>
            {/* Row 1: day numbers */}
            <tr>
              <th rowSpan={2} style={TH({ textAlign: "left", paddingLeft: 3, fontSize: 7.5 })}>
                LEARNER'S NAME
                <div style={{ fontWeight: 400, fontSize: 6, marginTop: 1 }}>(Last Name, First Name, M.I.)</div>
              </th>
              <th rowSpan={2} style={TH({ fontSize: 7 })}>LRN</th>
              {days.flatMap(d => d.isWeekend
                ? [<th key={d.date} rowSpan={2} style={TH({ background: "#aaa", fontSize: 6 })}>{d.day}</th>]
                : [<th key={d.date} colSpan={2} style={TH({ fontSize: 7 })}>{d.day}</th>]
              )}
              <th rowSpan={2} style={TH({ fontSize: 6.5 })}>Days<br />Present</th>
              <th rowSpan={2} style={TH({ fontSize: 6.5 })}>Days<br />Absent</th>
            </tr>

            {/* Row 2: AM/PM for weekdays only */}
            <tr>
              {days.filter(d => !d.isWeekend).flatMap(d => [
                <th key={`${d.date}-am`} style={TH({ fontSize: 5.5, background: "#e0e0e0" })}>AM</th>,
                <th key={`${d.date}-pm`} style={TH({ fontSize: 5.5, background: "#e0e0e0" })}>PM</th>,
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
                  <td style={TD({ textAlign: "left", paddingLeft: 3, fontSize: 7, overflow: "hidden", whiteSpace: "nowrap" })}>
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

            {/* Total row */}
            <tr>
              <td colSpan={2} style={TD({ textAlign: "right", fontWeight: 700, fontSize: 7, paddingRight: 4, background: "#f0f0f0" })}>
                TOTAL ENROLLED
              </td>
              {days.flatMap(d => d.isWeekend
                ? [<td key={d.date} style={WK} />]
                : [<td key={`${d.date}-a`} style={TD({ background: "#f0f0f0" })} />, <td key={`${d.date}-p`} style={TD({ background: "#f0f0f0" })} />]
              )}
              <td style={TD({ fontWeight: 700, fontSize: 8, background: "#f0f0f0" })} />
              <td style={TD({ fontWeight: 700, fontSize: 8, background: "#f0f0f0" })}>{enrollments.length}</td>
            </tr>
          </tbody>
        </table>

        {/* Summary */}
        <div style={{ marginTop: 6, fontSize: 7.5, display: "flex", gap: 24 }}>
          <span><b>Total School Days:</b> {schoolDays.length}</span>
          <span><b>Total Enrolled:</b> {enrollments.length}</span>
          <span><b>Male:</b> {males}</span>
          <span><b>Female:</b> {females}</span>
        </div>

        {/* Signature block */}
        <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between" }}>
          {[["Adviser / Class Teacher", "Prepared by"], ["School Principal", "Noted by"]].map(([role, label]) => (
            <div key={role} style={{ width: 220, textAlign: "center", fontSize: 8 }}>
              <div style={{ marginBottom: 26 }}>&nbsp;</div>
              <div style={{ borderTop: "1px solid #333", paddingTop: 4 }}>{label}: {role}</div>
              <div style={{ fontSize: 6.5, color: "#777", marginTop: 2 }}>Signature over Printed Name / Date</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 8, fontSize: 6, color: "#aaa", textAlign: "right" }}>
          Generated: {new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>

      <style>{`
        @media print {
          body { margin: 0; background: white; }
          #sf2-doc { max-width: 100% !important; box-shadow: none !important; padding: 4mm 5mm !important; }
        }
        @page { size: A4 landscape; margin: 5mm; }
      `}</style>
    </div>
  );
}