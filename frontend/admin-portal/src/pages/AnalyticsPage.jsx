import { useState, useEffect, useCallback } from "react";
import AppLayout from "../components/AppLayout";
import { useNavigate } from "react-router-dom";
import AIInsightPanel, { callGemini } from "../components/AIInsightPanel";

// ── API ───────────────────────────────────────────────────────────────────────
import { getSubjects as _getSubjects, getAiCluster as _getAiCluster } from "../api/enrollmentApi";

// ── Constants ─────────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { value: "overall",      label: "Overall (All Periods)" },
  { value: "1st_quarter",  label: "1st Quarter"  },
  { value: "2nd_quarter",  label: "2nd Quarter"  },
  { value: "3rd_quarter",  label: "3rd Quarter"  },
  { value: "4th_quarter",  label: "4th Quarter"  },
  { value: "1st_semester", label: "1st Semester" },
  { value: "2nd_semester", label: "2nd Semester" },
];

const GRADE_LEVEL_OPTIONS = [
  { value: "",         label: "All Grade Levels" },
  { value: "Nursery",  label: "Nursery"      },
  { value: "Kinder",   label: "Kindergarten" },
  { value: "Grade 1",  label: "Grade 1"      },
  { value: "Grade 2",  label: "Grade 2"      },
  { value: "Grade 3",  label: "Grade 3"      },
  { value: "Grade 4",  label: "Grade 4"      },
  { value: "Grade 5",  label: "Grade 5"      },
  { value: "Grade 6",  label: "Grade 6"      },
  { value: "Grade 7",  label: "Grade 7"      },
  { value: "Grade 8",  label: "Grade 8"      },
  { value: "Grade 9",  label: "Grade 9"      },
  { value: "Grade 10", label: "Grade 10"     },
  { value: "Grade 11", label: "Grade 11"     },
  { value: "Grade 12", label: "Grade 12"     },
];

function currentSchoolYear() {
  const now = new Date();
  const yr  = now.getFullYear();
  return now.getMonth() >= 5 ? `${yr}-${yr + 1}` : `${yr - 1}-${yr}`;
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
  filterRow:   { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" },
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
  input: {
    padding: "8px 12px", borderRadius: 8, border: "1px solid #ede9e1", fontSize: 13,
    color: "#3a3a3a", background: "white",
    fontFamily: "'DM Sans', sans-serif", outline: "none", width: 130,
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
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {clusters.map((c) => (
        <div key={c.cluster_id} style={{
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
        </div>
      ))}
    </div>
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
            <th style={thStyle}>Cluster</th>
          </tr>
        </thead>
        <tbody>
          {allStudents.map((st) => {
            const isSelected = selectedStudent?.student_id === st.student_id;
            return (
              <tr
                key={st.student_id}
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
              </tr>
            );
          })}
        </tbody>
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
  const [gradeLevel,      setGradeLevel]      = useState("");
  const [nClusters,       setNClusters]       = useState(3);
  const [subjects,        setSubjects]        = useState([]);
  const [result,          setResult]          = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [cooldown,        setCooldown]        = useState(0);   // seconds remaining

  useEffect(() => {
    _getSubjects().then((data) => {
      const list = Array.isArray(data) ? data : data.results || [];
      setSubjects(list);
    }).catch(() => {});
  }, []);

  // Tick the cooldown counter down every second
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const runClustering = useCallback(async () => {
    if (cooldown > 0) return;
    setLoading(true);
    setError("");
    setResult(null);
    setSelectedStudent(null);

    const params = new URLSearchParams({
      school_year:    schoolYear,
      grading_period: gradingPeriod,
      n_clusters:     String(nClusters),
    });
    if (subjectId)  params.set("subject_id",  subjectId);
    if (gradeLevel) params.set("grade_level", gradeLevel);

    try {
      const data = await _getAiCluster(Object.fromEntries(params));
      setResult(data);
      setCooldown(4); // brief cooldown after a successful request
    } catch (e) {
      const httpStatus = e.response?.status;
      if (httpStatus === 429) {
        setError("Too many requests — please wait a moment before running again.");
        setCooldown(15);
      } else if (httpStatus === 400) {
        const msg = e.response?.data?.error || "Not enough grade data for the selected filters.";
        setError(msg);
      } else {
        setError(e.response?.data?.error || e.message || "Clustering failed.");
      }
    } finally {
      setLoading(false);
    }
  }, [schoolYear, gradingPeriod, subjectId, gradeLevel, nClusters, cooldown]);

  return (
    <AppLayout>
      {/* Topbar */}
      <div style={s.topbar}>
        <div>
          <div style={s.topbarTitle}>Analytics</div>
          <div style={s.topbarSub}>K-Means clustering · Academic performance segmentation · S.Y. {schoolYear}</div>
        </div>
      </div>

      {/* Content */}
      <div style={s.content}>

        {/* ── Filters ── */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <div>
              <div style={s.cardHeaderTitle}>Analysis Parameters</div>
              <div style={s.cardHeaderSub}>Configure filters then run the clustering algorithm</div>
            </div>
          </div>
          <div style={{ ...s.cardBody }}>
            <div style={s.filterRow}>

              <div style={s.filterGroup}>
                <label style={s.filterLabel}>School Year</label>
                <input
                  type="text"
                  value={schoolYear}
                  onChange={(e) => setSchoolYear(e.target.value)}
                  placeholder="2024-2025"
                  style={s.input}
                />
              </div>

              <div style={s.filterGroup}>
                <label style={s.filterLabel}>Grading Period</label>
                <select value={gradingPeriod} onChange={(e) => setGradingPeriod(e.target.value)} style={s.select}>
                  {PERIOD_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div style={s.filterGroup}>
                <label style={s.filterLabel}>Grade Level</label>
                <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} style={{ ...s.select, minWidth: 150 }}>
                  {GRADE_LEVEL_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
              </div>

              <div style={s.filterGroup}>
                <label style={s.filterLabel}>Subject</label>
                <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={{ ...s.select, minWidth: 200 }}>
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

              <button
                onClick={runClustering}
                disabled={loading || cooldown > 0}
                className="new-btn"
                style={{
                  ...s.runBtn,
                  opacity: loading || cooldown > 0 ? 0.6 : 1,
                  cursor:  loading || cooldown > 0 ? "not-allowed" : "pointer",
                  marginBottom: 0,
                  alignSelf: "flex-end",
                }}
              >
                {loading ? (
                  <>
                    <i className="ti ti-loader-2" style={{ fontSize: 14, animation: "spin 0.8s linear infinite" }} />
                    Running…
                  </>
                ) : cooldown > 0 ? (
                  <>
                    <i className="ti ti-clock" style={{ fontSize: 14 }} />
                    Wait {cooldown}s
                  </>
                ) : (
                  <>
                    <i className="ti ti-chart-dots-3" style={{ fontSize: 14 }} />
                    Run Analysis
                  </>
                )}
              </button>

            </div>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10,
            display: "flex", alignItems: "center", gap: 10, padding: "13px 18px",
          }}>
            <i className="ti ti-alert-circle" style={{ fontSize: 16, color: "#e03131", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "#b91c1c" }}>{error}</span>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div style={s.card}>
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
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !result && !error && (
          <div style={s.card}>
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
          </div>
        )}

        {/* ── Results ── */}
        {result && (
          <>
            {/* Meta chips */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { label: "Students",    value: result.meta.total_students, icon: "ti-users"        },
                { label: "Grade Level", value: result.meta.grade_level || "All",    icon: "ti-school"       },
                { label: "Subject",     value: result.meta.subject,        icon: "ti-book"         },
                { label: "Period",      value: PERIOD_OPTIONS.find((p) => p.value === result.meta.grading_period)?.label || result.meta.grading_period, icon: "ti-calendar" },
                { label: "Clusters",    value: result.meta.n_clusters,     icon: "ti-chart-dots-3" },
              ].map((m) => (
                <div key={m.label} style={{
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
                </div>
              ))}
            </div>

            {/* Cluster Overview */}
            <div style={s.card}>
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
            </div>

            {/* Scatter Plot */}
            <div style={s.card}>
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
            </div>

            {/* Student List */}
            <div style={{ ...s.card, overflow: "hidden" }}>
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
            </div>

            {/* AI Interpretation & Recommendations
                key forces a full remount on each new analysis run so stale
                output from a previous query never bleeds into the new one. */}
            <ClusterInsightPanel
              key={`${result.meta.school_year}-${result.meta.grading_period}-${result.meta.subject}-${result.meta.n_clusters}-${result.meta.grade_level}`}
              result={result}
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}
