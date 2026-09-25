// AdminHome — the task-first home page for super_admin and admin.
//
// Replaces the shared staff dashboard for these two roles (the approved
// "Principal / Admin · Proposed" board on the dashboard redesign canvas). The
// principle: start from what needs doing, then how the school is doing.
//
//   1. Start a task: find a student, enroll one, record a payment.
//   2. Needs your attention: one row per queue with its own button, listing
//      only queues that have something in them.
//   3. Teachers today: a short preview (attendance taken, grades in, sections
//      with no adviser). Clicking it opens every section with filters.
//   4. School at a glance: three headline numbers, then the Billing panel.
//      No filter drawers; those stay on the list pages.
//   5. Trends: the same three charts the staff dashboard uses.
//
// The page opens on the current school year, and the picker in the header can
// switch it (next year during enrollment season, say). Every count follows the
// picked year, and so does every link, because the list pages open on the year
// in their link. Teachers today is the exception: today's attendance only
// exists in the current year, so it always shows that and says so.

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";

import PageHeader from "../../components/ui/PageHeader";
import SchoolYearPicker from "../../components/ui/SchoolYearPicker";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import Modal from "../../components/ui/Modal";
import Skeleton from "../../components/ui/Skeleton";
import Card, { Panel, StatCard } from "../../components/ui/Card";
import BillingPanel from "../../components/ui/BillingPanel";
import ChipGroup from "../../components/ui/ChipGroup";
import Table, { TableRow, TableCell } from "../../components/ui/Table";
import Meter from "../../components/charts/Meter";
import { chartInk, token } from "../../components/charts/tokens";
import RecordPaymentModal from "../../components/RecordPaymentModal";
import { Input } from "../../components/FormField";
import { AttendanceBand, PipelineBand, RiskBand } from "./DashboardBands";

import { getDashboardSummary, getEnrollments, getTeachersToday } from "../../api/enrollmentApi";
import { getFinancialSummary, getInvoices } from "../../api/billingApi";
import { getStudentApplications } from "../../api/applicationApi";
import { useSchoolYear } from "../../context/SchoolYearContext";
import useYearFilter from "../../hooks/useYearFilter";
import { getCurrentUser } from "../../utils/auth";
import { pageVariants } from "../../utils/motion";
import { attentionRows, dueLine, greeting, plural, sectionName, withYear } from "./adminHomeData";

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminHome() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const firstName = String(user?.name ?? "").trim().split(/\s+/)[0];
  const { currentYear } = useSchoolYear();
  // No "All years": a home page that adds up several years is hard to read.
  const [year, setYear, yearIsDefault] = useYearFilter({ allowAll: false });
  const [now] = useState(() => new Date());

  const [loading, setLoading] = useState(true);
  const [partialError, setPartialError] = useState(false);
  const [data, setData] = useState({});
  const [showAmounts, setShowAmounts] = useState(true);
  const [showTeachers, setShowTeachers] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const load = useCallback(async () => {
    if (!year || !currentYear) return;
    setLoading(true);
    const sy = year;
    const count = (p) => p.then((r) => r?.count ?? 0);
    const parts = {
      summary:      getDashboardSummary({ school_year: sy }),
      teachers:     getTeachersToday({ school_year: currentYear }),
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
  }, [year, currentYear]);

  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  const teachers = data.teachers;
  const period = teachers?.grading_period;
  const subtitle = [
    now.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    period?.source === "calendar" ? period.label : null,
    year ? `S.Y. ${year}` : null,
  ].filter(Boolean).join(" · ");
  // Set only while another year is picked, for the cards that stay on today.
  const todayYear = yearIsDefault ? null : currentYear;

  return (
    <>
      <PageHeader
        title={firstName ? `${greeting(now)}, ${firstName}` : greeting(now)}
        icon="ti-home"
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            {!yearIsDefault && (
              <Button variant="ghost" size="sm" icon="ti-arrow-back-up" onClick={() => setYear(null)}>
                Back to {currentYear}
              </Button>
            )}
            <SchoolYearPicker
              value={year}
              onChange={setYear}
              includeAllYears={false}
              // Red only while it narrows to a year other than the current one.
              active={!yearIsDefault}
              // The pill is at the page's right edge; open the panel leftward.
              align="end"
            />
          </div>
        }
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

        <motion.div variants={pageVariants.item} className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <AttentionPanel data={data} loading={loading} schoolYear={year} onGo={navigate} />
          <TeachersTodayPreview
            teachers={teachers}
            loading={loading}
            now={now}
            onOpen={() => setShowTeachers(true)}
          />
        </motion.div>

        <motion.section variants={pageVariants.item} aria-labelledby="glance-heading" className="flex flex-col gap-3">
          <h2 id="glance-heading" className="text-sm font-bold text-neutral-900">School at a glance</h2>
          <Glance data={data} loading={loading} schoolYear={year} todayYear={todayYear} onGo={navigate} />
          {/* The panel follows the page's year picker, so it gets no year
              filter of its own; two year controls could disagree. Its links
              carry the year for the same reason every other link here does. */}
          <BillingPanel
            summary={data.financial}
            loading={loading}
            schoolYear={year}
            showAmounts={showAmounts}
            onToggleAmounts={() => setShowAmounts((v) => !v)}
            onOpenInvoices={(link) => navigate(withYear(link, year))}
          />
        </motion.section>

        <motion.section variants={pageVariants.item} aria-labelledby="trends-heading">
          <h2 id="trends-heading" className="mb-2 text-sm font-bold text-neutral-900">Trends</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <PipelineBand pipeline={data.summary?.pipeline} loading={loading} schoolYear={year} compact />
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

      {showTeachers && teachers && (
        <TeachersTodayModal
          teachers={teachers}
          now={now}
          onOpenCalendar={() => navigate("/academic-calendar")}
          onClose={() => setShowTeachers(false)}
        />
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
//
// A short preview on the page; everything else lives in the details window.
// The long "not taken yet" list and the calendar reminder used to sit here,
// which made this the tallest thing on the page.

const TEACHERS_SUBTITLE = "Attendance and grades, by section";

function noAdviserCount(sections) {
  return sections.filter((s) => !s.advisers?.length).length;
}

// One compact progress row: label, bar, "N of M sections".
function MiniMeter({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((Math.min(value, max) / max) * 100) : 0;
  const text = `${value.toLocaleString()} of ${plural(max, "section")}`;
  return (
    <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs">
      <span className="truncate font-semibold text-neutral-700">{label}</span>
      <span
        className="block h-2 overflow-hidden rounded-full"
        style={{ background: chartInk().grid }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${text}`}
      >
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="tabular-nums text-neutral-600">
        <strong className="text-neutral-900">{value.toLocaleString()}</strong> of {plural(max, "section")}
      </span>
    </div>
  );
}

function TeachersTodayPreview({ teachers, loading, now, onOpen }) {
  if (loading || !teachers || !teachers.sections.length) {
    return (
      <Panel title="Teachers today" subtitle={TEACHERS_SUBTITLE} icon="ti-user-check">
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton height={14} variant="pulse" />
            <Skeleton height={14} variant="pulse" />
          </div>
        ) : (
          <p className="text-sm text-neutral-600">
            {!teachers ? "Couldn't load teacher activity." : "No section has enrolled students this school year yet."}
          </p>
        )}
      </Panel>
    );
  }

  const { attendance, grades, grading_period: period, no_classes: noClasses, sections } = teachers;
  const due = period?.source === "calendar" ? dueLine(period.due_date, now) : null;
  const noAdviser = noAdviserCount(sections);

  return (
    <Card padding="none" className="overflow-hidden">
      {/* The whole card is one button: it holds no other controls, so there
          is nothing to nest, and one big target suits the people using it. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label="Teachers today: open details"
        className="focus-ring block w-full text-left transition-colors hover:bg-brand-50/40"
      >
        <div className="flex items-center gap-2.5 border-b border-neutral-200 px-5 py-3.5">
          <i className="ti ti-user-check text-brand-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold text-neutral-900">Teachers today</h3>
            {/* Always today, whatever year the page is showing, so the year
                is part of the subtitle rather than a banner. */}
            <p className="truncate text-xs text-neutral-500">Today · S.Y. {teachers.school_year}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-600">
            View details <i className="ti ti-arrow-right" aria-hidden="true" />
          </span>
        </div>
        <div className="flex flex-col gap-2.5 px-5 py-3.5">
          {noClasses ? (
            <p className="text-xs text-neutral-700">
              <span className="font-semibold text-neutral-900">No classes today</span> · {noClasses.label}
            </p>
          ) : (
            <MiniMeter
              label="Attendance taken"
              value={attendance.sections_taken}
              max={attendance.sections_total}
              color={token("--color-success-500")}
            />
          )}
          {grades.sections_total > 0 ? (
            <MiniMeter
              label={`${period.label} grades in`}
              value={grades.sections_complete}
              max={grades.sections_total}
              color={token("--color-info-500")}
            />
          ) : (
            <p className="text-xs text-neutral-600">No subjects are set up for these grade levels yet.</p>
          )}
          {(due || noAdviser > 0) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold">
              {due && <span className={due.late ? "text-error-500" : "text-neutral-600"}>{due.text}</span>}
              {noAdviser > 0 && (
                <span className="inline-flex items-center gap-1.5 text-warning-500">
                  <i className="ti ti-alert-triangle" aria-hidden="true" />
                  {plural(noAdviser, "section has", "sections have")} no adviser
                </span>
              )}
            </div>
          )}
        </div>
      </button>
    </Card>
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

const SECTION_FILTERS = {
  all:        () => true,
  attendance: (s) => !s.attendance_taken,
  grades:     (s) => Boolean(s.grades) && !s.grades.complete,
  adviser:    (s) => !s.advisers?.length,
};

function SummaryBox({ children }) {
  return <div className="rounded-md border border-neutral-200 px-4 py-3">{children}</div>;
}

function TeachersTodayModal({ teachers, now, onOpenCalendar, onClose }) {
  const [filter, setFilter] = useState("all");
  const { attendance, grades, grading_period: period, no_classes: noClasses, sections } = teachers;
  const due = period?.source === "calendar" ? dueLine(period.due_date, now) : null;
  const hasSeniorHigh = sections.some((s) => s.school_level === "senior_highschool" && s.grades);
  const noAdviser = noAdviserCount(sections);
  const shown = sections.filter(SECTION_FILTERS[filter]);

  const count = (key) => sections.filter(SECTION_FILTERS[key]).length;
  const chips = [
    { value: "all", label: "All sections", tone: "brand", count: sections.length },
    // On a day with no classes, "not taken" would list every section for no reason.
    ...(noClasses ? [] : [{ value: "attendance", label: "Attendance not taken", tone: "warning", count: count("attendance") }]),
    { value: "grades", label: "Grades not complete", tone: "info", count: count("grades") },
    { value: "adviser", label: "No adviser", tone: "warning", count: noAdviser },
  ];

  return (
    <Modal
      size="xl"
      title="Teachers today"
      description={[
        now.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" }),
        period.label,
        `S.Y. ${teachers.school_year}`,
      ].join(" · ")}
      icon="ti-user-check"
      onClose={onClose}
      showClose
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SummaryBox>
            {noClasses ? (
              <p className="text-sm text-neutral-700">
                <span className="font-semibold text-neutral-900">No classes today</span> · {noClasses.label}
              </p>
            ) : (
              <Meter
                label="Attendance taken"
                value={attendance.sections_taken}
                max={attendance.sections_total}
                valueText={attendance.sections_taken.toLocaleString()}
                targetText={plural(attendance.sections_total, "section")}
                color={token("--color-success-500")}
              />
            )}
          </SummaryBox>
          <SummaryBox>
            {grades.sections_total > 0 ? (
              <Meter
                label={`${period.label} grades in`}
                value={grades.sections_complete}
                max={grades.sections_total}
                valueText={grades.sections_complete.toLocaleString()}
                targetText={plural(grades.sections_total, "section")}
                color={token("--color-info-500")}
              />
            ) : (
              <p className="text-sm text-neutral-600">No subjects are set up yet.</p>
            )}
            {due && <p className={`mt-2 text-xs font-semibold ${due.late ? "text-error-500" : "text-neutral-600"}`}>{due.text}</p>}
            {hasSeniorHigh && <p className="mt-1 text-xs text-neutral-500">Senior High counts its {period.semester_label}.</p>}
          </SummaryBox>
          <SummaryBox>
            <div className="text-xs font-semibold text-neutral-700">No adviser</div>
            <div className={`mt-1 text-lg font-bold tabular-nums ${noAdviser ? "text-warning-500" : "text-neutral-900"}`}>
              {noAdviser.toLocaleString()}{" "}
              <span className="text-xs font-medium text-neutral-500">of {plural(sections.length, "section")}</span>
            </div>
            {noAdviser > 0 && (
              <p className="mt-1 text-xs text-neutral-500">No teacher can take attendance or enter grades for these.</p>
            )}
          </SummaryBox>
        </div>

        {period?.source !== "calendar" && (
          <div className="flex flex-wrap items-center gap-2 rounded-sm bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            <i className="ti ti-calendar-plus text-sm" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              Add each quarter's dates to the Academic Calendar (type: Grading Period) to see when grades are due.
            </span>
            <Button variant="ghost" size="sm" onClick={onOpenCalendar}>Open calendar</Button>
          </div>
        )}

        <ChipGroup label="Show sections" options={chips} value={filter} onChange={setFilter} />

        <Table
          columns={SECTION_COLUMNS}
          stickyHeader={false}
          isEmpty={shown.length === 0}
          empty={{ icon: "ti-circle-check", title: "Nothing here", subtitle: "No section matches this filter.", withAvatar: false }}
        >
          {shown.map((s) => (
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
      </div>
    </Modal>
  );
}

// ── School at a glance ───────────────────────────────────────────────────────

function Glance({ data, loading, schoolYear, todayYear, onGo }) {
  const pipeline = data.summary?.pipeline;
  const risk = data.summary?.risk;
  const att = data.teachers?.attendance;
  const noClasses = data.teachers?.no_classes;

  const riskDate = risk?.computed_at
    ? new Date(risk.computed_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
    : null;
  const sy = encodeURIComponent(schoolYear ?? "");

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        label="Present today"
        icon="ti-calendar-check"
        iconTone="brand"
        loading={loading}
        value={att?.rate != null ? `${Math.round(att.rate * 100)}%` : "—"}
        hint={
          noClasses ? `No classes · ${noClasses.label}`
            : !att ? "Attendance didn't load"
            : todayYear ? `Today · S.Y. ${todayYear}`
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
