import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import useSections, { invalidateSections } from "../../hooks/useSections";
import QuickAddSectionModal from "./QuickAddSectionModal";

// SectionSelect — pick a section of one grade in one school year.
//
// Replaces the free-text section boxes on the enrollment form, the adviser
// form, bulk enrolment and Promote. Typed names only linked up when they were
// spelled the same everywhere, and a teacher's access to their own students
// hung on that match. The database now refuses a section that isn't set up,
// so the picker offers only the ones that are.
//
// `onChange(name, section)` passes the section too: a Senior High section
// carries the learner's strand.
//
// `as` renders the control: FormField's Select on the design-system forms, a
// plain <select> (with `style`) on the older inline-styled modals.

const ADD = "__add_section__";

export default function SectionSelect({
  schoolYear,
  gradeLevel,
  schoolLevel,
  value,
  onChange,
  allowQuickAdd = false,
  as: Control = "select",
  placeholder = "Select a section…",
  disabled = false,
  ...props
}) {
  const { sections, loading, error, reload } = useSections(schoolYear, gradeLevel);
  const [adding, setAdding] = useState(false);

  const ready = Boolean(schoolYear && gradeLevel);
  const known = sections.some((s) => s.name === value);
  const firstLabel = !ready
    ? "Pick a year and grade first"
    : loading ? "Loading sections…"
    : error ? "Couldn't load sections"
    : sections.length === 0 ? `No sections for ${gradeLevel} yet`
    : placeholder;

  const handleChange = (e) => {
    const next = e.target.value;
    if (next === ADD) { setAdding(true); return; }
    onChange?.(next, sections.find((s) => s.name === next) ?? null);
  };

  return (
    <>
      <Control value={value || ""} onChange={handleChange} disabled={disabled || !ready} {...props}>
        <option value="">{firstLabel}</option>
        {/* An existing record's section stays visible while the list loads,
            or if it's no longer offered, rather than the select going blank. */}
        {value && !known && <option value={value}>{value}</option>}
        {sections.map((s) => (
          <option key={s.section_id} value={s.name}>
            {s.strand ? `${s.name} · ${s.strand}` : s.name}
          </option>
        ))}
        {allowQuickAdd && ready && !loading && <option value={ADD}>＋ Add a section…</option>}
      </Control>

      <AnimatePresence>
        {adding && (
          <QuickAddSectionModal
            key="quick-add-section"
            schoolYear={schoolYear}
            gradeLevel={gradeLevel}
            schoolLevel={schoolLevel}
            onClose={() => setAdding(false)}
            onCreated={(section) => {
              invalidateSections();
              reload();
              onChange?.(section.name, section);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
