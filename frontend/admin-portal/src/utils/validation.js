// validation.js — shared field validators and the form-error contract.
//
// The app's existing forms each return the FIRST problem as a single string
// (StudentFormPage returns {step, message}, EnrollmentFormPage a lone string),
// so users fix one error, resubmit, and discover the next — a guess-and-check
// loop. The contract here is: validate() returns a { field: message } map so
// every problem is shown at once, next to the field it belongs to.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Messages say what to do, not just what's wrong. */
export const required = (value, label = "This field") =>
  String(value ?? "").trim() ? null : `${label} is required.`;

export const email = (value) => {
  const v = String(value ?? "").trim();
  if (!v) return null; // absence is `required`'s job, not this one's
  return EMAIL_RE.test(v) ? null : "Enter a valid email address, like name@school.edu.";
};

export const minLength = (value, n, label = "This field") => {
  const v = String(value ?? "");
  if (!v) return null;
  return v.length >= n ? null : `${label} must be at least ${n} characters.`;
};

// ── Student-record field rules ────────────────────────────────────────────────
// These three were hand-rolled separately in StudentFormPage and in the public
// ApplicantFormPage, with the same regexes and byte-identical messages -- and
// they had drifted: the applicant form checked the LRN and the staff form did
// not, while the staff form checked the email and a 1970 birth-year floor that
// the applicant form did not. Two paths write the same `students` row, so they
// need one set of rules.

export const LRN_RE = /^\d{12}$/;

/** A DepEd Learner Reference Number: exactly 12 digits.
 *  Mirrored server-side by students/validators.py so it holds for any caller. */
export const lrn = (value) => {
  const v = String(value ?? "").trim();
  if (!v) return null; // may legitimately be unassigned — see the intake flow
  return LRN_RE.test(v)
    ? null
    : "LRN must be exactly 12 digits — leave it blank if one hasn't been assigned yet.";
};

export const MOBILE_RE = /^09\d{9}$/;

/** A Philippine mobile number as DepEd forms expect it: 09 + 9 digits. */
export const mobileNumber = (value) => {
  const v = String(value ?? "").trim();
  if (!v) return null;
  return MOBILE_RE.test(v)
    ? null
    : "Mobile number must start with 09 and be 11 digits (e.g. 09XXXXXXXXX).";
};

/** Earliest year a learner's birth date could plausibly be. Guards against a
 *  mistyped year (e.g. 0215) landing in a permanent record. */
export const EARLIEST_BIRTH_YEAR = 1970;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days in a month (1-12), leap years included. */
export const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

/** A "YYYY-MM-DD" string as a local Date, or null if it isn't a real calendar
 *  day. `new Date("2025-02-30")` is no check: Chrome rolls it over to March 2,
 *  so Feb 29 in a non-leap year and Feb 30 used to pass. */
export function parseISODate(value) {
  const m = ISO_DATE_RE.exec(String(value ?? "").trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  const d = new Date(year, month - 1, day);
  // Years 0-99 map to 1900-1999 in the Date constructor.
  return d.getFullYear() === year ? d : null;
}

export const IMPOSSIBLE_DATE_MESSAGE =
  "That date doesn't exist — check the day. February has 28 days, or 29 in a leap year.";

export const birthDate = (value) => {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const d = parseISODate(v);
  if (!d) {
    // Name the month when the only thing wrong is the day, e.g. Feb 29, 2025.
    const [year, month, day] = (ISO_DATE_RE.exec(v) ?? []).slice(1).map(Number);
    if (year >= EARLIEST_BIRTH_YEAR && month >= 1 && month <= 12 && day > daysInMonth(year, month)) {
      const monthName = new Date(2000, month - 1, 1).toLocaleString("en-US", { month: "long" });
      return `Please enter a valid birth date — ${monthName} ${year} has only ${daysInMonth(year, month)} days.`;
    }
    return "Please enter a valid birth date.";
  }
  if (d > new Date()) return "Birth date cannot be in the future.";
  if (d.getFullYear() < EARLIEST_BIRTH_YEAR) return "Please enter a valid birth date.";
  return null;
};

/**
 * Build an error map, dropping empty entries.
 *   collect({ name: required(name, "Full name"), email: email(email) })
 */
export function collect(checks) {
  const errors = {};
  for (const [field, message] of Object.entries(checks)) {
    if (message) errors[field] = message;
  }
  return errors;
}

export const hasErrors = (errors) => Object.keys(errors).length > 0;

/**
 * Move focus to the first field with an error so keyboard users aren't left
 * hunting for it after a failed submit.
 */
export function focusFirstError(errors, order = []) {
  const first = order.find((f) => errors[f]) ?? Object.keys(errors)[0];
  if (!first) return;
  const el = document.querySelector(`[data-field="${first}"]`);
  el?.focus?.();
}
