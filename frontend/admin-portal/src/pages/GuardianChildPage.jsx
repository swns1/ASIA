import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getReportCard } from "../api/enrollmentApi";
import { getAttendanceSummary } from "../api/attendanceApi";
import { getStudentLedger } from "../api/billingApi";
import { fetchRequirementSummary } from "../api/requirementApi";
import { attendanceRate } from "../utils/attendance";
import Button from "../components/ui/Button";

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

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : null;

const todayISO = () => new Date().toISOString().slice(0, 10);

// ── Derived signals ───────────────────────────────────────────────────────────
// A parent opening this page wants "what should I do about this child right
// now", which none of the three tabs answered on their own: the grades table
// doesn't say which period is the newest one posted, the billing totals don't
// say when the next payment is due, and nothing surfaced missing documents at
// all. These pull that out of data the page already fetches.

/** The most recent grading period that actually has a grade in it. */
function latestPostedPeriod(report) {
  const periods = report?.grading_periods || [];
  const subjects = report?.subjects || [];
  for (let i = periods.length - 1; i >= 0; i -= 1) {
    const p = periods[i];
    const posted = subjects.some((s) => s.grades?.[p.key]?.numeric_grade != null);
    if (posted) return p.label;
  }
  return null;
}

/** Earliest unpaid installment across every invoice, plus how many are late. */
function nextDue(ledger) {
  const today = todayISO();
  const open = [];
  (ledger?.school_years || []).forEach((yr) =>
    (yr.invoices || []).forEach((inv) =>
      (inv.installments || []).forEach((inst) => {
        const balance = Number(inst.balance ?? 0);
        if (inst.status === "paid" || inst.status === "voided" || balance <= 0) return;
        if (!inst.due_date) return;
        open.push({ ...inst, invoice_no: inv.invoice_no });
      })
    )
  );
  open.sort((a, b) => a.due_date.localeCompare(b.due_date));
  return {
    next: open[0] || null,
    overdueCount: open.filter((i) => i.due_date < today).length,
    openCount: open.length,
  };
}

function missingRequirements(requirements) {
  if (!Array.isArray(requirements)) return null;
  return requirements.filter((r) => !r.is_submitted).length;
}

/** The strip under the child's name: four "should I act on this" answers. */
function StatusStrip({ report, attendance, ledger, requirements, loadingAny }) {
  const period = latestPostedPeriod(report);
  const rate = attendanceRate(attendance?.totals || {});
  const due = nextDue(ledger);
  const missing = missingRequirements(requirements);
  const balance = Number(ledger?.total_balance ?? 0);

  const items = [
    {
      label: "Latest grades",
      value: period || "None posted yet",
      tone: period ? "#1455a0" : "#8a6a6a",
      icon: "ti-chart-bar",
    },
    {
      label: "Attendance",
      value: rate != null ? `${rate}%` : "—",
      tone: rate == null ? "#8a6a6a" : rate >= 90 ? "#2e6b0d" : rate >= 75 ? "#854f0b" : "#c92a2a",
      icon: "ti-calendar-check",
    },
    {
      label: due.overdueCount ? "Overdue" : "Next payment",
      value: due.next
        ? `${peso(due.next.balance)} · ${fmtDate(due.next.due_date)}`
        : balance > 0 ? peso(balance) : "Nothing due",
      tone: due.overdueCount ? "#c92a2a" : due.next ? "#854f0b" : "#2e6b0d",
      icon: "ti-receipt",
    },
    {
      label: "Documents",
      value: missing == null ? "—" : missing === 0 ? "All submitted" : `${missing} missing`,
      tone: missing == null ? "#8a6a6a" : missing === 0 ? "#2e6b0d" : "#854f0b",
      icon: "ti-file-text",
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 18 }}>
      {items.map((it) => (
        <div key={it.label} style={{ ...card, padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <i className={`ti ${it.icon}`} style={{ fontSize: 13, color: "#8a6a6a" }} aria-hidden="true" />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#8a6a6a", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {it.label}
            </span>
          </div>
          {loadingAny && it.value === "—" ? (
            <Sk w="60%" h={16} />
          ) : (
            <div style={{ fontSize: 14, fontWeight: 700, color: it.tone }}>{it.value}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Requirements tab ──────────────────────────────────────────────────────────
function RequirementsTab({ requirements, loading }) {
  if (loading) return <div style={{ ...card, padding: 22 }}><Sk h={120} r={12} /></div>;
  if (!Array.isArray(requirements)) {
    return <div style={{ ...card, padding: 22, textAlign: "center", color: "#8a6a6a", fontSize: 13 }}>
      Requirements could not be loaded.
    </div>;
  }
  if (requirements.length === 0) {
    return <div style={{ ...card, padding: 22, textAlign: "center", color: "#8a6a6a", fontSize: 13 }}>
      No documents are being asked for at the moment.
    </div>;
  }

  const missing = requirements.filter((r) => !r.is_submitted);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {missing.length > 0 && (
        <div style={{ background: "#faeeda", border: "1px solid #f0d5a8", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "#854f0b" }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 15 }} aria-hidden="true" />
          <span>
            <strong>{missing.length} document{missing.length === 1 ? "" : "s"}</strong> still to submit.
            Please bring {missing.length === 1 ? "it" : "them"} to the registrar's office.
          </span>
        </div>
      )}

      <div style={{ ...card, overflow: "hidden" }}>
        {requirements.map((r, i) => (
          <div
            key={r.requirement_type_id}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "13px 18px",
              borderTop: i === 0 ? "none" : "1px solid #f9f0f0",
            }}
          >
            <i
              className={`ti ${r.is_submitted ? "ti-circle-check" : "ti-circle-dashed"}`}
              style={{ fontSize: 17, color: r.is_submitted ? "#2e6b0d" : "#c9a86a", flexShrink: 0 }}
              aria-hidden="true"
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1a0a0a" }}>{r.requirement_name}</div>
              {r.is_submitted && r.submitted_at && (
                <div style={{ fontSize: 11.5, color: "#8a6a6a", marginTop: 2 }}>
                  Received {fmtDate(r.submitted_at)}
                </div>
              )}
              {!r.is_submitted && r.description && (
                <div style={{ fontSize: 11.5, color: "#8a6a6a", marginTop: 2 }}>{r.description}</div>
              )}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, whiteSpace: "nowrap",
              background: r.is_submitted ? "#e8f5e0" : "#faeeda",
              color: r.is_submitted ? "#2e6b0d" : "#854f0b",
            }}>
              {r.is_submitted ? "Submitted" : "Not yet"}
            </span>
          </div>
        ))}
      </div>

      {/* Deliberately read-only: documents are handed over and verified in
          person by the registrar, so a guardian-facing upload button would
          promise something the school's actual process doesn't do. */}
      <p style={{ fontSize: 12, color: "#8a6a6a", textAlign: "center", lineHeight: 1.6 }}>
        Documents are submitted to the registrar's office and marked here once received.
      </p>
    </div>
  );
}

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
              <th style={{ textAlign: "left", fontSize: 10.5, fontWeight: 600, color: "#8a6a6a", padding: "11px 18px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Subject</th>
              {periods.map((p) => (
                <th key={p.key} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 600, color: "#8a6a6a", padding: "11px 12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{p.label}</th>
              ))}
              <th style={{ textAlign: "center", fontSize: 10.5, fontWeight: 600, color: "#8a6a6a", padding: "11px 14px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Avg</th>
            </tr>
          </thead>
          <tbody>
            {(data.subjects || []).length === 0 ? (
              <tr><td colSpan={periods.length + 2} style={{ textAlign: "center", padding: "40px 16px", color: "#8a6a6a", fontSize: 13 }}>No grades recorded yet.</td></tr>
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
        <div style={{ textAlign: "center", padding: "32px 16px", color: "#8a6a6a", fontSize: 13 }}>No attendance records yet.</div>
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
  if (!ledger) return <div style={{ ...card, padding: 22, textAlign: "center", color: "#8a6a6a", fontSize: 13 }}>No billing records found.</div>;

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
            <div style={{ fontSize: 11, fontWeight: 700, color: "#8a6a6a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{s.label}</div>
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
          <div style={{ padding: "12px 20px", display: "flex", gap: 24, fontSize: 12.5, color: "#7a5050", flexWrap: "wrap" }}>
            <span>Billed: <strong style={{ color: "#1a0a0a" }}>{peso(yr.year_billed)}</strong></span>
            <span>Paid: <strong style={{ color: "#2e6b0d" }}>{peso(yr.year_paid)}</strong></span>
            <span>{(yr.invoices || []).length} invoice{(yr.invoices || []).length !== 1 ? "s" : ""}</span>
          </div>

          {/* The payment schedule was already in this payload (every invoice
              carries its installments with due dates) but nothing rendered it,
              so a parent could see what they owed and not when it was due --
              the one thing they actually needed from this page. */}
          {(yr.invoices || []).map((inv) => {
            const schedule = (inv.installments || [])
              .slice()
              .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
            if (schedule.length === 0) return null;
            return (
              <div key={inv.invoice_id} style={{ borderTop: "1px solid #f9f0f0" }}>
                <div style={{ padding: "10px 20px 6px", fontSize: 11, fontWeight: 700, color: "#8a6a6a", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Payment schedule · {inv.invoice_no}
                </div>
                {schedule.map((inst) => {
                  const balance = Number(inst.balance ?? 0);
                  const settled = inst.status === "paid" || balance <= 0;
                  const late = !settled && inst.due_date && inst.due_date < todayISO();
                  return (
                    <div
                      key={inst.installment_id}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 20px", fontSize: 12.5 }}
                    >
                      <span style={{ width: 26, color: "#8a6a6a", flexShrink: 0 }}>#{inst.sequence}</span>
                      <span style={{ flex: 1, minWidth: 0, color: late ? "#c92a2a" : "#1a0a0a", fontWeight: late ? 700 : 500 }}>
                        {fmtDate(inst.due_date) || "No due date"}
                      </span>
                      <span style={{ color: "#7a5050" }}>{peso(inst.amount)}</span>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap",
                        background: settled ? "#e8f5e0" : late ? "#fde8e8" : "#faeeda",
                        color: settled ? "#2e6b0d" : late ? "#c92a2a" : "#854f0b",
                      }}>
                        {settled ? "Paid" : late ? "Overdue" : "Due"}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}

      <p style={{ fontSize: 12, color: "#8a6a6a", textAlign: "center", lineHeight: 1.6 }}>
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
  const [requirements, setRequirements] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [attLoading, setAttLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [reqLoading, setReqLoading] = useState(true);
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
        fetchRequirementSummary(studentId)
          .then(setRequirements).catch(() => setRequirements(null)).finally(() => setReqLoading(false));
      } else {
        setLedgerLoading(false);
        setReqLoading(false);
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

  const missingDocs = missingRequirements(requirements);

  const TABS = [
    { key: "grades",       label: "Report Card",  icon: "ti-chart-bar" },
    { key: "attendance",   label: "Attendance",   icon: "ti-calendar-check" },
    { key: "billing",      label: "Billing",      icon: "ti-receipt" },
    // The count rides on the tab itself so a parent sees there's something
    // outstanding without having to open it first.
    { key: "requirements", label: "Documents",    icon: "ti-file-text", badge: missingDocs || 0 },
  ];

  return (
    <>
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
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg,#fde8e8,#fca5a5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "#c92a2a", flexShrink: 0 }}>
              {fullName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 19, fontWeight: 700, color: "#1a0a0a" }}>{fullName}</div>
              <div style={{ fontSize: 13, color: "#8a6a6a", marginTop: 2 }}>
                {enrollment && <>{enrollment.grade_level} · {enrollment.section} · {LEVEL_LABELS[enrollment.school_level] || enrollment.school_level} · SY {enrollment.school_year}</>}
              </div>
            </div>
            {/* The printable report card already existed at this route and is
                already scoped so a guardian can only open their own child's —
                but nothing in this portal linked to it, so a parent had no way
                to reach it. Its own toolbar has a Back button (navigate(-1)),
                so this doesn't strand anyone on a chrome-less page. */}
            {report && (
              <Button
                variant="secondary"
                size="sm"
                icon="ti-file-text"
                to={`/report-card/${enrollmentId}`}
              >
                Printable report card
              </Button>
            )}
          </div>
        )}
      </div>

      {/* At-a-glance answers, so the page opens with "what needs attention"
          rather than a static grades table. */}
      {!loading && (
        <StatusStrip
          report={report}
          attendance={attendance}
          ledger={ledger}
          requirements={requirements}
          loadingAny={attLoading || ledgerLoading || reqLoading}
        />
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: `1.5px solid ${active ? "#e03131" : "#f0e4e4"}`, background: active ? "#fff0f0" : "white", color: active ? "#c92a2a" : "#7a5050", fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 15 }} />{t.label}
              {t.badge > 0 && (
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: "#faeeda", color: "#854f0b" }}>
                  {t.badge}
                </span>
              )}
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
          {tab === "requirements" && <RequirementsTab requirements={requirements} loading={reqLoading} />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
