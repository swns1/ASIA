import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import { modalVariants, springTransition } from "../utils/motion";
import { getStudent, updateStudent } from "../api/studentApi";
import {
  createGuardian,
  updateGuardian,
  deleteGuardian,
  getGuardiansByStudent,
} from "../api/guardianApi";
import {
  createSibling,
  updateSibling,
  deleteSibling,
  getSiblingsByStudent,
} from "../api/siblingApi";
import {
  createPreviousSchool,
  updatePreviousSchool,
  deletePreviousSchool,
  getPreviousSchoolsByStudent,
} from "../api/previousSchoolApi";
import {
  getHouseholdByStudent,
  createHousehold,
  updateHousehold,
} from "../api/householdApi";
import { bulkCreateStudent } from "../api/studentApi";
import {
  fetchRequirementTypes,
  fetchRequirementSummary,
  uploadRequirement,
  replaceRequirement,
  removeRequirement,
  resolveMediaUrl,
} from "../api/requirementApi";
import { scanDocument } from "../api/ocrApi";

// ─── helpers ────────────────────────────────────────────────────────────────
const nullify = (obj, fields) => {
  const out = { ...obj };
  fields.forEach((f) => {
    if (out[f] === "" || out[f] === undefined) out[f] = null;
  });
  return out;
};

// ─── initial shapes ─────────────────────────────────────────────────────────
const emptyStudent = {
  lrn: "", first_name: "", middle_name: "", last_name: "", suffix: "",
  sex: "male", birth_date: "", religion: "", email: "", mobile_number: "",
  current_address: "", permanent_address: "", status: "active",
};

const emptyHousehold = {
  parent_marital_status: "", living_arrangement: "",
  is_4ps_beneficiary: false, four_ps_id: "",
};

const emptyGuardian = {
  relationship: "mother", full_name: "", occupation: "",
  email_address: "", mobile_number: "", is_primary_contact: false,
};

const emptySibling = { full_name: "", age: "" };

const emptySchool = { school_name: "", school_address: "" };

// ─── step config ─────────────────────────────────────────────────────────────
const STEPS = [
  { id: "documents", label: "Documents",       icon: "ti-file-check" },
  { id: "student",   label: "Student",         icon: "ti-user" },
  { id: "household", label: "Household",       icon: "ti-home" },
  { id: "guardians", label: "Guardians",       icon: "ti-users" },
  { id: "siblings",  label: "Siblings",        icon: "ti-friends" },
  { id: "schools",   label: "Prev. Schools",   icon: "ti-school" },
  { id: "review",    label: "Review",          icon: "ti-clipboard-check" },
];

// ─── style tokens ────────────────────────────────────────────────────────────
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

const cardStyle = {
  background: C.white, borderRadius: 16, border: `1px solid ${C.redMid}`,
  padding: "24px 28px", boxShadow: C.shadow, marginBottom: 18,
};

const btnGhost = {
  background: C.redLight, color: C.red, border: "none", borderRadius: 8,
  padding: "7px 16px", fontSize: 13, fontWeight: 600,
  fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
};

const btnDanger = {
  background: "transparent", color: "#b91c1c", border: "1px solid #fca5a5",
  borderRadius: 8, padding: "5px 12px", fontSize: 12,
  fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
};

// ─── reusable field ──────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Input({ style, onFocus, onBlur, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      style={{
        ...inputStyle,
        ...(focused ? { borderColor: C.red, boxShadow: `0 0 0 3px rgba(224,49,49,.10)`, background: C.white } : {}),
        ...style,
      }}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
    />
  );
}

function Select({ children, style, ...props }) {
  return (
    <select {...props} style={{ ...inputStyle, ...style }}>
      {children}
    </select>
  );
}

function Textarea({ style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      {...props}
      style={{
        ...inputStyle, minHeight: 72, resize: "vertical",
        ...(focused ? { borderColor: C.red, boxShadow: `0 0 0 3px rgba(224,49,49,.10)`, background: C.white } : {}),
        ...style,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// ─── step indicator ──────────────────────────────────────────────────────────
function StepBar({ current, onStepClick }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 32, gap: 0 }}>
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = i !== current;
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
            <div
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: clickable ? "pointer" : "default" }}
              onClick={() => clickable && onStepClick(i)}
              title={clickable ? `Go to ${s.label}` : undefined}
            >
              <motion.div
                animate={active ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                transition={active ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
                whileHover={clickable ? { scale: 1.1 } : {}}
                whileTap={clickable ? { scale: 0.93 } : {}}
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: done ? C.red : active ? C.redLight : "#f3e8e8",
                  border: `2px solid ${done || active ? C.red : C.redMid}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: done ? 14 : 16,
                  color: done ? "#fff" : active ? C.red : C.muted,
                  fontWeight: 700,
                }}
              >
                <AnimatePresence mode="wait">
                  {done ? (
                    <motion.span
                      key="check"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    >✓</motion.span>
                  ) : (
                    <motion.i
                      key="icon"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.15 }}
                      className={`ti ${s.icon}`}
                      style={{ fontSize: 16 }}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
              <span style={{
                fontSize: 9, fontWeight: active ? 700 : 500,
                color: active ? C.red : done ? C.muted : "#c4a4a0",
                letterSpacing: ".04em", textTransform: "uppercase", whiteSpace: "nowrap",
              }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: "0 6px", marginBottom: 20,
                background: done ? C.red : C.redMid, transition: "background .3s",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STEP COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

// Shared section header used across all steps
function SectionHeader({ icon, title, subtitle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 14, borderBottom: `1.5px solid ${C.redMid}` }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 18, color: C.red }} />
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

// Thin divider with label between field groups
function Divider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 16px" }}>
      <div style={{ flex: 1, height: 1, background: C.redMid }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: C.redMid }} />
    </div>
  );
}

function StudentStep({ data, onChange }) {
  const h = (e) => onChange({ ...data, [e.target.name]: e.target.value });

  const statusColors = {
    active:      { bg: "#e8f5e0", color: "#2e7d32", border: "#a5d6a7" },
    inactive:    { bg: "#f5f5f5", color: "#757575", border: "#e0e0e0" },
    transferred: { bg: "#e3f2fd", color: "#1565c0", border: "#90caf9" },
    graduated:   { bg: "#fff8e1", color: "#f57f17", border: "#ffe082" },
    dropped:     { bg: "#fce4ec", color: "#c62828", border: "#f48fb1" },
  };
  const sc = statusColors[data.status] || statusColors.active;

  return (
    <div>
      <SectionHeader icon="ti-user" title="Student Information" subtitle="Basic identity and enrollment details" />

      {/* LRN + Status row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
        <Field label="LRN *">
          <Input name="lrn" value={data.lrn} onChange={h} required placeholder="e.g. 123456789012" />
        </Field>
        <Field label="Enrollment Status">
          <div style={{ position: "relative" }}>
            <Select name="status" value={data.status} onChange={h}
              style={{ paddingLeft: 36, background: sc.bg, borderColor: sc.border, color: sc.color, fontWeight: 700 }}>
              {["active","inactive","transferred","graduated","dropped"].map(s => (
                <option key={s} value={s} style={{ background: "#fff", color: C.dark, fontWeight: 400 }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
            <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, borderRadius: "50%", background: sc.color, pointerEvents: "none" }} />
          </div>
        </Field>
      </div>

      <Divider label="Full Name" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
        <Field label="First Name *">
          <Input name="first_name" value={data.first_name} onChange={h} required placeholder="Juan" />
        </Field>
        <Field label="Middle Name">
          <Input name="middle_name" value={data.middle_name || ""} onChange={h} placeholder="Optional" />
        </Field>
        <Field label="Last Name *">
          <Input name="last_name" value={data.last_name} onChange={h} required placeholder="Dela Cruz" />
        </Field>
        <Field label="Suffix">
          <Input name="suffix" value={data.suffix || ""} onChange={h} placeholder="Jr., Sr., III" />
        </Field>
      </div>

      <Divider label="Personal Details" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
        <Field label="Sex *">
          <Select name="sex" value={data.sex} onChange={h}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Select>
        </Field>
        <Field label="Birth Date *">
          <Input type="date" name="birth_date" value={data.birth_date || ""} onChange={h} required />
        </Field>
        <Field label="Religion">
          <Input name="religion" value={data.religion || ""} onChange={h} placeholder="Optional" />
        </Field>
        <Field label="Mobile Number">
          <Input name="mobile_number" value={data.mobile_number || ""} onChange={h} placeholder="09XXXXXXXXX" />
        </Field>
        <Field label="Email" style={{ gridColumn: "1 / -1" }}>
          <Input type="email" name="email" value={data.email || ""} onChange={h} placeholder="Optional" />
        </Field>
      </div>

      <Divider label="Address" />
      <Field label="Current Address *">
        <Textarea name="current_address" value={data.current_address} onChange={h} required placeholder="House No., Street, Barangay, City" />
      </Field>
      <Field label="Permanent Address *">
        <Textarea name="permanent_address" value={data.permanent_address} onChange={h} required placeholder="Same as current if identical" />
      </Field>
    </div>
  );
}

function HouseholdStep({ data, onChange }) {
  const h = (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    onChange({ ...data, [e.target.name]: val });
  };

  const maritalOptions = [
    { value: "married",       label: "Married",       icon: "ti-heart" },
    { value: "separated",     label: "Separated",     icon: "ti-heart-broken" },
    { value: "annulled",      label: "Annulled",      icon: "ti-x" },
    { value: "single_parent", label: "Single Parent", icon: "ti-user" },
    { value: "widowed",       label: "Widowed",       icon: "ti-star" },
  ];

  const arrangementOptions = [
    { value: "both_parents", label: "Both Parents" },
    { value: "mother_only",  label: "Mother Only" },
    { value: "father_only",  label: "Father Only" },
    { value: "guardian",     label: "Guardian" },
    { value: "relative",     label: "Relative" },
    { value: "independent",  label: "Independent" },
    { value: "others",       label: "Others" },
  ];

  return (
    <div>
      <SectionHeader icon="ti-home" title="Household Information" subtitle="All fields are optional — fill in what's applicable" />

      <Divider label="Parents" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
        <Field label="Parent Marital Status">
          <Select name="parent_marital_status" value={data.parent_marital_status || ""} onChange={h}>
            <option value="">— Select —</option>
            {maritalOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Living Arrangement">
          <Select name="living_arrangement" value={data.living_arrangement || ""} onChange={h}>
            <option value="">— Select —</option>
            {arrangementOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      </div>

      <Divider label="Government Programs" />
      <motion.div
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.1 }}
        onClick={() => onChange({ ...data, is_4ps_beneficiary: !data.is_4ps_beneficiary })}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderRadius: 12, cursor: "pointer", marginBottom: 14,
          border: `1.5px solid ${data.is_4ps_beneficiary ? C.red : C.redMid}`,
          background: data.is_4ps_beneficiary ? C.redLight : C.white,
          transition: "all .15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: data.is_4ps_beneficiary ? C.red : "#f3e8e8", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="ti ti-shield-check" style={{ fontSize: 16, color: data.is_4ps_beneficiary ? "#fff" : C.muted }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>4Ps Beneficiary</div>
            <div style={{ fontSize: 11, color: C.muted }}>Pantawid Pamilyang Pilipino Program</div>
          </div>
        </div>
        <div style={{
          width: 42, height: 24, borderRadius: 99, position: "relative", transition: "background .2s",
          background: data.is_4ps_beneficiary ? C.red : "#e0d0d0",
        }}>
          <div style={{
            position: "absolute", top: 3, left: data.is_4ps_beneficiary ? 21 : 3,
            width: 18, height: 18, borderRadius: "50%", background: "#fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)", transition: "left .2s",
          }} />
        </div>
        <input type="checkbox" name="is_4ps_beneficiary" checked={data.is_4ps_beneficiary} onChange={h} style={{ display: "none" }} />
      </motion.div>

      {data.is_4ps_beneficiary && (
        <Field label="4Ps ID *">
          <Input name="four_ps_id" value={data.four_ps_id || ""} onChange={h} placeholder="Enter 4Ps beneficiary ID" required />
        </Field>
      )}
    </div>
  );
}

function GuardiansStep({ data, onChange }) {
  const add = () => onChange([...data, { ...emptyGuardian }]);
  const remove = (i) => onChange(data.filter((_, idx) => idx !== i));
  const update = (i, field, val) => {
    const next = [...data];
    next[i] = { ...next[i], [field]: val };
    if (field === "is_primary_contact" && val) {
      next.forEach((g, idx) => { if (idx !== i) next[idx] = { ...next[idx], is_primary_contact: false }; });
    }
    onChange(next);
  };

  const relIcons = { mother: "ti-woman", father: "ti-man", guardian: "ti-user-shield" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 0 }}>
        <SectionHeader icon="ti-users" title="Guardians" subtitle={`${data.length} guardian${data.length !== 1 ? "s" : ""} added`} />
        <button style={{ ...btnGhost, marginBottom: 20, flexShrink: 0 }} onClick={add} type="button">
          <i className="ti ti-plus" style={{ fontSize: 13 }} /> Add Guardian
        </button>
      </div>

      {data.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.muted }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <i className="ti ti-users" style={{ fontSize: 26, color: "#e8a0a0" }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No guardians added yet</div>
          <div style={{ fontSize: 12 }}>Click "Add Guardian" to add a parent or guardian.</div>
        </div>
      )}

      <AnimatePresence>
      {data.map((g, i) => (
        <motion.div
          key={g.guardian_id ?? `new-${i}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          style={{ marginBottom: 14 }}
        >
        <div style={{ ...cardStyle, marginBottom: 0, position: "relative", overflow: "hidden" }}>
          {/* colored left accent */}
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: g.is_primary_contact ? C.red : C.redMid, borderRadius: "16px 0 0 16px" }} />
          <div style={{ paddingLeft: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className={`ti ${relIcons[g.relationship] || "ti-user"}`} style={{ fontSize: 17, color: C.red }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>
                    {g.full_name || `Guardian ${i + 1}`}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, textTransform: "capitalize" }}>
                    {g.relationship}{g.guardian_id ? " · saved" : " · new"}
                    {g.is_primary_contact && <span style={{ marginLeft: 6, color: C.red, fontWeight: 700 }}>· Primary</span>}
                  </div>
                </div>
              </div>
              <button style={btnDanger} onClick={() => remove(i)} type="button">
                <i className="ti ti-trash" style={{ fontSize: 12 }} /> Remove
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
              <Field label="Full Name *">
                <Input value={g.full_name} onChange={e => update(i, "full_name", e.target.value)} required placeholder="Full name" />
              </Field>
              <Field label="Relationship *">
                <Select value={g.relationship} onChange={e => update(i, "relationship", e.target.value)}>
                  <option value="mother">Mother</option>
                  <option value="father">Father</option>
                  <option value="guardian">Guardian</option>
                </Select>
              </Field>
              <Field label="Occupation">
                <Input value={g.occupation || ""} onChange={e => update(i, "occupation", e.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Mobile Number">
                <Input value={g.mobile_number || ""} onChange={e => update(i, "mobile_number", e.target.value)} placeholder="09XXXXXXXXX" />
              </Field>
              <Field label="Email Address" style={{ gridColumn: "1 / -1" }}>
                <Input type="email" value={g.email_address || ""} onChange={e => update(i, "email_address", e.target.value)} placeholder="Optional" />
              </Field>
            </div>

            <motion.div
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.1 }}
              onClick={() => update(i, "is_primary_contact", !g.is_primary_contact)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, marginTop: 10,
                padding: "8px 14px", borderRadius: 99, cursor: "pointer",
                border: `1.5px solid ${g.is_primary_contact ? C.red : C.redMid}`,
                background: g.is_primary_contact ? C.redLight : C.white,
                fontSize: 12, fontWeight: 700,
                color: g.is_primary_contact ? C.red : C.muted,
                transition: "all .15s",
              }}
            >
              <AnimatePresence mode="wait">
                <motion.i
                  key={g.is_primary_contact ? "filled" : "empty"}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  className={`ti ${g.is_primary_contact ? "ti-star-filled" : "ti-star"}`}
                  style={{ fontSize: 13 }}
                />
              </AnimatePresence>
              {g.is_primary_contact ? "Primary Contact" : "Set as Primary Contact"}
            </motion.div>
          </div>
        </div>
        </motion.div>
      ))}
      </AnimatePresence>
    </div>
  );
}

function SiblingsStep({ data, onChange }) {
  const add = () => onChange([...data, { ...emptySibling }]);
  const remove = (i) => onChange(data.filter((_, idx) => idx !== i));
  const update = (i, field, val) => {
    const next = [...data];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionHeader icon="ti-friends" title="Siblings" subtitle={`${data.length} sibling${data.length !== 1 ? "s" : ""} added`} />
        <button style={{ ...btnGhost, marginBottom: 20, flexShrink: 0 }} onClick={add} type="button">
          <i className="ti ti-plus" style={{ fontSize: 13 }} /> Add Sibling
        </button>
      </div>

      {data.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.muted }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <i className="ti ti-friends" style={{ fontSize: 26, color: "#e8a0a0" }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No siblings added</div>
          <div style={{ fontSize: 12 }}>Click "Add Sibling" if applicable.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <AnimatePresence>
        {data.map((s, i) => (
          <motion.div
            key={s.sibling_id ?? `new-sib-${i}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
          <div style={{ display: "flex", alignItems: "center", gap: 14, background: C.white, border: `1.5px solid ${C.redMid}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: C.red }}>
              {i + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Input
                value={s.full_name}
                onChange={e => update(i, "full_name", e.target.value)}
                required
                placeholder={`Sibling ${i + 1} full name`}
                style={{ marginBottom: 0 }}
              />
            </div>
            <div style={{ width: 90, flexShrink: 0 }}>
              <Input
                type="number" min="0" max="100"
                value={s.age || ""}
                onChange={e => update(i, "age", e.target.value)}
                placeholder="Age"
              />
            </div>
            <button style={{ ...btnDanger, flexShrink: 0 }} onClick={() => remove(i)} type="button">
              <i className="ti ti-x" style={{ fontSize: 12 }} />
            </button>
          </div>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SchoolsStep({ data, onChange }) {
  const add = () => onChange([...data, { ...emptySchool }]);
  const remove = (i) => onChange(data.filter((_, idx) => idx !== i));
  const update = (i, field, val) => {
    const next = [...data];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionHeader icon="ti-school" title="Previous Schools" subtitle={`${data.length} school${data.length !== 1 ? "s" : ""} added`} />
        <button style={{ ...btnGhost, marginBottom: 20, flexShrink: 0 }} onClick={add} type="button">
          <i className="ti ti-plus" style={{ fontSize: 13 }} /> Add School
        </button>
      </div>

      {data.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.muted }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <i className="ti ti-school" style={{ fontSize: 26, color: "#e8a0a0" }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No previous schools added</div>
          <div style={{ fontSize: 12 }}>Add any schools the student previously attended.</div>
        </div>
      )}

      <AnimatePresence>
      {data.map((s, i) => (
        <motion.div
          key={s.previous_school_id ?? `new-sch-${i}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          style={{ marginBottom: 14 }}
        >
        <div style={{ ...cardStyle, marginBottom: 0, overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: C.red, borderRadius: "16px 0 0 16px" }} />
          <div style={{ paddingLeft: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: C.redLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className="ti ti-building-community" style={{ fontSize: 16, color: C.red }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{s.school_name || `School ${i + 1}`}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{s.previous_school_id ? "Saved record" : "New entry"}</div>
                </div>
              </div>
              <button style={btnDanger} onClick={() => remove(i)} type="button">
                <i className="ti ti-trash" style={{ fontSize: 12 }} /> Remove
              </button>
            </div>
            <Field label="School Name *">
              <Input value={s.school_name} onChange={e => update(i, "school_name", e.target.value)} required placeholder="Full school name" />
            </Field>
            <Field label="School Address *">
              <Textarea value={s.school_address} onChange={e => update(i, "school_address", e.target.value)} required placeholder="Full address of the school" />
            </Field>
          </div>
        </div>
        </motion.div>
      ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Documents step helpers (mirrors RequirementsPage design) ────────────────

const REQ_ICONS = {
  birth_certificate:          "ti-certificate",
  form_138:                   "ti-file-description",
  certificate_good_moral:     "ti-rosette",
  ncae_result:                "ti-chart-bar",
  esc_completers:             "ti-school",
  certificate_non_sf9:        "ti-file-check",
  recommendation_letter:      "ti-mail",
  clearance_previous_school:  "ti-building",
  psa_birth_certificate:      "ti-id",
  health_record:              "ti-heart-rate-monitor",
  alien_certificate:          "ti-world",
  form_137_or_138:            "ti-files",
  esc_transferee_qc:          "ti-arrows-transfer",
};
const reqIcon = (code) => REQ_ICONS[code] || "ti-file";
const isImageUrl = (url) => url && /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url);

const DC = {
  green: "#2e7d32", greenLight: "#e8f5e0", greenBorder: "#a5d6a7",
  border: "#f5eaea", softBorder: "#f9f0f0", pale: "#b09090",
};

function DocStatusBadge({ submitted }) {
  return submitted ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 99, padding: "3px 9px", background: DC.greenLight, color: DC.green, fontSize: 11, fontWeight: 700, border: `1px solid ${DC.greenBorder}` }}>
      <i className="ti ti-circle-check" style={{ fontSize: 12 }} />Submitted
    </span>
  ) : (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 99, padding: "3px 9px", background: "#f5f5f5", color: "#888", fontSize: 11, fontWeight: 700, border: "1px solid #e0e0e0" }}>
      <i className="ti ti-clock" style={{ fontSize: 12 }} />Pending
    </span>
  );
}

function DocRemoveModal({ name, onConfirm, onCancel }) {
  return (
    <ConfirmModal
      icon="ti-trash"
      title="Remove document?"
      message={<>You're about to remove <strong style={{ color: C.dark }}>{name}</strong>. This cannot be undone.</>}
      confirmLabel="Yes, remove"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

function DocUploadModal({ req, isEdit, pendingEntry, onClose, onFileSelected }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [remarks, setRemarks] = useState("");
  const fileInputRef = useRef(null);
  const isReplace = isEdit && !!req?.submission_id;
  const currentImageUrl = isReplace && req.image_url ? resolveMediaUrl(req.image_url) : null;
  const hasPending = !isEdit && !!pendingEntry;

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(f);
    } else { setPreview(null); }
  }

  function handleDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(f);
    } else { setPreview(null); }
  }

  function handleConfirm() {
    if (!file) return;
    onFileSelected(req.requirement_type_id, req.requirement_code, req.requirement_name, file, remarks);
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1099, padding: 16 }}>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(26,10,10,0.45)", backdropFilter: "blur(4px)" }}
      />
      <motion.div
        variants={modalVariants} initial="hidden" animate="visible" exit="exit"
        transition={springTransition}
        style={{ position: "relative", background: C.white, borderRadius: 20, width: "100%", maxWidth: 500, boxShadow: "0 24px 64px rgba(224,49,49,0.15)", display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden" }}
      >
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${DC.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>
              {isReplace ? "Replace" : hasPending ? "Replace" : "Upload"} Document
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{req?.requirement_name}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: `1px solid ${DC.border}`, borderRadius: 8, background: C.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
            <i className="ti ti-x" style={{ fontSize: 14 }} />
          </button>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {currentImageUrl && !preview && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Current File</div>
              <img src={currentImageUrl} alt="current" style={{ width: "100%", maxHeight: 160, objectFit: "contain", borderRadius: 10, border: `1px solid ${DC.border}`, background: "#fafafa" }} />
            </div>
          )}
          {hasPending && pendingEntry.previewUrl && !preview && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Current File</div>
              {pendingEntry.file.type.startsWith("image/") ? (
                <img src={pendingEntry.previewUrl} alt="current" style={{ width: "100%", maxHeight: 160, objectFit: "contain", borderRadius: 10, border: `1px solid ${DC.border}`, background: "#fafafa" }} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: `1px solid ${DC.border}`, borderRadius: 10, background: "#fafafa" }}>
                  <i className="ti ti-file-description" style={{ fontSize: 22, color: C.red }} />
                  <span style={{ fontSize: 13, color: C.dark, fontWeight: 600 }}>{pendingEntry.file.name}</span>
                </div>
              )}
            </div>
          )}

          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            style={{ border: `2px dashed ${file ? C.redBorder : "#e0d0d0"}`, borderRadius: 12, padding: "24px 16px", textAlign: "center", cursor: "pointer", background: file ? C.redLight : "#fafafa", transition: "all 0.15s" }}
          >
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" capture="environment" style={{ display: "none" }} onChange={handleFileChange} />
            {preview ? (
              <img src={preview} alt="preview" style={{ maxHeight: 180, maxWidth: "100%", objectFit: "contain", borderRadius: 8 }} />
            ) : file ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <i className="ti ti-file-description" style={{ fontSize: 32, color: C.red }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{file.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>Click to change file</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <i className="ti ti-cloud-upload" style={{ fontSize: 32, color: "#c0a0a0" }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>
                  {isReplace || hasPending ? "Drop new file or click to browse" : "Drop file here or click to browse"}
                </div>
                <div style={{ fontSize: 11, color: DC.pale }}>Images (JPG, PNG, GIF) or PDF</div>
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
              Remarks <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span>
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Add any notes about this document…"
              style={{ width: "100%", border: `1.5px solid ${C.redMid}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "'DM Sans', sans-serif", resize: "vertical", outline: "none", color: C.dark, background: "#fffbfb", boxSizing: "border-box" }}
            />
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: `1px solid ${DC.border}`, display: "flex", gap: 10 }}>
          <motion.button whileTap={{ scale: 0.97 }} onClick={onClose} style={{ flex: 1, height: 42, border: `1.5px solid ${C.redMid}`, borderRadius: 10, background: C.white, fontSize: 13, color: C.muted, cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>Cancel</motion.button>
          <motion.button
            whileTap={file ? { scale: 0.97 } : {}}
            onClick={handleConfirm}
            disabled={!file}
            style={{ flex: 2, height: 42, border: "none", borderRadius: 10, background: !file ? "#f0dada" : C.red, color: !file ? C.muted : C.white, fontSize: 13, fontWeight: 700, cursor: !file ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <i className="ti ti-upload" style={{ fontSize: 14 }} />
            {isReplace || hasPending ? "Replace Document" : "Upload Document"}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

function DocViewModal({ url, name, onClose }) {
  const isPdf = /\.pdf(\?.*)?$/i.test(url);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: 24 }} onClick={onClose}>
      <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: "absolute", top: -14, right: -14, width: 36, height: 36, borderRadius: "50%", background: C.white, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.3)", zIndex: 1 }}>
          <i className="ti ti-x" style={{ fontSize: 16, color: C.dark }} />
        </button>
        {isPdf
          ? <iframe src={url} title={name} style={{ width: "80vw", height: "80vh", border: "none", borderRadius: 12 }} />
          : <img src={url} alt={name} style={{ maxWidth: "86vw", maxHeight: "86vh", objectFit: "contain", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} />
        }
        <div style={{ position: "absolute", bottom: -32, left: 0, right: 0, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{name}</div>
      </div>
    </div>
  );
}

function DocCard({ req, pendingEntry, isEdit, onUpload, onView, onRemove, ocrState, ocrConfidence, ocrFieldCount, onApplyOcr, onDiscardOcr }) {
  const CONF_DOT = { high: DC.green, medium: "#b7791f", low: "#b91c1c" };
  const icon = reqIcon(req.requirement_code);

  const resolvedUrl = isEdit
    ? resolveMediaUrl(req.image_url)
    : (pendingEntry?.previewUrl || null);

  const hasImage = isEdit
    ? (req.is_submitted && resolvedUrl && isImageUrl(req.image_url))
    : (pendingEntry && pendingEntry.file?.type.startsWith("image/") && pendingEntry.previewUrl);

  const isSubmitted = isEdit ? req.is_submitted : !!pendingEntry;
  const isScanningOcr = ocrState === "scanning";

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: isSubmitted ? "0 4px 20px rgba(46,125,50,0.14)" : "0 4px 20px rgba(224,49,49,0.10)" }}
      transition={{ duration: 0.15 }}
      style={{
        background: C.white,
        border: `1.5px solid ${isSubmitted ? DC.greenBorder : DC.border}`,
        borderRadius: 16,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: isSubmitted ? "0 2px 16px rgba(46,125,50,0.08)" : "0 2px 12px rgba(224,49,49,0.05)",
      }}
    >
      <div style={{ height: 4, background: isSubmitted ? `linear-gradient(90deg,${DC.green},#43a047)` : `linear-gradient(90deg,#e0d0d0,#f0e4e4)` }} />

      <div
        style={{ height: 120, background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderBottom: `1px solid ${DC.softBorder}`, cursor: (hasImage && !isScanningOcr) ? "pointer" : "default" }}
        onClick={() => hasImage && !isScanningOcr && onView(resolvedUrl, req.requirement_name)}
      >
        {isScanningOcr ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <i className="ti ti-loader-2" style={{ fontSize: 28, color: C.red, animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 11, color: C.muted }}>Scanning…</span>
          </div>
        ) : hasImage ? (
          <img src={resolvedUrl} alt={req.requirement_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : isSubmitted ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <i className="ti ti-file-check" style={{ fontSize: 34, color: DC.green }} />
            <span style={{ fontSize: 11, color: DC.green, fontWeight: 600 }}>Document on file</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <i className={`ti ${icon}`} style={{ fontSize: 34, color: "#c8b0b0" }} />
            <span style={{ fontSize: 11, color: DC.pale }}>No document yet</span>
          </div>
        )}
      </div>

      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, lineHeight: 1.35 }}>{req.requirement_name}</div>
          <DocStatusBadge submitted={isSubmitted} />
        </div>
        {ocrState === "done" && ocrConfidence && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: CONF_DOT[ocrConfidence] }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: CONF_DOT[ocrConfidence] }} />
            OCR: {ocrConfidence} confidence — applied to form
          </div>
        )}
        {ocrState === "error" && (
          <div style={{ fontSize: 11, color: "#b91c1c", display: "flex", alignItems: "center", gap: 4 }}>
            <i className="ti ti-alert-circle" style={{ fontSize: 12 }} />OCR failed — form not auto-filled
          </div>
        )}
        {ocrState === "review" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: CONF_DOT[ocrConfidence] || C.muted }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: CONF_DOT[ocrConfidence] || DC.pale }} />
              OCR found {ocrFieldCount} field{ocrFieldCount !== 1 ? "s" : ""} ({ocrConfidence} confidence) — review before applying
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={onDiscardOcr}
                style={{ flex: 1, height: 30, border: `1px solid ${DC.border}`, borderRadius: 8, background: C.white, color: C.muted, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Discard
              </button>
              <button type="button" onClick={onApplyOcr}
                style={{ flex: 1, height: 30, border: "none", borderRadius: 8, background: C.red, color: C.white, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Apply to form
              </button>
            </div>
          </div>
        )}
        {isEdit && req.submitted_at && (
          <div style={{ fontSize: 10.5, color: DC.pale, marginTop: 2 }}>
            <i className="ti ti-calendar" style={{ fontSize: 11 }} />{" "}
            {new Date(req.submitted_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })}
          </div>
        )}
      </div>

      <div style={{ padding: "0 16px 14px", display: "flex", gap: 8 }}>
        {isSubmitted ? (
          <>
            {hasImage && !isScanningOcr && (
              <button onClick={() => onView(resolvedUrl, req.requirement_name)}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, padding: "0 12px", border: `1px solid ${DC.border}`, borderRadius: 8, background: C.white, color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                <i className="ti ti-eye" style={{ fontSize: 13 }} />View
              </button>
            )}
            <button onClick={() => onUpload(req)}
              style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, padding: "0 12px", border: `1px solid ${DC.border}`, borderRadius: 8, background: C.white, color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              <i className="ti ti-replace" style={{ fontSize: 13 }} />Replace
            </button>
            <button onClick={() => onRemove(req)} title="Remove"
              style={{ width: 34, height: 34, border: `1px solid ${C.redMid}`, borderRadius: 8, background: C.white, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.red, flexShrink: 0 }}>
              <i className="ti ti-trash" style={{ fontSize: 13 }} />
            </button>
          </>
        ) : (
          <button onClick={() => onUpload(req)}
            style={{ flex: 1, height: 34, border: "none", borderRadius: 8, background: C.red, color: C.white, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <i className="ti ti-upload" style={{ fontSize: 13 }} />Upload Document
          </button>
        )}
      </div>
    </motion.div>
  );
}

function DocumentsStep({
  isEdit, requirementTypes,
  pendingUploads, setPendingUploads,
  existingDocs, setExistingDocs,
  ocrStates, setOcrStates,
  studentId, onOcrExtracted, onViewDoc,
}) {
  const [uploadModal, setUploadModal] = useState(null);
  const [removeModal, setRemoveModal] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [docError, setDocError] = useState("");

  async function handleFileSelected(reqTypeId, reqCode, reqName, file, remarks) {
    const previewUrl = URL.createObjectURL(file);
    const isImage = file.type.startsWith("image/");

    async function runOcr() {
      try {
        const token = sessionStorage.getItem("access_token");
        const data = await scanDocument(file, token);
        if (data.success) {
          setOcrStates((prev) => ({
            ...prev,
            [reqTypeId]: { state: "review", confidence: data.confidence, extracted: data.extracted },
          }));
        } else {
          setOcrStates((prev) => ({ ...prev, [reqTypeId]: { state: "error", confidence: null, extracted: null } }));
        }
      } catch {
        setOcrStates((prev) => ({ ...prev, [reqTypeId]: { state: "error", confidence: null, extracted: null } }));
      }
    }

    if (!isEdit) {
      setOcrStates((prev) => ({ ...prev, [reqTypeId]: { state: isImage ? "scanning" : "idle", confidence: null, extracted: null } }));
      setPendingUploads((prev) => {
        const old = prev.find((p) => p.requirementTypeId === reqTypeId);
        if (old) URL.revokeObjectURL(old.previewUrl);
        return [
          ...prev.filter((p) => p.requirementTypeId !== reqTypeId),
          { requirementTypeId: reqTypeId, requirementCode: reqCode, requirementName: reqName, file, previewUrl, remarks: remarks || "" },
        ];
      });

      if (isImage) await runOcr();
    } else {
      setEditLoading(true);
      setDocError("");
      if (isImage) {
        setOcrStates((prev) => ({ ...prev, [reqTypeId]: { state: "scanning", confidence: null, extracted: null } }));
      }
      try {
        const existingEntry = existingDocs.find((d) => d.requirement_type_id === reqTypeId);
        if (existingEntry?.submission_id) {
          await replaceRequirement({ submissionId: existingEntry.submission_id, file, remarks });
        } else {
          await uploadRequirement({ studentId, requirementTypeId: reqTypeId, file, remarks });
        }
        const refreshed = await fetchRequirementSummary(studentId);
        setExistingDocs(Array.isArray(refreshed) ? refreshed : []);
      } catch (err) {
        setDocError(err?.message || "Upload failed. Please try again.");
      } finally {
        setEditLoading(false);
      }

      if (isImage) await runOcr();
      URL.revokeObjectURL(previewUrl);
    }
  }

  // Apply/discard gate: a successful scan lands in "review" state with the
  // extracted fields stashed, not applied yet -- the user must explicitly
  // confirm before form fields are overwritten.
  function handleApplyOcr(reqTypeId) {
    const entry = ocrStates[reqTypeId];
    if (!entry?.extracted) return;
    onOcrExtracted(entry.extracted);
    setOcrStates((prev) => ({ ...prev, [reqTypeId]: { ...entry, state: "done" } }));
  }

  function handleDiscardOcr(reqTypeId) {
    setOcrStates((prev) => ({ ...prev, [reqTypeId]: { ...prev[reqTypeId], state: "discarded" } }));
  }

  async function handleRemoveConfirm() {
    if (!removeModal) return;
    const req = removeModal;
    setRemoveModal(null);
    if (!isEdit) {
      setPendingUploads((prev) => {
        const old = prev.find((p) => p.requirementTypeId === req.requirement_type_id);
        if (old) URL.revokeObjectURL(old.previewUrl);
        return prev.filter((p) => p.requirementTypeId !== req.requirement_type_id);
      });
      setOcrStates((prev) => { const n = { ...prev }; delete n[req.requirement_type_id]; return n; });
    } else {
      if (req.submission_id) {
        try {
          await removeRequirement(req.submission_id);
          const refreshed = await fetchRequirementSummary(studentId);
          setExistingDocs(Array.isArray(refreshed) ? refreshed : []);
        } catch (err) {
          setDocError(err?.message || "Could not remove document. Please try again.");
        }
      }
    }
  }

  // Merge requirementTypes with existing/pending data into a unified list
  const cards = requirementTypes.map((rt) => {
    if (isEdit) {
      const existing = existingDocs.find((d) => d.requirement_type_id === rt.requirement_type_id);
      return existing
        ? { ...existing }
        : { requirement_type_id: rt.requirement_type_id, requirement_code: rt.requirement_code, requirement_name: rt.requirement_name, is_submitted: false, image_url: null, submission_id: null };
    } else {
      const pending = pendingUploads.find((p) => p.requirementTypeId === rt.requirement_type_id);
      return {
        requirement_type_id: rt.requirement_type_id,
        requirement_code: rt.requirement_code,
        requirement_name: rt.requirement_name,
        is_submitted: !!pending,
        image_url: null,
        submission_id: null,
        _pending: pending || null,
      };
    }
  });

  const submitted = cards.filter((c) => c.is_submitted).length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h3 style={{ color: C.dark, margin: 0 }}>Requirement Documents</h3>
          <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>
            Upload student documents — OCR will auto-fill form fields from images.
          </p>
        </div>
        {cards.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ height: 8, width: 100, borderRadius: 99, background: C.redMid, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${cards.length ? (submitted / cards.length) * 100 : 0}%`, background: DC.green, borderRadius: 99, transition: "width 0.4s" }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: DC.green }}>{submitted}/{cards.length}</span>
          </div>
        )}
      </div>

      {editLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: C.redLight, borderRadius: 10, marginBottom: 16, fontSize: 13, color: C.red }}>
          <i className="ti ti-loader-2" style={{ animation: "spin 0.8s linear infinite" }} />Uploading document…
        </div>
      )}

      {docError && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, marginBottom: 16, fontSize: 13, color: "#b91c1c" }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 15, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{docError}</span>
          <button type="button" onClick={() => setDocError("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", padding: 0 }}>
            <i className="ti ti-x" style={{ fontSize: 13 }} />
          </button>
        </div>
      )}

      {requirementTypes.length === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: DC.pale }}>
          <i className="ti ti-file-search" style={{ fontSize: 36, display: "block", marginBottom: 12 }} />
          No requirement types configured.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {cards.map((req) => {
            const ocr = ocrStates[req.requirement_type_id] || { state: "idle", confidence: null, extracted: null };
            return (
              <DocCard
                key={req.requirement_type_id}
                req={req}
                pendingEntry={req._pending || null}
                isEdit={isEdit}
                onUpload={(r) => setUploadModal(r)}
                onView={(url, name) => onViewDoc(url, name)}
                onRemove={(r) => setRemoveModal(r)}
                ocrState={ocr.state}
                ocrConfidence={ocr.confidence}
                ocrFieldCount={ocr.extracted ? Object.keys(ocr.extracted).length : 0}
                onApplyOcr={() => handleApplyOcr(req.requirement_type_id)}
                onDiscardOcr={() => handleDiscardOcr(req.requirement_type_id)}
              />
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {uploadModal && (
          <DocUploadModal
            key="upload-modal"
            req={uploadModal}
            isEdit={isEdit}
            studentId={studentId}
            pendingEntry={pendingUploads.find((p) => p.requirementTypeId === uploadModal.requirement_type_id) || null}
            onClose={() => setUploadModal(null)}
            onFileSelected={(tid, code, name, file, remarks) => {
              handleFileSelected(tid, code, name, file, remarks);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {removeModal && (
          <DocRemoveModal
            key="remove-modal"
            name={removeModal.requirement_name}
            onConfirm={handleRemoveConfirm}
            onCancel={() => setRemoveModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ReviewStepRow({ label, value }) {
  return value ? (
    <div style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: `1px solid ${C.redMid}` }}>
      <span style={{ width: 150, fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 13, color: C.dark, lineHeight: 1.5 }}>{value}</span>
    </div>
  ) : null;
}

function ReviewStepSection({ icon, title, children }) {
  return (
    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.redMid}`, marginBottom: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", borderBottom: `1px solid ${C.redMid}`, background: C.redLight }}>
        <i className={`ti ${icon}`} style={{ fontSize: 15, color: C.red }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{title}</span>
      </div>
      <div style={{ padding: "4px 18px 10px" }}>{children}</div>
    </div>
  );
}

function ReviewStep({ student, household, guardians, siblings, schools, pendingUploads = [], existingDocs = [], isEdit = false }) {
  const Row = ReviewStepRow;
  const Section = ReviewStepSection;

  const statusColors = { active: "#2e7d32", inactive: "#757575", transferred: "#1565c0", graduated: "#f57f17", dropped: "#c62828" };

  return (
    <div>
      <SectionHeader icon="ti-clipboard-check" title="Review & Submit" subtitle="Check all information before submitting" />

      <Section icon="ti-user" title="Student Information">
        <Row label="LRN" value={student.lrn} />
        <Row label="Full Name" value={`${student.first_name} ${student.middle_name || ""} ${student.last_name} ${student.suffix || ""}`.trim()} />
        <Row label="Sex" value={student.sex?.charAt(0).toUpperCase() + student.sex?.slice(1)} />
        <Row label="Birth Date" value={student.birth_date} />
        <Row label="Religion" value={student.religion} />
        <Row label="Email" value={student.email} />
        <Row label="Mobile" value={student.mobile_number} />
        <Row label="Status" value={
          <span style={{ color: statusColors[student.status] || C.dark, fontWeight: 700, textTransform: "capitalize" }}>{student.status}</span>
        } />
        <Row label="Current Address" value={student.current_address} />
        <Row label="Permanent Address" value={student.permanent_address} />
      </Section>

      {(household.parent_marital_status || household.living_arrangement || household.is_4ps_beneficiary) && (
        <Section icon="ti-home" title="Household Information">
          <Row label="Marital Status" value={household.parent_marital_status?.replace(/_/g, " ")} />
          <Row label="Living With" value={household.living_arrangement?.replace(/_/g, " ")} />
          <Row label="4Ps Beneficiary" value={household.is_4ps_beneficiary ? "Yes" : "No"} />
          <Row label="4Ps ID" value={household.four_ps_id} />
        </Section>
      )}

      {guardians.length > 0 && (
        <Section icon="ti-users" title={`Guardians (${guardians.length})`}>
          {guardians.map((g, i) => (
            <div key={i} style={{ paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0, borderTop: i > 0 ? `1px dashed ${C.redMid}` : "none" }}>
              <Row label="Name" value={<span style={{ fontWeight: 700 }}>{g.full_name}{g.is_primary_contact && <span style={{ marginLeft: 8, fontSize: 11, color: C.red, fontWeight: 700 }}>★ Primary</span>}</span>} />
              <Row label="Relationship" value={g.relationship?.charAt(0).toUpperCase() + g.relationship?.slice(1)} />
              <Row label="Occupation" value={g.occupation} />
              <Row label="Mobile" value={g.mobile_number} />
              <Row label="Email" value={g.email_address} />
            </div>
          ))}
        </Section>
      )}

      {siblings.length > 0 && (
        <Section icon="ti-friends" title={`Siblings (${siblings.length})`}>
          {siblings.map((s, i) => (
            <Row key={i} label={`Sibling ${i + 1}`} value={`${s.full_name}${s.age ? `, age ${s.age}` : ""}`} />
          ))}
        </Section>
      )}

      {schools.length > 0 && (
        <Section icon="ti-school" title={`Previous Schools (${schools.length})`}>
          {schools.map((s, i) => (
            <div key={i} style={{ paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0, borderTop: i > 0 ? `1px dashed ${C.redMid}` : "none" }}>
              <Row label={`School ${i + 1}`} value={<span style={{ fontWeight: 700 }}>{s.school_name}</span>} />
              <Row label="Address" value={s.school_address} />
            </div>
          ))}
        </Section>
      )}

      {(() => {
        const docList = isEdit ? existingDocs.filter((d) => d.is_submitted) : pendingUploads;
        return docList.length > 0 ? (
          <Section icon="ti-file-check" title={`Documents (${docList.length})`}>
            {docList.map((d, i) => (
              <Row key={i} label={`Document ${i + 1}`} value={isEdit ? d.requirement_name : d.requirementName} />
            ))}
          </Section>
        ) : null;
      })()}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DEBUG AUTOFILL  (only active in dev — stripped from production builds)
// ════════════════════════════════════════════════════════════════════════════

const DEV_FIRST_NAMES = ["Juan", "Maria", "Jose", "Ana", "Carlo", "Liza", "Mark", "Rosa", "Luis", "Nina"];
const DEV_MIDDLE_NAMES = ["Santos", "Reyes", "Cruz", "Garcia", "Lopez", "Gomez", "Torres", "Flores"];
const DEV_LAST_NAMES = ["Dela Cruz", "Ramos", "Fernandez", "Villanueva", "Aquino", "Bautista", "Mendoza", "Castillo"];
const DEV_RELIGIONS = ["Roman Catholic", "Iglesia ni Cristo", "Islam", "Born Again Christian", "Seventh Day Adventist"];
const DEV_BARANGAYS = ["Barangay Sta. Cruz", "Barangay San Jose", "Barangay Poblacion", "Barangay Bagong Lipunan", "Barangay Mabuhay"];
const DEV_CITIES = ["Quezon City", "Manila", "Pasig", "Marikina", "Caloocan"];
const DEV_SCHOOLS = ["Rizal Elementary School", "Mabini National High School", "San Jose Primary School", "Bonifacio Academy", "Katipunan Elementary School"];
const DEV_OCCUPATIONS = ["Teacher", "Engineer", "Nurse", "Driver", "Vendor", "Overseas Worker", "Farmer"];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function genDevData() {
  const rnd2 = () => String(Math.floor(Math.random() * 90) + 10);
  const lrn = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
  const mobile = "09" + Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");

  // Age between 6 and 18
  const ageYears = 6 + Math.floor(Math.random() * 13);
  const bDate = new Date();
  bDate.setFullYear(bDate.getFullYear() - ageYears);
  bDate.setMonth(Math.floor(Math.random() * 12));
  bDate.setDate(1 + Math.floor(Math.random() * 28));
  const birth_date = bDate.toISOString().slice(0, 10);

  const city = pick(DEV_CITIES);
  const brgy = pick(DEV_BARANGAYS);
  const address = `${rnd2()} ${brgy}, ${city}`;

  const firstName = pick(DEV_FIRST_NAMES);
  const lastName = pick(DEV_LAST_NAMES);

  const student = {
    lrn,
    first_name: firstName,
    middle_name: pick(DEV_MIDDLE_NAMES),
    last_name: lastName,
    suffix: "",
    sex: Math.random() > 0.5 ? "male" : "female",
    birth_date,
    religion: pick(DEV_RELIGIONS),
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s/g, "")}@email.com`,
    mobile_number: mobile,
    current_address: address,
    permanent_address: address,
    status: "active",
  };

  const household = {
    parent_marital_status: pick(["married", "single_parent", "separated", "widowed"]),
    living_arrangement: pick(["both_parents", "mother_only", "father_only", "guardian"]),
    is_4ps_beneficiary: false,
    four_ps_id: "",
  };

  const guardianMobile = "09" + Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");
  const gFirst = pick(DEV_FIRST_NAMES);
  const gLast = lastName;
  const guardians = [{
    relationship: pick(["mother", "father", "guardian"]),
    full_name: `${gFirst} ${gLast}`,
    occupation: pick(DEV_OCCUPATIONS),
    email_address: `${gFirst.toLowerCase()}.${gLast.toLowerCase().replace(/\s/g, "")}@email.com`,
    mobile_number: guardianMobile,
    is_primary_contact: true,
  }];

  const sibFirst = pick(DEV_FIRST_NAMES);
  const siblings = [{
    full_name: `${sibFirst} ${lastName}`,
    age: String(2 + Math.floor(Math.random() * 16)),
  }];

  const schools = [{
    school_name: pick(DEV_SCHOOLS),
    school_address: `${pick(DEV_BARANGAYS)}, ${pick(DEV_CITIES)}`,
  }];

  return { student, household, guardians, siblings, schools };
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function StudentFormPage() {
  usePageTitle("Student Form");
  const { id } = useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [student, setStudent] = useState(emptyStudent);
  const [household, setHousehold] = useState(emptyHousehold);
  const [guardians, setGuardians] = useState([]);
  const [siblings, setSiblings] = useState([]);
  const [schools, setSchools] = useState([]);

  // ── Documents step ──────────────────────────────────────────────────────────
  const [requirementTypes, setRequirementTypes] = useState([]);
  const [existingDocs,     setExistingDocs]     = useState([]);
  const [pendingUploads,   setPendingUploads]   = useState([]);
  const [docViewModal,     setDocViewModal]     = useState(null); // { url, name }
  // Lifted (not local to DocumentsStep) so a pending OCR review survives the
  // user navigating to another step and back -- DocumentsStep unmounts when
  // step !== 0, which would otherwise silently drop the stashed extraction.
  const [ocrStates,        setOcrStates]        = useState({}); // { [reqTypeId]: { state, confidence, extracted } }

  // Track which existing records were removed in edit mode (so we can DELETE them on submit)
  const [removedGuardianIds, setRemovedGuardianIds] = useState([]);
  const [removedSiblingIds, setRemovedSiblingIds] = useState([]);
  const [removedSchoolIds, setRemovedSchoolIds] = useState([]);

  // Track the original household id (if any) so we know whether to PUT or POST
  const [householdId, setHouseholdId] = useState(null);

  const DRAFT_KEY = "student_form_draft";
  const isNewStudent = !id;

  // ── Draft persistence (new student only) ─────────────────────────────────────
  // Restore draft on mount
  useEffect(() => {
    if (!isNewStudent) return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.student)   setStudent(draft.student);
      if (draft.household) setHousehold(draft.household);
      if (draft.guardians) setGuardians(draft.guardians);
      if (draft.siblings)  setSiblings(draft.siblings);
      if (draft.schools)   setSchools(draft.schools);
      if (draft.step != null) setStep(draft.step);
    } catch { /* ignore corrupted draft */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save draft whenever form data changes
  useEffect(() => {
    if (!isNewStudent) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ student, household, guardians, siblings, schools, step }));
    } catch { /* ignore quota errors */ }
  }, [student, household, guardians, siblings, schools, step, isNewStudent]);

  function clearDraft() {
    sessionStorage.removeItem(DRAFT_KEY);
  }

  function handleOcrExtracted(fields) {
    const studentFields = {
      lrn:               fields.lrn,
      first_name:        fields.first_name,
      middle_name:       fields.middle_name,
      last_name:         fields.last_name,
      suffix:            fields.suffix,
      birth_date:        fields.birth_date,
      sex:               fields.sex,
      religion:          fields.religion,
      email:             fields.email,
      mobile_number:     fields.mobile_number,
      current_address:   fields.current_address,
      permanent_address: fields.permanent_address,
    };
    Object.keys(studentFields).forEach(
      (k) => studentFields[k] === undefined && delete studentFields[k]
    );
    setStudent((prev) => ({ ...prev, ...studentFields }));

    if (fields.guardian_full_name) {
      setGuardians((prev) => {
        const updated = [...prev];
        if (updated.length === 0) updated.push({ ...emptyGuardian });
        updated[0] = {
          ...updated[0],
          full_name:     fields.guardian_full_name,
          relationship:  fields.guardian_relationship  || updated[0].relationship,
          mobile_number: fields.guardian_mobile_number || updated[0].mobile_number,
          email_address: fields.guardian_email         || updated[0].email_address,
        };
        return updated;
      });
    }

    if (fields.previous_school_name) {
      setSchools((prev) => {
        const updated = [...prev];
        if (updated.length === 0) updated.push({ ...emptySchool });
        updated[0] = {
          ...updated[0],
          school_name:    fields.previous_school_name,
          school_address: fields.previous_school_address || updated[0].school_address,
        };
        return updated;
      });
    }
  }

  // ── Load requirement types (both modes) ──
  useEffect(() => {
    fetchRequirementTypes().then(setRequirementTypes).catch(() => {});
  }, []);

  // ── Revoke pending upload object URLs on unmount ──
  useEffect(() => {
    const uploads = pendingUploads;
    return () => uploads.forEach((p) => URL.revokeObjectURL(p.previewUrl));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load existing data for edit mode ──
  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        // Student (keep updated_at so optimistic-locking check passes on update)
        const studentData = await getStudent(id);
        setStudent({ ...emptyStudent, ...studentData });

        // Household
        try {
          const hh = await getHouseholdByStudent(id);
          if (hh) {
            setHousehold({
              ...emptyHousehold,
              parent_marital_status: hh.parent_marital_status || "",
              living_arrangement: hh.living_arrangement || "",
              is_4ps_beneficiary: !!hh.is_4ps_beneficiary,
              four_ps_id: hh.four_ps_id || "",
            });
            setHouseholdId(hh.household_id || hh.id || null);
          }
        } catch {
          // Household may not exist yet — that's fine
        }

        // Guardians
        try {
          const gs = await getGuardiansByStudent(id);
          setGuardians(Array.isArray(gs) ? gs : (gs?.results || []));
        } catch { /* none */ }

        // Siblings
        try {
          const ss = await getSiblingsByStudent(id);
          setSiblings(Array.isArray(ss) ? ss : (ss?.results || []));
        } catch { /* none */ }

        // Previous Schools
        try {
          const ps = await getPreviousSchoolsByStudent(id);
          setSchools(Array.isArray(ps) ? ps : (ps?.results || []));
        } catch { /* none */ }

        // Existing requirement submissions
        try {
          const docs = await fetchRequirementSummary(id);
          setExistingDocs(Array.isArray(docs) ? docs : []);
        } catch { /* none */ }
      } catch {
        setError("Failed to load student data.");
      }
    })();
  }, [id]);

  // ── Wrapped setters that track removed items in edit mode ──
  const handleGuardiansChange = (next) => {
    if (id) {
      const removed = guardians.filter(
        (g) => g.guardian_id && !next.find((n) => n.guardian_id === g.guardian_id)
      );
      if (removed.length) {
        setRemovedGuardianIds((prev) => [
          ...prev,
          ...removed.map((g) => g.guardian_id),
        ]);
      }
    }
    setGuardians(next);
  };

  const handleSiblingsChange = (next) => {
    if (id) {
      const removed = siblings.filter(
        (s) => s.sibling_id && !next.find((n) => n.sibling_id === s.sibling_id)
      );
      if (removed.length) {
        setRemovedSiblingIds((prev) => [
          ...prev,
          ...removed.map((s) => s.sibling_id),
        ]);
      }
    }
    setSiblings(next);
  };

  const handleSchoolsChange = (next) => {
    if (id) {
      const removed = schools.filter(
        (s) =>
          s.previous_school_id &&
          !next.find((n) => n.previous_school_id === s.previous_school_id)
      );
      if (removed.length) {
        setRemovedSchoolIds((prev) => [
          ...prev,
          ...removed.map((s) => s.previous_school_id),
        ]);
      }
    }
    setSchools(next);
  };

  function fillDevData() {
    const d = genDevData();
    setStudent(d.student);
    setHousehold(d.household);
    setGuardians(d.guardians);
    setSiblings(d.siblings);
    setSchools(d.schools);
  }

  const [stepDir, setStepDir] = useState(1); // 1 = forward, -1 = backward
  const prevStepRef  = useRef(step);

  const next = () => {
    setStepDir(1);
    prevStepRef.current = step;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const prev = () => {
    setStepDir(-1);
    prevStepRef.current = step;
    setStep((s) => Math.max(s - 1, 0));
  };

  // Detect whether the household section has any meaningful content
  const householdHasContent = (h) =>
    !!(h.parent_marital_status || h.living_arrangement || h.is_4ps_beneficiary);

  // ── Client-side validation ───────────────────────────────────────────────────
  // Returns { step, message } for the first violation, or null if all valid.
  function validate() {
    const s = student;

    // Step 1 — Student
    if (!s.lrn?.trim())
      return { step: 1, message: "LRN is required." };
    if (!/^\d+$/.test(s.lrn.trim()))
      return { step: 1, message: "LRN must contain only numbers." };
    if (s.lrn.trim().length !== 12)
      return { step: 1, message: "LRN must be exactly 12 digits." };
    if (!s.first_name?.trim())
      return { step: 1, message: "First name is required." };
    if (!s.last_name?.trim())
      return { step: 1, message: "Last name is required." };
    if (!s.birth_date)
      return { step: 1, message: "Birth date is required." };
    if (new Date(s.birth_date) > new Date())
      return { step: 1, message: "Birth date cannot be in the future." };
    if (new Date(s.birth_date).getFullYear() < 1970)
      return { step: 1, message: "Please enter a valid birth date." };
    if (!s.current_address?.trim())
      return { step: 1, message: "Current address is required." };
    if (!s.permanent_address?.trim())
      return { step: 1, message: "Permanent address is required." };
    if (s.mobile_number?.trim() && !/^09\d{9}$/.test(s.mobile_number.trim()))
      return { step: 1, message: "Mobile number must start with 09 and be 11 digits (e.g. 09XXXXXXXXX)." };
    if (s.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim()))
      return { step: 1, message: "Please enter a valid email address." };

    // Step 2 — Household
    if (household.is_4ps_beneficiary && !household.four_ps_id?.trim())
      return { step: 2, message: "4Ps ID is required when 4Ps beneficiary is enabled." };

    // Step 3 — Guardians
    for (let i = 0; i < guardians.length; i++) {
      if (!guardians[i].full_name?.trim())
        return { step: 3, message: `Guardian ${i + 1} has no name — fill it in or remove it.` };
    }

    return null;
  }

  // True when all required fields pass — used to disable the submit button.
  const isFormValid = validate() === null;

  // Prevents double-submit even before React re-renders `loading` state.
  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    const violation = validate();
    if (violation) {
      setStep(violation.step);
      setError(violation.message);
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const nullableStudentFields = ["middle_name", "suffix", "religion", "email", "mobile_number"];
      const nullableGuardianFields = ["occupation", "email_address", "mobile_number"];
      const nullableHouseholdFields = ["parent_marital_status", "living_arrangement", "four_ps_id"];

      // student payload — KEEP updated_at so the optimistic-lock check passes
      const studentPayload = nullify(student, nullableStudentFields);

      if (id) {
        // ════════════════════════════════════════════════════════
        // EDIT MODE
        // ════════════════════════════════════════════════════════

        // 1) Update student (updated_at is included in studentPayload from getStudent)
        await updateStudent(id, studentPayload);

        // 2) Household — create or update depending on whether one already exists
        if (householdHasContent(household)) {
          const hhPayload = nullify({ ...household }, nullableHouseholdFields);
          if (householdId) {
            await updateHousehold(householdId, hhPayload);
          } else {
            const created = await createHousehold(hhPayload);
            const createdId = created.household_id || created.id || null;
            setHouseholdId(createdId);
            // Link the new household to the student
            if (createdId) await updateStudent(id, { ...studentPayload, household: createdId });
          }
        }

        // 3) Guardians — update existing, create new, delete removed
        for (const g of guardians) {
          const payload = nullify({ ...g, student: id }, nullableGuardianFields);
          if (g.guardian_id) {
            await updateGuardian(g.guardian_id, payload);
          } else if (g.full_name?.trim()) {
            await createGuardian(payload);
          }
        }
        for (const gid of removedGuardianIds) {
          try { await deleteGuardian(gid); } catch { /* ignore */ }
        }

        // 4) Siblings — update existing, create new, delete removed
        for (const s of siblings) {
          if (!s.full_name?.trim()) continue;
          const siblingPayload = {
            student: id,
            full_name: s.full_name,
            age: s.age ? parseInt(s.age) : null,
          };
          if (s.sibling_id) {
            await updateSibling(s.sibling_id, siblingPayload);
          } else {
            await createSibling(siblingPayload);
          }
        }
        for (const sid of removedSiblingIds) {
          try { await deleteSibling(sid); } catch { /* ignore */ }
        }

        // 5) Previous schools — update existing, create new, delete removed
        for (const s of schools) {
          if (!s.school_name?.trim()) continue;
          const schoolPayload = {
            student: id,
            school_name: s.school_name,
            school_address: s.school_address,
          };
          if (s.previous_school_id) {
            await updatePreviousSchool(s.previous_school_id, schoolPayload);
          } else {
            await createPreviousSchool(schoolPayload);
          }
        }
        for (const psid of removedSchoolIds) {
          try { await deletePreviousSchool(psid); } catch { /* ignore */ }
        }
      } else {
        // ════════════════════════════════════════════════════════
        // CREATE MODE — use the bulk endpoint
        // ════════════════════════════════════════════════════════
        const bulkPayload = {
          student: studentPayload,
          household: householdHasContent(household)
            ? nullify(household, nullableHouseholdFields)
            : null,
          guardians: guardians.filter((g) => g.full_name?.trim()).map((g) => nullify(g, nullableGuardianFields)),
        };

        const result = await bulkCreateStudent(bulkPayload);
        const newStudentId = result.student.student_id;

        // siblings
        for (const s of siblings) {
          if (s.full_name.trim()) {
            await createSibling({
              student: newStudentId,
              full_name: s.full_name,
              age: s.age ? parseInt(s.age) : null,
            });
          }
        }

        // previous schools
        for (const s of schools) {
          if (s.school_name.trim()) {
            await createPreviousSchool({
              student: newStudentId,
              school_name: s.school_name,
              school_address: s.school_address,
            });
          }
        }

        // pending requirement documents
        for (const pu of pendingUploads) {
          try {
            await uploadRequirement({
              studentId: newStudentId,
              requirementTypeId: pu.requirementTypeId,
              file: pu.file,
              remarks: pu.remarks || "",
            });
          } catch (uploadErr) {
            console.warn(`Failed to upload ${pu.requirementCode}:`, uploadErr);
          }
        }
      }

      clearDraft();
      toast.success(id ? "Student updated." : "Student created.");
      navigate("/students");
    } catch (err) {
      const data = err?.response?.data;
      let msg;
      if (!data) {
        msg = err?.message || "Something went wrong. Please check your inputs.";
      } else if (typeof data === "string") {
        msg = data;
      } else {
        const entries = Object.entries(data);
        msg = entries.map(([field, errs]) => `${field}: ${[].concat(errs).join(", ")}`).join(" | ");
      }
      setError(msg || "Something went wrong. Please check your inputs.");
      toast.error(msg || "Something went wrong. Please check your inputs.");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const isLastStep = step === STEPS.length - 1;

  const isFirstRender = useIsFirstRender();

  const dir = stepDir;
  const stepVariants = {
    enter:  { x: dir * 32, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit:   { x: dir * -32, opacity: 0 },
  };

  const sideNavBtn = {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    width: 44, height: 44, borderRadius: "50%", border: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", fontSize: 20, fontWeight: 700, zIndex: 10,
    boxShadow: "0 4px 16px rgba(224,49,49,0.18)", transition: "opacity .2s, box-shadow .2s",
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "28px 20px", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        .req-doc-card:hover { box-shadow: 0 4px 20px rgba(224,49,49,0.10) !important; transform: translateY(-1px); }
      `}</style>

      <div style={{ maxWidth: 780, margin: "0 auto", position: "relative" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <motion.button
            initial={isFirstRender ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: isFirstRender ? 0.06 : 0 }}
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => { clearDraft(); navigate("/students"); }}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 8 }}
          >
            ← Back to Students
          </motion.button>
          <motion.div
            initial={isFirstRender ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: "easeOut", delay: isFirstRender ? 0.1 : 0 }}
            style={{ display: "flex", alignItems: "center", gap: 14 }}
          >
            <h2 style={{ margin: 0, fontSize: 28, color: C.dark }}>
              {id ? "Edit Student" : "New Student Registration"}
            </h2>
            {import.meta.env.DEV && !id && (
              <button
                type="button"
                onClick={fillDevData}
                title="Auto-fill all fields with random valid test data"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 8, border: "1.5px dashed #6366f1",
                  background: "#eef2ff", color: "#4338ca", fontSize: 12, fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif", cursor: "pointer", letterSpacing: ".02em",
                }}
              >
                <i className="ti ti-bolt" style={{ fontSize: 13 }} />
                Dev Fill
              </button>
            )}
          </motion.div>
        </div>

        {/* Step bar */}
        <motion.div
          initial={isFirstRender ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut", delay: isFirstRender ? 0.16 : 0 }}
        >
        <StepBar current={step} onStepClick={(i) => {
          setStepDir(i > step ? 1 : -1);
          prevStepRef.current = step;
          setStep(i);
        }} />
        </motion.div>

        {/* Error */}
        <AnimatePresence>
        {error && (
          <motion.div
            key="error-banner"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
          <div style={{
            background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10,
            padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 20,
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <i className="ti ti-alert-circle" style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }} />
            <span style={{ flex: 1 }}>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", padding: 0, lineHeight: 1, flexShrink: 0 }}
              title="Dismiss"
            >
              <i className="ti ti-x" style={{ fontSize: 14 }} />
            </button>
          </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Step content with side nav buttons */}
        <div style={{ position: "relative" }}>

          {/* Previous button — left of card */}
          <motion.button
            whileHover={step !== 0 ? { scale: 1.1, boxShadow: "0 8px 28px rgba(224,49,49,0.22)" } : {}}
            whileTap={step !== 0 ? { scale: 0.92 } : {}}
            transition={{ duration: 0.12 }}
            onClick={prev}
            disabled={step === 0}
            type="button"
            title="Previous"
            style={{
              ...sideNavBtn, left: -60,
              background: step === 0 ? "#f3e8e8" : C.white,
              color: step === 0 ? C.redMid : C.red,
              opacity: step === 0 ? 0.4 : 1,
              cursor: step === 0 ? "not-allowed" : "pointer",
            }}
          >
            <i className="ti ti-chevron-left" />
          </motion.button>

          {/* Next / Submit button — right of card */}
          <AnimatePresence mode="wait">
          {isLastStep ? (
            <motion.button
              key="submit"
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.88, opacity: 0 }}
              whileHover={isFormValid && !loading ? { scale: 1.1, boxShadow: "0 8px 28px rgba(224,49,49,0.28)" } : {}}
              whileTap={isFormValid && !loading ? { scale: 0.92 } : {}}
              transition={{ duration: 0.12 }}
              onClick={handleSubmit}
              disabled={loading || !isFormValid}
              type="button"
              title={
                loading ? "Submitting…"
                : !isFormValid ? (validate()?.message ?? "Fill in required fields before submitting")
                : (id ? "Update Student" : "Submit Registration")
              }
              style={{
                ...sideNavBtn, right: -60,
                background: !isFormValid ? "#e0c8c8" : C.red,
                color: "#fff",
                opacity: loading ? 0.6 : 1,
                cursor: (loading || !isFormValid) ? "not-allowed" : "pointer",
              }}
            >
              {loading ? <i className="ti ti-loader-2" style={{ animation: "spin 0.8s linear infinite" }} /> : <i className="ti ti-check" />}
            </motion.button>
          ) : (
            <motion.button
              key="next"
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.88, opacity: 0 }}
              whileHover={{ scale: 1.1, boxShadow: "0 8px 28px rgba(224,49,49,0.28)" }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.12 }}
              onClick={next}
              type="button"
              title="Next"
              style={{ ...sideNavBtn, right: -60, background: C.red, color: "#fff" }}
            >
              <i className="ti ti-chevron-right" />
            </motion.button>
          )}
          </AnimatePresence>

          <motion.div
            layout
            initial={isFirstRender ? { opacity: 0, y: 16 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.22 : 0, layout: { duration: 0.28, ease: "easeOut" } }}
            style={{ ...cardStyle, padding: 0, overflow: "hidden" }}
          >
            <div style={{ height: 4, background: "linear-gradient(to right, #e03131, #ff6b6b, #fca5a5, #fde8e8)" }} />
            <div style={{ overflow: "hidden" }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18, ease: "easeOut" }}
                style={{ padding: "24px 28px" }}
              >
              {step === 0 && (
                <DocumentsStep
                  isEdit={!!id}
                  requirementTypes={requirementTypes}
                  pendingUploads={pendingUploads}
                  setPendingUploads={setPendingUploads}
                  existingDocs={existingDocs}
                  setExistingDocs={setExistingDocs}
                  ocrStates={ocrStates}
                  setOcrStates={setOcrStates}
                  studentId={id}
                  onOcrExtracted={handleOcrExtracted}
                  onViewDoc={(url, name) => setDocViewModal({ url, name })}
                />
              )}
              {step === 1 && <StudentStep data={student} onChange={setStudent} />}
              {step === 2 && <HouseholdStep data={household} onChange={setHousehold} />}
              {step === 3 && <GuardiansStep data={guardians} onChange={handleGuardiansChange} />}
              {step === 4 && <SiblingsStep data={siblings} onChange={handleSiblingsChange} />}
              {step === 5 && <SchoolsStep data={schools} onChange={handleSchoolsChange} />}
              {step === 6 && (
                <ReviewStep
                  student={student} household={household}
                  guardians={guardians} siblings={siblings} schools={schools}
                  pendingUploads={pendingUploads}
                  existingDocs={existingDocs}
                  isEdit={!!id}
                />
              )}
              </motion.div>
            </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {docViewModal && (
          <DocViewModal
            key="doc-view"
            url={docViewModal.url}
            name={docViewModal.name}
            onClose={() => setDocViewModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
