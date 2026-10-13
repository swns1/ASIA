// HomeParts — the pieces every role's home page is built from, so the homes
// read and behave alike: the same header (greeting, school year, bell), the
// same "Start a task" lead panel, the same "Needs your attention" rows, the
// same partial-load warning and the same recent-enrollments table.
//
// AdminHome, RegistrarHome and AccountingHome use them; the shared staff
// dashboard uses the recent-enrollments table. Their requests are in
// ./homeRequests.js. A difference between two homes should be a
// difference in what they show, never in how a shared piece is drawn.

import { useId } from "react";
import { AnimatePresence } from "framer-motion";

import PageHeader from "../../components/ui/PageHeader";
import SchoolYearPicker from "../../components/ui/SchoolYearPicker";
import NotificationBell from "../../components/ui/NotificationBell";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import Card, { Panel, StatCard } from "../../components/ui/Card";
import Table, { TableRow, TableCell } from "../../components/ui/Table";
import { StatusBadge } from "../../components/ui/Badge";
import { GLASS_BUTTON, GLASS_SEARCH } from "../../components/ui/brandPanel";
import { CHIP_GLOW } from "../../constants/statusTones";
import { ENROLLMENT_STATUS_MAP } from "../../constants/statusMaps";
import { LEVEL_ICONS, LEVEL_SHORT_LABELS } from "../../constants/schoolLevels";
import { getCurrentUser } from "../../utils/auth";
import StudentFinder from "./StudentFinder";
import { AttendanceTargetBand, PipelineBand, RiskByLevelBand } from "./DashboardBands";
import { TWO_UP, greeting, plural, withYear } from "./adminHomeData";
import { ALL_YEARS_PARAM } from "../../hooks/useYearFilter";
import useTheme from "../../hooks/useTheme";
import { chartInk } from "../../components/charts/tokens";

// ── Header ───────────────────────────────────────────────────────────────────

/**
 * The home page's header: "Good morning, <first name>", today's date with the
 * quarter (when the calendar has its dates) and the picked school year, then
 * the year picker, a rule, and the bell.
 *
 * `period`: the current quarter's label, or null. `notifications`: bell items
 * (attention.js); empty while loading, so the red dot doesn't flash on a
 * count that hasn't arrived.
 */
export function HomeHeader({
  now, period = null, year, onYearChange, yearIsDefault, currentYear,
  notifications, notificationsFailed = false,
}) {
  const firstName = String(getCurrentUser()?.name ?? "").trim().split(/\s+/)[0];
  const subtitle = [
    now.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    period,
    year ? `S.Y. ${year}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <PageHeader
      title={firstName ? `${greeting(now)}, ${firstName}` : greeting(now)}
      icon="ti-layout-dashboard"
      subtitle={subtitle}
      actions={
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {!yearIsDefault && (
              <Button variant="ghost" size="sm" icon="ti-arrow-back-up" onClick={() => onYearChange(null)}>
                Back to {currentYear}
              </Button>
            )}
            <SchoolYearPicker
              value={year}
              onChange={onYearChange}
              // No "All years": a home page that adds up several years is hard to read.
              includeAllYears={false}
              // Red only while it narrows to a year other than the current one.
              active={!yearIsDefault}
              // The pill is near the page's right edge; open the panel leftward.
              align="end"
            />
          </div>
          <div className="h-8 w-px bg-neutral-200" aria-hidden="true" />
          <NotificationBell items={notifications} failed={notificationsFailed} />
        </div>
      }
    />
  );
}

/** Said once, with a retry: one failed request shouldn't blank the page, and
 *  a missing number must not read as a zero. */
export function PartialLoadAlert({ show, onRetry }) {
  return (
    <AnimatePresence>
      {show && (
        <Alert variant="warning" title="Some of this page didn't load" className="shrink-0">
          A few numbers may be missing.{" "}
          <button type="button" onClick={onRetry} className="focus-ring rounded-sm font-semibold underline">
            Try again
          </button>
        </Alert>
      )}
    </AnimatePresence>
  );
}

// ── Start a task ─────────────────────────────────────────────────────────────

/**
 * The page's lead block: find a student, then the role's own tasks as
 * buttons. In dark mode it is the login's brand panel, as the status band is
 * on the list pages, with its search and secondary buttons in glass.
 *
 * `actions`: [{ label, icon, onClick, primary? }], the first task primary.
 */
export function QuickActions({ onOpenStudent, onFind, actions }) {
  return (
    <Card brandPanel className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <StudentFinder onOpen={onOpenStudent} onSeeAll={onFind} fieldClassName={GLASS_SEARCH} />
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.label}
            variant={a.primary ? "primary" : "secondary"}
            icon={a.icon}
            onClick={a.onClick}
            className={a.primary ? "" : GLASS_BUTTON}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}

// ── Needs your attention ─────────────────────────────────────────────────────

const ROW_TONES = {
  warning: `bg-warning-50 text-warning-500 ${CHIP_GLOW.warning}`,
  info:    `bg-info-50 text-info-500 ${CHIP_GLOW.info}`,
  error:   `bg-error-50 text-error-500 ${CHIP_GLOW.error}`,
};

/**
 * One row per queue with something in it (attention.js's rows), each with
 * one button. The same rows the bell lists.
 */
export function AttentionPanel({ rows, loading, failed = false, onGo, className = "" }) {
  const subtitle = loading
    ? "Checking…"
    : rows.length
      ? `${plural(rows.length, "thing is", "things are")} waiting on you`
      : "Nothing is waiting on you";

  return (
    <Panel
      title="Needs your attention"
      subtitle={subtitle}
      icon="ti-bell"
      padding="none"
      className={`min-w-0 ${className}`}
      bodyClassName="flex flex-col"
    >
      {loading ? (
        <div className="flex flex-col gap-3 p-5">
          {[0, 1, 2].map((i) => <Skeleton key={i} height={40} variant="pulse" />)}
        </div>
      ) : (
        <ul className="flex flex-1 flex-col divide-y divide-neutral-200">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-1 items-center gap-3 px-5 py-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${ROW_TONES[r.tone]}`}>
                <i className={`ti ${r.icon} text-lg`} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-neutral-900">{r.text}</span>
                {r.hint && <span className="mt-0.5 block text-xs text-neutral-600">{r.hint}</span>}
              </span>
              {/* One width for "View", "Review", "Place" and "Assign", so the
                  buttons line up. */}
              <Button
                variant="secondary"
                size="sm"
                className="min-w-[72px]"
                onClick={() => onGo(r.to)}
                aria-label={`${r.action}: ${r.text}`}
              >
                {r.action}
              </Button>
            </li>
          ))}
          {failed && (
            <li className="flex items-center gap-3 px-5 py-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${ROW_TONES.warning}`}>
                <i className="ti ti-alert-triangle text-lg" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-neutral-900">
                Some of these couldn&apos;t be checked
              </span>
            </li>
          )}
          {rows.length === 0 && !failed && (
            <li className="flex items-center gap-3 p-5 text-sm text-neutral-600">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-success-50 text-success-500 ${CHIP_GLOW.success}`}>
                <i className="ti ti-circle-check text-lg" aria-hidden="true" />
              </span>
              All caught up. Anything waiting on you will show up here.
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

// ── Recent enrollments ───────────────────────────────────────────────────────

const RECENT_ENROLLMENT_COLUMNS = [
  { key: "student", label: "Student" },
  { key: "level",   label: "Level / Grade" },
  { key: "section", label: "Section" },
  { key: "status",  label: "Status" },
];

/** The year's latest enrollments, newest first; a row opens the enrollment. */
export function RecentEnrollmentsPanel({ rows, loading, schoolYear, onGo, className = "", bodyClassName = "" }) {
  return (
    <Panel
      title="Recent enrollments"
      padding="none"
      className={className}
      bodyClassName={bodyClassName}
      action={
        <Button variant="ghost" size="sm" iconRight icon="ti-arrow-right" onClick={() => onGo(`/enrollments?school_year=${encodeURIComponent(schoolYear ?? "")}`)}>
          View all
        </Button>
      }
    >
      <Table
        columns={RECENT_ENROLLMENT_COLUMNS}
        loading={loading}
        skeletonRows={5}
        stickyHeader={false}
        isEmpty={rows.length === 0}
        empty={{
          icon: "ti-clipboard-off",
          title: "No enrollments yet",
          subtitle: `Nothing recorded for S.Y. ${schoolYear}.`,
          withAvatar: false,
        }}
      >
        {rows.map((en) => (
          <TableRow key={en.enrollment_id} onClick={() => onGo(`/enrollments/${en.enrollment_id}`)}>
            <TableCell className="font-semibold text-neutral-900">
              {en.student_name ?? `Student #${en.student}`}
            </TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-1.5">
                <i
                  className={`ti ${LEVEL_ICONS[en.school_level] ?? "ti-school"} text-[13px] text-neutral-600`}
                  aria-hidden="true"
                />
                {LEVEL_SHORT_LABELS[en.school_level] ?? en.school_level} · {en.grade_level}
              </span>
            </TableCell>
            <TableCell>{en.section}</TableCell>
            <TableCell>
              <StatusBadge status={en.enrollment_status} map={ENROLLMENT_STATUS_MAP} />
            </TableCell>
          </TableRow>
        ))}
      </Table>
    </Panel>
  );
}

// ── At a glance: enrollment ──────────────────────────────────────────────────

// A paginated count, or the length of an unpaginated list.
const countOf = (page) => (page == null ? null
  : Array.isArray(page) ? page.length : page.count ?? (page.results ?? []).length);
const shown = (n) => (n == null ? "—" : n.toLocaleString());

/**
 * The four enrollment tiles, on the page's year (homeRequests.js's
 * enrollmentGlanceRequests). `pending`: the pending queue's answer
 * ({ count, owing }) where the home counts it; otherwise the tile reads its
 * own count. A tile whose count didn't load reads "—", never 0.
 * `canOpenScholarships`: the Scholarships page is academic staff's.
 */
export function EnrollmentTiles({ data, loading, year, pending, onGo, canOpenScholarships = true }) {
  const id = useId();
  const sy = encodeURIComponent(year ?? "");
  const pendingCount = pending ? pending.count : countOf(data.pendingCount);
  return (
    <section aria-labelledby={id} className="flex shrink-0 flex-col gap-4">
      <h2 id={id} className="text-sm font-bold text-neutral-900">At a glance</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total students" icon="ti-users" iconTone="brand" loading={loading}
          value={shown(countOf(data.students))}
          hint={data.active ? `${countOf(data.active).toLocaleString()} active` : undefined}
          // All years: this tile counts every student, not this year's.
          onClick={() => onGo(`/students?school_year=${ALL_YEARS_PARAM}`)}
        />
        <StatCard
          label="Enrolled" icon="ti-calendar-event" iconTone="success" loading={loading}
          value={shown(countOf(data.enrolled))}
          hint={`S.Y. ${year}`}
          onClick={() => onGo(`/enrollments?enrollment_status=enrolled&school_year=${sy}`)}
        />
        <StatCard
          label="Pending enrollment" icon="ti-clipboard-list" iconTone="warning" loading={loading}
          value={shown(pendingCount)}
          hint={pending?.owing ? `${pending.owing.toLocaleString()} still owe documents` : `S.Y. ${year}`}
          onClick={() => onGo(`/enrollments?enrollment_status=pending&school_year=${sy}`)}
        />
        <StatCard
          label="Scholarships awarded" icon="ti-award" iconTone="accent" loading={loading}
          value={shown(countOf(data.scholarships))}
          hint={`S.Y. ${year}`}
          onClick={canOpenScholarships ? () => onGo(`/scholarships?school_year=${sy}`) : undefined}
        />
      </div>
    </section>
  );
}

// ── Trends ───────────────────────────────────────────────────────────────────

/**
 * Learners to follow up by school level beside weekly attendance against
 * target, then the enrollment pipeline across the page.
 *
 * `onGo` (navigate): only for roles that can open Analytics. The link is
 * built here, on the page's year, so no home can drop it (each home used to
 * pass its own, and two opened Analytics on the default year).
 * `failed`: the summary didn't load. Every band reads it, so one error with
 * a retry stands in for all three -- they would each say "nothing recorded",
 * which isn't true.
 */
export function TrendsSection({ summary, loading, failed = false, onRetry, year, onGo }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex shrink-0 flex-col gap-4">
      <h2 id={id} className="text-sm font-bold text-neutral-900">Trends</h2>
      {failed && !loading ? (
        <Card>
          <ErrorState subject="the trends" onRetry={onRetry} />
        </Card>
      ) : (
        <>
          <div className={TWO_UP}>
            <RiskByLevelBand
              risk={summary?.risk}
              loading={loading}
              onOpen={onGo && (
                <Button
                  variant="ghost" size="sm" iconRight icon="ti-arrow-right"
                  onClick={() => onGo(withYear("/analytics", year))}
                >
                  Analytics
                </Button>
              )}
            />
            <AttendanceTargetBand series={summary?.attendance_series} loading={loading} />
          </div>
          {/* Full width, so drawn at its real size rather than scaled up. */}
          <PipelineBand pipeline={summary?.pipeline} loading={loading} schoolYear={year} measured />
        </>
      )}
    </section>
  );
}

// ── Progress ─────────────────────────────────────────────────────────────────

/**
 * One compact progress row: label, bar, "N of M <unit>". The admin's
 * Teachers today counts sections; the teacher's Grades to finish, learners.
 */
export function MiniMeter({ label, value, max, color, unit = "section" }) {
  const theme = useTheme();
  const pct = max > 0 ? Math.round((Math.min(value, max) / max) * 100) : 0;
  // Dark: the fill fades in from the left and glows faintly.
  const fillStyle = theme === "dark"
    ? { background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})`, boxShadow: `0 0 8px color-mix(in srgb, ${color} 45%, transparent)` }
    : { background: color };
  const text = `${value.toLocaleString()} of ${plural(max, unit)}`;
  return (
    <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs">
      <span className="truncate font-semibold text-neutral-700" title={label}>{label}</span>
      <span
        className="block h-2 overflow-hidden rounded-full"
        style={{ background: chartInk(theme).grid }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${text}`}
      >
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, ...fillStyle }} />
      </span>
      <span className="tabular-nums text-neutral-600">
        <strong className="text-neutral-900">{value.toLocaleString()}</strong> of {plural(max, unit)}
      </span>
    </div>
  );
}
