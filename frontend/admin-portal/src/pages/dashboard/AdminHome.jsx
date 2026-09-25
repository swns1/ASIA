// AdminHome — the task-first home page for super_admin and admin.
//
// Replaces the shared staff dashboard for these two roles (the approved
// "Principal / Admin · Proposed" board on the dashboard redesign canvas). The
// principle: start from what needs doing, then how the school is doing.
//
//   1. Start a task: find a student, enroll one, record a payment.
//   2. Needs your attention: one row per queue with its own button, listing
//      only queues that have something in them.
//   3. Teachers today: which sections haven't taken attendance, and how far
//      along the current grading period's grades are.
//   4. School at a glance: four headline numbers, no filter drawers (those
//      stay on the list pages).
//   5. Trends: the same three charts the staff dashboard uses.
//
// Every count here is scoped to the current school year, and so is every link,
// because the list pages open on the year in their link.

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";

import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import Modal from "../../components/ui/Modal";
import Skeleton from "../../components/ui/Skeleton";
import Card, { Panel, StatCard } from "../../components/ui/Card";
import Table, { TableRow, TableCell } from "../../components/ui/Table";
import Meter from "../../components/charts/Meter";
import { token } from "../../components/charts/tokens";
import RecordPaymentModal from "../../components/RecordPaymentModal";
import { Input } from "../../components/FormField";
import { AttendanceBand, PipelineBand, RiskBand } from "./DashboardBands";

import { getDashboardSummary, getEnrollments, getTeachersToday } from "../../api/enrollmentApi";
import { getFinancialSummary, getInvoices } from "../../api/billingApi";
import { getStudentApplications } from "../../api/applicationApi";
import { useSchoolYear } from "../../context/SchoolYearContext";
import { getCurrentUser } from "../../utils/auth";
import { pageVariants } from "../../utils/motion";
import { attentionRows, compactPeso, dueLine, greeting, plural, sectionName } from "./adminHomeData";

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminHome() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const firstName = String(user?.name ?? "").trim().split(/\s+/)[0];
  const { currentYear: schoolYear } = useSchoolYear();
  const [now] = useState(() => new Date());

  const [loading, setLoading] = useState(true);
  const [partialError, setPartialError] = useState(false);
  const [data, setData] = useState({});
  const [showAmounts, setShowAmounts] = useState(true);
  const [showSections, setShowSections] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const load = useCallback(async () => {
    if (!schoolYear) return;
    setLoading(true);
    const sy = schoolYear;
    const count = (p) => p.then((r) => r?.count ?? 0);
    const parts = {
      summary:      getDashboardSummary({ school_year: sy }),
      teachers:     getTeachersToday({ school_year: sy }),
      financial:    getFinancialSummary(sy),
      pending:      count(getEnrollments({ enrollment_status: "pending", school_year: sy, page_size: 1 })),
      applications: count(getStudentApplications({ status: "submitted", page_size: 1 })),
      unpaid:       count(getInvoices({ status: "unpaid", school_year: sy, page_size: 1 })),
      overdue:      count(getInvoices({ overdue: "true", school_year: sy, page_size: 1 })),
    };
    // One failed request shouldn't blank the whole page, but it must not
    // pass silently either: a missing count would read as "nothing to do".
    const keys = Object.keys(parts);
    const results = await Promise.allSettled(Object.values(parts));
    const next = {};
    let failed = false;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") next[keys[i]] = r.value;
      else { failed = true; console.error(`Admin home: ${keys[i]} failed`, r.reason); }
    });
    setData(next);
    setPartialError(failed);
    setLoading(false);
  }, [schoolYear]);

  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  const teachers = data.teachers;
  const period = teachers?.grading_period;
  const subtitle = [
    now.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    period?.source === "calendar" ? period.label : null,
    schoolYear ? `S.Y. ${schoolYear}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        title={firstName ? `${greeting(now)}, ${firstName}` : greeting(now)}
        icon="ti-home"
        subtitle={subtitle}
      />

      <motion.div
        variants={pageVariants.container}
        initial="hidden"
        animate="visible"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6"
      >
        <AnimatePresence>
          {partialError && !loading && (
            <Alert variant="warning" title="Some of this page didn't load">
              A few numbers may be missing.{" "}
              <button type="button" onClick={load} className="focus-ring rounded-sm font-semibold underline">
                Try again
              </button>
            </Alert>
          )}
        </AnimatePresence>

        <motion.div variants={pageVariants.item}>
          <QuickActions
            onFind={(term) => navigate(term ? `/students?search=${encodeURIComponent(term)}` : "/students")}
            onEnroll={() => navigate("/enrollments/new")}
            onRecordPayment={() => setShowPayment(true)}
          />
        </motion.div>

        <motion.div variants={pageVariants.item} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <AttentionPanel data={data} loading={loading} schoolYear={schoolYear} onGo={navigate} />
          <TeachersTodayPanel
            teachers={teachers}
            loading={loading}
            now={now}
            onSeeAll={() => setShowSections(true)}
            onOpenCalendar={() => navigate("/academic-calendar")}
          />
        </motion.div>

        <motion.section variants={pageVariants.item} aria-labelledby="glance-heading">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="glance-heading" className="text-sm font-bold text-neutral-900">School at a glance</h2>
            <Button
              variant="ghost"
              size="sm"
              icon={showAmounts ? "ti-eye-off" : "ti-eye"}
              onClick={() => setShowAmounts((v) => !v)}
              aria-pressed={!showAmounts}
            >
              {showAmounts ? "Hide amounts" : "Show amounts"}
            </Button>
          </div>
          <Glance
            data={data}
            loading={loading}
            schoolYear={schoolYear}
            showAmounts={showAmounts}
            onGo={navigate}
          />
        </motion.section>

        <motion.section variants={pageVariants.item} aria-labelledby="trends-heading">
          <h2 id="trends-heading" className="mb-2 text-sm font-bold text-neutral-900">Trends</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <PipelineBand pipeline={data.summary?.pipeline} loading={loading} schoolYear={schoolYear} compact />
            <RiskBand
              risk={data.summary?.risk}
              loading={loading}
              compact
              onOpen={
                <Button variant="ghost" size="sm" iconRight icon="ti-arrow-right" onClick={() => navigate("/analytics")}>
                  Analytics
                </Button>
              }
            />
            <AttendanceBand series={data.summary?.attendance_series} loading={loading} compact />
          </div>
        </motion.section>
      </motion.div>

      {showSections && teachers && (
        <SectionsModal teachers={teachers} now={now} onClose={() => setShowSections(false)} />
      )}
      {showPayment && (
        <RecordPaymentModal
          preloadedInvoiceId={null}
          onClose={() => setShowPayment(false)}
          onSaved={() => { setShowPayment(false); load(); }}
        />
      )}
    </>
  );
}

// ── Start a task ─────────────────────────────────────────────────────────────

function QuickActions({ onFind, onEnroll, onRecordPayment }) {
  const [term, setTerm] = useState("");
  return (
    <Card className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <form
        role="search"
        className="flex min-w-0 flex-1 items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); onFind(term.trim()); }}
      >
        <label htmlFor="home-student-search" className="sr-only">Find a student by name, LRN or student number</label>
        <Input
          id="home-student-search"
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Find a student by name, LRN or student number"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" icon="ti-search">Find</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button icon="ti-user-plus" onClick={onEnroll}>Enroll a student</Button>
        <Button variant="secondary" icon="ti-cash" onClick={onRecordPayment}>Record a payment</Button>
      </div>
    </Card>
  );
}

// ── Needs your attention ─────────────────────────────────────────────────────

const ROW_TONES = {
  warning: "bg-warning-50 text-warning-500",
  info:    "bg-info-50 text-info-500",
  error:   "bg-error-50 text-error-500",
};

function AttentionPanel({ data, loading, schoolYear, onGo }) {
  const rows = attentionRows(data, schoolYear);
  const subtitle = loading
    ? "Checking…"
    : rows.length
      ? `${plural(rows.length, "thing is", "things are")} waiting on you`
      : "Nothing is waiting on you";

  return (
    <Panel title="Needs your attention" subtitle={subtitle} icon="ti-bell" padding="none">
      {loading ? (
        <div className="flex flex-col gap-3 p-5">
          {[0, 1, 2].map((i) => <Skeleton key={i} height={40} variant="pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center gap-3 p-5 text-sm text-neutral-600">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-success-50 text-success-500">
            <i className="ti ti-circle-check text-lg" aria-hidden="true" />
          </span>
          All caught up. New enrollments, applications and unpaid bills will show up here.
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${ROW_TONES[r.tone]}`}>
                <i className={`ti ${r.icon} text-lg`} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-neutral-900">{r.text(r.count)}</span>
              <Button variant="secondary" size="sm" onClick={() => onGo(r.to)} aria-label={`${r.action}: ${r.text(r.count)}`}>
                {r.action}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ── Teachers today ───────────────────────────────────────────────────────────

const NOT_TAKEN_SHOWN = 4;

function TeachersTodayPanel({ teachers, loading, now, onSeeAll, onOpenCalendar }) {
  const action = teachers?.sections?.length ? (
    <Button variant="ghost" size="sm" iconRight icon="ti-arrow-right" onClick={onSeeAll}>
      See every section
    </Button>
  ) : undefined;

  if (loading) {
    return (
      <Panel title="Teachers today" subtitle="Attendance and grades, by section" icon="ti-user-check">
        <div className="flex flex-col gap-3">
          <Skeleton height={36} variant="pulse" />
          <Skeleton height={72} variant="pulse" />
          <Skeleton height={36} variant="pulse" />
        </div>
      </Panel>
    );
  }

  if (!teachers) {
    return (
      <Panel title="Teachers today" subtitle="Attendance and grades, by section" icon="ti-user-check">
        <p className="text-sm text-neutral-600">Couldn't load teacher activity.</p>
      </Panel>
    );
  }

  const { attendance, grades, grading_period: period, no_classes: noClasses, sections } = teachers;

  if (!sections.length) {
    return (
      <Panel title="Teachers today" subtitle="Attendance and grades, by section" icon="ti-user-check">
        <p className="text-sm text-neutral-600">No section has enrolled students this school year yet.</p>
      </Panel>
    );
  }

  const notTaken = sections.filter((s) => !s.attendance_taken);
  const due = period?.source === "calendar" ? dueLine(period.due_date, now) : null;
  const hasSeniorHigh = sections.some((s) => s.school_level === "senior_highschool" && s.grades);

  return (
    <Panel title="Teachers today" subtitle="Attendance and grades, by section" icon="ti-user-check" action={action}>
      <div className="flex flex-col gap-5">
        <div>
          {noClasses ? (
            <p className="text-sm text-neutral-700">
              <span className="font-semibold text-neutral-900">No classes today</span> · {noClasses.label}
            </p>
          ) : (
            <>
              <Meter
                label="Attendance taken"
                value={attendance.sections_taken}
                max={attendance.sections_total}
                valueText={attendance.sections_taken.toLocaleString()}
                targetText={plural(attendance.sections_total, "section")}
                color={token("--color-success-500")}
              />
              {notTaken.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1.5 text-xs font-semibold text-neutral-600">Not taken yet</div>
                  <ul className="flex flex-col gap-1">
                    {notTaken.slice(0, NOT_TAKEN_SHOWN).map((s) => (
                      <li key={sectionName(s) + s.school_level} className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-neutral-900">{sectionName(s)}</span>
                        <AdviserName advisers={s.advisers} />
                      </li>
                    ))}
                  </ul>
                  {notTaken.length > NOT_TAKEN_SHOWN && (
                    <div className="mt-1 text-xs text-neutral-500">
                      and {plural(notTaken.length - NOT_TAKEN_SHOWN, "more section")}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-neutral-200 pt-4">
          {grades.sections_total > 0 ? (
            <Meter
              label={`${period.label} grades complete`}
              value={grades.sections_complete}
              max={grades.sections_total}
              valueText={grades.sections_complete.toLocaleString()}
              targetText={plural(grades.sections_total, "section")}
              color={token("--color-info-500")}
            />
          ) : (
            <p className="text-sm text-neutral-600">No subjects are set up for these grade levels yet.</p>
          )}
          {due && (
            <p className={`mt-2 text-xs font-semibold ${due.late ? "text-error-500" : "text-neutral-600"}`}>
              {due.text}
            </p>
          )}
          {hasSeniorHigh && grades.sections_total > 0 && (
            <p className="mt-1 text-xs text-neutral-500">Senior High sections count their {period.semester_label} grades.</p>
          )}
          {period?.source !== "calendar" && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-sm bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              <i className="ti ti-calendar-plus text-sm" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                Add each quarter's dates to the Academic Calendar (type: Grading Period) to see when grades are due.
              </span>
              <Button variant="ghost" size="sm" onClick={onOpenCalendar}>Open calendar</Button>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function AdviserName({ advisers }) {
  if (!advisers?.length) {
    return <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-500">No adviser</span>;
  }
  return <span className="truncate text-neutral-600">{advisers.join(", ")}</span>;
}

const SECTION_COLUMNS = [
  { key: "section",    label: "Section" },
  { key: "adviser",    label: "Adviser" },
  { key: "students",   label: "Students" },
  { key: "attendance", label: "Attendance today" },
  { key: "grades",     label: "Grades" },
];

function SectionsModal({ teachers, now, onClose }) {
  const noClasses = teachers.no_classes;
  return (
    <Modal
      size="xl"
      title="Every section"
      description={`${teachers.grading_period.label} · ${now.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}`}
      icon="ti-users-group"
      onClose={onClose}
      showClose
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <Table columns={SECTION_COLUMNS} stickyHeader={false}>
        {teachers.sections.map((s) => (
          <TableRow key={sectionName(s) + s.school_level}>
            <TableCell className="font-semibold text-neutral-900">
              {sectionName(s)}
              <div className="text-xs font-normal text-neutral-500">{s.level_label}</div>
            </TableCell>
            <TableCell><AdviserName advisers={s.advisers} /></TableCell>
            <TableCell className="tabular-nums">{s.students.toLocaleString()}</TableCell>
            <TableCell>
              {noClasses ? (
                <span className="text-neutral-500">No classes</span>
              ) : s.attendance_taken ? (
                <span className="font-semibold text-success-500">Taken</span>
              ) : (
                <span className="font-semibold text-warning-500">Not yet</span>
              )}
            </TableCell>
            <TableCell>
              {!s.grades ? (
                <span className="text-neutral-500">No subjects set up</span>
              ) : s.grades.complete ? (
                <span className="font-semibold text-success-500">{s.grades.label} complete</span>
              ) : (
                <span className="tabular-nums text-neutral-700">
                  {s.grades.done.toLocaleString()} of {s.grades.expected.toLocaleString()} grades in
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </Table>
    </Modal>
  );
}

// ── School at a glance ───────────────────────────────────────────────────────

function Glance({ data, loading, schoolYear, showAmounts, onGo }) {
  const pipeline = data.summary?.pipeline;
  const risk = data.summary?.risk;
  const fin = data.financial;
  const att = data.teachers?.attendance;
  const noClasses = data.teachers?.no_classes;

  const billed = parseFloat(fin?.net_billed ?? 0);
  const collected = parseFloat(fin?.total_collected ?? 0);
  const collectedPct = billed > 0 ? Math.round((collected / billed) * 100) : null;

  const riskDate = risk?.computed_at
    ? new Date(risk.computed_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
    : null;
  const sy = encodeURIComponent(schoolYear ?? "");

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Enrolled"
        icon="ti-school"
        iconTone="success"
        loading={loading}
        value={pipeline ? pipeline.enrolled.toLocaleString() : "—"}
        hint={`S.Y. ${schoolYear}`}
        onClick={() => onGo(`/enrollments?enrollment_status=enrolled&school_year=${sy}`)}
      />
      <StatCard
        label="Collected"
        icon="ti-cash"
        iconTone="info"
        loading={loading}
        value={!fin ? "—" : showAmounts ? compactPeso(collected) : "₱ ••••••"}
        hint={!fin ? "Billing didn't load" : !showAmounts ? "Amounts hidden" : collectedPct === null
          ? "Nothing billed yet"
          : `${collectedPct}% of ${compactPeso(billed)} billed`}
        onClick={() => onGo(`/invoices?school_year=${sy}`)}
      />
      <StatCard
        label="Present today"
        icon="ti-calendar-check"
        iconTone="brand"
        loading={loading}
        value={att?.rate != null ? `${Math.round(att.rate * 100)}%` : "—"}
        hint={
          noClasses ? `No classes · ${noClasses.label}`
            : !att ? "Attendance didn't load"
            : att.sections_taken ? `From ${att.sections_taken} of ${plural(att.sections_total, "section")}`
            : "No attendance taken yet today"
        }
      />
      <StatCard
        label="Need follow-up"
        icon="ti-alert-triangle"
        iconTone="warning"
        loading={loading}
        value={risk ? risk.flagged.toLocaleString() : "—"}
        hint={riskDate ? `Risk check on ${riskDate}` : "No risk check yet"}
        onClick={() => onGo("/analytics")}
      />
    </div>
  );
}
