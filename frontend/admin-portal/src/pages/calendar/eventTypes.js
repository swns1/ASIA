// The calendar's event types: label, icon and colour, with each person's
// colour picks (Event Colors, kept in this browser). Shared by the Academic
// Calendar, the guardian's School calendar and their month grid (MonthGrid.jsx).
//
// "personal" is not a school event type: it marks a staff member's own events
// (the personal-events API), which only they see. The school event form
// offers SCHOOL_EVENT_TYPES.

export const PERSONAL_TYPE = "personal";

const EVENT_TYPE_DEFAULTS = [
  { value: "holiday",        label: "Holiday",       color: "#c92a2a", icon: "ti-flag" },
  { value: "exam",           label: "Exam",          color: "#1455a0", icon: "ti-writing" },
  { value: "enrollment",     label: "Enrollment",    color: "#2e6b0d", icon: "ti-clipboard-list" },
  { value: "quarter_break",  label: "Quarter Break", color: "#7c3aed", icon: "ti-calendar-pause" },
  { value: "school_day_off", label: "No Classes",    color: "#854f0b", icon: "ti-school-off" },
  { value: "event",          label: "Event",         color: "#a3266b", icon: "ti-star" },
  { value: "grading_period", label: "Grading Period", color: "#0b6e63", icon: "ti-report-analytics" },
  { value: "other",          label: "Other",         color: "#855c5c", icon: "ti-calendar" },
  { value: PERSONAL_TYPE,    label: "My Event",      color: "#3949ab", icon: "ti-user" },
];

const COLOR_STORAGE_KEY = "cal_event_colors";

export function loadColorOverrides() {
  try { return JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) ?? "{}"); }
  catch { return {}; }
}

function saveColorOverrides(overrides) {
  try { localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(overrides)); }
  catch { /* a blocked store keeps the colours for this visit only */ }
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

// Dark mode. The tints above are mixed toward white, pastels that would glare
// on the dark planes, so in dark an event colour is mixed toward transparent
// instead. The colour stays on the marks (edges, dots, bars). As text or an
// icon it can't be trusted: it's user-chosen, and even the defaults measure
// 2.2–3.6:1 on the dark surface, so in dark its labels and icons take a token.
export const DARK_EVENT_BG    = (c) => `color-mix(in srgb, ${c} 18.8%, transparent)`;
export const DARK_EVENT_LIGHT = (c) => `color-mix(in srgb, ${c} 13.3%, transparent)`;
export const DARK_EVENT_TEXT  = "var(--color-neutral-800)";

export function buildEventTypes(overrides) {
  return EVENT_TYPE_DEFAULTS.map((t) => {
    const color = overrides[t.value] ?? t.color;
    const { bg, light } = hexToTints(color);
    return { ...t, color, bg, light };
  });
}

// Module-level reactive event types — updated when colors change. An ES
// module export is a live binding, so importers see the new list.
export let EVENT_TYPES = buildEventTypes(loadColorOverrides());

/** Save the picks from Event Colors and apply them everywhere. */
export function applyColorOverrides(overrides) {
  saveColorOverrides(overrides);
  EVENT_TYPES = buildEventTypes(overrides);
}

/** The types a school event can be: every one but a person's own. */
export const schoolEventTypes = () => EVENT_TYPES.filter((t) => t.value !== PERSONAL_TYPE);

export function eventMeta(type) {
  return EVENT_TYPES.find((t) => t.value === type) ?? EVENT_TYPES.find((t) => t.value === "other");
}
