import { Link } from "react-router-dom";

// Breadcrumbs — new to the app. Detail pages previously offered only a lone
// "← Back" link, which tells you nothing about where you are in the hierarchy.

export default function Breadcrumbs({ items = [], className = "" }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-neutral-500">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && (
                <i className="ti ti-chevron-right text-[13px] text-neutral-400" aria-hidden="true" />
              )}
              {isLast || !item.to ? (
                // The current page is marked, not linked — it's where you are.
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={isLast ? "max-w-[22ch] truncate font-semibold text-neutral-700" : ""}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.to}
                  className="focus-ring rounded-sm transition-colors hover:text-brand-500 hover:underline"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
