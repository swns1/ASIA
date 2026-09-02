// ChipGroup — the row of pill filters used for status/level/sex facets.
//
// Consolidates the `.chip-btn` rules from AppLayout's injected <style> block
// and the per-page copies in StudentsPage, InvoicesPage and EnrollmentsPage.
//
// Hover/selected states are plain CSS transitions rather than framer-motion
// `animate` props: mixing the two on the same property makes whichever writes
// last win, which is how the old chips ended up with stuck hover styles.

export default function ChipGroup({
  options = [],
  value,
  onChange,
  label,
  size = "md",
  className = "",
}) {
  const sizeClass = size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-3.5 text-xs";

  return (
    <div
      role="group"
      aria-label={label}
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange?.(opt.value)}
            aria-pressed={selected}
            className={[
              "focus-ring inline-flex items-center gap-1.5 rounded-full border-[1.5px] font-semibold transition-colors duration-150",
              sizeClass,
              selected
                ? "border-brand-500 bg-brand-100 text-brand-600"
                : "border-neutral-300 bg-white text-neutral-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600",
            ].join(" ")}
          >
            {opt.icon && <i className={`ti ${opt.icon} text-[13px]`} aria-hidden="true" />}
            {opt.label}
            {opt.count != null && (
              <span
                className={`rounded-full px-1.5 text-[10px] font-bold ${
                  selected ? "bg-brand-200 text-brand-600" : "bg-neutral-200 text-neutral-600"
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
