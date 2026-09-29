import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { Field, Input, Select } from "../FormField";
import { createSection } from "../../api/enrollmentApi";
import { SHS_STRANDS, schoolLevelForGrade } from "../../constants/schoolLevels";
import { fieldErrorsFrom, firstMessageFrom } from "../../utils/apiError";

// Add a missing section without leaving the form you're on. The section is
// real and shared -- it joins that year's list on the School Year page -- so
// the dialog says so rather than looking like a local text box.
export default function QuickAddSectionModal({ schoolYear, gradeLevel, schoolLevel, onClose, onCreated }) {
  const level = schoolLevel || schoolLevelForGrade(gradeLevel);
  const isSHS = level === "senior_highschool";

  const [name, setName] = useState("");
  const [strand, setStrand] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");

  const handleSave = async () => {
    const local = {};
    if (!name.trim()) local.name = "Give the section a name.";
    if (isSHS && !strand) local.strand = "Senior High sections belong to a strand.";
    if (Object.keys(local).length) { setErrors(local); return; }

    setSaving(true); setError(""); setErrors({});
    try {
      const section = await createSection({
        school_year: schoolYear,
        school_level: level,
        grade_level: gradeLevel,
        name: name.trim(),
        strand: isSHS ? strand : null,
      });
      onCreated?.(section);
      onClose();
    } catch (e) {
      const fields = fieldErrorsFrom(e);
      if (Object.keys(fields).length) setErrors(fields);
      else setError(firstMessageFrom(e) || "Failed to add the section.");
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
      icon="ti-layout-grid-add"
      title="Add a section"
      description={`${gradeLevel} · S.Y. ${schoolYear}`}
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button icon="ti-check" loading={saving} onClick={handleSave}>Add section</Button>
        </div>
      }
    >
      <AnimatePresence>
        {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      </AnimatePresence>
      <p className="mb-4 text-[13px] leading-relaxed text-neutral-600">
        This adds it to {gradeLevel}&rsquo;s sections for S.Y. {schoolYear}, for everyone &mdash; the
        same list as the School Year page.
      </p>
      <Field label="Section name" required error={errors.name}>
        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined })); }}
          placeholder={isSHS ? "e.g. STEM-A" : "e.g. Rizal"}
          autoFocus
        />
      </Field>
      {isSHS && (
        <Field label="Strand" required error={errors.strand}>
          <Select value={strand} onChange={(e) => { setStrand(e.target.value); setErrors((x) => ({ ...x, strand: undefined })); }}>
            <option value="">Select a strand…</option>
            {SHS_STRANDS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
      )}
    </Modal>
  );
}
