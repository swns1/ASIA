// AdminHome — the task-first home page for super_admin and admin.
//
// Replaces the shared staff dashboard for these two roles (the approved
// "Principal / Admin · Proposed" board on the dashboard redesign canvas). The
// principle: start from what needs doing, then how the school is doing.
//
//   1. Start a task: find a student, enroll one, record a payment.
//   2. Needs your attention: one row per queue, listing only queues that
//      have something in them. In the header's notification bell, as on the
//      staff dashboard (the queues are shared: ./attention.js).
//   3. Teachers today: one tile per section (attendance taken or not, no
//      adviser) and grades in. Clicking it opens every section with filters.
//      Beside it, Coming up: the calendar and the admin's own events
//      (./ComingUp.jsx).
//   4. School at a glance: two headline numbers (present today, need
//      follow-up), then this year against last for enrollees and for
//      collection pace (YearOverYear.jsx), with the year's Billing panel
//      under the pair. No filter drawers; those stay on the list pages.
//   5. Trends: learners to follow up by school level beside weekly
//      attendance against target, then the enrollment pipeline.
//
// The header, Start a task and the partial-load warning are the pieces every
// home shares (./HomeParts.jsx). The on-page attention list (AttentionPanel,
// there too) is the registrar's; here the bell carries it (2026-10-12).
//
// Two-card rows share one grid (TWO_UP): two equal columns where both fit,
// one where they don't, and cards in a row end level.
//
// The page opens on the current school year, and the picker in the header can
// switch it (next year during enrollment season, say). Every count follows the
// picked year, and so does every link, because the list pages open on the year
// in their link. Teachers today is the exception: today's attendance only
// exists in the current year, so it always shows that and says so.

import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Skeleton from "../../components/ui/Skeleton";
import Card, { Panel, StatCard } from "../../components/ui/Card";
import BillingPanel from "../../components/ui/BillingPanel";
import ChipGroup from "../../components/ui/ChipGroup";
import Table, { TableRow, TableCell } from "../../components/ui/Table";
import Meter from "../../components/charts/Meter";
import { token } from "../../components/charts/tokens";
import RecordPaymentModal from "../../components/RecordPaymentModal";
import { CollectionPacePanel, EnrolleesPanel } from "./YearOverYear";
import useYearComparison from "./useYearComparison";
import { HomeHeader, MiniMeter, PartialLoadAlert, QuickActions, TrendsSection } from "./HomeParts";
import ComingUp from "./ComingUp";
import { comingUpRequests } from "./homeRequests";
import useHomeData from "./useHomeData";

import { getDashboardSummary, getTeachersToday } from "../../api/enrollmentApi";
import { ALL_YEARS_PARAM } from "../../hooks/useYearFilter";
import useTheme from "../../hooks/useTheme";
import { pageVariants } from "../../utils/motion";
import { fmtLongDay } from "../../utils/format";
import { bellItems } from "./attention";
import {
  TWO_UP, gradesDue, plural, sectionName, sectionShortName, sectionsByLevel, withYear,
} from "./adminHomeData";

// ── Page ─────────────────────────────────────────────────────────────────────

// The admin home's own requests, beside its attention queues: the year's
// summary, and today's teachers (always the current year's).
const requests = (year, currentYear) => ({
  summary:  getDashboardSummary({ school_year: year }),
  teachers: getTeachersToday({ school_year: currentYear }),
  ...comingUpRequests(),
});

export default function AdminHome() {
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const home = useHomeData("Admin home", requests);
  const { year, yearIsDefault, currentYear, loading, data } = home;
  const [showAmounts, setShowAmounts] = useState(true);
  const [showTeachers, setShowTeachers] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const comparison = useYearComparison(year);

  const teachers = data.teachers;
  const period = teachers?.grading_period;
  // Set only while another year is picked, for the cards that stay on today.
  const todayYear = yearIsDefault ? null : currentYear;

  return (
    <>
      <HomeHeader
        now={now}
        period={period?.source === "calendar" ? period.label : null}
        year={year}
        onYearChange={home.setYear}
        yearIsDefault={yearIsDefault}
        currentYear={currentYear}
        notifications={bellItems(home.rows)}
        notificationsFailed={home.attentionFailed}
      />

      {/* Every child of the scroller keeps its height (shrink-0), so the page
          scrolls rather than squeezing a card -- a card that clips its
          overflow would otherwise collapse to nothing. */}
      <motion.div
        variants={pageVariants.container}
        initial="hidden"
        animate="visible"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6"
      >
        <PartialLoadAlert show={home.partialError} onRetry={home.reload} />

        {/* Above the panels below, which the finder's matches drop over. */}
        <motion.div variants={pageVariants.item} className="relative z-20 shrink-0">
          <QuickActions
            onOpenStudent={(st) => navigate(`/students/${st.student_id}`)}
            // Every year, so a learner who left or graduated is found too.
            onFind={(term) => navigate(
              term
                ? `/students?search=${encodeURIComponent(term)}&school_year=${ALL_YEARS_PARAM}`
                : "/students",
            )}
            actions={[
              { label: "Enroll a student", icon: "ti-user-plus", primary: true, onClick: () => navigate("/enrollments/new") },
              { label: "Record a payment", icon: "ti-cash", onClick: () => setShowPayment(true) },
            ]}
          />
        </motion.div>

        {/* Needs your attention used to sit beside this; it's in the header's
            bell now, and Coming up has its place. */}
        <motion.div variants={pageVariants.item} className={`${TWO_UP} shrink-0`}>
          <TeachersTodayPreview
            teachers={teachers}
            loading={loading}
            now={now}
            onOpen={() => setShowTeachers(true)}
          />
          <ComingUp
            events={data.calendar?.results ?? data.calendar}
            personal={data.personal?.results ?? data.personal}
            loading={loading}
            onGo={navigate}
          />
        </motion.div>

        <motion.section
          variants={pageVariants.item}
          aria-labelledby="glance-heading"
          className="flex shrink-0 flex-col gap-4"
        >
          <h2 id="glance-heading" className="text-sm font-bold text-neutral-900">School at a glance</h2>
          <Glance data={data} loading={loading} year={year} todayYear={todayYear} onGo={navigate} />
          {/* Both follow the page's year picker, so neither gets a year
              filter of its own; two year controls could disagree. Their links
              carry the year for the same reason every other link here does. */}
          <div className={TWO_UP}>
            <EnrolleesPanel cmp={comparison} onGo={navigate} />
            <CollectionPacePanel
              cmp={comparison}
              today={now}
              showAmounts={showAmounts}
              onToggleAmounts={() => setShowAmounts((v) => !v)}
            />
          </div>
          {/* The year's own figures under the pair. It reads the same summary
              as Collection pace, so a failed load shows once, there, with its
              retry -- not also here as a row of ₱0.00. No eye button of its
              own: the one on Collection pace governs both. */}
          {!comparison.money.error && (
            <BillingPanel
              summary={comparison.money.current}
              loading={comparison.money.loading}
              schoolYear={year}
              showAmounts={showAmounts}
              onOpenInvoices={(link) => navigate(withYear(link, year))}
            />
          )}
        </motion.section>

        <motion.div variants={pageVariants.item} className="shrink-0">
          <TrendsSection
            summary={data.summary} loading={loading} year={year} onGo={navigate}
            failed={home.failed.includes("summary")} onRetry={home.reload}
          />
        </motion.div>
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
          onSaved={() => { setShowPayment(false); home.reload(); comparison.reload(); }}
        />
      )}
    </>
  );
}

// ── Teachers today ───────────────────────────────────────────────────────────
//
// A preview on the page; everything else lives in the details window. One
// tile per section shows which sections still owe today's attendance, so the
// admin knows whom to message without opening the window. The long lists, the
// advisers' names and the calendar reminder stay in the window.

const TEACHERS_SUBTITLE = "Attendance and grades, by section";

function noAdviserCount(sections) {
  return sections.filter((s) => !s.advisers?.length).length;
}

// Taken once every learner has a mark (teachers_today.py); a part-marked
// section still owes the rest, and says how far it got.
function attendanceStatus(s) {
  if (s.attendance_taken) return "taken";
  if (s.attendance_marked) return `${s.attendance_marked.toLocaleString()} of ${s.students.toLocaleString()} marked`;
  return "not taken yet";
}

// A due line, labelled when there are two (gradesDue); red once it's late.
function DueText({ due }) {
  return (
    <span className={due.late ? "text-error-500" : "text-neutral-600"}>
      {due.label && `${due.label}: `}{due.text}
    </span>
  );
}

// A section's tile: green once today's attendance is in, amber with an outline
// until then, and marked when the section has no adviser to take it.
function SectionTile({ section }) {
  const taken = section.attendance_taken;
  const noAdviser = !section.advisers?.length;
  return (
    <span
      title={`${sectionName(section)} · attendance ${attendanceStatus(section)}${noAdviser ? " · no adviser" : ""}`}
      className={[
        "inline-flex h-6 min-w-10 items-center justify-center gap-0.5 rounded-[6px] border-[1.5px] px-[5px] text-xs font-semibold",
        taken ? "border-success-50 bg-success-50 text-success-500" : "border-warning-dot bg-warning-50 text-warning-500",
      ].join(" ")}
    >
      {noAdviser && <i className="ti ti-user-off text-[11px]" aria-hidden="true" />}
      {sectionShortName(section)}
    </span>
  );
}

function SectionTiles({ sections, noAdviser }) {
  const taken = sections.filter((s) => s.attendance_taken).length;
  return (
    <>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-neutral-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-success-dot" aria-hidden="true" />
          Attendance taken <strong className="text-neutral-900">{taken.toLocaleString()}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-warning-dot bg-warning-50" aria-hidden="true" />
          Not yet <strong className="text-neutral-900">{(sections.length - taken).toLocaleString()}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="ti ti-user-off text-warning-500" aria-hidden="true" />
          No adviser <strong className="text-neutral-900">{noAdviser.toLocaleString()}</strong>
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {sectionsByLevel(sections).map((group) => (
          <div key={group.level} className="grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2.5">
            <span className="text-xs font-semibold text-neutral-800">{group.label}</span>
            <div className="flex flex-wrap gap-1">
              {group.sections.map((s) => <SectionTile key={sectionName(s) + s.school_level} section={s} />)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function TeachersTodayPreview({ teachers, loading, now, onOpen }) {
  const theme = useTheme();
  if (loading || !teachers || !teachers.sections.length) {
    return (
      <Panel title="Teachers today" subtitle={TEACHERS_SUBTITLE} icon="ti-user-check" className="min-w-0">
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

  const { grades, grading_period: period, no_classes: noClasses, sections } = teachers;
  const dues = gradesDue(period, sections, now);
  const noAdviser = noAdviserCount(sections);

  return (
    <Card padding="none" className="flex min-w-0 flex-col overflow-hidden">
      {/* The whole card is one button: it holds no other controls, so there
          is nothing to nest, and one big target suits the people using it. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label="Teachers today: open details"
        className="focus-ring flex w-full flex-1 flex-col text-left transition-colors hover:bg-brand-50/40"
      >
        <div className="flex w-full items-center gap-2.5 border-b border-neutral-200 px-5 py-3.5">
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
        <div className="flex w-full flex-1 flex-col gap-3 p-5">
          {noClasses ? (
            // No attendance is due, so no tiles: every one would read "not yet".
            <p className="text-xs text-neutral-700">
              <span className="font-semibold text-neutral-900">No classes today</span> · {noClasses.label}
            </p>
          ) : (
            <SectionTiles sections={sections} noAdviser={noAdviser} />
          )}
          <div className="border-t border-neutral-200 pt-3">
            {grades.sections_total > 0 ? (
              <MiniMeter
                label={`${period.label} grades in`}
                value={grades.sections_complete}
                max={grades.sections_total}
                color={token("--color-info-500", theme)}
              />
            ) : (
              <p className="text-xs text-neutral-600">No subjects are set up for these grade levels yet.</p>
            )}
          </div>
          {/* Sections with no adviser are marked on their tiles; without
              tiles, they're said here. */}
          {(dues.length > 0 || (noClasses && noAdviser > 0)) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold">
              {dues.map((d) => <DueText key={d.label ?? "due"} due={d} />)}
              {noClasses && noAdviser > 0 && (
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
  const theme = useTheme();
  const [filter, setFilter] = useState("all");
  const { attendance, grades, grading_period: period, no_classes: noClasses, sections } = teachers;
  const dues = gradesDue(period, sections, now);
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
        fmtLongDay(now),
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
                color={token("--color-success-500", theme)}
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
                color={token("--color-info-500", theme)}
              />
            ) : (
              <p className="text-sm text-neutral-600">No subjects are set up yet.</p>
            )}
            {dues.map((d) => <p key={d.label ?? "due"} className="mt-2 text-xs font-semibold"><DueText due={d} /></p>)}
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
                  <span className="font-semibold text-warning-500">
                    {s.attendance_marked ? `${s.attendance_marked.toLocaleString()} of ${s.students.toLocaleString()} marked` : "Not yet"}
                  </span>
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

// No enrollees tile: the Enrollees panel (YearOverYear.jsx) leads with that
// number, counted the same way for both years it compares.
function Glance({ data, loading, year, todayYear, onGo }) {
  const risk = data.summary?.risk;
  const att = data.teachers?.attendance;
  const noClasses = data.teachers?.no_classes;

  const riskDate = risk?.computed_at
    ? new Date(risk.computed_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
    : null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            // The sections the rate comes from: any marked, part-marked too.
            : att.sections_marked ? `From ${att.sections_marked} of ${plural(att.sections_total, "section")}`
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
        onClick={() => onGo(withYear("/analytics", year))}
      />
    </div>
  );
}
