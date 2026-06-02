import { useState, useEffect, useCallback, useRef } from "react";
import AppLayout from "../components/AppLayout";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import AIInsightPanel, { callGemini } from "../components/AIInsightPanel";
import { pageVariants, listVariants } from "../utils/motion";

// ── API ───────────────────────────────────────────────────────────────────────
import { getSubjects as _getSubjects, getAiCluster as _getAiCluster } from "../api/enrollmentApi";

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
function ScatterPlot({ clusters, selectedStudent, onSelectStudent }) {
  if (!clusters || clusters.length === 0) return null;

  const allPoints = clusters.flatMap((c) =>
    c.students.map((st) => ({ ...st, color: c.color, clusterLabel: c.label }))
  );

  const W = 700, H = 420, PAD = 50;
  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);

  // use reduce instead of spread — Math.min(...largeArray) can silently
  // fail in Firefox/Edge/older Chrome due to call-stack size limits
  const xMin = xs.reduce((a, b) => Math.min(a, b), Infinity);
  const xMax = xs.reduce((a, b) => Math.max(a, b), -Infinity);
  const yMin = ys.reduce((a, b) => Math.min(a, b), Infinity);
  const yMax = ys.reduce((a, b) => Math.max(a, b), -Infinity);

  // 10% padding so edge points don't sit directly on the axis lines
  const xPad   = (xMax - xMin || 1) * 0.1;
  const yPad   = (yMax - yMin || 1) * 0.1;
  const xRange = (xMax - xMin || 1) + xPad * 2;
  const yRange = (yMax - yMin || 1) + yPad * 2;

  const scaleX = (v) => PAD + ((v - (xMin - xPad)) / xRange) * (W - 2 * PAD);
  const scaleY = (v) => H - PAD - ((v - (yMin - yPad)) / yRange) * (H - 2 * PAD);

  const [hovered, setHovered] = useState(null);

  return (
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

      {/* Axes */}
      <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="#d8d4cc" />
      <line x1={PAD} x2={PAD}     y1={PAD}     y2={H - PAD} stroke="#d8d4cc" />

      {/* Axis labels */}
      <text x={W / 2} y={H - 10} textAnchor="middle" fontSize="11" fill="#a09890" fontFamily="DM Sans">
        PCA Component 1
      </text>
      <text
        x={14} y={H / 2} textAnchor="middle" fontSize="11" fill="#a09890"
        fontFamily="DM Sans" transform={`rotate(-90, 14, ${H / 2})`}
      >
        PCA Component 2
      </text>

      {/* Data points */}
      {allPoints.map((pt) => {
        const cx = scaleX(pt.x);
        const cy = scaleY(pt.y);
        const isSelected = selectedStudent?.student_id === pt.student_id;
        const isHov      = hovered?.student_id === pt.student_id;
        const r          = isSelected ? 8 : isHov ? 7 : 5;
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
        const tx   = scaleX(hovered.x);
        const ty   = scaleY(hovered.y);
        const tipW = 185, tipH = 52;
        const flipX = tx + tipW + 10 > W - PAD;
        const flipY = ty - tipH - 10 < PAD;
        const rx = flipX ? tx - tipW - 10 : tx + 12;
        const ry = flipY ? ty + 12 : ty - tipH - 8;
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
            <text x={rx + 10} y={ry + 46} fontSize="11" fontWeight="600" fill={hovered.color} fontFamily="DM Sans">
              Grade: {hovered.grade} · {hovered.clusterLabel}
            </text>
          </g>
        );
      })()}
    </svg>
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
            {student.student_number} · Grade: <strong>{student.grade}</strong> · {student.clusterLabel}
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
  const hasAnimated = useRef(false);

  if (!clusters) return null;

  const allStudents = clusters.flatMap((c) =>
    c.students.map((st) => ({ ...st, color: c.color, clusterLabel: c.label }))
  ).sort((a, b) => a.grade - b.grade);

  const isFirst = !hasAnimated.current;
  if (isFirst) hasAnimated.current = true;

  return (
    <div style={{ maxHeight: 360, overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#faf9f6", position: "sticky", top: 0 }}>
            <th style={thStyle}>Student</th>
            <th style={thStyle}>Number</th>
            <th style={thStyle}>Grade</th>
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
      .map((c) =>
        `${c.label}: ${c.student_count} student(s), avg grade=${c.avg_grade}, range=[${c.min_grade}–${c.max_grade}]`
      )
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

// ═══════════════════════════════════════════════════════════════════════════════
// ── PAGE COMPONENT ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function AnalyticsPage() {
  const navigate = useNavigate();

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
  }, [schoolYear, gradingPeriod, subjectId, schoolLevel, gradeLevel, nClusters]);

  const hasAnimated = useRef(false);
  const isFirstRender = !hasAnimated.current;
  if (isFirstRender) hasAnimated.current = true;

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
          <div style={s.topbarSub}>K-Means clustering · Academic performance segmentation · S.Y. {schoolYear}</div>
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
                <div style={{ fontSize: 12, color: "#b0a898", marginTop: 4 }}>Analyzing grades and preparing results</div>
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
              key={`${result.meta.school_year}-${result.meta.grading_period}-${result.meta.subject}-${result.meta.n_clusters}-${result.meta.grade_level}`}
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
                    <div style={s.cardHeaderTitle}>Student Distribution</div>
                    <div style={s.cardHeaderSub}>PCA projection · click any dot to view student details</div>
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
                  key={`${result.meta.school_year}-${result.meta.grading_period}-${result.meta.subject}-${result.meta.n_clusters}-${result.meta.grade_level}`}
                  result={result}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </AppLayout>
  );
}
