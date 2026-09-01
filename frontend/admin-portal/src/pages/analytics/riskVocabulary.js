// riskVocabulary — the one place the model's vocabulary becomes school English.
//
// The backend stores risk_level as low/moderate/high/critical (see
// ai/services.py RISK_LEVEL_THRESHOLDS) because that enum is what the database
// column and its history are built on. Nobody on staff should ever read those
// words: a registrar wants to know who needs following up, not which quartile
// of a weighted composite a student fell into. Every user-facing string on the
// Analytics page comes from here, so the translation happens once.

export const RISK_LEVELS = ["critical", "high", "moderate", "low"];

// Fixed status palette (good / warning / serious / critical) — reserved for
// state, never reused as a categorical series color. These are the exact
// validated hexes from the dataviz palette reference. `warning` and `serious`
// measure under 3:1 on a light surface *by design*: the mitigation is that a
// status color never carries meaning alone, so every use below pairs the hex
// with both an icon and a text label, and the hex itself only ever fills a
// small swatch (dot, icon, chart mark) beside dark ink — never the text.
export const RISK_LEVEL_META = {
  low: {
    label: "On track",
    blurb: "Nothing standing out right now",
    order: 0,
    color: "#0ca30c",
    icon: "ti-shield-check",
    tint: "rgba(12, 163, 12, 0.12)",
  },
  moderate: {
    label: "Watch",
    blurb: "Worth keeping an eye on",
    order: 1,
    color: "#fab219",
    icon: "ti-alert-triangle",
    tint: "rgba(250, 178, 25, 0.16)",
  },
  high: {
    label: "Needs attention",
    blurb: "Should be followed up this quarter",
    order: 2,
    color: "#ec835a",
    icon: "ti-alert-octagon",
    tint: "rgba(236, 131, 90, 0.16)",
  },
  critical: {
    label: "Needs urgent help",
    blurb: "Follow up now — several things are going wrong at once",
    order: 3,
    color: "#d03b3b",
    icon: "ti-alert-hexagon",
    tint: "rgba(208, 59, 59, 0.14)",
  },
};

// The two bands that put a student on the follow-up list. Matches the
// backend's own `flagged_levels` in ai/risk_views.py _summarize().
export const FLAGGED_LEVELS = ["high", "critical"];

export function riskLevelMeta(level) {
  return (
    RISK_LEVEL_META[level] ?? {
      label: "Unknown",
      blurb: "",
      order: -1,
      color: "#8a6a6a",
      icon: "ti-help-circle",
      tint: "rgba(138, 106, 106, 0.12)",
    }
  );
}

export function isFlagged(level) {
  return FLAGGED_LEVELS.includes(level);
}

// Short names for the reason codes emitted by ai/services.py. The full
// sentence already lives on each student row; these are the axis labels for
// the "why students are flagged" chart, where a whole sentence won't fit.
export const REASON_LABELS = {
  failing_subjects: "Failing one or more subjects",
  low_average: "Average below the passing mark",
  borderline_average: "Only just passing",
  severe_absence: "Missing 20%+ of school days",
  chronic_absence: "Chronically absent",
  frequent_absence: "Frequently absent",
  grades_dropping: "Grades dropping",
  behavior_concern: "Behavior concerns",
  limited_data: "Not enough records yet",
};

export function reasonLabel(code) {
  return REASON_LABELS[code] ?? code;
}

// How much of the picture the score was built from. Shown next to the score
// rather than folded into it — a student scored from one signal is not as
// confidently placed as one scored from four, and the weight renormalization
// in score_students() would otherwise hide that completely.
export const CONFIDENCE_META = {
  complete: { label: "Full picture", hint: "All 4 signals had data" },
  partial: { label: "Partial", hint: "Some signals had no data yet" },
  limited: { label: "Thin data", hint: "Scored from a single signal — treat with care" },
};

export function confidenceFor(signalsPresent) {
  if (signalsPresent >= 4) return { key: "complete", ...CONFIDENCE_META.complete };
  if (signalsPresent >= 2) return { key: "partial", ...CONFIDENCE_META.partial };
  return { key: "limited", ...CONFIDENCE_META.limited };
}

export const PASSING_GRADE = 75; // DepEd passing mark — mirrors ai/services.py
export const GOOD_ATTENDANCE = 90; // below this a student is drifting toward chronic absence

export const PERIOD_LABELS = {
  overall: "Whole year",
  "1st_quarter": "1st Quarter",
  "2nd_quarter": "2nd Quarter",
  "3rd_quarter": "3rd Quarter",
  "4th_quarter": "4th Quarter",
  "1st_semester": "1st Semester",
  "2nd_semester": "2nd Semester",
};

export function periodLabel(period) {
  return PERIOD_LABELS[period] ?? period;
}

// ── Formatters ───────────────────────────────────────────────────────────────
// Every one returns a string, never null, so a cell never renders "null".

export function formatGrade(value) {
  return value == null ? "—" : Number(value).toFixed(1);
}

export function formatAttendance(rate) {
  return rate == null ? "—" : `${Math.round(Number(rate) * 100)}%`;
}

export function formatDelta(delta) {
  if (delta == null) return "—";
  const n = Number(delta);
  if (Math.abs(n) < 0.05) return "no change";
  return `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;
}

// A grade or attendance figure is only worth coloring when it has crossed the
// line the school acts on; everything else stays in ordinary body ink so the
// exceptions are the things that catch the eye.
export function gradeToneClass(value) {
  if (value == null) return "text-neutral-500";
  if (value < PASSING_GRADE) return "text-error-500 font-bold";
  if (value < PASSING_GRADE + 5) return "text-warning-500 font-semibold";
  return "text-neutral-800";
}

export function attendanceToneClass(rate) {
  if (rate == null) return "text-neutral-500";
  const pct = Number(rate) * 100;
  if (pct < 80) return "text-error-500 font-bold";
  if (pct < GOOD_ATTENDANCE) return "text-warning-500 font-semibold";
  return "text-neutral-800";
}

export function deltaToneClass(delta) {
  if (delta == null) return "text-neutral-500";
  const n = Number(delta);
  if (n <= -5) return "text-error-500 font-bold";
  if (n <= -2) return "text-warning-500 font-semibold";
  if (n >= 2) return "text-success-500 font-semibold";
  return "text-neutral-800";
}

export function deltaIcon(delta) {
  if (delta == null) return null;
  const n = Number(delta);
  if (n <= -0.05) return "ti-trending-down";
  if (n >= 0.05) return "ti-trending-up";
  return "ti-minus";
}

// ── CSV export ───────────────────────────────────────────────────────────────
// Same quoting/Blob approach as AcademicCalendarPage's exportCSV, kept local
// because the columns are this page's own. The follow-up list is the artifact a
// registrar actually carries out of here, so it exports the plain-language
// values (grade, attendance, reasons), never the internal risk components.

function quoteCSV(value) {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildRiskCSV(rows) {
  const header = [
    "Student",
    "Student number",
    "Grade level",
    "Section",
    "Status",
    "Average",
    "Attendance",
    "Change since last period",
    "Subjects failing",
    "Signals used",
    "Why flagged",
  ];

  const body = rows.map((r) => [
    r.student_name ?? `Student #${r.student_id}`,
    r.student_number,
    r.grade_level,
    r.section,
    riskLevelMeta(r.risk_level).label,
    r.average_grade == null ? "" : Number(r.average_grade).toFixed(1),
    r.attendance_rate == null ? "" : `${Math.round(Number(r.attendance_rate) * 100)}%`,
    r.grade_delta == null ? "" : Number(r.grade_delta).toFixed(1),
    r.failing_subject_count ?? 0,
    `${r.signals_present ?? 0} of 4`,
    (r.reasons ?? []).map((x) => x.text).join("; "),
  ]);

  return [header, ...body].map((row) => row.map(quoteCSV).join(",")).join("\r\n");
}

export function downloadRiskCSV(rows, { schoolYear, gradingPeriod }) {
  const blob = new Blob([buildRiskCSV(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `students-to-follow-up-SY${schoolYear || "all"}-${gradingPeriod || "all"}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Chart catalogue ──────────────────────────────────────────────────────────
// Which views the Overview tab offers, and what each one is for. Lives here
// rather than beside the chart components so RiskCharts.jsx can export only
// components (react-refresh/only-export-components).

// Ordered as a reader works through the question: how is everyone doing, how
// many are in trouble, what is driving it, then where it is concentrated.
export const CHART_OPTIONS = [
  { value: "grades", label: "How everyone is doing", icon: "ti-chart-histogram" },
  { value: "mix", label: "How many need help", icon: "ti-chart-pie-4" },
  { value: "reasons", label: "Why they're flagged", icon: "ti-list-check" },
  { value: "grade_level", label: "By grade level", icon: "ti-school" },
  { value: "section", label: "By section", icon: "ti-users-group" },
  { value: "map", label: "Grades vs attendance", icon: "ti-map-pin" },
];

// The Overview opens on the grade spread rather than the band split: the four
// stat tiles directly above already carry the band counts, so leading with
// them again says nothing new. The spread is the one view that shows
// something the tiles cannot — where the cohort actually sits, and how much
// of it falls left of the passing mark.
export const DEFAULT_CHART_VIEW = "grades";

const CHART_BLURBS = {
  mix: "How the whole group splits across the four levels.",
  grade_level: "Which year groups are carrying the most students who need help.",
  section: "Which sections are carrying the most students who need help.",
  reasons: "What is actually driving the flags — this is what to act on.",
  grades: "Where everyone's average sits, and how many fall below the passing mark.",
  map: "Grades against attendance, so a bright absentee and a struggling attender don't look alike.",
};

export function chartBlurb(view) {
  return CHART_BLURBS[view] ?? "";
}

/**
 * Whether a view draws risk bands, and therefore needs the legend. The
 * single-series charts deliberately don't get one — their title names the
 * series, and a one-entry legend is noise.
 */
export function viewUsesBands(view) {
  return ["mix", "grade_level", "section", "map"].includes(view);
}
