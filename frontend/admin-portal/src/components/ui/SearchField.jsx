// SearchField — the search box at the start of a list page's toolbar
// (Students, Enrollments). The page searches as you type, debounced; Enter
// just doesn't wait, and the × clears it.
//
// It grows to fill the toolbar from a 320px basis, so the filter pills beside
// it keep their size and wrap to a second line before the box gets cramped.
//
// onKeyDown and inputProps are for a box that drives a list of suggestions
// (the dashboard's student finder): arrow keys, and the combobox ARIA.
export default function SearchField({
  id,
  label,
  placeholder,
  value,
  onChange,
  onEnter,
  onClear,
  inputRef,
  onKeyDown,
  inputProps,
}) {
  return (
    <div className="flex h-10 flex-1 basis-80 items-center gap-2.5 rounded-lg border-[1.5px] border-neutral-300 bg-white px-3.5 transition-[border-color,box-shadow] duration-150 focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-500/[0.09]">
      <i className="ti ti-search shrink-0 text-[15px] text-neutral-500" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...inputProps}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.key === "Enter" && !e.defaultPrevented) onEnter?.();
        }}
        className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-neutral-900 outline-none placeholder:text-neutral-500 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="focus-ring flex shrink-0 items-center rounded-sm p-0.5 text-neutral-500 hover:text-brand-600"
        >
          <i className="ti ti-x text-[13px]" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
