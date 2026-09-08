// Extracted from StudentFormPage.jsx (the counter-form staff wizard) so the
// applicant-facing form (pages/apply/ApplicantFormPage.jsx) can reuse the
// exact same fields the school collects, instead of forking a second copy
// that drifts the first time a field is added. Everything here is a pure
// function of props — no hooks, no page-level state — verified by grep
// before the move; StudentFormPage still owns DocumentsStep and the whole
// OCR/upload modal cluster, which are not shared with the applicant flow
// (see the plan's decision 6 — no document upload in v1).
import { motion, AnimatePresence } from "framer-motion";
import { Field, Input, Select, Textarea } from "../../components/FormField";
import {
  STEPS, C, cardStyle, btnGhost, btnDanger,
  emptyGuardian, emptySibling, emptySchool,
} from "./formShapes";

// ─── step indicator ──────────────────────────────────────────────────────────
// size="lg" is the applicant-kiosk touch variant (56px circles, 13px
// labels, up from 36px/11px) — added here rather than as a scoped CSS
// override because the circle/checkmark/connector layout is all inline
// style objects, not classes, so there's nothing for a stylesheet rule to
// target. Default preserves StudentFormPage's exact existing sizing.
const STEP_BAR_SIZES = {
  md: { circle: 36, iconDone: 14, iconIdle: 16, label: 11 },
  lg: { circle: 56, iconDone: 20, iconIdle: 24, label: 13 },
};

// steps: defaults to the full staff-facing list (incl. "documents"). The
// applicant form (no document upload — see the plan's decision 6) passes
// its own shorter list of the same {id, label, icon} shape.
export function StepBar({ current, onStepClick, size = "md", steps = STEPS }) {
  const dims = STEP_BAR_SIZES[size] || STEP_BAR_SIZES.md;
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 32, gap: 0 }}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = i !== current;
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
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
                  width: dims.circle, height: dims.circle, borderRadius: "50%",
                  background: done ? C.red : active ? C.redLight : "#f3e8e8",
                  border: `2px solid ${done || active ? C.red : C.redMid}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: done ? dims.iconDone : dims.iconIdle,
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
                      style={{ fontSize: dims.iconIdle }}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
              <span style={{
                // 11px is the floor tokens.css sets: the 9px this used measured
                // 2.18:1 on the inactive steps, which is unreadable at any size
                // and doubly so at nine pixels.
                fontSize: dims.label, fontWeight: active ? 700 : 500,
                color: active ? "#c92a2a" : done ? C.muted : "#8a6a6a",
                letterSpacing: ".04em", textTransform: "uppercase", whiteSpace: "nowrap",
              }}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
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
export function SectionHeader({ icon, title, subtitle }) {
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
export function Divider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 16px" }}>
      <div style={{ flex: 1, height: 1, background: C.redMid }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase" }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: C.redMid }} />
    </div>
  );
}

// showStatus/lrnRequired: additive, default-true props so StudentFormPage's
// call site (which passes neither) is byte-identical to before extraction.
// The applicant form passes showStatus={false} (enrollment status is a
// school decision, not the applicant's to set — see the plan) and
// lrnRequired={false} (nursery/kindergarten applicants have no
// DepEd-assigned LRN yet).
export function StudentStep({ data, onChange, showStatus = true, lrnRequired = true }) {
  const h = (e) => onChange({ ...data, [e.target.name]: e.target.value });

  const statusColors = {
    active:      { bg: "#e8f5e0", color: "#2e7d32", border: "#a5d6a7" },
    inactive:    { bg: "#f5f5f5", color: "#5c5752", border: "#e0e0e0" },
    transferred: { bg: "#e3f2fd", color: "#1565c0", border: "#90caf9" },
    graduated:   { bg: "#fff8e1", color: "#854f0b", border: "#ffe082" },
    dropped:     { bg: "#fce4ec", color: "#c62828", border: "#f48fb1" },
  };
  const sc = statusColors[data.status] || statusColors.active;

  return (
    <div>
      <SectionHeader icon="ti-user" title="Student Information" subtitle="Basic identity and enrollment details" />

      {/* LRN + Status row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 20px" }}>
        <Field label={lrnRequired ? "LRN *" : "LRN"}>
          <Input
            name="lrn" value={data.lrn} onChange={h} required={lrnRequired}
            placeholder={lrnRequired ? "e.g. 123456789012" : "Leave blank if not yet assigned"}
          />
        </Field>
        {showStatus && (
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
        )}
      </div>

      <Divider label="Full Name" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 20px" }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 20px" }}>
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

export function HouseholdStep({ data, onChange }) {
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 20px" }}>
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

export function GuardiansStep({ data, onChange }) {
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
            <i className="ti ti-users" style={{ fontSize: 26, color: "#8a6a6a" }} />
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 20px" }}>
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

export function SiblingsStep({ data, onChange }) {
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
            <i className="ti ti-friends" style={{ fontSize: 26, color: "#8a6a6a" }} />
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

export function SchoolsStep({ data, onChange }) {
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
            <i className="ti ti-school" style={{ fontSize: 26, color: "#8a6a6a" }} />
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

export function ReviewStepRow({ label, value }) {
  return value ? (
    <div style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: `1px solid ${C.redMid}` }}>
      <span style={{ width: 150, fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 13, color: C.dark, lineHeight: 1.5 }}>{value}</span>
    </div>
  ) : null;
}

export function ReviewStepSection({ icon, title, children }) {
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

export function ReviewStep({ student, household, guardians, siblings, schools, pendingUploads = [], existingDocs = [], isEdit = false }) {
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
