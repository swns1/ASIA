// The Grades page's rules: which periods an enrollment is graded in, how a
// grade reads, and how a report card's numbers are worked out. Pure, so the
// Overview, Summary and Entry tabs share them and tests can pin them.

import { GRADE_PASSING } from "../../utils/grading";

export const GRADING_PERIODS_BY_LEVEL = {
  nursery:           ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"],
  kindergarten:      ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"],
  elementary:        ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"],
  junior_highschool: ["1st_quarter","2nd_quarter","3rd_quarter","4th_quarter"],
  senior_highschool: ["1st_semester","2nd_semester"],
};

// A senior high enrollment is one semester: it takes that semester's period
// and subjects only — the core subjects plus the learner's own strand. The
// server refuses the rest, so offering every semester and strand only led the
// teacher to an error.
export function periodsFor(enrollment) {
  if (!enrollment) return [];
  if (enrollment.school_level === "senior_highschool" && enrollment.semester) {
    return [`${enrollment.semester}_semester`];
  }
  return GRADING_PERIODS_BY_LEVEL[enrollment.school_level] ?? [];
}

export function subjectParamsFor(enrollment) {
  // The enrollment's own year's subjects: each year has its own curriculum.
  const params = {
    school_year: enrollment.school_year, school_level: enrollment.school_level,
    grade_level: enrollment.grade_level, page_size: 100,
  };
  if (enrollment.school_level === "senior_highschool") {
    if (enrollment.strand) params.for_strand = enrollment.strand;
    // That semester's subjects plus those with none recorded; the exact
    // match left a HUMSS or ABM learner with nothing to grade.
    if (enrollment.semester) params.for_semester = enrollment.semester;
  }
  return params;
}

export const PERIOD_LABELS = {
  "1st_quarter":  "1st Quarter",
  "2nd_quarter":  "2nd Quarter",
  "3rd_quarter":  "3rd Quarter",
  "4th_quarter":  "4th Quarter",
  "1st_semester": "1st Semester",
  "2nd_semester": "2nd Semester",
};

// For a column header or a segment, where the full name doesn't fit.
export const PERIOD_SHORT = {
  "1st_quarter":  "1st Q",
  "2nd_quarter":  "2nd Q",
  "3rd_quarter":  "3rd Q",
  "4th_quarter":  "4th Q",
  "1st_semester": "1st Sem",
  "2nd_semester": "2nd Sem",
};

// Matches Grade.REMARKS_CHOICES (backend/enrollment-service/grades/models.py).
// computeGrade() can only ever auto-produce "passed"/"failed"/null — a
// teacher picks "incomplete"/"dropped" manually, there's no path to those
// from the computed score.
export const REMARKS_META = {
  passed:     { label: "Passed",     color: "#2e6b0d", bg: "#e8f5e0" },
  failed:     { label: "Failed",     color: "#9b2020", bg: "#fde8e8" },
  incomplete: { label: "Incomplete", color: "#854f0b", bg: "#faeeda" },
  dropped:    { label: "Dropped",    color: "#5c5752", bg: "#f0ede8" },
};

// One colour per grading component, in template order.
export const COMPONENT_COLORS = ["#e03131","#1455a0","#2e6b0d","#d97706","#7c3aed","#be185d","#0891b2"];

/** The DepEd band a grade falls in: its descriptor and colours. */
export function gradeStyle(g) {
  if (g === null || g === undefined) return { color:"#8a6a6a", bg:"transparent", label:"—" };
  const n = parseFloat(g);
  if (n >= 90) return { color:"#1455a0", bg:"#e3f0fd",  label:"Outstanding" };
  if (n >= 85) return { color:"#2e6b0d", bg:"#e8f5e0",  label:"Very Satisfactory" };
  if (n >= 80) return { color:"#2e6b0d", bg:"#eaf3de",  label:"Satisfactory" };
  if (n >= 75) return { color:"#854f0b", bg:"#faeeda",  label:"Fairly Satisfactory" };
  return { color:"#9b2020", bg:"#fde8e8", label:"Did Not Meet" };
}

// Derived from gradeStyle rather than restated: the legend previously hard-coded
// its own copy of these five bands, so changing a threshold or colour in
// gradeStyle would have left the legend quietly describing the old scheme.
export const GRADE_LEGEND = [
  { range: "90–100", at: 95 },
  { range: "85–89",  at: 87 },
  { range: "80–84",  at: 82 },
  { range: "75–79",  at: 77 },
  { range: "< 75",   at: 70 },
].map(({ range, at }) => ({ range, ...gradeStyle(at) }));

/** "86" for a whole grade, "81.25" otherwise; "—" for none. */
export function formatGrade(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * DepEd Order 8 Percentage Score for one component: summed raw scores over
 * summed highest possible scores, so a 50-point test outweighs a 10-point
 * quiz. The server's formula (grading/deped.py percentage_score), so the
 * sheet's % column and the computed grade can't disagree. null when nothing
 * is encoded — that is "not yet", never zero.
 */
export function percentageScore(entries) {
  let score = 0;
  let max = 0;
  for (const e of entries) {
    const m = Number(e.max_score);
    if (!(m > 0)) continue;
    score += Number(e.score) || 0;
    max += m;
  }
  return max > 0 ? (score / max) * 100 : null;
}

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * One enrollment's report card, as the Summary tab reads it.
 *
 * A subject's final rating is the mean of its period grades once every period
 * has one; until then it has none and is in progress. Passed and failed are
 * counted per subject from those final ratings, not per quarter grade: the
 * page used to count quarter grades, so one subject failed in two quarters
 * read as two failures. The general average is the mean of the final
 * ratings, and exists only once every subject has one.
 *
 * @param {object[]} subjects  the enrollment's subjects ({ subject_id, ... })
 * @param {object[]} grades    its saved grades ({ subject, grading_period, numeric_grade })
 * @param {string[]} periods   periodsFor(enrollment)
 */
export function summarizeGrades(subjects, grades, periods) {
  const byKey = {};
  for (const g of grades) {
    const n = parseFloat(g.numeric_grade);
    if (!Number.isNaN(n)) byKey[`${g.subject}|${g.grading_period}`] = n;
  }

  const rows = subjects.map((subject) => {
    const byPeriod = {};
    for (const p of periods) byPeriod[p] = byKey[`${subject.subject_id}|${p}`] ?? null;
    const recorded = periods.map((p) => byPeriod[p]).filter((v) => v !== null);
    const final = periods.length > 0 && recorded.length === periods.length ? mean(recorded) : null;
    const remark = final === null ? null : final >= GRADE_PASSING ? "passed" : "failed";
    return { subject, byPeriod, final, remark };
  });

  const periodAverages = {};
  for (const p of periods) {
    const values = rows.map((r) => r.byPeriod[p]).filter((v) => v !== null);
    periodAverages[p] = values.length ? mean(values) : null;
  }

  const allFinal = rows.length > 0 && rows.every((r) => r.final !== null);
  const generalAverage = allFinal ? mean(rows.map((r) => r.final)) : null;

  return {
    rows,
    periodAverages,
    allFinal,
    generalAverage,
    passed: rows.filter((r) => r.remark === "passed").map((r) => r.subject),
    failed: rows.filter((r) => r.remark === "failed").map((r) => r.subject),
    // How far each period's grading has got: subjects with a grade in it.
    progress: periods.map((p) => ({
      period: p,
      graded: rows.filter((r) => r.byPeriod[p] !== null).length,
    })),
  };
}
