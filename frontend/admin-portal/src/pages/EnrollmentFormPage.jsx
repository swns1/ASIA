import { usePageTitle } from "../hooks/usePageTitle";
import { useEffect, useState, useMemo, useRef, useId } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import RequirementDocumentsPanel from "../components/requirements/RequirementDocumentsPanel";
import { ConfirmDialog } from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Alert from "../components/ui/Alert";
import Badge, { StatusBadge } from "../components/ui/Badge";
import ChipGroup from "../components/ui/ChipGroup";
import { Field, Input, Select, Textarea } from "../components/FormField";
import { ENROLLMENT_STATUS_MAP } from "../constants/statusMaps";
import { readinessChecks, canSwitchToPending } from "./enrollment/enrollmentReadiness";
import toast from "react-hot-toast";
import { getCurrentUser, canViewAuditTrail, hasAnyRole, BILLING_ROLES } from "../utils/auth";
import { modalVariants, springTransition } from "../utils/motion";

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
  transferInEnrollment as _transferInEnrollment,
} from "../api/enrollmentApi";
import { getStudents as _getStudents, getStudent as _getStudent } from "../api/studentApi";
import { generateInvoice as _generateInvoice } from "../api/billingApi";
import { createPreviousSchool as _createPreviousSchool } from "../api/previousSchoolApi";
import { GRADE_LEVELS_BY_LEVEL, SHS_STRANDS, schoolLevelForGrade } from "../constants/schoolLevels";
import { todayISO } from "../utils/format";

const getStudents                 = (p = {}) => _getStudents(p);
const getStudent                  = (id)     => _getStudent(id);
const createEnrollment            = (p)      => _createEnrollment(p);
const getEnrollment               = (id)     => _getEnrollment(id);
const updateEnrollment            = (id, p)  => _updateEnrollment(id, p);
const getScholarshipTypes         = ()       => _getScholarshipTypes({ is_active: true });
const createEnrollmentScholarship = (p)      => _createEnrollmentScholarship(p);
const sendEnrollmentEmail         = (p)      => _sendEnrollmentEmail(p);
const getStudentEnrollments       = (sid)    => _getEnrollments({ student: sid, page_size: 100 });
const getStudentEligibility       = (sid, placement) => _getEligibility(sid, placement);
const transferInEnrollment        = (id, p)  => _transferInEnrollment(id, p);
const createPreviousSchool        = (p)      => _createPreviousSchool(p);

// `tone` is ChipGroup's categorical colour for the level and `badge` the same
// colour as literal classes for the summary card, so a level reads the same
// here as in the Enrollments filters. Short labels match those filters too.
const SCHOOL_LEVELS = [
  { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", tone: "nursery",      badge: "bg-nursery-50 text-nursery-500" },
  { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          tone: "kindergarten", badge: "bg-kindergarten-50 text-kindergarten-500" },
  { value: "elementary",        label: "Elementary",   icon: "ti-book",          tone: "elementary",   badge: "bg-elementary-50 text-elementary-500" },
  { value: "junior_highschool", label: "Junior High",  icon: "ti-school",        tone: "juniorhigh",   badge: "bg-juniorhigh-50 text-juniorhigh-500" },
  { value: "senior_highschool", label: "Senior High",  icon: "ti-certificate",   tone: "seniorhigh",   badge: "bg-seniorhigh-50 text-seniorhigh-500" },
];

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
  return schoolLevelForGrade(grade);
}

const SEMESTERS = [
  { value: "1st", label: "1st Semester" },
  { value: "2nd", label: "2nd Semester" },
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
  { bg: "#e8fdf0", color: "#2e6b0d" }, { bg: "#fdf5e8", color: "#854f0b" },
  { bg: "#f0e8fd", color: "#7c3aed" }, { bg: "#fde8f8", color: "#be185d" },
  { bg: "#e8fdfd", color: "#1455a0" },
];
const getPalette = (name = "X") => PALETTES[name.charCodeAt(0) % PALETTES.length];

const discountLabel = (sc) =>
  sc.discount_mode === "percentage"
    ? `${parseFloat(sc.discount_value)}%`
    : `₱ ${parseFloat(sc.discount_value).toLocaleString()}`;

// What each status means for the learner, shown on the status choices. Labels
// and colours come from ENROLLMENT_STATUS_MAP so they match every status badge.
const STATUS_CHOICES = [
  { value: "enrolled",  desc: "Joins class lists and grades." },
  { value: "pending",   desc: "Held until documents are in. Not on class lists and no grades yet." },
  { value: "completed", desc: "The school year is finished. For recording past years." },
  { value: "cancelled", desc: "Withdrawn or voided. Kept for the record only." },
];

// Complete literal class strings per Badge variant (tokens.css rule 1: never
// build a utility name dynamically).
const CHOICE_TONES = {
  success: { on: "border-success-500 bg-success-50", text: "text-success-500", ring: "border-success-500", fill: "bg-success-500" },
  warning: { on: "border-warning-500 bg-warning-50", text: "text-warning-500", ring: "border-warning-500", fill: "bg-warning-500" },
  info:    { on: "border-info-500 bg-info-50",       text: "text-info-500",    ring: "border-info-500",    fill: "bg-info-500" },
  muted:   { on: "border-muted-500 bg-muted-50",     text: "text-muted-500",   ring: "border-muted-500",   fill: "bg-muted-500" },
};

// ─── Layout pieces ───────────────────────────────────────────────────────────

// FormSection — one numbered block of the form. Same frame as Panel
// (components/ui/Card.jsx); the step number stands in for Panel's icon so the
// order of the form is visible at a glance.
function FormSection({ step, title, subtitle, action, children }) {
  const headingId = useId();
  return (
    <Card padding="none" role="group" aria-labelledby={headingId}>
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-600"
            aria-hidden="true"
          >
            {step}
          </span>
          <div className="min-w-0">
            <h2 id={headingId} className="truncate text-sm font-bold text-neutral-900">{title}</h2>
            {subtitle && <p className="truncate text-xs text-neutral-500">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

// Label row for a group of chips, styled like FormField's label. A chip row
// isn't one control, so there is nothing for a <label htmlFor> to point at;
// the ChipGroup carries its own aria-label instead.
function GroupLabel({ required = false, aside, children }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="text-xs font-bold uppercase tracking-[0.07em] text-neutral-700">
        {children}
        {required && (
          <span className="text-brand-600">
            {" *"}
            <span className="sr-only"> (required)</span>
          </span>
        )}
      </span>
      {aside}
    </div>
  );
}

function LockNote({ children }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
      <i className="ti ti-lock text-[12px]" aria-hidden="true" />
      {children}
    </span>
  );
}

// A value that is shown but can't be changed here. Looks like FormField's
// read-only control, so it isn't mistaken for an empty input.
function LockedValue({ children }) {
  return (
    <div className="flex w-full items-center gap-2 rounded-lg border-[1.5px] border-neutral-200 bg-neutral-200 px-3.5 py-2.5 text-base font-semibold text-neutral-700">
      <i className="ti ti-lock text-[13px] text-neutral-600" aria-hidden="true" />
      {children}
    </div>
  );
}

const AVATAR_SIZES = {
  xs: "h-8 w-8 text-xs",
  sm: "h-9 w-9 text-sm",
  md: "h-10 w-10 text-base",
};

function Avatar({ student, size = "md" }) {
  const p = getPalette(student.last_name ?? "X");
  const initials = `${student.first_name?.[0] ?? ""}${student.last_name?.[0] ?? ""}`.toUpperCase();
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${AVATAR_SIZES[size] ?? AVATAR_SIZES.md}`}
      style={{ background: p.bg, color: p.color }}
      aria-hidden="true"
    >
      {initials || "?"}
    </div>
  );
}

// ─── Eligibility ─────────────────────────────────────────────────────────────
// One bordered list under the student, one row per question the server
// answers: can they take this grade, and do they owe documents. The two used
// to share a single panel whose colour came from `is_eligible`, and the server
// folds missing documents into that flag. So a learner whose only gap was a
// document got a red "Enrollment Blocked" panel, although saving as Pending
// was allowed. Grade blocks (`blocking_reasons`, `admin_override_required`)
// and documents (`missing_docs`) are separate on the server, and separate here.

const ROW_TONES = {
  ok:    { chip: "bg-success-50 text-success-500", title: "text-neutral-900" },
  warn:  { chip: "bg-warning-50 text-warning-500", title: "text-warning-500" },
  block: { chip: "bg-error-50 text-error-500",     title: "text-error-500" },
  info:  { chip: "bg-info-50 text-info-500",       title: "text-info-500" },
  busy:  { chip: "bg-brand-100 text-brand-600",    title: "text-neutral-700" },
};

function EligibilityRow({ tone, icon, title, detail, action, children }) {
  const t = ROW_TONES[tone] ?? ROW_TONES.info;
  return (
    <div className="flex items-start gap-3 px-3.5 py-3">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${t.chip}`} aria-hidden="true">
        <i className={`ti ${icon} text-[15px]`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 pt-1 text-sm">
            <span className={`font-bold ${t.title}`}>{title}</span>
            {detail && <span className="text-neutral-500"> · {detail}</span>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

// The missing-documents row, shared by both branches of EligibilityList.
// It used to live only in the returning-student branch, so a brand-new student
// -- an applicant just approved from the kiosk, or a student created moments
// ago at the counter -- saw a green "can be enrolled in any grade level" panel
// and no mention of documents at all, then hit a flat refusal from the server
// the moment the status was switched to Enrolled. The eligibility endpoint has
// always returned missing_docs for new students (enrollments/views.py derives
// entry_status regardless of history); only this component threw it away.
//
// `defaultOpen` is for the hand-off from registration or from an approved
// application: on that path the document set is known to be empty, so the
// upload belongs in front of the registrar rather than behind a disclosure.
function MissingDocsRow({ missingDocs, student, eligibility, onDocumentsChanged, defaultOpen = false }) {
  const [uploadOpen, setUploadOpen] = useState(defaultOpen);

  // documents_assessed=false means "we could not work out which documents
  // apply", not "none are missing" -- enrollments/views.py says so explicitly
  // and warns clients not to read the empty list as a clean bill of health.
  if (eligibility?.documents_assessed === false) {
    return (
      <EligibilityRow
        tone="info"
        icon="ti-help-circle"
        title="Documents not checked"
        detail="They can't be worked out without a school level. Pick one under Placement to see what this learner still owes."
      />
    );
  }
  if (!missingDocs?.length) {
    return <EligibilityRow tone="ok" icon="ti-file-check" title="All required documents are in" />;
  }
  return (
    <EligibilityRow
      tone="warn"
      icon="ti-file-alert"
      title={`Missing required documents (${missingDocs.length})`}
      action={
        // Fix it here rather than sending the registrar off to find another
        // page. Submissions belong to the student, not the enrollment, so
        // uploading before this enrollment exists is perfectly valid.
        student && (
          <Button
            variant="secondary"
            size="sm"
            icon={uploadOpen ? "ti-chevron-up" : "ti-upload"}
            aria-expanded={uploadOpen}
            onClick={() => setUploadOpen((v) => !v)}
          >
            {uploadOpen ? "Hide upload" : "Upload now"}
          </Button>
        )
      }
    >
      <ul className="mt-1.5 list-disc pl-5 text-sm text-neutral-700">
        {missingDocs.map((d) => (
          <li key={d.requirement_type_id}>{d.requirement_name}</li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-neutral-500">
        Enrollment can be created as <strong>Pending</strong>. Documents must be submitted before activating to <strong>Enrolled</strong>.
      </p>
      {student && uploadOpen && (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-white p-3.5">
          <RequirementDocumentsPanel
            studentId={student.student_id}
            student={student}
            variant="compact"
            context={{
              schoolLevel: eligibility.school_level_used,
              entryStatus: eligibility.entry_status,
            }}
            onChange={onDocumentsChanged}
          />
        </div>
      )}
    </EligibilityRow>
  );
}

function EligibilityList({ eligibility, loading, overrideMode, overrideReason, onToggleOverride, onChangeReason, isAdmin, student, onDocumentsChanged, continuing = false }) {
  const box = "divide-y divide-neutral-200 rounded-lg border border-neutral-200";

  if (loading) {
    return (
      <div className={box}>
        <EligibilityRow tone="busy" icon="ti-loader-2 animate-spin" title="Checking enrollment eligibility…" />
      </div>
    );
  }

  if (!eligibility) return null;

  const { is_new_student, blocking_reasons, missing_docs, can_repeat, admin_override_required, next_allowed_grade, last_enrollment } = eligibility;

  const docsRow = (
    <MissingDocsRow
      missingDocs={missing_docs}
      student={student}
      eligibility={eligibility}
      onDocumentsChanged={onDocumentsChanged}
      defaultOpen={continuing}
    />
  );

  // A new student has no grade history to block on -- but they are also the
  // learner most likely to owe every document, so the documents they still owe
  // are listed here too.
  if (is_new_student) {
    return (
      <div className={box}>
        <EligibilityRow tone="ok" icon="ti-star" title="New student" detail="No prior enrollment records. Can be enrolled in any grade level." />
        {docsRow}
      </div>
    );
  }

  const gradeBlocked = admin_override_required || blocking_reasons.length > 0;
  const lastLine = last_enrollment
    ? `Last enrolled in ${last_enrollment.grade_level}` +
      (last_enrollment.semester ? ` (${last_enrollment.semester} Sem)` : "") +
      (last_enrollment.school_year ? `, S.Y. ${last_enrollment.school_year}` : "")
    : null;

  return (
    <div className={box}>
      {gradeBlocked ? (
        <EligibilityRow
          tone={overrideMode ? "warn" : "block"}
          icon={overrideMode ? "ti-alert-triangle" : "ti-circle-x"}
          title={overrideMode ? "Override active. Proceed with caution" : "Failed or incomplete subjects"}
          detail={[lastLine, next_allowed_grade && `next allowed: ${next_allowed_grade}`].filter(Boolean).join(" · ") || null}
        >
          {blocking_reasons.length > 0 && (
            <ul className="mt-1.5 list-disc pl-5 text-sm text-neutral-700">
              {blocking_reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          {can_repeat && (
            <p className="mt-1.5 text-xs italic text-neutral-500">Student may repeat the same grade level (retention).</p>
          )}

          {/* Admin override toggle — only shown to admin users */}
          {admin_override_required && isAdmin && (
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={overrideMode ? "ti-lock-open" : "ti-lock"}
                  aria-pressed={overrideMode}
                  onClick={onToggleOverride}
                >
                  {overrideMode ? "Override Active" : "Admin Override"}
                </Button>
              </div>
              {overrideMode && (
                <div className="-mb-3.5">
                  <Field label="Override Reason" required>
                    <Textarea
                      value={overrideReason}
                      onChange={(e) => onChangeReason(e.target.value)}
                      placeholder="Explain why the grade progression rule is being bypassed (e.g. transferee with incomplete records, admin approval)…"
                      rows={2}
                    />
                  </Field>
                </div>
              )}
            </div>
          )}
        </EligibilityRow>
      ) : (
        <EligibilityRow
          tone="ok"
          icon="ti-circle-check"
          title={next_allowed_grade ? `Eligible for ${next_allowed_grade}` : "Eligible for enrollment"}
          detail={lastLine}
        />
      )}
      {docsRow}
    </div>
  );
}

// ─── Student picker ──────────────────────────────────────────────────────────
function StudentPicker({ value, onChange, disabled }) {
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
    const fullName = [value.first_name, value.middle_name, value.last_name, value.suffix].filter(Boolean).join(" ");
    return (
      <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-3">
        <Avatar student={value} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold text-neutral-900">{fullName}</div>
          <div className="flex flex-wrap gap-x-3 text-sm text-neutral-500">
            {value.student_number && <span>{value.student_number}</span>}
            {value.lrn && <span>LRN {value.lrn}</span>}
          </div>
        </div>
        {!disabled && (
          <Button variant="secondary" size="sm" onClick={() => onChange(null)}>
            Change
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <i
          className="ti ti-search pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-neutral-500"
          aria-hidden="true"
        />
        <Input
          type="text"
          autoComplete="off"
          placeholder="Search by name, LRN, or student number…"
          value={query}
          disabled={disabled}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="pl-10 pr-10"
        />
        {loading && (
          <i
            className="ti ti-loader-2 absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-[15px] text-brand-500"
            aria-hidden="true"
          />
        )}
      </div>
      {open && query && (
        // z-20 keeps the list above the cards below it but under the sticky
        // page header (z-30) when the page scrolls.
        <div className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-80 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
          {results.length === 0 && !loading && (
            <div className="px-4 py-5 text-center text-sm text-neutral-500">No students match "{query}".</div>
          )}
          <ul>
            {results.map((st) => {
              const fullName = [st.last_name + ",", st.first_name, st.middle_name].filter(Boolean).join(" ");
              const lastGrade = gradeMap[st.student_id];
              const next = lastGrade ? getNextGradeLevel(lastGrade) : null;
              return (
                <li key={st.student_id} className="border-b border-neutral-200 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => { onChange(st, lastGrade); setOpen(false); setQuery(""); }}
                    className="focus-ring flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-brand-50"
                  >
                    <Avatar student={st} size="xs" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-neutral-900">{fullName}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        <span>LRN {st.lrn} · {st.student_number ?? "—"}</span>
                        {lastGrade ? (
                          <Badge variant="info" size="sm">
                            {lastGrade}{next ? ` → ${next}` : " (final grade)"}
                          </Badge>
                        ) : (
                          <Badge variant="success" size="sm">New</Badge>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Summary card ────────────────────────────────────────────────────────────

const CHECK_TONES = {
  ok:      { chip: "bg-success-50 text-success-500", icon: "ti-check",                 title: "text-neutral-900", sr: "Done" },
  todo:    { chip: "bg-neutral-200 text-neutral-600", icon: "ti-circle-dashed",        title: "text-neutral-900", sr: "To do" },
  warn:    { chip: "bg-warning-50 text-warning-500", icon: "ti-exclamation-mark",      title: "text-warning-500", sr: "Needs attention" },
  block:   { chip: "bg-error-50 text-error-500",     icon: "ti-x",                     title: "text-error-500",   sr: "Blocked" },
  info:    { chip: "bg-info-50 text-info-500",       icon: "ti-info-small",            title: "text-info-500",    sr: "Note" },
  loading: { chip: "bg-brand-100 text-brand-600",    icon: "ti-loader-2 animate-spin", title: "text-neutral-700", sr: "Checking" },
};

function CheckItem({ check }) {
  const t = CHECK_TONES[check.state] ?? CHECK_TONES.info;
  return (
    <li className="flex items-start gap-2.5">
      <span className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${t.chip}`} aria-hidden="true">
        <i className={`ti ${t.icon} text-[12px]`} />
      </span>
      <div className="min-w-0">
        <div className={`text-sm font-semibold ${t.title}`}>
          <span className="sr-only">{t.sr}: </span>
          {check.title}
        </div>
        {check.detail && <div className="text-xs text-neutral-500">{check.detail}</div>}
      </div>
    </li>
  );
}

function SummaryRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="min-w-0 text-right font-semibold text-neutral-900">{children}</dd>
    </div>
  );
}

const NotSet = ({ children = "Not set" }) => <span className="font-normal text-neutral-500">{children}</span>;

// SummaryCard — stays in view beside the form (below it on narrow screens) so
// the registrar always sees what will be saved, what is still outstanding, and
// the one button that saves it.
function SummaryCard({
  isEdit, student, form, isSHS, levelMeta, chosenScholarships, checks,
  validationError, saving, submitLabel, onSubmit, showSwitchToPending, onSwitchToPending,
}) {
  const name = student ? [student.first_name, student.last_name].filter(Boolean).join(" ") : "";
  const semesterLabel = SEMESTERS.find((s) => s.value === form.semester)?.label;
  return (
    <aside aria-label="Enrollment summary" className="w-full lg:sticky lg:top-28 lg:w-[340px] lg:shrink-0">
      <Card padding="none">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
          <h2 className="text-sm font-bold text-neutral-900">Enrollment summary</h2>
          <StatusBadge status={form.enrollment_status} map={ENROLLMENT_STATUS_MAP} />
        </div>

        <div className="flex items-center gap-3 border-b border-neutral-200 px-5 py-4">
          {student ? (
            <>
              <Avatar student={student} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-base font-bold text-neutral-900">{name}</div>
                {student.lrn && <div className="text-xs text-neutral-500">LRN {student.lrn}</div>}
              </div>
            </>
          ) : (
            <p className="text-sm text-neutral-500">No student selected yet.</p>
          )}
        </div>

        <dl className="flex flex-col gap-2.5 border-b border-neutral-200 px-5 py-3.5 text-sm">
          <SummaryRow label="School year">{form.school_year || <NotSet />}</SummaryRow>
          <SummaryRow label="Level">
            {levelMeta ? (
              <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold leading-none ${levelMeta.badge}`}>
                {levelMeta.label}
              </span>
            ) : (
              <NotSet />
            )}
          </SummaryRow>
          <SummaryRow label="Grade">{form.grade_level || <NotSet />}</SummaryRow>
          {isSHS && (
            <>
              <SummaryRow label="Strand">{form.strand || <NotSet />}</SummaryRow>
              <SummaryRow label="Semester">{semesterLabel || <NotSet />}</SummaryRow>
            </>
          )}
          <SummaryRow label="Section">{form.section.trim() || <NotSet />}</SummaryRow>
          {!isEdit && (
            <SummaryRow label="Scholarships">
              {chosenScholarships.length
                ? chosenScholarships.map((sc) => sc.scholarship_name).join(", ")
                : <NotSet>None</NotSet>}
            </SummaryRow>
          )}
        </dl>

        <div className="flex flex-col gap-2.5 px-5 py-3.5">
          <h3 className="text-xs font-bold uppercase tracking-[0.07em] text-neutral-700">
            {isEdit ? "Before you save" : "Before you submit"}
          </h3>
          <ul className="flex flex-col gap-2.5">
            {checks.map((c) => <CheckItem key={c.id} check={c} />)}
          </ul>
        </div>

        <div className="flex flex-col gap-2 px-5 pb-5 pt-1">
          <Button
            fullWidth
            icon={isEdit ? "ti-device-floppy" : "ti-check"}
            loading={saving}
            disabled={Boolean(validationError)}
            onClick={onSubmit}
          >
            {submitLabel}
          </Button>
          {showSwitchToPending && (
            <Button variant="secondary" fullWidth icon="ti-clock" onClick={onSwitchToPending}>
              Switch to Pending
            </Button>
          )}
          {/* The first thing still blocking the save, word for word from the
              gate itself. It used to exist only as the disabled button's
              hover tooltip. */}
          <p className="text-xs text-neutral-600 empty:hidden" aria-live="polite">
            {validationError && !saving ? validationError : null}
          </p>
        </div>
      </Card>
    </aside>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function EnrollmentFormPage() {
  usePageTitle("Enrollment Form");
  const { id }   = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit   = Boolean(id);
  // Set by the hand-off from student registration (StudentFormPage) and from
  // approving an application. It means the student record already exists and
  // this form is the second half of one process -- which changes both what the
  // page says and what abandoning it costs.
  // Requires the student too: the banner and the leave-confirm both assert
  // that a student record already exists, so a bare ?continuing=1 (a shared
  // or hand-edited URL) must not be able to make those claims.
  const continuing =
    !isEdit && searchParams.get("continuing") === "1" && Boolean(searchParams.get("student"));
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const isAdmin  = canViewAuditTrail(getCurrentUser());
  // Invoice generation is BILLING_ROLES-only on billing-service, even though
  // this route allows every staff role — skip the "Generate Invoice?" prompt
  // entirely for teacher/registrar rather than offering an action that ends
  // in "This action is forbidden." if clicked.
  const canGenerateInvoice = hasAnyRole(getCurrentUser(), BILLING_ROLES);

  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [invoicePrompt, setInvoicePrompt] = useState(null); // { enrollmentId, studentName }
  const [student, setStudent] = useState(null);

  // Re-runs the eligibility report. Called after a document is uploaded from
  // the panel below, so the missing list and the submit guard both reflect
  // what the registrar just handed over rather than going stale.
  //
  // This only nudges the effect below rather than fetching itself: the fetch
  // has to react to the placement fields too, and having two places issue it
  // is how the report went stale in the first place.
  function refreshEligibility() {
    setEligibilityNonce((n) => n + 1);
  }
  const [studentLastGrade, setStudentLastGrade] = useState(null);

  // Eligibility state (new enrollment)
  const [eligibility,        setEligibility]        = useState(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [eligibilityNonce,   setEligibilityNonce]   = useState(0);
  const [overrideMode,       setOverrideMode]       = useState(false);
  const [overrideReason,     setOverrideReason]     = useState("");

  // Transfer-in state (new enrollment, student with no prior local records)
  const [isTransferIn,           setIsTransferIn]           = useState(false);
  const [transferInDate,         setTransferInDate]         = useState(todayISO());
  const [transferInReason,       setTransferInReason]       = useState("");
  const [transferInSchoolName,   setTransferInSchoolName]   = useState("");
  const [transferInSchoolAddress, setTransferInSchoolAddress] = useState("");

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

  const nextAllowedGrade = studentLastGrade ? getNextGradeLevel(studentLastGrade) : null;

  const handleStudentChange = (st, lastGrade) => {
    if (!st) {
      setStudent(null);
      setStudentLastGrade(null);
      setEligibility(null);
      setOverrideMode(false);
      setOverrideReason("");
      setIsTransferIn(false);
      setTransferInDate(todayISO());
      setTransferInReason("");
      setTransferInSchoolName("");
      setTransferInSchoolAddress("");
      return;
    }
    setStudent(st);
    setStudentLastGrade(lastGrade ?? null);
    setOverrideMode(false);
    setOverrideReason("");
    setIsTransferIn(false);
    setTransferInDate(todayISO());
    setTransferInReason("");
    setTransferInSchoolName("");
    setTransferInSchoolAddress("");

    if (lastGrade) {
      const next = getNextGradeLevel(lastGrade);
      if (next) {
        const level = getSchoolLevelForGrade(next);
        setForm((f) => ({ ...f, school_level: level, grade_level: next, strand: "", semester: level === "senior_highschool" ? (f.semester || "1st") : "" }));
      }
    }

    // The eligibility fetch itself lives in the effect below, keyed on the
    // placement fields. Firing it from here read `form` one tick before the
    // setForm() above had applied, so the report was computed against the
    // previous placement — and it never re-ran when the registrar then
    // changed the grade level or ticked Transfer In.
  };

  // Which documents a learner owes depends on WHERE they are being placed and
  // HOW they got here, so the report has to be recomputed whenever any of
  // those change — not once, when the student was picked. Getting this wrong
  // is not cosmetic: the panel would say two documents were missing while the
  // server demanded four, and the registrar met a 400 the page had just told
  // them would not happen.
  //
  // `defaultedStudentRef` keeps the "new students start as Pending" default a
  // first-load decision. Re-applying it on every placement change would fight
  // a registrar who deliberately chose Enrolled.
  const defaultedStudentRef = useRef(null);
  useEffect(() => {
    if (isEdit && !student) return;
    if (!student?.student_id) return;

    let cancelled = false;
    setEligibilityLoading(true);
    getStudentEligibility(student.student_id, {
      schoolLevel: form.school_level,
      gradeLevel: form.grade_level,
      isTransferIn,
      // On an edit, the row being changed is not part of its own history —
      // counting it makes every activation look like a "continuing" learner
      // and silently drops the transferee document rules. Mirrors the
      // exclusion EnrollmentSerializer.validate() already does server-side.
      excludeEnrollmentId: isEdit ? id : undefined,
    })
      .then((data) => {
        if (cancelled) return;
        setEligibility(data);
        if (data?.is_new_student && defaultedStudentRef.current !== student.student_id) {
          defaultedStudentRef.current = student.student_id;
          setForm((f) => ({ ...f, enrollment_status: "pending" }));
        }
      })
      .catch(() => { if (!cancelled) setEligibility(null); })
      .finally(() => { if (!cancelled) setEligibilityLoading(false); });

    return () => { cancelled = true; };
  }, [student, form.school_level, form.grade_level, isTransferIn, eligibilityNonce, isEdit, id]);

  // Deep link from the student's profile (e.g. "New Enrollment" on
  // StudentDetailPage) — preselect that student instead of leaving the
  // picker empty. Only applies when creating a new enrollment.
  //
  // The applicant-intake hand-off (StudentApplicationsPage, on approve) uses
  // the same link and additionally passes what the family said they were
  // enrolling into, so the registrar isn't retyping it off the application.
  // Section is never passed — that is the registrar's decision here.
  useEffect(() => {
    if (isEdit) return;
    const preselectId = searchParams.get("student");
    if (!preselectId) return;
    (async () => {
      const st = await getStudent(preselectId).catch(() => null);
      if (!st) {
        // Silently returning left an empty student picker under a banner
        // still claiming "Step 2 of 2", with nothing to say the link was
        // stale or the record gone.
        setError(
          `Could not load student #${preselectId}. They may have been removed — ` +
          `pick the student manually, or go back to Students.`,
        );
        return;
      }

      const appliedGrade = searchParams.get("grade_level");
      const appliedLevel = searchParams.get("school_level") || schoolLevelForGrade(appliedGrade || "");
      if (appliedGrade && appliedLevel) {
        setForm((f) => ({
          ...f,
          school_level: appliedLevel,
          grade_level: appliedGrade,
          strand: searchParams.get("strand") || "",
          // The schema's CHECK constraint requires a semester for senior
          // high and forbids one anywhere else.
          semester: appliedLevel === "senior_highschool" ? (f.semester || "1st") : "",
        }));
      }

      let lastGrade = null;
      try {
        const enData = await getStudentEnrollments(st.student_id);
        const enrollments = enData.results ?? enData ?? [];
        if (enrollments.length) {
          const latest = enrollments.reduce((a, b) => {
            if (a.school_year > b.school_year) return a;
            if (b.school_year > a.school_year) return b;
            return (a.enrollment_id ?? 0) > (b.enrollment_id ?? 0) ? a : b;
          });
          lastGrade = latest.grade_level ?? null;
        }
      } catch { /* non-critical */ }
      handleStudentChange(st, lastGrade);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Two independent axes, kept separate here because the server keeps them
    // separate too. `is_eligible` folds grade blocks and missing documents
    // into one boolean, while the override toggle below renders only for
    // grade blocks (`admin_override_required`) — so testing `is_eligible`
    // here used to leave a returning student with missing documents unable to
    // submit at all, with no override anywhere on the page to clear it.
    //
    // Grade axis: blocks any status, admin-overridable.
    if (!isEdit && eligibility?.admin_override_required && !overrideMode)
      return "Student has failed or incomplete subjects. An admin override is required.";
    // Document axis: only bites on "enrolled", mirroring the server gate in
    // enrollments/serializers.py, which fires solely on create-as-enrolled or
    // pending -> enrolled. This is what makes the panel's own advice —
    // "enrollment can be created as Pending" — actually true.
    if (!isEdit && form.enrollment_status === "enrolled" && (eligibility?.missing_docs?.length ?? 0) > 0)
      return "Required documents are still missing. Save this enrollment as Pending, or upload the documents first.";
    if (!isEdit && nextAllowedGrade && form.grade_level !== nextAllowedGrade && !overrideMode)
      return `This student must enroll in ${nextAllowedGrade} (next after ${studentLastGrade}).`;
    if (!isEdit && overrideMode && !overrideReason.trim())
      return "An override reason is required when bypassing grade progression rules.";
    if (isEdit && gradePlacementChanged && !gradePlacementReason.trim())
      return "A reason is required when changing grade placement on an existing enrollment.";
    if (!isEdit && isTransferIn && !transferInDate)
      return "Effective date is required for a transfer-in.";
    if (!isEdit && isTransferIn && !transferInSchoolName.trim())
      return "Previous school name is required for a transfer-in.";
    if (!isEdit && isTransferIn && !transferInSchoolAddress.trim())
      return "Previous school address is required for a transfer-in.";
    return "";
  }, [student, form, isSHS, isEdit, eligibility, nextAllowedGrade, studentLastGrade, overrideMode, overrideReason, gradePlacementChanged, gradePlacementReason, isTransferIn, transferInDate, transferInSchoolName, transferInSchoolAddress]);

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
        // Write-only, consumed by EnrollmentSerializer.validate(). The gate
        // needs to know this learner is transferring in to decide which
        // documents they owe, and it cannot read the EnrollmentTransfer row
        // below — that is only created after this request returns.
        payload.is_transfer_in = isTransferIn;
        if (isEdit) {
          if (gradePlacementChanged) {
            payload.progression_override = true;
            payload.progression_override_reason = gradePlacementReason.trim();
          }
          await updateEnrollment(id, payload);
        } else {
          const created = await createEnrollment(payload);

          if (isTransferIn) {
            try {
              const prevSchool = await createPreviousSchool({
                student: student.student_id,
                school_name: transferInSchoolName.trim(),
                school_address: transferInSchoolAddress.trim(),
              });
              await transferInEnrollment(created.enrollment_id, {
                effective_date: transferInDate,
                reason: transferInReason.trim(),
                origin_school_name: prevSchool?.school_name || transferInSchoolName.trim(),
              });
            } catch (e) {
              console.error("transfer-in recording failed (non-critical):", e);
              toast.error("Enrollment created, but recording the transfer-in details failed. You can add them manually later.");
            }
          }

          for (const stId of selectedScholarships) {
            await createEnrollmentScholarship({
              enrollment: created.enrollment_id,
              scholarship_type: stId,
              notes: scholarshipNotes || null,
            }).catch((e) => console.error("scholarship attach failed", e));
          }

          // Send enrollment confirmation email (non-blocking). The backend
          // derives all content server-side from the enrollment record now
          // (registrar/admin only) -- we only pass the id.
          if (student?.email) {
            sendEnrollmentEmail({ enrollment_id: created.enrollment_id })
              .catch((e) => {
                console.warn("Enrollment email failed (non-critical):", e);
                toast.error("Enrollment saved, but the confirmation email could not be sent.");
              });
          }

          // Prompt to generate invoice when enrollment status is enrolled
          // (billing roles only — see canGenerateInvoice above)
          if (form.enrollment_status === "enrolled" && canGenerateInvoice) {
            const fullName = [student?.first_name, student?.last_name].filter(Boolean).join(" ");
            setInvoicePrompt({
              enrollmentId: created.enrollment_id,
              studentName: fullName || `Enrollment #${created.enrollment_id}`,
              effectiveDate: isTransferIn ? transferInDate : null,
            });
            setSaving(false);
            return;
          }
        }

        toast.success(isEdit ? "Enrollment updated." : "Enrollment created.");
        navigate("/enrollments");
      } catch (err) {
        console.error(err);
        const msg = err?.message || "Something went wrong. Please review the form.";
        setError(msg);
        toast.error(msg);
      } finally {
        setSaving(false);
      }
    };

  // ── Presentation only below: nothing here changes what is sent to the API.
  const checks = readinessChecks({
    isEdit, student, form, isSHS, eligibility, eligibilityLoading,
    overrideMode, overrideReason, nextAllowedGrade, studentLastGrade,
    isTransferIn, transferInDate, transferInSchoolName, transferInSchoolAddress,
    gradePlacementChanged, gradePlacementReason,
  });
  const showSwitchToPending = canSwitchToPending({ isEdit, form, eligibility });

  const title = isEdit ? "Edit Enrollment" : "New Enrollment";
  const levelMeta = SCHOOL_LEVELS.find((l) => l.value === form.school_level);
  // School level and grade: locked on an edit until unlocked, and on a new
  // enrollment whenever the student's history fixes the next grade.
  const levelLocked = (isEdit && !gradePlacementUnlocked) || (!isEdit && Boolean(nextAllowedGrade));
  // School year, strand and semester: locked on an edit until unlocked.
  const placementLocked = isEdit && !gradePlacementUnlocked;
  const chosenScholarships = scholarshipTypes.filter((sc) => selectedScholarships.includes(sc.scholarship_type_id));
  const submitLabel = saving
    ? "Saving…"
    : isEdit
      ? "Update Enrollment"
      : form.enrollment_status === "pending" ? "Save as Pending" : "Submit Enrollment";

  const studentSubtitle = isEdit
    ? "The student on this enrollment"
    : student && eligibility?.is_new_student
      ? "New student · no prior enrollments"
      : student && eligibility?.last_enrollment?.school_year
        ? `Returning student · last enrolled S.Y. ${eligibility.last_enrollment.school_year}`
        : "Who is being enrolled";

  return (
    <>
    <div className="min-h-screen bg-neutral-50">
      <PageHeader
        title={title}
        icon={isEdit ? "ti-pencil" : "ti-clipboard-plus"}
        subtitle={isEdit ? "Update class assignment, status, or term details." : "Enroll an existing student into a school year and section."}
        // "Enrollments" is deliberately not a link: leaving goes through
        // Cancel's confirm, so a stray click can't drop a half-filled form.
        breadcrumbs={[{ label: "Enrollments" }, { label: title }]}
        actions={
          <Button variant="secondary" onClick={() => setLeaveConfirm(true)}>
            Cancel
          </Button>
        }
      />

      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-4 py-6 sm:px-6">

        {/* Arrived straight from registration or from approving an
            application: say so, so this reads as the second half of one task
            rather than an unrelated form, and name what Pending will mean if
            they stop here. */}
        {continuing && (
          <Alert
            variant="info"
            icon="ti-arrow-narrow-right"
            title={`Step 2 of 2 — enrolling ${student ? `${student.first_name} ${student.last_name}`.trim() : "this student"}.`}
          >
            The student record is already saved. Saving as <strong>Pending</strong> is fine — they are not enrolled, and take no section or grades, until the required documents are in.
          </Alert>
        )}

        <AnimatePresence>
          {error && <Alert key="error-banner" variant="error">{error}</Alert>}
        </AnimatePresence>

        {loading ? (
          <Card className="py-14 text-center text-sm text-neutral-500">Loading enrollment…</Card>
        ) : (
          <div className="flex flex-col items-start gap-5 lg:flex-row">

            {/* ── Form column ── */}
            <div className="flex w-full min-w-0 flex-1 flex-col gap-4">

              {/* 1. Student */}
              <FormSection step={1} title="Student" subtitle={studentSubtitle}>
                <div className="flex flex-col gap-3">
                  <div className="-mb-3.5">
                    {isEdit ? (
                      <Field label="Enrolling Student" hint="The student cannot be changed on an existing enrollment.">
                        <StudentPicker value={student} onChange={() => {}} disabled />
                      </Field>
                    ) : (
                      <Field label="Enrolling Student" required hint="Find an existing student record. Need to register a new one first? Use the Students page.">
                        <StudentPicker value={student} onChange={handleStudentChange} />
                      </Field>
                    )}
                  </div>

                  {/* Eligibility — new enrollments only */}
                  <AnimatePresence>
                    {!isEdit && student && (
                      <motion.div
                        key="eligibility"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                      >
                        <EligibilityList
                          eligibility={eligibility}
                          loading={eligibilityLoading}
                          overrideMode={overrideMode}
                          overrideReason={overrideReason}
                          onToggleOverride={() => { setOverrideMode((v) => !v); setOverrideReason(""); }}
                          onChangeReason={setOverrideReason}
                          isAdmin={isAdmin}
                          student={student}
                          onDocumentsChanged={refreshEligibility}
                          continuing={continuing}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Transfer-in — only makes sense for a student with no prior local records */}
                  {!isEdit && student && eligibility?.is_new_student && (
                    <div className="rounded-lg border border-neutral-200 px-3.5 py-3">
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isTransferIn}
                          onChange={(e) => setIsTransferIn(e.target.checked)}
                          className="h-4 w-4 shrink-0 cursor-pointer accent-brand-500"
                        />
                        <span className="text-sm font-semibold text-neutral-900">
                          This student is transferring in from another school mid-year
                        </span>
                      </label>
                      {isTransferIn && (
                        <div className="-mb-3.5 mt-3.5 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                          <Field label="Effective Date" required>
                            <Input type="date" value={transferInDate} onChange={(e) => setTransferInDate(e.target.value)} />
                          </Field>
                          <Field label="Previous School Name" required>
                            <Input type="text" value={transferInSchoolName} onChange={(e) => setTransferInSchoolName(e.target.value)}
                              placeholder="e.g. Iloilo National High School" />
                          </Field>
                          <Field label="Previous School Address" required>
                            <Input type="text" value={transferInSchoolAddress} onChange={(e) => setTransferInSchoolAddress(e.target.value)}
                              placeholder="e.g. Iloilo City" />
                          </Field>
                          <Field label="Reason / Notes" hint="Optional">
                            <Input type="text" value={transferInReason} onChange={(e) => setTransferInReason(e.target.value)}
                              placeholder="e.g. Family relocated" />
                          </Field>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </FormSection>

              {/* 2. Placement */}
              <FormSection
                step={2}
                title="Placement"
                subtitle="School year, level, grade and section"
                action={isEdit && gradePlacementChanged ? <Badge variant="warning">Modified</Badge> : null}
              >
                <div className="flex flex-col gap-5">

                  {/* Edit-mode: lock banner + unlock toggle */}
                  {isEdit && (
                    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${gradePlacementUnlocked ? "border-warning-dot/40 bg-warning-50" : "border-neutral-200 bg-neutral-50"}`}>
                      <i
                        className={`ti ${gradePlacementUnlocked ? "ti-lock-open text-warning-500" : "ti-lock text-neutral-600"} mt-0.5 shrink-0 text-[16px]`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-bold ${gradePlacementUnlocked ? "text-warning-500" : "text-neutral-800"}`}>
                          {gradePlacementUnlocked ? "Grade placement unlocked — changes will be audited" : "Grade placement is locked"}
                        </div>
                        <div className={`mt-0.5 text-xs ${gradePlacementUnlocked ? "text-warning-500" : "text-neutral-600"}`}>
                          {gradePlacementUnlocked
                            ? "You may now change grade level, school level, strand, or semester. A reason is required."
                            : "School level, grade level, strand, and semester cannot be changed without admin override."}
                        </div>
                        {gradePlacementUnlocked && (
                          <div className="-mb-3.5 mt-3">
                            <Field label="Reason for change" required>
                              <Textarea
                                value={gradePlacementReason}
                                onChange={(e) => setGradePlacementReason(e.target.value)}
                                placeholder="Explain why the grade placement is being corrected (e.g. data entry error, transferee re-classification)…"
                                rows={2}
                              />
                            </Field>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={gradePlacementUnlocked ? "ti-lock" : "ti-lock-open"}
                        onClick={() => {
                          setGradePlacementUnlocked((v) => !v);
                          setGradePlacementReason("");
                          if (gradePlacementUnlocked && originalGradeFields) {
                            setForm((f) => ({ ...f, ...originalGradeFields }));
                          }
                        }}
                      >
                        {gradePlacementUnlocked ? "Re-lock" : "Unlock"}
                      </Button>
                    </div>
                  )}

                  <div className="-mb-3.5 grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                    <Field label="School Year" required
                      hint={placementLocked ? "Locked — unlock grade placement to change." : undefined}>
                      {placementLocked ? (
                        <LockedValue>{form.school_year}</LockedValue>
                      ) : (
                        <Select value={form.school_year} onChange={(e) => setField("school_year", e.target.value)}>
                          {buildSchoolYearOptions().map((sy) => <option key={sy} value={sy}>{sy}</option>)}
                        </Select>
                      )}
                    </Field>
                    <Field label="Section" required>
                      <Input value={form.section} onChange={(e) => setField("section", e.target.value)} placeholder="e.g. Sampaguita, Section A" />
                    </Field>
                  </div>

                  <div>
                    <GroupLabel
                      required
                      aside={levelLocked ? <LockNote>{isEdit ? "Locked" : "Set by grade progression"}</LockNote> : null}
                    >
                      School Level
                    </GroupLabel>
                    <ChipGroup
                      label="School level"
                      value={form.school_level}
                      onChange={(v) => setField("school_level", v)}
                      disabled={levelLocked}
                      options={SCHOOL_LEVELS.map(({ value, label, icon, tone }) => ({ value, label, icon, tone }))}
                    />
                  </div>

                  <div>
                    <GroupLabel required>Grade Level</GroupLabel>
                    <ChipGroup
                      label="Grade level"
                      value={form.grade_level}
                      onChange={(v) => setField("grade_level", v)}
                      disabled={levelLocked}
                      stagger
                      generation={form.school_level}
                      options={gradeOptions.map((g) => ({ value: g, label: g, tone: levelMeta?.tone ?? "brand" }))}
                    />
                    {!isEdit && nextAllowedGrade && (
                      <p className="mt-2 text-xs italic text-neutral-500">
                        Locked to {nextAllowedGrade} based on student's last grade ({studentLastGrade}).
                      </p>
                    )}
                  </div>

                  {isSHS && (
                    <div className="rounded-lg border border-dashed border-brand-300 bg-brand-50 p-4">
                      <div className="mb-3 text-xs font-bold uppercase tracking-[0.07em] text-brand-600">Senior High details</div>
                      <div className="-mb-3.5 grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                        <Field label="Strand" required>
                          {placementLocked ? (
                            <LockedValue>{form.strand || "—"}</LockedValue>
                          ) : (
                            <Select value={form.strand} onChange={(e) => setField("strand", e.target.value)}>
                              <option value="">— Select strand —</option>
                              {SHS_STRANDS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </Select>
                          )}
                        </Field>
                        <Field label="Semester" required>
                          {placementLocked ? (
                            <LockedValue>{form.semester || "—"}</LockedValue>
                          ) : (
                            <Select value={form.semester} onChange={(e) => setField("semester", e.target.value)}>
                              {SEMESTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </Select>
                          )}
                        </Field>
                      </div>
                    </div>
                  )}
                </div>
              </FormSection>

              {/* 3. Status */}
              <FormSection step={3} title="Enrollment status" subtitle="What saving this record will do">
                <fieldset>
                  <legend className="sr-only">Enrollment status</legend>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {STATUS_CHOICES.map((choice) => {
                      const meta = ENROLLMENT_STATUS_MAP[choice.value];
                      const tone = CHOICE_TONES[meta.variant] ?? CHOICE_TONES.muted;
                      const checked = form.enrollment_status === choice.value;
                      // Only a new enrollment saved as Enrolled offers the
                      // invoice prompt, and only to billing roles.
                      const desc = choice.value === "enrolled" && !isEdit && canGenerateInvoice
                        ? `${choice.desc} You can generate the invoice next.`
                        : choice.desc;
                      return (
                        <label
                          key={choice.value}
                          className={[
                            "flex cursor-pointer items-start gap-2.5 rounded-lg border-[1.5px] px-3.5 py-3 transition-colors",
                            "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand-500/25",
                            checked ? tone.on : "border-neutral-300 bg-white hover:border-brand-300",
                          ].join(" ")}
                        >
                          <input
                            type="radio"
                            name="enrollment_status"
                            value={choice.value}
                            checked={checked}
                            onChange={() => setField("enrollment_status", choice.value)}
                            className="sr-only"
                          />
                          <span
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${checked ? tone.ring : "border-neutral-400"}`}
                            aria-hidden="true"
                          >
                            {checked && <span className={`h-2 w-2 rounded-full ${tone.fill}`} />}
                          </span>
                          <span className="min-w-0">
                            <span className={`block text-base font-bold ${checked ? tone.text : "text-neutral-900"}`}>{meta.label}</span>
                            <span className="block text-xs text-neutral-600">{desc}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </FormSection>

              {/* 4. Scholarships (create only) */}
              {!isEdit && (
                <FormSection
                  step={4}
                  title="Scholarships"
                  subtitle="Optional. Attach any this enrollment qualifies for."
                  action={selectedScholarships.length > 0 ? <Badge variant="brand">{selectedScholarships.length} selected</Badge> : null}
                >
                  {scholarshipTypes.length === 0 ? (
                    <p className="py-4 text-center text-sm text-neutral-500">No active scholarship types available.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {scholarshipTypes.map((sc) => {
                        const active = selectedScholarships.includes(sc.scholarship_type_id);
                        return (
                          <label
                            key={sc.scholarship_type_id}
                            className={[
                              "flex cursor-pointer items-center gap-3 rounded-lg border-[1.5px] px-3.5 py-3 transition-colors",
                              active ? "border-brand-500 bg-brand-50" : "border-neutral-300 bg-white hover:border-brand-300",
                            ].join(" ")}
                          >
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleScholarship(sc.scholarship_type_id)}
                              className="h-4 w-4 shrink-0 cursor-pointer accent-brand-500"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-base font-semibold text-neutral-900">{sc.scholarship_name}</span>
                              {sc.description && <span className="block text-xs text-neutral-500">{sc.description}</span>}
                            </span>
                            <Badge variant="accent" className="whitespace-nowrap">{discountLabel(sc)} off</Badge>
                          </label>
                        );
                      })}
                      {selectedScholarships.length > 0 && (
                        <div className="-mb-3.5 mt-2">
                          <Field label="Notes" hint="Optional remarks applied to all selected scholarships.">
                            <Textarea value={scholarshipNotes} onChange={(e) => setScholarshipNotes(e.target.value)} placeholder="e.g. Approved by registrar on 2026-06-10" />
                          </Field>
                        </div>
                      )}
                    </div>
                  )}
                </FormSection>
              )}
            </div>

            {/* ── Summary rail ── */}
            <SummaryCard
              isEdit={isEdit}
              student={student}
              form={form}
              isSHS={isSHS}
              levelMeta={levelMeta}
              chosenScholarships={chosenScholarships}
              checks={checks}
              validationError={validationError}
              saving={saving}
              submitLabel={submitLabel}
              onSubmit={handleSubmit}
              showSwitchToPending={showSwitchToPending}
              onSwitchToPending={() => setField("enrollment_status", "pending")}
            />
          </div>
        )}
      </div>
    </div>

    {/* ── Invoice Prompt Modal ─────────────────────────────────────────────── */}
    <AnimatePresence>
      {invoicePrompt && (
        <InvoicePromptModal
          key="invoice-prompt"
          enrollmentId={invoicePrompt.enrollmentId}
          studentName={invoicePrompt.studentName}
          effectiveDate={invoicePrompt.effectiveDate}
          onClose={() => { setInvoicePrompt(null); navigate("/enrollments"); }}
          onGoToInvoices={() => navigate(`/invoices?selected=${invoicePrompt.enrollmentId}`)}
        />
      )}
      {leaveConfirm && (
        <ConfirmDialog
          key="leave-confirm"
          icon="ti-arrow-left"
          danger={false}
          title={continuing ? "Stop before enrolling?" : "Discard this enrollment?"}
          message={continuing
            ? `${student ? `${student.first_name} ${student.last_name}`.trim() : "This student"} has already been saved as a student record. Stopping now leaves them with no enrollment — no section, no class lists and no grades — until someone enrolls them later.`
            : "Anything entered on this form will be lost."}
          confirmLabel={continuing ? "Yes, enroll later" : "Yes, discard"}
          cancelLabel={continuing ? "Continue enrolling" : "Keep editing"}
          onConfirm={() => navigate("/enrollments")}
          onCancel={() => setLeaveConfirm(false)}
        />
      )}
    </AnimatePresence>
    </>
  );
}

function InvoicePromptModal({ enrollmentId, studentName, effectiveDate, onClose, onGoToInvoices }) {
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState("monthly");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      await _generateInvoice({
        enrollment_id: enrollmentId,
        payment_plan: plan,
        ...(effectiveDate ? { effective_date: effectiveDate } : {}),
      });
      setDone(true);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to generate invoice.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
        onClick={!generating ? onClose : undefined}
        style={{ position: "absolute", inset: 0, background: "rgba(26,10,10,0.5)", backdropFilter: "blur(4px)" }}
      />
      <motion.div
        variants={modalVariants} initial="hidden" animate="visible" exit="exit" transition={springTransition}
        style={{ position: "relative", background: "white", borderRadius: 16, padding: 32, maxWidth: 420, width: "100%", boxShadow: "0 8px 40px rgba(224,49,49,0.18)", fontFamily: "'DM Sans', sans-serif" }}>
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 22 }}
                  style={{ width: 56, height: 56, borderRadius: "50%", background: "#e8f5e0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 28, color: "#2e6b0d" }} />
                </motion.div>
                <h3 style={{ margin: "0 0 6px", fontSize: 18, color: "#1a0a0a" }}>Invoice Generated</h3>
                <p style={{ margin: 0, fontSize: 14, color: "#7a5050" }}>Invoice created for <strong>{studentName}</strong>. You can view it in the Invoices page.</p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} transition={{ duration: 0.12 }}
                  onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 50, border: "1.5px solid #fca5a5", background: "transparent", color: "#7a5050", fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  Back to Enrollments
                </motion.button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} transition={{ duration: 0.12 }}
                  onClick={onGoToInvoices} style={{ flex: 1, padding: "10px 0", borderRadius: 50, border: "none", background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  View Invoices
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="prompt" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 6px", fontSize: 18, color: "#1a0a0a" }}>Generate Invoice?</h3>
                <p style={{ margin: 0, fontSize: 14, color: "#7a5050" }}>
                  <strong>{studentName}</strong> has been enrolled. Would you like to generate a billing invoice now?
                </p>
                {effectiveDate && (
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#b45309", fontStyle: "italic" }}>
                    Transfer-in student — the installment schedule will be prorated to start from {effectiveDate}.
                  </p>
                )}
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
              <AnimatePresence>
                {error && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
                    style={{ color: "#c92a2a", fontSize: 13, marginBottom: 12 }}>{error}
                  </motion.p>
                )}
              </AnimatePresence>
              <div style={{ display: "flex", gap: 10 }}>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} transition={{ duration: 0.12 }}
                  onClick={onClose} disabled={generating} style={{ flex: 1, padding: "10px 0", borderRadius: 50, border: "1.5px solid #fca5a5", background: "transparent", color: "#7a5050", fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  Skip for Now
                </motion.button>
                <motion.button
                  whileHover={!generating ? { scale: 1.03 } : {}}
                  whileTap={!generating ? { scale: 0.96 } : {}}
                  transition={{ duration: 0.12 }}
                  onClick={handleGenerate} disabled={generating} style={{ flex: 1, padding: "10px 0", borderRadius: 50, border: "none", background: generating ? "#f0c4c4" : "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", fontWeight: 700, cursor: generating ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  {generating ? "Generating…" : "Generate Invoice"}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}