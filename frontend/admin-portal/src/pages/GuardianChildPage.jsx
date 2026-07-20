import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import GuardianLayout from "../components/GuardianLayout";
import { getReportCard } from "../api/enrollmentApi";
import { getAttendanceSummary } from "../api/attendanceApi";
import { getStudentLedger } from "../api/billingApi";
import { attendanceRate } from "../utils/attendance";

const LEVEL_LABELS = {
  nursery: "Nursery", kindergarten: "Kindergarten", elementary: "Elementary",
  junior_highschool: "Junior High School", senior_highschool: "Senior High School",
};

const peso = (v) => `₱${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function gradeColor(avg) {
  if (avg == null) return "#7a5050";
  if (avg >= 90) return "#1a6b0d";
  if (avg >= 75) return "#1455a0";
  return "#c92a2a";
}

const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
);

const card = { background: "white", borderRadius: 16, border: "1px solid #f5eaea", boxShadow: "0 2px 12px rgba(224,49,49,0.06)" };

// ── Report card tab ───────────────────────────────────────────────────────────
function ReportCardTab({ data }) {
  if (!data) return null;
  const periods = data.grading_periods || [];
  return (
    <div style={{ ...card, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1a0a0a" }}>Report Card</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {data.overall_gpa != null && (
            <span style={{ fontSize: 12.5, fontWeight: 700, color: gradeColor(data.overall_gpa) }}>
              GPA {data.overall_gpa}
            </span>
          )}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 480 }}>
          <thead>
            <tr style={{ background: "#fdfafa" }}>
              <th style={{ textAlign: "left", fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", padding: "11px 18px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Subject</th>
              {periods.map((p) => (
                <th key={p.key} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", padding: "11px 12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{p.label}</th>
              ))}
              <th style={{ textAlign: "center", fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", padding: "11px 14px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Avg</th>
            </tr>
          </thead>
          <tbody>
            {(data.subjects || []).length === 0 ? (
              <tr><td colSpan={periods.length + 2} style={{ textAlign: "center", padding: "40px 16px", color: "#b09090", fontSize: 13 }}>No grades recorded yet.</td></tr>
            ) : data.subjects.map((s) => (
              <tr key={s.subject_id}>
                <td style={{ padding: "11px 18px", borderTop: "1px solid #f9f0f0", fontWeight: 600, color: "#1a0a0a" }}>{s.subject_name}</td>
                {periods.map((p) => {
                  const g = s.grades?.[p.key];
                  return (
                    <td key={p.key} style={{ padding: "11px 12px", borderTop: "1px solid #f9f0f0", textAlign: "center", color: g?.numeric_grade != null ? gradeColor(g.numeric_grade) : "#c9b8b8", fontWeight: 600 }}>
                      {g?.numeric_grade ?? "—"}
                    </td>
                  );
                })}
                <td style={{ padding: "11px 14px", borderTop: "1px solid #f9f0f0", textAlign: "center", fontWeight: 700, color: gradeColor(s.average) }}>{s.average ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Attendance tab ────────────────────────────────────────────────────────────
function AttendanceTab({ summary, loading }) {
  const totals = summary?.totals || {};
  const items = [
    { label: "Present", value: totals.present, color: "#2e6b0d", bg: "#e8f5e0", icon: "ti-check" },
    { label: "Absent",  value: totals.absent,  color: "#c92a2a", bg: "#fde8e8", icon: "ti-x" },
    { label: "Late",    value: totals.late,    color: "#854f0b", bg: "#faeeda", icon: "ti-clock" },
    { label: "Excused", value: totals.excused, color: "#1455a0", bg: "#e3f0fd", icon: "ti-file-check" },
  ];
  const total = totals.total || 0;
  const rate = attendanceRate(totals);

  return (
    <div style={{ ...card, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1a0a0a" }}>Attendance</div>
        {rate != null && !loading && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: rate >= 90 ? "#2e6b0d" : rate >= 75 ? "#854f0b" : "#c92a2a" }}>
            {rate}% attendance rate
          </span>
        )}
      </div>
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {items.map((_, i) => <Sk key={i} h={72} r={12} />)}
        </div>
      ) : total === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 16px", color: "#b09090", fontSize: 13 }}>No attendance records yet.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12 }}>
          {items.map((it) => (
            <div key={it.label} style={{ background: it.bg, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                <i className={`ti ${it.icon}`} style={{ fontSize: 14, color: it.color }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: it.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{it.label}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#1a0a0a" }}>{it.value || 0}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Billing tab ───────────────────────────────────────────────────────────────
function BillingTab({ ledger, loading }) {
  if (loading) return <div style={{ ...card, padding: 22 }}><Sk h={120} r={12} /></div>;
  if (!ledger) return <div style={{ ...card, padding: 22, textAlign: "center", color: "#b09090", fontSize: 13 }}>No billing records found.</div>;

  const balance = Number(ledger.total_balance || 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        {[
          { label: "Total Billed", value: ledger.total_billed, color: "#1a0a0a", bg: "#fdfafa" },
          { label: "Total Paid",   value: ledger.total_paid,   color: "#2e6b0d", bg: "#e8f5e0" },
          { label: "Balance",      value: ledger.total_balance, color: balance > 0 ? "#c92a2a" : "#2e6b0d", bg: balance > 0 ? "#fde8e8" : "#e8f5e0" },
        ].map((s) => (
          <div key={s.label} style={{ ...card, padding: "16px 20px", background: s.bg }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#a07878", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{peso(s.value)}</div>
          </div>
        ))}
      </div>

      {(ledger.school_years || []).map((yr) => (
        <div key={yr.school_year + yr.enrollment_id} style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>SY {yr.school_year} · {yr.grade_level}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: Number(yr.year_balance) > 0 ? "#c92a2a" : "#2e6b0d" }}>
              Balance {peso(yr.year_balance)}
            </div>
          </div>
          <div style={{ padding: "12px 20px", display: "flex", gap: 24, fontSize: 12.5, color: "#7a5050" }}>
            <span>Billed: <strong style={{ color: "#1a0a0a" }}>{peso(yr.year_billed)}</strong></span>
            <span>Paid: <strong style={{ color: "#2e6b0d" }}>{peso(yr.year_paid)}</strong></span>
            <span>{(yr.invoices || []).length} invoice{(yr.invoices || []).length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      ))}

      <p style={{ fontSize: 12, color: "#b09090", textAlign: "center", lineHeight: 1.6 }}>
        For payment arrangements or questions about your balance, please contact the school's accounting office.
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function GuardianChildPage() {
  usePageTitle("Child Records");
  const { enrollmentId } = useParams();
  const navigate = useNavigate();

  const [tab, setTab] = useState("grades");
  const [report, setReport]     = useState(null);
  const [attendance, setAttend] = useState(null);
  const [ledger, setLedger]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [attLoading, setAttLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [error, setError]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rc = await getReportCard(enrollmentId);
      setReport(rc);
      const studentId = rc?.student?.student_id;

      // Attendance + billing depend on the report card (for student_id).
      getAttendanceSummary({ enrollment: enrollmentId })
        .then(setAttend).catch(() => setAttend(null)).finally(() => setAttLoading(false));

      if (studentId) {
        getStudentLedger(studentId)
          .then(setLedger).catch(() => setLedger(null)).finally(() => setLedgerLoading(false));
      } else {
        setLedgerLoading(false);
      }
    } catch (e) {
      setError(e.message || "Failed to load this child's records.");
    } finally {
      setLoading(false);
    }
  }, [enrollmentId]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/login"); return; }
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [enrollmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const student = report?.student;
  const enrollment = report?.enrollment;
  const fullName = student ? [student.first_name, student.middle_name, student.last_name, student.suffix].filter(Boolean).join(" ") : "";

  const TABS = [
    { key: "grades",     label: "Report Card", icon: "ti-chart-bar" },
    { key: "attendance", label: "Attendance",  icon: "ti-calendar-check" },
    { key: "billing",    label: "Billing",     icon: "ti-receipt" },
  ];

  return (
    <GuardianLayout>
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 15 }} />{error}
        </div>
      )}

      {/* Child header */}
      <div style={{ ...card, padding: 22, marginBottom: 18 }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Sk w={56} h={56} r={14} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Sk w="50%" h={18} /><Sk w="30%" h={13} /></div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg,#fde8e8,#fca5a5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "#e03131", flexShrink: 0 }}>
              {fullName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700, color: "#1a0a0a" }}>{fullName}</div>
              <div style={{ fontSize: 13, color: "#a07878", marginTop: 2 }}>
                {enrollment && <>{enrollment.grade_level} · {enrollment.section} · {LEVEL_LABELS[enrollment.school_level] || enrollment.school_level} · SY {enrollment.school_year}</>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: `1.5px solid ${active ? "#e03131" : "#f0e4e4"}`, background: active ? "#fff0f0" : "white", color: active ? "#e03131" : "#7a5050", fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 15 }} />{t.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {tab === "grades" && (loading ? <div style={{ ...card, padding: 22 }}><Sk h={160} r={12} /></div> : <ReportCardTab data={report} />)}
          {tab === "attendance" && <AttendanceTab summary={attendance} loading={attLoading} />}
          {tab === "billing" && <BillingTab ledger={ledger} loading={ledgerLoading} />}
        </motion.div>
      </AnimatePresence>
    </GuardianLayout>
  );
}
