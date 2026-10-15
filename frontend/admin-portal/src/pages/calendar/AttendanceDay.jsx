// AttendanceDay — the Academic Calendar's attendance layer, from
// GET /dashboard/attendance-days/ (hooks/useAttendanceDays). Asked by date,
// with no school year: the calendar files June under the year ending while
// the registry starts the next year on June 1, so the server picks the year
// the dates fall in.
//
//   AttendanceDayNote    a count on each day of the month grid that has marks
//   AttendanceDayPanel   the picked day: present of enrolled, the breakdown,
//                        sections still to take it (a teacher's own, linked)
//
// "Present" counts late learners too, as every attendance figure does.

import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import { mySectionsLink, plural, sectionName } from "../dashboard/adminHomeData";

/** A day's count on the month grid (MonthGrid's `dayNotes`), for a day with any mark. */
export function AttendanceDayNote({ day }) {
  // Amber while a section still owes the day's attendance.
  const complete = day.sections_taken === day.sections_total;
  return (
    <Badge
      size="sm"
      variant={complete ? "success" : "warning"}
      icon="ti-user-check"
      className="tabular-nums"
      title={`${day.attended.toLocaleString()} of ${day.enrolled.toLocaleString()} learners present · ${day.sections_taken} of ${plural(day.sections_total, "section")} taken`}
    >
      {day.attended.toLocaleString()}
      <span className="sr-only"> present</span>
    </Badge>
  );
}

const BREAKDOWN = [
  ["present", "on time", "success"],
  ["late", "late", "warning"],
  ["absent", "absent", "error"],
  ["excused", "excused", "info"],
];

function SectionLine({ s, isTeacher, schoolYear, onGo }) {
  const status = s.taken ? "Taken"
    : s.marked ? `${s.marked.toLocaleString()} of ${s.students.toLocaleString()} marked`
    : "Not taken";
  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <span className="min-w-0 truncate text-xs font-semibold text-neutral-800">{sectionName(s)}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span className={`text-xs font-semibold ${s.taken ? "text-success-500" : "text-warning-500"}`}>{status}</span>
        {isTeacher && s.advisory_id && (
          <Button
            variant="ghost" size="sm" iconOnly icon="ti-arrow-right"
            aria-label={`Open ${sectionName(s)}'s attendance for this day`}
            title="Open in My Sections"
            onClick={() => onGo(mySectionsLink(schoolYear, s.advisory_id, "attendance", { date: s.date }))}
          />
        )}
      </span>
    </li>
  );
}

/** The picked day's attendance, inside the calendar's day panel. */
export function AttendanceDayPanel({ day, date, loading, failed, onRetry, isTeacher, schoolYear, onGo }) {
  let body;
  if (loading) {
    body = <Skeleton height={14} variant="pulse" />;
  } else if (failed || !day) {
    body = (
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-neutral-600">Couldn&apos;t load this day&apos;s attendance.</p>
        <Button variant="secondary" size="sm" icon="ti-refresh" onClick={onRetry}>Try again</Button>
      </div>
    );
  } else if (!day.marked) {
    body = (
      <p className="text-xs text-neutral-600">
        {day.no_classes ? <>No classes · {day.no_classes.label}</>
          : !day.enrolled ? (isTeacher ? "Your sections had no learners on this day." : "No learners were in class on this day.")
          : "No attendance was taken on this day."}
      </p>
    );
  } else {
    // A teacher sees every section of theirs; staff only the ones still owed.
    const lines = isTeacher ? day.sections : day.sections.filter((s) => !s.taken);
    body = (
      <div className="flex flex-col gap-2.5">
        <div>
          <p className="text-md font-bold tabular-nums text-neutral-900">
            {day.attended.toLocaleString()} of {plural(day.enrolled, "learner")} present
            {day.rate != null && <span className="ml-1.5 text-sm font-semibold text-neutral-500">{Math.round(day.rate * 100)}%</span>}
          </p>
          <p className="text-xs text-neutral-500">Late learners count as present.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BREAKDOWN.map(([key, label, tone]) => (
            <Badge key={key} size="sm" variant={tone}>{day[key].toLocaleString()} {label}</Badge>
          ))}
          {day.unmarked > 0 && <Badge size="sm" variant="muted">{day.unmarked.toLocaleString()} not marked</Badge>}
        </div>
        <p className="text-xs font-semibold text-neutral-700">
          {day.sections_taken} of {plural(day.sections_total, "section")} taken
        </p>
        {lines.length > 0 && (
          <ul className="max-h-40 divide-y divide-neutral-200 overflow-y-auto" aria-label={isTeacher ? "Your sections" : "Sections still to take it"}>
            {lines.map((s) => (
              <SectionLine
                key={s.advisory_id ?? sectionName(s)} s={{ ...s, date }}
                isTeacher={isTeacher} schoolYear={schoolYear} onGo={onGo}
              />
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <section aria-label="Attendance" className="border-b border-neutral-200 px-4 py-3">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">
        {isTeacher ? "Your sections' attendance" : "Attendance"}
      </h3>
      {body}
    </section>
  );
}
