import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getEnrollments, getSections, downloadSchoolForm } from "../api/enrollmentApi";
import useMyAdvisories, { advisoriesIn } from "../hooks/useMyAdvisories";
import { getStudents } from "../api/studentApi";
import { motion } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import { pageVariants } from "../utils/motion";
import { describeApiError } from "../utils/apiError";
import { localISODate } from "../utils/format";
import { saveBlob } from "../utils/download";
import { getCurrentUser, hasAnyRole, GRADE_ROLES, BILLING_ROLES } from "../utils/auth";
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

// Senior high is enrolled per semester, so its SF1 and SF2 are too.
const SENIOR_HIGH = new Set(["Grade 11", "Grade 12"]);
const SEMESTERS = [{ value: "1st", label: "1st Semester" }, { value: "2nd", label: "2nd Semester" }];

// The school keeps one SF10 per level, in its own format; a learner gets one
// for each level they attended here. Kindergarten goes on the elementary
// record's first row, so a Kinder learner gets an SF10-ES too. Rows that
// never became a place (pending, cancelled) don't count.
const SF10_LEVELS = [
  { value: "elementary",        label: "Kinder & Elementary (SF10-ES)", from: ["kindergarten", "elementary"] },
  { value: "junior_highschool", label: "Junior High (SF10-JHS)",        from: ["junior_highschool"] },
  { value: "senior_highschool", label: "Senior High (SF10-SHS)",        from: ["senior_highschool"] },
];
const ATTENDED_STATUSES = ["enrolled", "completed", "transferred_out"];
// What the certification says this copy is for, unless the registrar types otherwise.
const SF10_PURPOSE = "TRANSFER CREDENTIAL PURPOSES";
// The SF10 card's two downloads: the editable Excel file, and a PDF of it as it prints.
const SF10_FILES = [
  { file: "xlsx", label: "Excel", icon: "ti-file-spreadsheet" },
  { file: "pdf",  label: "PDF",   icon: "ti-file-type-pdf" },
];

const OTHER_FORMS = [
  {
    code: "SF9", name: "Learner's Report Card",
    desc: "DepEd's report card with the school's letterhead, as a PDF to print on long bond and fold.",
    icon: "ti-file-certificate", color: "var(--color-success-500)", bg: "var(--color-success-50)", tile: `bg-success-50 ${CHIP_GLOW.success}`, status: "available", buttons: "the print button appears",
  },
  {
    code: "SF10", name: "Learner's Permanent Record",
    desc: "Cumulative academic record, one per level, in the school's own format, as an Excel file or a PDF.",
    icon: "ti-archive", color: "var(--color-accent-500)", bg: "var(--color-accent-50)", tile: `bg-accent-50 ${CHIP_GLOW.accent}`, status: "available", buttons: "the Excel and PDF buttons appear",
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
// bottoms out in a bare input: nothing states what the input is for, or that its
// buttons only appear once a learner is picked. An unexplained blank
// input reads as unfinished rather than as waiting for input.
function SearchHint({ form }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", marginBottom: 8, background: form.bg, border: `1px solid color-mix(in srgb, ${form.color} 14.9%, transparent)`, borderRadius: 8, fontSize: 11.5, fontWeight: 600, color: form.color, lineHeight: 1.45 }}>
      <i className="ti ti-user-search" style={{ fontSize: 13, flexShrink: 0 }} aria-hidden="true" />
      <span>Search a learner to generate their {form.code} — {form.buttons} once one is selected.</span>
    </div>
  );
}

const uniqueSorted = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

// The grades a picker offers in a school year: all of them, or a teacher's own.
// A teacher downloads SF1 and SF2 only for the sections they advise that year
// (the server refuses any other), so their pickers offer only those; every
// other section only led to "You can download forms only for sections you
// advise."
function gradeOptionsFor(advised, schoolYear) {
  if (!advised) return GRADE_LEVELS;
  const advisedGrades = new Set(advisoriesIn(advised, schoolYear).map((a) => a.grade_level));
  return GRADE_LEVELS.filter((g) => advisedGrades.has(g));
}

// The picked value while it is still on offer; the only option when there is
// just one, so a teacher with one advisory has nothing to pick.
function pickedOrOnly(value, options) {
  if (options.includes(value)) return value;
  return options.length === 1 ? options[0] : "";
}

// The sections of one grade in one school year, for the SF1/SF2 pickers. A
// picked name always matches the section learners are filed under, which a
// typed one did not ("rizal" printed an empty register).
function useSectionNames(schoolYear, gradeLevel, advised) {
  const [state, setState] = useState({ key: "", names: [], failed: false });
  // A teacher's own sections are already here; only other staff fetch.
  const key = schoolYear && gradeLevel && !advised ? `${schoolYear}|${gradeLevel}` : "";
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    getSections({ school_year: schoolYear, grade_level: gradeLevel })
      .then((data) => {
        const rows = Array.isArray(data) ? data : data?.results ?? [];
        if (live) setState({ key, names: uniqueSorted(rows.map((r) => r.name)), failed: false });
      })
      .catch(() => { if (live) setState({ key, names: [], failed: true }); });
    return () => { live = false; };
  }, [key, schoolYear, gradeLevel]);
  if (advised && schoolYear && gradeLevel) {
    const names = uniqueSorted(advisoriesIn(advised, schoolYear)
      .filter((a) => a.grade_level === gradeLevel)
      .map((a) => a.section));
    return { names, loading: advised.loading, failed: advised.failed };
  }
  if (!key) return { names: [], loading: false, failed: false };
  return state.key === key ? { ...state, loading: false } : { names: [], loading: true, failed: false };
}

// The SF10 levels a learner has: those with a row they attended here. The
// senior high one names its strand(s): the school keeps a record per strand.
function useLearnerLevels(student) {
  const [state, setState] = useState({ id: null, levels: [], error: "" });
  const id = student?.student_id ?? null;
  useEffect(() => {
    if (id == null) return undefined;
    let live = true;
    getEnrollments({ student: id, page_size: 100 })
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.results ?? [];
        const attended = list.filter((e) => ATTENDED_STATUSES.includes(e.enrollment_status));
        const levels = SF10_LEVELS
          .filter((l) => attended.some((e) => l.from.includes(e.school_level)))
          .map((l) => {
            if (l.value !== "senior_highschool") return l;
            const strands = uniqueSorted(attended.filter((e) => e.school_level === l.value && e.strand).map((e) => e.strand));
            return strands.length ? { ...l, label: `Senior High – ${strands.join(" / ")} (SF10-SHS)` } : l;
          });
        if (live) setState({ id, levels, error: "" });
      })
      .catch((err) => { if (live) setState({ id, levels: [], error: downloadErrorMessage(err) }); });
    return () => { live = false; };
  }, [id]);
  if (id == null) return { levels: [], loading: false, error: "" };
  return state.id === id ? { ...state, loading: false } : { levels: [], loading: true, error: "" };
}

// What went wrong with a download, in words: the server's own reason for a
// refused or empty form, the usual connection wording otherwise.
function downloadErrorMessage(err) {
  if (err?.response) return err.message || "The form couldn't be built.";
  return describeApiError(err, { subject: "the form" }).message;
}

const busyIcon = <i className="ti ti-loader-2" style={{ fontSize: 14, animation: "spin 1s linear infinite" }} />;

function SectionSelect({ value, onChange, sections, gradeLevel, label }) {
  const dark = useTheme() === "dark";
  const placeholder = !gradeLevel ? "Select a grade level first"
    : sections.loading ? "Loading sections…"
    : sections.failed ? "Couldn't load the sections"
    : sections.names.length ? "Select section…"
    : "No sections set up for this grade";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      disabled={!gradeLevel || sections.loading || sections.names.length === 0}
      style={{ ...inputStyle, color: value ? "var(--color-neutral-900)" : dark ? "var(--color-neutral-500)" : "#aaa", cursor: "pointer" }}
    >
      <option value="">{placeholder}</option>
      {sections.names.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

function GradeSelect({ value, onChange, options, advised, schoolYear, label }) {
  const dark = useTheme() === "dark";
  const placeholder = advised?.loading ? "Loading your sections…"
    : advised?.failed ? "Couldn't load your sections"
    : options.length ? "Select grade level…"
    : `You advise no section in ${schoolYear}`;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      disabled={options.length === 0}
      style={{ ...inputStyle, color: value ? "var(--color-neutral-900)" : dark ? "var(--color-neutral-500)" : "#aaa", cursor: "pointer" }}
    >
      <option value="">{placeholder}</option>
      {options.map((g) => <option key={g} value={g}>{g}</option>)}
    </select>
  );
}

function SemesterSelect({ value, onChange, label }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} style={{ ...inputStyle, cursor: "pointer" }}>
      {SEMESTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
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
  // The forms' header (School ID, Region, ...) is set on Settings, which
  // only these roles can open.
  const canEditSettings = hasAnyRole(getCurrentUser(), BILLING_ROLES);
  const advised = useMyAdvisories(hasAnyRole(getCurrentUser(), ["teacher"]));
  const dark = useTheme() === "dark";

  // Shared. Forms print for any registered year, archived ones included.
  const { currentYear, options: registeredYears } = useSchoolYear();
  const [schoolYear, setSchoolYear] = useState(currentYear || "");
  const gradeOptions = gradeOptionsFor(advised, schoolYear);

  // SF1 and SF2: what was picked, and what the form is for -- the pick while
  // it is still on offer (a year or grade change can take it away).
  const [sf1GradePick,   setSf1GradePick]   = useState("");
  const [sf1SectionPick, setSf1SectionPick] = useState("");
  const [sf1Semester, setSf1Semester] = useState("1st");
  const [sf1Error,    setSf1Error]    = useState("");
  const [sf1Busy,     setSf1Busy]     = useState("");   // the file being prepared, "xlsx" or "pdf"
  const gradeLevel  = pickedOrOnly(sf1GradePick, gradeOptions);
  const sf1Sections = useSectionNames(schoolYear, gradeLevel, advised);
  const section     = pickedOrOnly(sf1SectionPick, sf1Sections.names);

  const [sf2GradePick,   setSf2GradePick]   = useState("");
  const [sf2SectionPick, setSf2SectionPick] = useState("");
  const [sf2Month,      setSf2Month]      = useState(() => localISODate(new Date()).slice(0, 7));
  const [sf2Semester,   setSf2Semester]   = useState("1st");
  const [sf2Error,      setSf2Error]      = useState("");
  const [sf2Busy,       setSf2Busy]       = useState("");
  const sf2GradeLevel = pickedOrOnly(sf2GradePick, gradeOptions);
  const sf2Sections   = useSectionNames(schoolYear, sf2GradeLevel, advised);
  const sf2Section    = pickedOrOnly(sf2SectionPick, sf2Sections.names);

  // SF9
  const [sf9Student,     setSf9Student]     = useState(null);
  const [sf9Enrollments, setSf9Enrollments] = useState([]);
  const [sf9EnrollmentId, setSf9EnrollmentId] = useState("");
  const [sf9LoadingEnr,  setSf9LoadingEnr]  = useState(false);

  // SF10: the learner, then one of the levels they have a record for (the
  // latest unless another is picked).
  const [sf10Student, setSf10Student] = useState(null);
  const [sf10Pick,    setSf10Pick]    = useState("");
  const [sf10Error,   setSf10Error]   = useState("");
  const [sf10Busy,    setSf10Busy]    = useState("");
  // What this copy is for: the certification's purpose and the school it goes
  // to, and for senior high the graduation date and Special Order number.
  // Anything left blank prints as a line to fill in by hand.
  const [sf10Issue, setSf10Issue] = useState({ copy_for: "", purpose: SF10_PURPOSE, graduation_date: "", special_order: "" });
  const sf10 = useLearnerLevels(sf10Student);
  const sf10Level = sf10.levels.some((l) => l.value === sf10Pick)
    ? sf10Pick
    : (sf10.levels.at(-1)?.value ?? "");

  // Default to the registry's current year, like every other page.
  useEffect(() => {
    if (currentYear) setSchoolYear(currentYear); // eslint-disable-line react-hooks/set-state-in-effect
  }, [currentYear]);

  useEffect(() => {
    if (!sf9Student) { setSf9Enrollments([]); setSf9EnrollmentId(""); return; }
    setSf9LoadingEnr(true);
    getEnrollments({ student: sf9Student.student_id, page_size: 100 })
      .then(data => {
        // A pending or cancelled row was never attended, so it has no card.
        const list = (Array.isArray(data) ? data : data.results ?? [])
          .filter((e) => ATTENDED_STATUSES.includes(e.enrollment_status))
          .sort((a, b) => (b.school_year || "").localeCompare(a.school_year || ""));
        setSf9Enrollments(list);
        setSf9EnrollmentId(list[0]?.enrollment_id ? String(list[0].enrollment_id) : "");
      })
      .catch(() => setSf9Enrollments([]))
      .finally(() => setSf9LoadingEnr(false));
  }, [sf9Student]);

  const isFirstRender = useIsFirstRender();

  // Fetch one form and hand it to the browser: the Excel file, or (file
  // "pdf") a PDF of the same form as it prints. Whatever the file could not
  // fully say (attendance missing on a class day, more years than DepEd's
  // form has room for) comes back as warnings and stays on screen a while.
  async function runDownload(path, params, fallbackName, setBusy, setError, file = "xlsx") {
    setBusy(file);
    setError("");
    try {
      const { blob, filename, warnings } = await downloadSchoolForm(
        path, file === "pdf" ? { ...params, file } : params, `${fallbackName}.${file}`,
      );
      saveBlob(blob, filename);
      if (warnings.length) toast(`${filename} downloaded. ${warnings.join(" ")}`, { icon: "⚠️", duration: 10000 });
      else toast.success(`${filename} downloaded.`);
    } catch (err) {
      setError(downloadErrorMessage(err));
    } finally {
      setBusy("");
    }
  }

  function handleDownloadSF1(file) {
    if (!schoolYear || !gradeLevel || !section) {
      setSf1Error("School Year, Grade Level, and Section are required.");
      return;
    }
    runDownload("sf1", {
      school_year: schoolYear,
      grade_level: gradeLevel,
      section,
      ...(SENIOR_HIGH.has(gradeLevel) ? { semester: sf1Semester } : {}),
    }, `SF1_${gradeLevel}_${section}`, setSf1Busy, setSf1Error, file);
  }

  function handleDownloadSF2(file) {
    if (!schoolYear || !sf2GradeLevel || !sf2Section || !sf2Month) {
      setSf2Error("School Year, Grade Level, Section, and Month are required.");
      return;
    }
    runDownload("sf2", {
      school_year: schoolYear,
      grade_level: sf2GradeLevel,
      section:     sf2Section,
      month:       sf2Month,
      ...(SENIOR_HIGH.has(sf2GradeLevel) ? { semester: sf2Semester } : {}),
    }, `SF2_${sf2GradeLevel}_${sf2Section}_${sf2Month}`, setSf2Busy, setSf2Error, file);
  }

  function handleDownloadSF10(file) {
    if (!sf10Student || !sf10Level) return;
    const typed = Object.entries({
      copy_for: sf10Issue.copy_for,
      purpose: sf10Issue.purpose,
      ...(sf10Level === "senior_highschool"
        ? { graduation_date: sf10Issue.graduation_date, special_order: sf10Issue.special_order }
        : {}),
    }).map(([k, v]) => [k, v.trim()]).filter(([k, v]) => v || k === "purpose");
    runDownload(`sf10/${sf10Student.student_id}`, { level: sf10Level, ...Object.fromEntries(typed) },
      `SF10_${sf10Student.lrn || sf10Student.student_id}`, setSf10Busy, setSf10Error, file);
  }

  function setSf10Field(key, value) {
    setSf10Issue((issue) => ({ ...issue, [key]: value }));
    setSf10Error("");
  }

  function chooseSf10Student(student) {
    setSf10Student(student);
    setSf10Pick("");
    setSf10Error("");
  }

  // A new grade leaves the old section meaningless.
  function chooseSf1Grade(value) { setSf1GradePick(value); setSf1SectionPick(""); setSf1Error(""); }
  function chooseSf2Grade(value) { setSf2GradePick(value); setSf2SectionPick(""); setSf2Error(""); }

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
        <motion.div variants={pageVariants.item} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: "var(--color-neutral-600)", lineHeight: 1.5 }}>
          <i className="ti ti-file-spreadsheet" style={{ fontSize: 15, color: "var(--color-success-500)", marginTop: 1 }} aria-hidden="true" />
          <span>
            SF1 and SF2 download as DepEd's own Excel forms, and SF10 as the school's own permanent record, all filled
            in from SLIS and still editable, or each as a PDF of the same form, ready to print. Their header (School
            ID, Division, School Head) and the SF10's signatories come from{" "}
            {canEditSettings
              ? <Link to="/settings" style={{ color: C.red, fontWeight: 700 }}>Settings › School Forms</Link>
              : <b>Settings › School Forms</b>}.
          </span>
        </motion.div>

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
                <GradeSelect value={gradeLevel} onChange={chooseSf1Grade} options={gradeOptions} advised={advised} schoolYear={schoolYear} label="SF1 grade level" />
              } />
              <Field label="Section *" el={
                <SectionSelect value={section} onChange={(v) => { setSf1SectionPick(v); setSf1Error(""); }} sections={sf1Sections} gradeLevel={gradeLevel} label="SF1 section" />
              } />
              {SENIOR_HIGH.has(gradeLevel) && (
                <Field label="Semester *" el={<SemesterSelect value={sf1Semester} onChange={setSf1Semester} label="SF1 semester" />} />
              )}
            </div>
            <div style={{ minHeight: 38, marginBottom: sf1Error ? 14 : 0 }}>
              {sf1Error && (
                <div className="bg-[#fef2f2] text-[#b91c1c] dark:bg-error-50 dark:text-error-500" style={{ padding: "9px 14px", border: "1px solid var(--color-brand-300)", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 7 }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{sf1Error}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <motion.button
                onClick={() => handleDownloadSF1("xlsx")}
                disabled={Boolean(sf1Busy)}
                whileHover={sf1Busy ? {} : { scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }}
                whileTap={sf1Busy ? {} : { scale: 0.97 }}
                transition={{ duration: 0.12 }}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,var(--color-action),var(--color-action-2))", color: "white", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: sf1Busy ? "wait" : "pointer", opacity: sf1Busy ? 0.75 : 1, fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}
              >
                {sf1Busy === "xlsx" ? busyIcon : <i className="ti ti-file-spreadsheet" style={{ fontSize: 14 }} />}
                {sf1Busy === "xlsx" ? "Preparing SF1…" : "Download SF1 (Excel)"}
              </motion.button>
              <motion.button
                onClick={() => handleDownloadSF1("pdf")}
                disabled={Boolean(sf1Busy)}
                whileHover={sf1Busy ? {} : { scale: 1.02 }}
                whileTap={sf1Busy ? {} : { scale: 0.97 }}
                transition={{ duration: 0.12 }}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--color-surface)", color: C.red, border: "1.5px solid var(--color-brand-300)", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: sf1Busy ? "wait" : "pointer", opacity: sf1Busy ? 0.75 : 1, fontFamily: "'DM Sans',sans-serif" }}
              >
                {sf1Busy === "pdf" ? busyIcon : <i className="ti ti-file-type-pdf" style={{ fontSize: 14 }} />}
                {sf1Busy === "pdf" ? "Preparing SF1…" : "Download SF1 (PDF)"}
              </motion.button>
            </div>
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
                <GradeSelect value={sf2GradeLevel} onChange={chooseSf2Grade} options={gradeOptions} advised={advised} schoolYear={schoolYear} label="SF2 grade level" />
              } />
              <Field label="Section *" el={
                <SectionSelect value={sf2Section} onChange={(v) => { setSf2SectionPick(v); setSf2Error(""); }} sections={sf2Sections} gradeLevel={sf2GradeLevel} label="SF2 section" />
              } />
              <Field label="Month *" el={
                <input type="month" value={sf2Month} onChange={(e) => { setSf2Month(e.target.value); setSf2Error(""); }} aria-label="SF2 month" style={inputStyle} />
              } />
              {SENIOR_HIGH.has(sf2GradeLevel) && (
                <Field label="Semester *" el={<SemesterSelect value={sf2Semester} onChange={setSf2Semester} label="SF2 semester" />} />
              )}
            </div>
            <div style={{ minHeight: 38, marginBottom: sf2Error ? 14 : 0 }}>
              {sf2Error && (
                <div className="border border-[#93b4f5] bg-[#eef3fc] dark:border-info-dot/40 dark:bg-info-50" style={{ padding: "9px 14px", borderRadius: 8, fontSize: 12, color: "var(--color-info-500)", display: "flex", alignItems: "center", gap: 7 }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{sf2Error}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <motion.button
                onClick={() => handleDownloadSF2("xlsx")}
                disabled={Boolean(sf2Busy)}
                whileHover={sf2Busy ? {} : { scale: 1.02, boxShadow: dark ? DARK_SF2_SHADOW_HOVER : "0 6px 20px rgba(20,85,160,0.30)" }}
                whileTap={sf2Busy ? {} : { scale: 0.97 }}
                transition={{ duration: 0.12 }}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, background: dark ? DARK_SF2_FILL : "linear-gradient(135deg,#1455a0,#0e4080)", color: "white", border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: sf2Busy ? "wait" : "pointer", opacity: sf2Busy ? 0.75 : 1, fontFamily: "'DM Sans',sans-serif", boxShadow: dark ? DARK_SF2_SHADOW : "0 4px 16px rgba(20,85,160,0.24)" }}
              >
                {sf2Busy === "xlsx" ? busyIcon : <i className="ti ti-file-spreadsheet" style={{ fontSize: 14 }} />}
                {sf2Busy === "xlsx" ? "Preparing SF2…" : "Download SF2 (Excel)"}
              </motion.button>
              <motion.button
                onClick={() => handleDownloadSF2("pdf")}
                disabled={Boolean(sf2Busy)}
                whileHover={sf2Busy ? {} : { scale: 1.02 }}
                whileTap={sf2Busy ? {} : { scale: 0.97 }}
                transition={{ duration: 0.12 }}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--color-surface)", color: "var(--color-info-500)", border: "1.5px solid color-mix(in srgb, var(--color-info-500) 35%, transparent)", borderRadius: 10, padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: sf2Busy ? "wait" : "pointer", opacity: sf2Busy ? 0.75 : 1, fontFamily: "'DM Sans',sans-serif" }}
              >
                {sf2Busy === "pdf" ? busyIcon : <i className="ti ti-file-type-pdf" style={{ fontSize: 14 }} />}
                {sf2Busy === "pdf" ? "Preparing SF2…" : "Download SF2 (PDF)"}
              </motion.button>
            </div>
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
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ flex: 1, padding: "6px 10px", background: form.bg, border: `1.5px solid color-mix(in srgb, ${form.color} 25%, transparent)`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: form.color }}>
                          {studentLabel(sf10Student)}
                        </div>
                        <button
                          onClick={() => chooseSf10Student(null)}
                          aria-label="Clear the selected learner"
                          className="border-[1.5px] border-solid border-[#ddd] dark:border-neutral-300"
                          style={{ padding: "6px 10px", borderRadius: 8, background: "var(--color-surface)", fontSize: 12, cursor: "pointer", color: "var(--color-muted-500)", fontFamily: "'DM Sans',sans-serif" }}
                        >
                          ✕
                        </button>
                      </div>
                      {sf10.loading ? (
                        <div className="text-[#aaa] dark:text-neutral-500" style={{ fontSize: 12 }}>Loading records…</div>
                      ) : sf10.levels.length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--color-brand-600)" }}>
                          {sf10.error || "This learner has no Kinder–Grade 12 records here."}
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <select
                            value={sf10Level}
                            onChange={(e) => { setSf10Pick(e.target.value); setSf10Error(""); }}
                            aria-label="SF10 level"
                            style={{ ...inputStyle, height: 34, flex: 1, border: `1.5px solid color-mix(in srgb, ${form.color} 25%, transparent)`, color: "var(--color-neutral-900)", cursor: "pointer" }}
                          >
                            {sf10.levels.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                          </select>
                          {SF10_FILES.map(({ file, label, icon }) => (
                            <motion.button
                              key={file}
                              onClick={() => handleDownloadSF10(file)}
                              disabled={Boolean(sf10Busy)}
                              aria-label={`Download SF10 (${label})`}
                              whileHover={sf10Busy ? {} : { scale: 1.02 }}
                              whileTap={sf10Busy ? {} : { scale: 0.97 }}
                              transition={{ duration: 0.12 }}
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: form.bg, border: `1.5px solid color-mix(in srgb, ${form.color} 25%, transparent)`, color: form.color, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: sf10Busy ? "wait" : "pointer", opacity: sf10Busy ? 0.75 : 1, fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}
                            >
                              {sf10Busy === file ? busyIcon : <i className={`ti ${icon}`} style={{ fontSize: 12 }} />}
                              {sf10Busy === file ? "Preparing…" : label}
                            </motion.button>
                          ))}
                        </div>
                      )}
                      {sf10.levels.length > 0 && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                          <input
                            value={sf10Issue.copy_for}
                            onChange={(e) => setSf10Field("copy_for", e.target.value)}
                            maxLength={150}
                            placeholder="Copy for (receiving school)"
                            aria-label="SF10 copy for"
                            style={{ ...inputStyle, height: 34 }}
                          />
                          <input
                            value={sf10Issue.purpose}
                            onChange={(e) => setSf10Field("purpose", e.target.value)}
                            maxLength={100}
                            placeholder="Purpose"
                            aria-label="SF10 purpose"
                            style={{ ...inputStyle, height: 34 }}
                          />
                          {sf10Level === "senior_highschool" && (
                            <>
                              <input
                                type="date"
                                value={sf10Issue.graduation_date}
                                onChange={(e) => setSf10Field("graduation_date", e.target.value)}
                                aria-label="SF10 date of graduation"
                                title="Date of graduation, for a Grade 12 graduate"
                                style={{ ...inputStyle, height: 34 }}
                              />
                              <input
                                value={sf10Issue.special_order}
                                onChange={(e) => setSf10Field("special_order", e.target.value)}
                                maxLength={30}
                                placeholder="Special Order (A) No."
                                aria-label="SF10 special order number"
                                style={{ ...inputStyle, height: 34 }}
                              />
                            </>
                          )}
                        </div>
                      )}
                      {sf10Error && sf10.levels.length > 0 && (
                        <div role="alert" style={{ fontSize: 12, color: "var(--color-brand-600)", lineHeight: 1.45 }}>{sf10Error}</div>
                      )}
                    </div>
                  ) : (
                    <>
                      <SearchHint form={form} />
                      <StudentSearch
                        borderColor={`color-mix(in srgb, ${form.color} 25%, transparent)`}
                        dropdownBorderColor={`color-mix(in srgb, ${form.color} 25%, transparent)`}
                        dropdownShadow={dark ? DARK_FLOAT_SHADOW : `0 4px 16px rgba(124,58,237,0.12)`}
                        onSelect={chooseSf10Student}
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