import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

// ── API calls ─────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8003/api";
const AUTH_API = "http://localhost:8000";

function getToken() {
  return sessionStorage.getItem("access_token") || "";
}

async function apiCall(method, url, body = null) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body && method !== "GET") opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err}`);
  }
  return res.json();
}

const getStudents             = (p = {}) => apiCall("GET",   `${AUTH_API}/api/students/?${new URLSearchParams(p)}`);
const getStudent              = (id)     => apiCall("GET",   `${AUTH_API}/api/students/${id}/`);
const createEnrollment        = (p)      => apiCall("POST",  `${API_BASE}/enrollments/`, p);
const getEnrollment           = (id)     => apiCall("GET",   `${API_BASE}/enrollments/${id}/`);
const updateEnrollment        = (id, p)  => apiCall("PATCH", `${API_BASE}/enrollments/${id}/`, p);
const getScholarshipTypes     = ()       => apiCall("GET",   `${API_BASE}/scholarship-types/?is_active=true`);
const createEnrollmentScholarship = (p)  => apiCall("POST",  `${API_BASE}/enrollment-scholarships/`, p);
const sendEnrollmentEmail = (p) => apiCall("POST", `http://localhost:8003/api/send-enrollment-email/`, p);
const getStudentEnrollments   = (sid)    => apiCall("GET",   `${API_BASE}/enrollments/?student=${sid}&page_size=100`);

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
  return d.getMonth() >= 5 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function buildSchoolYearOptions() {
  const d = new Date();
  const base = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
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

  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [student, setStudent] = useState(null);
  const [studentLastGrade, setStudentLastGrade] = useState(null);

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
      return;
    }
    setStudent(st);
    setStudentLastGrade(lastGrade ?? null);
    if (lastGrade) {
      const next = getNextGradeLevel(lastGrade);
      if (next) {
        const level = getSchoolLevelForGrade(next);
        setForm((f) => ({ ...f, school_level: level, grade_level: next, strand: "", semester: level === "senior_highschool" ? (f.semester || "1st") : "" }));
      }
    }
  };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleScholarship = (sid) =>
    setSelectedSchols((arr) => arr.includes(sid) ? arr.filter((x) => x !== sid) : [...arr, sid]);

  const validationError = useMemo(() => {
    if (!student && !isEdit)          return "Please select a student.";
    if (!form.school_year.trim())     return "School year is required.";
    if (!form.school_level)           return "School level is required.";
    if (!form.grade_level)            return "Grade level is required.";
    if (!form.section.trim())         return "Section is required.";
    if (isSHS && !form.semester)      return "Semester is required for Senior HS.";
    if (isSHS && !form.strand.trim()) return "Strand is required for Senior HS.";
    if (!isEdit && nextAllowedGrade && form.grade_level !== nextAllowedGrade)
      return `This student must enroll in ${nextAllowedGrade} (next after ${studentLastGrade}).`;
    return "";
  }, [student, form, isSHS, isEdit, nextAllowedGrade, studentLastGrade]);

    const handleSubmit = async () => {
      setError("");
      if (validationError) { setError(validationError); return; }
      setSaving(true);
      console.log("Student object:", student);
      try {
        const payload = nullify({ ...form, student: student.student_id }, ["strand", "semester"]);
        if (isEdit) { 
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

            {/* 2. Term */}
            <SectionCard title="Academic Term" icon="ti-calendar-event">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
                <Field label="School Year" required>
                  <Select value={form.school_year} onChange={(e) => setField("school_year", e.target.value)}>
                    {buildSchoolYearOptions().map((sy) => <option key={sy} value={sy}>{sy}</option>)}
                  </Select>
                </Field>
                <Field label="Enrollment Status" required>
                  <Select value={form.enrollment_status} onChange={(e) => setField("enrollment_status", e.target.value)}>
                    {ENROLLMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                </Field>
              </div>
            </SectionCard>

            {/* 3. Class Assignment */}
            <SectionCard title="Class Assignment" icon="ti-school">
              <Field label="School Level" required>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SCHOOL_LEVELS.map((lvl) => {
                    const active = form.school_level === lvl.value;
                    const locked = !isEdit && Boolean(nextAllowedGrade);
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
                  {!isEdit && nextAllowedGrade ? (
                    <div style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 8, background: "#fff8f0", borderColor: "#fcd9a8", color: "#b45309", fontWeight: 700, cursor: "not-allowed" }}>
                      <i className="ti ti-lock" style={{ fontSize: 13, color: "#b45309" }} />
                      {nextAllowedGrade}
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
                      <Select value={form.strand} onChange={(e) => setField("strand", e.target.value)}>
                        <option value="">— Select strand —</option>
                        {SHS_STRANDS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </Field>
                    <Field label="Semester" required>
                      <Select value={form.semester} onChange={(e) => setField("semester", e.target.value)}>
                        {SEMESTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </Select>
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
  );
}