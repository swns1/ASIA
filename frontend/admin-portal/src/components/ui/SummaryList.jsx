// SummaryList / SummaryRow — the label-and-value readback used on a wizard's
// review step and on detail panels.
//
// Extracted from student-form/StudentFormSteps.jsx (ReviewStepSection and
// ReviewStepRow), which drew the same grouped card with inline styles.
// SummaryRow renders nothing when its value is empty, so a review section can
// list every possible field and only the filled ones appear.

/**
 * SummaryList — a titled group of rows.
 */
export default function SummaryList({ icon, title, className = "", children }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-neutral-200 bg-white ${className}`}>
      <div className="flex items-center gap-2.5 border-b border-neutral-200 bg-brand-50 px-4 py-3">
        {icon && <i className={`ti ${icon} text-brand-500`} aria-hidden="true" />}
        <h4 className="text-sm font-bold text-neutral-900">{title}</h4>
      </div>
      <dl className="px-4 py-1">{children}</dl>
    </div>
  );
}

/**
 * SummaryRow — one label/value pair. Renders nothing if `value` is empty.
 */
export function SummaryRow({ label, value }) {
  if (value == null || value === "" || value === false) return null;
  return (
    <div className="flex gap-3 border-b border-neutral-200 py-2 last:border-b-0">
      <dt className="w-[150px] shrink-0 pt-px text-[11px] font-bold uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </dt>
      <dd className="min-w-0 text-sm leading-relaxed text-neutral-900">{value}</dd>
    </div>
  );
}

/**
 * SummaryGroup — separates repeated entries (guardian 2, school 3) inside one
 * SummaryList with a dashed rule, instead of each carrying its own card.
 */
export function SummaryGroup({ first = false, children }) {
  return (
    <div className={first ? "" : "mt-2.5 border-t border-dashed border-neutral-300 pt-2.5"}>
      {children}
    </div>
  );
}
