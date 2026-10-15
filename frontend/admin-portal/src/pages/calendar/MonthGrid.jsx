// MonthGrid — one month of the calendar, week by week, each event a strip
// across its days. Shared by the Academic Calendar and the guardian's School
// calendar. Events need a `uid` (calendarDates.calendarItems).

import useTheme from "../../hooks/useTheme";
import { CARD_DARK } from "../../components/ui/darkSurfaces";
import { DAYS_SHORT, dateKey, getDayEvents } from "./calendarDates";
import { DARK_EVENT_BG, DARK_EVENT_TEXT, eventMeta } from "./eventTypes";

// A day with events tints on hover, and its number turns red in a circle, a
// preview of the selected day (a weekend's grey number would be 4.1:1 on the
// circle; brand-600 is 4.65:1, 6.7:1 dark). !important because the cell and
// the number set their colours inline. The selected day (already tinted) and
// today's red circle don't take the classes, so the hover leaves them alone.
const HOVER_CSS = `
  .cal-day:hover { background: #fff4f4 !important; }
  [data-theme="dark"] .cal-day:hover { background: var(--color-brand-50) !important; }
  .cal-day:hover .cal-day-num { background: var(--color-brand-200) !important; color: var(--color-brand-600) !important; }
`;

// ── Month Calendar Grid ───────────────────────────────────────────────────────
//
// Renders week-by-week so multi-day event strips stay in the same slot (row)
// across all cells in a week — e.g. "Exam" on Wed–Sat stays on row 2 for every
// cell in that week even if Wed has two events above it.

const MAX_SLOTS = 3; // strips visible before "+N more"

function assignWeekSlots(weekDays, year, monthIndex, daysInMonth, eventMap) {
  // weekDays: array of day numbers or null (for empty cells)
  // Returns: Map<uid, slot> for this week
  const slotMap  = {}; // uid → slot index
  const occupied = []; // occupied[slot] = uid currently filling it

  for (const day of weekDays) {
    if (!day) continue;
    const pairs = getDayEvents(eventMap, year, monthIndex, day);
    for (const { ev } of pairs) {
      if (slotMap[ev.uid] !== undefined) continue; // already assigned
      // Find the lowest free slot
      let slot = 0;
      while (occupied[slot] !== undefined) slot++;
      occupied[slot] = ev.uid;
      slotMap[ev.uid] = slot;
    }
    // Free slots whose event ends on this day
    const isLastOfMonth = day === daysInMonth;
    for (const { ev, k: evKey } of pairs) {
      const isEnd = ev.end_date === evKey || isLastOfMonth;
      if (isEnd) {
        const slot = slotMap[ev.uid];
        if (slot !== undefined && occupied[slot] === ev.uid) {
          delete occupied[slot];
        }
      }
    }
  }
  return slotMap;
}

export default function MonthGrid({ year, monthIndex, eventMap, selectedDay, onSelectDay, dayNotes = {} }) {
  const firstDay    = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const todayKey    = dateKey(new Date());
  const dark        = useTheme() === "dark";

  // Build week rows: each is an array of 7 day-numbers-or-null
  const weeks = [];
  let week = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return (
    <div className={`border border-[#f0e6e6] bg-surface shadow-[0_4px_24px_rgba(224,49,49,0.07)] dark:border-neutral-200 ${CARD_DARK}`} style={{ borderRadius: 18, overflow: "hidden" }}>
      <style>{HOVER_CSS}</style>
      {/* Day-of-week header */}
      <div className="bg-[linear-gradient(135deg,#fff5f5,#fff)] dark:bg-[linear-gradient(135deg,var(--color-brand-50),var(--color-surface))]" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid var(--color-neutral-200)" }}>
        {DAYS_SHORT.map((d, i) => (
          <div key={d} style={{ padding: "10px 0", textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: i === 0 || i === 6 ? "var(--color-brand-700)" : "var(--color-neutral-500)", textTransform: "uppercase" }}>{d}</div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((weekDays, wi) => {
        // Assign stable slots for every event visible this week
        const slotMap = assignWeekSlots(weekDays, year, monthIndex, daysInMonth, eventMap);

        // How many slots are actually used this week (caps at MAX_SLOTS)
        const usedSlots = Math.min(MAX_SLOTS, Object.values(slotMap).length > 0 ? Math.max(...Object.values(slotMap)) + 1 : 0);

        return (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
            {weekDays.map((day, ci) => {
              const isWeekend = ci === 0 || ci === 6;
              if (!day) return (
                <div key={`empty-${wi}-${ci}`} style={{
                  minHeight: 88,
                  background: isWeekend ? (dark ? "var(--color-neutral-100)" : "#fdfafa") : "transparent",
                  borderRight: dark ? "1px solid var(--color-neutral-200)" : "1px solid #faf0f0", borderBottom: dark ? "1px solid var(--color-neutral-200)" : "1px solid #faf0f0",
                }} />
              );

              const k            = `${year}-${String(monthIndex + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const pairs        = getDayEvents(eventMap, year, monthIndex, day);
              const isSelected   = selectedDay === k;
              const isToday      = k === todayKey;
              const isFirstOfMonth = day === 1;
              const isLastOfMonth  = day === daysInMonth;
              const note         = dayNotes[k];
              const hasAny       = pairs.length > 0 || Boolean(note);

              // Count events beyond MAX_SLOTS for this day
              const overflowIds  = new Set(
                pairs.filter(({ ev }) => (slotMap[ev.uid] ?? MAX_SLOTS) >= MAX_SLOTS).map(({ ev }) => ev.uid)
              );
              const overflow = overflowIds.size;

              // Build slot→pair lookup for this day
              const slotPairs = {};
              for (const pair of pairs) {
                const slot = slotMap[pair.ev.uid];
                if (slot !== undefined && slot < MAX_SLOTS) slotPairs[slot] = pair;
              }

              return (
                <div
                  key={k}
                  className={hasAny && !isSelected ? "cal-day" : ""}
                  onClick={() => onSelectDay(isSelected ? null : k)}
                  style={{
                    minHeight: 88,
                    padding: "6px 0 4px",
                    transition: "background-color 0.15s ease",
                    borderRight: dark ? "1px solid var(--color-neutral-200)" : "1px solid #faf0f0",
                    borderBottom: dark ? "1px solid var(--color-neutral-200)" : "1px solid #faf0f0",
                    background: isSelected ? "var(--color-brand-100)" : isToday ? "var(--color-neutral-100)" : isWeekend ? (dark ? "var(--color-neutral-100)" : "#fdfafa") : "var(--color-surface)",
                    cursor: hasAny ? "pointer" : "default",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/* Day number */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, padding: "0 6px" }}>
                    <span className={isToday ? undefined : "cal-day-num"} style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 24, height: 24, borderRadius: "50%",
                      fontSize: 12, fontWeight: isToday || isSelected ? 700 : 400,
                      background: isToday ? "var(--color-action)" : isSelected ? "var(--color-brand-100)" : "transparent",
                      color: isToday ? "white" : isSelected ? "var(--color-brand-600)" : isWeekend ? "var(--color-neutral-500)" : dark ? "var(--color-neutral-900)" : "#2a1a1a",
                      transition: "background-color 0.15s ease, color 0.15s ease",
                    }}>
                      {day}
                    </span>
                    {note}
                  </div>

                  {/* Event strips — rendered slot by slot so alignment is stable.
                      All strips (and placeholders) share a fixed height so
                      continuation strips on adjacent days are pixel-aligned. */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {Array.from({ length: usedSlots }, (_, slot) => {
                      const pair = slotPairs[slot];
                      if (!pair) {
                        return <div key={slot} style={{ height: 18, flexShrink: 0 }} />;
                      }
                      const { ev, k: evKey } = pair;
                      const meta     = eventMeta(ev.event_type);
                      const isSingle = ev.start_date === ev.end_date;
                      const isStart  = ev.start_date === evKey;
                      const isEnd    = ev.end_date   === evKey;
                      const isContinuationStart = !isStart && isFirstOfMonth;
                      const isContinuationEnd   = !isEnd   && isLastOfMonth;
                      const showTitle = isStart || isSingle || isContinuationStart;

                      const borderRadius = isSingle
                        ? 4
                        : (isStart || isContinuationStart) && (isEnd || isContinuationEnd) ? 4
                        : isStart || isContinuationStart ? "4px 0 0 4px"
                        : isEnd   || isContinuationEnd   ? "0 4px 4px 0"
                        : 0;

                      const marginLeft  = (isStart || isContinuationStart || isSingle) ? 0 : -7;
                      const marginRight = (isEnd   || isContinuationEnd   || isSingle) ? 0 : -7;

                      return (
                        <div key={ev.uid} style={{
                          fontSize: 11, fontWeight: 600,
                          height: 18, flexShrink: 0, boxSizing: "border-box",
                          color: showTitle ? (dark ? DARK_EVENT_TEXT : meta.color) : "transparent",
                          background: dark ? DARK_EVENT_BG(meta.color) : meta.bg,
                          borderLeft: isStart || isSingle
                            ? `2.5px solid ${meta.color}`
                            : isContinuationStart
                              ? `1.5px dashed ${meta.color}`
                              : `1px solid color-mix(in srgb, ${meta.color} 13.3%, transparent)`,
                          borderTop:    `1px solid color-mix(in srgb, ${meta.color} 13.3%, transparent)`,
                          borderBottom: `1px solid color-mix(in srgb, ${meta.color} 13.3%, transparent)`,
                          borderRight: "none",
                          borderRadius,
                          // 1px, not 2px: the strip's height is fixed (18px,
                          // so strips line up across days), and 11px text
                          // needs the room.
                          padding: "1px 4px",
                          marginLeft,
                          marginRight,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          display: "flex", alignItems: "center", gap: 3,
                        }}>
                          {isContinuationStart && (
                            <i className="ti ti-arrow-right" style={{ fontSize: 8, opacity: 0.6, flexShrink: 0, transform: "scaleX(-1)" }} />
                          )}
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                            {showTitle ? ev.title : " "}
                          </span>
                          {isContinuationEnd && (
                            <i className="ti ti-arrow-right" style={{ fontSize: 8, opacity: 0.6, flexShrink: 0 }} />
                          )}
                        </div>
                      );
                    })}
                    {overflow > 0 && (
                      <div style={{ fontSize: 11, color: "var(--color-neutral-500)", paddingLeft: 2 }}>+{overflow} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
