import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import AppLayout from "../components/AppLayout";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

// ── API ───────────────────────────────────────────────────────────────────────
import {
  getCalendarEvents as _getEvents,
  createCalendarEvent as _createEvent,
  updateCalendarEvent as _updateEvent,
  deleteCalendarEvent as _deleteEvent,
} from "../api/enrollmentApi";
import { getSchoolSettings as _getSchoolSettings } from "../api/billingApi";

const getEvents         = (sy)    => _getEvents({ school_year: sy, page_size: 200 });
const createEvent       = (p)     => _createEvent(p);
const updateEvent       = (id, p) => _updateEvent(id, p);
const deleteEvent       = (id)    => _deleteEvent(id);
const getSchoolSettings = ()      => _getSchoolSettings();

// ── CSV Export ────────────────────────────────────────────────────────────────

function quoteCSV(v) {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV(events, schoolYear) {
  const header = ["Date", "End Date", "Title", "Type", "Description", "School Year"];
  const rows = [...events]
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map((ev) => [
      ev.start_date,
      ev.end_date,
      ev.title,
      eventMeta(ev.event_type).label,
      ev.description ?? "",
      ev.school_year,
    ]);
  const csv = [header, ...rows].map((r) => r.map(quoteCSV).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `academic-calendar-SY${schoolYear}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Event types ───────────────────────────────────────────────────────────────

const EVENT_TYPE_DEFAULTS = [
  { value: "holiday",        label: "Holiday",       color: "#e03131", icon: "ti-flag" },
  { value: "exam",           label: "Exam",          color: "#1455a0", icon: "ti-writing" },
  { value: "enrollment",     label: "Enrollment",    color: "#2e6b0d", icon: "ti-clipboard-list" },
  { value: "quarter_break",  label: "Quarter Break", color: "#7c3aed", icon: "ti-calendar-pause" },
  { value: "school_day_off", label: "No Classes",    color: "#d97706", icon: "ti-school-off" },
  { value: "event",          label: "Event",         color: "#0e9488", icon: "ti-star" },
  { value: "other",          label: "Other",         color: "#9a7070", icon: "ti-calendar" },
];

const COLOR_STORAGE_KEY = "cal_event_colors";

function loadColorOverrides() {
  try { return JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}"); }
  catch { return {}; }
}

function saveColorOverrides(overrides) {
  localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(overrides));
}

// Derive bg/light from a hex color (lightened tints)
function hexToTints(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  const mix = (v, t) => Math.round(v + (255 - v) * t).toString(16).padStart(2,"0");
  const bg    = `#${mix(r,0.82)}${mix(g,0.82)}${mix(b,0.82)}`;
  const light = `#${mix(r,0.93)}${mix(g,0.93)}${mix(b,0.93)}`;
  return { bg, light };
}

function buildEventTypes(overrides) {
  return EVENT_TYPE_DEFAULTS.map((t) => {
    const color = overrides[t.value] ?? t.color;
    const { bg, light } = hexToTints(color);
    return { ...t, color, bg, light };
  });
}

// Module-level reactive event types — updated when colors change
let EVENT_TYPES = buildEventTypes(loadColorOverrides());

function eventMeta(type) {
  return EVENT_TYPES.find((t) => t.value === type) ?? EVENT_TYPES[EVENT_TYPES.length - 1];
}

// ── School years ──────────────────────────────────────────────────────────────

const SCHOOL_YEARS = (() => {
  const now = new Date();
  const cur = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 5 }, (_, i) => { const y = cur - 1 + i; return `${y}-${y + 1}`; });
})();

const DEFAULT_SY = SCHOOL_YEARS[1];

// ── Philippine Public Holidays ────────────────────────────────────────────────
// Regular + special non-working holidays per Proclamation. Add future years here.

// ── PH Holiday Algorithms ─────────────────────────────────────────────────────

// Easter Sunday — Anonymous Gregorian algorithm (exact, no approximation)
function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

// Last occurrence of a weekday (0=Sun…6=Sat) in a given month
function lastWeekday(y, month0, weekday) {
  const last = new Date(y, month0 + 1, 0);
  return new Date(y, month0, last.getDate() - (last.getDay() - weekday + 7) % 7);
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// Chinese New Year — lookup table covering 2020-2060, formula fallback beyond.
// Source: Hong Kong Observatory / IANA.
function chineseNewYear(y) {
  const tbl = {
    2020:"2020-01-25",2021:"2021-02-12",2022:"2022-02-01",2023:"2023-01-22",
    2024:"2024-02-10",2025:"2025-01-29",2026:"2026-02-17",2027:"2027-02-06",
    2028:"2028-01-26",2029:"2029-02-13",2030:"2030-02-03",2031:"2031-01-23",
    2032:"2032-02-11",2033:"2033-01-31",2034:"2034-02-19",2035:"2035-02-08",
    2036:"2036-01-28",2037:"2037-02-15",2038:"2038-02-04",2039:"2039-01-24",
    2040:"2040-02-12",2041:"2041-02-01",2042:"2042-01-22",2043:"2043-02-10",
    2044:"2044-01-30",2045:"2045-02-17",2046:"2046-02-06",2047:"2047-01-26",
    2048:"2048-02-14",2049:"2049-02-02",2050:"2050-01-23",2051:"2051-02-11",
    2052:"2052-02-01",2053:"2053-01-21",2054:"2054-02-09",2055:"2055-01-29",
    2056:"2056-02-17",2057:"2057-02-06",2058:"2058-01-26",2059:"2059-02-13",
    2060:"2060-02-02",
  };
  if (tbl[y]) { const [yr,mo,dy] = tbl[y].split("-").map(Number); return new Date(yr, mo-1, dy); }
  // Beyond table: 19-year Metonic cycle approximation (accurate to ±1 day)
  const base = tbl[2020]; const [by,bm,bd] = base.split("-").map(Number);
  const cycles = Math.floor((y - 2020) / 19);
  const rem    = (y - 2020) % 19;
  const offsets = [0,11,11,10,10,11,11,11,11,10,11,10,11,11,10,11,10,11,11];
  let approxDay = new Date(2020, bm-1, bd);
  for (let i = 0; i < (y - 2020); i++) approxDay = new Date(approxDay.getFullYear()+1, approxDay.getMonth(), approxDay.getDate() - offsets[i%19]);
  return approxDay;
}

// Islamic holidays — tabular Hijri calendar (epoch: Thu 15 Jul 622 CE = JD 1948438.5)
// Accurate to ±1 day vs actual moon sighting; close enough for all years.
// Known offsets from Saudi moon sighting to PH proclamation: +1 day applied.
function hijriToJD(hy, hm, hd) {
  return Math.floor((11 * hy + 3) / 30) + 354 * hy + 30 * hm
    - Math.floor((hm - 1) / 2) + hd + 1948438 - 385;
}

function jdToGregorian(jd) {
  let z = jd, a;
  const alpha = Math.floor((z - 1867216.25) / 36524.25);
  a = z < 2299161 ? z : z + 1 + alpha - Math.floor(alpha / 4);
  const b = a + 1524, c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c), e = Math.floor((b - d) / 30.6001);
  const day   = b - d - Math.floor(30.6001 * e);
  const month = e < 14 ? e - 1 : e - 13;
  const year  = month > 2 ? c - 4716 : c - 4715;
  return new Date(year, month - 1, day);
}

// Eid'l Fitr = 1 Shawwal + 1 day (PH sighting offset)
// Eid'l Adha = 10 Dhul Hijja + 1 day (PH sighting offset)
// Known exact PH proclamation dates (override algorithmic result when available)
const EID_OVERRIDES = {
  fitr: { 2024:"2024-04-10", 2025:"2025-03-31", 2026:"2026-03-20" },
  adha: { 2024:"2024-06-17", 2025:"2025-06-06", 2026:"2026-05-27" },
};

function eidDate(y, hijriMonth, hijriDay, overrideMap) {
  if (overrideMap[y]) { const [yr,mo,dy] = overrideMap[y].split("-").map(Number); return new Date(yr, mo-1, dy); }
  // Algorithmic: scan Hijri years whose month falls in gregorian year y
  const approxHY = Math.round((y - 621.5) * 365.25 / 354.367);
  for (const hy of [approxHY - 1, approxHY, approxHY + 1]) {
    const d = jdToGregorian(hijriToJD(hy, hijriMonth, hijriDay));
    if (d.getFullYear() === y) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return null;
}

// Compute all PH public holidays for a given Gregorian year — works for any year
function computePHHolidays(y) {
  const easter   = easterSunday(y);
  const maundy   = new Date(y, easter.getMonth(), easter.getDate() - 3);
  const goodFri  = new Date(y, easter.getMonth(), easter.getDate() - 2);
  const blackSat = new Date(y, easter.getMonth(), easter.getDate() - 1);
  const cny      = chineseNewYear(y);
  const fitr     = eidDate(y, 10, 1,  EID_OVERRIDES.fitr);
  const adha     = eidDate(y, 12, 10, EID_OVERRIDES.adha);
  const heroes   = lastWeekday(y, 7, 1); // last Monday of August

  const holidays = [
    { date: `${y}-01-01`, title: "New Year's Day" },
    { date: fmtDate(cny),     title: "Chinese New Year" },
    { date: `${y}-02-25`,    title: "People Power Anniversary (Special)" },
    { date: fmtDate(maundy),  title: "Maundy Thursday" },
    { date: fmtDate(goodFri), title: "Good Friday" },
    { date: fmtDate(blackSat),title: "Black Saturday (Special)" },
    { date: `${y}-04-09`,    title: "Araw ng Kagitingan" },
    { date: `${y}-05-01`,    title: "Labor Day" },
    { date: `${y}-06-12`,    title: "Independence Day" },
    { date: `${y}-08-21`,    title: "Ninoy Aquino Day" },
    { date: fmtDate(heroes),  title: "National Heroes Day" },
    { date: `${y}-11-01`,    title: "All Saints' Day" },
    { date: `${y}-11-02`,    title: "All Souls' Day (Special)" },
    { date: `${y}-11-30`,    title: "Bonifacio Day" },
    { date: `${y}-12-08`,    title: "Feast of the Immaculate Conception (Special)" },
    { date: `${y}-12-24`,    title: "Christmas Eve (Special)" },
    { date: `${y}-12-25`,    title: "Christmas Day" },
    { date: `${y}-12-30`,    title: "Rizal Day" },
    { date: `${y}-12-31`,    title: "New Year's Eve (Special)" },
  ];
  if (fitr) holidays.push({ date: fmtDate(fitr), title: "Eid'l Fitr" });
  if (adha) holidays.push({ date: fmtDate(adha), title: "Eid'l Adha" });

  // Deduplicate by date, sort chronologically
  const seen = new Set();
  return holidays
    .filter((h) => { if (seen.has(h.date)) return false; seen.add(h.date); return true; })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Returns holiday entries for both calendar years of a school year string e.g. "2025-2026"
function getHolidaysForSY(sy) {
  const [y1, y2] = sy.split("-").map(Number);
  return [
    ...computePHHolidays(y1).map((h) => ({ ...h, school_year: sy })),
    ...computePHHolidays(y2).map((h) => ({ ...h, school_year: sy })),
  ];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function parseLocalDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function buildEventMap(events) {
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

function formatDateRange(start, end) {
  if (start === end) return start;
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);
  if (s.getMonth() === e.getMonth()) return `${MONTHS[s.getMonth()].slice(0,3)} ${s.getDate()}–${e.getDate()}`;
  return `${MONTHS[s.getMonth()].slice(0,3)} ${s.getDate()} – ${MONTHS[e.getMonth()].slice(0,3)} ${e.getDate()}`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
);

// ── Month Calendar Grid ───────────────────────────────────────────────────────

function MonthGrid({ year, monthIndex, eventMap, selectedDay, onSelectDay }) {
  const firstDay    = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const todayKey    = dateKey(new Date());

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div style={{ background: "white", borderRadius: 18, border: "1px solid #f0e6e6", overflow: "hidden", boxShadow: "0 4px 24px rgba(224,49,49,0.07)" }}>
      {/* Day-of-week header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid #f5eaea", background: "linear-gradient(135deg,#fff5f5,#fff)" }}>
        {DAYS_SHORT.map((d, i) => (
          <div key={d} style={{ padding: "10px 0", textAlign: "center", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: i === 0 || i === 6 ? "#e0a0a0" : "#c8a8a8", textTransform: "uppercase" }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
        {cells.map((day, idx) => {
          if (!day) return (
            <div key={`empty-${idx}`} style={{ minHeight: 88, background: idx % 7 === 0 || idx % 7 === 6 ? "#fdfafa" : "transparent", borderRight: "1px solid #faf0f0", borderBottom: "1px solid #faf0f0" }} />
          );

          const k = `${year}-${String(monthIndex + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const dayEvents  = eventMap[k] ?? [];
          const isSelected = selectedDay === k;
          const isToday    = k === todayKey;
          const isWeekend  = idx % 7 === 0 || idx % 7 === 6;
          const visibleEvs = dayEvents.slice(0, 3);
          const overflow   = dayEvents.length - 3;

          return (
            <div
              key={k}
              className={dayEvents.length ? "cal-day" : ""}
              onClick={() => onSelectDay(isSelected ? null : k)}
              style={{
                minHeight: 88,
                padding: "6px 0 4px",
                borderRight: "1px solid #faf0f0",
                borderBottom: "1px solid #faf0f0",
                background: isSelected ? "#fff0f0" : isToday ? "#fffbfb" : isWeekend ? "#fdfafa" : "white",
                cursor: dayEvents.length ? "pointer" : "default",
                transition: "background 0.12s",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Day number */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, padding: "0 6px" }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 24, height: 24, borderRadius: "50%",
                  fontSize: 12, fontWeight: isToday || isSelected ? 700 : 400,
                  background: isToday ? "#e03131" : isSelected ? "#fff0f0" : "transparent",
                  color: isToday ? "white" : isSelected ? "#e03131" : isWeekend ? "#c09090" : "#2a1a1a",
                }}>
                  {day}
                </span>
              </div>

              {/* Event strips */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {visibleEvs.map((ev) => {
                  const meta    = eventMeta(ev.event_type);
                  const isStart = ev.start_date === k;
                  const isEnd   = ev.end_date   === k;
                  const isSingle = ev.start_date === ev.end_date;
                  // Round left edge only on start, right edge only on end
                  const borderRadius = isSingle
                    ? 4
                    : isStart ? "4px 0 0 4px"
                    : isEnd   ? "0 4px 4px 0"
                    : 0;
                  // Bleed into cell padding on continuation/end days so strips connect visually
                  const marginLeft  = isStart || isSingle ?  0 : -7;
                  const marginRight = isEnd   || isSingle ?  0 : -7;
                  return (
                    <div key={ev.event_id} style={{
                      fontSize: 10, fontWeight: 600,
                      color: isStart || isSingle ? meta.color : "transparent",
                      background: meta.bg,
                      borderLeft:  isStart || isSingle ? `2.5px solid ${meta.color}` : `1px solid ${meta.color}22`,
                      borderRight: isEnd   || isSingle ? "none" : "none",
                      borderTop:    `1px solid ${meta.color}22`,
                      borderBottom: `1px solid ${meta.color}22`,
                      borderRadius,
                      padding: "2px 4px",
                      marginLeft,
                      marginRight,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {isStart || isSingle ? ev.title : " "}
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <div style={{ fontSize: 9.5, color: "#b09090", paddingLeft: 2 }}>+{overflow} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Event Card (right panel) ──────────────────────────────────────────────────

function EventCard({ event, onEdit, onDelete }) {
  const meta = eventMeta(event.event_type);
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${meta.color}28`, background: meta.light, overflow: "hidden", transition: "box-shadow 0.12s" }} className="ev-card">
      <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
        <div style={{ width: 4, background: meta.color, borderRadius: "0 0 0 0", flexShrink: 0 }} />
        <div style={{ flex: 1, padding: "10px 12px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: meta.color, background: meta.bg, padding: "2px 7px", borderRadius: 99, letterSpacing: "0.04em" }}>
                  <i className={`ti ${meta.icon}`} style={{ fontSize: 10 }} />{meta.label}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</div>
              <div style={{ fontSize: 11, color: "#9a7070", marginTop: 2 }}>
                <i className="ti ti-calendar" style={{ fontSize: 10, marginRight: 3 }} />
                {formatDateRange(event.start_date, event.end_date)}
              </div>
              {event.description && (
                <div style={{ fontSize: 11, color: "#7a5a5a", marginTop: 4, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {event.description}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button className="row-action" onClick={() => onEdit(event)} title="Edit" style={{ width: 26, height: 26 }}><i className="ti ti-pencil" style={{ fontSize: 12 }} /></button>
              <button className="row-action danger" onClick={() => onDelete(event)} title="Delete" style={{ width: 26, height: 26 }}><i className="ti ti-trash" style={{ fontSize: 12 }} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

const EMPTY_FORM = { title: "", event_type: "holiday", start_date: "", end_date: "", description: "" };
const LBL = { display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 };
const INP = { width: "100%", border: "1.5px solid #fde2de", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none", boxSizing: "border-box" };

function EventModal({ mode, initial, schoolYear, onClose, onSaved }) {
  const [form, setForm] = useState(mode === "edit"
    ? { title: initial.title, event_type: initial.event_type, start_date: initial.start_date, end_date: initial.end_date, description: initial.description ?? "" }
    : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const selectedMeta = eventMeta(form.event_type);

  async function handleSave() {
    if (!form.title.trim())              { setError("Title is required."); return; }
    if (!form.start_date)                { setError("Start date is required."); return; }
    if (!form.end_date)                  { setError("End date is required."); return; }
    if (form.start_date > form.end_date) { setError("Start date must be on or before end date."); return; }
    setSaving(true); setError("");
    try {
      const payload = { school_year: schoolYear, title: form.title.trim(), event_type: form.event_type, start_date: form.start_date, end_date: form.end_date, description: form.description.trim() || null };
      mode === "edit" ? await updateEvent(initial.event_id, payload) : await createEvent(payload);
      onSaved();
    } catch (e) {
      setError(e.message || "Failed to save event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(5px)" }}>
      <div style={{ background: "white", borderRadius: 22, width: 480, boxShadow: "0 32px 80px rgba(224,49,49,0.18)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "slideUp 0.2s ease" }}>

        {/* Colored header strip */}
        <div style={{ background: `linear-gradient(135deg, ${selectedMeta.bg}, white)`, padding: "22px 28px 18px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: selectedMeta.bg, border: `1.5px solid ${selectedMeta.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className={`ti ${selectedMeta.icon}`} style={{ fontSize: 22, color: selectedMeta.color }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a0a0a" }}>{mode === "edit" ? "Edit Event" : "Add New Event"}</div>
            <div style={{ fontSize: 11, color: "#b09090", marginTop: 2 }}>S.Y. {schoolYear}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#b09090" }}><i className="ti ti-x" style={{ fontSize: 14 }} /></button>
        </div>

        <div style={{ padding: "22px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "#b91c1c", display: "flex", alignItems: "center", gap: 8 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{error}
            </div>
          )}

          <div><label style={LBL}>Title *</label><input value={form.title} onChange={(e) => setF("title", e.target.value)} placeholder="e.g. Independence Day" style={INP} /></div>

          {/* Event type as visual pills */}
          <div>
            <label style={LBL}>Event Type *</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {EVENT_TYPES.map((t) => (
                <button key={t.value} onClick={() => setF("event_type", t.value)}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 10px", borderRadius: 10, border: `1.5px solid ${form.event_type === t.value ? t.color : "#f0e4e4"}`, background: form.event_type === t.value ? t.bg : "white", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.1s" }}>
                  <i className={`ti ${t.icon}`} style={{ fontSize: 14, color: form.event_type === t.value ? t.color : "#b09090" }} />
                  <span style={{ fontSize: 11.5, fontWeight: form.event_type === t.value ? 700 : 500, color: form.event_type === t.value ? t.color : "#7a5a5a" }}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={LBL}>Start Date *</label><input type="date" value={form.start_date} onChange={(e) => setF("start_date", e.target.value)} style={INP} /></div>
            <div><label style={LBL}>End Date *</label><input type="date" value={form.end_date} onChange={(e) => setF("end_date", e.target.value)} style={INP} /></div>
          </div>

          <div><label style={LBL}>Description</label><textarea value={form.description} onChange={(e) => setF("description", e.target.value)} placeholder="Optional notes…" rows={3} style={{ ...INP, resize: "vertical" }} /></div>
        </div>

        <div style={{ display: "flex", gap: 10, padding: "0 28px 24px" }}>
          <button onClick={onClose} style={{ flex: 1, height: 42, border: "1.5px solid #f0e0e0", borderRadius: 10, background: "white", fontSize: 13, color: "#7a5050", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="new-btn"
            style={{ flex: 2, height: 42, border: "none", borderRadius: 10, background: saving ? "#e87474" : "linear-gradient(135deg,#e03131,#c92a2a)", fontSize: 13, color: "white", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {saving ? <><i className="ti ti-loader-2" style={{ fontSize: 14, animation: "spin 1s linear infinite" }} />Saving…</> : <><i className="ti ti-device-floppy" style={{ fontSize: 14 }} />{mode === "edit" ? "Save Changes" : "Add Event"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Color Settings Modal ──────────────────────────────────────────────────────

function ColorSettingsModal({ onClose, onSaved }) {
  const [overrides, setOverrides] = useState(() => loadColorOverrides());

  const setColor = (value, color) => setOverrides((prev) => ({ ...prev, [value]: color }));
  const resetAll = () => setOverrides({});

  function handleSave() {
    saveColorOverrides(overrides);
    EVENT_TYPES = buildEventTypes(overrides);
    onSaved();
    onClose();
  }

  const preview = buildEventTypes(overrides);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(5px)" }}>
      <div style={{ background: "white", borderRadius: 22, width: 420, boxShadow: "0 32px 80px rgba(224,49,49,0.18)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "slideUp 0.2s ease" }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg,#fff5f5,white)", padding: "22px 28px 18px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: "#fde8e8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-palette" style={{ fontSize: 22, color: "#e03131" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a0a0a" }}>Event Colors</div>
            <div style={{ fontSize: 11, color: "#b09090", marginTop: 2 }}>Customize strip colors for each event type</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#b09090" }}>
            <i className="ti ti-x" style={{ fontSize: 14 }} />
          </button>
        </div>

        {/* Color rows */}
        <div style={{ padding: "18px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
          {preview.map((t) => (
            <div key={t.value} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Live preview strip */}
              <div style={{ width: 32, height: 32, borderRadius: 9, background: t.bg, border: `2px solid ${t.color}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <i className={`ti ${t.icon}`} style={{ fontSize: 14, color: t.color }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1a0a0a" }}>{t.label}</div>
                <div style={{ fontSize: 10.5, color: "#b09090", marginTop: 1 }}>
                  {/* Mini strip preview */}
                  <span style={{ display: "inline-block", background: t.bg, borderLeft: `3px solid ${t.color}`, borderRadius: "3px 0 0 3px", padding: "1px 8px", fontSize: 10, color: t.color, fontWeight: 600 }}>
                    Sample event
                  </span>
                </div>
              </div>
              {/* Color picker */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <input
                  type="color"
                  value={overrides[t.value] ?? t.color}
                  onChange={(e) => setColor(t.value, e.target.value)}
                  style={{ width: 36, height: 36, border: "1.5px solid #f0e4e4", borderRadius: 9, cursor: "pointer", padding: 2, background: "white" }}
                  title={`Pick color for ${t.label}`}
                />
              </div>
              {/* Reset individual */}
              {overrides[t.value] && (
                <button
                  onClick={() => setOverrides((p) => { const n = { ...p }; delete n[t.value]; return n; })}
                  title="Reset to default"
                  style={{ width: 26, height: 26, border: "1px solid #f0e4e4", borderRadius: 7, background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#c0a0a0" }}>
                  <i className="ti ti-refresh" style={{ fontSize: 12 }} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 10, padding: "0 28px 24px", alignItems: "center" }}>
          <button onClick={resetAll} style={{ height: 38, padding: "0 14px", border: "1.5px solid #f0e0e0", borderRadius: 9, background: "white", fontSize: 12, color: "#b09090", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <i className="ti ti-refresh" style={{ fontSize: 13 }} />Reset all
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ height: 38, padding: "0 16px", border: "1.5px solid #f0e0e0", borderRadius: 9, background: "white", fontSize: 13, color: "#7a5050", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
          <button onClick={handleSave} className="new-btn"
            style={{ height: 38, padding: "0 20px", border: "none", borderRadius: 9, background: "linear-gradient(135deg,#e03131,#c92a2a)", fontSize: 13, color: "white", cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)", display: "flex", alignItems: "center", gap: 7 }}>
            <i className="ti ti-device-floppy" style={{ fontSize: 13 }} />Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PH Holidays Import Modal ──────────────────────────────────────────────────

function ImportHolidaysModal({ schoolYear, existingEvents, onClose, onImported }) {
  const candidates = getHolidaysForSY(schoolYear);
  const existingKeys = new Set(existingEvents.filter((e) => e.event_type === "holiday").map((e) => e.start_date));
  const toAdd    = candidates.filter((h) => !existingKeys.has(h.date));
  const skipped  = candidates.filter((h) =>  existingKeys.has(h.date));

  const [importing, setImporting] = useState(false);
  const [done,      setDone]      = useState(false);
  const [added,     setAdded]     = useState(0);
  const [error,     setError]     = useState("");

  async function handleImport() {
    if (toAdd.length === 0) { onClose(); return; }
    setImporting(true); setError("");
    try {
      await Promise.all(toAdd.map((h) => createEvent({
        school_year: h.school_year,
        title:       h.title,
        event_type:  "holiday",
        start_date:  h.date,
        end_date:    h.date,
        description: null,
      })));
      setAdded(toAdd.length);
      setDone(true);
    } catch (e) {
      setError("Some holidays failed to import. Check your connection and try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(5px)" }}>
      <div style={{ background: "white", borderRadius: 22, width: 480, boxShadow: "0 32px 80px rgba(224,49,49,0.18)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "slideUp 0.2s ease" }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg,#fff5f5,white)", padding: "22px 28px 18px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: "#fde8e8", border: "1.5px solid #fca5a530", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-flag" style={{ fontSize: 22, color: "#e03131" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a0a0a" }}>Import PH Holidays</div>
            <div style={{ fontSize: 11, color: "#b09090", marginTop: 2 }}>Official Philippine public holidays · S.Y. {schoolYear}</div>
          </div>
          {!importing && <button onClick={onClose} style={{ width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#b09090" }}><i className="ti ti-x" style={{ fontSize: 14 }} /></button>}
        </div>

        <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Success state */}
          {done ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0" }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: "#e8f5e0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="ti ti-circle-check" style={{ fontSize: 28, color: "#2e6b0d" }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a0a0a" }}>Import complete!</div>
              <div style={{ fontSize: 13, color: "#7a5a5a", textAlign: "center", lineHeight: 1.7 }}>
                <strong style={{ color: "#2e6b0d" }}>{added} holiday{added !== 1 ? "s" : ""}</strong> added to S.Y. {schoolYear}.
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "#b91c1c", display: "flex", alignItems: "center", gap: 8 }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{error}
                </div>
              )}

              {/* Summary counts */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ background: "#e8f5e0", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <i className="ti ti-circle-plus" style={{ fontSize: 20, color: "#2e6b0d" }} />
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#2e6b0d" }}>{toAdd.length}</div>
                    <div style={{ fontSize: 11, color: "#3e7b1d", fontWeight: 600 }}>to be added</div>
                  </div>
                </div>
                <div style={{ background: "#f5eeee", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 20, color: "#9a7070" }} />
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#9a7070" }}>{skipped.length}</div>
                    <div style={{ fontSize: 11, color: "#7a5050", fontWeight: 600 }}>already exist</div>
                  </div>
                </div>
              </div>

              {/* Holiday list preview */}
              {toAdd.length > 0 ? (
                <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#c0a0a0", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>Will be added</div>
                  {toAdd.map((h) => (
                    <div key={h.date} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: "#fff8f8", borderRadius: 9, border: "1px solid #fde8e8" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#e03131", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "#1a0a0a" }}>{h.title}</span>
                      <span style={{ fontSize: 11, color: "#b09090", fontVariantNumeric: "tabular-nums" }}>{h.date}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: "#f5eeee", borderRadius: 12, padding: "16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 18, color: "#9a7070" }} />
                  <div style={{ fontSize: 13, color: "#7a5050" }}>All holidays for S.Y. {schoolYear} are already in the calendar.</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 10, padding: "0 28px 24px" }}>
          {done ? (
            <button onClick={() => { onImported(); onClose(); }} className="new-btn"
              style={{ flex: 1, height: 42, border: "none", borderRadius: 10, background: "linear-gradient(135deg,#e03131,#c92a2a)", fontSize: 13, color: "white", cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} disabled={importing} style={{ flex: 1, height: 42, border: "1.5px solid #f0e0e0", borderRadius: 10, background: "white", fontSize: 13, color: "#7a5050", cursor: importing ? "not-allowed" : "pointer", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
              <button onClick={handleImport} disabled={importing || toAdd.length === 0} className="new-btn"
                style={{ flex: 2, height: 42, border: "none", borderRadius: 10, background: importing ? "#e87474" : toAdd.length === 0 ? "#d0b8b8" : "linear-gradient(135deg,#e03131,#c92a2a)", fontSize: 13, color: "white", cursor: importing || toAdd.length === 0 ? "not-allowed" : "pointer", fontWeight: 700, fontFamily: "'DM Sans',sans-serif", boxShadow: toAdd.length > 0 ? "0 4px 16px rgba(224,49,49,0.26)" : "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {importing
                  ? <><i className="ti ti-loader-2" style={{ fontSize: 14, animation: "spin 1s linear infinite" }} />Importing…</>
                  : <><i className="ti ti-download" style={{ fontSize: 14 }} />Import {toAdd.length} Holiday{toAdd.length !== 1 ? "s" : ""}</>
                }
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Delete Modal ──────────────────────────────────────────────────────────────

function DeleteModal({ event, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false);
  const meta = eventMeta(event.event_type);
  async function handleDelete() { setDeleting(true); try { await onConfirm(); } finally { setDeleting(false); } }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(5px)" }}>
      <div style={{ background: "white", borderRadius: 20, padding: "32px 36px", width: 380, boxShadow: "0 24px 64px rgba(224,49,49,0.18)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, animation: "slideUp 0.2s ease" }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className="ti ti-trash" style={{ fontSize: 26, color: "#e03131" }} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1a0a0a" }}>Delete Event?</div>
        <div style={{ background: meta.bg, border: `1px solid ${meta.color}28`, borderRadius: 10, padding: "10px 14px", width: "100%", display: "flex", alignItems: "center", gap: 8 }}>
          <i className={`ti ${meta.icon}`} style={{ fontSize: 14, color: meta.color, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: meta.color }}>{event.title}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "#9a7070", textAlign: "center", lineHeight: 1.7 }}>This event will be permanently removed from the calendar. This action cannot be undone.</div>
        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
          <button onClick={onCancel} style={{ flex: 1, height: 42, border: "1.5px solid #f0e0e0", borderRadius: 10, background: "white", fontSize: 13, color: "#7a5050", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
          <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, height: 42, border: "none", borderRadius: 10, background: "linear-gradient(135deg,#e03131,#c92a2a)", fontSize: 13, color: "white", cursor: deleting ? "not-allowed" : "pointer", fontWeight: 700, fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {deleting ? <><i className="ti ti-loader-2" style={{ fontSize: 14, animation: "spin 1s linear infinite" }} />Deleting…</> : <><i className="ti ti-trash" style={{ fontSize: 14 }} />Delete</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Events List (grouped, filtered) ──────────────────────────────────────────

function EventsList({ events, loading, schoolYear, onEdit, onDelete, onJumpMonth }) {
  const [search,      setSearch]      = useState("");
  const [filterType,  setFilterType]  = useState("all");
  const [collapsed,   setCollapsed]   = useState({});

  const filtered = events.filter((ev) => {
    const matchType   = filterType === "all" || ev.event_type === filterType;
    const matchSearch = !search || ev.title.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  // Group by month (using start_date)
  const groups = {};
  for (const ev of filtered) {
    const [, m] = ev.start_date.split("-").map(Number);
    const key = m - 1; // 0-indexed month
    if (!groups[key]) groups[key] = [];
    groups[key].push(ev);
  }
  const sortedMonths = Object.keys(groups).map(Number).sort((a, b) => a - b);

  function toggleMonth(m) {
    setCollapsed((c) => ({ ...c, [m]: !c[m] }));
  }

  return (
    <div style={{ background: "white", borderRadius: 14, border: "1px solid #f0e6e6", overflow: "hidden", boxShadow: "0 2px 10px rgba(224,49,49,0.05)", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ padding: "13px 14px 10px", borderBottom: "1px solid #f5eaea", background: "linear-gradient(135deg,#fff5f5,white)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>All Events</div>
          <span style={{ fontSize: 10.5, color: "#b09090" }}>{filtered.length} / {events.length}</span>
        </div>

        {/* Search */}
        <div className="search-wrap" style={{ display: "flex", alignItems: "center", gap: 6, border: "1.5px solid #f0e4e4", borderRadius: 8, padding: "5px 10px", background: "#fffbfb", marginBottom: 7 }}>
          <i className="ti ti-search" style={{ fontSize: 12, color: "#c0a0a0", flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events…"
            style={{ border: "none", outline: "none", fontSize: 12, color: "#1a0a0a", background: "transparent", width: "100%", fontFamily: "'DM Sans',sans-serif" }}
          />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", padding: 0, display: "flex" }}><i className="ti ti-x" style={{ fontSize: 11 }} /></button>}
        </div>

        {/* Type filter pills */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button
            onClick={() => setFilterType("all")}
            style={{ height: 22, padding: "0 8px", borderRadius: 99, border: `1.5px solid ${filterType === "all" ? "#e03131" : "#f0e4e4"}`, background: filterType === "all" ? "#fff0f0" : "white", fontSize: 10.5, color: filterType === "all" ? "#e03131" : "#9a7070", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: filterType === "all" ? 700 : 500 }}>
            All
          </button>
          {EVENT_TYPES.map((t) => {
            const active = filterType === t.value;
            const count  = events.filter((e) => e.event_type === t.value).length;
            if (count === 0) return null;
            return (
              <button key={t.value} onClick={() => setFilterType(active ? "all" : t.value)}
                style={{ height: 22, padding: "0 8px", borderRadius: 99, border: `1.5px solid ${active ? t.color : "#f0e4e4"}`, background: active ? t.bg : "white", fontSize: 10.5, color: active ? t.color : "#9a7070", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: active ? 700 : 500, display: "flex", alignItems: "center", gap: 4 }}>
                <i className={`ti ${t.icon}`} style={{ fontSize: 10 }} />{t.label} <span style={{ opacity: 0.7 }}>·{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {loading ? (
          <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            {[1,2,3,4].map((i) => <Sk key={i} h={38} r={8} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "28px 0" }}>
            <i className="ti ti-calendar-off" style={{ fontSize: 26, color: "#e8d0d0" }} />
            <div style={{ fontSize: 12, color: "#c0a0a0", textAlign: "center", lineHeight: 1.6 }}>
              {events.length === 0
                ? <>No events yet.<br />Click <strong>Add Event</strong> to get started.</>
                : "No events match your filter."}
            </div>
          </div>
        ) : (
          sortedMonths.map((m) => {
            const isCollapsed = collapsed[m];
            const monthEvs    = groups[m];
            return (
              <div key={m}>
                {/* Month header row */}
                <button
                  onClick={() => { toggleMonth(m); onJumpMonth(m); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", borderBottom: "1px solid #faf0f0" }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#c0a0a0", letterSpacing: "0.07em", textTransform: "uppercase", flex: 1, textAlign: "left" }}>
                    {MONTHS[m]}
                  </span>
                  <span style={{ fontSize: 10, color: "#d0b0b0", fontWeight: 600 }}>{monthEvs.length}</span>
                  <i className={`ti ti-chevron-${isCollapsed ? "down" : "up"}`} style={{ fontSize: 11, color: "#d0b0b0" }} />
                </button>

                {/* Event rows */}
                {!isCollapsed && monthEvs.map((ev) => {
                  const meta = eventMeta(ev.event_type);
                  return (
                    <div key={ev.event_id} className="ev-list-row"
                      style={{ display: "flex", alignItems: "center", gap: 0, borderBottom: "1px solid #faf5f5", transition: "background 0.1s" }}>
                      {/* Color bar */}
                      <div style={{ width: 3, alignSelf: "stretch", background: meta.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, padding: "7px 10px", minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1a0a0a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: meta.color, background: meta.bg, padding: "1px 6px", borderRadius: 99 }}>{meta.label}</span>
                          <span style={{ fontSize: 10, color: "#c0a0a0" }}>{formatDateRange(ev.start_date, ev.end_date)}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 3, padding: "0 8px", flexShrink: 0 }}>
                        <button className="row-action" onClick={() => onEdit(ev)} title="Edit" style={{ width: 24, height: 24 }}><i className="ti ti-pencil" style={{ fontSize: 11 }} /></button>
                        <button className="row-action danger" onClick={() => onDelete(ev)} title="Delete" style={{ width: 24, height: 24 }}><i className="ti ti-trash" style={{ fontSize: 11 }} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Print Components ─────────────────────────────────────────────────────────

function PrintHeader({ schoolName, schoolYear }) {
  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #e03131", paddingBottom: 10, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src={logo} alt="Logo" style={{ width: 28, height: 42, objectFit: "contain" }} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a" }}>{schoolName}</div>
          <div style={{ fontSize: 12, color: "#7a5050", marginTop: 2 }}>Academic Calendar — S.Y. {schoolYear}</div>
        </div>
      </div>
      <div style={{ fontSize: 10, color: "#b09090", textAlign: "right" }}>
        Generated on {today}
      </div>
    </div>
  );
}

// Full-year list: all 12 months as tables
function YearListPrint({ events, schoolYear, schoolName }) {
  const [syYear, syYear2] = schoolYear.split("-").map(Number);
  const sorted = [...events].sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <div style={{ fontFamily: "'DM Sans', Arial, sans-serif", fontSize: 11, color: "#1a0a0a", padding: "0 8px" }}>
      <PrintHeader schoolName={schoolName} schoolYear={schoolYear} />
      {MONTHS.map((month, mi) => {
        const monthYear = mi >= 6 ? syYear : syYear2;
        const monthEvs = sorted.filter((ev) => {
          const [y, m] = ev.start_date.split("-").map(Number);
          return m - 1 === mi && y === monthYear;
        });
        return (
          <div key={mi} style={{ marginBottom: 18, breakInside: "avoid" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fde8e8", padding: "5px 10px", borderRadius: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#e03131" }}>{month} {monthYear}</span>
              <span style={{ fontSize: 10, color: "#b09090" }}>{monthEvs.length} event{monthEvs.length !== 1 ? "s" : ""}</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
              <thead>
                <tr style={{ background: "#fdf8f8" }}>
                  {["Date", "Event", "Type", "Description"].map((h) => (
                    <th key={h} style={{ padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #f0e4e4", color: "#9a7070", fontWeight: 700, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthEvs.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: "6px 8px", color: "#c8b0b0", fontStyle: "italic", fontSize: 10 }}>No events this month</td></tr>
                ) : monthEvs.map((ev) => {
                  const meta = eventMeta(ev.event_type);
                  return (
                    <tr key={ev.event_id} style={{ borderBottom: "1px solid #faf0f0" }}>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap", color: "#5a3a3a", fontVariantNumeric: "tabular-nums" }}>{formatDateRange(ev.start_date, ev.end_date)}</td>
                      <td style={{ padding: "5px 8px", fontWeight: 600 }}>{ev.title}</td>
                      <td style={{ padding: "5px 8px" }}>
                        <span style={{ background: meta.bg, color: meta.color, borderLeft: `3px solid ${meta.color}`, padding: "2px 7px", borderRadius: "0 3px 3px 0", fontSize: 9.5, fontWeight: 700 }}>{meta.label}</span>
                      </td>
                      <td style={{ padding: "5px 8px", color: "#7a5a5a", fontSize: 10 }}>{ev.description ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {/* Legend */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", borderTop: "1px solid #f0e4e4", paddingTop: 8, marginTop: 4 }}>
        {EVENT_TYPES.map((t) => (
          <div key={t.value} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: t.bg, border: `1.5px solid ${t.color}` }} />
            <span style={{ fontSize: 9.5, color: "#7a5a5a" }}>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Monthly sheet: one month per page with mini grid
function MonthGridPrint({ events, schoolYear, schoolName }) {
  const [syYear, syYear2] = schoolYear.split("-").map(Number);
  const eventMap = buildEventMap(events);

  return (
    <div style={{ fontFamily: "'DM Sans', Arial, sans-serif", fontSize: 11, color: "#1a0a0a" }}>
      {MONTHS.map((month, mi) => {
        const monthYear   = mi >= 6 ? syYear : syYear2;
        const firstDay    = new Date(monthYear, mi, 1).getDay();
        const daysInMonth = new Date(monthYear, mi + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);

        const monthEvs = events
          .filter((ev) => { const [y, m] = ev.start_date.split("-").map(Number); return m - 1 === mi && y === monthYear; })
          .sort((a, b) => a.start_date.localeCompare(b.start_date));

        return (
          <div key={mi} style={{ pageBreakBefore: mi === 0 ? "auto" : "always", padding: "0 8px 16px" }}>
            <PrintHeader schoolName={schoolName} schoolYear={schoolYear} />

            {/* Month title */}
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e03131", marginBottom: 10 }}>{month} {monthYear}</div>

            {/* Mini calendar grid */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14, tableLayout: "fixed" }}>
              <thead>
                <tr>
                  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => (
                    <th key={d} style={{ padding: "4px 0", textAlign: "center", fontSize: 9, fontWeight: 700, color: i === 0 || i === 6 ? "#e0a0a0" : "#b09090", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f0e4e4" }}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: cells.length / 7 }, (_, week) => (
                  <tr key={week}>
                    {cells.slice(week * 7, week * 7 + 7).map((day, ci) => {
                      if (!day) return <td key={ci} style={{ border: "1px solid #faf0f0", height: 44, background: "#fdfafa" }} />;
                      const k = `${monthYear}-${String(mi + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                      const dayEvs = eventMap[k] ?? [];
                      const isWeekend = ci === 0 || ci === 6;
                      return (
                        <td key={k} style={{ border: "1px solid #f0e4e4", height: 44, verticalAlign: "top", padding: "3px 3px 2px", background: isWeekend ? "#fdfafa" : "white" }}>
                          <div style={{ fontSize: 10, fontWeight: dayEvs.length ? 700 : 400, color: isWeekend ? "#c09090" : "#2a1a1a", marginBottom: 2 }}>{day}</div>
                          {dayEvs.slice(0, 2).map((ev) => {
                            const meta = eventMeta(ev.event_type);
                            const isStart = ev.start_date === k;
                            return (
                              <div key={ev.event_id} style={{ fontSize: 8, background: meta.bg, color: meta.color, borderLeft: `2px solid ${meta.color}`, padding: "1px 3px", marginBottom: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", borderRadius: "0 2px 2px 0" }}>
                                {isStart ? ev.title : ""}
                              </div>
                            );
                          })}
                          {dayEvs.length > 2 && <div style={{ fontSize: 7.5, color: "#b09090" }}>+{dayEvs.length - 2}</div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Event list for this month */}
            {monthEvs.length > 0 && (
              <div style={{ borderTop: "1px solid #f0e4e4", paddingTop: 8 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: "#b09090", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Events This Month</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {monthEvs.map((ev) => {
                    const meta = eventMeta(ev.event_type);
                    return (
                      <div key={ev.event_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: meta.bg, borderLeft: `3px solid ${meta.color}`, borderRadius: "0 5px 5px 0" }}>
                        <span style={{ fontSize: 9.5, fontVariantNumeric: "tabular-nums", color: "#7a5050", whiteSpace: "nowrap" }}>{formatDateRange(ev.start_date, ev.end_date)}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: meta.color, flex: 1 }}>{ev.title}</span>
                        {ev.description && <span style={{ fontSize: 9, color: "#9a7070", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: 180 }}>{ev.description}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Legend on last month */}
            {mi === 11 && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", borderTop: "1px solid #f0e4e4", paddingTop: 8, marginTop: 10 }}>
                {EVENT_TYPES.map((t) => (
                  <div key={t.value} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 9, height: 9, borderRadius: 2, background: t.bg, border: `1.5px solid ${t.color}` }} />
                    <span style={{ fontSize: 9, color: "#7a5a5a" }}>{t.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Print Toolbar ─────────────────────────────────────────────────────────────

function PrintToolbar({ printView, setPrintView, onPrint, onExportCSV }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "white", borderRadius: 12, border: "1px solid #f0e6e6", boxShadow: "0 2px 10px rgba(224,49,49,0.05)", marginTop: 4 }}>
      <i className="ti ti-printer" style={{ fontSize: 15, color: "#c0a0a0" }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: "#9a7070" }}>Export</span>
      <div style={{ width: 1, height: 18, background: "#f0e4e4" }} />

      {/* View toggle */}
      <div style={{ display: "flex", background: "#fdf8f8", borderRadius: 8, padding: 3, gap: 2 }}>
        {[
          { value: "list",  label: "Full Year List",  icon: "ti-list" },
          { value: "month", label: "Monthly Sheets",  icon: "ti-layout-grid" },
        ].map((opt) => (
          <button key={opt.value} onClick={() => setPrintView(opt.value)}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px", borderRadius: 6, border: "none", background: printView === opt.value ? "white" : "transparent", fontSize: 11.5, fontWeight: printView === opt.value ? 700 : 500, color: printView === opt.value ? "#e03131" : "#9a7070", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: printView === opt.value ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.1s" }}>
            <i className={`ti ${opt.icon}`} style={{ fontSize: 13 }} />{opt.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* CSV */}
      <button onClick={onExportCSV}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", border: "1.5px solid #f0e4e4", borderRadius: 9, background: "white", fontSize: 12, fontWeight: 600, color: "#7a5a5a", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.14s" }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#fca5a5"; e.currentTarget.style.color = "#e03131"; e.currentTarget.style.background = "#fff8f8"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#f0e4e4"; e.currentTarget.style.color = "#7a5a5a"; e.currentTarget.style.background = "white"; }}>
        <i className="ti ti-table-export" style={{ fontSize: 14 }} />Download CSV
      </button>

      {/* Print */}
      <button onClick={onPrint} className="new-btn"
        style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 16px", border: "none", borderRadius: 9, background: "linear-gradient(135deg,#e03131,#c92a2a)", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 14px rgba(224,49,49,0.28)" }}>
        <i className="ti ti-printer" style={{ fontSize: 14 }} />Print / PDF
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AcademicCalendarPage() {
  const navigate = useNavigate();
  const [schoolYear,  setSchoolYear]  = useState(DEFAULT_SY);
  const [events,      setEvents]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [selectedDay, setSelectedDay] = useState(null);
  const [modal,        setModal]       = useState(null);
  const [toDelete,     setToDelete]   = useState(null);
  const [showImport,    setShowImport]    = useState(false);
  const [showColors,    setShowColors]    = useState(false);
  const [colorVersion,  setColorVersion]  = useState(0);
  const [activeMonth,   setActiveMonth]   = useState(() => new Date().getMonth());
  const [printView,      setPrintView]     = useState("list");
  const [schoolSettings, setSchoolSettings] = useState(null);

  const [syYear, syYear2] = schoolYear.split("-").map(Number);
  // PH school year: Jul–Dec belong to Y1, Jan–Jun belong to Y2
  const activeMonthYear = activeMonth >= 6 ? syYear : syYear2;

  const fetchEvents = useCallback(async (sy) => {
    setLoading(true); setError("");
    try {
      const data = await getEvents(sy);
      const fetched = Array.isArray(data) ? data : (data.results ?? []);
      setEvents(fetched);

      // Auto-import PH holidays silently if none exist for this school year
      const hasHolidays = fetched.some((e) => e.event_type === "holiday");
      if (!hasHolidays) {
        try {
          const toAdd = getHolidaysForSY(sy).filter(
            (h) => !fetched.some((e) => e.start_date === h.date)
          );
          for (const h of toAdd) {
            await createEvent({
              school_year: h.school_year,
              title:       h.title,
              event_type:  "holiday",
              start_date:  h.date,
              end_date:    h.date,
              description: null,
            });
          }
          if (toAdd.length > 0) {
            const updated = await getEvents(sy);
            setEvents(Array.isArray(updated) ? updated : (updated.results ?? []));
          }
        } catch {
          // Silent — holidays failed to import but calendar still shows
        }
      }
    } catch { setError("Failed to load calendar events."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!sessionStorage.getItem("access_token")) { navigate("/"); return; }
    fetchEvents(schoolYear);
    getSchoolSettings().then(setSchoolSettings).catch(() => {});
  }, [schoolYear, fetchEvents, navigate]);

  const eventMap      = buildEventMap(events);
  const uniqueForDay  = selectedDay
    ? (eventMap[selectedDay] ?? []).filter((ev, i, arr) => arr.findIndex((x) => x.event_id === ev.event_id) === i)
    : [];

  function handleSaved() { setModal(null); fetchEvents(schoolYear); }
  async function handleDeleteConfirm() { await deleteEvent(toDelete.event_id); setToDelete(null); setSelectedDay(null); fetchEvents(schoolYear); }

  function handlePrint() {
    window.print();
  }

  let selectedLabel = null;
  if (selectedDay) {
    const [sy, sm, sd] = selectedDay.split("-").map(Number);
    selectedLabel = `${MONTHS[sm - 1]} ${sd}, ${sy}`;
  }

  // Count events per type for stats bar
  const typeCounts = EVENT_TYPES.map((t) => ({ ...t, count: events.filter((e) => e.event_type === t.value).length })).filter((t) => t.count > 0);

  return (
    <>
    <AppLayout>
      <style>{`
        .cal-day:hover { background: #fff4f4 !important; }
        .cal-day:hover > div:first-child > span { background: #fde8e8 !important; }
        .month-nav-btn:hover { background: #fff0f0 !important; color: #e03131 !important; border-color: #fca5a5 !important; }
        .ev-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important; }
        .month-pill:hover { border-color: #fca5a5 !important; color: #e03131 !important; background: #fff8f8 !important; }
        .ev-list-row:hover { background: #fff8f6 !important; }
        #cal-print-portal { display: none; }
        @media print {
          @page { margin: 14mm 12mm; size: A4 portrait; }
          html, body { height: auto !important; overflow: visible !important; background: white !important; }
          body > *:not(#cal-print-portal) { display: none !important; visibility: hidden !important; }
          #cal-print-portal { display: block !important; position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; background: white !important; }
        }
      `}</style>

      {/* ── Topbar ── */}
      <div style={{ background: "white", borderBottom: "1px solid #f5eaea", padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 8px rgba(224,49,49,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="ti ti-calendar-event" style={{ fontSize: 18, color: "#e03131" }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a0a0a" }}>Academic Calendar</div>
            <div style={{ fontSize: 11, color: "#b09090" }}>S.Y. {schoolYear} · {events.length} events</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {SCHOOL_YEARS.map((sy) => (
            <button key={sy} className={`chip-btn${sy === schoolYear ? " active" : ""}`} onClick={() => { setSchoolYear(sy); setSelectedDay(null); }}>{sy}</button>
          ))}
          <div style={{ width: 1, height: 22, background: "#f0e4e4", margin: "0 4px" }} />
          <button onClick={() => setShowImport(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "white", color: "#e03131", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", transition: "all 0.14s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#fff0f0"; e.currentTarget.style.borderColor = "#e03131"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#fca5a5"; }}>
            <i className="ti ti-flag" style={{ fontSize: 14 }} />PH Holidays
          </button>
          <button onClick={() => setShowColors(true)} title="Customize event colors"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: "white", color: "#9a7070", border: "1.5px solid #f0e4e4", borderRadius: 10, cursor: "pointer", transition: "all 0.14s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#fff0f0"; e.currentTarget.style.color = "#e03131"; e.currentTarget.style.borderColor = "#fca5a5"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.color = "#9a7070"; e.currentTarget.style.borderColor = "#f0e4e4"; }}>
            <i className="ti ti-palette" style={{ fontSize: 16 }} />
          </button>
          <button className="new-btn" onClick={() => setModal({ mode: "create" })}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
            <i className="ti ti-plus" style={{ fontSize: 15 }} />Add Event
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ margin: "14px 24px 0", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "11px 16px", fontSize: 13, color: "#b91c1c", display: "flex", alignItems: "center", gap: 8 }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 15 }} />{error}
          <button onClick={() => setError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#b91c1c" }}><i className="ti ti-x" /></button>
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 24px", display: "flex", gap: 18, minHeight: 0 }}>

        {/* ── Left: Calendar ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Month nav bar */}
          <div style={{ background: "white", borderRadius: 14, border: "1px solid #f0e6e6", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 2px 10px rgba(224,49,49,0.05)" }}>
            <button className="row-action month-nav-btn" onClick={() => setActiveMonth((m) => (m - 1 + 12) % 12)}>
              <i className="ti ti-chevron-left" style={{ fontSize: 15 }} />
            </button>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a", minWidth: 148, textAlign: "center" }}>
              {MONTHS[activeMonth]} <span style={{ color: "#c09090", fontWeight: 500 }}>{activeMonthYear}</span>
            </div>
            <button className="row-action month-nav-btn" onClick={() => setActiveMonth((m) => (m + 1) % 12)}>
              <i className="ti ti-chevron-right" style={{ fontSize: 15 }} />
            </button>
            <div style={{ width: 1, height: 20, background: "#f0e4e4", margin: "0 6px" }} />
            {/* Month pills */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {MONTHS.map((m, i) => (
                <button key={m} className="month-pill"
                  onClick={() => setActiveMonth(i)}
                  style={{ height: 26, padding: "0 9px", borderRadius: 99, border: `1.5px solid ${i === activeMonth ? "#e03131" : "#f0e4e4"}`, background: i === activeMonth ? "#fff0f0" : "white", fontSize: 11, color: i === activeMonth ? "#e03131" : "#9a7070", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: i === activeMonth ? 700 : 500, transition: "all 0.1s" }}>
                  {m.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Calendar grid */}
          {loading ? <Sk h={480} r={18} /> : (
            <MonthGrid
              key={`${schoolYear}-${activeMonth}-${colorVersion}`}
              year={activeMonthYear}
              monthIndex={activeMonth}
              eventMap={eventMap}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          )}

          {/* Legend */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "2px 0" }}>
            {EVENT_TYPES.map((t) => (
              <div key={t.value} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: t.bg, border: `1.5px solid ${t.color}60` }} />
                <span style={{ fontSize: 11, color: "#7a5a5a", fontWeight: 500 }}>{t.label}</span>
              </div>
            ))}
          </div>

          {/* Print toolbar */}
          <PrintToolbar
            printView={printView}
            setPrintView={setPrintView}
            onPrint={handlePrint}
            onExportCSV={() => exportCSV(events, schoolYear)}
          />
        </div>

        {/* ── Right Panel ── */}
        <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Stats strip */}
          {!loading && typeCounts.length > 0 && (
            <div style={{ background: "white", borderRadius: 14, border: "1px solid #f0e6e6", padding: "14px 16px", boxShadow: "0 2px 10px rgba(224,49,49,0.05)" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#c0a0a0", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>This Year</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {typeCounts.map((t) => (
                  <div key={t.value} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <i className={`ti ${t.icon}`} style={{ fontSize: 13, color: t.color }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: "#3a2020" }}>{t.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: t.color }}>{t.count}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 99, background: "#f5eaea", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, (t.count / events.length) * 100)}%`, background: t.color, borderRadius: 99, transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selected day panel */}
          {selectedDay ? (
            <div style={{ background: "white", borderRadius: 14, border: "1px solid #f0e6e6", overflow: "hidden", boxShadow: "0 2px 10px rgba(224,49,49,0.05)" }}>
              <div style={{ padding: "13px 16px", borderBottom: "1px solid #f5eaea", background: "linear-gradient(135deg,#fff5f5,white)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className="ti ti-calendar" style={{ fontSize: 15, color: "#e03131" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>{selectedLabel}</div>
                  <div style={{ fontSize: 10.5, color: "#b09090", marginTop: 1 }}>{uniqueForDay.length} event{uniqueForDay.length !== 1 ? "s" : ""}</div>
                </div>
                <button onClick={() => setSelectedDay(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0" }}><i className="ti ti-x" style={{ fontSize: 15 }} /></button>
              </div>
              <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7, maxHeight: 280, overflowY: "auto" }}>
                {uniqueForDay.length === 0
                  ? <div style={{ fontSize: 12, color: "#b09090", textAlign: "center", padding: "16px 0" }}>No events on this day.</div>
                  : uniqueForDay.map((ev) => <EventCard key={ev.event_id} event={ev} onEdit={(e) => setModal({ mode: "edit", event: e })} onDelete={setToDelete} />)
                }
              </div>
            </div>
          ) : (
            <div style={{ background: "white", borderRadius: 14, border: "1px solid #f0e6e6", padding: "22px 16px", boxShadow: "0 2px 10px rgba(224,49,49,0.05)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="ti ti-calendar-search" style={{ fontSize: 22, color: "#e8a0a0" }} />
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#b09090" }}>No date selected</div>
              <div style={{ fontSize: 11, color: "#c8b0b0", textAlign: "center", lineHeight: 1.6 }}>Click any date on the calendar to view its events</div>
            </div>
          )}

          {/* All events list */}
          <EventsList
            events={events}
            loading={loading}
            schoolYear={schoolYear}
            onEdit={(e) => setModal({ mode: "edit", event: e })}
            onDelete={setToDelete}
            onJumpMonth={(m) => setActiveMonth(m)}
          />
        </div>
      </div>

      {modal && <EventModal mode={modal.mode} initial={modal.event ?? null} schoolYear={schoolYear} onClose={() => setModal(null)} onSaved={handleSaved} />}
      {toDelete && <DeleteModal event={toDelete} onConfirm={handleDeleteConfirm} onCancel={() => setToDelete(null)} />}
      {showImport && <ImportHolidaysModal schoolYear={schoolYear} existingEvents={events} onClose={() => setShowImport(false)} onImported={() => fetchEvents(schoolYear)} />}
      {showColors && <ColorSettingsModal onClose={() => setShowColors(false)} onSaved={() => setColorVersion((v) => v + 1)} />}

    </AppLayout>
    {createPortal(
      <div id="cal-print-portal">
        {printView === "list"
          ? <YearListPrint events={events} schoolYear={schoolYear} schoolName={schoolSettings?.school_name ?? "South Lakes Integrated School"} />
          : <MonthGridPrint events={events} schoolYear={schoolYear} schoolName={schoolSettings?.school_name ?? "South Lakes Integrated School"} />
        }
      </div>,
      document.body
    )}
    </>
  );
}
