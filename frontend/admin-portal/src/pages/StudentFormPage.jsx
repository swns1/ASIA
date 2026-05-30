import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createStudent, getStudent, updateStudent } from "../api/studentApi";
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
import OcrScanButton from "../components/OcrScanButton";

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
  { id: "student",   label: "Student",        icon: "ti-user" },
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

const btnPrimary = {
  background: C.red, color: "#fff", border: "none", borderRadius: 50,
  padding: "11px 28px", fontSize: 14, fontWeight: 700,
  fontFamily: "'DM Sans', sans-serif", cursor: "pointer", letterSpacing: ".02em",
};

const btnSecondary = {
  background: "transparent", color: C.red, border: `1.5px solid ${C.red}`,
  borderRadius: 50, padding: "10px 24px", fontSize: 14, fontWeight: 600,
  fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
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
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
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
function StepBar({ current }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 32, gap: 0 }}>
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: done ? C.red : active ? C.redLight : "#f3e8e8",
                border: `2px solid ${done || active ? C.red : C.redMid}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: done ? 14 : 16,
                color: done ? "#fff" : active ? C.red : C.muted,
                fontWeight: 700, transition: "all .2s",
              }}>
                {done ? "✓" : <i className={`ti ${s.icon}`} style={{ fontSize: 16 }} />}
              </div>
              <span style={{
                fontSize: 10, fontWeight: active ? 700 : 500,
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

function StudentStep({ data, onChange }) {
  const h = (e) => onChange({ ...data, [e.target.name]: e.target.value });
  return (
    <div>
      <h3 style={{ marginBottom: 20, color: C.dark }}>
        Student Information
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
        <Field label="LRN *">
          <Input name="lrn" value={data.lrn} onChange={h} required placeholder="e.g. 123456789012" />
        </Field>
        <Field label="Status">
          <Select name="status" value={data.status} onChange={h}>
            {["active","inactive","transferred","graduated","dropped"].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </Field>
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
        <Field label="Email">
          <Input type="email" name="email" value={data.email || ""} onChange={h} placeholder="Optional" />
        </Field>
        <Field label="Mobile Number">
          <Input name="mobile_number" value={data.mobile_number || ""} onChange={h} placeholder="09XXXXXXXXX" />
        </Field>
      </div>
      <Field label="Current Address *">
        <Textarea name="current_address" value={data.current_address} onChange={h} required placeholder="House No., Street, Barangay, City" />
      </Field>
      <Field label="Permanent Address *">
        <Textarea name="permanent_address" value={data.permanent_address} onChange={h} required placeholder="Same as current or different" />
      </Field>
    </div>
  );
}

function HouseholdStep({ data, onChange }) {
  const h = (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    onChange({ ...data, [e.target.name]: val });
  };
  return (
    <div>
      <h3 style={{ marginBottom: 20, color: C.dark }}>
        Household Information
      </h3>
      <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
        All fields are optional. Fill in what's applicable.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
        <Field label="Parent Marital Status">
          <Select name="parent_marital_status" value={data.parent_marital_status || ""} onChange={h}>
            <option value="">— Select —</option>
            {["married","separated","annulled","single_parent","widowed"].map(s => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </Select>
        </Field>
        <Field label="Living Arrangement">
          <Select name="living_arrangement" value={data.living_arrangement || ""} onChange={h}>
            <option value="">— Select —</option>
            {["both_parents","mother_only","father_only","guardian","relative","independent","others"].map(s => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <input
          type="checkbox" id="is4ps" name="is_4ps_beneficiary"
          checked={data.is_4ps_beneficiary} onChange={h}
          style={{ width: 16, height: 16, accentColor: C.red, cursor: "pointer" }}
        />
        <label htmlFor="is4ps" style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}>
          4Ps Beneficiary
        </label>
      </div>
      {data.is_4ps_beneficiary && (
        <Field label="4Ps ID *">
          <Input name="four_ps_id" value={data.four_ps_id || ""} onChange={h} placeholder="Required for 4Ps beneficiaries" required />
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
    // Only one primary contact
    if (field === "is_primary_contact" && val) {
      next.forEach((g, idx) => { if (idx !== i) next[idx] = { ...next[idx], is_primary_contact: false }; });
    }
    onChange(next);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ color: C.dark, margin: 0 }}>Guardians</h3>
        <button style={btnGhost} onClick={add} type="button">+ Add Guardian</button>
      </div>
      {data.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 14 }}>
          No guardians added yet. Click "Add Guardian" to start.
        </div>
      )}
      {data.map((g, i) => (
        <div key={i} style={{ ...cardStyle, position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontWeight: 700, color: C.red, fontSize: 13 }}>
              Guardian {i + 1}{g.guardian_id ? " (existing)" : " (new)"}
            </span>
            <button style={btnDanger} onClick={() => remove(i)} type="button">Remove</button>
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
            <Field label="Email Address">
              <Input type="email" value={g.email_address || ""} onChange={e => update(i, "email_address", e.target.value)} placeholder="Optional" />
            </Field>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox" id={`primary-${i}`} checked={g.is_primary_contact}
              onChange={e => update(i, "is_primary_contact", e.target.checked)}
              style={{ width: 15, height: 15, accentColor: C.red, cursor: "pointer" }}
            />
            <label htmlFor={`primary-${i}`} style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}>
              Primary Contact
            </label>
          </div>
        </div>
      ))}
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{color: C.dark, margin: 0 }}>Siblings</h3>
        <button style={btnGhost} onClick={add} type="button">+ Add Sibling</button>
      </div>
      {data.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 14 }}>
          No siblings added. Click "Add Sibling" if applicable.
        </div>
      )}
      {data.map((s, i) => (
        <div key={i} style={{ ...cardStyle, display: "grid", gridTemplateColumns: "1fr 120px auto", gap: 16, alignItems: "end" }}>
          <Field label={`Sibling ${i + 1} Full Name *${s.sibling_id ? " (existing)" : " (new)"}`}>
            <Input value={s.full_name} onChange={e => update(i, "full_name", e.target.value)} required placeholder="Full name" />
          </Field>
          <Field label="Age">
            <Input type="number" min="0" max="100" value={s.age || ""} onChange={e => update(i, "age", e.target.value)} placeholder="Age" />
          </Field>
          <div style={{ paddingBottom: 14 }}>
            <button style={btnDanger} onClick={() => remove(i)} type="button">Remove</button>
          </div>
        </div>
      ))}
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ color: C.dark, margin: 0 }}>Previous Schools</h3>
        <button style={btnGhost} onClick={add} type="button">+ Add School</button>
      </div>
      {data.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontSize: 14 }}>
          No previous schools added.
        </div>
      )}
      {data.map((s, i) => (
        <div key={i} style={{ ...cardStyle }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontWeight: 700, color: C.red, fontSize: 13 }}>
              School {i + 1}{s.previous_school_id ? " (existing)" : " (new)"}
            </span>
            <button style={btnDanger} onClick={() => remove(i)} type="button">Remove</button>
          </div>
          <Field label="School Name *">
            <Input value={s.school_name} onChange={e => update(i, "school_name", e.target.value)} required placeholder="School name" />
          </Field>
          <Field label="School Address *">
            <Textarea value={s.school_address} onChange={e => update(i, "school_address", e.target.value)} required placeholder="Full address" />
          </Field>
        </div>
      ))}
    </div>
  );
}

function ReviewStep({ student, household, guardians, siblings, schools }) {
  const Row = ({ label, value }) => value ? (
    <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: `1px solid ${C.redMid}` }}>
      <span style={{ width: 160, fontSize: 12, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: C.dark }}>{value}</span>
    </div>
  ) : null;

  const Section = ({ title, children }) => (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <h4 style={{color: C.red, margin: "0 0 14px", fontSize: 16 }}>{title}</h4>
      {children}
    </div>
  );

  return (
    <div>
      <h3 style={{ marginBottom: 20, color: C.dark }}>Review & Submit</h3>
      <Section title={<><i className="ti ti-user" style={{ marginRight: 6 }} />Student</>}>
        <Row label="LRN" value={student.lrn} />
        <Row label="Full Name" value={`${student.first_name} ${student.middle_name || ""} ${student.last_name} ${student.suffix || ""}`.trim()} />
        <Row label="Sex" value={student.sex} />
        <Row label="Birth Date" value={student.birth_date} />
        <Row label="Religion" value={student.religion} />
        <Row label="Email" value={student.email} />
        <Row label="Mobile" value={student.mobile_number} />
        <Row label="Status" value={student.status} />
        <Row label="Current Address" value={student.current_address} />
        <Row label="Permanent Address" value={student.permanent_address} />
      </Section>

      {(household.parent_marital_status || household.living_arrangement || household.is_4ps_beneficiary) && (
        <Section title={<><i className="ti ti-home" style={{ marginRight: 6 }} />Household</>}>
          <Row label="Marital Status" value={household.parent_marital_status} />
          <Row label="Living Arrangement" value={household.living_arrangement} />
          <Row label="4Ps Beneficiary" value={household.is_4ps_beneficiary ? "Yes" : "No"} />
          <Row label="4Ps ID" value={household.four_ps_id} />
        </Section>
      )}

      {guardians.length > 0 && (
        <Section title={<><i className="ti ti-users" style={{ marginRight: 6 }} />Guardians</>}>
          {guardians.map((g, i) => (
            <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < guardians.length - 1 ? `1px dashed ${C.redMid}` : "none" }}>
              <Row label="Name" value={g.full_name} />
              <Row label="Relationship" value={g.relationship} />
              <Row label="Occupation" value={g.occupation} />
              <Row label="Mobile" value={g.mobile_number} />
              <Row label="Email" value={g.email_address} />
              <Row label="Primary Contact" value={g.is_primary_contact ? "Yes" : null} />
            </div>
          ))}
        </Section>
      )}

      {siblings.length > 0 && (
        <Section title={<><i className="ti ti-friends" style={{ marginRight: 6 }} />Siblings</>}>
          {siblings.map((s, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <Row label={`Sibling ${i + 1}`} value={`${s.full_name}${s.age ? `, age ${s.age}` : ""}`} />
            </div>
          ))}
        </Section>
      )}

      {schools.length > 0 && (
        <Section title={<><i className="ti ti-school" style={{ marginRight: 6 }} />Previous Schools</>}>
          {schools.map((s, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <Row label={`School ${i + 1}`} value={s.school_name} />
              <Row label="Address" value={s.school_address} />
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function StudentFormPage() {
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

  // Track which existing records were removed in edit mode (so we can DELETE them on submit)
  const [removedGuardianIds, setRemovedGuardianIds] = useState([]);
  const [removedSiblingIds, setRemovedSiblingIds] = useState([]);
  const [removedSchoolIds, setRemovedSchoolIds] = useState([]);

  // Track the original household id (if any) so we know whether to PUT or POST
  const [householdId, setHouseholdId] = useState(null);

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
        } catch (e) {
          // Household may not exist yet — that's fine
        }

        // Guardians
        try {
          const gs = await getGuardiansByStudent(id);
          setGuardians(Array.isArray(gs) ? gs : (gs?.results || []));
        } catch (e) { /* none */ }

        // Siblings
        try {
          const ss = await getSiblingsByStudent(id);
          setSiblings(Array.isArray(ss) ? ss : (ss?.results || []));
        } catch (e) { /* none */ }

        // Previous Schools
        try {
          const ps = await getPreviousSchoolsByStudent(id);
          setSchools(Array.isArray(ps) ? ps : (ps?.results || []));
        } catch (e) { /* none */ }
      } catch (err) {
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

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  // Detect whether the household section has any meaningful content
  const householdHasContent = (h) =>
    !!(h.parent_marital_status || h.living_arrangement || h.is_4ps_beneficiary);

  const handleSubmit = async () => {
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
          try { await deleteGuardian(gid); } catch (e) { /* ignore */ }
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
          try { await deleteSibling(sid); } catch (e) { /* ignore */ }
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
          try { await deletePreviousSchool(psid); } catch (e) { /* ignore */ }
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
          guardians: guardians.map((g) => nullify(g, nullableGuardianFields)),
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
      }

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
      setStep(0);
    } finally {
      setLoading(false);
    }
  };

  const isLastStep = step === STEPS.length - 1;

  const sideNavBtn = {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    width: 44, height: 44, borderRadius: "50%", border: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", fontSize: 20, fontWeight: 700, zIndex: 10,
    boxShadow: "0 4px 16px rgba(224,49,49,0.18)", transition: "opacity .2s, box-shadow .2s",
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "28px 20px", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap');`}</style>

      <div style={{ maxWidth: 780, margin: "0 auto", position: "relative" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <button
            onClick={() => navigate("/students")}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 8 }}
          >
            ← Back to Students
          </button>
          <h2 style={{ margin: 0, fontSize: 28, color: C.dark }}>
            {id ? "Edit Student" : "New Student Registration"}
          </h2>
        </div>

        {/* Step bar */}
        <StepBar current={step} />

        {/* Error */}
        {error && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10,
            padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        {/* Step content with side nav buttons */}
        <div style={{ position: "relative" }}>

          {/* Previous button — left of card */}
          <button
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
          </button>

          {/* Next / Submit button — right of card */}
          {isLastStep ? (
            <button
              onClick={handleSubmit}
              disabled={loading}
              type="button"
              title={id ? "Update Student" : "Submit Registration"}
              style={{
                ...sideNavBtn, right: -60,
                background: C.red, color: "#fff",
                opacity: loading ? 0.6 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              <i className="ti ti-check" />
            </button>
          ) : (
            <button
              onClick={next}
              type="button"
              title="Next"
              style={{ ...sideNavBtn, right: -60, background: C.red, color: "#fff" }}
            >
              <i className="ti ti-chevron-right" />
            </button>
          )}

          <div style={{ ...cardStyle, minHeight: 320 }}>
            {step === 0 && (
              <>
                {!id && (
                  <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
                    <OcrScanButton onExtracted={handleOcrExtracted} />
                  </div>
                )}
                <StudentStep data={student} onChange={setStudent} />
              </>
            )}
            {step === 1 && <HouseholdStep data={household} onChange={setHousehold} />}
            {step === 2 && <GuardiansStep data={guardians} onChange={handleGuardiansChange} />}
            {step === 3 && <SiblingsStep data={siblings} onChange={handleSiblingsChange} />}
            {step === 4 && <SchoolsStep data={schools} onChange={handleSchoolsChange} />}
            {step === 5 && (
              <ReviewStep
                student={student} household={household}
                guardians={guardians} siblings={siblings} schools={schools}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
