import Breadcrumbs from "./Breadcrumbs";
import { CHIP_GLOW } from "../../constants/statusTones";

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
        "border-b border-neutral-200 bg-surface px-6 py-4 shadow-xs",
        // Dark: glass over the page's glow, so the header picks up its red at
        // the right-hand end.
        "dark:border-white/[0.06] dark:bg-surface/70 dark:shadow-none dark:backdrop-blur-[14px] dark:backdrop-saturate-[1.4]",
        // Sticky positions the hairline below as well as `relative` would.
        sticky ? "sticky top-0 z-30" : "relative",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Dark: a red hairline along the bottom edge, fading out to the right. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -bottom-px hidden h-px bg-[linear-gradient(90deg,rgba(224,49,49,0.65),rgba(224,49,49,0.15)_45%,transparent_80%)] dark:block"
      />

      {breadcrumbs?.length > 0 && <Breadcrumbs items={breadcrumbs} className="mb-1.5" />}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-600 ${CHIP_GLOW.brand}`}>
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
