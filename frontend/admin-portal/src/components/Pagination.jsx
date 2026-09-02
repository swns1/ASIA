// Pagination.jsx
//
// Shared "page X of Y · N total records" + prev/windowed-numbers/next control,
// extracted from the near-identical inline block repeated across GradesPage,
// StudentsPage, EnrollmentsPage, and several other list pages.
//
// Same props as before. Restyled onto design tokens, and the page buttons are
// now a real <nav> with accessible names — previously they were unlabelled
// icon buttons that a screen reader announced as just "button".

const BTN =
  "focus-ring inline-flex h-8 min-w-8 items-center justify-center rounded-sm border px-2 text-xs " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const BTN_IDLE =
  "border-neutral-300 bg-white text-neutral-600 hover:enabled:border-brand-500 hover:enabled:bg-brand-100 hover:enabled:text-brand-600";
const BTN_ACTIVE = "border-brand-500 bg-brand-100 font-bold text-brand-600";

export default function Pagination({
  page,
  totalPages,
  count,
  hasPrevious,
  hasNext,
  onPageChange,
}) {
  const windowSize = Math.min(totalPages, 5);
  const start = Math.min(Math.max(1, page - 2), Math.max(1, totalPages - windowSize + 1));
  const pages = Array.from({ length: windowSize }, (_, i) => start + i);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-neutral-500">
        Page <strong className="text-neutral-700">{page}</strong> of{" "}
        <strong className="text-neutral-700">{totalPages || 1}</strong>
        &nbsp;·&nbsp; {count.toLocaleString()} total records
      </span>

      <nav aria-label="Pagination" className="flex items-center gap-1">
        <button
          type="button"
          className={`${BTN} ${BTN_IDLE}`}
          disabled={!hasPrevious}
          aria-label="Previous page"
          onClick={() => onPageChange(page - 1)}
        >
          <i className="ti ti-chevron-left text-[13px]" aria-hidden="true" />
        </button>

        {pages.map((p) => (
          <button
            key={p}
            type="button"
            className={`${BTN} ${p === page ? BTN_ACTIVE : BTN_IDLE}`}
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ))}

        <button
          type="button"
          className={`${BTN} ${BTN_IDLE}`}
          disabled={!hasNext}
          aria-label="Next page"
          onClick={() => onPageChange(page + 1)}
        >
          <i className="ti ti-chevron-right text-[13px]" aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}
