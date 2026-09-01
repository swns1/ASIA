// The vocabulary and the merge rules for reviewing a scanned document.
//
// The rule this file exists to enforce: a scan produces *claims*, and a claim
// never reaches the form without someone ticking it. What it replaced spread
// the scan result straight over form state, so a second document silently
// overwrote the first and — in edit mode, where the form is pre-filled from
// the database — one click could replace a saved LRN, name and birth date
// with no way back.

export const FIELD_LABELS = {
  lrn: "LRN",
  first_name: "First name",
  middle_name: "Middle name",
  last_name: "Last name",
  suffix: "Suffix",
  birth_date: "Date of birth",
  sex: "Sex",
  religion: "Religion",
  email: "Email",
  mobile_number: "Mobile number",
  current_address: "Current address",
  permanent_address: "Permanent address",
  previous_school_name: "Previous school",
  previous_school_address: "Previous school address",
  guardians: "Parents / guardians",
};

export function fieldLabel(key) {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ");
}

/** Guardians arrive as a list of objects; everything else is a scalar. */
export function displayValue(key, value) {
  if (value == null || value === "") return "";
  if (key === "guardians" && Array.isArray(value)) {
    return value.map((g) => `${g.relationship}: ${g.full_name}`).join(" · ");
  }
  return String(value);
}

/** What the form currently holds for a field, flattened the same way. */
export function currentValue(key, student, guardians) {
  if (key === "guardians") {
    const named = (guardians ?? []).filter((g) => g.full_name);
    return named.map((g) => `${g.relationship}: ${g.full_name}`).join(" · ");
  }
  return student?.[key] == null ? "" : String(student[key]);
}

export const CONFIDENCE_TONE = {
  high: "text-success-500",
  medium: "text-warning-500",
  low: "text-error-500",
};

/**
 * One row per field the document claimed.
 *
 * `checked` is the whole point of the review gate, so the defaults are chosen
 * to make the safe thing the easy thing:
 *
 *   - the form is empty here      -> ticked; there is nothing to lose
 *   - it would overwrite a value  -> UNTICKED; this is the edit-mode data-loss
 *                                    path and it should cost a deliberate click
 *   - another document disagrees  -> UNTICKED, with every claim shown; a
 *                                    conflict means one of the papers is wrong,
 *                                    or they belong to two different students
 *   - the value is identical      -> ticked but inert, and marked "no change"
 */
export function buildReviewRows({ extracted, fieldConfidence, ledger, student, guardians }) {
  return Object.entries(extracted ?? {}).map(([key, incoming]) => {
    const current = currentValue(key, student, guardians);
    const incomingText = displayValue(key, incoming);
    const entry = ledger?.[key];
    const isConflict = entry?.verdict === "conflict";
    const unchanged = current !== "" && current === incomingText;
    const overwrites = current !== "" && !unchanged;

    return {
      key,
      label: fieldLabel(key),
      incoming,
      incomingText,
      current,
      confidence: fieldConfidence?.[key] ?? "medium",
      verdict: entry?.verdict ?? (overwrites ? "overwrite" : "new"),
      claims: entry?.claims ?? [],
      isConflict,
      overwrites,
      unchanged,
      checked: !overwrites && !isConflict,
    };
  });
}

export function rowNote(row) {
  if (row.isConflict) return "Another document says something different";
  if (row.unchanged) return "Same as what's on the form";
  if (row.overwrites) return "Would replace what's on the form";
  return "";
}
