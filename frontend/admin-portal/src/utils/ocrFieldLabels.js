// Shared between OcrScanButton and StudentFormPage's document review UI so
// the OCR field-name -> label / confidence-color mappings don't drift apart.

export const CONFIDENCE_STYLES = {
  high:   { bar: "bg-green-500",  label: "text-green-700",  text: "High confidence"   },
  medium: { bar: "bg-yellow-400", label: "text-yellow-700", text: "Medium confidence" },
  low:    { bar: "bg-red-400",    label: "text-red-700",    text: "Low confidence — review carefully" },
};

// Maps OCR field names -> human-readable labels for the preview
export const FIELD_LABELS = {
  first_name:              "First Name",
  middle_name:             "Middle Name",
  last_name:               "Last Name",
  suffix:                  "Suffix",
  lrn:                     "LRN",
  birth_date:              "Birth Date",
  sex:                     "Sex",
  religion:                "Religion",
  email:                   "Email",
  mobile_number:           "Mobile Number",
  current_address:         "Current Address",
  permanent_address:       "Permanent Address",
  guardian_full_name:      "Guardian Name",
  guardian_relationship:   "Guardian Relationship",
  guardian_mobile_number:  "Guardian Mobile",
  guardian_email:          "Guardian Email",
  previous_school_name:    "Previous School",
  previous_school_address: "Previous School Address",
};
