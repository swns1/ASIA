import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCurrentUser, canViewAuditTrail } from "../utils/auth";

// ── API calls ─────────────────────────────────────────────────────────────
import {
  getEnrollment as _getEnrollment,
  createEnrollment as _createEnrollment,
  updateEnrollment as _updateEnrollment,
  getEnrollments as _getEnrollments,
  getEnrollmentEligibility as _getEligibility,
  getScholarshipTypes as _getScholarshipTypes,
  createEnrollmentScholarship as _createEnrollmentScholarship,
  sendEnrollmentEmail as _sendEnrollmentEmail,
} from "../api/enrollmentApi";
import { getStudents as _getStudents, getStudent as _getStudent } from "../api/studentApi";
import { generateInvoice as _generateInvoice } from "../api/billingApi";

const getStudents                 = (p = {}) => _getStudents(p);
const getStudent                  = (id)     => _getStudent(id);
const createEnrollment            = (p)      => _createEnrollment(p);
const getEnrollment               = (id)     => _getEnrollment(id);
const updateEnrollment            = (id, p)  => _updateEnrollment(id, p);
const getScholarshipTypes         = ()       => _getScholarshipTypes({ is_active: true });
const createEnrollmentScholarship = (p)      => _createEnrollmentScholarship(p);
const sendEnrollmentEmail         = (p)      => _sendEnrollmentEmail(p);
const getStudentEnrollments       = (sid)    => _getEnrollments({ student: sid, page_size: 100 });
const getStudentEligibility       = (sid)    => _getEligibility(sid);

// ─── Style tokens ────────────────────────────────────────────────────────────
const C = {
  red: "#e03131", redLight: "#fff0f0", redBorder: "#fca5a5",
  redMid: "#fde2de", dark: "#1a0a0a", muted: "#7a5050",
  bg: "#fff8f6", white: "#ffffff", shadow: "0 4px 24px rgba(224,49,49,0.10)",
};

const SCHOOL_LEVELS = [
  { value: "nursery",           label: "Nursery",            icon: "ti-baby-carriage" },
  { value: "kindergarten",      label: "Kindergarten",       icon: "ti-star"          },
  { value: "elementary",        label: "Elementary",         icon: "ti-book"          },
  { value: "junior_highschool", label: "Junior High School", icon: "ti-school"        },
  { value: "senior_highschool", label: "Senior High School", icon: "ti-certificate"   },
];

const GRADE_LEVELS_BY_LEVEL = {
  nursery:           ["Nursery"],
  kindergarten:      ["Kindergarten"],
  elementary:        ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"],
  junior_highschool: ["Grade 7","Grade 8","Grade 9","Grade 10"],
  senior_highschool: ["Grade 11","Grade 12"],
};

// Flat ordered list of all grade levels for progression lookup
const ALL_GRADE_LEVELS_ORDERED = [
  "Nursery","Kindergarten",
  "Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6",
  "Grade 7","Grade 8","Grade 9","Grade 10",
  "Grade 11","Grade 12",
];

function getNextGradeLevel(currentGrade) {
  const idx = ALL_GRADE_LEVELS_ORDERED.indexOf(currentGrade);
  if (idx === -1 || idx === ALL_GRADE_LEVELS_ORDERED.length - 1) return null;
  return ALL_GRADE_LEVELS_ORDERED[idx + 1];
}

function getSchoolLevelForGrade(grade) {
  for (const [level, grades] of Object.entries(GRADE_LEVELS_BY_LEVEL)) {
    if (grades.includes(grade)) return level;
  }
  return null;
}

const SHS_STRANDS = [
  "STEM","ABM","HUMSS","GAS","TVL-ICT","TVL-HE","TVL-IA","TVL-AFA","Arts and Design","Sports",
];

const SEMESTERS = [
  { value: "1st", label: "1st Semester" },
  { value: "2nd", label: "2nd Semester" },
];

const ENROLLMENT_STATUSES = [
  { value: "enrolled",  label: "Enrolled",  bg: "#e8f5e0", color: "#2e6b0d", dot: "#4caf50" },
  { value: "pending",   label: "Pending",   bg: "#fef3e2", color: "#7a4a08", dot: "#ff9800" },
  { value: "cancelled", label: "Cancelled", bg: "#fde8e8", color: "#9b2020", dot: "#f44336" },
  { value: "completed", label: "Completed", bg: "#e3f0fd", color: "#1455a0", dot: "#2196f3" },
];

const nullify = (obj, fields) => {
  const out = { ...obj };
  fields.forEach((f) => { if (out[f] === "" || out[f] === undefined) out[f] = null; });
  return out;
};

function defaultSchoolYear() {
  const d = new Date(), y = d.getFullYear();
  return d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function buildSchoolYearOptions() {
  const d = new Date();
  const base = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return Array.from({ length: 4 }, (_, i) => { const y = base + 1 - i; return `${y}-${y + 1}`; });
}

const PALETTES = [
  { bg: "#fde8e8", color: "#c0392b" }, { bg: "#e8f0fd", color: "#2563eb" },
  { bg: "#e8fdf0", color: "#16a34a" }, { bg: "#fdf5e8", color: "#d97706" },
  { bg: "#f0e8fd", color: "#7c3aed" }, { bg: "#fde8f8", color: "#be185d" },
  { bg: "#e8fdfd", color: "#0891b2" },
];
const getPalette = (name = "X") => PALETTES[name.charCodeAt(0) % PALETTES.length];

// ─── Form primitives ─────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%", border: `1.5px solid ${C.redMid}`, borderRadius: 10,
  padding: "10px 14px", fontSize: 14, fontFamily: "'DM Sans', sans-serif",
  color: C.dark, background: "#fffbfb", outline: "none",
  boxSizing: "border-box", transition: "border-color .15s, box-shadow .15s",
};

const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 700, color: C.muted,
  letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5,
};

function Field({ label, hint, children, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}{required && <span style={{ color: C.red }}> *</span>}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 5, fontStyle: "italic" }}>{hint}</div>}
    </div>
  );
}

function Input({ style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <input {...props}
      style={{ ...inputStyle, ...(focused ? { borderColor: C.red, boxShadow: `0 0 0 3px rgba(224,49,49,.10)`, background: C.white } : {}), ...style }}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
  );
}

function Select({ children, style, ...props }) {
  return <select {...props} style={{ ...inputStyle, ...style, cursor: "pointer" }}>{children}</select>;
}

function Textarea({ style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea {...props}
      style={{ ...inputStyle, minHeight: 70, resize: "vertical", ...(focused ? { borderColor: C.red, boxShadow: `0 0 0 3px rgba(224,49,49,.10)`, background: C.white } : {}), ...style }}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
  );
}

function SectionCard({ title, icon, badge, children }) {
  return (
    <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.redMid}`, boxShadow: C.shadow, marginBottom: 0 }}>
      <div style={{ height: 4, background: "linear-gradient(to right, #e03131, #ff6b6b, #fca5a5, #fde8e8)" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px", borderBottom: `1px solid ${C.redMid}`, background: "#fff8f8" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className={`ti ${icon}`} style={{ fontSize: 16, color: C.red }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.dark, fontFamily: "'DM Sans', sans-serif" }}>{title}</span>
        </div>
        {badge != null && (
          <span style={{ background: C.redLight, color: C.red, borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "3px 10px", border: `1px solid ${C.redBorder}` }}>{badge}</span>
        )}
      </div>
      <div style={{ padding: "18px 22px" }}>{children}</div>
    </div>
  );
}

// ─── EligibilityPanel ────────────────────────────────────────────────────────
function EligibilityPanel({ eligibility, loading, overrideMode, overrideReason, onToggleOverride, onChangeReason, isAdmin }) {
  if (loading) {
    return (
      <div style={{ background: "#fff8f6", border: `1px solid ${C.redMid}`, borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 10, color: C.muted, fontSize: 13 }}>
        <i className="ti ti-loader-2" style={{ fontSize: 15, color: C.red, animation: "spin 1s linear infinite" }} />
        Checking enrollment eligibility…
      </div>
    );
  }

  if (!eligibility) return null;

  const { is_eligible, is_new_student, blocking_reasons, missing_docs, can_repeat, admin_override_required, next_allowed_grade, last_enrollment } = eligibility;

  if (is_new_student) {
    return (
      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 14, padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="ti ti-star" style={{ fontSize: 15, color: "#16a34a" }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>New Student</div>
          <div style={{ fontSize: 12, color: "#166534", marginTop: 1 }}>No prior enrollment records. Student can be enrolled in any grade level.</div>
        </div>
      </div>
    );
  }

  const panelBg    = is_eligible ? "#f0fdf4"  : overrideMode ? "#fffbeb"  : "#fef2f2";
  const panelBord  = is_eligible ? "#bbf7d0"  : overrideMode ? "#fde68a"  : "#fca5a5";
  const iconColor  = is_eligible ? "#16a34a"  : overrideMode ? "#d97706"  : C.red;
  const iconBg     = is_eligible ? "#dcfce7"  : overrideMode ? "#fef3c7"  : C.redLight;
  const iconName   = is_eligible ? "ti-circle-check" : overrideMode ? "ti-alert-triangle" : "ti-circle-x";
  const titleColor = is_eligible ? "#15803d"  : overrideMode ? "#92400e"  : "#991b1b";
  const titleText  = is_eligible ? "Eligible for Enrollment" : overrideMode ? "Override Active — Proceed with Caution" : "Enrollment Blocked";

  return (
    <div style={{ background: panelBg, border: `1px solid ${panelBord}`, borderRadius: 14, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className={`ti ${iconName}`} style={{ fontSize: 16, color: iconColor }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: titleColor }}>{titleText}</div>
          {last_enrollment && (
            <div style={{ fontSize: 11, color: "#666", marginTop: 1 }}>
              Last completed: <strong>{last_enrollment.grade_level}</strong>
              {last_enrollment.semester ? ` (${last_enrollment.semester} Sem)` : ""}
              {next_allowed_grade && <> → Next allowed: <strong style={{ color: iconColor }}>{next_allowed_grade}</strong></>}
            </div>
          )}
        </div>
      </div>

      {/* Blocking reasons */}
      {blocking_reasons.length > 0 && (
        <div style={{ background: "rgba(0,0,0,0.03)", borderRadius: 9, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#991b1b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            <i className="ti ti-alert-circle" style={{ marginRight: 5 }} />Failed / Incomplete Subjects
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
            {blocking_reasons.map((r, i) => (
              <li key={i} style={{ fontSize: 12, color: "#7f1d1d" }}>{r}</li>
            ))}
          </ul>
          {can_repeat && (
            <div style={{ fontSize: 11, color: "#92400e", marginTop: 8, fontStyle: "italic" }}>
              Student may repeat the same grade level (retention).
            </div>
          )}
        </div>
      )}

      {/* Missing documents */}
      {missing_docs.length > 0 && (
        <div style={{ background: "rgba(0,0,0,0.03)", borderRadius: 9, padding: "10px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            <i className="ti ti-file-x" style={{ marginRight: 5 }} />Missing Required Documents ({missing_docs.length})
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
            {missing_docs.map((d) => (
              <li key={d.requirement_type_id} style={{ fontSize: 12, color: "#7c2d12" }}>{d.requirement_name}</li>
            ))}
          </ul>
          <div style={{ fontSize: 11, color: "#78350f", marginTop: 8, fontStyle: "italic" }}>
            Enrollment can be created as <strong>Pending</strong>. Documents must be submitted before activating to <strong>Enrolled</strong>.
          </div>
        </div>
      )}

      {/* Admin override toggle — only shown to admin users */}
      {admin_override_required && isAdmin && (
        <div style={{ borderTop: `1px solid ${panelBord}`, paddingTop: 12 }}>
          <button
            type="button"
            onClick={onToggleOverride}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "7px 14px", borderRadius: 99, fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${overrideMode ? "#d97706" : "#d1d5db"}`,
              background: overrideMode ? "#fef3c7" : "white",
              color: overrideMode ? "#92400e" : "#374151",
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all .15s",
            }}>
            <i className={`ti ${overrideMode ? "ti-lock-open" : "ti-lock"}`} style={{ fontSize: 13 }} />
            {overrideMode ? "Override Active" : "Admin Override"}
          </button>
          {overrideMode && (
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#92400e", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5 }}>
                Override Reason <span style={{ color: C.red }}>*</span>
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => onChangeReason(e.target.value)}
                placeholder="Explain why the grade progression rule is being bypassed (e.g. transferee with incomplete records, admin approval)…"
                rows={2}
                style={{ width: "100%", border: "1.5px solid #fcd34d", borderRadius: 9, padding: "9px 12px", fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: "#1c1917", background: "#fffbeb", outline: "none", resize: "vertical", boxSizing: "border-box" }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StudentPicker({ value, onChange, disabled, currentGrade, nextGrade }) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState([]);
  const [gradeMap, setGradeMap] = useState({});
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);

  useEffect(() => {
    if (!query.trim() || disabled) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await getStudents({ search: query, status: "active", page_size: 100 });
        const students = data.results || [];
        setResults(students);

        // Fetch latest enrollment grade for each student in parallel
        const pairs = await Promise.all(
          students.map(async (st) => {
            try {
              const enData = await getStudentEnrollments(st.student_id);
              const enrollments = enData.results ?? enData ?? [];
              if (!enrollments.length) return [st.student_id, null];
              // Pick most recent by school_year then enrollment_id
              const latest = enrollments.reduce((a, b) => {
                if (a.school_year > b.school_year) return a;
                if (b.school_year > a.school_year) return b;
                return (a.enrollment_id ?? 0) > (b.enrollment_id ?? 0) ? a : b;
              });
              return [st.student_id, latest.grade_level ?? null];
            } catch { return [st.student_id, null]; }
          })
        );
        setGradeMap(Object.fromEntries(pairs));
      } catch (e) { console.error(e); setResults([]); }
      finally { setLoading(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [query, disabled]);

  if (value) {
    const p = getPalette(value.last_name ?? "X");
    const initials = `${value.first_name?.[0] ?? ""}${value.last_name?.[0] ?? ""}`.toUpperCase();
    const fullName = [value.first_name, value.middle_name, value.last_name, value.suffix].filter(Boolean).join(" ");
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", border: `1.5px solid ${C.redMid}`, borderRadius: 12, background: "linear-gradient(to right, #fff8f6, white)" }}>
        <div style={{ width: 46, height: 46, borderRadius: "50%", background: p.bg, color: p.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{initials || "?"}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{fullName}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            {value.student_number && <span><i className="ti ti-id-badge" style={{ fontSize: 11, marginRight: 3 }} />{value.student_number}</span>}
            {value.lrn && <span><i className="ti ti-fingerprint" style={{ fontSize: 11, marginRight: 3 }} />LRN {value.lrn}</span>}
            {currentGrade && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#fff0e8", color: "#b45309", border: "1px solid #fcd9a8", borderRadius: 99, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                <i className="ti ti-school" style={{ fontSize: 10 }} />Current: {currentGrade}
                {nextGrade && <> → <span style={{ color: C.red }}>{nextGrade}</span></>}
              </span>
            )}
            {!currentGrade && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 99, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                <i className="ti ti-star" style={{ fontSize: 10 }} />New student
              </span>
            )}
          </div>
        </div>
        {!disabled && (
          <button type="button" onClick={() => onChange(null)}
            style={{ background: "transparent", border: `1px solid ${C.redMid}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, color: C.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
            Change
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "white", border: `1.5px solid ${C.redMid}`, borderRadius: 12, padding: "0 14px", height: 44 }}>
        <i className="ti ti-search" style={{ fontSize: 15, color: "#c0a0a0" }} />
        <input placeholder="Search by name, LRN, or student number…" value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={{ flex: 1, border: "none", background: "transparent", fontSize: 14, color: C.dark, outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
        {loading && <i className="ti ti-loader-2" style={{ fontSize: 14, color: C.red, animation: "spin 1s linear infinite" }} />}
      </div>
      {open && query && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 6, background: "white", borderRadius: 12, border: `1px solid ${C.redMid}`, boxShadow: "0 12px 40px rgba(224,49,49,0.14)", maxHeight: 320, overflowY: "auto", zIndex: 9999 }}>
          {results.length === 0 && !loading && (
            <div style={{ padding: "20px 16px", textAlign: "center", color: C.muted, fontSize: 13 }}>No students match "{query}".</div>
          )}
          {results.map((st) => {
            const p = getPalette(st.last_name ?? "X");
            const initials = `${st.first_name?.[0] ?? ""}${st.last_name?.[0] ?? ""}`.toUpperCase();
            const fullName = [st.last_name + ",", st.first_name, st.middle_name].filter(Boolean).join(" ");
            const lastGrade = gradeMap[st.student_id];
            const next = lastGrade ? getNextGradeLevel(lastGrade) : null;
            return (
              <div key={st.student_id} onClick={() => { onChange(st, lastGrade); setOpen(false); setQuery(""); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f9f0f0", transition: "background .12s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#fff8f6")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: p.bg, color: p.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials || "?"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{fullName}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span>LRN {st.lrn} · {st.student_number ?? "—"}</span>
                    {lastGrade ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#fff0e8", color: "#b45309", border: "1px solid #fcd9a8", borderRadius: 99, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
                        {lastGrade}{next ? <> → <span style={{ color: C.red }}>{next}</span></> : " (final grade)"}
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 99, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
                        New
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function EnrollmentFormPage() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const isEdit   = Boolean(id);
  const isAdmin  = canViewAuditTrail(getCurrentUser());

  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [invoicePrompt, setInvoicePrompt] = useState(null); // { enrollmentId, studentName }
  const [student, setStudent] = useState(null);
  const [studentLastGrade, setStudentLastGrade] = useState(null);

  // Eligibility state (new enrollment)
  const [eligibility,        setEligibility]        = useState(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [overrideMode,       setOverrideMode]       = useState(false);
  const [overrideReason,     setOverrideReason]     = useState("");

  // Edit-mode grade placement unlock state
  const [gradePlacementUnlocked, setGradePlacementUnlocked] = useState(false);
  const [gradePlacementReason,   setGradePlacementReason]   = useState("");

  // Original grade fields when editing — used to detect if they actually changed
  const [originalGradeFields, setOriginalGradeFields] = useState(null);

  const [form, setForm] = useState({
    school_year:       defaultSchoolYear(),
    school_level:      "elementary",
    grade_level:       "Grade 1",
    section:           "",
    strand:            "",
    semester:          "",
    enrollment_status: "enrolled",
  });

  const [scholarshipTypes,     setScholarshipTypes] = useState([]);
  const [selectedScholarships, setSelectedSchols]   = useState([]);
  const [scholarshipNotes,     setScholarshipNotes] = useState("");

  useEffect(() => {
    getScholarshipTypes()
      .then((d) => setScholarshipTypes(Array.isArray(d) ? d : d?.results ?? []))
      .catch(() => setScholarshipTypes([]));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    getEnrollment(id)
      .then(async (e) => {
        setForm({
          school_year:       e.school_year ?? defaultSchoolYear(),
          school_level:      e.school_level,
          grade_level:       e.grade_level,
          section:           e.section,
          strand:            e.strand ?? "",
          semester:          e.semester ?? "",
          enrollment_status: e.enrollment_status,
        });
        setOriginalGradeFields({
          school_year:  e.school_year ?? defaultSchoolYear(),
          school_level: e.school_level,
          grade_level:  e.grade_level,
          strand:       e.strand ?? "",
          semester:     e.semester ?? "",
        });
        if (e.student_id) {
          const s = await getStudent(e.student_id).catch(() => null);
          if (s) setStudent(s);
        }
      })
      .catch((err) => setError(err?.message ?? "Failed to load enrollment."))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const gradeOptions = useMemo(() => GRADE_LEVELS_BY_LEVEL[form.school_level] ?? [], [form.school_level]);
  const isSHS        = form.school_level === "senior_highschool";

  useEffect(() => {
    setForm((f) => {
      const next = { ...f };
      if (!gradeOptions.includes(f.grade_level)) next.grade_level = gradeOptions[0] ?? "";
      if (isSHS) { if (!next.semester) next.semester = "1st"; }
      else       { next.strand = ""; next.semester = ""; }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.school_level]);

  const nextAllowedGrade = studentLastGrade ? getNextGradeLevel(studentLastGrade) : null;

  const handleStudentChange = (st, lastGrade) => {
    if (!st) {
      setStudent(null);
      setStudentLastGrade(null);
      setEligibility(null);
      setOverrideMode(false);
      setOverrideReason("");
      return;
    }
    setStudent(st);
    setStudentLastGrade(lastGrade ?? null);
    setOverrideMode(false);
    setOverrideReason("");

    if (lastGrade) {
      const next = getNextGradeLevel(lastGrade);
      if (next) {
        const level = getSchoolLevelForGrade(next);
        setForm((f) => ({ ...f, school_level: level, grade_level: next, strand: "", semester: level === "senior_highschool" ? (f.semester || "1st") : "" }));
      }
    }

    // Fetch eligibility report for the selected student
    setEligibilityLoading(true);
    getStudentEligibility(st.student_id)
      .then((data) => setEligibility(data))
      .catch(() => setEligibility(null))
      .finally(() => setEligibilityLoading(false));
  };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleScholarship = (sid) =>
    setSelectedSchols((arr) => arr.includes(sid) ? arr.filter((x) => x !== sid) : [...arr, sid]);

  const gradePlacementChanged = useMemo(() => {
    if (!isEdit || !originalGradeFields) return false;
    return (
      form.school_year  !== originalGradeFields.school_year  ||
      form.school_level !== originalGradeFields.school_level ||
      form.grade_level  !== originalGradeFields.grade_level  ||
      form.strand       !== originalGradeFields.strand        ||
      form.semester     !== originalGradeFields.semester
    );
  }, [isEdit, form, originalGradeFields]);

  const validationError = useMemo(() => {
    if (!student && !isEdit)          return "Please select a student.";
    if (!form.school_year.trim())     return "School year is required.";
    if (!form.school_level)           return "School level is required.";
    if (!form.grade_level)            return "Grade level is required.";
    if (!form.section.trim())         return "Section is required.";
    if (isSHS && !form.semester)      return "Semester is required for Senior HS.";
    if (isSHS && !form.strand.trim()) return "Strand is required for Senior HS.";
    if (!isEdit && eligibility && !eligibility.is_eligible && !overrideMode)
      return "Student is not eligible for enrollment. Review the eligibility panel above.";
    if (!isEdit && nextAllowedGrade && form.grade_level !== nextAllowedGrade && !overrideMode)
      return `This student must enroll in ${nextAllowedGrade} (next after ${studentLastGrade}).`;
    if (!isEdit && overrideMode && !overrideReason.trim())
      return "An override reason is required when bypassing grade progression rules.";
    if (isEdit && gradePlacementChanged && !gradePlacementReason.trim())
      return "A reason is required when changing grade placement on an existing enrollment.";
    return "";
  }, [student, form, isSHS, isEdit, eligibility, nextAllowedGrade, studentLastGrade, overrideMode, overrideReason, gradePlacementChanged, gradePlacementReason]);

    const handleSubmit = async () => {
      setError("");
      if (validationError) { setError(validationError); return; }
      setSaving(true);
      try {
        const payload = nullify({ ...form, student: student.student_id }, ["strand", "semester"]);
        if (overrideMode) {
          payload.progression_override = true;
          payload.progression_override_reason = overrideReason.trim();
        }
        if (isEdit) {
          if (gradePlacementChanged) {
            payload.progression_override = true;
            payload.progression_override_reason = gradePlacementReason.trim();
          }
          await updateEnrollment(id, payload);
        } else {
          const created = await createEnrollment(payload);

          for (const stId of selectedScholarships) {
            await createEnrollmentScholarship({
              enrollment: created.enrollment_id,
              scholarship_type: stId,
              notes: scholarshipNotes || null,
            }).catch((e) => console.error("scholarship attach failed", e));
          }

          // Send enrollment confirmation email (non-blocking)
          if (student?.email) {
            const fullName = [student.first_name, student.middle_name, student.last_name]
              .filter(Boolean).join(" ");
            sendEnrollmentEmail({
              student_name: fullName,
              student_email: student.email,
              grade_level: form.grade_level,
              section: form.section,
              school_year: form.school_year,
              school_level: form.school_level,
            }).catch((e) => console.warn("Enrollment email failed (non-critical):", e));
          }

          // Prompt to generate invoice when enrollment status is enrolled
          if (form.enrollment_status === "enrolled") {
            const fullName = [student?.first_name, student?.last_name].filter(Boolean).join(" ");
            setInvoicePrompt({ enrollmentId: created.enrollment_id, studentName: fullName || `Enrollment #${created.enrollment_id}` });
            setSaving(false);
            return;
          }
        }

        navigate("/enrollments");
      } catch (err) {
        console.error(err);
        setError(err?.message || "Something went wrong. Please review the form.");
      } finally {
        setSaving(false);
      }
    };

  const statusMeta = ENROLLMENT_STATUSES.find((s) => s.value === form.enrollment_status) ?? ENROLLMENT_STATUSES[0];

  return (
    <>
    <div style={{ minHeight: "100vh", background: C.bg, padding: "28px 20px", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0} to{opacity:1} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        * { box-sizing:border-box; }
      `}</style>

      <div style={{ maxWidth: 820, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <button onClick={() => navigate("/enrollments")}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans', sans-serif" }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 13 }} />Back to Enrollments
          </button>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 28, color: C.dark, fontFamily: "'DM Sans', sans-serif", fontWeight: 700 }}>
                {isEdit ? "Edit Enrollment" : "New Enrollment"}
              </h2>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                {isEdit ? "Update class assignment, status, or term details." : "Enroll an existing student into a school year and section."}
              </div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 14px", borderRadius: 99, background: statusMeta.bg, color: statusMeta.color, fontSize: 12, fontWeight: 700 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusMeta.dot }} />{statusMeta.label}
            </span>
          </div>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-alert-circle" style={{ fontSize: 15 }} />{error}
          </div>
        )}

        {loading ? (
          <div style={{ background: C.white, borderRadius: 16, padding: 60, textAlign: "center", color: C.muted, border: `1px solid ${C.redMid}`, boxShadow: C.shadow }}>Loading enrollment…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* 1. Student */}
            <SectionCard title="Student" icon="ti-user-search">
              {isEdit ? (
                <>
                  <Field label="Enrolling Student"><StudentPicker value={student} onChange={() => {}} disabled /></Field>
                  <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>The student cannot be changed on an existing enrollment.</div>
                </>
              ) : (
                <Field label="Enrolling Student" required hint="Find an existing student record. Need to register a new one first? Use the Students page.">
                  <StudentPicker value={student} onChange={handleStudentChange} currentGrade={studentLastGrade} nextGrade={nextAllowedGrade} />
                </Field>
              )}
            </SectionCard>

            {/* Eligibility panel — new enrollments only */}
            {!isEdit && student && (
              <EligibilityPanel
                eligibility={eligibility}
                loading={eligibilityLoading}
                overrideMode={overrideMode}
                overrideReason={overrideReason}
                onToggleOverride={() => { setOverrideMode((v) => !v); setOverrideReason(""); }}
                onChangeReason={setOverrideReason}
                isAdmin={isAdmin}
              />
            )}

            {/* 2. Term */}
            <SectionCard title="Academic Term" icon="ti-calendar-event">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
                <Field label="School Year" required
                  hint={isEdit && !gradePlacementUnlocked ? "Locked — unlock grade placement to change." : undefined}>
                  {isEdit && !gradePlacementUnlocked ? (
                    <div style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", borderColor: "#e2e8f0", color: "#475569", fontWeight: 700, cursor: "not-allowed" }}>
                      <i className="ti ti-lock" style={{ fontSize: 13, color: "#94a3b8" }} />
                      {form.school_year}
                    </div>
                  ) : (
                    <Select value={form.school_year} onChange={(e) => setField("school_year", e.target.value)}>
                      {buildSchoolYearOptions().map((sy) => <option key={sy} value={sy}>{sy}</option>)}
                    </Select>
                  )}
                </Field>
                <Field label="Enrollment Status" required>
                  <Select value={form.enrollment_status} onChange={(e) => setField("enrollment_status", e.target.value)}>
                    {ENROLLMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                </Field>
              </div>
            </SectionCard>

            {/* 3. Class Assignment */}
            <SectionCard title="Class Assignment" icon="ti-school"
              badge={isEdit && gradePlacementChanged ? "Modified" : null}>

              {/* Edit-mode: lock banner + unlock toggle */}
              {isEdit && (
                <div style={{
                  marginBottom: 16,
                  padding: "12px 16px",
                  borderRadius: 10,
                  background: gradePlacementUnlocked ? "#fffbeb" : "#f8fafc",
                  border: `1px solid ${gradePlacementUnlocked ? "#fde68a" : "#e2e8f0"}`,
                  display: "flex", alignItems: "flex-start", gap: 12,
                }}>
                  <i className={`ti ${gradePlacementUnlocked ? "ti-lock-open" : "ti-lock"}`}
                    style={{ fontSize: 16, color: gradePlacementUnlocked ? "#d97706" : "#64748b", marginTop: 1, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: gradePlacementUnlocked ? "#92400e" : "#334155" }}>
                      {gradePlacementUnlocked ? "Grade placement unlocked — changes will be audited" : "Grade placement is locked"}
                    </div>
                    <div style={{ fontSize: 11, color: gradePlacementUnlocked ? "#a16207" : "#64748b", marginTop: 2 }}>
                      {gradePlacementUnlocked
                        ? "You may now change grade level, school level, strand, or semester. A reason is required."
                        : "School level, grade level, strand, and semester cannot be changed without admin override."}
                    </div>
                    {gradePlacementUnlocked && (
                      <div style={{ marginTop: 10 }}>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#92400e", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5 }}>
                          Reason for change <span style={{ color: C.red }}>*</span>
                        </label>
                        <textarea
                          value={gradePlacementReason}
                          onChange={(e) => setGradePlacementReason(e.target.value)}
                          placeholder="Explain why the grade placement is being corrected (e.g. data entry error, transferee re-classification)…"
                          rows={2}
                          style={{ width: "100%", border: "1.5px solid #fcd34d", borderRadius: 9, padding: "9px 12px", fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: "#1c1917", background: "#fffbeb", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setGradePlacementUnlocked((v) => !v);
                      setGradePlacementReason("");
                      // Reset grade fields to original when re-locking
                      if (gradePlacementUnlocked && originalGradeFields) {
                        setForm((f) => ({ ...f, ...originalGradeFields }));
                      }
                    }}
                    style={{
                      flexShrink: 0, padding: "6px 13px", borderRadius: 99, fontSize: 12, fontWeight: 700,
                      border: `1.5px solid ${gradePlacementUnlocked ? "#fcd34d" : "#cbd5e1"}`,
                      background: gradePlacementUnlocked ? "#fef3c7" : "white",
                      color: gradePlacementUnlocked ? "#92400e" : "#475569",
                      cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    }}>
                    {gradePlacementUnlocked ? "Re-lock" : "Unlock"}
                  </button>
                </div>
              )}

              <Field label="School Level" required>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SCHOOL_LEVELS.map((lvl) => {
                    const active = form.school_level === lvl.value;
                    const locked = (isEdit && !gradePlacementUnlocked) || (!isEdit && Boolean(nextAllowedGrade));
                    return (
                      <button key={lvl.value} type="button"
                        onClick={() => !locked && setField("school_level", lvl.value)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 99, border: `1.5px solid ${active ? C.red : "#f0e4e4"}`, background: active ? C.redLight : "white", color: active ? C.red : C.muted, fontSize: 13, fontWeight: active ? 700 : 500, cursor: locked ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all .15s", opacity: locked && !active ? 0.45 : 1 }}>
                        <i className={`ti ${lvl.icon}`} style={{ fontSize: 14 }} />{lvl.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
                <Field label="Grade Level" required hint={!isEdit && nextAllowedGrade ? `Locked to ${nextAllowedGrade} based on student's last grade (${studentLastGrade}).` : undefined}>
                  {(isEdit && !gradePlacementUnlocked) || (!isEdit && nextAllowedGrade) ? (
                    <div style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", borderColor: "#e2e8f0", color: "#475569", fontWeight: 700, cursor: "not-allowed" }}>
                      <i className="ti ti-lock" style={{ fontSize: 13, color: "#94a3b8" }} />
                      {form.grade_level}
                    </div>
                  ) : (
                    <Select value={form.grade_level} onChange={(e) => setField("grade_level", e.target.value)}>
                      {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                    </Select>
                  )}
                </Field>
                <Field label="Section" required>
                  <Input value={form.section} onChange={(e) => setField("section", e.target.value)} placeholder="e.g. Sampaguita, Section A" />
                </Field>
              </div>
              {isSHS && (
                <div style={{ marginTop: 6, padding: "16px 18px", background: "linear-gradient(to right, #fff8f6, #fff)", border: `1px dashed ${C.redBorder}`, borderRadius: 12 }}>
                  <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>Senior HS specifics</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
                    <Field label="Strand" required>
                      {isEdit && !gradePlacementUnlocked ? (
                        <div style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", borderColor: "#e2e8f0", color: "#475569", fontWeight: 700, cursor: "not-allowed" }}>
                          <i className="ti ti-lock" style={{ fontSize: 13, color: "#94a3b8" }} />
                          {form.strand || "—"}
                        </div>
                      ) : (
                        <Select value={form.strand} onChange={(e) => setField("strand", e.target.value)}>
                          <option value="">— Select strand —</option>
                          {SHS_STRANDS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </Select>
                      )}
                    </Field>
                    <Field label="Semester" required>
                      {isEdit && !gradePlacementUnlocked ? (
                        <div style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", borderColor: "#e2e8f0", color: "#475569", fontWeight: 700, cursor: "not-allowed" }}>
                          <i className="ti ti-lock" style={{ fontSize: 13, color: "#94a3b8" }} />
                          {form.semester || "—"}
                        </div>
                      ) : (
                        <Select value={form.semester} onChange={(e) => setField("semester", e.target.value)}>
                          {SEMESTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </Select>
                      )}
                    </Field>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* 4. Scholarships (create only) */}
            {!isEdit && (
              <SectionCard title="Scholarships" icon="ti-discount" badge={selectedScholarships.length > 0 ? selectedScholarships.length : null}>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, fontStyle: "italic" }}>Optional. Attach any scholarships this enrollment qualifies for.</div>
                {scholarshipTypes.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px 0", color: C.muted, fontSize: 13 }}>No active scholarship types available.</div>
                ) : (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {scholarshipTypes.map((sc) => {
                        const active = selectedScholarships.includes(sc.scholarship_type_id);
                        const valLabel = sc.discount_mode === "percentage" ? `${parseFloat(sc.discount_value)}%` : `₱ ${parseFloat(sc.discount_value).toLocaleString()}`;
                        return (
                          <div key={sc.scholarship_type_id} onClick={() => toggleScholarship(sc.scholarship_type_id)}
                            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${active ? C.red : "#f0e4e4"}`, background: active ? C.redLight : "#fffbfb", cursor: "pointer", transition: "all .14s" }}>
                            <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${active ? C.red : "#d0b8b8"}`, background: active ? C.red : "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {active && <i className="ti ti-check" style={{ fontSize: 12, color: "white" }} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{sc.scholarship_name}</div>
                              {sc.description && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sc.description}</div>}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: active ? C.red : C.muted, background: active ? "white" : "#f9f4f4", padding: "4px 10px", borderRadius: 99, whiteSpace: "nowrap" }}>{valLabel} off</span>
                          </div>
                        );
                      })}
                    </div>
                    {selectedScholarships.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <Field label="Notes" hint="Optional remarks applied to all selected scholarships.">
                          <Textarea value={scholarshipNotes} onChange={(e) => setScholarshipNotes(e.target.value)} placeholder="e.g. Approved by registrar on 2026-06-10" />
                        </Field>
                      </div>
                    )}
                  </>
                )}
              </SectionCard>
            )}

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 12 }}>
              <button type="button" onClick={() => navigate("/enrollments")}
                style={{ background: "transparent", color: C.muted, border: `1.5px solid ${C.redMid}`, borderRadius: 50, padding: "10px 24px", fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
                Cancel
              </button>
              <button type="button" onClick={handleSubmit} disabled={saving || Boolean(validationError)}
                style={{ background: validationError ? "#f0c4c4" : "linear-gradient(135deg, #e03131, #c92a2a)", color: "#fff", border: "none", borderRadius: 50, padding: "11px 28px", fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: validationError ? "not-allowed" : "pointer", letterSpacing: ".02em", boxShadow: validationError ? "none" : "0 6px 20px rgba(224,49,49,0.28)", display: "inline-flex", alignItems: "center", gap: 8, opacity: saving ? 0.7 : 1 }}
                title={validationError || ""}>
                {saving ? (
                  <><i className="ti ti-loader-2" style={{ fontSize: 14, animation: "spin 1s linear infinite" }} />Saving…</>
                ) : isEdit ? (
                  <><i className="ti ti-device-floppy" style={{ fontSize: 15 }} />Update Enrollment</>
                ) : (
                  <><i className="ti ti-check" style={{ fontSize: 15 }} />Submit Enrollment</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* ── Invoice Prompt Modal ─────────────────────────────────────────────── */}
    {invoicePrompt && (
      <InvoicePromptModal
        enrollmentId={invoicePrompt.enrollmentId}
        studentName={invoicePrompt.studentName}
        onClose={() => { setInvoicePrompt(null); navigate("/enrollments"); }}
        onGoToInvoices={() => navigate(`/invoices?enrollment_id=${invoicePrompt.enrollmentId}`)}
      />
    )}
    </>
  );
}

function InvoicePromptModal({ enrollmentId, studentName, onClose, onGoToInvoices }) {
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState("monthly");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      await _generateInvoice({ enrollment_id: enrollmentId, payment_plan: plan });
      setDone(true);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to generate invoice.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "white", borderRadius: 16, padding: 32, maxWidth: 420, width: "100%", boxShadow: "0 8px 40px rgba(224,49,49,0.18)", fontFamily: "'DM Sans', sans-serif" }}>
        {done ? (
          <>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#e8f5e0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <i className="ti ti-circle-check" style={{ fontSize: 28, color: "#2e6b0d" }} />
              </div>
              <h3 style={{ margin: "0 0 6px", fontSize: 18, color: "#1a0a0a" }}>Invoice Generated</h3>
              <p style={{ margin: 0, fontSize: 14, color: "#7a5050" }}>Invoice created for <strong>{studentName}</strong>. You can view it in the Invoices page.</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 50, border: "1.5px solid #fca5a5", background: "transparent", color: "#7a5050", fontWeight: 600, cursor: "pointer" }}>
                Back to Enrollments
              </button>
              <button onClick={onGoToInvoices} style={{ flex: 1, padding: "10px 0", borderRadius: 50, border: "none", background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", fontWeight: 700, cursor: "pointer" }}>
                View Invoices
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 18, color: "#1a0a0a" }}>Generate Invoice?</h3>
              <p style={{ margin: 0, fontSize: 14, color: "#7a5050" }}>
                <strong>{studentName}</strong> has been enrolled. Would you like to generate a billing invoice now?
              </p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#5a3a3a", display: "block", marginBottom: 6 }}>Payment Plan</label>
              <select value={plan} onChange={(e) => setPlan(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #fca5a5", fontSize: 14, background: "#fff8f6", color: "#1a0a0a" }}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semi_annual">Semi-Annual</option>
                <option value="annual">Annual (Full Year)</option>
              </select>
            </div>
            {error && <p style={{ color: "#e03131", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} disabled={generating} style={{ flex: 1, padding: "10px 0", borderRadius: 50, border: "1.5px solid #fca5a5", background: "transparent", color: "#7a5050", fontWeight: 600, cursor: "pointer" }}>
                Skip for Now
              </button>
              <button onClick={handleGenerate} disabled={generating} style={{ flex: 1, padding: "10px 0", borderRadius: 50, border: "none", background: generating ? "#f0c4c4" : "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", fontWeight: 700, cursor: generating ? "not-allowed" : "pointer" }}>
                {generating ? "Generating…" : "Generate Invoice"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}