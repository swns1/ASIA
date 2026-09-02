import Breadcrumbs from "./Breadcrumbs";

// PageHeader — one header for every page.
//
// Replaces the topbar <div> that each page styled slightly differently (some
// 58px, some 64px, different title sizes and gaps). Not an extra bar: it takes
// the place of the one each page already drew.

export default function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  icon,
  sticky = true,
  className = "",
  children,
}) {
  return (
    <header
      className={[
        "border-b border-neutral-200 bg-white px-6 py-4 shadow-xs",
        sticky ? "sticky top-0 z-30" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {breadcrumbs?.length > 0 && <Breadcrumbs items={breadcrumbs} className="mb-1.5" />}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-600">
              <i className={`ti ${icon} text-[18px]`} aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-[-0.01em] text-neutral-900">
              {title}
            </h1>
            {subtitle && <p className="truncate text-sm text-neutral-500">{subtitle}</p>}
          </div>
        </div>

        {/* Actions wrap to their own line on narrow screens rather than
            squeezing the title. */}
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children}
    </header>
  );
}
