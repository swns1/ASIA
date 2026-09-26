// enrollmentReadiness — the "Before you submit" checklist on the enrollment
// form's summary card.
//
// Display only. The Submit button is still gated by EnrollmentFormPage's own
// `validationError`, and the server re-checks everything on save. This exists
// because that gate only ever names the FIRST problem, in a disabled button,
// so a registrar found the rest one at a time. The checklist shows every item
// at once, including the ones already done.
//
// The conditions mirror validationError's, grouped per item, so the two can't
// tell different stories; enrollmentReadiness.test.js pins the pairs.

import { ENROLLMENT_STATUS_MAP } from "../../constants/statusMaps";

// Each check: { id, state, title, detail }
//   state: "ok"      done
//          "todo"    still to fill in
//          "warn"    blocks saving as the chosen status, but has a way out
//          "block"   blocks saving until an admin overrides it
//          "info"    worth knowing, does not block
//          "loading" still being worked out
const docs = (n) => `${n} document${n === 1 ? "" : "s"}`;

export function readinessChecks({
  isEdit,
  student,
  form,
  isSHS,
  eligibility,
  eligibilityLoading,
  overrideMode,
  overrideReason,
  nextAllowedGrade,
  studentLastGrade,
  isTransferIn,
  transferInDate,
  transferInSchoolName,
  transferInSchoolAddress,
  gradePlacementChanged,
  gradePlacementReason,
}) {
  const checks = [];
  const fullName = student ? [student.first_name, student.last_name].filter(Boolean).join(" ") : "";

  // ── Student ────────────────────────────────────────────────────────────────
  if (!student && !isEdit) {
    checks.push({ id: "student", state: "todo", title: "Pick a student", detail: "Search above by name, LRN or student number." });
  } else {
    checks.push({ id: "student", state: "ok", title: isEdit ? "Student" : "Student selected", detail: fullName || null });
  }

  // ── Grade progression (new enrollments only, like the eligibility panel) ──
  if (!isEdit && student) {
    if (eligibilityLoading) {
      checks.push({ id: "grade", state: "loading", title: "Checking eligibility…", detail: null });
    } else if (!eligibility) {
      checks.push({ id: "grade", state: "info", title: "Eligibility not checked", detail: "The server still checks it when you submit." });
    } else if (eligibility.is_new_student) {
      checks.push({ id: "grade", state: "ok", title: "New student", detail: "No prior records, so any grade level is allowed." });
    } else if (eligibility.admin_override_required && !overrideMode) {
      checks.push({ id: "grade", state: "block", title: "Failed or incomplete subjects", detail: "An admin override is required." });
    } else if (overrideMode && !overrideReason.trim()) {
      checks.push({ id: "grade", state: "warn", title: "Override reason needed", detail: "Explain why the progression rule is bypassed." });
    } else if (nextAllowedGrade && form.grade_level !== nextAllowedGrade && !overrideMode) {
      checks.push({ id: "grade", state: "warn", title: `Must enroll in ${nextAllowedGrade}`, detail: `Next after ${studentLastGrade}.` });
    } else if (overrideMode) {
      checks.push({ id: "grade", state: "ok", title: "Override active", detail: "Reason given. This change is audited." });
    } else {
      checks.push({
        id: "grade",
        state: "ok",
        title: "Grade progression OK",
        detail: studentLastGrade ? `${studentLastGrade} → ${form.grade_level}` : form.grade_level,
      });
    }
  }

  // ── Placement ──────────────────────────────────────────────────────────────
  if (!form.section.trim()) {
    checks.push({ id: "placement", state: "todo", title: "Enter a section", detail: null });
  } else if (isSHS && !form.semester) {
    checks.push({ id: "placement", state: "todo", title: "Pick a semester", detail: "Required for Senior High." });
  } else if (isSHS && !form.strand.trim()) {
    checks.push({ id: "placement", state: "todo", title: "Pick a strand", detail: "Required for Senior High." });
  } else {
    checks.push({ id: "placement", state: "ok", title: "Placement set", detail: `${form.grade_level} · ${form.section.trim()}` });
  }

  // Editing an existing row's placement needs a written reason (audited).
  if (isEdit && gradePlacementChanged) {
    checks.push(
      gradePlacementReason.trim()
        ? { id: "placement-reason", state: "ok", title: "Reason for placement change given", detail: null }
        : { id: "placement-reason", state: "warn", title: "Reason for placement change needed", detail: "Required because grade placement changed." },
    );
  }

  // ── Documents ──────────────────────────────────────────────────────────────
  // Only bites on "enrolled", same as the server gate: Pending is the way
  // through for a learner who still owes paperwork.
  if (!isEdit && student && eligibility && !eligibilityLoading) {
    const missing = eligibility.missing_docs?.length ?? 0;
    if (eligibility.documents_assessed === false) {
      checks.push({ id: "docs", state: "info", title: "Documents not checked", detail: "Needs a school level to know what applies." });
    } else if (missing === 0) {
      checks.push({ id: "docs", state: "ok", title: "Documents complete", detail: null });
    } else if (form.enrollment_status === "enrolled") {
      checks.push({
        id: "docs",
        state: "warn",
        title: `${docs(missing)} missing`,
        detail: "Needed before Enrolled. Upload them, or switch to Pending.",
      });
    } else {
      const label = ENROLLMENT_STATUS_MAP[form.enrollment_status]?.label ?? form.enrollment_status;
      checks.push({
        id: "docs",
        state: "info",
        title: `${docs(missing)} still to collect`,
        detail: `Fine for ${label}. Collect before enrolling.`,
      });
    }
  }

  // ── Transfer-in ────────────────────────────────────────────────────────────
  if (!isEdit && isTransferIn) {
    const done = Boolean(transferInDate) && Boolean(transferInSchoolName.trim()) && Boolean(transferInSchoolAddress.trim());
    checks.push(
      done
        ? { id: "transfer", state: "ok", title: "Transfer-in details", detail: transferInSchoolName.trim() }
        : { id: "transfer", state: "todo", title: "Finish transfer-in details", detail: "Date, previous school and its address." },
    );
  }

  return checks;
}

// True when the one thing between the registrar and saving is paperwork, and
// switching the status to Pending is the documented way through.
export function canSwitchToPending({ isEdit, form, eligibility }) {
  return (
    !isEdit &&
    form.enrollment_status === "enrolled" &&
    eligibility?.documents_assessed !== false &&
    (eligibility?.missing_docs?.length ?? 0) > 0
  );
}
