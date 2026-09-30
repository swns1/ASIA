import { Link } from "react-router-dom";

// Breadcrumbs — new to the app. Detail pages previously offered only a lone
// "← Back" link, which tells you nothing about where you are in the hierarchy.
//
// An item is one of three things:
//   { label }             — plain text (the current page, or a level with no
//                           page of its own).
//   { label, to }         — a real <Link>.
//   { label, onClick }    — a button that looks like a link. This is for a
//                           crumb that must not navigate straight away: the
//                           form pages route it through their "discard this?"
//                           confirm so a stray click can't drop a half-filled
//                           form. `to` is still given alongside it so the
//                           crumb carries a real href for middle-click and
//                           "open in new tab"; onClick wins for a plain click.
export default function Breadcrumbs({ items = [], className = "" }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-neutral-500">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const interactive = !isLast && (item.to || item.onClick);
          const linkClasses =
            "focus-ring rounded-sm transition-colors hover:text-brand-600 hover:underline";
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && (
                <i className="ti ti-chevron-right text-[13px] text-neutral-400" aria-hidden="true" />
              )}
              {!interactive ? (
                // The current page is marked, not linked — it's where you are.
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={isLast ? "max-w-[22ch] truncate font-semibold text-neutral-700" : ""}
                >
                  {item.label}
                </span>
              ) : item.onClick ? (
                <Link
                  to={item.to ?? "#"}
                  onClick={(e) => {
                    e.preventDefault();
                    item.onClick(e);
                  }}
                  className={linkClasses}
                >
                  {item.label}
                </Link>
              ) : (
                <Link to={item.to} className={linkClasses}>
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
