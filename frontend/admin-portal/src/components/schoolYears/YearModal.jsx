import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { Field, Input } from "../FormField";
import { fieldErrorsFrom, firstMessageFrom } from "../../utils/apiError";
import { createSchoolYear, updateSchoolYear } from "../../api/enrollmentApi";

// The create / edit-dates dialog, shared by the School Years list and a
// year's own page. `suggestion` (see yearHelpers.suggestNewYear) prefills a
// new year.

// ── Create / edit modal ──────────────────────────────────────────────────────
export default function YearModal({ year, suggestion, onClose, onSaved }) {
  const isEdit = Boolean(year);
  const [form, setForm] = useState(() => ({
    label:      year?.label      ?? suggestion.label,
    start_date: year?.start_date ?? suggestion.start_date,
    end_date:   year?.end_date   ?? suggestion.end_date,
  }));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");

  const setF = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const handleSave = async () => {
    const local = {};
    if (!isEdit && !/^\d{4}-\d{4}$/.test(form.label.trim())) local.label = "Use the form 2026-2027.";
    if (!form.start_date) local.start_date = "Pick the first day of classes.";
    if (!form.end_date) local.end_date = "Pick the last day of the year.";
    if (Object.keys(local).length) { setErrors(local); return; }

    setSaving(true); setError(""); setErrors({});
    try {
      const saved = isEdit
        ? await updateSchoolYear(year.label, { start_date: form.start_date, end_date: form.end_date })
        : await createSchoolYear({ label: form.label.trim(), start_date: form.start_date, end_date: form.end_date });
      toast.success(isEdit ? `S.Y. ${saved.label} updated.` : `S.Y. ${saved.label} added as ${saved.state}.`);
      onSaved();
      onClose();
    } catch (e) {
      const fields = fieldErrorsFrom(e);
      if (Object.keys(fields).length) setErrors(fields);
      else setError(firstMessageFrom(e) || "Failed to save the school year.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      size="md"
      showClose
      loading={saving}
      icon="ti-calendar-plus"
      title={isEdit ? `Edit S.Y. ${year.label}` : "New School Year"}
      description={
        isEdit
          ? "Change when this year starts and ends"
          : "Set up a year ahead of time — it stays Upcoming until you make it current"
      }
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button icon="ti-check" loading={saving} onClick={handleSave}>
            {saving ? "Saving…" : isEdit ? "Save Dates" : "Add School Year"}
          </Button>
        </div>
      }
    >
      <AnimatePresence>
        {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      </AnimatePresence>

      <Field
        label="School Year"
        required={!isEdit}
        error={errors.label}
        hint={isEdit ? "A year's label can't change; every record in it is filed under it." : undefined}
      >
        <Input
          value={form.label}
          onChange={(e) => setF("label", e.target.value)}
          placeholder="e.g. 2026-2027"
          disabled={isEdit}
        />
      </Field>

      <div className="grid gap-x-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <Field label="Start Date" required error={errors.start_date} hint="Installments and Early Bird count from here">
          <Input type="date" value={form.start_date} onChange={(e) => setF("start_date", e.target.value)} />
        </Field>
        <Field label="End Date" required error={errors.end_date}>
          <Input type="date" value={form.end_date} onChange={(e) => setF("end_date", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
