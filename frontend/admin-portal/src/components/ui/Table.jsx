import EmptyState from "../EmptyState";
import ErrorState from "./ErrorState";
import { SkeletonTableRow } from "./Skeleton";

// Table — the shared data-table shell.
//
// Codifies the structure every list page was rebuilding by hand: sticky
// uppercase header, skeleton rows while loading, an empty state, and — new —
// a real error state. Previously a failed fetch fell through to the empty
// state, so an outage looked like "no records yet".
//
// Body rows are passed as children so pages keep full control of their cells:
//   <Table columns={COLS} loading={loading} error={err} onRetry={load} isEmpty={!rows.length}>
//     {rows.map((r) => <TableRow key={r.id} onClick={...}>…</TableRow>)}
//   </Table>

const ALIGN = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export default function Table({
  columns = [],
  children,
  loading = false,
  error = null,
  onRetry,
  errorSubject = "this list",
  isEmpty = false,
  empty = {},
  skeletonRows = 7,
  sortKey,
  sortDir = "asc",
  onSort,
  stickyHeader = true,
  className = "",
  ...props
}) {
  const colCount = columns.length || 1;

  // Precedence matters: an error must win over "empty", otherwise a failed
  // load silently renders as a legitimate empty result.
  const body = error ? (
    <tr>
      <td colSpan={colCount} className="p-0">
        <ErrorState error={error} subject={errorSubject} onRetry={onRetry} />
      </td>
    </tr>
  ) : loading ? (
    Array.from({ length: skeletonRows }).map((_, i) => (
      <SkeletonTableRow key={i} columns={colCount} withAvatar={empty.withAvatar !== false} />
    ))
  ) : isEmpty ? (
    <tr>
      <td colSpan={colCount} className="p-0">
        <EmptyState {...empty} />
      </td>
    </tr>
  ) : (
    children
  );

  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-sm" {...props}>
        <thead>
          <tr>
            {columns.map((col) => {
              const sortable = col.sortable && onSort;
              const isSorted = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  style={col.width ? { width: col.width } : undefined}
                  // aria-sort tells screen readers the current ordering, which
                  // a visual caret alone doesn't convey.
                  aria-sort={isSorted ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                  className={[
                    "border-b border-neutral-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-neutral-500",
                    ALIGN[col.align] ?? ALIGN.left,
                    stickyHeader ? "sticky top-0 z-10" : "",
                    col.className ?? "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-sm uppercase tracking-[0.08em] transition-colors hover:text-brand-500"
                    >
                      {col.label}
                      <i
                        className={`ti ${
                          isSorted
                            ? sortDir === "asc"
                              ? "ti-sort-ascending"
                              : "ti-sort-descending"
                            : "ti-arrows-sort"
                        } text-[13px] ${isSorted ? "text-brand-500" : "opacity-50"}`}
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}

/**
 * TableRow — replaces the six duplicate `.student-row` / `.inv-row` /
 * `.pay-row` / `.sch-row` / `.audit-row` hover rules that lived in AppLayout's
 * injected <style> block.
 *
 * A clickable row is also keyboard-operable here (Enter/Space), which the old
 * mouse-only onClick rows were not.
 */
export function TableRow({ onClick, className = "", children, ...props }) {
  const clickable = Boolean(onClick);

  function handleKeyDown(e) {
    if (!clickable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(e);
    }
  }

  return (
    <tr
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={clickable ? 0 : undefined}
      role={clickable ? "button" : undefined}
      className={[
        "group border-b border-neutral-200/70 transition-colors",
        clickable
          ? "cursor-pointer hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500"
          : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableCell({ align = "left", className = "", children, ...props }) {
  return (
    <td
      className={`px-4 py-3.5 text-neutral-800 ${ALIGN[align] ?? ALIGN.left} ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}
