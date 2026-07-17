import { usePageTitle } from "../hooks/usePageTitle";
import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import AppLayout from "../components/AppLayout";
import {
  getMySections,
  getSectionGrades,
  saveSectionGrades,
  getSectionAttendance,
  saveSectionAttendance,
  getSectionAttendanceStats,
  getSectionGradesSummary,
} from "../api/enrollmentApi";
import { getUsers } from "../api/identityApi";
import { getCurrentUser } from "../utils/auth";

const SCHOOL_LEVEL_LABELS = {
  nursery: "Nursery",
  kindergarten: "Kindergarten",
  elementary: "Elementary",
  junior_highschool: "Junior High School",
  senior_highschool: "Senior High School",
};

// School-level color coding for section icons (left rail + header) — extends
// the two colors from the design handoff (JHS red, SHS blue, Elementary
// green) to every level in SCHOOL_LEVEL_LABELS using the app's existing
// level-color convention (see project design-system memory).
const SCHOOL_LEVEL_COLORS = {
  nursery:           { color: "#c27a12", bg: "#fdf5e8" },
  kindergarten:      { color: "#7c3aed", bg: "#f0e8fd" },
  elementary:        { color: "#2e6b0d", bg: "#e8f5e0" },
  junior_highschool: { color: "#e03131", bg: "#fff0f0" },
  senior_highschool: { color: "#1455a0", bg: "#e3f0fd" },
};

const GRADING_PERIODS_BY_LEVEL = {
  nursery:           ["1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter"],
  kindergarten:      ["1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter"],
  elementary:        ["1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter"],
  junior_highschool: ["1st_quarter", "2nd_quarter", "3rd_quarter", "4th_quarter"],
  senior_highschool: ["1st_semester", "2nd_semester"],
};

const PERIOD_LABELS = {
  "1st_quarter": "1st Quarter",
  "2nd_quarter": "2nd Quarter",
  "3rd_quarter": "3rd Quarter",
  "4th_quarter": "4th Quarter",
  "1st_semester": "1st Semester",
  "2nd_semester": "2nd Semester",
};

const PASS_THRESHOLD = 75;

const ATTENDANCE_STATUSES = [
  { value: "P", label: "Present", color: "#2e6b0d", bg: "#e8f5e0" },
  { value: "A", label: "Absent",  color: "#9b2020", bg: "#fde8e8" },
  { value: "L", label: "Late",    color: "#b45309", bg: "#fef3e2" },
  { value: "E", label: "Excused", color: "#1455a0", bg: "#e3f0fd" },
];

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftISODate(iso, delta) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// School year strings look like "2026-2027" → academic year runs Jun 1–May 31.
function schoolYearRange(schoolYear) {
  const [y1, y2] = String(schoolYear || "").split("-").map((n) => parseInt(n, 10));
  if (!y1 || !y2) return { from: "", to: "" };
  return { from: `${y1}-06-01`, to: `${y2}-05-31` };
}

function formatShortDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "#f0e8e8" }} />
);

function fullName(s) {
  if (!s) return "";
  if (s.full_name) return s.full_name;
  return [s.first_name, s.middle_name, s.last_name, s.suffix].filter(Boolean).join(" ");
}

function sectionLabel(advisory) {
  return advisory.strand
    ? `${advisory.grade_level} · ${advisory.section} (${advisory.strand})`
    : `${advisory.grade_level} · ${advisory.section}`;
}

function gradeColor(g) {
  if (g === null || g === undefined || g === "") return { color: "#7a5050", bg: "#f9f4f4" };
  const n = parseFloat(g);
  if (n >= 90) return { color: "#1455a0", bg: "#e3f0fd" };
  if (n >= PASS_THRESHOLD) return { color: "#2e6b0d", bg: "#e8f5e0" };
  return { color: "#9b2020", bg: "#fde8e8" };
}

// ── Students tab: roster table with an inline read-only quick-view row ──────
function StudentsTab({ students, todayAttendanceByStudent }) {
  const navigate = useNavigate();
  const [quickViewId, setQuickViewId] = useState(null);

  if (students.length === 0) {
    return (
      <div style={{ padding: "28px 26px", textAlign: "center", fontSize: 12.5, color: "#b09090" }}>
        No enrolled students in this section yet.
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ background: "#fdfafa" }}>
          {["Name", "LRN", "Student No.", "Sex", ""].map((label) => (
            <th key={label} style={{ textAlign: "left", fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", padding: "10px 26px", borderBottom: "1px solid #f5eaea", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {students.map((s) => {
          const open = quickViewId === s.student_id;
          const today = todayAttendanceByStudent?.[s.student_id];
          const statusMeta = today ? ATTENDANCE_STATUSES.find((a) => a.value === today.status) : null;
          return (
            <Fragment key={s.student_id}>
              <tr
                className="student-row"
                onClick={() => navigate(`/students/${s.student_id}`)}
              >
                <td className="row-name" style={{ padding: "11px 26px", borderBottom: "1px solid #f9f0f0", fontWeight: 600, color: "#1a0a0a" }}>
                  {fullName(s)}
                </td>
                <td style={{ padding: "11px 26px", borderBottom: "1px solid #f9f0f0", color: "#7a5050" }}>{s.lrn}</td>
                <td style={{ padding: "11px 26px", borderBottom: "1px solid #f9f0f0", color: "#7a5050" }}>{s.student_number}</td>
                <td style={{ padding: "11px 26px", borderBottom: "1px solid #f9f0f0", color: "#7a5050" }}>{s.sex}</td>
                <td style={{ padding: "11px 26px", borderBottom: "1px solid #f9f0f0", textAlign: "right" }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setQuickViewId(open ? null : s.student_id); }}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      border: "1.5px solid #f0e4e4", borderRadius: 7, background: "white",
                      padding: "5px 10px", fontSize: 11.5, color: "#7a5050", cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
                    }}
                  >
                    <i className="ti ti-info-circle" style={{ fontSize: 13 }} />
                    Quick view
                  </button>
                </td>
              </tr>
              {open && (
                <tr key={`${s.student_id}-quick`}>
                  <td colSpan={5} style={{ padding: 0, borderBottom: "1px solid #f9f0f0", background: "#fdfafa" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, padding: "14px 26px" }}>
                      <div>
                        <div style={{ fontSize: 10, color: "#b09090", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>LRN</div>
                        <div style={{ fontSize: 13, color: "#1a0a0a", fontWeight: 600, marginTop: 2 }}>{s.lrn}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "#b09090", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Student No.</div>
                        <div style={{ fontSize: 13, color: "#1a0a0a", fontWeight: 600, marginTop: 2 }}>{s.student_number}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "#b09090", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Sex</div>
                        <div style={{ fontSize: 13, color: "#1a0a0a", fontWeight: 600, marginTop: 2 }}>{s.sex}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "#b09090", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Attendance today</div>
                        {statusMeta ? (
                          <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: statusMeta.bg, color: statusMeta.color, marginTop: 2, display: "inline-block" }}>
                            {statusMeta.label}
                          </span>
                        ) : (
                          <div style={{ fontSize: 13, color: "#c0a0a0", marginTop: 2 }}>Not marked yet</div>
                        )}
                      </div>
                      <div style={{ marginLeft: "auto", alignSelf: "center" }}>
                        <button
                          onClick={() => navigate(`/students/${s.student_id}`)}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            border: "1px solid #f0e4e4", borderRadius: 8, background: "white",
                            padding: "6px 12px", fontSize: 12, color: "#9a7070", cursor: "pointer",
                            fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
                          }}
                        >
                          <i className="ti ti-user" style={{ fontSize: 13 }} />
                          Full Profile
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Subjects tab ──────────────────────────────────────────────────────────────
function SubjectsTab({ subjects }) {
  if (subjects.length === 0) {
    return (
      <div style={{ padding: "28px 26px", textAlign: "center", fontSize: 12.5, color: "#b09090" }}>
        No subjects configured for this grade level yet.
      </div>
    );
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ background: "#fdfafa" }}>
          {["Code", "Subject", "Semester"].map((label) => (
            <th key={label} style={{ textAlign: "left", fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", padding: "10px 26px", borderBottom: "1px solid #f5eaea", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {subjects.map((sub) => (
          <tr key={sub.subject_id}>
            <td style={{ padding: "11px 26px", borderBottom: "1px solid #f9f0f0", color: "#7a5050" }}>{sub.subject_code}</td>
            <td style={{ padding: "11px 26px", borderBottom: "1px solid #f9f0f0", fontWeight: 600, color: "#1a0a0a" }}>{sub.subject_name}</td>
            <td style={{ padding: "11px 26px", borderBottom: "1px solid #f9f0f0", color: "#7a5050" }}>{sub.semester || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Grades tab: subject + period pickers, then an editable grade grid ────────
function GradesTab({ advisory, subjects }) {
  const navigate = useNavigate();
  const [subjectId, setSubjectId] = useState(subjects[0]?.subject_id ?? "");
  const [period, setPeriod] = useState("");
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({}); // student_id -> string value
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const periods = GRADING_PERIODS_BY_LEVEL[advisory.school_level] ?? [];

  useEffect(() => {
    setPeriod(periods[0] ?? "");
  }, [advisory.school_level]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadGrid = useCallback(async () => {
    if (!subjectId || !period) return;
    setLoading(true);
    try {
      const data = await getSectionGrades({
        advisory_id: advisory.advisory_id,
        subject_id: subjectId,
        grading_period: period,
      });
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      const nextDrafts = {};
      list.forEach((r) => {
        nextDrafts[r.student.student_id] = r.grade ? String(r.grade.numeric_grade) : "";
      });
      setDrafts(nextDrafts);
    } catch (e) {
      toast.error(e.message || "Failed to load grades.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [advisory.advisory_id, subjectId, period]);

  useEffect(() => { loadGrid(); }, [loadGrid]);

  const handleSaveAll = async () => {
    const entries = rows
      .map((r) => {
        const raw = drafts[r.student.student_id];
        if (raw === "" || raw === undefined) return null;
        const numeric_grade = parseFloat(raw);
        if (Number.isNaN(numeric_grade)) return null;
        return {
          student_id: r.student.student_id,
          numeric_grade,
          remarks: numeric_grade >= PASS_THRESHOLD ? "passed" : "failed",
        };
      })
      .filter(Boolean);

    if (entries.length === 0) {
      toast.error("Enter at least one grade before saving.");
      return;
    }

    setSaving(true);
    try {
      const result = await saveSectionGrades({
        advisory_id: advisory.advisory_id,
        subject_id: subjectId,
        grading_period: period,
        grades: entries,
      });
      if (result.failed?.length) {
        toast.error(`${result.failed.length} grade(s) failed to save.`);
      } else {
        toast.success("Grades saved.");
      }
      await loadGrid();
    } catch (e) {
      toast.error(e.message || "Failed to save grades.");
    } finally {
      setSaving(false);
    }
  };

  if (subjects.length === 0) {
    return (
      <div style={{ padding: "28px 26px", textAlign: "center", fontSize: 12.5, color: "#b09090" }}>
        No subjects configured for this grade level yet.
      </div>
    );
  }

  return (
    <div>
      {/* Selectors */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "14px 26px", borderBottom: "1px solid #f5eaea" }}>
        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          style={{ border: "1.5px solid #fde2de", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none" }}
        >
          {subjects.map((s) => (
            <option key={s.subject_id} value={s.subject_id}>{s.subject_name}</option>
          ))}
        </select>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          style={{ border: "1.5px solid #fde2de", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none" }}
        >
          {periods.map((p) => (
            <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
          ))}
        </select>
        <button
          onClick={handleSaveAll}
          disabled={saving || loading}
          style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6,
            background: saving ? "#e87474" : "#e03131", color: "white", border: "none",
            borderRadius: 8, padding: "7px 16px", fontSize: 12.5, fontWeight: 700,
            cursor: saving || loading ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif",
          }}
        >
          <i className="ti ti-device-floppy" style={{ fontSize: 13 }} />
          {saving ? "Saving…" : "Save Grades"}
        </button>
      </div>

      {loading ? (
        <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map((i) => <Sk key={i} h={18} />)}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: "28px 26px", textAlign: "center", fontSize: 12.5, color: "#b09090" }}>
          No enrolled students in this section.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#fdfafa" }}>
              {["Name", "Grade", "Remarks", ""].map((label) => (
                <th key={label} style={{ textAlign: "left", fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", padding: "10px 26px", borderBottom: "1px solid #f5eaea", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sid = r.student.student_id;
              const draft = drafts[sid] ?? "";
              const gc = gradeColor(draft);
              return (
                <tr key={sid}>
                  <td style={{ padding: "9px 26px", borderBottom: "1px solid #f9f0f0", fontWeight: 600, color: "#1a0a0a" }}>
                    {fullName(r.student)}
                  </td>
                  <td style={{ padding: "9px 26px", borderBottom: "1px solid #f9f0f0" }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={draft}
                      onChange={(e) => setDrafts((d) => ({ ...d, [sid]: e.target.value }))}
                      style={{ width: 70, border: "1.5px solid #fde2de", borderRadius: 7, padding: "5px 8px", fontSize: 13, textAlign: "right", fontFamily: "'DM Sans',sans-serif", outline: "none" }}
                    />
                  </td>
                  <td style={{ padding: "9px 26px", borderBottom: "1px solid #f9f0f0" }}>
                    {draft !== "" && !Number.isNaN(parseFloat(draft)) && (
                      <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 99, ...gc }}>
                        {parseFloat(draft) >= PASS_THRESHOLD ? "Passed" : "Failed"}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "9px 26px", borderBottom: "1px solid #f9f0f0", textAlign: "right" }}>
                    <button
                      onClick={() => navigate(`/grades?student=${sid}&tab=summary&enrollment=${r.enrollment_id}`)}
                      title="View full grade summary"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 11.5, fontWeight: 600, color: "#e03131",
                        fontFamily: "'DM Sans',sans-serif", padding: 0,
                      }}
                    >
                      Summary
                      <i className="ti ti-arrow-up-right" style={{ fontSize: 12 }} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Attendance tab: date nav + per-student status grid for that day ─────────
function AttendanceTab({ advisory, onTodayChange }) {
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({}); // student_id -> { status, remarks }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadGrid = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    try {
      const data = await getSectionAttendance({ advisory_id: advisory.advisory_id, date });
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      const nextDrafts = {};
      list.forEach((r) => {
        nextDrafts[r.student.student_id] = {
          status: r.attendance?.status ?? "P",
          remarks: r.attendance?.remarks ?? "",
        };
      });
      setDrafts(nextDrafts);
      if (date === todayISO() && onTodayChange) onTodayChange(nextDrafts);
    } catch (e) {
      toast.error(e.message || "Failed to load attendance.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [advisory.advisory_id, date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadGrid(); }, [loadGrid]);

  const handleSaveAll = async () => {
    const entries = rows.map((r) => {
      const sid = r.student.student_id;
      const d = drafts[sid] ?? { status: "P", remarks: "" };
      return { student_id: sid, status: d.status, remarks: d.remarks };
    });

    setSaving(true);
    try {
      const result = await saveSectionAttendance({
        advisory_id: advisory.advisory_id,
        date,
        records: entries,
      });
      if (result.failed?.length) {
        toast.error(`${result.failed.length} record(s) failed to save.`);
      } else {
        toast.success("Attendance saved.");
      }
      await loadGrid();
    } catch (e) {
      toast.error(e.message || "Failed to save attendance.");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAllPresent = () => {
    setDrafts((d) => {
      const next = { ...d };
      rows.forEach((r) => {
        const sid = r.student.student_id;
        next[sid] = { ...(next[sid] ?? { remarks: "" }), status: "P" };
      });
      return next;
    });
  };

  const counts = useMemo(() => {
    const c = { P: 0, A: 0, L: 0, E: 0 };
    rows.forEach((r) => {
      const status = drafts[r.student.student_id]?.status ?? "P";
      if (c[status] !== undefined) c[status] += 1;
    });
    return c;
  }, [rows, drafts]);

  const dateLabel = useMemo(() => {
    const d = new Date(`${date}T00:00:00`);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }, [date]);

  return (
    <div>
      {/* Header: two independent rows — date/action controls never wrap
          against the count pills (an earlier version had them in one row,
          which shifted the date/save controls whenever pills wrapped). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 26px", borderBottom: "1px solid #f5eaea" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => setDate((d) => shiftISODate(d, -1))}
              style={{ width: 28, height: 28, borderRadius: 7, border: "1.5px solid #f0e4e4", background: "white", color: "#7a5050", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            >
              <i className="ti ti-chevron-left" style={{ fontSize: 14 }} />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ border: "1.5px solid #f0e4e4", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 700, color: "#1a0a0a", background: "white", fontFamily: "'DM Sans',sans-serif", cursor: "pointer", flexShrink: 0 }}
            />
            <button
              onClick={() => setDate((d) => shiftISODate(d, 1))}
              style={{ width: 28, height: 28, borderRadius: 7, border: "1.5px solid #f0e4e4", background: "white", color: "#7a5050", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            >
              <i className="ti ti-chevron-right" style={{ fontSize: 14 }} />
            </button>
            <button
              onClick={() => setDate(todayISO())}
              style={{ padding: "6px 12px", borderRadius: 7, border: "1.5px solid #f0e4e4", background: "white", color: "#9a7070", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", flexShrink: 0 }}
            >
              Today
            </button>
            <span style={{ fontSize: 12, color: "#b09090", marginLeft: 4, flexShrink: 0 }}>{dateLabel}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              onClick={handleMarkAllPresent}
              disabled={loading || rows.length === 0}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
                borderRadius: 8, border: "1.5px solid #f0e4e4", background: "white", color: "#7a5050",
                fontSize: 12, fontWeight: 600, cursor: loading || rows.length === 0 ? "not-allowed" : "pointer",
                fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap",
              }}
            >
              <i className="ti ti-checks" style={{ fontSize: 14 }} />
              Mark all present
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving || loading}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: saving ? "#e87474" : "#e03131", color: "white", border: "none",
                borderRadius: 8, padding: "8px 16px", fontSize: 12.5, fontWeight: 700,
                cursor: saving || loading ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif",
                whiteSpace: "nowrap",
              }}
            >
              <i className="ti ti-device-floppy" style={{ fontSize: 13 }} />
              {saving ? "Saving…" : "Save Attendance"}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 99, background: "#e8f5e0", color: "#2e6b0d" }}>{counts.P} present</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 99, background: "#fde8e8", color: "#9b2020" }}>{counts.A} absent</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 99, background: "#fef3e2", color: "#b45309" }}>{counts.L} late</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 99, background: "#e3f0fd", color: "#1455a0" }}>{counts.E} excused</span>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map((i) => <Sk key={i} h={18} />)}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: "28px 26px", textAlign: "center", fontSize: 12.5, color: "#b09090" }}>
          No enrolled students in this section.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#fdfafa" }}>
              {["Name", "Status", "Remarks"].map((label) => (
                <th key={label} style={{ textAlign: "left", fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", padding: "10px 26px", borderBottom: "1px solid #f5eaea", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sid = r.student.student_id;
              const draft = drafts[sid] ?? { status: "P", remarks: "" };
              return (
                <tr key={sid}>
                  <td style={{ padding: "9px 26px", borderBottom: "1px solid #f9f0f0", fontWeight: 600, color: "#1a0a0a" }}>
                    {fullName(r.student)}
                  </td>
                  <td style={{ padding: "9px 26px", borderBottom: "1px solid #f9f0f0" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {ATTENDANCE_STATUSES.map((s) => {
                        const active = draft.status === s.value;
                        return (
                          <button
                            key={s.value}
                            onClick={() => setDrafts((d) => ({ ...d, [sid]: { ...draft, status: s.value } }))}
                            title={s.label}
                            style={{
                              width: 30, height: 26, borderRadius: 7,
                              border: `1.5px solid ${active ? s.color : "#f0e4e4"}`,
                              background: active ? s.bg : "white",
                              color: active ? s.color : "#9a7070",
                              fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                              fontFamily: "'DM Sans',sans-serif",
                            }}
                          >
                            {s.value}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ padding: "9px 26px", borderBottom: "1px solid #f9f0f0" }}>
                    <input
                      type="text"
                      value={draft.remarks}
                      placeholder="Optional remarks"
                      onChange={(e) => setDrafts((d) => ({ ...d, [sid]: { ...draft, remarks: e.target.value } }))}
                      style={{ width: "100%", maxWidth: 220, border: "1.5px solid #fde2de", borderRadius: 7, padding: "5px 8px", fontSize: 12.5, fontFamily: "'DM Sans',sans-serif", outline: "none" }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Stats tab: grade metrics + semester/daily/per-student attendance ────────
function StatTile({ label, value, sub, color }) {
  return (
    <div style={{ background: "white", border: "1px solid #f5eaea", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 6, boxShadow: "0 2px 12px rgba(224,49,49,0.06)" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#a07878", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || "#1a0a0a", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "#b09090" }}>{sub}</div>}
    </div>
  );
}

function GradeDistribution({ distribution, gradedCount }) {
  const bands = [
    { key: "90_100", label: "90-100", color: "#1455a0" },
    { key: "75_89", label: "75-89", color: "#2e6b0d" },
    { key: "below_75", label: "Below 75", color: "#9b2020" },
  ];
  if (!gradedCount) {
    return <div style={{ fontSize: 12.5, color: "#b09090" }}>No grades recorded yet.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {bands.map((band) => {
        const count = distribution?.[band.key] ?? 0;
        const pct = gradedCount ? Math.round((count / gradedCount) * 100) : 0;
        return (
          <div key={band.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 64, fontSize: 11.5, color: "#7a5050", flexShrink: 0 }}>{band.label}</span>
            <div style={{ flex: 1, height: 10, background: "#f5eaea", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 99, background: band.color, width: `${pct}%`, transition: "width 0.4s ease" }} />
            </div>
            <span style={{ width: 36, textAlign: "right", fontSize: 11.5, fontWeight: 700, color: "#1a0a0a", flexShrink: 0 }}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function DailyBarChart({ daily }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const maxTotal = Math.max(1, ...daily.map((d) => d.total));

  if (daily.length === 0) {
    return (
      <div style={{ padding: "28px 22px", textAlign: "center", fontSize: 12.5, color: "#b09090" }}>
        No attendance recorded yet for this range.
      </div>
    );
  }

  return (
    <div style={{ padding: "18px 22px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 140, position: "relative" }}>
        {daily.map((d, i) => {
          const segments = ATTENDANCE_STATUSES.map((s) => ({
            ...s,
            count: d[{ P: "present", A: "absent", L: "late", E: "excused" }[s.value]] || 0,
          })).filter((s) => s.count > 0);
          const barHeight = Math.max(4, (d.total / maxTotal) * 132);
          const hovered = hoverIdx === i;
          return (
            <div
              key={d.date}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((h) => (h === i ? null : h))}
              style={{ flex: "1 1 0", minWidth: 3, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", cursor: "pointer", position: "relative" }}
            >
              {hovered && (
                <div style={{
                  position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)",
                  marginBottom: 8, background: "#1a0a0a", color: "white", borderRadius: 8,
                  padding: "8px 11px", fontSize: 11, whiteSpace: "nowrap", zIndex: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.22)", fontFamily: "'DM Sans',sans-serif",
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{formatShortDate(d.date)}</div>
                  {ATTENDANCE_STATUSES.map((s) => {
                    const key = { P: "present", A: "absent", L: "late", E: "excused" }[s.value];
                    if (!d[key]) return null;
                    return (
                      <div key={s.value} style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.92 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                        {s.label}: {d[key]}
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column-reverse", width: "100%", height: barHeight, borderRadius: "4px 4px 0 0", overflow: "hidden", gap: 1.5, outline: hovered ? "2px solid #e03131" : "none", outlineOffset: 1 }}>
                {segments.map((s) => (
                  <div
                    key={s.value}
                    style={{ width: "100%", flex: `${s.count} 0 0`, background: s.color, minHeight: 2 }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: "#c0a0a0" }}>
        <span>{formatShortDate(daily[0]?.date)}</span>
        {daily.length > 1 && <span>{formatShortDate(daily[daily.length - 1]?.date)}</span>}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
        {ATTENDANCE_STATUSES.map((s) => (
          <div key={s.value} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#7a5050", fontWeight: 600 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function StudentRateRow({ row }) {
  const rate = row.attendance_rate;
  const meterColor = rate === null ? "#e0d0d0" : rate >= 90 ? "#2e6b0d" : rate >= 75 ? "#b45309" : "#9b2020";
  return (
    <tr>
      <td style={{ padding: "10px 22px", borderBottom: "1px solid #f9f0f0", fontWeight: 600, color: "#1a0a0a" }}>
        {row.name}
      </td>
      <td style={{ padding: "10px 22px", borderBottom: "1px solid #f9f0f0" }}>
        <div style={{ display: "flex", gap: 10, fontSize: 11.5 }}>
          {ATTENDANCE_STATUSES.map((s) => {
            const key = { P: "present", A: "absent", L: "late", E: "excused" }[s.value];
            return (
              <span key={s.value} style={{ color: s.color, fontWeight: 700 }}>
                {row[key]}<span style={{ color: "#c0a0a0", fontWeight: 500 }}>{s.value}</span>
              </span>
            );
          })}
        </div>
      </td>
      <td style={{ padding: "10px 22px", borderBottom: "1px solid #f9f0f0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, maxWidth: 120, height: 7, background: "#f0e8e8", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: `${rate ?? 0}%`, height: "100%", background: meterColor, borderRadius: 99, transition: "width 0.4s ease" }} />
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: meterColor, minWidth: 42 }}>
            {rate === null ? "—" : `${rate}%`}
          </span>
        </div>
      </td>
    </tr>
  );
}

function StatsTab({ advisory }) {
  const defaultRange = useMemo(() => schoolYearRange(advisory.school_year), [advisory.school_year]);
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [stats, setStats] = useState(null);
  const [gradeSummary, setGradeSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("name"); // "name" | "rate"

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const [attendanceData, gradesData] = await Promise.all([
        getSectionAttendanceStats({
          advisory_id: advisory.advisory_id,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }),
        getSectionGradesSummary({ advisory_id: advisory.advisory_id }),
      ]);
      setStats(attendanceData);
      setGradeSummary(gradesData);
    } catch (e) {
      toast.error(e.message || "Failed to load section stats.");
      setStats(null);
      setGradeSummary(null);
    } finally {
      setLoading(false);
    }
  }, [advisory.advisory_id, dateFrom, dateTo]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const perStudentSorted = useMemo(() => {
    if (!stats) return [];
    const rows = [...stats.per_student];
    if (sortBy === "rate") {
      rows.sort((a, b) => (b.attendance_rate ?? -1) - (a.attendance_rate ?? -1));
    }
    return rows;
  }, [stats, sortBy]);

  const totals = stats?.totals;
  const sectionRate = totals?.total_marks
    ? Math.round(((totals.present + totals.late) / totals.total_marks) * 1000) / 10
    : null;

  return (
    <div>
      {/* Date range controls (attendance analytics only — grade metrics
          cover every recorded grade for the section, no range needed) */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "14px 26px", borderBottom: "1px solid #f5eaea" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em" }}>Attendance range</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          style={{ border: "1.5px solid #fde2de", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none" }}
        />
        <span style={{ color: "#c0a0a0", fontSize: 12 }}>to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          style={{ border: "1.5px solid #fde2de", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none" }}
        />
        <button
          onClick={() => { setDateFrom(defaultRange.from); setDateTo(defaultRange.to); }}
          style={{
            border: "1.5px solid #f0e4e4", borderRadius: 8, background: "white",
            padding: "7px 12px", fontSize: 12, color: "#9a7070", cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
          }}
        >
          Full School Year
        </button>
      </div>

      {loading ? (
        <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
            {[1, 2, 3, 4].map((i) => <Sk key={i} h={72} r={14} />)}
          </div>
          <Sk h={140} r={12} />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${dateFrom}-${dateTo}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {/* Grade + attendance headline tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, padding: "18px 26px 4px" }}>
              <StatTile label="Average Grade" value={gradeSummary?.average ?? "—"} sub={`${gradeSummary?.graded_count ?? 0} grades recorded`} />
              <StatTile label="Pass Rate" value={gradeSummary?.pass_rate !== null && gradeSummary?.pass_rate !== undefined ? `${gradeSummary.pass_rate}%` : "—"} color={gradeSummary?.pass_rate >= 75 ? "#2e6b0d" : "#9b2020"} />
              <StatTile label="Attendance Rate" value={sectionRate !== null ? `${sectionRate}%` : "—"} sub={`${stats?.total_school_days ?? 0} school days`} color={sectionRate >= 90 ? "#2e6b0d" : sectionRate >= 75 ? "#b45309" : "#9b2020"} />
              <StatTile label="Absent" value={totals?.absent ?? 0} sub={`of ${totals?.total_marks ?? 0} total marks`} color="#9b2020" />
            </div>

            {/* Grade distribution */}
            <div style={{ margin: "14px 26px 0", background: "#fdfafa", border: "1px solid #f5eaea", borderRadius: 14, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#a07878", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                Grade Distribution
              </div>
              <GradeDistribution distribution={gradeSummary?.distribution} gradedCount={gradeSummary?.graded_count} />
            </div>

            {/* Per-day composition chart */}
            <div style={{ margin: "14px 26px 0", background: "#fdfafa", border: "1px solid #f5eaea", borderRadius: 14 }}>
              <div style={{ padding: "12px 22px 0", fontSize: 11, fontWeight: 700, color: "#a07878", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Daily Attendance Breakdown
              </div>
              <DailyBarChart daily={stats?.daily ?? []} />
            </div>

            {/* Per-student table */}
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 26px 10px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#a07878", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Per-Student Attendance
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {[{ key: "name", label: "Name" }, { key: "rate", label: "Rate" }].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setSortBy(opt.key)}
                      style={{
                        padding: "5px 11px", borderRadius: 7,
                        border: `1.5px solid ${sortBy === opt.key ? "#e03131" : "#f0e4e4"}`,
                        background: sortBy === opt.key ? "#fff0f0" : "white",
                        color: sortBy === opt.key ? "#e03131" : "#9a7070",
                        fontSize: 11, fontWeight: 700, cursor: "pointer",
                        fontFamily: "'DM Sans',sans-serif",
                      }}
                    >
                      Sort: {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {perStudentSorted.length === 0 ? (
                <div style={{ padding: "28px 26px", textAlign: "center", fontSize: 12.5, color: "#b09090" }}>
                  No attendance data in this range.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#fdfafa" }}>
                      {["Name", "P / A / L / E", "Rate"].map((label) => (
                        <th key={label} style={{ textAlign: "left", fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", padding: "10px 22px", borderBottom: "1px solid #f5eaea", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {perStudentSorted.map((row) => (
                      <StudentRateRow key={row.student_id} row={row} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

// ── Section detail panel: header + tab bar + active tab content ─────────────
function SectionDetail({ entry }) {
  const { advisory, student_count, students, subjects } = entry;
  // Keyed by advisory_id at the call site, so a fresh mount (and a reset
  // to the Students tab) happens automatically when the section changes.
  const [tab, setTab] = useState("students");
  const [todayAttendance, setTodayAttendance] = useState({});

  const levelColors = SCHOOL_LEVEL_COLORS[advisory.school_level] ?? SCHOOL_LEVEL_COLORS.elementary;

  const presentToday = useMemo(() => {
    const values = Object.values(todayAttendance);
    if (values.length === 0) return null;
    const present = values.filter((v) => v.status === "P" || v.status === "L").length;
    return Math.round((present / values.length) * 100);
  }, [todayAttendance]);

  const tabs = [
    { key: "students", label: `Students (${students.length})`, icon: "ti-users" },
    { key: "subjects", label: `Subjects (${subjects.length})`, icon: "ti-book" },
    { key: "grades", label: "Grades", icon: "ti-chart-bar" },
    { key: "attendance", label: "Attendance", icon: "ti-calendar-check" },
    { key: "stats", label: "Stats", icon: "ti-chart-dots-3" },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "white" }}>
      <div style={{ padding: "20px 26px", borderBottom: "1px solid #f5eaea" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: levelColors.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-users-group" style={{ fontSize: 17, color: levelColors.color }} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1a0a0a" }}>{sectionLabel(advisory)}</div>
            <div style={{ fontSize: 12, color: "#b09090", marginTop: 2 }}>
              {SCHOOL_LEVEL_LABELS[advisory.school_level] || advisory.school_level} · SY {advisory.school_year}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: "#e3f0fd", color: "#1455a0" }}>
            {student_count} student{student_count === 1 ? "" : "s"}
          </span>
          {presentToday !== null && (
            <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: "#e8f5e0", color: "#2e6b0d" }}>
              {presentToday}% present today
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, padding: "12px 26px 0", borderBottom: "1px solid #f5eaea" }}>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
                borderRadius: "10px 10px 0 0", border: "none",
                borderBottom: `2px solid ${active ? "#e03131" : "transparent"}`,
                background: "transparent", cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif", fontSize: 12.5, fontWeight: active ? 700 : 500,
                color: active ? "#e03131" : "#9a7070",
              }}
            >
              <i className={`ti ${t.icon}`} style={{ fontSize: 13 }} />{t.label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "students" && <StudentsTab students={students} todayAttendanceByStudent={todayAttendance} />}
        {tab === "subjects" && <SubjectsTab subjects={subjects} />}
        {tab === "grades" && <GradesTab advisory={advisory} subjects={subjects} />}
        {tab === "attendance" && <AttendanceTab advisory={advisory} onTodayChange={setTodayAttendance} />}
        {tab === "stats" && <StatsTab advisory={advisory} />}
      </div>
    </div>
  );
}

// ── Left rail: searchable list of the teacher's sections ────────────────────
function SectionRail({ sections, selectedKey, onSelect }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter((entry) => {
      const a = entry.advisory;
      return sectionLabel(a).toLowerCase().includes(q)
        || (SCHOOL_LEVEL_LABELS[a.school_level] || "").toLowerCase().includes(q);
    });
  }, [sections, query]);

  return (
    <div style={{ width: 270, flexShrink: 0, borderRight: "1px solid #f5eaea", background: "white", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 16, borderBottom: "1px solid #f5eaea" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a", marginBottom: 10 }}>My Sections</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1.5px solid #f0e4e4", borderRadius: 10, padding: "8px 12px", background: "#fdfafa" }}>
          <i className="ti ti-search" style={{ fontSize: 14, color: "#c0a0a0" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sections…"
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 12.5, color: "#1a0a0a", fontFamily: "'DM Sans',sans-serif", width: "100%" }}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "24px 10px", textAlign: "center", fontSize: 12, color: "#b09090" }}>
            No sections match "{query}".
          </div>
        ) : (
          filtered.map((entry) => {
            const a = entry.advisory;
            const key = a.advisory_id;
            const selected = key === selectedKey;
            const levelColors = SCHOOL_LEVEL_COLORS[a.school_level] ?? SCHOOL_LEVEL_COLORS.elementary;
            return (
              <div
                key={key}
                onClick={() => onSelect(key)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 10,
                  cursor: "pointer", marginBottom: 4,
                  background: selected ? "#fff0f0" : "transparent",
                  border: `1.5px solid ${selected ? "#e03131" : "transparent"}`,
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: levelColors.bg }}>
                  <i className="ti ti-users-group" style={{ fontSize: 15, color: levelColors.color }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected ? "#e03131" : "#1a0a0a" }}>
                    {sectionLabel(a)}
                  </div>
                  <div style={{ fontSize: 11, color: "#b09090" }}>
                    {entry.student_count} student{entry.student_count === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function TeacherSectionsPage() {
  usePageTitle("My Sections");
  const navigate = useNavigate();

  const currentUser = getCurrentUser();
  const isTeacher = currentUser?.role === "teacher";

  const [teachers, setTeachers] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState(null);

  // Admin/registrar: load the teacher list for the picker.
  useEffect(() => {
    if (isTeacher) return;
    getUsers()
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.results ?? [];
        setTeachers(list.filter((u) => u.role === "teacher"));
      })
      .catch(() => toast.error("Failed to load teacher list."));
  }, [isTeacher]);

  const fetchSections = useCallback(async (teacherUserId) => {
    setLoading(true);
    try {
      const params = teacherUserId ? { teacher_user_id: teacherUserId } : {};
      const data = await getMySections(params);
      const list = Array.isArray(data) ? data : [];
      setSections(list);
      setSelectedKey(list[0]?.advisory?.advisory_id ?? null);
    } catch (e) {
      toast.error(e.message || "Failed to load sections.");
      setSections([]);
      setSelectedKey(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }

    if (isTeacher) {
      fetchSections();
    } else if (selectedTeacherId) {
      fetchSections(selectedTeacherId);
    } else {
      setSections([]);
      setSelectedKey(null);
      setLoading(false);
    }
  }, [isTeacher, selectedTeacherId, fetchSections, navigate]);

  const selectedEntry = useMemo(
    () => sections.find((e) => e.advisory.advisory_id === selectedKey) ?? null,
    [sections, selectedKey]
  );

  if (!isTeacher && !selectedTeacherId) {
    return (
      <AppLayout>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ background: "white", borderBottom: "1px solid #f5eaea", padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.01em" }}>My Sections</div>
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              style={{ border: "1.5px solid #fde2de", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none", minWidth: 240 }}
            >
              <option value="">Select a teacher…</option>
              {teachers.map((t) => (
                <option key={t.user_id} value={t.user_id}>{t.name} ({t.email})</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", padding: "80px 16px" }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <i className="ti ti-user-search" style={{ fontSize: 22, color: "#e08080" }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#7a5050" }}>Select a teacher to view their sections</div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {loading ? (
          <div style={{ flex: 1, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Sk w={42} h={42} r={12} />
                <div style={{ flex: 1 }}>
                  <Sk w={180} h={15} />
                  <div style={{ marginTop: 8 }}><Sk w={140} h={11} /></div>
                </div>
              </div>
            ))}
          </div>
        ) : sections.length === 0 ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", padding: "80px 16px" }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <i className="ti ti-users-group" style={{ fontSize: 22, color: "#e08080" }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#7a5050" }}>No section assignments found</div>
              <div style={{ fontSize: 12, color: "#b09090", marginTop: 4 }}>
                {isTeacher ? "You haven't been assigned as an adviser of any section yet." : "This teacher has no advisory assignments yet."}
              </div>
            </div>
          </div>
        ) : (
          <>
            <SectionRail sections={sections} selectedKey={selectedKey} onSelect={setSelectedKey} />
            {selectedEntry && <SectionDetail key={selectedEntry.advisory.advisory_id} entry={selectedEntry} />}
          </>
        )}
      </div>
    </AppLayout>
  );
}
