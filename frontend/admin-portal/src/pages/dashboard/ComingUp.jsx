// ComingUp — the next few weeks on every staff home: the school calendar
// (no-class days marked) and the person's own events, which only they see.
// Its requests are homeRequests.comingUpRequests(); the teacher's home also
// puts this period's grade due date among them.

import { Panel } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import Badge from "../../components/ui/Badge";
import { CHIP_GLOW } from "../../constants/statusTones";
import { fmtDate } from "../../utils/format";
import { COMING_UP_DAYS, comingUpWindow } from "./adminHomeData";

const NO_CLASS_TYPES = new Set(["holiday", "school_day_off", "quarter_break"]);
const TYPE_BADGES = {
  exam: ["Exam", "info"],
  enrollment: ["Enrollment", "accent"],
  event: ["Event", "muted"],
  other: ["Event", "muted"],
};
const SHOWN = 6;

function badgeFor(type) {
  if (type === "due") return ["Grades due", "warning"];
  if (type === "mine") return ["Yours", "brand"];
  if (NO_CLASS_TYPES.has(type)) return ["No classes", "error"];
  return TYPE_BADGES[type] ?? TYPE_BADGES.other;
}

/**
 * `events`: the school calendar events overlapping comingUpWindow(),
 * whatever school year they're filed under. `personal`: the viewer's own,
 * over the same days. `dueDate` / `periodLabel`: the teacher's grade
 * deadline, when there is one.
 */
export default function ComingUp({ events, personal, loading, dueDate = null, periodLabel = "", onGo }) {
  const { from: today, to: horizon } = comingUpWindow();
  const inWindow = (e) => e.end_date >= today && e.start_date <= horizon;
  const item = (e, key, type) => ({
    key, date: e.start_date < today ? today : e.start_date, end: e.end_date, title: e.title, type,
  });

  const items = [
    ...(events ?? [])
      .filter((e) => e.event_type !== "grading_period" && inWindow(e))
      .map((e) => item(e, `school-${e.event_id ?? e.title}${e.start_date}`, e.event_type)),
    ...(personal ?? []).filter(inWindow).map((e) => item(e, `mine-${e.event_id}`, "mine")),
  ];
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
      {loading ? (
        <div className="flex flex-col gap-3 p-5">
          <Skeleton height={14} variant="pulse" />
          <Skeleton height={14} variant="pulse" />
        </div>
      ) : items.length === 0 ? (
        <p className="p-5 text-sm text-neutral-600">Nothing on the calendar in the next {COMING_UP_DAYS} days.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {items.slice(0, SHOWN).map((it) => {
            const [label, tone] = badgeFor(it.type);
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
