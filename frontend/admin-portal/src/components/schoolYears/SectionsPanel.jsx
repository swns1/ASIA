import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Card from "../ui/Card";
import Button from "../ui/Button";
import { GRADE_LEVELS_BY_LEVEL, LEVEL_LABELS } from "../../constants/schoolLevels";
import SectionModal from "./SectionModal";
import CarryOverModal from "./CarryOverModal";

// A school year's sections, laid out on the grade ladder: every grade shows,
// with its sections or an invitation to add one, so a gap in the setup is
// visible rather than just absent.

// Complete literal class strings: Tailwind can't see interpolated names.
const LEVEL_CHIP = {
  nursery:           "bg-nursery-50 text-nursery-500",
  kindergarten:      "bg-kindergarten-50 text-kindergarten-500",
  elementary:        "bg-elementary-50 text-elementary-500",
  junior_highschool: "bg-juniorhigh-50 text-juniorhigh-500",
  senior_highschool: "bg-seniorhigh-50 text-seniorhigh-500",
};

function SectionChip({ section, onClick }) {
  const learners = section.enrollment_count ?? 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring group inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-neutral-800 transition-colors hover:border-brand-300 hover:text-brand-600"
      aria-label={`${section.grade_level} ${section.name}${section.strand ? `, ${section.strand}` : ""}: ${learners} ${learners === 1 ? "learner" : "learners"}${section.adviser_count ? ", has an adviser" : ", no adviser"}. Edit`}
    >
      {section.name}
      {section.strand && <span className="text-[11.5px] font-bold text-seniorhigh-500">{section.strand}</span>}
      <span className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-neutral-500" title="Learners">
        <i className="ti ti-users text-[12px]" aria-hidden="true" />{learners}
      </span>
      {section.adviser_count > 0 && (
        <i className="ti ti-user-check text-[13px] text-success-500" title="Has an adviser" aria-hidden="true" />
      )}
    </button>
  );
}

export default function SectionsPanel({ schoolYear, years, sections, loading, readOnly = false, onChanged }) {
  const [modal, setModal] = useState(null);   // { section } | { grade }
  const [copying, setCopying] = useState(false);

  const byGrade = useMemo(() => {
    const map = new Map();
    sections.forEach((s) => {
      if (!map.has(s.grade_level)) map.set(s.grade_level, []);
      map.get(s.grade_level).push(s);
    });
    map.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [sections]);

  const gradeCount = byGrade.size;
  const hasOtherYears = years.some((y) => y.label !== schoolYear);

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-bold text-neutral-900">
              {loading ? "Loading sections…" : sections.length
                ? `${sections.length} ${sections.length === 1 ? "section" : "sections"} across ${gradeCount} ${gradeCount === 1 ? "grade" : "grades"}`
                : "No sections yet"}
            </div>
            <div className="mt-0.5 text-[12.5px] text-neutral-500">
              Enrollment, advisers and promotion pick from these. Renaming one carries onto everyone in it.
            </div>
          </div>
          {!readOnly && (
            <div className="flex gap-2">
              {hasOtherYears && (
                <Button variant="secondary" icon="ti-copy" onClick={() => setCopying(true)}>
                  Copy from an earlier year
                </Button>
              )}
              <Button icon="ti-plus" onClick={() => setModal({ grade: "" })}>Add section</Button>
            </div>
          )}
        </div>
      </Card>

      {Object.entries(GRADE_LEVELS_BY_LEVEL).map(([level, grades]) => (
        <Card key={level} padding="none">
          <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-3">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${LEVEL_CHIP[level]}`}>{LEVEL_LABELS[level]}</span>
          </div>
          <ul className="divide-y divide-neutral-100">
            {grades.map((grade) => {
              const list = byGrade.get(grade) ?? [];
              return (
                <li key={grade} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <span className="w-28 shrink-0 text-[13px] font-bold text-neutral-800">{grade}</span>
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    {list.map((s) => (
                      <SectionChip key={s.section_id} section={s} onClick={() => !readOnly && setModal({ section: s })} />
                    ))}
                    {list.length === 0 && <span className="text-[12.5px] italic text-neutral-400">No sections</span>}
                    {!readOnly && (
                      <Button variant="ghost" size="sm" icon="ti-plus" aria-label={`Add a ${grade} section`}
                        onClick={() => setModal({ grade })}>
                        Add
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      <AnimatePresence>
        {modal && (
          <SectionModal
            key="section-modal"
            schoolYear={schoolYear}
            section={modal.section ?? null}
            defaultGrade={modal.grade}
            onClose={() => setModal(null)}
            onSaved={onChanged}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {copying && (
          <CarryOverModal
            key="carry-over"
            schoolYear={schoolYear}
            years={years}
            onClose={() => setCopying(false)}
            onDone={onChanged}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
