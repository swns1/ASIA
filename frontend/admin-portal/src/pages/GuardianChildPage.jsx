import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { getReportCard } from "../api/enrollmentApi";
import { getAttendanceSummary } from "../api/attendanceApi";
import { getStudentLedger } from "../api/billingApi";
import { fetchRequirementSummary } from "../api/requirementApi";
import { attendanceRate } from "../utils/attendance";
// Shared so the 90/75 cut-offs live in one place — this page used to
// re-encode both of them.
import { gradeBand as gradeVariant, attendanceBand as attendanceVariant } from "../utils/grading";
// This page composes dates into sentences rather than table cells, so it asks
// for a null fallback instead of the shared em dash.
import { peso, fmtDate, todayISO } from "../utils/format";
import Button from "../components/ui/Button";
import Card, { StatCard, Panel } from "../components/ui/Card";
import Skeleton from "../components/ui/Skeleton";
import Badge, { StatusBadge } from "../components/ui/Badge";
import GuardianHero from "../components/GuardianHero";
import Tabs, { TabPanel } from "../components/ui/Tabs";
import useTabs from "../hooks/useTabs";
import { LEVEL_LABELS } from "../constants/schoolLevels";
import { ENROLLMENT_STATUS_MAP } from "../constants/statusMaps";
import { initialsFrom } from "../utils/avatarPalette";

const GRADE_TEXT_CLASS = {
  success: "text-success-500", info: "text-info-500", error: "text-error-500", muted: "text-neutral-400",
};


// ── Section state ─────────────────────────────────────────────────────────────
// Each independent fetch owns one of these. Keeping `failed` next to `data`
// is the whole point: every one of these fetches used to collapse into a bare
// `null`, which is indistinguishable from "loaded, and there is nothing here"
// -- so a 403 on the ledger rendered as "No billing records found" to a parent
// who actually owed money.
const SECTION_INIT = { data: null, loading: true, failed: false };
const SECTION_UNAVAILABLE = { data: null, loading: false, failed: true };

/**
 * Drives one section's fetch through its own loading/failed lifecycle.
 *
 * These used to be chained after `await getReportCard(...)` inside the same
 * `try`, so a report-card rejection jumped to `catch` before their
 * `.finally(...)` handlers were ever created -- leaving three unrelated tabs
 * as skeletons for the life of the page.
 */
function runSection(promise, set) {
  set(SECTION_INIT);
  return promise.then(
    (data) => set({ data, loading: false, failed: false }),
    () => set(SECTION_UNAVAILABLE),
  );
}

/** Stands in for a section's body when its fetch failed. */
function LoadFailed({ message, onRetry }) {
  return (
    <Card className="text-center">
      <div className="text-sm font-semibold text-neutral-900">This section couldn't be loaded</div>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-neutral-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon="ti-refresh" className="mt-3.5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

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

const GLANCE_CHIP = {
  neutral: "bg-brand-100 text-brand-600",
  info: "bg-info-50 text-info-500",
  success: "bg-success-50 text-success-500",
  warning: "bg-warning-50 text-warning-500",
  error: "bg-error-50 text-error-500",
  muted: "bg-muted-50 text-muted-500",
};
const GLANCE_VALUE = {
  neutral: "text-neutral-900", info: "text-neutral-900", success: "text-success-500",
  warning: "text-warning-500", error: "text-error-500", muted: "text-neutral-500",
};

/** One cell of the at-a-glance strip: icon (or `visual`), label, value, hint. */
function GlanceItem({ icon, visual, tone = "neutral", label, value, hint, loading }) {
  return (
    <div className="flex min-w-0 items-center gap-3 bg-white px-4 py-3.5 sm:py-4">
      {/* Two cells a row on a phone leaves no room for the icon; the tone
          colour on the value still carries the signal there. */}
      <div className="hidden shrink-0 sm:block">
        {visual ?? (
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${GLANCE_CHIP[tone]}`}>
            <i className={`ti ${icon} text-lg`} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium uppercase tracking-[0.06em] text-neutral-500">{label}</div>
        {loading ? (
          <Skeleton width={72} height={16} variant="pulse" className="mt-1" />
        ) : (
          <>
            <div className={`mt-0.5 truncate text-md font-bold ${GLANCE_VALUE[tone]}`}>{value}</div>
            {hint && <div className="truncate text-xs text-neutral-500">{hint}</div>}
          </>
        )}
      </div>
    </div>
  );
}

/** The attendance cell's icon: a ring that fills to the rate. */
function AttendanceRing({ rate }) {
  const RING_STROKE = {
    success: "stroke-success-500", warning: "stroke-warning-500",
    error: "stroke-error-500", muted: "stroke-neutral-300",
  }[attendanceVariant(rate)];
  const r = 16;
  const circumference = 2 * Math.PI * r;
  const offset = rate != null ? circumference * (1 - rate / 100) : circumference;

  return (
    <svg viewBox="0 0 40 40" className="block h-10 w-10 -rotate-90" aria-hidden="true">
      <circle cx="20" cy="20" r={r} strokeWidth="4" className="fill-none stroke-neutral-200" />
      {rate != null && (
        <motion.circle
          cx="20" cy="20" r={r} strokeWidth="4" strokeLinecap="round"
          className={`fill-none ${RING_STROKE}`}
          style={{ strokeDasharray: circumference }}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      )}
    </svg>
  );
}

/** A cell whose fetch failed. Says so rather than showing the empty-data
 *  answer, which for billing would be "Nothing due" to a parent who owes. */
const UNAVAILABLE = { value: "Couldn't load", hint: "See the tab below", tone: "muted" };

/** The strip under the child's banner: four "should I act on this" answers,
 *  in one card so they read as a single summary rather than four widgets. */
function StatusStrip({ report, att, ledger: ledgerSection, reqs }) {
  const attendance = att.data;
  const ledger = ledgerSection.data;
  const requirements = reqs.data;
  const period = latestPostedPeriod(report);
  const rate = attendanceRate(attendance?.totals || {});
  const attTone = { success: "success", warning: "warning", error: "error" }[attendanceVariant(rate)] || "muted";
  const due = nextDue(ledger);
  const missing = missingRequirements(requirements);
  const balance = Number(ledger?.total_balance ?? 0);

  let payment;
  if (ledgerSection.failed) {
    payment = { label: "Payments", ...UNAVAILABLE };
  } else if (due.next) {
    payment = {
      label: due.overdueCount ? "Overdue" : "Next payment",
      value: peso(due.next.balance),
      hint: `${due.overdueCount ? "Was due" : "Due"} ${fmtDate(due.next.due_date, null)}`,
      tone: due.overdueCount ? "error" : "warning",
    };
  } else if (balance > 0) {
    payment = { label: "Balance", value: peso(balance), hint: "No due date set", tone: "warning" };
  } else {
    payment = { label: "Payments", value: "Nothing due", tone: "success" };
  }

  return (
    <Card padding="none" className="mb-6 grid grid-cols-2 gap-px overflow-hidden bg-neutral-200 lg:grid-cols-4">
      <GlanceItem
        icon="ti-chart-bar"
        tone={period ? "info" : "muted"}
        label="Latest grades"
        value={period || "Not posted yet"}
        hint={(report?.general_average ?? report?.overall_gpa) != null ? `General average ${report.general_average ?? report.overall_gpa}` : undefined}
      />
      <GlanceItem
        visual={<AttendanceRing rate={att.loading ? null : rate} />}
        label="Attendance"
        loading={att.loading}
        {...(att.failed
          ? UNAVAILABLE
          : {
              tone: rate != null ? attTone : "muted",
              value: rate != null ? `${rate}%` : "No records yet",
              hint: rate != null ? `${attendance.totals.total} school days recorded` : undefined,
            })}
      />
      <GlanceItem icon="ti-receipt" loading={ledgerSection.loading} {...payment} />
      <GlanceItem
        icon="ti-file-text"
        label="Documents"
        loading={reqs.loading}
        {...(reqs.failed
          ? UNAVAILABLE
          : {
              tone: missing == null ? "muted" : missing === 0 ? "success" : "warning",
              value: missing == null ? "—" : missing === 0 ? "All submitted" : `${missing} missing`,
              hint: missing ? "Bring to the registrar" : undefined,
            })}
      />
    </Card>
  );
}

// ── Requirements tab ──────────────────────────────────────────────────────────
function RequirementsTab({ requirements, loading, failed, onRetry }) {
  if (loading) return <Card><Skeleton height={120} radius={12} /></Card>;
  if (failed || !Array.isArray(requirements)) {
    return (
      <LoadFailed
        message="We couldn't reach the document checklist for this child. This is a problem on our side, not a sign that anything is missing."
        onRetry={onRetry}
      />
    );
  }
  if (requirements.length === 0) {
    return <Card className="text-center text-sm text-neutral-500">No documents are being asked for at the moment.</Card>;
  }

  const missing = requirements.filter((r) => !r.is_submitted);

  return (
    <div className="flex flex-col gap-4">
      {missing.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl border border-warning-500/25 bg-warning-50 px-4 py-3 text-sm text-warning-500">
          <i className="ti ti-alert-triangle text-base" aria-hidden="true" />
          <span>
            <strong>{missing.length} document{missing.length === 1 ? "" : "s"}</strong> still to submit.
            Please bring {missing.length === 1 ? "it" : "them"} to the registrar's office.
          </span>
        </div>
      )}

      <Card padding="none" className="overflow-hidden">
        {requirements.map((r, i) => (
          <div
            key={r.requirement_type_id}
            className={`flex items-center gap-3 px-[18px] py-[13px] ${i === 0 ? "" : "border-t border-neutral-200/70"}`}
          >
            <i
              className={`ti ${r.is_submitted ? "ti-circle-check text-success-500" : "ti-circle-dashed text-neutral-400"} shrink-0 text-lg`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-neutral-900">{r.requirement_name}</div>
              {r.is_submitted && r.submitted_at && (
                <div className="mt-0.5 text-xs text-neutral-500">Received {fmtDate(r.submitted_at, null)}</div>
              )}
              {!r.is_submitted && r.description && (
                <div className="mt-0.5 text-xs text-neutral-500">{r.description}</div>
              )}
            </div>
            <Badge variant={r.is_submitted ? "success" : "warning"}>{r.is_submitted ? "Submitted" : "Not yet"}</Badge>
          </div>
        ))}
      </Card>

      {/* Deliberately read-only: documents are handed over and verified in
          person by the registrar, so a guardian-facing upload button would
          promise something the school's actual process doesn't do. */}
      <p className="text-center text-xs leading-relaxed text-neutral-500">
        Documents are submitted to the registrar's office and marked here once received.
      </p>
    </div>
  );
}

// ── Report card tab ───────────────────────────────────────────────────────────
function ReportCardTab({ data, error }) {
  // `return null` here left the default tab's body completely empty whenever
  // the report card failed to load — the banner above said something went
  // wrong, then the page showed nothing at all under it.
  if (!data) {
    return (
      <Panel title="Report Card">
        <div className="px-4 py-10 text-center">
          <div className="text-sm font-semibold text-neutral-900">
            {error ? "Grades couldn't be loaded" : "No report card yet"}
          </div>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">
            {error
              ? "We couldn't reach the grading records for this child. Please try again in a moment."
              : "Grades will appear here once the school has posted them for this enrolment."}
          </p>
        </div>
      </Panel>
    );
  }
  const periods = data.grading_periods || [];
  return (
    <Panel
      title="Report Card"
      padding="none"
      action={(data.general_average ?? data.overall_gpa) != null && (
        // "General Average" is DepEd's term; GPA implies a weighting DO 8
        // does not apply across learning areas.
        <Badge variant={gradeVariant(data.general_average ?? data.overall_gpa)}>
          General average {data.general_average ?? data.overall_gpa}
        </Badge>
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="bg-neutral-50">
              <th className="px-[18px] py-[11px] text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500">Subject</th>
              {periods.map((p) => (
                <th key={p.key} className="px-3 py-2.5 text-center text-[10.5px] font-semibold uppercase tracking-[0.05em] text-neutral-500">{p.label}</th>
              ))}
              <th className="px-3.5 py-2.5 text-center text-[10.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500">Avg</th>
            </tr>
          </thead>
          <tbody>
            {(data.subjects || []).length === 0 ? (
              <tr><td colSpan={periods.length + 2} className="px-4 py-10 text-center text-sm text-neutral-500">No grades recorded yet.</td></tr>
            ) : data.subjects.map((s) => (
              <tr key={s.subject_id} className="border-t border-neutral-200/70">
                <td className="px-[18px] py-[11px] font-semibold text-neutral-900">{s.subject_name}</td>
                {periods.map((p) => {
                  const g = s.grades?.[p.key];
                  return (
                    <td
                      key={p.key}
                      className={`px-3 py-2.5 text-center font-semibold ${GRADE_TEXT_CLASS[g?.numeric_grade != null ? gradeVariant(g.numeric_grade) : "muted"]}`}
                    >
                      {g?.numeric_grade ?? "—"}
                    </td>
                  );
                })}
                <td className="px-3.5 py-2.5 text-center">
                  <Badge variant={gradeVariant(s.average)}>{s.average ?? "—"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── Attendance tab ────────────────────────────────────────────────────────────
const ATTENDANCE_CATEGORIES = [
  { key: "present", label: "Present", icon: "ti-check",       iconTone: "success" },
  { key: "absent",  label: "Absent",  icon: "ti-x",           iconTone: "error"   },
  { key: "late",    label: "Late",    icon: "ti-clock",       iconTone: "warning" },
  { key: "excused", label: "Excused", icon: "ti-file-check",  iconTone: "info"    },
];

function AttendanceTab({ summary, loading, failed, onRetry }) {
  if (failed) {
    return (
      <LoadFailed
        message="We couldn't reach the attendance records for this child. Please try again in a moment."
        onRetry={onRetry}
      />
    );
  }
  const totals = summary?.totals || {};
  const total = totals.total || 0;
  const rate = attendanceRate(totals);

  return (
    <Panel
      title="Attendance"
      action={rate != null && !loading && (
        <Badge variant={attendanceVariant(rate)}>{rate}% attendance rate</Badge>
      )}
    >
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ATTENDANCE_CATEGORIES.map((c) => <Skeleton key={c.key} height={72} radius={12} variant="pulse" />)}
        </div>
      ) : total === 0 ? (
        <div className="py-8 text-center text-sm text-neutral-500">No attendance records yet.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ATTENDANCE_CATEGORIES.map((c) => (
            <StatCard key={c.key} label={c.label} value={totals[c.key] || 0} icon={c.icon} iconTone={c.iconTone} layout="horizontal" />
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── Billing tab ───────────────────────────────────────────────────────────────
function BillingTab({ ledger, loading, failed, onRetry }) {
  if (loading) return <Card><Skeleton height={120} radius={12} /></Card>;
  if (failed) {
    return (
      <LoadFailed
        message="We couldn't reach the billing records for this child. Do not treat this as a zero balance — please try again, or contact the accounting office."
        onRetry={onRetry}
      />
    );
  }
  if (!ledger) return <Card className="text-center text-sm text-neutral-500">No billing records found.</Card>;

  const balance = Number(ledger.total_balance || 0);
  const summaryTiles = [
    { label: "Total Billed", value: peso(ledger.total_billed), icon: "ti-receipt-2", iconTone: "brand" },
    { label: "Total Paid",   value: peso(ledger.total_paid),   icon: "ti-cash",      iconTone: "success" },
    { label: "Balance",      value: peso(ledger.total_balance), icon: "ti-wallet",   iconTone: balance > 0 ? "error" : "success" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {summaryTiles.map((t) => (
          <StatCard key={t.label} label={t.label} value={t.value} icon={t.icon} iconTone={t.iconTone} layout="horizontal" />
        ))}
      </div>

      {(ledger.school_years || []).map((yr) => (
        <Panel
          key={yr.school_year + yr.enrollment_id}
          title={`SY ${yr.school_year} · ${yr.grade_level}`}
          padding="none"
          action={
            <Badge variant={Number(yr.year_balance) > 0 ? "error" : "success"}>
              Balance {peso(yr.year_balance)}
            </Badge>
          }
        >
          <div className="flex flex-wrap gap-6 px-5 py-3 text-sm text-neutral-700">
            <span>Billed: <strong className="text-neutral-900">{peso(yr.year_billed)}</strong></span>
            <span>Paid: <strong className="text-success-500">{peso(yr.year_paid)}</strong></span>
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
              <div key={inv.invoice_id} className="border-t border-neutral-200/70">
                <div className="px-5 pb-1.5 pt-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
                  Payment schedule · {inv.invoice_no}
                </div>
                {schedule.map((inst) => {
                  const instBalance = Number(inst.balance ?? 0);
                  const settled = inst.status === "paid" || instBalance <= 0;
                  const late = !settled && inst.due_date && inst.due_date < todayISO();
                  const variant = settled ? "success" : late ? "error" : "warning";
                  const label = settled ? "Paid" : late ? "Overdue" : "Due";
                  return (
                    <div key={inst.installment_id} className="flex items-center gap-3 px-5 py-2 text-sm">
                      <span className="w-6 shrink-0 text-neutral-500">#{inst.sequence}</span>
                      <span className={`min-w-0 flex-1 ${late ? "font-bold text-error-500" : "text-neutral-900"}`}>
                        {fmtDate(inst.due_date, null) || "No due date"}
                      </span>
                      <span className="text-neutral-700">{peso(inst.amount)}</span>
                      <Badge variant={variant} size="sm">{label}</Badge>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </Panel>
      ))}

      <p className="text-center text-xs leading-relaxed text-neutral-500">
        For payment arrangements or questions about your balance, please contact the school's accounting office.
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function GuardianChildPage() {
  usePageTitle("Child Records");
  const { enrollmentId } = useParams();

  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // One entry per independent fetch: { data, loading, failed }.
  const [att, setAtt]       = useState(SECTION_INIT);
  const [ledger, setLedger] = useState(SECTION_INIT);
  const [reqs, setReqs]     = useState(SECTION_INIT);

  const load = useCallback(async () => {
    // Clearing up front matters when `enrollmentId` changes under a mounted
    // component: without it the previous child's grades, attendance, bills and
    // documents stay on screen looking freshly loaded.
    setLoading(true);
    setError("");
    setReport(null);

    // Attendance is keyed off the enrollment we already have, so it starts
    // straight away — it never needed the report card at all.
    runSection(getAttendanceSummary({ enrollment: enrollmentId }), setAtt);

    let studentId;
    try {
      const rc = await getReportCard(enrollmentId);
      setReport(rc);
      studentId = rc?.student?.student_id;
    } catch (e) {
      setError(e.message || "Failed to load this child's records.");
    } finally {
      setLoading(false);
    }

    // Billing and documents are keyed off student_id, which only the report
    // card carries — so if that call failed they genuinely can't be fetched.
    // They still have to leave their loading state, which is exactly what the
    // old control flow skipped.
    if (studentId) {
      runSection(getStudentLedger(studentId), setLedger);
      runSection(fetchRequirementSummary(studentId), setReqs);
    } else {
      setLedger(SECTION_UNAVAILABLE);
      setReqs(SECTION_UNAVAILABLE);
    }
  }, [enrollmentId]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [enrollmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const student = report?.student;
  const enrollment = report?.enrollment;
  const fullName = student ? [student.first_name, student.middle_name, student.last_name, student.suffix].filter(Boolean).join(" ") : "";

  const missingDocs = missingRequirements(reqs.data);

  const TABS = [
    { id: "grades",       label: "Grades",      icon: "ti-chart-bar" },
    { id: "attendance",   label: "Attendance",  icon: "ti-calendar-check" },
    { id: "billing",      label: "Billing",     icon: "ti-receipt" },
    // The count rides on the tab itself so a parent sees there's something
    // outstanding without having to open it first.
    { id: "requirements", label: "Documents",   icon: "ti-file-text", count: missingDocs || undefined },
  ];
  const { active: tab, direction, setActive: setTab } = useTabs(TABS);

  return (
    <>
      {error && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-500">
          <i className="ti ti-alert-circle text-base" aria-hidden="true" />
          <span className="min-w-0 flex-1">{error}</span>
          <Button variant="secondary" size="sm" icon="ti-refresh" onClick={load}>Try again</Button>
        </div>
      )}

      <GuardianHero className="mb-4">
        {loading ? (
          <div className="flex items-center gap-4" aria-hidden="true">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-white/10" />
            <div className="flex-1 space-y-2.5">
              <div className="h-5 w-1/2 animate-pulse rounded bg-white/10" />
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-white/10" />
            </div>
          </div>
        ) : student ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-xl font-semibold text-white"
              aria-hidden="true"
            >
              {initialsFrom(student.first_name, student.last_name)}
            </div>
            {/* The 12rem floor pushes the button onto its own row on a phone,
                rather than squeezing the name into a one-word-wide column. */}
            <div className="min-w-[12rem] flex-1">
              <h1 className="text-xl font-semibold leading-tight text-white">{fullName}</h1>
              {enrollment && (
                <div className="mt-1 text-sm text-white/75">
                  {[enrollment.grade_level, enrollment.section, LEVEL_LABELS[enrollment.school_level] || enrollment.school_level]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-white/65">
                {enrollment?.enrollment_status && (
                  <StatusBadge status={enrollment.enrollment_status} map={ENROLLMENT_STATUS_MAP} size="sm" />
                )}
                {enrollment?.school_year && <span>SY {enrollment.school_year}</span>}
                {student.lrn && <span className="tabular-nums">LRN {student.lrn}</span>}
              </div>
            </div>
            {/* The printable report card already existed at this route and is
                already scoped so a guardian can only open their own child's —
                but nothing in this portal linked to it, so a parent had no way
                to reach it. Its own toolbar has a Back button (navigate(-1)),
                so this doesn't strand anyone on a chrome-less page. */}
            <Button variant="secondary" size="sm" icon="ti-printer" to={`/report-card/${enrollmentId}`} className="w-full sm:w-auto">
              Printable report card
            </Button>
          </div>
        ) : (
          <div>
            <h1 className="text-xl font-semibold leading-tight text-white">Child records</h1>
            <p className="mt-1 text-sm text-white/70">This child's details couldn't be loaded.</p>
          </div>
        )}
      </GuardianHero>

      {/* At-a-glance answers, so the page opens with "what needs attention"
          rather than a static grades table. Only once the report card is in:
          without it there is no child to summarise, and every cell would
          show its empty answer ("Not posted yet", "Nothing due") as fact. */}
      {!loading && report && (
        <StatusStrip report={report} att={att} ledger={ledger} reqs={reqs} />
      )}

      {/* On a phone the icons go and the padding tightens, so all four tabs
          fit on one line instead of "Documents" and its count scrolling off. */}
      <Tabs
        tabs={TABS}
        value={tab}
        onChange={setTab}
        className="mb-[18px] max-sm:[&_[role=tab]]:px-3 max-sm:[&_[role=tab]>i]:hidden"
      />

      <TabPanel id={tab} direction={direction}>
        {tab === "grades" && (loading ? <Card><Skeleton height={160} radius={12} /></Card> : <ReportCardTab data={report} error={error} />)}
        {tab === "attendance" && <AttendanceTab summary={att.data} loading={att.loading} failed={att.failed} onRetry={load} />}
        {tab === "billing" && <BillingTab ledger={ledger.data} loading={ledger.loading} failed={ledger.failed} onRetry={load} />}
        {tab === "requirements" && <RequirementsTab requirements={reqs.data} loading={reqs.loading} failed={reqs.failed} onRetry={load} />}
      </TabPanel>
    </>
  );
}
