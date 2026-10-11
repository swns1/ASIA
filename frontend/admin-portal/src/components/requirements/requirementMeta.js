// Constants for the document-requirements panel.
//
// Deliberately a separate module from the components: eslint.config.js sets
// react-refresh/only-export-components to "error", so a file exporting a
// component may export nothing else. Same reason pages/student-form/
// formShapes.js exists.

// Design tokens, matching the two copies this panel replaces. var() strings
// where the colour is a token, so it follows the theme of the screen drawing
// it; the literals have no exact token and keep their light value.
export const C = {
  red: "var(--color-brand-500)", redDark: "var(--color-brand-600)", redLight: "var(--color-brand-100)", redBorder: "var(--color-brand-300)",
  green: "#2e7d32", greenLight: "var(--color-success-50)", greenBorder: "#a5d6a7",
  amber: "var(--color-warning-500)", amberLight: "var(--color-warning-50)", amberBorder: "#e8c99a",
  border: "var(--color-neutral-200)", softBorder: "#f9f0f0",
  text: "var(--color-neutral-900)", muted: "var(--color-neutral-700)", pale: "var(--color-neutral-500)",
  bg: "var(--color-neutral-50)", white: "#ffffff",
};

// What the in-use literals above become in dark (`dark ? DARK_C.green : C.green`).
// The border is the dark success toast's.
export const DARK_C = {
  green: "var(--color-success-500)",
  greenBorder: "rgba(127,207,138,0.35)",
  softBorder: "var(--color-neutral-200)",
};

export const REQ_ICONS = {
  birth_certificate:         "ti-certificate",
  form_138:                  "ti-file-description",
  certificate_good_moral:    "ti-rosette",
  ncae_result:               "ti-chart-bar",
  esc_completers:            "ti-school",
  certificate_non_sf9:       "ti-file-check",
  recommendation_letter:     "ti-mail",
  clearance_previous_school: "ti-building",
  psa_birth_certificate:     "ti-id",
  health_record:             "ti-heart-rate-monitor",
  alien_certificate:         "ti-world",
  form_137_or_138:           "ti-files",
  esc_transferee_qc:         "ti-arrows-transfer",
};

export function reqIcon(code) {
  return REQ_ICONS[code] || "ti-file";
}

// Document download URLs are signed API links (…/file/?token=…), not plain
// media paths, so they no longer end in a file extension. `file_kind` — set
// server-side from the stored file's real extension — is the reliable signal;
// the regex is only a fallback for the window before both sides deploy.
//
// StudentFormPage's copy tested the URL alone, which is why its view modal
// could open a PDF as a broken <img>.
export function isImageDoc(req) {
  if (!req) return false;
  if (req.file_kind) return req.file_kind === "image";
  return !!req.image_url && /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(req.image_url);
}

export function isPdfDoc(req) {
  if (!req) return false;
  if (req.file_kind) return req.file_kind === "pdf";
  return !!req.image_url && /\.pdf(\?.*)?$/i.test(req.image_url);
}

// Splits a summary payload into the three buckets the panel renders.
//
// `applies === false` means the backend was told the learner's placement and
// says this document is not asked of them — a Grade 1 entrant is never shown
// an NCAE result. `applies === null` means no placement was supplied, so the
// panel shows the whole catalogue and only separates required from optional.
export function groupRequirements(items = []) {
  const submitted = [];
  const required = [];
  const optional = [];
  const notApplicable = [];

  for (const item of items) {
    if (item.applies === false) {
      notApplicable.push(item);
    } else if (item.is_submitted) {
      submitted.push(item);
    } else if (item.is_required) {
      required.push(item);
    } else {
      optional.push(item);
    }
  }
  return { submitted, required, optional, notApplicable };
}
