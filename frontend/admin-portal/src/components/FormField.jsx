// FormField.jsx
//
// Shared form-field wrapper (Field/Input/Select/Textarea) — generalized from
// the near-identical local copies in StudentFormPage.jsx, EnrollmentFormPage.jsx,
// SchoolFormsPage.jsx, and SchoolSettingsPage.jsx, all built around the same
// red-medical color palette below.
import { useState } from "react";

const C = {
  red: "#e03131", redLight: "#fff0f0", redBorder: "#fca5a5",
  redMid: "#fde2de", dark: "#1a0a0a", muted: "#7a5050",
  bg: "#fff8f6", white: "#ffffff", shadow: "0 4px 24px rgba(224,49,49,0.10)",
};

const inputStyle = {
  width: "100%", border: `1.5px solid ${C.redMid}`, borderRadius: 10,
  padding: "10px 14px", fontSize: 14, fontFamily: "'DM Sans', sans-serif",
  color: C.dark, background: "#fffbfb", outline: "none",
  boxSizing: "border-box", transition: "border-color .15s, box-shadow .15s",
};

const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 700, color: C.muted,
  letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5,
};

const focusStyle = { borderColor: C.red, boxShadow: `0 0 0 3px rgba(224,49,49,.10)`, background: C.white };

export function Field({ label, hint, children, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}{required && <span style={{ color: C.red }}> *</span>}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 5, fontStyle: "italic" }}>{hint}</div>}
    </div>
  );
}

export function Input({ style, onFocus, onBlur, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      style={{ ...inputStyle, ...(focused ? focusStyle : {}), ...style }}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
    />
  );
}

export function Select({ children, style, ...props }) {
  return (
    <select {...props} style={{ ...inputStyle, ...style, cursor: "pointer" }}>
      {children}
    </select>
  );
}

export function Textarea({ style, onFocus, onBlur, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      {...props}
      style={{ ...inputStyle, minHeight: 72, resize: "vertical", ...(focused ? focusStyle : {}), ...style }}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
    />
  );
}
