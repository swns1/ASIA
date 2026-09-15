// grading.js
//
// Shared grading-period helpers, generalized from near-identical copies in
// SF9PrintPage.jsx and SF10PrintPage.jsx. Those files
// each keyed their period config as Nursery/Kindergarten/Elementary/JHS/SHS,
// which never matched the real Enrollment.school_level values
// (nursery/kindergarten/elementary/junior_highschool/senior_highschool) — every
// lookup silently fell back to the Elementary/quarterly config. LEVEL_CONFIG
// here is keyed correctly.

export const LEVEL_CONFIG = {
  nursery:           { type: "annual",    periods: ["annual"],                                                 cols: ["Annual Grade"] },
  kindergarten:      { type: "annual",    periods: ["annual"],                                                 cols: ["Annual Grade"] },
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
  annual: "Annual",
};

export const GRADE_ORDER = [
  "Nursery", "Kindergarten",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9", "Grade 10",
  "Grade 11", "Grade 12",
];

// Philippine school calendar quarter/semester index (0-based)
export function attIndex(dateStr, type) {
  const m = new Date(dateStr).getMonth() + 1;
  if (type === "quarterly") {
    if ([8, 9, 10].includes(m))  return 0;
    if ([11, 12, 1].includes(m)) return 1;
    if ([2, 3].includes(m))      return 2;
    return 3;
  }
  if (type === "semester") {
    return [8, 9, 10, 11, 12, 1].includes(m) ? 0 : 1;
  }
  return 0;
}

// The two cut-offs behind every "how is this learner doing" signal in the app.
// They were re-encoded as bare literals in four places -- gradeColor below,
// GuardianChildPage's gradeVariant/attendanceVariant, GradesPage's own
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

export function gradeColor(g) {
  if (g == null) return "#7a5050";
  if (g >= GRADE_OUTSTANDING) return "#1a6b0d";
  if (g >= GRADE_PASSING) return "#1455a0";
  return "#c92a2a";
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
