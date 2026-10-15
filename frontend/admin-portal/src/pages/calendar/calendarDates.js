// Dates and events for the month grid (MonthGrid.jsx): which events fall on
// which day. Shared by the Academic Calendar and the guardian's School
// calendar.

import { PERSONAL_TYPE } from "./eventTypes";

export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/**
 * School events and the viewer's own as one list for the grid. The two come
 * from different tables, so their event_ids can collide: `uid` tells them
 * apart, and `mine` says which API owns the row. A personal event takes the
 * "personal" type, for its colour and label.
 */
export function calendarItems(school = [], mine = []) {
  return [
    ...school.map((ev) => ({ ...ev, uid: `school-${ev.event_id}`, mine: false })),
    ...mine.map((ev) => ({ ...ev, uid: `mine-${ev.event_id}`, mine: true, event_type: PERSONAL_TYPE })),
  ];
}

export function parseLocalDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

export function buildEventMap(events) {
  const map = {};
  for (const ev of events) {
    const start = parseLocalDate(ev.start_date);
    const end   = parseLocalDate(ev.end_date);
    const cur   = new Date(start);
    while (cur <= end) {
      const k = dateKey(cur);
      if (!map[k]) map[k] = [];
      map[k].push(ev);
      cur.setDate(cur.getDate() + 1);
    }
  }
  return map;
}

// For a given grid month (year + monthIndex), return all events that are
// active on each day, even when the event's calendar year differs from `year`
// (happens at the school-year Jul/Jun boundary where Jul uses syYear but an
// event that started in Jun syYear2 bleeds into Jul syYear).
export function getDayEvents(eventMap, year, monthIndex, day) {
  const primary = `${year}-${String(monthIndex + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  // Also check the other calendar year for the same month/day so cross-year
  // spanning events (e.g. Jun 2026 → Jul 2026 stored under SY 2025-2026 where
  // the July grid renders as year=2025) are still found.
  const altYear = year + 1;
  const alt     = `${altYear}-${String(monthIndex + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  const seen    = new Set();
  const result  = [];
  for (const ev of (eventMap[primary] ?? [])) {
    if (!seen.has(ev.uid)) { seen.add(ev.uid); result.push({ ev, k: primary }); }
  }
  for (const ev of (eventMap[alt] ?? [])) {
    if (!seen.has(ev.uid)) { seen.add(ev.uid); result.push({ ev, k: alt }); }
  }
  return result;
}

export function formatDateRange(start, end) {
  if (start === end) return start;
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);
  if (s.getMonth() === e.getMonth()) return `${MONTHS[s.getMonth()].slice(0,3)} ${s.getDate()}–${e.getDate()}`;
  return `${MONTHS[s.getMonth()].slice(0,3)} ${s.getDate()} – ${MONTHS[e.getMonth()].slice(0,3)} ${e.getDate()}`;
}
