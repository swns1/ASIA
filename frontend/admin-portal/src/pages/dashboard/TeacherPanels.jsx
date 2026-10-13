// TeacherPanels — the teacher's home's own cards, from the my-day answer
// (GET /dashboard/my-day/, one entry per section the teacher advises):
// today's attendance per section, this period's grades per subject, and
// what's coming up on the Academic Calendar. Links open My Sections on the
// section and tab (TeacherSectionsPage reads ?section=&tab=&period=&subject=).

import { Panel } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import Badge from "../../components/ui/Badge";
import { token } from "../../components/charts/tokens";
import useTheme from "../../hooks/useTheme";
import { CHIP_GLOW } from "../../constants/statusTones";
import { fmtDate } from "../../utils/format";
import { MiniMeter } from "./HomeParts";
import { COMING_UP_DAYS, comingUpWindow, dueLine, mySectionsLink, plural, sectionName } from "./adminHomeData";


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

/** One section's attendance today: saved marks only. */
export function TodayCard({ section, noClasses, year, onGo }) {
  const a = section.attendance;
  const done = a.taken && a.unmarked === 0;
  return (
    <Panel
      title={sectionName(section)}
      subtitle={`${section.level_label} · ${plural(section.students, "learner")}`}
      icon="ti-calendar-check"
      className="min-w-0"
      action={!noClasses && section.students > 0 && (
        <Button
          size="sm"
          variant={done ? "secondary" : "primary"}
          icon={done ? "ti-eye" : "ti-calendar-check"}
          onClick={() => onGo(mySectionsLink(year, section.advisory_id, "attendance"))}
        >
          {done ? "Review" : a.taken ? "Finish attendance" : "Take attendance"}
        </Button>
      )}
    >
      {noClasses ? (
        <p className="text-sm text-neutral-700">
          <span className="font-semibold text-neutral-900">No classes today</span> · {noClasses.label}
        </p>
      ) : section.students === 0 ? (
        <p className="text-sm text-neutral-600">No learners are enrolled in this section yet.</p>
      ) : !a.taken ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-warning-500">
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          Not taken yet today
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
              {a.unmarked.toLocaleString()} of {plural(section.students, "learner")} not marked yet
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

// ── Coming up ────────────────────────────────────────────────────────────────

const NO_CLASS_TYPES = new Set(["holiday", "school_day_off", "quarter_break"]);
const TYPE_BADGES = {
  exam: ["Exam", "info"],
  enrollment: ["Enrollment", "accent"],
  event: ["Event", "muted"],
  other: ["Event", "muted"],
};
const SHOWN = 6;

/**
 * The calendar's next few weeks (no-class days marked), with this period's
 * grade due date among them. `events`: the calendar events overlapping
 * comingUpWindow(), whatever school year they're filed under.
 */
export function ComingUp({ events, loading, dueDate, periodLabel, onGo }) {
  const { from: today, to: horizon } = comingUpWindow();

  const items = (events ?? [])
    .filter((e) => e.event_type !== "grading_period" && e.end_date >= today && e.start_date <= horizon)
    .map((e) => ({ key: `e${e.event_id ?? e.title}${e.start_date}`, date: e.start_date < today ? today : e.start_date, end: e.end_date, title: e.title, type: e.event_type }));
  if (dueDate && dueDate >= today && dueDate <= horizon) {
    items.push({ key: "due", date: dueDate, end: dueDate, title: `${periodLabel} grades due`, type: "due" });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Panel
      title="Coming up"
      subtitle={`The next ${COMING_UP_DAYS} days`}
      icon="ti-calendar-event"
      className="min-w-0"
      padding="none"
      action={
        <Button variant="ghost" size="sm" iconRight icon="ti-arrow-right" onClick={() => onGo("/academic-calendar")}>
          Calendar
        </Button>
      }
    >
      {loading ? <div className="p-5"><LoadingRows /></div> : items.length === 0 ? (
        <p className="p-5 text-sm text-neutral-600">Nothing on the calendar in the next {COMING_UP_DAYS} days.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {items.slice(0, SHOWN).map((it) => {
            const [label, tone] = it.type === "due" ? ["Grades due", "warning"]
              : NO_CLASS_TYPES.has(it.type) ? ["No classes", "error"]
                : TYPE_BADGES[it.type] ?? TYPE_BADGES.other;
            return (
              <li key={it.key} className="flex items-center gap-3 px-5 py-3">
                <span className={`flex h-9 w-12 shrink-0 flex-col items-center justify-center rounded-md bg-brand-100 text-brand-600 ${CHIP_GLOW.brand}`}>
                  <span className="text-xs font-bold leading-none">{fmtDate(it.date).split(",")[0]}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-neutral-900">{it.title}</span>
                  {it.end !== it.date && <span className="block text-xs text-neutral-500">Until {fmtDate(it.end)}</span>}
                </span>
                <Badge variant={tone}>{label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
