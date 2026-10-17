// grading.js
//
// Shared grading-period helpers, generalized from near-identical copies in
// SF9PrintPage.jsx and SF10PrintPage.jsx. Those files
// each keyed their period config as Nursery/Kindergarten/Elementary/JHS/SHS,
// which never matched the real Enrollment.school_level values
// (nursery/kindergarten/elementary/junior_highschool/senior_highschool) — every
// lookup silently fell back to the Elementary/quarterly config. LEVEL_CONFIG
// here is keyed correctly.

// Nursery and Kindergarten run on the same four quarters as Elementary.
//
// They used to declare a period literally named "annual", which does not exist:
// Grade.GRADING_PERIOD_CHOICES has only the four quarters and two semesters, so
// nothing could ever be stored under it. Both places a teacher actually enters
// an early-years grade -- GradesPage and TeacherSectionsPage -- write quarters.
// The SF9 and SF10 print pages read it with `cfg.periods.map(p => sg[p] ??
// null)`; `sg["annual"]` was always undefined, so every subject, every grade
// cell, the Final column and the General Average printed as an em dash on a
// Kindergarten report card even with all four quarters encoded. (Both forms
// are drawn by the server now, school_forms/sf9.py and sf10.py.)
export const LEVEL_CONFIG = {
  nursery:           { type: "quarterly", periods: ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"],  cols: ["Q1","Q2","Q3","Q4"] },
  kindergarten:      { type: "quarterly", periods: ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"],  cols: ["Q1","Q2","Q3","Q4"] },
  elementary:        { type: "quarterly", periods: ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"],  cols: ["Q1","Q2","Q3","Q4"] },
  junior_highschool: { type: "quarterly", periods: ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"],  cols: ["Q1","Q2","Q3","Q4"] },
  senior_highschool: { type: "semester",  periods: ["1st_semester","2nd_semester"],                            cols: ["Sem 1","Sem 2"] },
};

export function levelConfig(schoolLevel) {
  return LEVEL_CONFIG[schoolLevel] ?? LEVEL_CONFIG.elementary;
}

export const PERIOD_LABEL = {
  "1st_quarter": "1st Quarter", "2nd_quarter": "2nd Quarter",
  "3rd_quarter": "3rd Quarter", "4th_quarter": "4th Quarter",
  "1st_semester": "1st Semester", "2nd_semester": "2nd Semester",
};

// ── The current grading period, from the Academic Calendar ────────────────
//
// The calendar holds one Grading Period event per quarter (its end date is
// that quarter's grade due date). Senior High grades by semester, derived
// from the quarters: Q1-Q2 are the 1st semester, Q3-Q4 the 2nd -- the same
// rule as the backend's dashboard/teachers_today.py.

// "2026-10-23" is a calendar date, not an instant; read it on this device's
// calendar rather than as UTC midnight (the day before, east of UTC).
function localDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}
const dayOf = (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate());

/** The calendar's Grading Period events, earliest first. */
function quarterEvents(events) {
  return (events ?? [])
    .filter((e) => e.event_type === "grading_period" && e.grading_period && e.start_date && e.end_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

/** The Grading Period event `now` falls in (its last day included), or null. */
export function quarterEventOn(events, now) {
  const today = dayOf(now);
  return quarterEvents(events).find((e) => localDate(e.start_date) <= today && today <= localDate(e.end_date)) ?? null;
}

/**
 * The quarter a grade grid should open on: the one `now` falls in; between
 * quarters, the one just ended (its grades are what's being finished); before
 * the first, the first; after the last, the last. Null when the calendar has
 * no quarter dates.
 */
export function currentQuarterKey(events, now) {
  const list = quarterEvents(events);
  if (!list.length) return null;
  const today = dayOf(now);
  const started = list.filter((e) => localDate(e.start_date) <= today);
  return (started[started.length - 1] ?? list[0]).grading_period;
}

/** A quarter as the period a level grades by: Senior High's semester. */
export function periodForLevel(schoolLevel, quarterKey) {
  if (!quarterKey) return null;
  if (levelConfig(schoolLevel).type !== "semester") return quarterKey;
  return ["1st_quarter", "2nd_quarter"].includes(quarterKey) ? "1st_semester" : "2nd_semester";
}

export const GRADE_ORDER = [
  "Nursery", "Kindergarten",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9", "Grade 10",
  "Grade 11", "Grade 12",
];

// The two cut-offs behind every "how is this learner doing" signal in the app.
// They were re-encoded as bare literals in four places -- the print pages'
// gradeColor, GuardianChildPage's gradeVariant/attendanceVariant, GradesPage's own
// gradeColor, and TeacherSectionsPage -- which is three chances too many for
// a DepEd threshold to drift. 75 is the DepEd passing mark; 90 is the top
// descriptor band (see deped.py server-side).
export const GRADE_OUTSTANDING = 90;
export const GRADE_PASSING = 75;

/**
 * Semantic band for a numeric grade, for anything keyed on a design-system
 * variant name (Badge, text tone) rather than a raw colour.
 */
export function gradeBand(g) {
  if (g == null) return "muted";
  if (g >= GRADE_OUTSTANDING) return "success";
  if (g >= GRADE_PASSING) return "info";
  return "error";
}

/**
 * Attendance shares the cut-offs but not the middle meaning: a 75-89% grade
 * is merely unremarkable, 75-89% attendance is something to act on.
 */
export function attendanceBand(rate) {
  if (rate == null) return "muted";
  if (rate >= GRADE_OUTSTANDING) return "success";
  if (rate >= GRADE_PASSING) return "warning";
  return "error";
}

const NON_COMPLETED_STATUS_LABELS = {
  enrolled:        "Enrolled",
  pending:         "Pending",
  cancelled:       "Cancelled",
  transferred_out: "Transferred Out",
};

export function promotionRemark(enrollment, gwa) {
  if (enrollment.enrollment_status !== "completed") {
    return enrollment.enrollment_status
      ? NON_COMPLETED_STATUS_LABELS[enrollment.enrollment_status]
        ?? (enrollment.enrollment_status.charAt(0).toUpperCase() + enrollment.enrollment_status.slice(1))
      : "—";
  }
  if (gwa == null) return "Completed";
  const idx = GRADE_ORDER.indexOf(enrollment.grade_level);
  const next = idx >= 0 && idx < GRADE_ORDER.length - 1 ? GRADE_ORDER[idx + 1] : null;
  if (gwa >= 75) return next ? `Promoted to ${next}` : "Completed Program";
  return `Retained in ${enrollment.grade_level}`;
}
