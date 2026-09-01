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
