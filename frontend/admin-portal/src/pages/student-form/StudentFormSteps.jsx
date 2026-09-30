// Extracted from StudentFormPage.jsx (the counter-form staff wizard) so the
// applicant-facing form (pages/apply/ApplicantFormPage.jsx) can reuse the
// exact same fields the school collects, instead of forking a second copy
// that drifts the first time a field is added. Everything here is a pure
// function of props — no hooks, no page-level state — verified by grep
// before the move; StudentFormPage still owns DocumentsStep and the whole
// OCR/upload modal cluster, which are not shared with the applicant flow
// (see the plan's decision 6 — no document upload in v1).
//
// The inline style objects these steps were built from are gone: the shapes
// they drew by hand now live in components/ui (SectionHeader, Divider,
// ToggleCard, TogglePill, SummaryList, StepBar) and are drawn with the same
// tokens as the rest of the app. StepBar is re-exported below so the two
// consumers' imports keep working.
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Field, Input, Select, Textarea } from "../../components/FormField";
import { SectionHeader, Divider } from "../../components/ui/FormSection";
import { ToggleCard, TogglePill } from "../../components/ui/ToggleCard";
import SummaryList, { SummaryRow, SummaryGroup } from "../../components/ui/SummaryList";
import EmptyState from "../../components/EmptyState";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { todayISO } from "../../utils/format";
import { IMPOSSIBLE_DATE_MESSAGE } from "../../utils/validation";
import { emptyGuardian, emptySibling, emptySchool } from "./formShapes";

export { default as StepBar } from "../../components/ui/StepBar";
export { SectionHeader, Divider } from "../../components/ui/FormSection";

// Two-up field grid — the layout every step uses for its paired inputs.
const FIELD_GRID = "grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-x-5";

// ════════════════════════════════════════════════════════════════════════════
// STEP COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

// showStatus/lrnRequired: additive, default-true props so StudentFormPage's
// call site (which passes neither) behaves as before. The applicant form
// passes showStatus={false} (enrollment status is a school decision, not the
// applicant's to set — see the plan) and lrnRequired={false}
// (nursery/kindergarten applicants have no DepEd-assigned LRN yet).
export function StudentStep({ data, onChange, showStatus = true, lrnRequired = true }) {
  const h = (e) => onChange({ ...data, [e.target.name]: e.target.value });

  // The date field lets each part be typed on its own, so Feb 30 (or Feb 29
  // in a non-leap year) can be entered. The browser then reports the value as
  // "" with validity.badInput set, and the form only ever said "required".
  // Checked on blur too: React skips onChange when "" stays "".
  const [birthDateImpossible, setBirthDateImpossible] = useState(false);
  const checkBirthDate = (e) => setBirthDateImpossible(Boolean(e.target.validity?.badInput));

  // The student record's own lifecycle status, tinted to match its badge
  // elsewhere. Set through `style`, not a class: FormField's own
  // `bg-neutral-100` sits in the same Tailwind layer, so a class here would
  // win or lose by stylesheet order rather than by intent. The values are the
  // status palette from styles/tokens.css — this palette is reserved for
  // status and deliberately isn't one of the brand tones.
  const STATUS_TINTS = {
    active:      { background: "var(--color-success-50)", borderColor: "var(--color-success-dot)", color: "var(--color-success-500)" },
    inactive:    { background: "var(--color-neutral-200)", borderColor: "var(--color-neutral-300)", color: "var(--color-neutral-700)" },
    transferred: { background: "var(--color-info-50)",    borderColor: "var(--color-info-dot)",    color: "var(--color-info-500)" },
    graduated:   { background: "var(--color-warning-50)", borderColor: "var(--color-warning-dot)", color: "var(--color-warning-500)" },
    dropped:     { background: "var(--color-error-50)",   borderColor: "var(--color-error-500)",   color: "var(--color-error-500)" },
  };

  return (
    <div>
      <SectionHeader
        icon="ti-user"
        title="Student Information"
        subtitle="Basic identity and enrollment details"
      />

      <div className={FIELD_GRID}>
        <Field label="LRN" required={lrnRequired}>
          <Input
            name="lrn" value={data.lrn} onChange={h} required={lrnRequired}
            placeholder={lrnRequired ? "e.g. 123456789012" : "Leave blank if not yet assigned"}
          />
        </Field>
        {showStatus && (
          <Field label="Enrollment Status">
            <Select
              name="status"
              value={data.status}
              onChange={h}
              className="font-bold"
              style={STATUS_TINTS[data.status] ?? STATUS_TINTS.active}
            >
              {["active", "inactive", "transferred", "graduated", "dropped"].map((s) => (
                <option key={s} value={s} className="bg-white font-normal text-neutral-900">
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <Divider label="Full Name" />
      <div className={FIELD_GRID}>
        <Field label="First Name" required>
          <Input name="first_name" value={data.first_name} onChange={h} required placeholder="Juan" />
        </Field>
        <Field label="Middle Name">
          <Input name="middle_name" value={data.middle_name || ""} onChange={h} placeholder="Optional" />
        </Field>
        <Field label="Last Name" required>
          <Input name="last_name" value={data.last_name} onChange={h} required placeholder="Dela Cruz" />
        </Field>
        <Field label="Suffix">
          <Input name="suffix" value={data.suffix || ""} onChange={h} placeholder="Jr., Sr., III" />
        </Field>
      </div>

      <Divider label="Personal Details" />
      <div className={FIELD_GRID}>
        <Field label="Sex" required>
          <Select name="sex" value={data.sex} onChange={h}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Select>
        </Field>
        <Field
          label="Birth Date"
          required
          error={birthDateImpossible ? IMPOSSIBLE_DATE_MESSAGE : null}
        >
          {/* min/max bound the picker to the same window validation.js already
              enforces (EARLIEST_BIRTH_YEAR and "not in the future"). Without
              them a future date was freely selectable in the calendar and only
              rejected at submit, several steps later — the browser can say no
              at the point of entry instead. */}
          <Input
            type="date"
            name="birth_date"
            value={data.birth_date || ""}
            onChange={(e) => { checkBirthDate(e); h(e); }}
            onBlur={checkBirthDate}
            min="1970-01-01"
            max={todayISO()}
            required
          />
        </Field>
        <Field label="Religion">
          <Input name="religion" value={data.religion || ""} onChange={h} placeholder="Optional" />
        </Field>
        <Field label="Mobile Number">
          <Input name="mobile_number" value={data.mobile_number || ""} onChange={h} placeholder="09XXXXXXXXX" />
        </Field>
        <Field label="Email" className="col-span-full">
          <Input type="email" name="email" value={data.email || ""} onChange={h} placeholder="Optional" />
        </Field>
      </div>

      <Divider label="Address" />
      <Field label="Current Address" required>
        <Textarea name="current_address" value={data.current_address} onChange={h} required placeholder="House No., Street, Barangay, City" />
      </Field>
      <Field label="Permanent Address" required>
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
    { value: "married",       label: "Married" },
    { value: "separated",     label: "Separated" },
    { value: "annulled",      label: "Annulled" },
    { value: "single_parent", label: "Single Parent" },
    { value: "widowed",       label: "Widowed" },
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
      <SectionHeader
        icon="ti-home"
        title="Household Information"
        subtitle="All fields are optional — fill in what's applicable"
      />

      <Divider label="Parents" />
      <div className={FIELD_GRID}>
        <Field label="Parent Marital Status">
          <Select name="parent_marital_status" value={data.parent_marital_status || ""} onChange={h}>
            <option value="">— Select —</option>
            {maritalOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Living Arrangement">
          <Select name="living_arrangement" value={data.living_arrangement || ""} onChange={h}>
            <option value="">— Select —</option>
            {arrangementOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      </div>

      <Divider label="Government Programs" />
      <ToggleCard
        name="is_4ps_beneficiary"
        checked={Boolean(data.is_4ps_beneficiary)}
        onChange={(checked) => onChange({ ...data, is_4ps_beneficiary: checked })}
        icon="ti-shield-check"
        title="4Ps Beneficiary"
        description="Pantawid Pamilyang Pilipino Program"
        className="mb-3.5"
      />

      <AnimatePresence>
        {data.is_4ps_beneficiary && (
          <motion.div
            key="four-ps-id"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <Field label="4Ps ID" required>
              <Input name="four_ps_id" value={data.four_ps_id || ""} onChange={h} placeholder="Enter 4Ps beneficiary ID" required />
            </Field>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// A repeated sub-record (a guardian, a previous school) — card with a brand
// left accent, an identifying header and a Remove action.
function RepeaterCard({ icon, title, meta, accent = true, onRemove, removeLabel = "Remove", children }) {
  return (
    <Card padding="none" className="relative overflow-hidden">
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${accent ? "bg-brand-500" : "bg-brand-border-soft"}`}
      />
      <div className="py-5 pl-6 pr-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-500">
              <i className={`ti ${icon} text-base`} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-neutral-900">{title}</div>
              {meta && <div className="truncate text-xs text-neutral-500">{meta}</div>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onRemove} type="button" className="shrink-0 text-error-500">
            <i className="ti ti-trash text-xs" aria-hidden="true" /> {removeLabel}
          </Button>
        </div>
        {children}
      </div>
    </Card>
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
      <SectionHeader
        icon="ti-users"
        title="Guardians"
        subtitle={`${data.length} guardian${data.length !== 1 ? "s" : ""} added`}
        action={
          <Button variant="secondary" size="sm" onClick={add} type="button">
            <i className="ti ti-plus text-xs" aria-hidden="true" /> Add Guardian
          </Button>
        }
      />

      {data.length === 0 && (
        <EmptyState
          icon="ti-users"
          title="No guardians added yet"
          subtitle='Click "Add Guardian" to add a parent or guardian.'
        />
      )}

      <div className="flex flex-col gap-3.5">
        <AnimatePresence>
          {data.map((g, i) => (
            <motion.div
              key={g.guardian_id ?? `new-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <RepeaterCard
                icon={relIcons[g.relationship] || "ti-user"}
                accent={g.is_primary_contact}
                title={g.full_name || `Guardian ${i + 1}`}
                meta={
                  <span className="capitalize">
                    {g.relationship}{g.guardian_id ? " · saved" : " · new"}
                    {g.is_primary_contact && (
                      <span className="ml-1.5 font-bold text-brand-600">· Primary</span>
                    )}
                  </span>
                }
                onRemove={() => remove(i)}
              >
                <div className={FIELD_GRID}>
                  <Field label="Full Name" required>
                    <Input value={g.full_name} onChange={(e) => update(i, "full_name", e.target.value)} required placeholder="Full name" />
                  </Field>
                  <Field label="Relationship" required>
                    <Select value={g.relationship} onChange={(e) => update(i, "relationship", e.target.value)}>
                      <option value="mother">Mother</option>
                      <option value="father">Father</option>
                      <option value="guardian">Guardian</option>
                    </Select>
                  </Field>
                  <Field label="Occupation">
                    <Input value={g.occupation || ""} onChange={(e) => update(i, "occupation", e.target.value)} placeholder="Optional" />
                  </Field>
                  <Field label="Mobile Number">
                    <Input value={g.mobile_number || ""} onChange={(e) => update(i, "mobile_number", e.target.value)} placeholder="09XXXXXXXXX" />
                  </Field>
                  <Field label="Email Address" className="col-span-full">
                    <Input type="email" value={g.email_address || ""} onChange={(e) => update(i, "email_address", e.target.value)} placeholder="Optional" />
                  </Field>
                </div>

                <TogglePill
                  checked={Boolean(g.is_primary_contact)}
                  onChange={(checked) => update(i, "is_primary_contact", checked)}
                  labelOn="Primary Contact"
                  labelOff="Set as Primary Contact"
                />
              </RepeaterCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
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
      <SectionHeader
        icon="ti-friends"
        title="Siblings"
        subtitle={`${data.length} sibling${data.length !== 1 ? "s" : ""} added`}
        action={
          <Button variant="secondary" size="sm" onClick={add} type="button">
            <i className="ti ti-plus text-xs" aria-hidden="true" /> Add Sibling
          </Button>
        }
      />

      {data.length === 0 && (
        <EmptyState
          icon="ti-friends"
          title="No siblings added"
          subtitle='Click "Add Sibling" if applicable.'
        />
      )}

      <div className="flex flex-col gap-2.5">
        <AnimatePresence>
          {data.map((s, i) => (
            <motion.div
              key={s.sibling_id ?? `new-sib-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex items-center gap-3.5 rounded-xl border-[1.5px] border-brand-border-soft bg-white px-4 py-3.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-500">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {/* No visible label: the numbered badge to the left names the
                    row, and the placeholder repeats it. aria-label carries it
                    for screen readers. */}
                <Input
                  value={s.full_name}
                  onChange={(e) => update(i, "full_name", e.target.value)}
                  required
                  aria-label={`Sibling ${i + 1} full name`}
                  placeholder={`Sibling ${i + 1} full name`}
                />
              </div>
              <div className="w-[90px] shrink-0">
                <Input
                  type="number" min="0" max="100"
                  value={s.age || ""}
                  onChange={(e) => update(i, "age", e.target.value)}
                  aria-label={`Sibling ${i + 1} age`}
                  placeholder="Age"
                />
              </div>
              <Button
                variant="ghost" size="sm" iconOnly
                onClick={() => remove(i)} type="button"
                aria-label={`Remove sibling ${i + 1}`}
                className="shrink-0 text-error-500"
              >
                <i className="ti ti-x text-xs" aria-hidden="true" />
              </Button>
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
      <SectionHeader
        icon="ti-school"
        title="Previous Schools"
        subtitle={`${data.length} school${data.length !== 1 ? "s" : ""} added`}
        action={
          <Button variant="secondary" size="sm" onClick={add} type="button">
            <i className="ti ti-plus text-xs" aria-hidden="true" /> Add School
          </Button>
        }
      />

      {data.length === 0 && (
        <EmptyState
          icon="ti-school"
          title="No previous schools added"
          subtitle="Add any schools the student previously attended."
        />
      )}

      <div className="flex flex-col gap-3.5">
        <AnimatePresence>
          {data.map((s, i) => (
            <motion.div
              key={s.previous_school_id ?? `new-sch-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <RepeaterCard
                icon="ti-building-community"
                title={s.school_name || `School ${i + 1}`}
                meta={s.previous_school_id ? "Saved record" : "New entry"}
                onRemove={() => remove(i)}
              >
                <Field label="School Name" required>
                  <Input value={s.school_name} onChange={(e) => update(i, "school_name", e.target.value)} required placeholder="Full school name" />
                </Field>
                <Field label="School Address" required>
                  <Textarea value={s.school_address} onChange={(e) => update(i, "school_address", e.target.value)} required placeholder="Full address of the school" />
                </Field>
              </RepeaterCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Kept as named exports: ApplicantFormPage composes its own review screen from
// these two around the shared ReviewStep.
export { SummaryRow as ReviewStepRow };
export { default as ReviewStepSection } from "../../components/ui/SummaryList";

export function ReviewStep({ student, household, guardians, siblings, schools }) {
  const STATUS_TEXT = {
    active: "text-success-500",
    inactive: "text-neutral-700",
    transferred: "text-info-500",
    graduated: "text-warning-500",
    dropped: "text-error-500",
  };

  return (
    <div>
      <SectionHeader
        icon="ti-clipboard-check"
        title="Review & Submit"
        subtitle="Check all information before submitting"
      />

      <div className="flex flex-col gap-3.5">
        <SummaryList icon="ti-user" title="Student Information">
          <SummaryRow label="LRN" value={student.lrn} />
          <SummaryRow
            label="Full Name"
            value={`${student.first_name} ${student.middle_name || ""} ${student.last_name} ${student.suffix || ""}`.trim()}
          />
          <SummaryRow label="Sex" value={student.sex?.charAt(0).toUpperCase() + student.sex?.slice(1)} />
          <SummaryRow label="Birth Date" value={student.birth_date} />
          <SummaryRow label="Religion" value={student.religion} />
          <SummaryRow label="Email" value={student.email} />
          <SummaryRow label="Mobile" value={student.mobile_number} />
          <SummaryRow
            label="Status"
            value={
              student.status ? (
                <span className={`font-bold capitalize ${STATUS_TEXT[student.status] ?? "text-neutral-900"}`}>
                  {student.status}
                </span>
              ) : null
            }
          />
          <SummaryRow label="Current Address" value={student.current_address} />
          <SummaryRow label="Permanent Address" value={student.permanent_address} />
        </SummaryList>

        {(household.parent_marital_status || household.living_arrangement || household.is_4ps_beneficiary) && (
          <SummaryList icon="ti-home" title="Household Information">
            <SummaryRow label="Marital Status" value={household.parent_marital_status?.replace(/_/g, " ")} />
            <SummaryRow label="Living With" value={household.living_arrangement?.replace(/_/g, " ")} />
            <SummaryRow label="4Ps Beneficiary" value={household.is_4ps_beneficiary ? "Yes" : "No"} />
            <SummaryRow label="4Ps ID" value={household.four_ps_id} />
          </SummaryList>
        )}

        {guardians.length > 0 && (
          <SummaryList icon="ti-users" title={`Guardians (${guardians.length})`}>
            {guardians.map((g, i) => (
              <SummaryGroup key={g.guardian_id ?? i} first={i === 0}>
                <SummaryRow
                  label="Name"
                  value={
                    <span className="font-bold">
                      {g.full_name}
                      {g.is_primary_contact && (
                        <span className="ml-2 text-[11px] font-bold text-brand-600">★ Primary</span>
                      )}
                    </span>
                  }
                />
                <SummaryRow label="Relationship" value={g.relationship?.charAt(0).toUpperCase() + g.relationship?.slice(1)} />
                <SummaryRow label="Occupation" value={g.occupation} />
                <SummaryRow label="Mobile" value={g.mobile_number} />
                <SummaryRow label="Email" value={g.email_address} />
              </SummaryGroup>
            ))}
          </SummaryList>
        )}

        {siblings.length > 0 && (
          <SummaryList icon="ti-friends" title={`Siblings (${siblings.length})`}>
            {siblings.map((s, i) => (
              <SummaryRow
                key={s.sibling_id ?? i}
                label={`Sibling ${i + 1}`}
                value={`${s.full_name}${s.age ? `, age ${s.age}` : ""}`}
              />
            ))}
          </SummaryList>
        )}

        {schools.length > 0 && (
          <SummaryList icon="ti-school" title={`Previous Schools (${schools.length})`}>
            {schools.map((s, i) => (
              <SummaryGroup key={s.previous_school_id ?? i} first={i === 0}>
                <SummaryRow label={`School ${i + 1}`} value={<span className="font-bold">{s.school_name}</span>} />
                <SummaryRow label="Address" value={s.school_address} />
              </SummaryGroup>
            ))}
          </SummaryList>
        )}
      </div>
    </div>
  );
}
