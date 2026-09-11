import { motion, AnimatePresence } from "framer-motion";

// FilterBar — the search + chip-row filter panel that sits above every list
// page's table.
//
// This is a direct port of EnrollmentsPage's filter block, which was the most
// finished version of this UI in the app: 42px controls on a 12px radius, a
// search field that lights up on focus-within, a Clear button that scales in
// only once something is actually filtered, and labelled chip rows beneath a
// divider. It previously lived as ~200 lines of inline-styled JSX duplicated
// between EnrollmentsPage and RequirementsPage, while StudentsPage/Invoices/
// UsersPage hand-built a third, shorter-and-rounder variant of the same thing.
//
// FilterBar owns the chrome (panel, search row, divider); the facets themselves
// are passed as children, so each page keeps control of its own chip rows.

// Focus-within styling can't be expressed on the wrapper with Tailwind alone
// (it keys off the inner input's focus), so it ships as a scoped rule here
// rather than the page-level <style> block EnrollmentsPage used.
const SEARCH_FOCUS_CSS = `
  .filterbar-search:focus-within {
    border-color: #e03131;
    box-shadow: 0 0 0 3px rgba(224, 49, 49, 0.09);
  }
`;

/**
 * FilterRow — a labelled row of facets (the uppercase caption plus its chips).
 * Every filter row in the app repeats this same label treatment.
 */
export function FilterRow({ label, children }) {
  return (
    <div>
      {label && (
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * CollapsibleFilterRow — a FilterRow that's always mounted but animates open
 * and closed, for a facet that only applies once a broader one is chosen (the
 * Grade Level row appearing after a School Level is picked). Staying mounted
 * and animating max-height is what stops it popping in and shoving the rows
 * below it down.
 */
export function CollapsibleFilterRow({ open, label, children, maxHeight = 200 }) {
  return (
    <div
      style={{
        maxHeight: open ? maxHeight : 0,
        opacity: open ? 1 : 0,
        marginTop: open ? 0 : -12,
        overflow: "hidden",
        transition: "max-height 0.22s ease, opacity 0.18s ease, margin-top 0.22s ease",
        pointerEvents: open ? "auto" : "none",
      }}
      aria-hidden={!open}
    >
      <FilterRow label={label}>{children}</FilterRow>
    </div>
  );
}

export default function FilterBar({
  searchValue = "",
  onSearchChange,
  onSearch,
  onClearSearch,
  searchPlaceholder = "Search…",
  searchLabel = "Search",
  searchInputId,
  searchRef,
  extraControls,
  hasFilters = false,
  onClearFilters,
  animate = false,
  animateDelay = 0,
  children,
  className = "",
}) {
  const showSearch = Boolean(onSearchChange);

  const content = (
    <div
      className={`flex flex-col rounded-[14px] border border-neutral-200 bg-white px-5 py-[18px] shadow-[0_2px_12px_rgba(224,49,49,0.05)] ${className}`}
    >
      <style>{SEARCH_FOCUS_CSS}</style>

      {/* Row 1: search + any page-specific controls + Search/Clear */}
      <div className="flex items-center gap-2.5">
        {showSearch && (
          <div className="filterbar-search flex h-[42px] flex-1 items-center gap-2.5 rounded-lg border-[1.5px] border-neutral-300 bg-white px-4 transition-[border-color,box-shadow] duration-150">
            <i className="ti ti-search shrink-0 text-[15px] text-neutral-500" aria-hidden="true" />
            <label htmlFor={searchInputId} className="sr-only">
              {searchLabel}
            </label>
            <input
              id={searchInputId}
              ref={searchRef}
              type="search"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSearch?.(); }}
              className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-neutral-900 outline-none placeholder:text-neutral-500 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {searchValue && (
              <button
                type="button"
                onClick={onClearSearch}
                aria-label="Clear search"
                className="focus-ring flex shrink-0 items-center rounded-sm p-0.5 text-neutral-500 hover:text-brand-600"
              >
                <i className="ti ti-x text-[13px]" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {extraControls}

        {onSearch && (
          <button
            type="button"
            onClick={onSearch}
            className="focus-ring h-[42px] shrink-0 rounded-lg border-[1.5px] border-neutral-300 bg-white px-5 text-[13px] font-semibold text-neutral-700 transition-colors duration-150 hover:border-brand-500 hover:text-brand-600"
          >
            Search
          </button>
        )}

        <AnimatePresence>
          {hasFilters && onClearFilters && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.88 }}
              transition={{ duration: 0.14 }}
              whileTap={{ scale: 0.93 }}
              onClick={onClearFilters}
              className="focus-ring flex h-[42px] shrink-0 items-center gap-[5px] rounded-lg border-[1.5px] border-brand-300 bg-white px-3.5 text-[12px] font-semibold text-error-600"
            >
              <i className="ti ti-filter-off text-[13px]" aria-hidden="true" />
              Clear
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {children && (
        <>
          <div className="my-3.5 h-px bg-neutral-200" />
          <div className="flex flex-col gap-3">{children}</div>
        </>
      )}
    </div>
  );

  if (!animate) return content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: "easeOut", delay: animateDelay }}
    >
      {content}
    </motion.div>
  );
}
