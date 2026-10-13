import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useRef } from "react";
import { getEnrollments } from "../api/enrollmentApi";
import { getStudents } from "../api/studentApi";
import { motion } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import { pageVariants } from "../utils/motion";
import { describeApiError } from "../utils/apiError";
import { localISODate } from "../utils/format";
import { getCurrentUser, hasAnyRole, GRADE_ROLES } from "../utils/auth";
import { useSchoolYear } from "../context/SchoolYearContext";
import useTheme from "../hooks/useTheme";
import { CARD_DARK } from "../components/ui/darkSurfaces";
import { CHIP_GLOW } from "../constants/statusTones";

const C = {
  dark: "var(--color-neutral-900)", muted: "var(--color-neutral-700)", border: "var(--color-neutral-200)", red: "var(--color-brand-500)",
};

// The dark finish for the learner dropdowns (MENU_DARK's shadow-float-dark):
// a literal, since the dropdown shadow is an inline prop.
const DARK_FLOAT_SHADOW = "0 16px 40px rgba(0,0,0,0.55)";
// The SF2 button's fill (its light end stop is a shade off --color-info-fill-2,
// so light keeps its literal) and a blue glow that shows on a dark page.
const DARK_SF2_FILL = "linear-gradient(135deg,var(--color-info-fill),var(--color-info-fill-2))";
const DARK_SF2_SHADOW = "0 4px 16px rgba(42,111,196,0.30)";
const DARK_SF2_SHADOW_HOVER = "0 6px 20px rgba(42,111,196,0.40)";

const GRADE_LEVELS = [
  "Nursery", "Kindergarten",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9", "Grade 10",
  "Grade 11", "Grade 12",
];

const OTHER_FORMS = [
  {
    code: "SF9", name: "Learner's Report Card",
    desc: "Periodic report card issued to learners at the end of each grading period.",
    icon: "ti-file-certificate", color: "var(--color-success-500)", bg: "var(--color-success-50)", tile: `bg-success-50 ${CHIP_GLOW.success}`, status: "available",
  },
  {
    code: "SF10", name: "Learner's Permanent Record",
    desc: "Cumulative academic record maintained for each learner throughout their schooling.",
    icon: "ti-archive", color: "var(--color-accent-500)", bg: "var(--color-accent-50)", tile: `bg-accent-50 ${CHIP_GLOW.accent}`, status: "available",
  },
];

const inputStyle = {
  width: "100%", height: 40, border: "1.5px solid var(--color-brand-border-soft)", borderRadius: 10,
  padding: "0 12px", fontSize: 13, color: "var(--color-neutral-900)", fontFamily: "'DM Sans',sans-serif",
  outline: "none", boxSizing: "border-box", background: "var(--color-surface)",
};

const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 700, color: "var(--color-neutral-700)",
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6,
};

function Field({ label, el }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {el}
    </div>
  );
}

function studentLabel(s) {
  return `${s.last_name}, ${s.first_name}${s.middle_name ? " " + s.middle_name[0] + "." : ""}`;
}

function enrollmentLabel(enr) {
  let label = `SY ${enr.school_year} — ${enr.grade_level}`;
  if (enr.section)  label += ` · ${enr.section}`;
  if (enr.strand)   label += ` · ${enr.strand}`;
  if (enr.semester) label += ` · ${enr.semester === "1st" ? "1st Sem" : "2nd Sem"}`;
  return label;
}

// Instructional hint shown above an empty learner search. Without it the card
// bottoms out in a bare input: nothing states what the input is for, or that a
// print button only appears once a learner is picked. An unexplained blank
// input reads as unfinished rather than as waiting for input.
function SearchHint({ form }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", marginBottom: 8, background: form.bg, border: `1px solid color-mix(in srgb, ${form.color} 14.9%, transparent)`, borderRadius: 8, fontSize: 11.5, fontWeight: 600, color: form.color, lineHeight: 1.45 }}>
      <i className="ti ti-user-search" style={{ fontSize: 13, flexShrink: 0 }} aria-hidden="true" />
      <span>Search a learner to generate their {form.code} — the print button appears once one is selected.</span>
    </div>
  );
}

function StudentSearch({ borderColor, dropdownBorderColor, dropdownShadow, onSelect }) {
  const [search,    setSearch]    = useState("");
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  // A swallowed failure used to render "No students found.", so an outage was
  // indistinguishable from a learner who genuinely isn't enrolled — the same
  // empty-vs-error conflation ui/ErrorState was introduced to stamp out.
  const [searchError, setSearchError] = useState(null);
  const timerRef = useRef(null);
  const dark = useTheme() === "dark";

  function handleChange(value) {
    setSearch(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    setSearchError(null);
    if (value.trim().length < 2) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await getStudents({ search: value.trim() });
        const list = Array.isArray(data) ? data : data.results ?? [];
        setResults(list.slice(0, 8));
        setSearchError(null);
      } catch (err) {
        setResults([]);
        setSearchError(err);
      }
      finally { setSearching(false); }
    }, 350);
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          value={search}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search by name, LRN, or student no.…"
          aria-label="Search for a learner"
          style={{ ...inputStyle, height: 34, border: `1.5px solid ${borderColor}` }}
        />
        {searching && (
          <span className="text-[#aaa] dark:text-neutral-500" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11 }}>…</span>
        )}
      </div>
      {results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--color-surface-raised)", border: `1.5px solid ${dropdownBorderColor}`, borderRadius: 8, zIndex: 100, boxShadow: dropdownShadow, overflow: "hidden", marginTop: 2 }}>
          {results.map(s => (
            <div
              key={s.student_id}
              onClick={() => { onSelect(s); setSearch(""); setResults([]); }}
              style={{ padding: "8px 12px", fontSize: 12, cursor: "pointer", borderBottom: "1px solid var(--color-neutral-200)", color: "var(--color-neutral-900)" }}
              onMouseEnter={e => e.currentTarget.style.background = dark ? "var(--color-brand-50)" : "#f9f9f9"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--color-surface-raised)"}
            >
              <span style={{ fontWeight: 700 }}>{studentLabel(s)}</span>
              <span style={{ marginLeft: 8, fontSize: 11, color: "var(--color-neutral-600)" }}>LRN: {s.lrn} · {s.student_number}</span>
            </div>
          ))}
        </div>
      )}
      {/* A failed search must look like a failure. Error wins over empty. */}
      {search.trim().length >= 2 && !searching && searchError && (
        <div role="alert" className="border-[1.5px] border-solid border-[#f1aeae] dark:border-error-dot/40" style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--color-surface-raised)", borderRadius: 8, zIndex: 100, padding: "10px 14px", marginTop: 2, boxShadow: dropdownShadow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: "var(--color-brand-600)" }}>
            <i className="ti ti-cloud-off" style={{ fontSize: 13, flexShrink: 0 }} aria-hidden="true" />
            {describeApiError(searchError, { subject: "students" }).title}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-neutral-500)", marginTop: 3, lineHeight: 1.45 }}>
            {describeApiError(searchError, { subject: "students" }).message}
          </div>
        </div>
      )}
      {search.trim().length >= 2 && !searching && !searchError && results.length === 0 && (
        <div className="text-[#aaa] dark:text-neutral-500" style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--color-surface-raised)", border: `1.5px solid ${dropdownBorderColor}`, borderRadius: 8, zIndex: 100, padding: "10px 14px", fontSize: 12, marginTop: 2, boxShadow: dropdownShadow }}>
          No students found.
        </div>
      )}
    </div>
  );
}

export default function SchoolFormsPage() {
  usePageTitle("School Forms");
  // SF2 (attendance), SF9 and SF10 (grades) read records the server refuses
  // accounting; offering them only led to "You do not have access" pages.
  // SF1, the register, is enrollment data every staff role may read.
  const canPrintAcademic = hasAnyRole(getCurrentUser(), GRADE_ROLES);
  const dark = useTheme() === "dark";

  // Shared. Forms print for any registered year, archived ones included.
  const { currentYear, options: registeredYears } = useSchoolYear();
  const [schoolYear, setSchoolYear] = useState(currentYear || "");

  // SF1
  const [gradeLevel, setGradeLevel] = useState("");
  const [section,    setSection]    = useState("");
  const [adviser,    setAdviser]    = useState("");
  const [division,   setDivision]   = useState("");
  const [region,     setRegion]     = useState("");
  const [sf1Error,   setSf1Error]   = useState("");

  // SF2
  const [sf2GradeLevel, setSf2GradeLevel] = useState("");
  const [sf2Section,    setSf2Section]    = useState("");
  const [sf2Month,      setSf2Month]      = useState(() => localISODate(new Date()).slice(0, 7));
  const [sf2Adviser,    setSf2Adviser]    = useState("");
  const [sf2Division,   setSf2Division]   = useState("");
  const [sf2Region,     setSf2Region]     = useState("");
  const [sf2Error,      setSf2Error]      = useState("");

  // SF9
  const [sf9Student,     setSf9Student]     = useState(null);
  const [sf9Enrollments, setSf9Enrollments] = useState([]);
  const [sf9EnrollmentId, setSf9EnrollmentId] = useState("");
  const [sf9LoadingEnr,  setSf9LoadingEnr]  = useState(false);

  // SF10
  const [sf10Student, setSf10Student] = useState(null);

  // Default to the registry's current year, like every other page.
  useEffect(() => {
    if (currentYear) setSchoolYear(currentYear); // eslint-disable-line react-hooks/set-state-in-effect
  }, [currentYear]);

  useEffect(() => {
    if (!sf9Student) { setSf9Enrollments([]); setSf9EnrollmentId(""); return; }
    setSf9LoadingEnr(true);
    getEnrollments({ student: sf9Student.student_id, page_size: 100 })
      .then(data => {
        const list = (Array.isArray(data) ? data : data.results ?? [])
          .sort((a, b) => (b.school_year || "").localeCompare(a.school_year || ""));
        setSf9Enrollments(list);
        setSf9EnrollmentId(list[0]?.enrollment_id ? String(list[0].enrollment_id) : "");
      })
      .catch(() => setSf9Enrollments([]))
      .finally(() => setSf9LoadingEnr(false));
  }, [sf9Student]);

  const isFirstRender = useIsFirstRender();

  function handleOpenSF1() {
    if (!schoolYear.trim() || !gradeLevel || !section.trim()) {
      setSf1Error("School Year, Grade Level, and Section are required.");
      return;
    }
    setSf1Error("");
    const params = new URLSearchParams({
      school_year: schoolYear.trim(),
      grade_level: gradeLevel,
      section:     section.trim(),
      ...(adviser.trim()  ? { adviser:  adviser.trim()  } : {}),
      ...(division.trim() ? { division: division.trim() } : {}),
      ...(region.trim()   ? { region:   region.trim()   } : {}),
    });
    window.open(`/print/sf1?${params.toString()}`, "_blank");
  }

  function handleOpenSF2() {
    if (!schoolYear.trim() || !sf2GradeLevel || !sf2Section.trim() || !sf2Month) {
      setSf2Error("School Year, Grade Level, Section, and Month are required.");
      return;
    }
    setSf2Error("");
    const params = new URLSearchParams({
      school_year: schoolYear.trim(),
      grade_level: sf2GradeLevel,
      section:     sf2Section.trim(),
      month:       sf2Month,
      ...(sf2Adviser.trim()  ? { adviser:  sf2Adviser.trim()  } : {}),
      ...(sf2Division.trim() ? { division: sf2Division.trim() } : {}),
      ...(sf2Region.trim()   ? { region:   sf2Region.trim()   } : {}),
    });
    window.open(`/print/sf2?${params.toString()}`, "_blank");
  }

  return (
    <>
      <PageHeader
        title="School Forms"
        icon="ti-forms"
        subtitle="DepEd official school forms (SF documents)"
        actions={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label htmlFor="sf-school-year" style={{ ...labelStyle, marginBottom: 0, whiteSpace: "nowrap" }}>School Year (all forms)</label>
          <select
            id="sf-school-year"
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            style={{ ...inputStyle, width: 140, height: 34, cursor: "pointer" }}
          >
            {registeredYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        }
      />

      {/* Content */}
      <motion.div
        style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}
        variants={pageVariants.container}
        initial={isFirstRender ? "hidden" : false}
        animate="visible"
      >
        {/* ── SF1 ── */}
        <motion.div variants={pageVariants.item} className={`bg-surface shadow-[0_2px_16px_rgba(224,49,49,0.06)] ${CARD_DARK}`} style={{ borderRadius: 16, border: "1px solid var(--color-neutral-200)" }}>
          <div className="bg-[linear-gradient(to_right,#fdfafa,white)] dark:bg-[linear-gradient(to_right,var(--color-brand-50),var(--color-surface))]" style={{ padding: "18px 24px", borderBottom: "1px solid var(--color-neutral-200)", display: "flex", alignItems: "center", gap: 14, borderRadius: "16px 16px 0 0" }}>
            <div className={`bg-brand-100 ${CHIP_GLOW.brand}`} style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className="ti ti-clipboard-list" style={{ fontSize: 20, color: C.red }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>SF1 — School Register</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 50, background: "var(--color-brand-100)", color: C.red }}>Available</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-neutral-500)", marginTop: 2 }}>
                Official class list of all enrolled learners per section. Required per grade level and section every school year.
              </div>
            </div>
          </div>
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px 20px", marginBottom: 16 }}>
              <Field label="Grade Level *" el={
                <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} style={{ ...inputStyle, color: gradeLevel ? "var(--color-neutral-900)" : dark ? "var(--color-neutral-500)" : "#aaa", cursor: "pointer" }}>
                  <option value="">Select grade level…</option>
                  {GRADE_LEVELS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              } />
              <Field label="Section *" el={
                <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. STEM-B" style={inputStyle} />
              } />
              <Field label="Adviser's Name" el={
                <input value={adviser} onChange={(e) => setAdviser(e.target.value)} placeholder="Optional" style={inputStyle} />
              } />
              <Field label="Division" el={
                <input value={division} onChange={(e) => setDivision(e.target.value)} placeholder="Optional" style={inputStyle} />
              } />
              <Field label="Region" el={
                <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Optional" style={inputStyle} />
              } />
            </div>
            <div style={{ minHeight: 38, marginBottom: sf1Error ? 14 : 0 }}>
              {sf1Error && (
                <div className="bg-[#fef2f2] text-[#b91c1c] dark:bg-error-50 dark:text-error-500" style={{ padding: "9px 14px", border: "1px solid var(--color-brand-300)", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 7 }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{sf1Error}
                </div>
              )}
            </div>
            <motion.button
              onClick={handleOpenSF1}
              whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12 }}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,var(--color-action),var(--color-action-2))", color: "white", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}
            >
              <i className="ti ti-external-link" style={{ fontSize: 14 }} /> Open SF1
            </motion.button>
          </div>
        </motion.div>

        {/* ── SF2 ── attendance, like SF9/SF10's grades, is refused to accounting */}
        {canPrintAcademic && (
        <motion.div variants={pageVariants.item} className={`bg-surface shadow-[0_2px_16px_rgba(20,85,160,0.06)] ${CARD_DARK}`} style={{ borderRadius: 16, border: "1px solid var(--color-neutral-200)" }}>
          <div className="bg-[linear-gradient(to_right,#f5f8fd,white)] dark:bg-[linear-gradient(to_right,color-mix(in_srgb,var(--color-info-50)_40%,var(--color-surface)),var(--color-surface))]" style={{ padding: "18px 24px", borderBottom: "1px solid var(--color-neutral-200)", display: "flex", alignItems: "center", gap: 14, borderRadius: "16px 16px 0 0" }}>
            <div className={`bg-info-50 ${CHIP_GLOW.info}`} style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className="ti ti-calendar-stats" style={{ fontSize: 20, color: "var(--color-info-500)" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>SF2 — Daily Attendance Register</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 50, background: "var(--color-info-50)", color: "var(--color-info-500)" }}>Available</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-neutral-500)", marginTop: 2 }}>
                Monthly learner attendance record per class. Pulls data from the Attendance module.
              </div>
            </div>
          </div>
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px 20px", marginBottom: 16 }}>
              <Field label="Grade Level *" el={
                <select value={sf2GradeLevel} onChange={(e) => setSf2GradeLevel(e.target.value)} style={{ ...inputStyle, color: sf2GradeLevel ? "var(--color-neutral-900)" : dark ? "var(--color-neutral-500)" : "#aaa", cursor: "pointer" }}>
                  <option value="">Select grade level…</option>
                  {GRADE_LEVELS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              } />
              <Field label="Section *" el={
                <input value={sf2Section} onChange={(e) => setSf2Section(e.target.value)} placeholder="e.g. STEM-B" style={inputStyle} />
              } />
              <Field label="Month *" el={
                <input type="month" value={sf2Month} onChange={(e) => setSf2Month(e.target.value)} style={inputStyle} />
              } />
              <Field label="Adviser's Name" el={
                <input value={sf2Adviser} onChange={(e) => setSf2Adviser(e.target.value)} placeholder="Optional" style={inputStyle} />
              } />
              <Field label="Division" el={
                <input value={sf2Division} onChange={(e) => setSf2Division(e.target.value)} placeholder="Optional" style={inputStyle} />
              } />
              <Field label="Region" el={
                <input value={sf2Region} onChange={(e) => setSf2Region(e.target.value)} placeholder="Optional" style={inputStyle} />
              } />
            </div>
            <div style={{ minHeight: 38, marginBottom: sf2Error ? 14 : 0 }}>
              {sf2Error && (
                <div className="border border-[#93b4f5] bg-[#eef3fc] dark:border-info-dot/40 dark:bg-info-50" style={{ padding: "9px 14px", borderRadius: 8, fontSize: 12, color: "var(--color-info-500)", display: "flex", alignItems: "center", gap: 7 }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{sf2Error}
                </div>
              )}
            </div>
            <motion.button
              onClick={handleOpenSF2}
              whileHover={{ scale: 1.02, boxShadow: dark ? DARK_SF2_SHADOW_HOVER : "0 6px 20px rgba(20,85,160,0.30)" }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12 }}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: dark ? DARK_SF2_FILL : "linear-gradient(135deg,#1455a0,#0e4080)", color: "white", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: dark ? DARK_SF2_SHADOW : "0 4px 16px rgba(20,85,160,0.24)" }}
            >
              <i className="ti ti-external-link" style={{ fontSize: 14 }} /> Open SF2
            </motion.button>
          </div>
        </motion.div>
        )}

        {/* ── SF9 / SF10 ── */}
        {canPrintAcademic && (
        <motion.div variants={pageVariants.item} style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {OTHER_FORMS.map((form) => (
            <div key={form.code} className={`bg-surface shadow-[0_2px_12px_rgba(224,49,49,0.05)] ${CARD_DARK}`} style={{ borderRadius: 14, border: "1px solid var(--color-neutral-200)", padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                <div className={form.tile} style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className={`ti ${form.icon}`} style={{ fontSize: 18, color: form.color }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 50, background: form.bg, color: form.color }}>
                  Available
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 5 }}>{form.code} — {form.name}</div>
              <div style={{ fontSize: 12, color: "var(--color-neutral-500)", lineHeight: 1.6, marginBottom: 16 }}>{form.desc}</div>

              {/* ── SF9 ── */}
              {form.code === "SF9" && (
                <div>
                  {sf9Student ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* Selected student chip + clear */}
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ flex: 1, padding: "6px 10px", background: form.bg, border: `1.5px solid color-mix(in srgb, ${form.color} 25%, transparent)`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: form.color }}>
                          {studentLabel(sf9Student)}
                        </div>
                        <button
                          onClick={() => { setSf9Student(null); setSf9Enrollments([]); setSf9EnrollmentId(""); }}
                          aria-label="Clear the selected learner"
                          className="border-[1.5px] border-solid border-[#ddd] dark:border-neutral-300"
                          style={{ padding: "6px 10px", borderRadius: 8, background: "var(--color-surface)", fontSize: 12, cursor: "pointer", color: "var(--color-muted-500)", fontFamily: "'DM Sans',sans-serif" }}
                        >
                          ✕
                        </button>
                      </div>
                      {/* Enrollment picker */}
                      {sf9LoadingEnr ? (
                        <div className="text-[#aaa] dark:text-neutral-500" style={{ fontSize: 12 }}>Loading enrollments…</div>
                      ) : sf9Enrollments.length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--color-brand-600)" }}>No enrollments found for this student.</div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <select
                            value={sf9EnrollmentId}
                            onChange={(e) => setSf9EnrollmentId(e.target.value)}
                            style={{ ...inputStyle, height: 34, flex: 1, border: `1.5px solid color-mix(in srgb, ${form.color} 25%, transparent)`, color: "var(--color-neutral-900)", cursor: "pointer" }}
                          >
                            {sf9Enrollments.map(enr => (
                              <option key={enr.enrollment_id} value={enr.enrollment_id}>
                                {enrollmentLabel(enr)}
                              </option>
                            ))}
                          </select>
                          <motion.button
                            onClick={() => { if (sf9EnrollmentId) window.open(`/print/sf9/${sf9EnrollmentId}`, "_blank"); }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                            transition={{ duration: 0.12 }}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: form.bg, border: `1.5px solid color-mix(in srgb, ${form.color} 25%, transparent)`, color: form.color, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}
                          >
                            <i className="ti ti-printer" style={{ fontSize: 12 }} /> Print SF9
                          </motion.button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <SearchHint form={form} />
                      <StudentSearch
                        borderColor={`color-mix(in srgb, ${form.color} 25%, transparent)`}
                        dropdownBorderColor={`color-mix(in srgb, ${form.color} 25%, transparent)`}
                        dropdownShadow={dark ? DARK_FLOAT_SHADOW : `0 4px 16px rgba(46,107,13,0.12)`}
                        onSelect={setSf9Student}
                      />
                    </>
                  )}
                </div>
              )}

              {/* ── SF10 ── */}
              {form.code === "SF10" && (
                <div>
                  {sf10Student ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ flex: 1, padding: "6px 10px", background: form.bg, border: `1.5px solid color-mix(in srgb, ${form.color} 25%, transparent)`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: form.color }}>
                        {studentLabel(sf10Student)}
                      </div>
                      <button
                        onClick={() => setSf10Student(null)}
                        aria-label="Clear the selected learner"
                        className="border-[1.5px] border-solid border-[#ddd] dark:border-neutral-300"
                        style={{ padding: "6px 10px", borderRadius: 8, background: "var(--color-surface)", fontSize: 12, cursor: "pointer", color: "var(--color-muted-500)", fontFamily: "'DM Sans',sans-serif" }}
                      >
                        ✕
                      </button>
                      <motion.button
                        onClick={() => window.open(`/print/sf10/${sf10Student.student_id}`, "_blank")}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ duration: 0.12 }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: form.bg, border: `1.5px solid color-mix(in srgb, ${form.color} 25%, transparent)`, color: form.color, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}
                      >
                        <i className="ti ti-printer" style={{ fontSize: 12 }} /> Print SF10
                      </motion.button>
                    </div>
                  ) : (
                    <>
                      <SearchHint form={form} />
                      <StudentSearch
                        borderColor={`color-mix(in srgb, ${form.color} 25%, transparent)`}
                        dropdownBorderColor={`color-mix(in srgb, ${form.color} 25%, transparent)`}
                        dropdownShadow={dark ? DARK_FLOAT_SHADOW : `0 4px 16px rgba(124,58,237,0.12)`}
                        onSelect={setSf10Student}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </motion.div>
        )}
      </motion.div>
    </>
  );
}