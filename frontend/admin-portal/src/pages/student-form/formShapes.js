// Plain constants/helpers shared by StudentFormSteps.jsx (the step
// components) and its two consumers (StudentFormPage.jsx, the staff
// counter form, and pages/apply/ApplicantFormPage.jsx, the applicant-facing
// form). Split out of StudentFormSteps.jsx because
// react-refresh/only-export-components (eslint.config.js) requires a file
// that exports components to export ONLY components — mixing these in
// would break Vite's fast refresh for every step component.

// ─── helpers ────────────────────────────────────────────────────────────────
export const nullify = (obj, fields) => {
  const out = { ...obj };
  fields.forEach((f) => {
    if (out[f] === "" || out[f] === undefined) out[f] = null;
  });
  return out;
};

// ─── initial shapes ─────────────────────────────────────────────────────────
export const emptyStudent = {
  lrn: "", first_name: "", middle_name: "", last_name: "", suffix: "",
  sex: "male", birth_date: "", religion: "", email: "", mobile_number: "",
  current_address: "", permanent_address: "", status: "active",
};

export const emptyHousehold = {
  parent_marital_status: "", living_arrangement: "",
  is_4ps_beneficiary: false, four_ps_id: "",
};

export const emptyGuardian = {
  relationship: "mother", full_name: "", occupation: "",
  email_address: "", mobile_number: "", is_primary_contact: false,
};

export const emptySibling = { full_name: "", age: "" };

export const emptySchool = { school_name: "", school_address: "" };

// ─── step config ─────────────────────────────────────────────────────────────
// The staff-facing set. The applicant form defines its own shorter list of
// these same step ids rather than importing this one.
//
// "documents" used to lead this list. It was there so OCR could extract a
// birth certificate and prefill the fields below it; extraction was retired
// (backend ocr/policy.py), leaving a step that collected files against a
// student who did not exist yet. Documents are handled on the enrollment and
// on /requirements now, via RequirementDocumentsPanel.
export const STEPS = [
  { id: "student",   label: "Student",         icon: "ti-user" },
  { id: "household", label: "Household",       icon: "ti-home" },
  { id: "guardians", label: "Guardians",       icon: "ti-users" },
  { id: "siblings",  label: "Siblings",        icon: "ti-friends" },
  { id: "schools",   label: "Prev. Schools",   icon: "ti-school" },
  { id: "review",    label: "Review",          icon: "ti-clipboard-check" },
];

// ─── style tokens ────────────────────────────────────────────────────────────
export const C = {
  red: "#e03131", redLight: "#fff0f0", redBorder: "#fca5a5",
  redMid: "#fde2de", dark: "#1a0a0a", muted: "#7a5050",
  bg: "#fff8f6", white: "#ffffff", shadow: "0 4px 24px rgba(224,49,49,0.10)",
};

export const cardStyle = {
  background: C.white, borderRadius: 16, border: `1px solid ${C.redMid}`,
  padding: "24px 28px", boxShadow: C.shadow, marginBottom: 18,
};

export const btnGhost = {
  background: C.redLight, color: C.red, border: "none", borderRadius: 8,
  padding: "7px 16px", fontSize: 13, fontWeight: 600,
  fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
};

export const btnDanger = {
  background: "transparent", color: "#b91c1c", border: "1px solid #fca5a5",
  borderRadius: 8, padding: "5px 12px", fontSize: 12,
  fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
};
