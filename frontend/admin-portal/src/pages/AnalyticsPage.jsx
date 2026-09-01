import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { usePageTitle } from "../hooks/usePageTitle";
import useTabs from "../hooks/useTabs";
import { pageVariants } from "../utils/motion";

import PageHeader from "../components/ui/PageHeader";
import Card, { Panel, StatCard } from "../components/ui/Card";
import Tabs, { TabPanel } from "../components/ui/Tabs";
import Button from "../components/ui/Button";
import ChipGroup from "../components/ui/ChipGroup";
import Alert from "../components/ui/Alert";
import EmptyState from "../components/EmptyState";
import Table, { TableCell, TableRow } from "../components/ui/Table";
import { Field, Select } from "../components/FormField";
import AIInsightPanel from "../components/AIInsightPanel";

import RiskTable, { RiskBadge } from "./analytics/RiskTable";
import RiskChart, { RiskLegend } from "./analytics/RiskCharts";
import {
  CHART_OPTIONS,
  DEFAULT_CHART_VIEW,
  chartBlurb,
  formatAttendance,
  formatGrade,
  periodLabel,
  riskLevelMeta,
  viewUsesBands,
} from "./analytics/riskVocabulary";

import {
  getSubjects as _getSubjects,
  getAiCluster as _getAiCluster,
  callGemini,
  runRiskAssessment as _runRiskAssessment,
  getRiskAssessmentLatest as _getRiskAssessmentLatest,
  getRiskAssessmentTrend as _getRiskAssessmentTrend,
} from "../api/enrollmentApi";
import { useSchoolYear } from "../context/SchoolYearContext";
import { ACADEMIC_STAFF, getCurrentUser, hasAnyRole } from "../utils/auth";

// AnalyticsPage — early warning for students who need following up, plus a
// descriptive grouping of how the cohort is performing.
//
// The page is written for a registrar or an adviser, not for a data scientist.
// Nothing on it names an algorithm, a cluster id, a silhouette score or a
// "component risk contribution": those are implementation details of
// ai/services.py and ai/analytics_views.py, and knowing them has never helped
// anyone decide which student to call home about. The vocabulary the page does
// use lives in ./analytics/riskVocabulary.js.
//
// Three tabs, because staff arrive with three different questions:
//   Overview  — how bad is it, and where? (charts, switchable)
//   Students  — who exactly do I follow up, and about what? (the working list)
//   Groups    — how is the cohort performing overall? (the clustering, renamed)

const PERIOD_OPTIONS = [
  { value: "overall", label: "Whole year" },
  { value: "1st_quarter", label: "1st Quarter" },
  { value: "2nd_quarter", label: "2nd Quarter" },
  { value: "3rd_quarter", label: "3rd Quarter" },
  { value: "4th_quarter", label: "4th Quarter" },
  { value: "1st_semester", label: "1st Semester" },
  { value: "2nd_semester", label: "2nd Semester" },
];

const SCHOOL_LEVELS = [
  { value: "", label: "All levels" },
  { value: "nursery", label: "Nursery" },
  { value: "kindergarten", label: "Kindergarten" },
  { value: "elementary", label: "Elementary" },
  { value: "junior_highschool", label: "Junior High" },
  { value: "senior_highschool", label: "Senior High" },
];

const GRADE_LEVELS_BY_LEVEL = {
  "": ["All grades"],
  nursery: ["All grades", "Nursery"],
  kindergarten: ["All grades", "Kindergarten"],
  elementary: ["All grades", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  junior_highschool: ["All grades", "Grade 7", "Grade 8", "Grade 9", "Grade 10"],
  senior_highschool: ["All grades", "Grade 11", "Grade 12"],
};

// How many performance groups to sort the cohort into. Phrased as a plain
// choice; "Suggested" uses the backend's own best-separation result rather
// than making anyone reason about k.
const GROUP_COUNT_OPTIONS = [
  { value: "auto", label: "Suggested" },
  { value: "3", label: "3 groups" },
  { value: "4", label: "4 groups" },
  { value: "5", label: "5 groups" },
];

function formatWhen(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Risk over time ───────────────────────────────────────────────────────────
// One student's concern level across every saved assessment. Point colour is
// the band at that run, so the line reads as a sequence of states rather than
// one flat series; the connecting line stays structural grey.

function RiskTrendChart({ points }) {
  const [hovered, setHovered] = useState(null);
  if (!points?.length) return null;

  const W = 760;
  const H = 240;
  const PAD_L = 40;
  const PAD_R = 20;
  const PAD_T = 16;
  const PAD_B = 34;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const scaleX = (i) => (points.length === 1 ? PAD_L + innerW / 2 : PAD_L + (i / (points.length - 1)) * innerW);
  const scaleY = (score) => PAD_T + innerH - (score / 100) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scaleY(p.risk_score)}`)
    .join(" ");

  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  // Thin the x labels so a student with many saved runs doesn't get a row of
  // overlapping dates.
  const labelStep = Math.max(1, Math.ceil(points.length / 8));

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: "#fdfcfb", borderRadius: 10 }} role="img">
        {[25, 50, 75].map((mark) => (
          <line key={mark} x1={PAD_L} x2={W - PAD_R} y1={scaleY(mark)} y2={scaleY(mark)} stroke="#f0e4e4" />
        ))}
        {[0, 50, 100].map((mark) => (
          <text key={mark} x={PAD_L - 8} y={scaleY(mark) + 3} textAnchor="end" fontSize="10" fill="#8a6a6a">
            {mark === 0 ? "Fine" : mark === 100 ? "Urgent" : ""}
          </text>
        ))}
        <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} stroke="#f0e4e4" />
        <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={H - PAD_B} stroke="#f0e4e4" />

        {points.map((p, i) =>
          i % labelStep === 0 ? (
            <text key={p.run_id} x={scaleX(i)} y={H - PAD_B + 16} textAnchor="middle" fontSize="10" fill="#8a6a6a">
              {fmtDate(p.created_at)}
            </text>
          ) : null
        )}

        <path d={linePath} fill="none" stroke="#cbb3b3" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => {
          const meta = riskLevelMeta(p.risk_level);
          return (
            <g key={p.run_id}>
              <circle cx={scaleX(i)} cy={scaleY(p.risk_score)} r={5.5} fill={meta.color} stroke="#fdfcfb" strokeWidth={2.5} />
              <circle
                cx={scaleX(i)}
                cy={scaleY(p.risk_score)}
                r={12}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHovered({ ...p, i })}
                onMouseLeave={() => setHovered(null)}
              />
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-[240px] rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-xs shadow-lg"
          style={{
            left: `${(scaleX(hovered.i) / W) * 100}%`,
            top: `${(scaleY(hovered.risk_score) / H) * 100}%`,
            transform: `translate(${hovered.i > points.length * 0.62 ? "-100%" : "0"}, calc(-100% - 8px))`,
          }}
          role="tooltip"
        >
          <div className="font-bold text-neutral-900">{formatWhen(hovered.created_at)}</div>
          <div className="mt-0.5 text-neutral-600">
            {riskLevelMeta(hovered.risk_level).label} · {periodLabel(hovered.grading_period)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Performance groups (the clustering, in plain words) ──────────────────────

const GROUP_STUDENT_COLUMNS = [
  { key: "student_name", label: "Student", width: "34%" },
  { key: "group", label: "Group", width: "26%" },
  { key: "grade", label: "Average", width: "13%", align: "right" },
  { key: "attendance", label: "Attendance", width: "13%", align: "right" },
  { key: "behavior", label: "Behavior", width: "14%", align: "right" },
];

function PerformanceGroups({ result }) {
  const students = useMemo(() => {
    if (!result?.clusters) return [];
    return result.clusters
      .flatMap((c) => (c.students ?? []).map((s) => ({ ...s, groupLabel: c.label, groupColor: c.color })))
      .sort((a, b) => (a.grade ?? 0) - (b.grade ?? 0));
  }, [result]);

  if (!result) return null;

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="How the group splits"
        subtitle="Students sorted into performance groups by their grades, attendance and behavior"
        icon="ti-layout-grid"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {result.clusters.map((c) => (
            <Card key={c.label} padding="md" className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: c.color }}
                  aria-hidden="true"
                />
                <span className="truncate font-bold text-neutral-900">{c.label}</span>
              </div>
              <div className="text-xl font-bold text-neutral-900">
                {c.student_count}
                <span className="ml-1.5 text-xs font-semibold text-neutral-500">
                  student{c.student_count === 1 ? "" : "s"}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-neutral-600">
                <dt>Average grade</dt>
                <dd className="text-right font-semibold text-neutral-900 tabular-nums">
                  {formatGrade(c.avg_grade)}
                </dd>
                <dt>Range</dt>
                <dd className="text-right font-semibold text-neutral-900 tabular-nums">
                  {formatGrade(c.min_grade)}–{formatGrade(c.max_grade)}
                </dd>
                <dt>Attendance</dt>
                <dd className="text-right font-semibold text-neutral-900 tabular-nums">
                  {formatAttendance(c.avg_attendance)}
                </dd>
              </dl>
            </Card>
          ))}
        </div>
      </Panel>

      <Card padding="none" className="overflow-hidden">
        <div className="border-b border-neutral-200 px-5 py-4">
          <div className="font-bold text-neutral-900">Every student, weakest first</div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {students.length} student{students.length === 1 ? "" : "s"} in this selection
          </div>
        </div>
        <Table columns={GROUP_STUDENT_COLUMNS} isEmpty={!students.length} empty={{ title: "No students to group" }}>
          {students.map((s) => (
            <TableRow key={`${s.student_id}-${s.subject_name ?? ""}`}>
              <TableCell>
                <span className="font-semibold text-neutral-900">{s.student_name}</span>
                <span className="block text-xs text-neutral-500">{s.student_number ?? "—"}</span>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 text-xs text-neutral-700">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: s.groupColor }}
                    aria-hidden="true"
                  />
                  {s.groupLabel}
                </span>
              </TableCell>
              <TableCell align="right">
                <span className="tabular-nums">{formatGrade(s.grade)}</span>
              </TableCell>
              <TableCell align="right">
                <span className="tabular-nums">{formatAttendance(s.attendance_rate)}</span>
              </TableCell>
              <TableCell align="right">
                <span className="tabular-nums">
                  {s.avg_narrative == null ? "—" : `${Number(s.avg_narrative).toFixed(1)} / 3`}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function ClusterInsightPanel({ result }) {
  const onFetch = () => {
    const details = result.clusters
      .map((c) => {
        const att = c.avg_attendance != null ? `, attendance=${(c.avg_attendance * 100).toFixed(0)}%` : "";
        const narr = c.avg_narrative != null ? `, behavior=${c.avg_narrative}/3` : "";
        return `${c.label}: ${c.student_count} student(s), avg grade=${c.avg_grade}, range=[${c.min_grade}–${c.max_grade}]${att}${narr}`;
      })
      .join("\n");

    return callGemini("clustering_insights", {
      school_year: result.meta.school_year,
      grading_period: result.meta.grading_period,
      grade_level: result.meta.grade_level || "All Grade Levels",
      subject: result.meta.subject,
      total_students: result.meta.total_students,
      n_clusters: result.meta.n_clusters,
      cluster_details: details,
      include_recommendations: true,
    });
  };

  return (
    <AIInsightPanel
      title="What this means, and what to do"
      description="An AI summary of the groups above, with suggested next steps"
      autoFetch
      onFetch={onFetch}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════════

export default function AnalyticsPage() {
  usePageTitle("Analytics");

  const { schoolYear: globalSchoolYear, options: globalYearOptions } = useSchoolYear();
  const canRun = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);

  const [schoolYear, setSchoolYear] = useState(globalSchoolYear || "");
  const [gradingPeriod, setGradingPeriod] = useState("1st_quarter");
  const [schoolLevel, setSchoolLevel] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [groupCount, setGroupCount] = useState("auto");
  const [subjects, setSubjects] = useState([]);

  const [chartView, setChartView] = useState(DEFAULT_CHART_VIEW);

  const [risk, setRisk] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState(null);
  const [riskIsLatest, setRiskIsLatest] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [trend, setTrend] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);

  const [groups, setGroups] = useState(null);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState(null);

  const TABS = useMemo(
    () =>
      [
        { id: "overview", label: "Overview", icon: "ti-chart-pie" },
        {
          id: "students",
          label: "Students to follow up",
          icon: "ti-user-exclamation",
          count: risk?.summary?.flagged_count,
        },
        // Whole-cohort grouping is a staff view; the clustering endpoint is
        // not advisory-scoped, so a teacher never sees this tab.
        canRun ? { id: "groups", label: "Performance groups", icon: "ti-layout-grid" } : null,
      ].filter(Boolean),
    [risk, canRun]
  );
  const { active, direction, setActive } = useTabs(TABS);

  // Follow the global year selector while this page stays mounted.
  useEffect(() => setSchoolYear(globalSchoolYear), [globalSchoolYear]);

  // Changing a level invalidates the narrower selections beneath it. Done in
  // the handler rather than an effect so there is no intermediate render
  // showing a grade level that doesn't belong to the chosen school level.
  function changeSchoolLevel(value) {
    setSchoolLevel(value);
    setGradeLevel("");
    setSubjectId("");
  }

  function changeGradeLevel(value) {
    setGradeLevel(value);
    setSubjectId("");
  }

  const gradeOptions = GRADE_LEVELS_BY_LEVEL[schoolLevel] ?? ["All grades"];

  const filters = useMemo(
    () => ({
      school_year: schoolYear || undefined,
      grading_period: gradingPeriod,
      school_level: schoolLevel || undefined,
      grade_level: gradeLevel || undefined,
    }),
    [schoolYear, gradingPeriod, schoolLevel, gradeLevel]
  );

  useEffect(() => {
    _getSubjects({ page_size: 500, school_level: schoolLevel || undefined, grade_level: gradeLevel || undefined })
      .then((d) => setSubjects(d.results ?? d ?? []))
      .catch(() => setSubjects([]));
  }, [schoolLevel, gradeLevel]);

  // Show the last saved assessment on arrival so the page is never blank for
  // someone who only reads it (a teacher can't trigger a run at all).
  useEffect(() => {
    _getRiskAssessmentLatest(filters)
      .then((d) => {
        setRisk(d);
        setRiskIsLatest(true);
      })
      .catch(() => {
        setRisk(null);
        setRiskIsLatest(false);
      });
  }, [filters]);

  const runAssessment = useCallback(async () => {
    setRiskLoading(true);
    setRiskError(null);
    setSelectedStudent(null);
    try {
      const data = await _runRiskAssessment({
        school_year: schoolYear,
        grading_period: gradingPeriod,
        school_level: schoolLevel || undefined,
        grade_level: gradeLevel || undefined,
      });
      setRisk(data);
      setRiskIsLatest(false);
    } catch (e) {
      setRiskError(e.response?.data?.detail || e.message || "Could not check students.");
    } finally {
      setRiskLoading(false);
    }
  }, [schoolYear, gradingPeriod, schoolLevel, gradeLevel]);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    setGroupsError(null);
    try {
      const params = {
        school_year: schoolYear,
        grading_period: gradingPeriod,
        ...(schoolLevel && { school_level: schoolLevel }),
        ...(gradeLevel && { grade_level: gradeLevel }),
        ...(subjectId && { subject_id: subjectId }),
        ...(groupCount !== "auto" && { n_clusters: Number(groupCount) }),
      };
      setGroups(await _getAiCluster(params));
    } catch (e) {
      setGroupsError(e.response?.data?.error || e.message || "Could not group students.");
    } finally {
      setGroupsLoading(false);
    }
  }, [schoolYear, gradingPeriod, schoolLevel, gradeLevel, subjectId, groupCount]);

  const selectStudent = useCallback((row) => {
    setSelectedStudent(row);
    setTrend(null);
    setTrendLoading(true);
    _getRiskAssessmentTrend(row.student_id)
      .then(setTrend)
      .catch(() => setTrend(null))
      .finally(() => setTrendLoading(false));
  }, []);

  function openStudentFromChart(row) {
    setActive("students");
    selectStudent(row);
  }

  const counts = risk?.summary?.by_level ?? {};
  const assessed = risk?.student_count ?? 0;

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Spot students who need help early, and see how the school is doing overall"
        icon="ti-chart-dots-3"
        actions={
          canRun ? (
            <Button icon="ti-refresh" loading={riskLoading} onClick={runAssessment} disabled={!schoolYear}>
              {risk ? "Check again" : "Check students"}
            </Button>
          ) : null
        }
      />

      <motion.div
        variants={pageVariants.container}
        initial="hidden"
        animate="visible"
        className="flex-1 space-y-4 overflow-y-auto p-6"
      >
        {/* One filter row above everything it scopes — every tab and every
            chart below reads the same slice. */}
        <motion.div variants={pageVariants.item}>
          <Card>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="School year" htmlFor="an-year">
                <Select id="an-year" value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)}>
                  {globalYearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Grading period" htmlFor="an-period">
                <Select id="an-period" value={gradingPeriod} onChange={(e) => setGradingPeriod(e.target.value)}>
                  {PERIOD_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="School level" htmlFor="an-level">
                <Select id="an-level" value={schoolLevel} onChange={(e) => changeSchoolLevel(e.target.value)}>
                  {SCHOOL_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Grade level" htmlFor="an-grade">
                <Select
                  id="an-grade"
                  value={gradeLevel}
                  onChange={(e) => changeGradeLevel(e.target.value === "All grades" ? "" : e.target.value)}
                >
                  {gradeOptions.map((g) => (
                    <option key={g} value={g === "All grades" ? "" : g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {risk && (
              <p className="mt-3 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
                Showing {assessed} student{assessed === 1 ? "" : "s"} · {periodLabel(risk.grading_period)}{" "}
                {risk.school_year} · last checked {formatWhen(risk.updated_at ?? risk.created_at)}
                {riskIsLatest && " (saved result — press Check again for fresh numbers)"}
              </p>
            )}
          </Card>
        </motion.div>

        {riskError && (
          <motion.div variants={pageVariants.item}>
            <Alert variant="error" title="Could not check students">
              {riskError}
            </Alert>
          </motion.div>
        )}

        <motion.div variants={pageVariants.item}>
          <Tabs tabs={TABS} value={active} onChange={setActive} />
        </motion.div>

        {!risk && !riskLoading && !riskError ? (
          <motion.div variants={pageVariants.item}>
            <Card>
              <EmptyState
                icon="ti-shield-search"
                title="No check has been run yet"
                subtitle={
                  canRun
                    ? "Choose a school year and grading period above, then press Check students to see who may need help."
                    : "No assessment has been saved for this selection yet. Ask the registrar to run one."
                }
                action={
                  canRun ? (
                    <Button icon="ti-refresh" onClick={runAssessment} disabled={!schoolYear}>
                      Check students
                    </Button>
                  ) : null
                }
              />
            </Card>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            {active === "overview" && (
              <TabPanel key="overview" id="overview" direction={direction}>
                {/* Refetches hold the previous render at reduced opacity
                    rather than flashing a skeleton and jumping the layout. */}
                <div className={`space-y-4 transition-opacity ${riskLoading ? "opacity-50" : "opacity-100"}`}>
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {["critical", "high", "moderate", "low"].map((level) => {
                      const meta = riskLevelMeta(level);
                      return (
                        <StatCard
                          key={level}
                          label={meta.label}
                          value={counts[level] ?? 0}
                          icon={meta.icon}
                          iconTone={
                            level === "critical"
                              ? "error"
                              : level === "high"
                                ? "warning"
                                : level === "moderate"
                                  ? "info"
                                  : "success"
                          }
                          hint={meta.blurb}
                        />
                      );
                    })}
                  </div>

                  <Card padding="none" className="overflow-hidden">
                    <div className="border-b border-neutral-200 px-5 py-4">
                      <div className="font-bold text-neutral-900">
                        {CHART_OPTIONS.find((o) => o.value === chartView)?.label}
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-500">{chartBlurb(chartView)}</div>
                      <div className="mt-3">
                        <ChipGroup
                          options={CHART_OPTIONS}
                          value={chartView}
                          onChange={setChartView}
                          label="Choose a chart"
                          size="sm"
                        />
                      </div>
                    </div>
                    <div className="p-5">
                      {viewUsesBands(chartView) && <RiskLegend counts={counts} className="mb-4" />}
                      <RiskChart view={chartView} run={risk} onSelectStudent={openStudentFromChart} />
                      <p className="mt-3 text-xs text-neutral-500">
                        Prefer the numbers? The{" "}
                        <button
                          type="button"
                          onClick={() => setActive("students")}
                          className="focus-ring rounded-sm font-semibold text-brand-500 hover:underline"
                        >
                          Students to follow up
                        </button>{" "}
                        tab lists every student behind these charts.
                      </p>
                    </div>
                  </Card>
                </div>
              </TabPanel>
            )}

            {active === "students" && (
              <TabPanel key="students" id="students" direction={direction}>
                <div className="space-y-4">
                  <Card padding="none" className="overflow-hidden">
                    <div className="border-b border-neutral-200 px-5 py-4">
                      <div className="font-bold text-neutral-900">Students to follow up</div>
                      <div className="mt-0.5 text-xs text-neutral-500">
                        Most urgent first. Select a student to see how they have changed over time.
                      </div>
                    </div>
                    <div className="p-5">
                      <RiskTable
                        run={risk}
                        loading={riskLoading}
                        selectedStudentId={selectedStudent?.student_id}
                        onSelectStudent={selectStudent}
                      />
                    </div>
                  </Card>

                  <AnimatePresence>
                    {selectedStudent && (
                      <motion.div
                        key={`trend-${selectedStudent.student_id}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.16 }}
                      >
                        <Panel
                          title={selectedStudent.student_name ?? `Student #${selectedStudent.student_id}`}
                          subtitle="How this student's situation has changed across saved checks"
                          icon="ti-timeline"
                          action={
                            <Button variant="ghost" size="sm" icon="ti-x" onClick={() => setSelectedStudent(null)}>
                              Close
                            </Button>
                          }
                        >
                          <div className="mb-4 flex flex-wrap items-center gap-2">
                            <RiskBadge level={selectedStudent.risk_level} />
                            <span className="text-xs text-neutral-500">
                              Average {formatGrade(selectedStudent.average_grade)} · Attendance{" "}
                              {formatAttendance(selectedStudent.attendance_rate)}
                            </span>
                          </div>

                          {(selectedStudent.reasons ?? []).length > 0 && (
                            <ul className="mb-4 space-y-1">
                              {selectedStudent.reasons.map((r) => (
                                <li key={r.code} className="flex items-start gap-2 text-sm text-neutral-700">
                                  <i
                                    className={`ti ${
                                      r.severity === "high" ? "ti-point-filled text-error-500" : "ti-point text-neutral-500"
                                    } mt-0.5 shrink-0 text-[14px]`}
                                    aria-hidden="true"
                                  />
                                  {r.text}
                                </li>
                              ))}
                            </ul>
                          )}

                          {trendLoading && <p className="py-6 text-center text-sm text-neutral-500">Loading history…</p>}
                          {!trendLoading && trend?.points?.length > 0 && (
                            <>
                              <RiskTrendChart points={trend.points} />
                              {trend.points.length === 1 && (
                                <p className="mt-2 text-xs text-neutral-500">
                                  Only one check saved so far — run another later to see whether this improves.
                                </p>
                              )}
                            </>
                          )}
                          {!trendLoading && !trend?.points?.length && (
                            <p className="py-6 text-center text-sm text-neutral-500">
                              No earlier checks saved for this student.
                            </p>
                          )}
                        </Panel>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </TabPanel>
            )}

            {active === "groups" && (
              <TabPanel key="groups" id="groups" direction={direction}>
                <div className="space-y-4">
                  <Card>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="grid flex-1 gap-3 sm:grid-cols-2">
                        <Field label="Subject" hint="Leave on all subjects to group by overall performance" htmlFor="an-subject">
                          <Select id="an-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                            <option value="">All subjects</option>
                            {subjects.map((s) => (
                              <option key={s.subject_id} value={s.subject_id}>
                                {s.subject_name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="How many groups?" htmlFor="an-groups">
                          <Select id="an-groups" value={groupCount} onChange={(e) => setGroupCount(e.target.value)}>
                            {GROUP_COUNT_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <Button icon="ti-layout-grid" loading={groupsLoading} onClick={loadGroups} disabled={!schoolYear}>
                        Group students
                      </Button>
                    </div>
                  </Card>

                  {groupsError && (
                    <Alert variant="error" title="Could not group students">
                      {groupsError}
                    </Alert>
                  )}

                  {!groups && !groupsLoading && !groupsError && (
                    <Card>
                      <EmptyState
                        icon="ti-layout-grid"
                        title="No grouping yet"
                        subtitle="Press Group students to sort this selection into performance groups."
                      />
                    </Card>
                  )}

                  {groups && (
                    <div className={`space-y-4 transition-opacity ${groupsLoading ? "opacity-50" : "opacity-100"}`}>
                      <PerformanceGroups result={groups} />
                      <ClusterInsightPanel
                        key={`${groups.meta.school_year}-${groups.meta.grading_period}-${groups.meta.subject}-${groups.meta.n_clusters}`}
                        result={groups}
                      />
                    </div>
                  )}
                </div>
              </TabPanel>
            )}
          </AnimatePresence>
        )}
      </motion.div>
    </>
  );
}
