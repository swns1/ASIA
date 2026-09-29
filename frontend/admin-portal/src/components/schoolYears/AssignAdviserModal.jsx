import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { Field, Select } from "../FormField";
import { createSectionAdvisory } from "../../api/enrollmentApi";
import { firstMessageFrom } from "../../utils/apiError";

// Make a teacher the adviser of one section of one year. The section fixes
// everything else -- year, grade, level, strand -- so the only choice left
// is who. Each teacher is listed with what they already advise this year,
// so a double load is a visible choice rather than an accident.
export default function AssignAdviserModal({ schoolYear, section, teachers, teachersUnavailable, advisories, onClose, onSaved }) {
  const [teacherId, setTeacherId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const label = `${section.grade_level} · ${section.name}`;

  const { options, alreadyHere } = useMemo(() => {
    const load = new Map();
    const here = new Set();
    advisories.forEach((a) => {
      if (a.grade_level === section.grade_level && a.section === section.name) here.add(a.teacher_user_id);
      else {
        if (!load.has(a.teacher_user_id)) load.set(a.teacher_user_id, []);
        load.get(a.teacher_user_id).push(`${a.grade_level} ${a.section}`);
      }
    });
    const list = teachers
      .filter((t) => !here.has(t.user_id))
      .map((t) => ({ ...t, advises: load.get(t.user_id) ?? [] }))
      .sort((a, b) => a.advises.length - b.advises.length || a.name.localeCompare(b.name));
    return { options: list, alreadyHere: here.size };
  }, [teachers, advisories, section]);

  const handleSave = async () => {
    if (!teacherId) { setError("Pick a teacher."); return; }
    setSaving(true); setError("");
    try {
      await createSectionAdvisory({
        teacher_user_id: Number(teacherId),
        school_year:     schoolYear,
        school_level:    section.school_level,
        grade_level:     section.grade_level,
        section:         section.name,
        strand:          section.strand ?? null,
      });
      const name = teachers.find((t) => t.user_id === Number(teacherId))?.name ?? "The teacher";
      toast.success(`${name} now advises ${label}.`);
      onSaved();
      onClose();
    } catch (e) {
      setError(firstMessageFrom(e) || "Failed to assign the adviser.");
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
      icon="ti-user-check"
      title={`Adviser for ${label}`}
      description={`S.Y. ${schoolYear}${section.strand ? ` · ${section.strand}` : ""}`}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button icon="ti-check" loading={saving} disabled={!options.length} onClick={handleSave}>Assign</Button>
        </div>
      }
    >
      <AnimatePresence>
        {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      </AnimatePresence>

      {teachersUnavailable ? (
        <Alert variant="warning">Teacher list unavailable — listing users requires admin access.</Alert>
      ) : options.length === 0 ? (
        <Alert variant="info">
          {teachers.length ? "Every teacher account already advises this section." : "There are no teacher accounts yet. Add one under Users."}
        </Alert>
      ) : (
        <Field
          label="Teacher"
          required
          hint={alreadyHere ? "Added alongside the section's current adviser." : "They'll see this section's grades, attendance and reports."}
        >
          <Select value={teacherId} onChange={(e) => { setTeacherId(e.target.value); setError(""); }} aria-label="Teacher" autoFocus>
            <option value="">Select a teacher…</option>
            {options.map((t) => (
              <option key={t.user_id} value={t.user_id}>
                {t.name}{t.advises.length ? ` — advises ${t.advises.join(", ")}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </Modal>
  );
}
