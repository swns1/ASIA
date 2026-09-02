import { SkeletonCard } from "./Skeleton";

// Card / StatCard / Panel — the three container shapes the app actually uses.
// StatCard and Panel absorb the near-identical local components that were
// declared separately inside DashboardPage.jsx and StudentsPage.jsx.

const PADDING = {
  none: "",
  sm: "p-3.5",
  md: "p-5",
  lg: "p-6",
};

export default function Card({
  padding = "md",
  interactive = false,
  active = false,
  className = "",
  children,
  ...props
}) {
  const classes = [
    "rounded-xl border bg-white transition-all duration-150",
    active ? "border-brand-500 shadow-md" : "border-neutral-200 shadow-sm",
    interactive
      ? "focus-ring cursor-pointer text-left hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
      : "",
    PADDING[padding] ?? PADDING.md,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // An interactive card is a real button so it's keyboard-reachable and
  // announced as actionable, rather than a div with an onClick.
  const Tag = interactive ? "button" : "div";

  return (
    <Tag className={classes} aria-pressed={interactive ? active : undefined} {...props}>
      {children}
    </Tag>
  );
}

const ICON_TONES = {
  brand: "bg-brand-100 text-brand-600",
  success: "bg-success-50 text-success-500",
  warning: "bg-warning-50 text-warning-500",
  error: "bg-error-50 text-error-500",
  info: "bg-info-50 text-info-500",
  muted: "bg-muted-50 text-muted-500",
  accent: "bg-accent-50 text-accent-500",
};

/**
 * StatCard — the labelled metric tile used across the dashboard and every list
 * page's summary strip. Often doubles as a filter toggle, hence `active`.
 */
export function StatCard({
  label,
  value,
  icon,
  iconTone = "brand",
  hint,
  loading = false,
  active = false,
  onClick,
  children,
  className = "",
  ...props
}) {
  return (
    <Card
      padding="md"
      interactive={Boolean(onClick)}
      active={active}
      onClick={onClick}
      className={className}
      {...props}
    >
      {loading ? (
        <SkeletonCard />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">
                {label}
              </div>
              <div className="mt-1.5 text-xl font-bold text-neutral-900">{value}</div>
            </div>
            {icon && (
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                  ICON_TONES[iconTone] ?? ICON_TONES.brand
                }`}
              >
                <i className={`ti ${icon} text-[17px]`} aria-hidden="true" />
              </div>
            )}
          </div>
          {hint && <div className="mt-2 text-xs text-neutral-500">{hint}</div>}
          {children}
        </>
      )}
    </Card>
  );
}

/**
 * Panel — titled content block with an optional right-aligned action, used for
 * dashboard widgets and grouped detail sections.
 */
export function Panel({
  title,
  subtitle,
  icon,
  action,
  padding = "md",
  className = "",
  bodyClassName = "",
  children,
  ...props
}) {
  return (
    <Card padding="none" className={`flex flex-col ${className}`} {...props}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <i className={`ti ${icon} text-brand-600`} aria-hidden="true" />}
            <div className="min-w-0">
              {title && <h3 className="truncate text-sm font-bold text-neutral-900">{title}</h3>}
              {subtitle && <p className="truncate text-xs text-neutral-500">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={`${PADDING[padding] ?? PADDING.md} min-h-0 flex-1 ${bodyClassName}`}>
        {children}
      </div>
    </Card>
  );
}
