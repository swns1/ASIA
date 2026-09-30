// SegmentedControl — a few mutually exclusive choices as a row of buttons,
// the chosen one filled: a view switch (Charts / Tables), or which of a
// handful of things a chart shows.
//
// Not ChipGroup: chips are filters, pale when chosen and pill-shaped, and a
// row of them reads as "narrow this list". Filled buttons with square-ish
// corners read as "show this instead". Not Tabs either: there are no tab
// panels, and a two-button switch doesn't need arrow-key roving.
//
// Every class string is a complete literal, as Tailwind needs.

const SIZES = {
  md: "gap-1.5 px-3.5 py-1.5 text-[12px]",
  sm: "gap-1 px-2.5 py-1 text-xs",
};

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  label,
  size = "md",
  className = "",
}) {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap gap-1.5 ${className}`}>
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange?.(opt.value)}
            className={[
              "focus-ring inline-flex items-center rounded-sm border-[1.5px] font-semibold transition-colors",
              SIZES[size] ?? SIZES.md,
              on
                ? "border-brand-500 bg-brand-500 text-white"
                : "border-neutral-300 bg-white text-neutral-600 hover:border-brand-300 hover:text-brand-600",
            ].join(" ")}
          >
            {opt.icon && <i className={`ti ${opt.icon} text-[14px]`} aria-hidden="true" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
