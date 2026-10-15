import { usePageTitle } from "../hooks/usePageTitle";
import useYearFilter from "../hooks/useYearFilter";
import useArchivedYears from "../hooks/useArchivedYears";
import ArchivedYearNotice from "../components/schoolYears/ArchivedYearNotice";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import ChipGroup from "../components/ui/ChipGroup";
import Modal from "../components/ui/Modal";
import Alert from "../components/ui/Alert";
import { ModalHeader } from "../components/ui/FormSection";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import ConfirmModal from "../components/ConfirmModal";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { listVariants } from "../utils/motion";
import useTheme from "../hooks/useTheme";
import useCurrentUser from "../hooks/useCurrentUser";
import { CARD_DARK } from "../components/ui/darkSurfaces";
import SegmentedControl from "../components/ui/SegmentedControl";
import { ToggleCard, TogglePill } from "../components/ui/ToggleCard";
import { CHIP_GLOW } from "../constants/statusTones";
import { ACADEMIC_STAFF } from "../utils/auth";
import MonthGrid from "./calendar/MonthGrid";
import { MONTHS, buildEventMap, calendarItems, formatDateRange, parseLocalDate } from "./calendar/calendarDates";
import {
  DARK_EVENT_BG, DARK_EVENT_LIGHT, DARK_EVENT_TEXT, EVENT_TYPES, PERSONAL_TYPE, applyColorOverrides,
  buildEventTypes, eventMeta, loadColorOverrides, schoolEventTypes,
} from "./calendar/eventTypes";

// ── API ───────────────────────────────────────────────────────────────────────
import {
  getCalendarEvents as _getEvents,
  createCalendarEvent as _createEvent,
  updateCalendarEvent as _updateEvent,
  deleteCalendarEvent as _deleteEvent,
  getPersonalEvents as _getMine,
  createPersonalEvent,
  updatePersonalEvent,
  deletePersonalEvent,
} from "../api/enrollmentApi";
import { getSchoolSettings as _getSchoolSettings } from "../api/billingApi";
import { useSchoolYear } from "../context/SchoolYearContext";

const getEvents         = (sy)    => _getEvents({ school_year: sy, page_size: 200 });
const createEvent       = (p)     => _createEvent(p);
const updateEvent       = (id, p) => _updateEvent(id, p);
const deleteEvent       = (id)    => _deleteEvent(id);
const getSchoolSettings = ()      => _getSchoolSettings();

// The school year's days, July to June, as the event form bounds them.
function yearBounds(sy) {
  const [y1, y2] = sy.split("-").map(Number);
  return { min: `${y1}-07-01`, max: `${y2}-06-30` };
}

// Your own events overlapping the year's days: they aren't filed under a year.
const getMine = (sy) => {
  const { min, max } = yearBounds(sy);
  return _getMine({ end_date__gte: min, start_date__lte: max, page_size: 500 });
};

// A school event goes through the calendar-events API, your own through
// personal-events: `mine` (calendarItems) says which.
const removeEvent = (ev) => (ev.mine ? deletePersonalEvent : deleteEvent)(ev.event_id);

// "My events" on or off, kept per person in this browser.
const showMineKey = (user) => `asia.calendar.showMine.${user?.id ?? "anon"}`;
function readShowMine(user) {
  try { return localStorage.getItem(showMineKey(user)) !== "0"; }
  catch { return true; }
}
function writeShowMine(user, on) {
  try { localStorage.setItem(showMineKey(user), on ? "1" : "0"); }
  catch { /* the choice lasts this visit only */ }
}

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
  // BOM so Excel reads UTF-8 (see riskVocabulary.js downloadRiskCSV).
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `academic-calendar-SY${schoolYear}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Event types ───────────────────────────────────────────────────────────────

// A Grading Period event marks one quarter. Its end date is when that
// quarter's grades are due; the admin home reads these to know the current
// quarter. Senior High semesters are derived from them (Q1–Q2, Q3–Q4).
const GRADING_QUARTERS = [
  { value: "1st_quarter", label: "1st Quarter" },
  { value: "2nd_quarter", label: "2nd Quarter" },
  { value: "3rd_quarter", label: "3rd Quarter" },
  { value: "4th_quarter", label: "4th Quarter" },
];
const QUARTER_LABELS = new Set(GRADING_QUARTERS.map((q) => q.label));

// framer-motion tweens these hovers and can't tween var(): dark gets the dark
// values of the same tokens (brand-100, brand-300, brand-600; brand-50 for
// the CSV button's near-miss #fff8f8).
const DARK_HOVER = { bg: "#2f1a1a", border: "#7d3535", text: "#ff8f8f", soft: "#221616" };

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
  const base = tbl[2020]; const [by,bm,bd] = base.split("-").map(Number); // eslint-disable-line no-unused-vars
  const cycles = Math.floor((y - 2020) / 19); // eslint-disable-line no-unused-vars
  const rem    = (y - 2020) % 19; // eslint-disable-line no-unused-vars
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

// ── Skeleton ──────────────────────────────────────────────────────────────────

const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,var(--skeleton) 25%,var(--skeleton-shine) 50%,var(--skeleton) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
);

// ── Event Card (right panel) ──────────────────────────────────────────────────

// Who else sees an event, when it isn't the whole school and its families:
// your own is yours alone; a school event can be kept from guardians.
function EventAudience({ event }) {
  const [icon, text] = event.mine
    ? ["ti-lock", "Only you"]
    : event.visible_to_guardians === false ? ["ti-eye-off", "Staff only"] : [null, null];
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-600">
      <i className={`ti ${icon}`} aria-hidden="true" />{text}
    </span>
  );
}

function EventCard({ event, onEdit, onDelete }) {
  const meta = eventMeta(event.event_type);
  const dark = useTheme() === "dark";
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
      transition={{ duration: 0.15 }}
      style={{ borderRadius: 12, border: `1px solid color-mix(in srgb, ${meta.color} 15.7%, transparent)`, background: dark ? DARK_EVENT_LIGHT(meta.color) : meta.light, overflow: "hidden" }}
    >
      <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
        <div style={{ width: 4, background: meta.color, flexShrink: 0 }} />
        <div style={{ flex: 1, padding: "10px 12px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: dark ? DARK_EVENT_TEXT : meta.color, background: dark ? DARK_EVENT_BG(meta.color) : meta.bg, padding: "2px 7px", borderRadius: 99, letterSpacing: "0.04em" }}>
                  <i className={`ti ${meta.icon}`} style={{ fontSize: 10 }} />{meta.label}
                </span>
                <EventAudience event={event} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-neutral-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</div>
              <div style={{ fontSize: 11, color: "var(--color-neutral-600)", marginTop: 2 }}>
                <i className="ti ti-calendar" style={{ fontSize: 10, marginRight: 3 }} />
                {formatDateRange(event.start_date, event.end_date)}
              </div>
              {event.description && (
                <div style={{ fontSize: 11, color: "var(--color-neutral-600)", marginTop: 4, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {event.description}
                </div>
              )}
            </div>
            {onEdit && <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <motion.button onClick={() => onEdit(event)} title="Edit"
                whileHover={{ scale: 1.1, backgroundColor: dark ? DARK_HOVER.bg : "#fff0f0", borderColor: dark ? DARK_HOVER.border : "#fca5a5" }}
                whileTap={{ scale: 0.9 }}
                style={{ width: 26, height: 26, border: "1px solid var(--color-neutral-300)", borderRadius: 7, background: "var(--color-surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-600)" }}>
                <i className="ti ti-pencil" style={{ fontSize: 12 }} />
              </motion.button>
              <motion.button onClick={() => onDelete(event)} title="Delete"
                whileHover={{ scale: 1.1, backgroundColor: dark ? DARK_HOVER.bg : "#fff0f0", borderColor: dark ? DARK_HOVER.border : "#fca5a5" }}
                whileTap={{ scale: 0.9 }}
                style={{ width: 26, height: 26, border: "1px solid var(--color-neutral-300)", borderRadius: 7, background: "var(--color-surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-500)" }}>
                <i className="ti ti-trash" style={{ fontSize: 12 }} />
              </motion.button>
            </div>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────

const EMPTY_FORM = { title: "", event_type: "holiday", start_date: "", end_date: "", description: "", grading_period: "", visible_to_guardians: true };
const LBL = { display: "block", fontSize: 11, fontWeight: 700, color: "var(--color-neutral-700)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 };
const INP = { width: "100%", border: "1.5px solid var(--color-brand-border-soft)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "var(--color-neutral-900)", background: "var(--color-neutral-100)", outline: "none", boxSizing: "border-box" };

const KIND_OPTIONS = [
  { value: "school", label: "School calendar", icon: "ti-school" },
  { value: "mine",   label: "Just me",         icon: "ti-lock" },
];

// Adds or edits a school event or one of your own. `canSchool`: whether this
// person may write the school calendar this year (an admin or the registrar,
// and the year not archived); everyone else adds their own events only.
function EventModal({ mode, initial, schoolYear, canSchool, onClose, onSaved }) {
  const [kind, setKind] = useState(mode === "edit" ? (initial.mine ? "mine" : "school") : (canSchool ? "school" : "mine"));
  const [form, setForm] = useState(mode === "edit"
    ? { title: initial.title, event_type: initial.mine ? EMPTY_FORM.event_type : initial.event_type, start_date: initial.start_date, end_date: initial.end_date, description: initial.description ?? "", grading_period: initial.grading_period ?? "", visible_to_guardians: initial.visible_to_guardians ?? true }
    : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const mine = kind === "mine";
  const selectedMeta = eventMeta(mine ? PERSONAL_TYPE : form.event_type);
  const isGradingPeriod = !mine && form.event_type === "grading_period";
  const dark = useTheme() === "dark";

  // Picking a quarter names the event after it, unless the title was typed by
  // hand — then it's left alone.
  function pickQuarter(value) {
    const label = GRADING_QUARTERS.find((q) => q.value === value)?.label;
    setForm((f) => ({
      ...f,
      grading_period: value,
      title: label && (!f.title.trim() || QUARTER_LABELS.has(f.title.trim())) ? label : f.title,
    }));
  }

  const { min: syMin, max: syMax } = yearBounds(schoolYear);

  async function handleSave() {
    if (isGradingPeriod && !form.grading_period) { setError("Choose which quarter this is."); return; }
    if (!form.title.trim())              { setError("Title is required."); return; }
    if (!form.start_date)                { setError("Start date is required."); return; }
    if (!form.end_date)                  { setError("End date is required."); return; }
    if (form.start_date > form.end_date) { setError("Start date must be on or before end date."); return; }
    if (form.start_date < syMin || form.end_date > syMax) {
      setError(`Dates must fall within S.Y. ${schoolYear} (${syMin} – ${syMax}).`);
      return;
    }
    setSaving(true); setError("");
    try {
      const common = { title: form.title.trim(), start_date: form.start_date, end_date: form.end_date, description: form.description.trim() || null };
      if (mine) {
        mode === "edit" ? await updatePersonalEvent(initial.event_id, common) : await createPersonalEvent(common);
      } else {
        const payload = {
          ...common, school_year: schoolYear, event_type: form.event_type,
          grading_period: isGradingPeriod ? form.grading_period : null,
          visible_to_guardians: !isGradingPeriod && form.visible_to_guardians,
        };
        mode === "edit" ? await updateEvent(initial.event_id, payload) : await createEvent(payload);
      }
      toast.success(mode === "edit" ? "Event updated." : "Event created.");
      onSaved(kind);
    } catch (e) {
      const msg = e.message || "Failed to save event.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      size="md"
      showClose
      loading={saving}
      className="text-left"
      footer={
        <div className="flex gap-2.5">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-[2]" onClick={handleSave} loading={saving} icon="ti-device-floppy">
            {saving ? "Saving…" : mode === "edit" ? "Save Changes" : "Add Event"}
          </Button>
        </div>
      }
    >
      {/* The chip takes the selected event type's colour, which is user-chosen
          hex from localStorage — a value, so it can't be a class. */}
      <ModalHeader
        icon={selectedMeta.icon}
        title={mode === "edit" ? (mine ? "Edit My Event" : "Edit Event") : (mine ? "Add My Event" : "Add New Event")}
        subtitle={mine ? "Only you can see this" : `S.Y. ${schoolYear}`}
        tint={{ background: dark ? DARK_EVENT_BG(selectedMeta.color) : selectedMeta.bg, color: dark ? DARK_EVENT_TEXT : selectedMeta.color, borderColor: `color-mix(in srgb, ${selectedMeta.color} 18.8%, transparent)` }}
      />

      <div className="flex flex-col gap-4">
          <AnimatePresence>
            {error && <Alert key="event-error" variant="error">{error}</Alert>}
          </AnimatePresence>

          {/* Which calendar: only someone who may write the school's is
              asked, and only when adding -- an event stays where it is. */}
          {mode === "create" && canSchool && (
            <div>
              <span style={LBL}>Add to</span>
              <SegmentedControl label="Add to" options={KIND_OPTIONS} value={kind} onChange={setKind} />
            </div>
          )}

          <div><label style={LBL}>Title *</label><input value={form.title} onChange={(e) => setF("title", e.target.value)} placeholder={mine ? "e.g. Dentist appointment" : "e.g. Independence Day"} style={INP} /></div>

          {/* Event type as visual pills */}
          {!mine && <div>
            <label style={LBL}>Event Type *</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {schoolEventTypes().map((t) => {
                const active = form.event_type === t.value;
                return (
                  <button key={t.value} type="button" onClick={() => setF("event_type", t.value)}
                    style={{
                      display: "flex", alignItems: "center", gap: 7, padding: "9px 10px",
                      borderRadius: 10, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                      outline: "none", appearance: "none", WebkitAppearance: "none",
                      borderStyle: "solid", borderWidth: "1.5px",
                      borderColor: active ? t.color : "var(--color-neutral-300)",
                      backgroundColor: active ? (dark ? DARK_EVENT_BG(t.color) : t.bg) : "var(--color-surface)",
                      transition: "background-color 0.15s ease, border-color 0.15s ease",
                    }}>
                    <i className={`ti ${t.icon}`} style={{ fontSize: 14, color: active ? (dark ? DARK_EVENT_TEXT : t.color) : "var(--color-neutral-500)", transition: "color 0.15s ease" }} />
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: active ? (dark ? DARK_EVENT_TEXT : t.color) : "var(--color-neutral-600)", transition: "color 0.15s ease" }}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>}

          {isGradingPeriod && (
            <div>
              <label htmlFor="event-grading-period" style={LBL}>Which quarter *</label>
              <select id="event-grading-period" value={form.grading_period} onChange={(e) => pickQuarter(e.target.value)} style={{ ...INP, cursor: "pointer" }}>
                <option value="">Choose a quarter…</option>
                {GRADING_QUARTERS.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
              </select>
              <div style={{ fontSize: 11.5, color: "var(--color-neutral-600)", marginTop: 6 }}>
                Set the first and last day of the quarter. The last day is when its grades are due.
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            <div><label style={LBL}>Start Date *</label><input type="date" value={form.start_date} min={syMin} max={syMax} onChange={(e) => setF("start_date", e.target.value)} style={INP} /></div>
            <div><label style={LBL}>End Date *</label><input type="date" value={form.end_date} min={syMin} max={syMax} onChange={(e) => setF("end_date", e.target.value)} style={INP} /></div>
          </div>

          <div><label style={LBL}>Description</label><textarea value={form.description} onChange={(e) => setF("description", e.target.value)} placeholder="Optional notes…" rows={3} style={{ ...INP, resize: "vertical" }} /></div>

          {/* Who sees a school event besides staff. A grading period is the
              teachers' grade deadline: never the families' (the server
              holds to that too). */}
          {!mine && (isGradingPeriod ? (
            <p className="flex items-center gap-2 text-xs text-neutral-600">
              <i className="ti ti-eye-off" aria-hidden="true" />
              Grading periods are for staff only. Guardians don&apos;t see them.
            </p>
          ) : (
            <ToggleCard
              icon="ti-users"
              title="Show on the guardian portal"
              description={form.visible_to_guardians ? "Guardians see this event." : "Staff only. Guardians won't see it."}
              checked={form.visible_to_guardians}
              onChange={(on) => setF("visible_to_guardians", on)}
            />
          ))}
        </div>

    </Modal>
  );
}

// ── Color Settings Modal ──────────────────────────────────────────────────────

function ColorSettingsModal({ onClose, onSaved }) {
  const [overrides, setOverrides] = useState(() => loadColorOverrides());
  const dark = useTheme() === "dark";

  const setColor = (value, color) => setOverrides((prev) => ({ ...prev, [value]: color }));
  const resetAll = () => setOverrides({});

  function handleSave() {
    applyColorOverrides(overrides);
    onSaved();
    onClose();
  }

  const preview = buildEventTypes(overrides);

  return (
    <Modal
      onClose={onClose}
      size="sm"
      showClose
      className="text-left"
      footer={
        <div className="flex items-center gap-2.5">
          <Button variant="secondary" size="sm" onClick={resetAll} icon="ti-refresh">
            Reset all
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} icon="ti-device-floppy">Apply</Button>
        </div>
      }
    >
      <ModalHeader
        icon="ti-palette"
        title="Event Colors"
        subtitle="Customize strip colors for each event type"
      />

      <div className="flex flex-col gap-3">
          {preview.map((t) => (
            <div key={t.value} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Live preview strip */}
              <div style={{ width: 32, height: 32, borderRadius: 9, background: dark ? DARK_EVENT_BG(t.color) : t.bg, border: `2px solid ${t.color}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <i className={`ti ${t.icon}`} style={{ fontSize: 14, color: dark ? DARK_EVENT_TEXT : t.color }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-neutral-900)" }}>{t.label}</div>
                <div style={{ fontSize: 11, color: "var(--color-neutral-500)", marginTop: 1 }}>
                  {/* Mini strip preview */}
                  <span style={{ display: "inline-block", background: dark ? DARK_EVENT_BG(t.color) : t.bg, borderLeft: `3px solid ${t.color}`, borderRadius: "3px 0 0 3px", padding: "1px 8px", fontSize: 11, color: dark ? DARK_EVENT_TEXT : t.color, fontWeight: 600 }}>
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
                  style={{ width: 36, height: 36, border: "1.5px solid var(--color-neutral-300)", borderRadius: 9, cursor: "pointer", padding: 2, background: "var(--color-surface)" }}
                  title={`Pick color for ${t.label}`}
                />
              </div>
              {/* Reset individual */}
              {overrides[t.value] && (
                <button
                  onClick={() => setOverrides((p) => { const n = { ...p }; delete n[t.value]; return n; })}
                  title="Reset to default"
                  style={{ width: 26, height: 26, border: "1px solid var(--color-neutral-300)", borderRadius: 7, background: "var(--color-surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-neutral-500)" }}>
                  <i className="ti ti-refresh" style={{ fontSize: 12 }} />
                </button>
              )}
            </div>
          ))}
        </div>

    </Modal>
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
  const dark = useTheme() === "dark";

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
    } catch {
      setError("Some holidays failed to import. Check your connection and try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      size="md"
      showClose={!importing}
      loading={importing}
      className="text-left"
      footer={
        done ? (
          <Button fullWidth onClick={() => { onImported(); onClose(); }}>
            Done
          </Button>
        ) : (
          <div className="flex gap-2.5">
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={importing}>
              Cancel
            </Button>
            <Button
              className="flex-[2]"
              onClick={handleImport}
              loading={importing}
              disabled={toAdd.length === 0}
              icon="ti-download"
            >
              {importing ? "Importing…" : `Import ${toAdd.length} Holiday${toAdd.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        )
      }
    >
      <ModalHeader
        icon="ti-flag"
        title="Import PH Holidays"
        subtitle={`Official Philippine public holidays · S.Y. ${schoolYear}`}
      />

      <div className="flex flex-col gap-3.5">

          {/* Success state */}
          {done ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0" }}>
              <div className={`bg-success-50 ${CHIP_GLOW.success}`} style={{ width: 52, height: 52, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="ti ti-circle-check" style={{ fontSize: 28, color: "var(--color-success-500)" }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-neutral-900)" }}>Import complete!</div>
              <div style={{ fontSize: 13, color: "var(--color-neutral-600)", textAlign: "center", lineHeight: 1.7 }}>
                <strong style={{ color: "var(--color-success-500)" }}>{added} holiday{added !== 1 ? "s" : ""}</strong> added to S.Y. {schoolYear}.
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div style={{ background: dark ? "var(--color-error-50)" : "#fef2f2", border: "1px solid var(--color-brand-300)", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: dark ? "var(--color-error-500)" : "#b91c1c", display: "flex", alignItems: "center", gap: 8 }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{error}
                </div>
              )}

              {/* Summary counts */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                <div style={{ background: "var(--color-success-50)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <i className="ti ti-circle-plus" style={{ fontSize: 20, color: "var(--color-success-500)" }} />
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "var(--color-success-500)" }}>{toAdd.length}</div>
                    <div style={{ fontSize: 11, color: dark ? "var(--color-success-500)" : "#3e7b1d", fontWeight: 600 }}>to be added</div>
                  </div>
                </div>
                <div style={{ background: dark ? "var(--color-neutral-200)" : "#f5eeee", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 20, color: "var(--color-neutral-600)" }} />
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "var(--color-neutral-600)" }}>{skipped.length}</div>
                    <div style={{ fontSize: 11, color: "var(--color-neutral-700)", fontWeight: 600 }}>already exist</div>
                  </div>
                </div>
              </div>

              {/* Holiday list preview */}
              {toAdd.length > 0 ? (
                <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-neutral-500)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>Will be added</div>
                  {toAdd.map((h) => (
                    <div key={h.date} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: dark ? "var(--color-brand-50)" : "#fff8f8", borderRadius: 9, border: "1px solid var(--color-brand-200)" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-brand-500)", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "var(--color-neutral-900)" }}>{h.title}</span>
                      <span style={{ fontSize: 11, color: "var(--color-neutral-500)", fontVariantNumeric: "tabular-nums" }}>{h.date}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: dark ? "var(--color-neutral-200)" : "#f5eeee", borderRadius: 12, padding: "16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 18, color: "var(--color-neutral-600)" }} />
                  <div style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>All holidays for S.Y. {schoolYear} are already in the calendar.</div>
                </div>
              )}
            </>
          )}
        </div>

    </Modal>
  );
}

// ── Delete Modal ──────────────────────────────────────────────────────────────

function DeleteModal({ event, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const meta = eventMeta(event.event_type);
  const dark = useTheme() === "dark";
  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      await onConfirm();
    } catch (e) {
      const msg = e.message || "Delete failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ConfirmModal
      icon="ti-trash"
      title="Delete event?"
      message={
        <>
          <div style={{ background: dark ? DARK_EVENT_BG(meta.color) : meta.bg, border: `1px solid color-mix(in srgb, ${meta.color} 15.7%, transparent)`, borderRadius: 10, padding: "10px 14px", width: "100%", display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <i className={`ti ${meta.icon}`} style={{ fontSize: 14, color: dark ? DARK_EVENT_TEXT : meta.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: dark ? DARK_EVENT_TEXT : meta.color }}>{event.title}</span>
          </div>
          This event will be permanently removed from the calendar. This action cannot be undone.
        </>
      }
      loading={deleting}
      error={error}
      onConfirm={handleDelete}
      onCancel={onCancel}
    />
  );
}

// ── Events List (grouped, filtered) ──────────────────────────────────────────

// `canChange(ev)`: whether this person may edit or delete that event.
function EventsList({ events, loading, schoolYear: _schoolYear, onEdit, onDelete, canChange, onJumpMonth }) { // eslint-disable-line no-unused-vars
  const [search,      setSearch]      = useState("");
  const [filterType,  setFilterType]  = useState("all");
  const [collapsed,   setCollapsed]   = useState({});
  const dark = useTheme() === "dark";

  const filtered = events.filter((ev) => {
    const matchType   = filterType === "all" || ev.event_type === filterType;
    const matchSearch = !search || ev.title.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  // Group by every month the event spans (not just start_date month), so a
  // multi-day event that crosses a month boundary appears in both months.
  const groups = {};
  for (const ev of filtered) {
    const start = parseLocalDate(ev.start_date);
    const end   = parseLocalDate(ev.end_date);
    const seen  = new Set();
    const cur   = new Date(start);
    while (cur <= end) {
      const monthKey = cur.getMonth(); // 0-indexed
      if (!seen.has(monthKey)) {
        seen.add(monthKey);
        if (!groups[monthKey]) groups[monthKey] = [];
        groups[monthKey].push(ev);
      }
      // Jump to the 1st of the next month to avoid iterating every day
      cur.setMonth(cur.getMonth() + 1, 1);
    }
  }
  const sortedMonths = Object.keys(groups).map(Number).sort((a, b) => a - b);

  function toggleMonth(m) {
    setCollapsed((c) => ({ ...c, [m]: !c[m] }));
  }

  return (
    <section aria-label="All events" className={`border border-[#f0e6e6] bg-surface shadow-[0_2px_10px_rgba(224,49,49,0.05)] dark:border-neutral-200 ${CARD_DARK}`} style={{ borderRadius: 14, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div className="bg-[linear-gradient(135deg,#fff5f5,white)] dark:bg-[linear-gradient(135deg,var(--color-brand-50),var(--color-surface))]" style={{ padding: "13px 14px 10px", borderBottom: "1px solid var(--color-neutral-200)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-neutral-900)" }}>All Events</div>
          <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{filtered.length} / {events.length}</span>
        </div>

        {/* Search */}
        <div className="search-wrap" style={{ display: "flex", alignItems: "center", gap: 6, border: "1.5px solid var(--color-neutral-300)", borderRadius: 8, padding: "5px 10px", background: "var(--color-neutral-100)", marginBottom: 7 }}>
          <i className="ti ti-search" style={{ fontSize: 12, color: "var(--color-neutral-500)", flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events…"
            style={{ border: "none", outline: "none", fontSize: 12, color: "var(--color-neutral-900)", background: "transparent", width: "100%", fontFamily: "'DM Sans',sans-serif" }}
          />
          <AnimatePresence>
            {search && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                onClick={() => setSearch("")}
                aria-label="Clear search"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-neutral-500)", padding: 0, display: "flex" }}>
                <i className="ti ti-x" style={{ fontSize: 11 }} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Type filter pills */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button
            onClick={() => setFilterType("all")}
            style={{ height: 22, padding: "0 8px", borderRadius: 99, border: `1.5px solid ${filterType === "all" ? "var(--color-brand-500)" : "var(--color-neutral-300)"}`, background: filterType === "all" ? "var(--color-brand-100)" : "var(--color-surface)", fontSize: 11, color: filterType === "all" ? "var(--color-brand-600)" : "var(--color-neutral-600)", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: filterType === "all" ? 700 : 500 }}>
            All
          </button>
          {EVENT_TYPES.map((t) => {
            const active = filterType === t.value;
            const count  = events.filter((e) => e.event_type === t.value).length;
            if (count === 0) return null;
            return (
              <button key={t.value} onClick={() => setFilterType(active ? "all" : t.value)}
                style={{ height: 22, padding: "0 8px", borderRadius: 99, border: `1.5px solid ${active ? t.color : "var(--color-neutral-300)"}`, background: active ? (dark ? DARK_EVENT_BG(t.color) : t.bg) : "var(--color-surface)", fontSize: 11, color: active ? (dark ? DARK_EVENT_TEXT : t.color) : "var(--color-neutral-600)", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: active ? 700 : 500, display: "flex", alignItems: "center", gap: 4 }}>
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
            <i className="ti ti-calendar-off" style={{ fontSize: 26, color: "var(--color-neutral-500)" }} />
            <div style={{ fontSize: 12, color: "var(--color-neutral-500)", textAlign: "center", lineHeight: 1.6 }}>
              {events.length === 0
                ? (onEdit ? <>No events yet.<br />Click <strong>Add Event</strong> to get started.</> : "No events this year.")
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
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--color-brand-50)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ""; }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", borderBottom: dark ? "1px solid var(--color-neutral-200)" : "1px solid #faf0f0", transition: "background-color 0.12s ease" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-neutral-500)", letterSpacing: "0.07em", textTransform: "uppercase", flex: 1, textAlign: "left" }}>
                    {MONTHS[m]}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-neutral-500)", fontWeight: 600 }}>{monthEvs.length}</span>
                  <motion.i
                    animate={{ rotate: isCollapsed ? 0 : 180 }}
                    transition={{ duration: 0.18 }}
                    className="ti ti-chevron-down"
                    style={{ fontSize: 11, color: "var(--color-neutral-500)" }}
                  />
                </button>

                {/* Event rows */}
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      {monthEvs.map((ev) => {
                        const meta = eventMeta(ev.event_type);
                        return (
                          <div key={ev.uid}
                            style={{ display: "flex", alignItems: "center", gap: 0, borderBottom: dark ? "1px solid var(--color-neutral-200)" : "1px solid #faf5f5", transition: "background-color 0.12s ease" }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--color-brand-50)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ""; }}>
                            <div style={{ width: 3, alignSelf: "stretch", background: meta.color, flexShrink: 0 }} />
                            <div style={{ flex: 1, padding: "7px 10px", minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-neutral-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: dark ? DARK_EVENT_TEXT : meta.color, background: dark ? DARK_EVENT_BG(meta.color) : meta.bg, padding: "1px 6px", borderRadius: 99 }}>{meta.label}</span>
                                <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{formatDateRange(ev.start_date, ev.end_date)}</span>
                              </div>
                            </div>
                            {onEdit && canChange(ev) && <div style={{ display: "flex", gap: 3, padding: "0 8px", flexShrink: 0 }}>
                              <button onClick={() => onEdit(ev)} title="Edit"
                                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-brand-100)"; e.currentTarget.style.color = "var(--color-brand-600)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-surface)"; e.currentTarget.style.color = "var(--color-neutral-600)"; }}
                                style={{ width: 24, height: 24, border: "1px solid var(--color-neutral-300)", borderRadius: 6, background: "var(--color-surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-600)", transition: "background-color 0.12s ease, color 0.12s ease" }}>
                                <i className="ti ti-pencil" style={{ fontSize: 11 }} />
                              </button>
                              <button onClick={() => onDelete(ev)} title="Delete"
                                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-brand-100)"; e.currentTarget.style.color = "var(--color-brand-600)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-surface)"; e.currentTarget.style.color = "var(--color-neutral-500)"; }}
                                style={{ width: 24, height: 24, border: "1px solid var(--color-neutral-300)", borderRadius: 6, background: "var(--color-surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-500)", transition: "background-color 0.12s ease, color 0.12s ease" }}>
                                <i className="ti ti-trash" style={{ fontSize: 11 }} />
                              </button>
                            </div>}
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </section>
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
      <div style={{ fontSize: 10, color: "#8a6a6a", textAlign: "right" }}>
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
              <span style={{ fontSize: 12, fontWeight: 700, color: "#c92a2a" }}>{month} {monthYear}</span>
              <span style={{ fontSize: 10, color: "#8a6a6a" }}>{monthEvs.length} event{monthEvs.length !== 1 ? "s" : ""}</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
              <thead>
                <tr style={{ background: "#fdf8f8" }}>
                  {["Date", "Event", "Type", "Description"].map((h) => (
                    <th key={h} style={{ padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #f0e4e4", color: "#855c5c", fontWeight: 700, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthEvs.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: "6px 8px", color: "#8a6a6a", fontStyle: "italic", fontSize: 10 }}>No events this month</td></tr>
                ) : monthEvs.map((ev) => {
                  const meta = eventMeta(ev.event_type);
                  return (
                    <tr key={ev.event_id} style={{ borderBottom: "1px solid #faf0f0" }}>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap", color: "#5a3a3a", fontVariantNumeric: "tabular-nums" }}>{formatDateRange(ev.start_date, ev.end_date)}</td>
                      <td style={{ padding: "5px 8px", fontWeight: 600 }}>{ev.title}</td>
                      <td style={{ padding: "5px 8px" }}>
                        <span style={{ background: meta.bg, color: meta.color, borderLeft: `3px solid ${meta.color}`, padding: "2px 7px", borderRadius: "0 3px 3px 0", fontSize: 9.5, fontWeight: 700 }}>{meta.label}</span>
                      </td>
                      <td style={{ padding: "5px 8px", color: "#855c5c", fontSize: 10 }}>{ev.description ?? ""}</td>
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
        {schoolEventTypes().map((t) => (
          <div key={t.value} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: t.bg, border: `1.5px solid ${t.color}` }} />
            <span style={{ fontSize: 9.5, color: "#855c5c" }}>{t.label}</span>
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
            <div style={{ fontSize: 18, fontWeight: 700, color: "#c92a2a", marginBottom: 10 }}>{month} {monthYear}</div>

            {/* Mini calendar grid */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14, tableLayout: "fixed" }}>
              <thead>
                <tr>
                  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => (
                    <th key={d} style={{ padding: "4px 0", textAlign: "center", fontSize: 9, fontWeight: 700, color: i === 0 || i === 6 ? "#a32d2d" : "#8a6a6a", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f0e4e4" }}>{d}</th>
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
                          <div style={{ fontSize: 10, fontWeight: dayEvs.length ? 700 : 400, color: isWeekend ? "#8a6a6a" : "#2a1a1a", marginBottom: 2 }}>{day}</div>
                          {dayEvs.slice(0, 2).map((ev) => {
                            const meta = eventMeta(ev.event_type);
                            const isStart = ev.start_date === k;
                            return (
                              <div key={ev.event_id} style={{ fontSize: 8, background: meta.bg, color: meta.color, borderLeft: `2px solid ${meta.color}`, padding: "1px 3px", marginBottom: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", borderRadius: "0 2px 2px 0" }}>
                                {isStart ? ev.title : ""}
                              </div>
                            );
                          })}
                          {dayEvs.length > 2 && <div style={{ fontSize: 7.5, color: "#8a6a6a" }}>+{dayEvs.length - 2}</div>}
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
                <div style={{ fontSize: 9.5, fontWeight: 700, color: "#8a6a6a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Events This Month</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {monthEvs.map((ev) => {
                    const meta = eventMeta(ev.event_type);
                    return (
                      <div key={ev.event_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: meta.bg, borderLeft: `3px solid ${meta.color}`, borderRadius: "0 5px 5px 0" }}>
                        <span style={{ fontSize: 9.5, fontVariantNumeric: "tabular-nums", color: "#7a5050", whiteSpace: "nowrap" }}>{formatDateRange(ev.start_date, ev.end_date)}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: meta.color, flex: 1 }}>{ev.title}</span>
                        {ev.description && <span style={{ fontSize: 9, color: "#855c5c", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: 180 }}>{ev.description}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Legend on last month */}
            {mi === 11 && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", borderTop: "1px solid #f0e4e4", paddingTop: 8, marginTop: 10 }}>
                {schoolEventTypes().map((t) => (
                  <div key={t.value} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 9, height: 9, borderRadius: 2, background: t.bg, border: `1.5px solid ${t.color}` }} />
                    <span style={{ fontSize: 9, color: "#855c5c" }}>{t.label}</span>
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
  const dark = useTheme() === "dark";
  return (
    <div className={`border border-[#f0e6e6] bg-surface shadow-[0_2px_10px_rgba(224,49,49,0.05)] dark:border-neutral-200 ${CARD_DARK}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, marginTop: 4 }}>
      <i className="ti ti-printer" style={{ fontSize: 15, color: "var(--color-neutral-500)" }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-neutral-600)" }}>Export</span>
      <div style={{ width: 1, height: 18, background: "var(--color-neutral-300)" }} />

      {/* View toggle */}
      <div style={{ display: "flex", background: dark ? "var(--color-neutral-100)" : "#fdf8f8", borderRadius: 8, padding: 3, gap: 2 }}>
        {[
          { value: "list",  label: "Full Year List",  icon: "ti-list" },
          { value: "month", label: "Monthly Sheets",  icon: "ti-layout-grid" },
        ].map((opt) => (
          <button key={opt.value} onClick={() => setPrintView(opt.value)}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px", borderRadius: 6, border: "none", background: printView === opt.value ? "var(--color-surface-raised)" : "transparent", fontSize: 11.5, fontWeight: printView === opt.value ? 700 : 500, color: printView === opt.value ? "var(--color-brand-600)" : "var(--color-neutral-600)", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: printView === opt.value ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.1s" }}>
            <i className={`ti ${opt.icon}`} style={{ fontSize: 13 }} />{opt.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* CSV */}
      <motion.button onClick={onExportCSV}
        whileHover={{ borderColor: dark ? DARK_HOVER.border : "#fca5a5", color: dark ? DARK_HOVER.text : "#c92a2a", background: dark ? DARK_HOVER.soft : "#fff8f8" }}
        whileTap={{ scale: 0.96 }}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", border: "1.5px solid var(--color-neutral-300)", borderRadius: 9, background: "var(--color-surface)", fontSize: 12, fontWeight: 600, color: "var(--color-neutral-600)", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
        <i className="ti ti-table-export" style={{ fontSize: 14 }} />Download CSV
      </motion.button>

      {/* Print */}
      <motion.button onClick={onPrint}
        whileHover={{ scale: 1.02, boxShadow: "0 6px 18px rgba(224,49,49,0.36)" }}
        whileTap={{ scale: 0.96 }}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 16px", border: "none", borderRadius: 9, background: "linear-gradient(135deg,var(--color-action),var(--color-action-2))", fontSize: 12, fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 14px rgba(224,49,49,0.28)" }}>
        <i className="ti ti-printer" style={{ fontSize: 14 }} />Print / PDF
      </motion.button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AcademicCalendarPage() {
  usePageTitle("Academic Calendar");
  const navigate = useNavigate();
  const { options: SCHOOL_YEARS } = useSchoolYear();
  // A calendar is always one school year: its date bounds, month grid and
  // print headers are all derived from it.
  const [schoolYear,  setSchoolYear]  = useYearFilter({ allowAll: false });
  // An archived year's calendar can be read, not changed.
  const isArchived = useArchivedYears();
  const readOnly = isArchived(schoolYear);
  // The school's events are an admin's or the registrar's to change (the
  // server says the same); everyone keeps their own, archived year or not.
  const user = useCurrentUser();
  const schoolEditable = ACADEMIC_STAFF.includes(user?.role) && !readOnly;
  const canChange = (ev) => ev.mine || schoolEditable;
  const [events,      setEvents]      = useState([]);
  const [mine,        setMine]        = useState([]);
  const [showMine,    setShowMineState] = useState(() => readShowMine(user));
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
  const dark = useTheme() === "dark";

  const [animated] = useState(false);
  const ifr = !animated; // isFirstRender — entrance animations run only once

  const [syYear, syYear2] = schoolYear.split("-").map(Number);
  // PH school year: Jul–Dec belong to Y1, Jan–Jun belong to Y2
  const activeMonthYear = activeMonth >= 6 ? syYear : syYear2;

  function setShowMine(on) {
    setShowMineState(on);
    writeShowMine(user, on);
  }

  const fetchEvents = useCallback(async (sy) => {
    setLoading(true); setError("");
    const rows = (data) => (Array.isArray(data) ? data : (data?.results ?? []));
    // Your own events load beside the school's; one failing doesn't hide
    // the other.
    getMine(sy).then((data) => setMine(rows(data))).catch(() => {
      setMine([]);
      setError((e) => e || "Your own events couldn't be loaded.");
    });
    try {
      const data = await getEvents(sy);
      setEvents(rows(data));

      // Reading the calendar does not write to it.
      //
      // This used to silently import the PH holiday list whenever a school
      // year had none -- up to eighteen sequential POSTs fired from a page
      // load, inside a bare catch, on a route open to every staff role. It
      // had no idempotency key, so two people opening the page at once both
      // saw "no holidays" and both inserted, and a permission failure was
      // invisible because the catch swallowed it.
      //
      // Nothing is lost by removing it: the "PH Holidays" button in the
      // header opens ImportHolidaysModal, which does the same import
      // explicitly, shows what it is about to add, and lets the registrar
      // decide. That is the same feature, asked for rather than assumed.
    } catch { setError("Failed to load calendar events."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchEvents(schoolYear); // eslint-disable-line react-hooks/set-state-in-effect
    getSchoolSettings().then(setSchoolSettings).catch(() => {});
  }, [schoolYear, fetchEvents, navigate]);

  // What the grid, the day panel and the list show: the school's events and,
  // with My events on, your own. Print, CSV and the holiday import stay on
  // `events`, the school's alone.
  const items         = calendarItems(events, showMine ? mine : []);
  const eventMap      = buildEventMap(items);
  const uniqueForDay  = selectedDay
    ? (eventMap[selectedDay] ?? []).filter((ev, i, arr) => arr.findIndex((x) => x.uid === ev.uid) === i)
    : [];

  function handleSaved(kind) {
    setModal(null);
    // A new event of your own shouldn't vanish into a hidden layer.
    if (kind === "mine" && !showMine) setShowMine(true);
    fetchEvents(schoolYear);
  }
  async function handleDeleteConfirm() { await removeEvent(toDelete); toast.success("Event deleted."); setToDelete(null); setSelectedDay(null); fetchEvents(schoolYear); }

  function handlePrint() {
    window.print();
  }

  let selectedLabel = null;
  if (selectedDay) {
    const [sy, sm, sd] = selectedDay.split("-").map(Number);
    selectedLabel = `${MONTHS[sm - 1]} ${sd}, ${sy}`;
  }

  // Count events per type for stats bar
  const typeCounts = EVENT_TYPES.map((t) => ({ ...t, count: items.filter((e) => e.event_type === t.value).length })).filter((t) => t.count > 0);

  return (
    <>
    <>
      <style>{`
        #cal-print-portal { display: none; }
        @media print {
          @page { margin: 14mm 12mm; size: A4 portrait; }
          html, body { height: auto !important; overflow: visible !important; background: white !important; }
          body > *:not(#cal-print-portal) { display: none !important; visibility: hidden !important; }
          #cal-print-portal { display: block !important; position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; background: white !important; }
        }
      `}</style>

      <PageHeader
        title="Academic Calendar"
        icon="ti-calendar-event"
        subtitle={`S.Y. ${schoolYear} · ${events.length} events${showMine && mine.length ? ` · ${mine.length} of yours` : ""}`}
        actions={
          <>
            <ChipGroup
              label="School year"
              size="sm"
              options={SCHOOL_YEARS.map((sy) => ({ value: sy, label: sy }))}
              value={schoolYear}
              onChange={(sy) => { setSchoolYear(sy); setSelectedDay(null); }}
            />
            <span className="h-5 w-px bg-neutral-300" aria-hidden="true" />
            <TogglePill
              checked={showMine}
              onChange={setShowMine}
              iconOn="ti-user-check"
              iconOff="ti-user-off"
              labelOn="My events"
              labelOff="My events"
            />
            {schoolEditable && (
              <Button variant="secondary" icon="ti-flag" onClick={() => setShowImport(true)}>
                PH Holidays
              </Button>
            )}
            <Button
              variant="secondary" iconOnly icon="ti-palette"
              title="Customize event colors" aria-label="Customize event colors"
              onClick={() => setShowColors(true)}
            />
            {/* Open to everyone: who may only keep their own events adds those
                (EventModal asks the rest which calendar). */}
            <Button icon="ti-plus" onClick={() => setModal({ mode: "create" })}>
              Add Event
            </Button>
          </>
        }
      />

      {/* ── Error ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            style={{ margin: "14px 24px 0", background: dark ? "var(--color-error-50)" : "#fef2f2", border: "1px solid var(--color-brand-300)", borderRadius: 10, padding: "11px 16px", fontSize: 13, color: dark ? "var(--color-error-500)" : "#b91c1c", display: "flex", alignItems: "center", gap: 8 }}
          >
            <i className="ti ti-alert-circle" style={{ fontSize: 15 }} />{error}
            <button onClick={() => setError("")} aria-label="Dismiss error" style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: dark ? "var(--color-error-500)" : "#b91c1c" }}><i className="ti ti-x" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <ArchivedYearNotice schoolYear={schoolYear} records="calendar events" className="mx-6 mt-3.5" />

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 24px", display: "flex", gap: 18, minHeight: 0 }}>

        {/* ── Left: Calendar ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Month nav bar */}
          <motion.div
            initial={ifr ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: "easeOut" }}
            className={`border border-[#f0e6e6] bg-surface shadow-[0_2px_10px_rgba(224,49,49,0.05)] dark:border-neutral-200 ${CARD_DARK}`}
            style={{ borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}
          >
            <motion.button
              whileHover={{ background: dark ? DARK_HOVER.bg : "#fff0f0", color: dark ? DARK_HOVER.text : "#c92a2a", borderColor: dark ? DARK_HOVER.border : "#fca5a5" }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setActiveMonth((m) => (m - 1 + 12) % 12)}
              aria-label="Previous month"
              style={{ width: 30, height: 30, border: "1px solid var(--color-neutral-300)", borderRadius: 8, background: "var(--color-surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-600)" }}>
              <i className="ti ti-chevron-left" style={{ fontSize: 15 }} />
            </motion.button>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeMonth}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                style={{ fontSize: 16, fontWeight: 700, color: "var(--color-neutral-900)", minWidth: 148, textAlign: "center" }}
              >
                {MONTHS[activeMonth]} <span style={{ color: "var(--color-neutral-500)", fontWeight: 500 }}>{activeMonthYear}</span>
              </motion.div>
            </AnimatePresence>
            <motion.button
              whileHover={{ background: dark ? DARK_HOVER.bg : "#fff0f0", color: dark ? DARK_HOVER.text : "#c92a2a", borderColor: dark ? DARK_HOVER.border : "#fca5a5" }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setActiveMonth((m) => (m + 1) % 12)}
              aria-label="Next month"
              style={{ width: 30, height: 30, border: "1px solid var(--color-neutral-300)", borderRadius: 8, background: "var(--color-surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-600)" }}>
              <i className="ti ti-chevron-right" style={{ fontSize: 15 }} />
            </motion.button>
            <div style={{ width: 1, height: 20, background: "var(--color-neutral-300)", margin: "0 6px" }} />
            {/* Month pills */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {MONTHS.map((m, i) => {
                const active = i === activeMonth;
                return (
                  <motion.button key={m}
                    onClick={() => setActiveMonth(i)}
                    whileTap={{ scale: 0.92 }}
                    style={{
                      height: 26, padding: "0 9px", borderRadius: 99, cursor: "pointer",
                      border: `1.5px solid ${active ? "var(--color-brand-500)" : "var(--color-neutral-300)"}`,
                      background: active ? "var(--color-brand-100)" : "var(--color-surface)",
                      fontSize: 11, color: active ? "var(--color-brand-600)" : "var(--color-neutral-600)",
                      fontFamily: "'DM Sans',sans-serif", fontWeight: active ? 700 : 500,
                      transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                    }}>
                    {m.slice(0, 3)}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>

          {/* Calendar grid */}
          {loading ? <Sk h={480} r={18} /> : (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeMonth}-${colorVersion}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <MonthGrid
                  year={activeMonthYear}
                  monthIndex={activeMonth}
                  eventMap={eventMap}
                  selectedDay={selectedDay}
                  onSelectDay={setSelectedDay}
                />
              </motion.div>
            </AnimatePresence>
          )}

          {/* Legend */}
          <motion.div
            initial={ifr ? { opacity: 0 } : false} animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: ifr ? 0.15 : 0 }}
            style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "2px 0" }}
          >
            {(showMine ? EVENT_TYPES : schoolEventTypes()).map((t) => (
              <div key={t.value} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: dark ? DARK_EVENT_BG(t.color) : t.bg, border: `1.5px solid color-mix(in srgb, ${t.color} 37.6%, transparent)` }} />
                <span style={{ fontSize: 11, color: "var(--color-neutral-600)", fontWeight: 500 }}>{t.label}</span>
              </div>
            ))}
          </motion.div>

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
          <AnimatePresence>
            {!loading && typeCounts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.26, ease: "easeOut" }}
                className={`border border-[#f0e6e6] bg-surface shadow-[0_2px_10px_rgba(224,49,49,0.05)] dark:border-neutral-200 ${CARD_DARK}`}
                style={{ borderRadius: 14, padding: "14px 16px" }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-neutral-500)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>This Year</div>
                <motion.div
                  variants={listVariants.container} initial={ifr ? "hidden" : false} animate="visible"
                  style={{ display: "flex", flexDirection: "column", gap: 7 }}
                >
                  {typeCounts.map((t) => (
                    <motion.div key={t.value} variants={listVariants.item} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: dark ? DARK_EVENT_BG(t.color) : t.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <i className={`ti ${t.icon}`} style={{ fontSize: 13, color: dark ? DARK_EVENT_TEXT : t.color }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: dark ? "var(--color-neutral-800)" : "#3a2020" }}>{t.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: dark ? "var(--color-neutral-900)" : t.color }}>{t.count}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 99, background: "var(--color-neutral-200)", overflow: "hidden" }}>
                          <motion.div
                            initial={ifr ? { width: 0 } : false}
                            animate={{ width: `${Math.min(100, (t.count / items.length) * 100)}%` }}
                            transition={{ duration: 0.6, ease: "easeOut", delay: ifr ? 0.1 : 0 }}
                            style={{ height: "100%", background: t.color, borderRadius: 99 }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Selected day panel */}
          <AnimatePresence mode="wait">
            {selectedDay ? (
              <motion.div
                key="selected"
                initial={{ opacity: 0, scale: 0.97, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 6 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={`border border-[#f0e6e6] bg-surface shadow-[0_2px_10px_rgba(224,49,49,0.05)] dark:border-neutral-200 ${CARD_DARK}`}
                style={{ borderRadius: 14, overflow: "hidden" }}
              >
                <div className="bg-[linear-gradient(135deg,#fff5f5,white)] dark:bg-[linear-gradient(135deg,var(--color-brand-50),var(--color-surface))]" style={{ padding: "13px 16px", borderBottom: "1px solid var(--color-neutral-200)", display: "flex", alignItems: "center", gap: 10 }}>
                  <div className={`bg-brand-100 ${CHIP_GLOW.brand}`} style={{ width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ti ti-calendar" style={{ fontSize: 15, color: "var(--color-brand-600)" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-neutral-900)" }}>{selectedLabel}</div>
                    <div style={{ fontSize: 11, color: "var(--color-neutral-500)", marginTop: 1 }}>{uniqueForDay.length} event{uniqueForDay.length !== 1 ? "s" : ""}</div>
                  </div>
                  <motion.button onClick={() => setSelectedDay(null)} aria-label="Close this day's events"
                    whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-neutral-500)" }}>
                    <i className="ti ti-x" style={{ fontSize: 15 }} />
                  </motion.button>
                </div>
                <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7, maxHeight: 280, overflowY: "auto" }}>
                  {uniqueForDay.length === 0
                    ? <div style={{ fontSize: 12, color: "var(--color-neutral-500)", textAlign: "center", padding: "16px 0" }}>No events on this day.</div>
                    : uniqueForDay.map((ev) => (
                      <EventCard key={ev.uid} event={ev}
                        onEdit={canChange(ev) ? (e) => setModal({ mode: "edit", event: e }) : null}
                        onDelete={canChange(ev) ? setToDelete : null} />
                    ))
                  }
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className={`border border-[#f0e6e6] bg-surface shadow-[0_2px_10px_rgba(224,49,49,0.05)] dark:border-neutral-200 ${CARD_DARK}`}
                style={{ borderRadius: 14, padding: "22px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
              >
                <div className={`bg-brand-100 ${CHIP_GLOW.brand}`} style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className="ti ti-calendar-search" style={{ fontSize: 22, color: "var(--color-neutral-500)" }} />
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-neutral-500)" }}>No date selected</div>
                <div style={{ fontSize: 11, color: "var(--color-neutral-500)", textAlign: "center", lineHeight: 1.6 }}>Click any date on the calendar to view its events</div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* All events list */}
          <EventsList
            events={items}
            loading={loading}
            schoolYear={schoolYear}
            onEdit={(e) => setModal({ mode: "edit", event: e })}
            onDelete={setToDelete}
            canChange={canChange}
            onJumpMonth={(m) => setActiveMonth(m)}
          />
        </div>
      </div>

      <AnimatePresence>
        {modal && <EventModal key="event-modal" mode={modal.mode} initial={modal.event ?? null} schoolYear={schoolYear} canSchool={schoolEditable} onClose={() => setModal(null)} onSaved={handleSaved} />}
      </AnimatePresence>
      <AnimatePresence>
        {toDelete && <DeleteModal key="delete-modal" event={toDelete} onConfirm={handleDeleteConfirm} onCancel={() => setToDelete(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showImport && <ImportHolidaysModal key="import-modal" schoolYear={schoolYear} existingEvents={events} onClose={() => setShowImport(false)} onImported={() => fetchEvents(schoolYear)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showColors && <ColorSettingsModal key="colors-modal" onClose={() => setShowColors(false)} onSaved={() => setColorVersion((v) => v + 1)} />}
      </AnimatePresence>

    </>
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
