import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { usePageTitle } from "../hooks/usePageTitle";
import useTheme from "../hooks/useTheme";
import { getGuardianCalendarEvents } from "../api/enrollmentApi";
import Alert from "../components/ui/Alert";
import Button from "../components/ui/Button";
import { Panel } from "../components/ui/Card";
import Skeleton from "../components/ui/Skeleton";
import MonthGrid from "./calendar/MonthGrid";
import { MONTHS, buildEventMap, calendarItems, dateKey, formatDateRange } from "./calendar/calendarDates";
import { DARK_EVENT_BG, DARK_EVENT_TEXT, eventMeta } from "./calendar/eventTypes";

// The school calendar for a guardian: holidays, exams, no-class days and
// school events, read-only. Only the events the registrar left visible to
// guardians come back (GET /guardian/calendar-events/); grading periods and
// staff-only events never do, and staff members' own events live elsewhere.
//
// It goes month by month, asking for that month's days only, so it needs no
// school year list (guardians don't load one: SchoolYearContext). The month
// grid is the Academic Calendar's (calendar/MonthGrid.jsx); under it, the
// month's events as a list, which is what a phone mostly reads.

function monthOf(date) {
  return { year: date.getFullYear(), month: date.getMonth() };
}

export default function GuardianCalendarPage() {
  usePageTitle("School calendar");
  const dark = useTheme() === "dark";
  const [cursor, setCursor] = useState(() => monthOf(new Date()));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const first = dateKey(new Date(cursor.year, cursor.month, 1));
    const last = dateKey(new Date(cursor.year, cursor.month + 1, 0));
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setFailed(false);
    getGuardianCalendarEvents({ end_date__gte: first, start_date__lte: last, page_size: 500 })
      .then((data) => { if (live) setEvents(Array.isArray(data) ? data : (data?.results ?? [])); })
      .catch(() => { if (live) { setEvents([]); setFailed(true); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [cursor, attempt]);

  function go(step) {
    setSelectedDay(null);
    setCursor((c) => monthOf(new Date(c.year, c.month + step, 1)));
  }

  const items = calendarItems(events);
  const eventMap = buildEventMap(items);
  const shown = selectedDay
    ? (eventMap[selectedDay] ?? [])
    : [...items].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const monthLabel = `${MONTHS[cursor.month]} ${cursor.year}`;
  const thisMonth = monthOf(new Date());
  const onThisMonth = cursor.year === thisMonth.year && cursor.month === thisMonth.month;

  let listTitle = `This month · ${monthLabel}`;
  if (selectedDay) {
    const [, m, d] = selectedDay.split("-").map(Number);
    listTitle = `${MONTHS[m - 1]} ${d}`;
  }

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="mb-5 flex items-center gap-3.5">
        <div
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-brand-200 text-brand-600 dark:bg-[linear-gradient(135deg,var(--color-action),var(--color-action-2))] dark:text-white"
          aria-hidden="true"
        >
          <i className="ti ti-calendar-event text-xl" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-neutral-900">School calendar</h1>
          <p className="text-sm text-neutral-500">Holidays, exams, no-class days and school events</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" iconOnly icon="ti-chevron-left" aria-label="Previous month" onClick={() => go(-1)} />
        <h2 className="min-w-[150px] text-center text-base font-bold text-neutral-900" aria-live="polite">{monthLabel}</h2>
        <Button variant="secondary" size="sm" iconOnly icon="ti-chevron-right" aria-label="Next month" onClick={() => go(1)} />
        {!onThisMonth && (
          <Button variant="ghost" size="sm" onClick={() => { setSelectedDay(null); setCursor(thisMonth); }}>
            This month
          </Button>
        )}
      </div>

      {failed && (
        <Alert variant="error" className="mb-4">
          The school calendar couldn&apos;t be loaded.{" "}
          <button type="button" className="font-semibold underline" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        {loading ? <Skeleton height={420} variant="pulse" /> : (
          <MonthGrid
            year={cursor.year}
            monthIndex={cursor.month}
            eventMap={eventMap}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        )}

        <Panel
          title={listTitle}
          icon="ti-list"
          padding="none"
          action={selectedDay && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)}>Whole month</Button>
          )}
        >
          {loading ? (
            <div className="flex flex-col gap-3 p-5">
              <Skeleton height={14} variant="pulse" />
              <Skeleton height={14} variant="pulse" />
            </div>
          ) : shown.length === 0 ? (
            <p className="p-5 text-sm text-neutral-600">
              {failed ? "Nothing to show until the calendar loads." : selectedDay ? "Nothing on the calendar this day." : "Nothing on the calendar this month."}
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200">
              {shown.map((ev) => {
                const meta = eventMeta(ev.event_type);
                // The type's colour is a value (it can be a viewer's own
                // pick), so it's set inline; its label takes token text in dark.
                return (
                  <li key={ev.uid} className="flex gap-3 px-5 py-3">
                    <span className="w-1 shrink-0 rounded-full" style={{ background: meta.color }} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-neutral-900">{ev.title}</span>
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                          style={{ color: dark ? DARK_EVENT_TEXT : meta.color, background: dark ? DARK_EVENT_BG(meta.color) : meta.bg }}
                        >
                          <i className={`ti ${meta.icon}`} aria-hidden="true" />{meta.label}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-600">{formatDateRange(ev.start_date, ev.end_date)}</div>
                      {ev.description && <p className="mt-1 text-xs leading-relaxed text-neutral-600">{ev.description}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </motion.div>
  );
}
