import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { Field, Input, Select } from "../FormField";
import { GRADE_LEVELS_BY_LEVEL, LEVEL_LABELS, SHS_STRANDS, schoolLevelForGrade } from "../../constants/schoolLevels";
import { createSection, updateSection, deleteSection } from "../../api/enrollmentApi";
import { fieldErrorsFrom, firstMessageFrom } from "../../utils/apiError";

// Add, rename or remove one section of a school year.
//
// Editing never moves a section to another grade: every learner filed under
// it would move too. A rename, by contrast, is safe and meant -- it carries
// onto every enrollment and adviser in the section.
export default function SectionModal({ schoolYear, section, defaultGrade, onClose, onSaved }) {
  const isEdit = Boolean(section);
  const [grade, setGrade] = useState(section?.grade_level ?? defaultGrade ?? "");
  const [name, setName] = useState(section?.name ?? "");
  const [strand, setStrand] = useState(section?.strand ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");

  const level = schoolLevelForGrade(grade);
  const isSHS = level === "senior_highschool";
  const inUse = isEdit ? (section.enrollment_count ?? 0) + (section.adviser_count ?? 0) : 0;

  const clear = (k) => setErrors((e) => ({ ...e, [k]: undefined }));

  const handleSave = async () => {
    const local = {};
    if (!grade) local.grade_level = "Pick a grade.";
    if (!name.trim()) local.name = "Give the section a name.";
    if (isSHS && !strand) local.strand = "Senior High sections belong to a strand.";
    if (Object.keys(local).length) { setErrors(local); return; }

    setSaving(true); setError(""); setErrors({});
    try {
      if (isEdit) {
        await updateSection(section.section_id, { name: name.trim(), strand: isSHS ? strand : null });
        toast.success(
          name.trim() !== section.name
            ? `Renamed to ${name.trim()}${inUse ? " — its learners and adviser moved with it" : ""}.`
            : "Section updated.",
        );
      } else {
        await createSection({
          school_year: schoolYear,
          school_level: level,
          grade_level: grade,
          name: name.trim(),
          strand: isSHS ? strand : null,
        });
        toast.success(`${grade} · ${name.trim()} added.`);
      }
      onSaved();
      onClose();
    } catch (e) {
      const fields = fieldErrorsFrom(e);
      if (Object.keys(fields).length) setErrors(fields);
      else setError(firstMessageFrom(e) || "Failed to save the section.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true); setError("");
    try {
      await deleteSection(section.section_id);
      toast.success(`${section.grade_level} · ${section.name} removed.`);
      onSaved();
      onClose();
    } catch (e) {
      setError(firstMessageFrom(e) || "Failed to remove the section.");
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      size="sm"
      showClose
      loading={saving}
      icon={isEdit ? "ti-pencil" : "ti-layout-grid-add"}
      title={isEdit ? `${section.grade_level} · ${section.name}` : "Add a section"}
      description={`S.Y. ${schoolYear}`}
      closeOnBackdrop={false}
      footer={
        <div className="flex items-center justify-between gap-2.5">
          <div>
            {isEdit && !confirmDelete && (
              <Button
                variant="ghost" size="sm" icon="ti-trash"
                disabled={saving || inUse > 0}
                title={inUse > 0 ? "Has learners or an adviser, so it can't be removed" : undefined}
                onClick={() => setConfirmDelete(true)}
              >
                Remove
              </Button>
            )}
            {isEdit && confirmDelete && (
              <Button variant="destructive" size="sm" icon="ti-trash" loading={saving} onClick={handleDelete}>
                Yes, remove it
              </Button>
            )}
          </div>
          <div className="flex gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button icon="ti-check" loading={saving && !confirmDelete} onClick={handleSave}>
              {isEdit ? "Save" : "Add section"}
            </Button>
          </div>
        </div>
      }
    >
      <AnimatePresence>
        {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      </AnimatePresence>

      <Field label="Grade" required error={errors.grade_level}
        hint={isEdit ? "A section stays in its grade. For another grade, add a section there." : undefined}>
        <Select value={grade} disabled={isEdit} onChange={(e) => { setGrade(e.target.value); setStrand(""); clear("grade_level"); }}>
          <option value="">Select a grade…</option>
          {Object.entries(GRADE_LEVELS_BY_LEVEL).map(([lvl, grades]) => (
            <optgroup key={lvl} label={LEVEL_LABELS[lvl]}>
              {grades.map((g) => <option key={g} value={g}>{g}</option>)}
            </optgroup>
          ))}
        </Select>
      </Field>

      <Field label="Section name" required error={errors.name}
        hint={isEdit && inUse ? "Renaming carries onto every learner and adviser in this section." : undefined}>
        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); clear("name"); }}
          placeholder={isSHS ? "e.g. STEM-A" : "e.g. Rizal"}
          autoFocus={!isEdit}
        />
      </Field>

      {isSHS && (
        <Field label="Strand" required error={errors.strand}>
          <Select value={strand} onChange={(e) => { setStrand(e.target.value); clear("strand"); }}>
            <option value="">Select a strand…</option>
            {SHS_STRANDS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
      )}

      {isEdit && inUse > 0 && (
        <p className="text-[12.5px] text-neutral-500">
          {section.enrollment_count ?? 0} {section.enrollment_count === 1 ? "learner" : "learners"}
          {section.adviser_count ? ` · ${section.adviser_count} ${section.adviser_count === 1 ? "adviser" : "advisers"}` : ""}.
          A section can only be removed once it's empty.
        </p>
      )}
    </Modal>
  );
}
