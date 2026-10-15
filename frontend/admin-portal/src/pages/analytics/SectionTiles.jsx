import { LEVEL_ICONS } from "../../constants/schoolLevels";

// A teacher's sections on Analytics, one tile each, to narrow the page to one
// class: "All my sections" first when there are several. A teacher with one
// section sees just its tile, already picked. Joined into one line they ran
// together once a teacher had three or four.

function Tile({ selected, onClick, icon, top, name, count, label }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={`focus-ring flex min-h-16 min-w-0 items-center gap-2.5 rounded-[10px] border-[1.5px] px-3 py-2.5 text-left transition-colors ${
        selected ? "border-brand-300 bg-brand-100" : "border-neutral-200 bg-surface hover:border-brand-300"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${selected ? "bg-action text-white" : "bg-brand-100 text-brand-500"}`}
      >
        <i className={`ti ${selected ? "ti-check" : icon} text-[16px]`} />
      </span>
      <span className="min-w-0">
        <span className={`block text-[12px] ${selected ? "text-brand-600" : "text-neutral-600"}`}>{top}</span>
        <span className="block truncate text-[14px] font-bold text-neutral-900">{name}</span>
        <span className="block text-[12px] text-neutral-500">
          {count} learner{count === 1 ? "" : "s"}
        </span>
      </span>
    </button>
  );
}

// `sections`: the teacher's advisories in the picked year, each with its
// student_count. `value`: the picked advisory_id, "" for all of them.
export default function SectionTiles({ sections, value, onChange, labelledBy }) {
  const single = sections.length === 1;
  const total = sections.reduce((sum, a) => sum + (a.student_count ?? 0), 0);
  return (
    <div role="group" aria-labelledby={labelledBy} className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
      {!single && (
        <Tile
          selected={!value}
          onClick={() => onChange("")}
          icon="ti-users-group"
          top="All my sections"
          name={`${sections.length} sections`}
          count={total}
          label={`All my sections, ${total} learners`}
        />
      )}
      {sections.map((a) => {
        const name = `${a.section}${a.strand ? ` (${a.strand})` : ""}`;
        return (
          <Tile
            key={a.advisory_id}
            selected={single || String(value) === String(a.advisory_id)}
            onClick={() => onChange(single ? "" : String(a.advisory_id))}
            icon={LEVEL_ICONS[a.school_level] ?? "ti-school"}
            top={a.grade_level}
            name={name}
            count={a.student_count ?? 0}
            label={`${a.grade_level} – ${name}, ${a.student_count ?? 0} learners`}
          />
        );
      })}
    </div>
  );
}
