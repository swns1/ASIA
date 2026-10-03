// ApplicationDetailsEditor — staff correcting what a family typed into the
// applicant form, before the application is decided (backend: intake/views.py
// StudentApplicationViewSet.details). Built from the same step components the
// applicant form and the counter form use, so a correction covers exactly the
// fields the school collects and no others.
//
// Saved onto the application itself rather than passed along at approval: the
// queue shows the corrected name, the duplicate check runs again against it,
// and the fix survives the dialog closing before anyone decides.
import { useState } from "react";

import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import Tabs from "../../components/ui/Tabs";
import { Field, Select } from "../../components/FormField";
import { SectionHeader } from "../../components/ui/FormSection";
import {
  StudentStep, HouseholdStep, GuardiansStep, SiblingsStep, SchoolsStep,
} from "../student-form/StudentFormSteps";
import { emptyStudent, emptyHousehold } from "../student-form/formShapes";
import {
  GRADE_LEVELS_BY_LEVEL, LEVEL_LABELS, SHS_STRANDS, schoolLevelForGrade,
} from "../../constants/schoolLevels";
import { lrn as lrnCheck, mobileNumber, birthDate, email as emailCheck } from "../../utils/validation";
import { updateApplicationDetails } from "../../api/applicationApi";

const SECTIONS = [
  { id: "student",   label: "Student",       icon: "ti-user" },
  { id: "household", label: "Household",     icon: "ti-home" },
  { id: "guardians", label: "Guardians",     icon: "ti-users" },
  { id: "siblings",  label: "Siblings",      icon: "ti-friends" },
  { id: "schools",   label: "Prev. Schools", icon: "ti-school" },
];

const emptyApplyingFor = { school_level: "", grade_level: "", strand: "" };

// The stored payload has nulls where the form had blanks; the inputs need ""
// (a null value turns a controlled input into an uncontrolled one).
function blanks(obj) {
  return Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, v ?? ""]));
}

function fromPayload(payload) {
  const p = payload || {};
  return {
    student: { ...emptyStudent, ...blanks(p.student) },
    household: {
      ...emptyHousehold,
      ...blanks(p.household),
      is_4ps_beneficiary: Boolean(p.household?.is_4ps_beneficiary),
    },
    guardians: (p.guardians || []).map(blanks),
    siblings: (p.siblings || []).map(blanks),
    schools: (p.previous_schools || []).map(blanks),
    applyingFor: { ...emptyApplyingFor, ...blanks(p.applying_for) },
  };
}

// The applicant form's own checks, plus the two the server enforces that it
// doesn't name: the server's version of these arrives as a bare "This field
// may not be blank." with no hint of which field, so they're caught here,
// with the section to open.
function findProblem({ student, household, guardians, schools, applyingFor }) {
  const at = (section, message) => ({ section, message });
  if (applyingFor.school_level === "senior_highschool" && !applyingFor.strand) {
    return at("student", "Choose a strand for senior high school.");
  }
  if (!student.first_name?.trim()) return at("student", "First name is required.");
  if (!student.last_name?.trim()) return at("student", "Last name is required.");
  if (!student.sex) return at("student", "Sex is required.");
  if (!student.birth_date) return at("student", "Birth date is required.");
  const shapeError = birthDate(student.birth_date)
    || lrnCheck(student.lrn)
    || mobileNumber(student.mobile_number)
    || emailCheck(student.email);
  if (shapeError) return at("student", shapeError);
  if (!student.current_address?.trim()) return at("student", "Current address is required.");
  if (!student.permanent_address?.trim()) return at("student", "Permanent address is required.");

  if (household.is_4ps_beneficiary && !String(household.four_ps_id).trim()) {
    return at("household", "4Ps ID is required when 4Ps beneficiary is enabled.");
  }

  if (guardians.length === 0) return at("guardians", "Add at least one parent or guardian.");
  const nameless = guardians.findIndex((g) => !g.full_name?.trim());
  if (nameless !== -1) {
    return at("guardians", `Guardian ${nameless + 1} has no name — fill it in or remove it.`);
  }

  const noAddress = schools.findIndex((s) => s.school_name?.trim() && !s.school_address?.trim());
  if (noAddress !== -1) return at("schools", `Previous school ${noAddress + 1} needs an address.`);
  return null;
}

// Staff wording for the applicant form's "What are you enrolling into?".
function ApplyingForFields({ data, onChange }) {
  const setGrade = (grade) => {
    const level = schoolLevelForGrade(grade) || "";
    onChange({
      ...data,
      grade_level: grade,
      school_level: level,
      // A strand only exists for senior high.
      strand: level === "senior_highschool" ? data.strand : "",
    });
  };

  return (
    <div>
      <SectionHeader
        icon="ti-school"
        title="Applying For"
        subtitle="Prefills the enrollment form on approval. The section is assigned there."
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-x-5">
        <Field label="Grade Level">
          <Select value={data.grade_level} onChange={(e) => setGrade(e.target.value)} aria-label="Grade level">
            <option value="">Not stated</option>
            {Object.entries(GRADE_LEVELS_BY_LEVEL).map(([level, grades]) => (
              <optgroup key={level} label={LEVEL_LABELS[level]}>
                {grades.map((g) => <option key={g} value={g}>{g}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        {data.school_level === "senior_highschool" && (
          <Field label="Strand" required>
            <Select value={data.strand} onChange={(e) => onChange({ ...data, strand: e.target.value })} aria-label="Strand">
              <option value="">Select a strand…</option>
              {SHS_STRANDS.map((st) => <option key={st} value={st}>{st}</option>)}
            </Select>
          </Field>
        )}
      </div>
    </div>
  );
}

export default function ApplicationDetailsEditor({ application, onCancel, onSaved }) {
  const [form, setForm] = useState(() => fromPayload(application.payload_json));
  const [section, setSection] = useState("student");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    const problem = findProblem(form);
    if (problem) {
      setSection(problem.section);
      setError(problem.message);
      return;
    }
    setSaving(true);
    setError("");
    try {
      // The applicant form's shape, untouched: the server validates and
      // normalizes it exactly as it does a submission.
      const updated = await updateApplicationDetails(
        application.student_application_id,
        {
          student: form.student,
          household: form.household,
          guardians: form.guardians,
          siblings: form.siblings,
          previous_schools: form.schools,
          applying_for: form.applyingFor,
        },
        application.revision,
      );
      onSaved(updated);
    } catch (err) {
      setError(
        err.response?.data?.code === "stale_revision"
          ? "Someone else saved changes to this application while you were editing. " +
            "Cancel, open it again to see their changes, then make yours."
          : err.message || "Could not save these corrections.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={onCancel}
      size="lg"
      icon="ti-pencil"
      title={`Edit application ${application.reference}`}
      description="Correct what the family entered. The student record is created from these details on approval."
      loading={saving}
      showClose
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" disabled={saving} onClick={onCancel}>Cancel</Button>
          <Button loading={saving} onClick={handleSave}>Save corrections</Button>
        </div>
      }
    >
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      <Tabs tabs={SECTIONS} value={section} onChange={setSection} className="mb-5" />

      {section === "student" && (
        <>
          <ApplyingForFields data={form.applyingFor} onChange={set("applyingFor")} />
          <div className="my-6 border-t border-neutral-200" />
          <StudentStep data={form.student} onChange={set("student")} showStatus={false} lrnRequired={false} />
        </>
      )}
      {section === "household" && <HouseholdStep data={form.household} onChange={set("household")} />}
      {section === "guardians" && <GuardiansStep data={form.guardians} onChange={set("guardians")} />}
      {section === "siblings" && <SiblingsStep data={form.siblings} onChange={set("siblings")} />}
      {section === "schools" && <SchoolsStep data={form.schools} onChange={set("schools")} />}
    </Modal>
  );
}
