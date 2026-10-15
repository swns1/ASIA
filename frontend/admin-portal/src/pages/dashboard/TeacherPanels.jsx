// TeacherPanels — the teacher's home's own cards, from the my-day answer
// (GET /dashboard/my-day/, one entry per section the teacher advises):
// today's attendance per section and this period's grades per subject.
// Coming up, the calendar, is every home's (./ComingUp.jsx). Links open My
// Sections on the section and tab (TeacherSectionsPage reads
// ?section=&tab=&period=&subject=).

import { Panel } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import Badge from "../../components/ui/Badge";
import { token } from "../../components/charts/tokens";
import useTheme from "../../hooks/useTheme";
import { MiniMeter } from "./HomeParts";
import { dueLine, mySectionsLink, plural, sectionName } from "./adminHomeData";


function LoadingRows() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton height={14} variant="pulse" />
      <Skeleton height={14} variant="pulse" />
    </div>
  );
}

// ── Today's attendance ───────────────────────────────────────────────────────

const MARKS = [
  ["present", "present", "success"],
  ["late", "late", "warning"],
  ["absent", "absent", "error"],
  ["excused", "excused", "info"],
];

/**
 * One section's attendance on a day, saved marks only: today from the my-day
 * answer, an earlier day (`date`) from GET /dashboard/attendance-days/. Both
 * carry marked/unmarked and the four counts; it reads only those, since
 * "taken" means any mark in one and every mark in the other.
 */
export function TodayCard({ section, noClasses, year, date = null, onGo }) {
  const a = section.attendance;
  const started = a.marked > 0;
  const done = started && a.unmarked === 0;
  const dayWord = date ? "" : " today";
  return (
    <Panel
      title={sectionName(section)}
      subtitle={`${section.level_label} · ${plural(section.students, "learner")}`}
      icon="ti-calendar-check"
      className="min-w-0"
      action={!noClasses && section.students > 0 && section.advisory_id && (
        <Button
          size="sm"
          variant={done ? "secondary" : "primary"}
          icon={done ? "ti-eye" : "ti-calendar-check"}
          onClick={() => onGo(mySectionsLink(year, section.advisory_id, "attendance", { date }))}
        >
          {done ? "Review" : started ? "Finish attendance" : "Take attendance"}
        </Button>
      )}
    >
      {noClasses ? (
        <p className="text-sm text-neutral-700">
          <span className="font-semibold text-neutral-900">No classes{dayWord}</span> · {noClasses.label}
        </p>
      ) : section.students === 0 ? (
        <p className="text-sm text-neutral-600">No learners are enrolled in this section yet.</p>
      ) : !started ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-warning-500">
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          {date ? "Attendance wasn't taken" : "Not taken yet today"}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {MARKS.map(([key, label, tone]) => (
              <Badge key={key} variant={tone}>{a[key].toLocaleString()} {label}</Badge>
            ))}
          </div>
          {a.unmarked > 0 && (
            <p className="text-xs font-semibold text-warning-500">
              {a.unmarked.toLocaleString()} of {plural(section.students, "learner")} not marked{date ? "" : " yet"}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

// ── Grades to finish ─────────────────────────────────────────────────────────

/** This period's grades, a bar per subject, for each section. */
export function GradesToFinish({ sections, loading, failed = false, year, onGo }) {
  const theme = useTheme();
  const graded = (sections ?? []).filter((s) => s.grades);
  const first = graded[0]?.grades;
  const due = first?.due_date ? dueLine(first.due_date, new Date()) : null;
  return (
    <Panel
      title="Grades to finish"
      subtitle={first ? [first.label, due?.text].filter(Boolean).join(" · ") : "This grading period"}
      icon="ti-chart-bar"
      className="min-w-0"
    >
      {loading ? <LoadingRows /> : failed ? (
        // The sections didn't load: not the same as none having subjects.
        <p className="text-sm text-neutral-600">Couldn't load your sections' grades.</p>
      ) : graded.length === 0 ? (
        <p className="text-sm text-neutral-600">No subjects are set up for your sections' grade levels yet.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {graded.map((s) => {
            const next = s.grades.subjects.find((x) => !x.complete);
            return (
              <div key={s.advisory_id} className="flex flex-col gap-2">
                {/* A teacher with one section needn't be told its name again. */}
                {graded.length > 1 && <h3 className="text-xs font-bold text-neutral-900">{sectionName(s)}</h3>}
                {s.students === 0 ? (
                  // An earlier year's roster is empty once its learners move
                  // on, and 0 of 0 would otherwise read as "all in".
                  <p className="text-sm text-neutral-600">No learners are on this section&apos;s roster.</p>
                ) : s.grades.complete ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-success-500">
                    <i className="ti ti-circle-check" aria-hidden="true" />
                    {s.grades.label} grades are all in
                  </p>
                ) : (
                  s.grades.subjects.map((sub) => (
                    <MiniMeter
                      key={sub.subject_id}
                      label={sub.subject_name ?? sub.subject_code}
                      value={sub.done}
                      max={sub.expected}
                      unit="learner"
                      color={token(sub.complete ? "--color-success-500" : "--color-info-500", theme)}
                    />
                  ))
                )}
                {next && (
                  <div>
                    <Button
                      variant="secondary" size="sm" icon="ti-pencil"
                      onClick={() => onGo(mySectionsLink(year, s.advisory_id, "grades", { period: s.grades.period, subject: next.subject_id }))}
                    >
                      Enter {next.subject_name ?? "grades"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
