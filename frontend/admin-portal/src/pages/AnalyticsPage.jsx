import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useCallback } from "react";
import AppLayout from "../components/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import AIInsightPanel from "../components/AIInsightPanel";
import { pageVariants, listVariants } from "../utils/motion";

// ── API ───────────────────────────────────────────────────────────────────────
import {
  getSubjects as _getSubjects,
  getAiCluster as _getAiCluster,
  callGemini,
  runRiskAssessment as _runRiskAssessment,
  getRiskAssessmentLatest as _getRiskAssessmentLatest,
  getRiskAssessmentTrend as _getRiskAssessmentTrend,
} from "../api/enrollmentApi";

// ── Constants ─────────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { value: "overall",      label: "Overall"      },
  { value: "1st_quarter",  label: "1st Quarter"  },
  { value: "2nd_quarter",  label: "2nd Quarter"  },
  { value: "3rd_quarter",  label: "3rd Quarter"  },
  { value: "4th_quarter",  label: "4th Quarter"  },
  { value: "1st_semester", label: "1st Semester" },
  { value: "2nd_semester", label: "2nd Semester" },
];

const SCHOOL_LEVELS = [
  { value: "",                  label: "All Levels",   icon: "ti-layout-grid",   bg: "#fff0f0", color: "#e03131" },
  { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", bg: "#fdf5e8", color: "#c27a12" },
  { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          bg: "#f0e8fd", color: "#7c3aed" },
  { value: "elementary",        label: "Elementary",   icon: "ti-book",          bg: "#e8f0fd", color: "#2563eb" },
  { value: "junior_highschool", label: "Junior High",  icon: "ti-school",        bg: "#e8fdf0", color: "#16a34a" },
  { value: "senior_highschool", label: "Senior High",  icon: "ti-certificate",   bg: "#fde8f8", color: "#be185d" },
];

const GRADE_LEVELS_BY_LEVEL = {
  "":                ["All Grades"],
  nursery:           ["All Grades", "Nursery"],
  kindergarten:      ["All Grades", "Kindergarten"],
  elementary:        ["All Grades", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  junior_highschool: ["All Grades", "Grade 7", "Grade 8", "Grade 9", "Grade 10"],
  senior_highschool: ["All Grades", "Grade 11", "Grade 12"],
};

function buildSchoolYearOptions() {
  const current = new Date().getFullYear();
  const opts = [{ value: "", label: "All Years" }];
  for (let y = current + 1; y >= current - 3; y--) {
    opts.push({ value: `${y - 1}-${y}`, label: `${y - 1}–${y}` });
  }
  return opts;
}

function currentSchoolYear() {
  const now = new Date();
  const yr  = now.getFullYear();
  return now.getMonth() >= 7 ? `${yr}-${yr + 1}` : `${yr - 1}-${yr}`;
}

// Fixed status palette (good/warning/serious/critical) — reserved for state,
// never reused as a categorical series color. Exact validated hexes (see the
// dataviz skill's palette reference); warning/serious read sub-3:1 on white
// by design, so they're only ever used for a small dot/icon swatch next to a
// dark-ink text label — never as the label's own text color.
const RISK_LEVEL_META = {
  low:      { label: "Low",      order: 0, color: "#0ca30c", icon: "ti-shield-check"    },
  moderate: { label: "Moderate", order: 1, color: "#fab219", icon: "ti-alert-triangle"  },
  high:     { label: "High",     order: 2, color: "#ec835a", icon: "ti-alert-octagon"   },
  critical: { label: "Critical", order: 3, color: "#d03b3b", icon: "ti-alert-hexagon"   },
};
const RISK_LEVEL_ORDER = ["low", "moderate", "high", "critical"];

function riskLevelMeta(level) {
  return RISK_LEVEL_META[level] || { label: level || "Unknown", order: -1, color: "#a09890", icon: "ti-help-circle" };
}

// Silhouette score ranges from -1 to 1; these thresholds follow the
// conventional rule of thumb (< 0.25 weak / < 0.5 fair / >= 0.5 good
// separation) rather than anything specific to this dataset.
function silhouetteLabel(score) {
  if (score == null) return "N/A";
  const tier = score < 0.25 ? "Weak" : score < 0.5 ? "Fair" : "Good";
  return `${score.toFixed(2)} · ${tier}`;
}

// ── Shared style tokens (aligned with system design) ──────────────────────────
const s = {
  topbar: {
    background: "white",
    borderBottom: "1px solid #f5eaea",
    padding: "0 28px",
    height: 58,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
    boxShadow: "0 1px 8px rgba(224,49,49,0.04)",
  },
  topbarTitle: { fontSize: 15, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.01em" },
  topbarSub:   { fontSize: 11.5, color: "#b09090", marginTop: 1 },
  content:     { flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 },
  card: {
    background: "white",
    borderRadius: 12,
    border: "1px solid #f0ece4",
    boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
  },
  cardHeader: {
    padding: "14px 20px",
    borderBottom: "1px solid #f5eaea",
    borderRadius: "12px 12px 0 0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "linear-gradient(to right, #fdfafa, white)",
  },
  cardHeaderTitle: { fontSize: 13, fontWeight: 700, color: "#1a0a0a" },
  cardHeaderSub:   { fontSize: 11, color: "#b09090", marginTop: 1 },
  cardBody:        { padding: "18px 20px" },
  filterGroup: { display: "flex", flexDirection: "column", gap: 4, minWidth: 150 },
  filterLabel: {
    fontSize: 11, fontWeight: 600, color: "#8a8480",
    textTransform: "uppercase", letterSpacing: "0.05em",
  },
  select: {
    padding: "8px 12px", borderRadius: 8, border: "1px solid #ede9e1", fontSize: 13,
    color: "#3a3a3a", background: "white", cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif", outline: "none",
  },
  runBtn: {
    display: "flex", alignItems: "center", gap: 8,
    height: 38, padding: "0 20px", borderRadius: 9,
    background: "linear-gradient(135deg, #e03131, #c92a2a)", color: "white",
    border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    boxShadow: "0 4px 14px rgba(224,49,49,0.25)", transition: "all 0.12s",
  },
  emptyState: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", padding: "60px 20px",
    color: "#c0b8b0", textAlign: "center",
  },
};

// ── Scatter Plot ──────────────────────────────────────────────────────────────
// Plots each student by grade (x), attendance rate (y), and narrative rating
// (bubble size) — the same three signals the clustering itself uses, all
// visible directly instead of behind a PCA projection. Fixed axis ranges
// (grade 60-100, attendance 0-100%) keep the chart the same shape run to run
// instead of auto-zooming to whatever the current filter happens to return.
const PASSING_GRADE = 75; // DepEd "Did Not Meet Expectations" cutoff

// avg_narrative is 1 (Needs Improvement) to 3 (Outstanding); missing data
// falls back to the middle size rather than being hidden.
function narrativeRadius(avgNarrative) {
  if (avgNarrative == null)   return 5.5;
  if (avgNarrative < 1.5)     return 4;
  if (avgNarrative < 2.5)     return 6;
  return 8;
}

function ScatterPlot({ clusters, selectedStudent, onSelectStudent }) {
  // Hooks must run unconditionally on every render, before either early
  // return below — this was already true of the pre-existing
  // `if (!clusters...) return null` guard, and matters more now that
  // there's a second early return for the no-attendance-data case.
  const [hovered, setHovered] = useState(null);

  if (!clusters || clusters.length === 0) return null;

  const allPointsRaw = clusters.flatMap((c) =>
    c.students.map((st) => ({ ...st, color: c.color, clusterLabel: c.label }))
  );

  // Students missing an attendance record can't be positioned on this chart
  // (they still appear in the legend and student list below).
  const allPoints = allPointsRaw
    .filter((p) => p.attendance_rate != null)
    .map((p) => ({ ...p, plotX: p.grade, plotY: p.attendance_rate * 100 }));
  const omittedCount = allPointsRaw.length - allPoints.length;

  if (allPoints.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "#c0b8b0", fontSize: 13 }}>
        No attendance data available to chart these students.
      </div>
    );
  }

  const W = 700, H = 420, PAD = 50;
  const xs = allPoints.map((p) => p.plotX);
  const ys = allPoints.map((p) => p.plotY);

  // use reduce instead of spread — Math.min(...largeArray) can silently
  // fail in Firefox/Edge/older Chrome due to call-stack size limits.
  // Bounded to the familiar 60-100 grade / 0-100% attendance range, only
  // expanding further if a student actually falls outside it.
  const xMin = Math.min(xs.reduce((a, b) => Math.min(a, b), Infinity), 60);
  const xMax = Math.max(xs.reduce((a, b) => Math.max(a, b), -Infinity), 100);
  const yMin = Math.min(ys.reduce((a, b) => Math.min(a, b), Infinity), 0);
  const yMax = Math.max(ys.reduce((a, b) => Math.max(a, b), -Infinity), 100);

  // 8% padding so edge points don't sit directly on the axis lines
  const xPad   = (xMax - xMin || 1) * 0.08;
  const yPad   = (yMax - yMin || 1) * 0.08;
  const xRange = (xMax - xMin || 1) + xPad * 2;
  const yRange = (yMax - yMin || 1) + yPad * 2;

  const scaleX = (v) => PAD + ((v - (xMin - xPad)) / xRange) * (W - 2 * PAD);
  const scaleY = (v) => H - PAD - ((v - (yMin - yPad)) / yRange) * (H - 2 * PAD);

  const showPassingLine = PASSING_GRADE > xMin - xPad && PASSING_GRADE < xMax + xPad;

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", maxHeight: 420, background: "#fefcf9", borderRadius: 8, border: "1px solid #f0ece4" }}
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <g key={frac}>
            <line
              x1={PAD} x2={W - PAD}
              y1={scaleY(yMin - yPad + frac * yRange)}
              y2={scaleY(yMin - yPad + frac * yRange)}
              stroke="#f0ece4" strokeDasharray="4,4"
            />
            <line
              y1={PAD} y2={H - PAD}
              x1={scaleX(xMin - xPad + frac * xRange)}
              x2={scaleX(xMin - xPad + frac * xRange)}
              stroke="#f0ece4" strokeDasharray="4,4"
            />
          </g>
        ))}

        {/* Passing-grade reference line */}
        {showPassingLine && (
          <g>
            <line
              x1={scaleX(PASSING_GRADE)} x2={scaleX(PASSING_GRADE)}
              y1={PAD} y2={H - PAD}
              stroke="#e03131" strokeWidth={1.25} strokeDasharray="3,3" opacity={0.45}
            />
            <text
              x={scaleX(PASSING_GRADE) + 5} y={PAD + 12}
              fontSize="10" fill="#e03131" fontFamily="DM Sans" opacity={0.75}
            >
              Passing ({PASSING_GRADE})
            </text>
          </g>
        )}

        {/* Axes */}
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="#d8d4cc" />
        <line x1={PAD} x2={PAD}     y1={PAD}     y2={H - PAD} stroke="#d8d4cc" />

        {/* Axis labels */}
        <text x={W / 2} y={H - 10} textAnchor="middle" fontSize="11" fill="#a09890" fontFamily="DM Sans">
          Average Grade
        </text>
        <text
          x={14} y={H / 2} textAnchor="middle" fontSize="11" fill="#a09890"
          fontFamily="DM Sans" transform={`rotate(-90, 14, ${H / 2})`}
        >
          Attendance Rate (%)
        </text>

        {/* Data points */}
        {allPoints.map((pt) => {
          const cx = scaleX(pt.plotX);
          const cy = scaleY(pt.plotY);
          const isSelected = selectedStudent?.student_id === pt.student_id;
          const isHov      = hovered?.student_id === pt.student_id;
          const baseR      = narrativeRadius(pt.avg_narrative);
          const r          = isSelected ? baseR + 3 : isHov ? baseR + 2 : baseR;
          return (
            <g key={pt.student_id}>
              <circle
                cx={cx} cy={cy} r={r}
                fill={pt.color}
                fillOpacity={isSelected ? 1 : 0.75}
                stroke={isSelected ? "#1a0a0a" : isHov ? "#fff" : "none"}
                strokeWidth={isSelected ? 2.5 : 1.5}
                style={{ cursor: "pointer", transition: "r 0.15s, stroke 0.15s" }}
                onMouseEnter={() => setHovered(pt)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelectStudent(pt)}
              />
            </g>
          );
        })}

        {/* Tooltip */}
        {hovered && (() => {
          const tx    = scaleX(hovered.plotX);
          const ty    = scaleY(hovered.plotY);
          const tipW  = 210, tipH = 70;
          const flipX = tx + tipW + 10 > W - PAD;
          const flipY = ty - tipH - 10 < PAD;
          const rx    = flipX ? tx - tipW - 10 : tx + 12;
          const ry    = flipY ? ty + 12 : ty - tipH - 8;
          const attStr  = hovered.attendance_rate != null ? `${(hovered.attendance_rate * 100).toFixed(0)}%` : "—";
          const narrStr = hovered.avg_narrative   != null ? `${hovered.avg_narrative}/3`                     : "—";
          return (
            <g>
              <rect
                x={rx} y={ry} width={tipW} height={tipH} rx={8}
                fill="white" stroke="#e0dcd4" strokeWidth={1}
                filter="drop-shadow(0 2px 6px rgba(0,0,0,0.08))"
              />
              <text x={rx + 10} y={ry + 18} fontSize="12" fontWeight="700" fill="#1a0a0a" fontFamily="DM Sans">
                {hovered.student_name}
              </text>
              <text x={rx + 10} y={ry + 33} fontSize="11" fill="#8a8480" fontFamily="DM Sans">
                {hovered.student_number}
              </text>
              <text x={rx + 10} y={ry + 47} fontSize="11" fontWeight="600" fill={hovered.color} fontFamily="DM Sans">
                Grade: {hovered.grade} · {hovered.clusterLabel}
              </text>
              <text x={rx + 10} y={ry + 62} fontSize="11" fill="#8a8480" fontFamily="DM Sans">
                Att: {attStr} · Narrative: {narrStr}
              </text>
            </g>
          );
        })()}
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8, fontSize: 11, color: "#a09890" }}>
        <span style={{ fontWeight: 600, color: "#8a8480" }}>Bubble size = narrative rating:</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#b0a898" /></svg> Needs Improvement
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#b0a898" /></svg> Satisfactory
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <svg width="18" height="18"><circle cx="9" cy="9" r="8" fill="#b0a898" /></svg> Outstanding
        </span>
      </div>
      {omittedCount > 0 && (
        <div style={{ fontSize: 11, color: "#b0a898", marginTop: 6 }}>
          {omittedCount} student{omittedCount !== 1 ? "s" : ""} not shown above — no attendance record for this school year.
        </div>
      )}
    </>
  );
}

// ── Cluster Legend ────────────────────────────────────────────────────────────
function ClusterLegend({ clusters }) {
  if (!clusters) return null;
  return (
    <motion.div
      variants={listVariants.container}
      initial="hidden"
      animate="visible"
      style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
    >
      {clusters.map((c) => (
        <motion.div key={c.cluster_id} variants={listVariants.item} style={{
          flex: "1 1 180px", padding: "12px 16px", borderRadius: 10,
          border: `1.5px solid ${c.color}22`, background: `${c.color}08`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: c.color }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>{c.label}</span>
          </div>
          <div style={{ fontSize: 12, color: "#6a6460", lineHeight: 1.7 }}>
            <span style={{ fontWeight: 600 }}>{c.student_count}</span> student{c.student_count !== 1 ? "s" : ""}
            <span style={{ margin: "0 6px", color: "#d0c8c0" }}>·</span>
            Avg <span style={{ fontWeight: 600 }}>{c.avg_grade}</span>
            <span style={{ margin: "0 6px", color: "#d0c8c0" }}>·</span>
            Range {c.min_grade}–{c.max_grade}
          </div>
          <div style={{ fontSize: 11, color: "#9a9490", marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {c.avg_attendance != null && (
              <span>
                <i className="ti ti-calendar-check" style={{ fontSize: 10, marginRight: 3 }} />
                Att: <strong>{(c.avg_attendance * 100).toFixed(0)}%</strong>
              </span>
            )}
            {c.avg_narrative != null && (
              <span>
                <i className="ti ti-clipboard-text" style={{ fontSize: 10, marginRight: 3 }} />
                Narrative: <strong>{c.avg_narrative}/3</strong>
              </span>
            )}
          </div>
          {c.narrative_distribution && (
            <div style={{ fontSize: 10.5, color: "#a09890", marginTop: 4, display: "flex", gap: 7 }}>
              <span title="Outstanding"><span style={{ color: "#22c55e" }}>●</span> {c.narrative_distribution.outstanding}</span>
              <span title="Satisfactory"><span style={{ color: "#f59e0b" }}>●</span> {c.narrative_distribution.satisfactory}</span>
              <span title="Needs Improvement"><span style={{ color: "#ef4444" }}>●</span> {c.narrative_distribution.needs_improvement}</span>
            </div>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

// ── Student Detail Panel ──────────────────────────────────────────────────────
function StudentDetailPanel({ student, onClose }) {
  if (!student) return null;
  return (
    <div style={{
      background: "#fdfafa", border: "1px solid #f5eaea", borderRadius: 10,
      padding: "14px 18px", marginTop: 12,
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: `${student.color || "#e03131"}18`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <i className="ti ti-user" style={{ fontSize: 17, color: student.color || "#e03131" }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>{student.student_name}</div>
          <div style={{ fontSize: 11.5, color: "#8a8480", marginTop: 1 }}>
            {student.student_number} · Grade: <strong>{student.grade}</strong>
            {student.attendance_rate != null && <> · Att: <strong>{(student.attendance_rate * 100).toFixed(0)}%</strong></>}
            {student.avg_narrative   != null && <> · Narrative: <strong>{student.avg_narrative}/3</strong></>}
            {" · "}{student.clusterLabel}
          </div>
        </div>
      </div>
      <button onClick={onClose} style={{
        background: "white", border: "1px solid #ede9e1", borderRadius: 8,
        padding: "5px 12px", fontSize: 12, color: "#8a8480", cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s",
      }}>
        Close
      </button>
    </div>
  );
}

// ── Student Table ─────────────────────────────────────────────────────────────
function StudentTable({ clusters, selectedStudent, onSelectStudent }) {
  const isFirst = useIsFirstRender();

  if (!clusters) return null;

  const allStudents = clusters.flatMap((c) =>
    c.students.map((st) => ({ ...st, color: c.color, clusterLabel: c.label }))
  ).sort((a, b) => a.grade - b.grade);

  return (
    <div style={{ maxHeight: 360, overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#faf9f6", position: "sticky", top: 0 }}>
            <th style={thStyle}>Student</th>
            <th style={thStyle}>Number</th>
            <th style={thStyle}>Grade</th>
            <th style={thStyle}>Attendance</th>
            <th style={thStyle}>Narrative</th>
            <th style={thStyle}>Cluster</th>
          </tr>
        </thead>
        <motion.tbody
          variants={listVariants.container}
          initial={isFirst ? "hidden" : false}
          animate="visible"
        >
          {allStudents.map((st) => {
            const isSelected = selectedStudent?.student_id === st.student_id;
            return (
              <motion.tr
                key={st.student_id}
                variants={listVariants.item}
                onClick={() => onSelectStudent(st)}
                style={{
                  borderBottom: "1px solid #f5eaea",
                  cursor: "pointer",
                  background: isSelected ? `${st.color}10` : "white",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#fff8f6"; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "white"; }}
              >
                <td style={tdStyle}>{st.student_name}</td>
                <td style={tdStyle}>{st.student_number}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{st.grade}</td>
                <td style={tdStyle}>
                  {st.attendance_rate != null
                    ? `${(st.attendance_rate * 100).toFixed(0)}%`
                    : <span style={{ color: "#c0b8b0" }}>—</span>}
                </td>
                <td style={tdStyle}>
                  {st.avg_narrative != null
                    ? `${st.avg_narrative}/3`
                    : <span style={{ color: "#c0b8b0" }}>—</span>}
                </td>
                <td style={tdStyle}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 600,
                    background: `${st.color}14`, color: st.color,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.color }} />
                    {st.clusterLabel}
                  </span>
                </td>
              </motion.tr>
            );
          })}
        </motion.tbody>
      </table>
    </div>
  );
}

const thStyle = {
  padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700,
  color: "#a09890", textTransform: "uppercase", letterSpacing: "0.05em",
  borderBottom: "1px solid #f5eaea",
};
const tdStyle = { padding: "10px 16px", color: "#3a3a3a" };

// ── Cluster AI Insight Panel ──────────────────────────────────────────────────
// Sends cluster data to Gemini for interpretation + actionable recommendations.
// Uses a `key` prop on the parent so this fully remounts on each new analysis.
function ClusterInsightPanel({ result }) {
  const onFetch = () => {
    const clusterDetails = result.clusters
      .map((c) => {
        const attStr  = c.avg_attendance != null ? `, att=${(c.avg_attendance * 100).toFixed(0)}%` : "";
        const narrStr = c.avg_narrative  != null ? `, narrative=${c.avg_narrative}/3`              : "";
        return `${c.label}: ${c.student_count} student(s), avg grade=${c.avg_grade}, range=[${c.min_grade}–${c.max_grade}]${attStr}${narrStr}`;
      })
      .join("\n");

    return callGemini("clustering_insights", {
      school_year:      result.meta.school_year,
      grading_period:   result.meta.grading_period,
      grade_level:      result.meta.grade_level || "All Grade Levels",
      subject:          result.meta.subject,
      total_students:   result.meta.total_students,
      n_clusters:       result.meta.n_clusters,
      cluster_details:  clusterDetails,
      include_recommendations: true,
    });
  };

  return (
    <AIInsightPanel
      title="AI Interpretation & Recommendations"
      description="Powered by Gemini · Analysis of clustering results with actionable insights"
      disabled={false}
      autoFetch={true}
      onFetch={onFetch}
    />
  );
}

// ── At-Risk Students ─────────────────────────────────────────────────────────
// Persisted rule-based risk scoring (ai/risk_views.py) — a weighted composite
// of grade/attendance/narrative signals, not a trained model; see that
// endpoint's docstring for why. Distinct from the clustering above: results
// are saved server-side so they can be tracked run over run.

function RiskLevelBadge({ level }) {
  const meta = riskLevelMeta(level);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 600,
      background: `${meta.color}18`, color: "#1a0a0a",
    }}>
      <i className={`ti ${meta.icon}`} style={{ fontSize: 11, color: meta.color }} />
      {meta.label}
    </span>
  );
}

function RiskLevelLegend() {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: "#8a8480" }}>
      {RISK_LEVEL_ORDER.map((lvl) => {
        const meta = RISK_LEVEL_META[lvl];
        return (
          <span key={lvl} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <i className={`ti ${meta.icon}`} style={{ fontSize: 12, color: meta.color }} />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

// Line chart, single series (one student's risk_score over time). The
// connecting line stays a neutral, structural gray — per-point color is the
// status palette (each run's risk_level), so the trajectory itself reads as
// a sequence of state changes rather than one flat series color.
function RiskTrendChart({ points }) {
  const [hovered, setHovered] = useState(null);
  if (!points || points.length === 0) return null;

  const W = 700, H = 260, PAD_L = 40, PAD_R = 20, PAD_T = 16, PAD_B = 34;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const scaleX = (i) => (points.length === 1 ? PAD_L + innerW / 2 : PAD_L + (i / (points.length - 1)) * innerW);
  const scaleY = (score) => PAD_T + innerH - (score / 100) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scaleY(p.risk_score)}`)
    .join(" ");

  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", maxHeight: H, background: "#fefcf9", borderRadius: 8, border: "1px solid #f0ece4" }}
    >
      {/* Threshold gridlines at the exact risk_level cut points (25/50/75) */}
      {[25, 50, 75].map((mark) => (
        <line key={mark} x1={PAD_L} x2={W - PAD_R} y1={scaleY(mark)} y2={scaleY(mark)} stroke="#f0ece4" strokeDasharray="4,4" />
      ))}
      {[0, 25, 50, 75, 100].map((mark) => (
        <text key={mark} x={PAD_L - 8} y={scaleY(mark) + 3} textAnchor="end" fontSize="10" fill="#a09890" fontFamily="DM Sans">
          {mark}
        </text>
      ))}

      {/* Axes */}
      <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} stroke="#d8d4cc" />
      <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={H - PAD_B} stroke="#d8d4cc" />

      {/* X axis dates */}
      {points.map((p, i) => (
        <text key={p.run_id} x={scaleX(i)} y={H - PAD_B + 16} textAnchor="middle" fontSize="9.5" fill="#a09890" fontFamily="DM Sans">
          {fmtDate(p.created_at)}
        </text>
      ))}

      {/* Connecting line — neutral/structural, 2px per mark spec */}
      <path d={linePath} fill="none" stroke="#c0b8b0" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* Points — status-colored, 2px surface ring (mark spec) */}
      {points.map((p, i) => {
        const meta = riskLevelMeta(p.risk_level);
        const isHov = hovered?.run_id === p.run_id;
        return (
          <circle
            key={p.run_id}
            cx={scaleX(i)} cy={scaleY(p.risk_score)} r={isHov ? 7 : 5.5}
            fill={meta.color} stroke="#fefcf9" strokeWidth={2.5}
            style={{ cursor: "pointer", transition: "r 0.12s" }}
            onMouseEnter={() => setHovered(p)}
            onMouseLeave={() => setHovered(null)}
          />
        );
      })}

      {/* Tooltip */}
      {hovered && (() => {
        const i = points.findIndex((p) => p.run_id === hovered.run_id);
        const tx = scaleX(i), ty = scaleY(hovered.risk_score);
        const tipW = 180, tipH = 62;
        const flipX = tx + tipW + 10 > W - PAD_R;
        const rx = flipX ? tx - tipW - 10 : tx + 12;
        const ry = Math.max(PAD_T, ty - tipH - 8);
        const meta = riskLevelMeta(hovered.risk_level);
        return (
          <g>
            <rect x={rx} y={ry} width={tipW} height={tipH} rx={8} fill="white" stroke="#e0dcd4" strokeWidth={1} filter="drop-shadow(0 2px 6px rgba(0,0,0,0.08))" />
            <text x={rx + 10} y={ry + 18} fontSize="12" fontWeight="700" fill="#1a0a0a" fontFamily="DM Sans">
              {fmtDate(hovered.created_at)}
            </text>
            <text x={rx + 10} y={ry + 33} fontSize="11" fontWeight="600" fill={meta.color} fontFamily="DM Sans">
              Risk {hovered.risk_score} · {meta.label}
            </text>
            <text x={rx + 10} y={ry + 48} fontSize="10.5" fill="#8a8480" fontFamily="DM Sans">
              {hovered.school_year} · {hovered.grading_period}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

function riskSortValue(row, key) {
  if (key === "risk_level") return riskLevelMeta(row.risk_level).order;
  return row[key];
}

function RiskTable({ scores, selectedStudentId, onSelectStudent, sortKey, sortDir, onSort }) {
  const isFirst = useIsFirstRender();
  if (!scores) return null;

  const sorted = [...scores].sort((a, b) => {
    const av = riskSortValue(a, sortKey);
    const bv = riskSortValue(b, sortKey);
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
    return sortDir === "asc" ? cmp : -cmp;
  });

  function headerFor(key, label) {
    const active = sortKey === key;
    const icon = active ? (sortDir === "asc" ? "ti-chevron-up" : "ti-chevron-down") : "ti-selector";
    return (
      <th style={{ ...thStyle, cursor: "pointer", userSelect: "none" }} onClick={() => onSort(key)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          {label}
          <i className={`ti ${icon}`} style={{ fontSize: 11, opacity: active ? 1 : 0.4 }} />
        </span>
      </th>
    );
  }

  return (
    <div style={{ maxHeight: 360, overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#faf9f6", position: "sticky", top: 0 }}>
            {headerFor("student_name", "Student")}
            <th style={thStyle}>Number</th>
            {headerFor("risk_score", "Risk Score")}
            {headerFor("risk_level", "Level")}
            <th style={thStyle}>Grade</th>
            <th style={thStyle}>Attendance</th>
            <th style={thStyle}>Narrative</th>
          </tr>
        </thead>
        <motion.tbody variants={listVariants.container} initial={isFirst ? "hidden" : false} animate="visible">
          {sorted.map((row) => {
            const meta = riskLevelMeta(row.risk_level);
            const isSelected = selectedStudentId === row.student_id;
            return (
              <motion.tr
                key={row.student_id}
                variants={listVariants.item}
                onClick={() => onSelectStudent(row)}
                style={{
                  borderBottom: "1px solid #f5eaea",
                  cursor: "pointer",
                  background: isSelected ? `${meta.color}10` : "white",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#fff8f6"; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "white"; }}
              >
                <td style={tdStyle}>{row.student_name || `Student #${row.student_id}`}</td>
                <td style={tdStyle}>{row.student_number || "—"}</td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{row.risk_score}</td>
                <td style={tdStyle}><RiskLevelBadge level={row.risk_level} /></td>
                <td style={tdStyle}>{row.grade_component ?? <span style={{ color: "#c0b8b0" }}>—</span>}</td>
                <td style={tdStyle}>{row.attendance_component ?? <span style={{ color: "#c0b8b0" }}>—</span>}</td>
                <td style={tdStyle}>{row.narrative_component ?? <span style={{ color: "#c0b8b0" }}>—</span>}</td>
              </motion.tr>
            );
          })}
        </motion.tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── PAGE COMPONENT ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function AnalyticsPage() {
  usePageTitle("Analytics");

  const [schoolYear,      setSchoolYear]      = useState(currentSchoolYear());
  const [gradingPeriod,   setGradingPeriod]   = useState("1st_quarter");
  const [subjectId,       setSubjectId]       = useState("");
  const [schoolLevel,     setSchoolLevel]     = useState("");
  const [gradeLevel,      setGradeLevel]      = useState("");
  const [nClusters,       setNClusters]       = useState(3);

  const schoolYearOptions = buildSchoolYearOptions();
  const gradeOptions      = GRADE_LEVELS_BY_LEVEL[schoolLevel] ?? ["All Grades"];
  const hasFilters        = schoolYear !== currentSchoolYear() || gradingPeriod !== "1st_quarter" || schoolLevel || gradeLevel || subjectId || nClusters !== 3;

  useEffect(() => { setGradeLevel(""); }, [schoolLevel]);

  function clearFilters() {
    setSchoolYear(currentSchoolYear());
    setGradingPeriod("1st_quarter");
    setSchoolLevel("");
    setGradeLevel("");
    setSubjectId("");
    setNClusters(3);
  }
  const [subjects,        setSubjects]        = useState([]);
  const [result,          setResult]          = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);

  useEffect(() => {
    _getSubjects().then((data) => {
      const list = Array.isArray(data) ? data : data.results || [];
      setSubjects(list);
    }).catch(() => {});
  }, []);

  const runClustering = useCallback(async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setSelectedStudent(null);

    const params = new URLSearchParams({
      school_year:    schoolYear,
      grading_period: gradingPeriod,
      n_clusters:     String(nClusters),
    });
    if (subjectId)   params.set("subject_id",   subjectId);
    if (schoolLevel) params.set("school_level", schoolLevel);
    if (gradeLevel)  params.set("grade_level",  gradeLevel);

    try {
      const data = await _getAiCluster(Object.fromEntries(params));
      setResult(data);
    } catch (e) {
      const httpStatus = e.response?.status;
      if (httpStatus === 400) {
        const msg = e.response?.data?.error || "Not enough grade data for the selected filters.";
        setError(msg);
      } else {
        setError(e.response?.data?.error || e.message || "Clustering failed.");
      }
    } finally {
      setLoading(false);
    }
  }, [schoolYear, gradingPeriod, subjectId, schoolLevel, gradeLevel, nClusters, setLoading, setError, setResult, setSelectedStudent]);

  // ── At-risk students (persisted rule-based scoring) ──────────────────────
  // Reuses the same school_year/grading_period/school_level/grade_level chips
  // above — n_clusters and subject_id don't apply to a whole-student score.
  const [riskResult,          setRiskResult]          = useState(null);
  const [riskLoading,         setRiskLoading]         = useState(false);
  const [riskError,           setRiskError]           = useState("");
  const [riskIsLatest,        setRiskIsLatest]        = useState(false);
  const [riskSort,            setRiskSort]            = useState({ key: "risk_score", dir: "desc" });
  const [selectedRiskStudent, setSelectedRiskStudent] = useState(null);
  const [riskTrend,           setRiskTrend]           = useState(null);
  const [riskTrendLoading,    setRiskTrendLoading]    = useState(false);

  useEffect(() => {
    _getRiskAssessmentLatest().then((data) => {
      setRiskResult(data);
      setRiskIsLatest(true);
    }).catch(() => {}); // no saved runs yet — leave the empty state showing
  }, []);

  const runRiskAssessment = useCallback(async () => {
    setRiskLoading(true);
    setRiskError("");
    setSelectedRiskStudent(null);
    setRiskTrend(null);

    const payload = { school_year: schoolYear, grading_period: gradingPeriod };
    if (schoolLevel) payload.school_level = schoolLevel;
    if (gradeLevel)  payload.grade_level  = gradeLevel;

    try {
      const data = await _runRiskAssessment(payload);
      setRiskResult(data);
      setRiskIsLatest(false);
    } catch (e) {
      setRiskError(e.response?.data?.detail || e.message || "Risk assessment failed.");
    } finally {
      setRiskLoading(false);
    }
  }, [schoolYear, gradingPeriod, schoolLevel, gradeLevel, setRiskLoading, setRiskError, setSelectedRiskStudent, setRiskTrend, setRiskResult, setRiskIsLatest]);

  const handleRiskSort = useCallback((key) => {
    setRiskSort((prev) => (
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "student_name" ? "asc" : "desc" }
    ));
  }, [setRiskSort]);

  const selectRiskStudent = useCallback(async (row) => {
    setSelectedRiskStudent(row);
    setRiskTrend(null);
    setRiskTrendLoading(true);
    try {
      const data = await _getRiskAssessmentTrend(row.student_id);
      setRiskTrend(data);
    } catch {
      setRiskTrend(null);
    } finally {
      setRiskTrendLoading(false);
    }
  }, [setSelectedRiskStudent, setRiskTrend, setRiskTrendLoading]);

  const isFirstRender = useIsFirstRender();

  return (
    <AppLayout>
      {/* Topbar */}
      <div style={s.topbar}>
        <motion.div
          initial={isFirstRender ? { opacity: 0, y: -8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        >
          <div style={s.topbarTitle}>Analytics</div>
          <div style={s.topbarSub}>K-Means clustering · Grades, attendance & behavior segmentation · S.Y. {schoolYear}</div>
        </motion.div>
      </div>

      {/* Content */}
      <motion.div
        style={s.content}
        variants={pageVariants.container}
        initial={isFirstRender ? "hidden" : false}
        animate="visible"
      >

        {/* ── Filters ── */}
        <motion.div
          variants={pageVariants.item}
          style={{
            background: "white", border: "1px solid #f5eaea",
            borderRadius: 14, padding: "18px 20px",
            boxShadow: "0 2px 12px rgba(224,49,49,0.05)",
            display: "flex", flexDirection: "column", gap: 0,
          }}
        >
          {/* Row 1: action buttons */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>Analysis Parameters</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <AnimatePresence>
                {hasFilters && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.88 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.88 }}
                    transition={{ duration: 0.14 }}
                    whileTap={{ scale: 0.93 }}
                    onClick={clearFilters}
                    style={{ height: 38, padding: "0 14px", background: "white", border: "1.5px solid #fca5a5", borderRadius: 10, fontSize: 12, fontWeight: 600, color: "#b91c1c", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <i className="ti ti-filter-off" style={{ fontSize: 13 }} />Clear
                  </motion.button>
                )}
              </AnimatePresence>
              <motion.button
                onClick={runClustering}
                disabled={loading}
                whileHover={loading ? {} : { scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }}
                whileTap={loading ? {} : { scale: 0.96 }}
                transition={{ duration: 0.12 }}
                style={{
                  ...s.runBtn,
                  opacity: loading ? 0.6 : 1,
                  cursor:  loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? (
                  <><i className="ti ti-loader-2" style={{ fontSize: 14, animation: "spin 0.8s linear infinite" }} />Running…</>
                ) : (
                  <><i className="ti ti-chart-dots-3" style={{ fontSize: 14 }} />Run Analysis</>
                )}
              </motion.button>
              <motion.button
                onClick={runRiskAssessment}
                disabled={riskLoading}
                whileHover={riskLoading ? {} : { scale: 1.02, boxShadow: "0 6px 20px rgba(217,119,6,0.35)" }}
                whileTap={riskLoading ? {} : { scale: 0.96 }}
                transition={{ duration: 0.12 }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  height: 38, padding: "0 20px", borderRadius: 9,
                  background: "linear-gradient(135deg, #d97706, #b45309)", color: "white",
                  border: "none", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                  boxShadow: "0 4px 14px rgba(217,119,6,0.25)", transition: "all 0.12s",
                  opacity: riskLoading ? 0.6 : 1,
                  cursor: riskLoading ? "not-allowed" : "pointer",
                }}
              >
                {riskLoading ? (
                  <><i className="ti ti-loader-2" style={{ fontSize: 14, animation: "spin 0.8s linear infinite" }} />Assessing…</>
                ) : (
                  <><i className="ti ti-shield-exclamation" style={{ fontSize: 14 }} />Assess Risk</>
                )}
              </motion.button>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "#f5eaea", margin: "14px 0" }} />

          {/* Chip rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* School Year chips */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>School Year</div>
              <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {schoolYearOptions.map((o) => {
                  const active = schoolYear === o.value;
                  return (
                    <motion.button key={o.value}
                      layout
                      initial={false}
                      animate={{
                        backgroundColor: active ? "#fff0f0" : "#ffffff",
                        color:           active ? "#e03131" : "#9a7070",
                        borderColor:     active ? "#e03131" : "#f0e4e4",
                      }}
                      transition={{ layout: { type: "spring", stiffness: 400, damping: 36 }, duration: 0.18, ease: "easeOut" }}
                      onClick={() => setSchoolYear(o.value)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: "1.5px solid", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                    >
                      <i className="ti ti-calendar" style={{ fontSize: 12 }} />
                      {o.label}
                    </motion.button>
                  );
                })}
              </motion.div>
            </div>

            {/* Grading Period chips */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Grading Period</div>
              <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {PERIOD_OPTIONS.map((p) => {
                  const active = gradingPeriod === p.value;
                  return (
                    <motion.button key={p.value}
                      layout
                      initial={false}
                      animate={{
                        backgroundColor: active ? "#fff0f0" : "#ffffff",
                        color:           active ? "#e03131" : "#9a7070",
                        borderColor:     active ? "#e03131" : "#f0e4e4",
                      }}
                      transition={{ layout: { type: "spring", stiffness: 400, damping: 36 }, duration: 0.18, ease: "easeOut" }}
                      onClick={() => setGradingPeriod(p.value)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: "1.5px solid", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                    >
                      {p.label}
                    </motion.button>
                  );
                })}
              </motion.div>
            </div>

            {/* School Level chips */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>School Level</div>
              <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {SCHOOL_LEVELS.map((lvl) => {
                  const active = schoolLevel === lvl.value;
                  return (
                    <motion.button key={lvl.value}
                      layout
                      initial={false}
                      animate={{
                        backgroundColor: active ? lvl.bg    : "#ffffff",
                        color:           active ? lvl.color : "#9a7070",
                        borderColor:     active ? lvl.color : "#f0e4e4",
                      }}
                      transition={{ layout: { type: "spring", stiffness: 400, damping: 36 }, duration: 0.18, ease: "easeOut" }}
                      onClick={() => setSchoolLevel(lvl.value)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: "1.5px solid", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                    >
                      <i className={`ti ${lvl.icon}`} style={{ fontSize: 12 }} />
                      {lvl.label}
                    </motion.button>
                  );
                })}
              </motion.div>
            </div>

            {/* Grade Level chips — cascading, slides open when a school level is selected */}
            <div style={{
              maxHeight: schoolLevel !== "" ? 200 : 0,
              overflow: "hidden",
              opacity: schoolLevel !== "" ? 1 : 0,
              marginTop: schoolLevel !== "" ? 0 : -12,
              transition: "max-height 0.22s ease, opacity 0.18s ease, margin-top 0.22s ease",
              pointerEvents: schoolLevel !== "" ? "auto" : "none",
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Grade Level</div>
                <motion.div layout style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {gradeOptions.map((g, idx) => {
                    const val    = g === "All Grades" ? "" : g;
                    const active = gradeLevel === val;
                    return (
                      <motion.button key={`${schoolLevel}-${g}`}
                        layout
                        initial={{ opacity: 0, y: 6, backgroundColor: "#ffffff", color: "#9a7070", borderColor: "#f0e4e4" }}
                        animate={{
                          opacity: 1, y: 0,
                          backgroundColor: active ? "#fff0f0" : "#ffffff",
                          color:           active ? "#e03131" : "#9a7070",
                          borderColor:     active ? "#e03131" : "#f0e4e4",
                        }}
                        transition={{
                          opacity:         { duration: 0.16, ease: "easeOut", delay: idx * 0.03 },
                          y:               { duration: 0.16, ease: "easeOut", delay: idx * 0.03 },
                          backgroundColor: { duration: 0.18, ease: "easeOut" },
                          color:           { duration: 0.18, ease: "easeOut" },
                          borderColor:     { duration: 0.18, ease: "easeOut" },
                          layout:          { type: "spring", stiffness: 400, damping: 36 },
                        }}
                        onClick={() => setGradeLevel(val)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: "1.5px solid", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                      >
                        {g}
                      </motion.button>
                    );
                  })}
                </motion.div>
              </div>
            </div>

            {/* Subject + Clusters row — selects kept since lists are long */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={s.filterGroup}>
                <label style={s.filterLabel}>Subject</label>
                <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={{ ...s.select, minWidth: 220 }}>
                  <option value="">Overall (All Subjects)</option>
                  {subjects.map((sub) => (
                    <option key={sub.subject_id} value={sub.subject_id}>
                      {sub.subject_code} — {sub.subject_name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={s.filterGroup}>
                <label style={s.filterLabel}>Clusters (k)</label>
                <select value={nClusters} onChange={(e) => setNClusters(Number(e.target.value))} style={{ ...s.select, width: 72 }}>
                  {[2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

          </div>
        </motion.div>

        {/* ── Error ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              key="error-banner"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              style={{
                background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10,
                display: "flex", alignItems: "center", gap: 10, padding: "13px 18px",
              }}
            >
              <i className="ti ti-alert-circle" style={{ fontSize: 16, color: "#e03131", flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "#b91c1c" }}>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Loading ── */}
        <AnimatePresence>
          {loading && (
            <motion.div
              key="loading-card"
              variants={pageVariants.item}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: 8 }}
              style={s.card}
            >
              <div style={s.emptyState}>
                <div style={{
                  width: 46, height: 46, borderRadius: 12,
                  background: "linear-gradient(135deg, #fff0f0, #fde8e8)",
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
                }}>
                  <i className="ti ti-loader-2" style={{ fontSize: 20, color: "#e03131", animation: "spin 0.8s linear infinite" }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#8a8480" }}>Running K-Means clustering…</div>
                <div style={{ fontSize: 12, color: "#b0a898", marginTop: 4 }}>Analyzing grades, attendance, and narrative data</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Empty state ── */}
        <AnimatePresence>
          {!loading && !result && !error && (
            <motion.div
              key="empty-state"
              variants={pageVariants.item}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: 8 }}
              style={s.card}
            >
              <div style={s.emptyState}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: "linear-gradient(135deg, #fff0f0, #fde8e8)",
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
                }}>
                  <i className="ti ti-chart-dots-3" style={{ fontSize: 24, color: "#e8a0a0" }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#8a8480" }}>No analysis yet</div>
                <div style={{ fontSize: 12, color: "#b0a898", marginTop: 4, maxWidth: 340, lineHeight: 1.6 }}>
                  Select your filters above and click{" "}
                  <strong style={{ color: "#e03131" }}>Run Analysis</strong>{" "}
                  to cluster students by their academic performance.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Results ── */}
        <AnimatePresence mode="wait">
          {result && (
            <motion.div
              key={`${result.meta.school_year}-${result.meta.grading_period}-${result.meta.school_level}-${result.meta.grade_level}-${result.meta.subject}-${result.meta.n_clusters}`}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
              variants={pageVariants.container}
              style={{ display: "contents" }}
            >
              {/* Meta chips */}
              <motion.div
                variants={listVariants.container}
                initial="hidden"
                animate="visible"
                style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
              >
                {[
                  { label: "Students",    value: result.meta.total_students,                                                                                            icon: "ti-users"        },
                  { label: "Grade Level", value: result.meta.grade_level || "All",                                                                                      icon: "ti-school"       },
                  { label: "Subject",     value: result.meta.subject,                                                                                                   icon: "ti-book"         },
                  { label: "Period",      value: PERIOD_OPTIONS.find((p) => p.value === result.meta.grading_period)?.label || result.meta.grading_period,               icon: "ti-calendar"     },
                  { label: "Clusters",    value: result.meta.n_clusters,                                                                                                icon: "ti-chart-dots-3" },
                  { label: "Cluster Quality", value: silhouetteLabel(result.meta.silhouette_score),                                                                     icon: "ti-gauge"        },
                ].map((m) => (
                  <motion.div key={m.label} variants={listVariants.item} style={{
                    flex: "1 1 130px", padding: "11px 14px", borderRadius: 10,
                    background: "white", border: "1px solid #f0ece4",
                    display: "flex", alignItems: "center", gap: 10,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: "linear-gradient(135deg, #fff0f0, #fde8e8)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <i className={`ti ${m.icon}`} style={{ fontSize: 14, color: "#e03131" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#a09890", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a", marginTop: 1 }}>{m.value}</div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              {/* Cluster Overview */}
              <motion.div variants={pageVariants.item} style={s.card}>
                <div style={s.cardHeader}>
                  <div>
                    <div style={s.cardHeaderTitle}>Cluster Overview</div>
                    <div style={s.cardHeaderSub}>Performance bands identified by K-Means</div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "3px 10px",
                    borderRadius: 20, background: "#fff0f0", color: "#e03131",
                  }}>
                    k = {result.meta.n_clusters}
                    {result.meta.suggested_n_clusters != null &&
                      result.meta.suggested_n_clusters !== result.meta.n_clusters && (
                        <span style={{ fontWeight: 500, opacity: 0.75 }}>
                          {" "}(suggested: {result.meta.suggested_n_clusters})
                        </span>
                      )}
                  </span>
                </div>
                <div style={s.cardBody}>
                  <ClusterLegend clusters={result.clusters} />
                </div>
              </motion.div>

              {/* Scatter Plot */}
              <motion.div variants={pageVariants.item} style={s.card}>
                <div style={s.cardHeader}>
                  <div>
                    <div style={s.cardHeaderTitle}>Grade vs. Attendance Map</div>
                    <div style={s.cardHeaderSub}>Each bubble is a student · position = grade &amp; attendance · size = narrative rating · click for details</div>
                  </div>
                </div>
                <div style={s.cardBody}>
                  <ScatterPlot
                    clusters={result.clusters}
                    selectedStudent={selectedStudent}
                    onSelectStudent={setSelectedStudent}
                  />
                  <StudentDetailPanel student={selectedStudent} onClose={() => setSelectedStudent(null)} />
                </div>
              </motion.div>

              {/* Student List */}
              <motion.div variants={pageVariants.item} style={{ ...s.card, overflow: "hidden" }}>
                <div style={s.cardHeader}>
                  <div>
                    <div style={s.cardHeaderTitle}>Student List</div>
                    <div style={s.cardHeaderSub}>All clustered students · sorted by grade (lowest first)</div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "3px 10px",
                    borderRadius: 20, background: "#f5f3ef", color: "#6a6460",
                  }}>
                    {result.meta.total_students} student{result.meta.total_students !== 1 ? "s" : ""}
                  </span>
                </div>
                <StudentTable
                  clusters={result.clusters}
                  selectedStudent={selectedStudent}
                  onSelectStudent={setSelectedStudent}
                />
              </motion.div>

              {/* AI Interpretation & Recommendations
                  key on ClusterInsightPanel forces a full remount on each new
                  analysis run so stale output never bleeds into the new one. */}
              <motion.div variants={pageVariants.item}>
                <ClusterInsightPanel
                  key={`${result.meta.school_year}-${result.meta.grading_period}-${result.meta.school_level}-${result.meta.grade_level}-${result.meta.subject}-${result.meta.n_clusters}`}
                  result={result}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── At-Risk Students ── */}
        <motion.div variants={pageVariants.item} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a0a0a" }}>At-Risk Students</div>
            <div style={s.topbarSub}>Persisted, rule-based risk scoring · weighted grade / attendance / narrative signals</div>
          </div>
        </motion.div>

        <AnimatePresence>
          {riskError && (
            <motion.div
              key="risk-error-banner"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              style={{
                background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10,
                display: "flex", alignItems: "center", gap: 10, padding: "13px 18px",
              }}
            >
              <i className="ti ti-alert-circle" style={{ fontSize: 16, color: "#e03131", flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "#b91c1c" }}>{riskError}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {riskLoading && (
            <motion.div
              key="risk-loading-card"
              variants={pageVariants.item}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: 8 }}
              style={s.card}
            >
              <div style={s.emptyState}>
                <div style={{
                  width: 46, height: 46, borderRadius: 12,
                  background: "linear-gradient(135deg, #fef3e2, #fde8c8)",
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
                }}>
                  <i className="ti ti-loader-2" style={{ fontSize: 20, color: "#d97706", animation: "spin 0.8s linear infinite" }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#8a8480" }}>Computing risk scores…</div>
                <div style={{ fontSize: 12, color: "#b0a898", marginTop: 4 }}>Scoring every enrolled student for the selected filters</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!riskLoading && !riskResult && !riskError && (
            <motion.div
              key="risk-empty-state"
              variants={pageVariants.item}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: 8 }}
              style={s.card}
            >
              <div style={s.emptyState}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: "linear-gradient(135deg, #fef3e2, #fde8c8)",
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
                }}>
                  <i className="ti ti-shield-exclamation" style={{ fontSize: 24, color: "#e8b870" }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#8a8480" }}>No risk assessment yet</div>
                <div style={{ fontSize: 12, color: "#b0a898", marginTop: 4, maxWidth: 340, lineHeight: 1.6 }}>
                  Click <strong style={{ color: "#d97706" }}>Assess Risk</strong> above to score every
                  enrolled student for the selected school year and period.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {riskResult && !riskLoading && (
            <motion.div
              key={`risk-${riskResult.run_id}`}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
              variants={pageVariants.container}
              style={{ display: "contents" }}
            >
              {/* Meta chips */}
              <motion.div
                variants={listVariants.container}
                initial="hidden"
                animate="visible"
                style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
              >
                {[
                  { label: "Students",    value: riskResult.student_count, icon: "ti-users" },
                  { label: "School Year", value: riskResult.school_year,   icon: "ti-calendar" },
                  { label: "Period",      value: PERIOD_OPTIONS.find((p) => p.value === riskResult.grading_period)?.label || riskResult.grading_period, icon: "ti-calendar-time" },
                  { label: "Computed",    value: new Date(riskResult.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), icon: "ti-clock" },
                ].map((m) => (
                  <motion.div key={m.label} variants={listVariants.item} style={{
                    flex: "1 1 150px", padding: "11px 14px", borderRadius: 10,
                    background: "white", border: "1px solid #f0ece4",
                    display: "flex", alignItems: "center", gap: 10,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: "linear-gradient(135deg, #fef3e2, #fde8c8)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <i className={`ti ${m.icon}`} style={{ fontSize: 14, color: "#d97706" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#a09890", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a", marginTop: 1 }}>{m.value}</div>
                    </div>
                  </motion.div>
                ))}
                {riskIsLatest && (
                  <motion.div variants={listVariants.item} style={{
                    flex: "1 1 150px", padding: "11px 14px", borderRadius: 10,
                    background: "#fffbeb", border: "1px solid #fde68a",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <i className="ti ti-history" style={{ fontSize: 14, color: "#b45309" }} />
                    <span style={{ fontSize: 11.5, color: "#92400e", fontWeight: 600 }}>Showing last saved run</span>
                  </motion.div>
                )}
              </motion.div>

              {/* Risk table */}
              <motion.div variants={pageVariants.item} style={{ ...s.card, overflow: "hidden" }}>
                <div style={s.cardHeader}>
                  <div>
                    <div style={s.cardHeaderTitle}>Risk Breakdown</div>
                    <div style={s.cardHeaderSub}>Component risk contribution shown 0–100 (higher = more at-risk) · click a row for its trend</div>
                  </div>
                  <RiskLevelLegend />
                </div>
                <RiskTable
                  scores={riskResult.scores}
                  selectedStudentId={selectedRiskStudent?.student_id}
                  onSelectStudent={selectRiskStudent}
                  sortKey={riskSort.key}
                  sortDir={riskSort.dir}
                  onSort={handleRiskSort}
                />
              </motion.div>

              {/* Trend for the selected student */}
              <AnimatePresence>
                {selectedRiskStudent && (
                  <motion.div
                    key={`trend-${selectedRiskStudent.student_id}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.16 }}
                    style={s.card}
                  >
                    <div style={s.cardHeader}>
                      <div>
                        <div style={s.cardHeaderTitle}>
                          {selectedRiskStudent.student_name || `Student #${selectedRiskStudent.student_id}`} · Risk Over Time
                        </div>
                        <div style={s.cardHeaderSub}>Risk score across every saved assessment run for this student</div>
                      </div>
                      <button
                        onClick={() => setSelectedRiskStudent(null)}
                        style={{
                          background: "white", border: "1px solid #ede9e1", borderRadius: 8,
                          padding: "5px 12px", fontSize: 12, color: "#8a8480", cursor: "pointer",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        Close
                      </button>
                    </div>
                    <div style={s.cardBody}>
                      {riskTrendLoading && (
                        <div style={{ padding: "30px 0", textAlign: "center", color: "#b0a898", fontSize: 12.5 }}>
                          <i className="ti ti-loader-2" style={{ fontSize: 16, animation: "spin 0.8s linear infinite", marginRight: 6 }} />
                          Loading trend…
                        </div>
                      )}
                      {!riskTrendLoading && riskTrend?.points.length > 0 && (
                        <>
                          <RiskTrendChart points={riskTrend.points} />
                          {riskTrend.points.length === 1 && (
                            <div style={{ fontSize: 11, color: "#b0a898", marginTop: 8 }}>
                              Only one assessment run so far — run another assessment later to see this change over time.
                            </div>
                          )}
                        </>
                      )}
                      {!riskTrendLoading && riskTrend?.points.length === 0 && (
                        <div style={{ padding: "30px 0", textAlign: "center", color: "#b0a898", fontSize: 12.5 }}>
                          No trend data available for this student.
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </AppLayout>
  );
}