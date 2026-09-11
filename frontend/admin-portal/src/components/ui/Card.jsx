import { motion } from "framer-motion";
import { SkeletonCard } from "./Skeleton";

// Card / StatCard / Panel — the three container shapes the app actually uses.
// StatCard and Panel absorb the near-identical local components that were
// declared separately inside DashboardPage.jsx, StudentsPage.jsx,
// EnrollmentsPage.jsx and RequirementsPage.jsx.

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
    "w-full rounded-xl border bg-white transition-all duration-150",
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

// Active-state tinting per tone — the tile's border/background/text/icon-chip
// switch to the tone's own color instead of always going brand-red, and the
// icon chip inverts to white so it reads against the tinted background.
const ACTIVE_TONES = {
  brand: "border-brand-500 bg-brand-100",
  success: "border-success-500 bg-success-50",
  warning: "border-warning-500 bg-warning-50",
  error: "border-error-500 bg-error-50",
  info: "border-info-500 bg-info-50",
  muted: "border-muted-500 bg-muted-50",
  accent: "border-accent-500 bg-accent-50",
};

const ACTIVE_TEXT_TONES = {
  brand: "text-brand-600",
  success: "text-success-500",
  warning: "text-warning-500",
  error: "text-error-500",
  info: "text-info-500",
  muted: "text-muted-500",
  accent: "text-accent-500",
};

const HOVER_GLOW_TONES = {
  brand: "0 8px 24px rgba(224,49,49,0.18)",
  success: "0 8px 24px rgba(46,107,13,0.18)",
  warning: "0 8px 24px rgba(133,79,11,0.18)",
  error: "0 8px 24px rgba(155,32,32,0.18)",
  info: "0 8px 24px rgba(20,85,160,0.18)",
  muted: "0 8px 24px rgba(92,87,82,0.18)",
  accent: "0 8px 24px rgba(124,58,237,0.18)",
};
const HOVER_GLOW_REST = "0 8px 24px rgba(0,0,0,0.08)";

/**
 * StatCard — the labelled metric tile used across the dashboard and every list
 * page's summary strip. Often doubles as a filter toggle, hence `active`.
 *
 * `layout="horizontal"` renders the icon chip on the left with the value and
 * label stacked to its right (EnrollmentsPage's original design, now the
 * standard); `layout="vertical"` keeps the label-over-value / icon-top-right
 * arrangement used before the horizontal design existed. Both share the same
 * tone system, active/hover tinting, and loading state.
 *
 * `animate` opts into the entrance stagger + hover glow (EnrollmentsPage used
 * a page-level motion.div per card for this); pass `animateDelay` for stagger.
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
  layout = "horizontal",
  animate = false,
  animateDelay = 0,
  children,
  className = "",
  ...props
}) {
  const isInteractive = Boolean(onClick);
  const toneClass = ICON_TONES[iconTone] ?? ICON_TONES.brand;
  const activeToneClass = ACTIVE_TONES[iconTone] ?? ACTIVE_TONES.brand;
  const activeTextClass = ACTIVE_TEXT_TONES[iconTone] ?? ACTIVE_TEXT_TONES.brand;
  const glow = HOVER_GLOW_TONES[iconTone] ?? HOVER_GLOW_TONES.brand;

  const cardClassName = [
    active ? activeToneClass : "",
    layout === "horizontal" ? "flex items-center gap-3.5" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const iconChip = icon && (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ${
        active ? "bg-white " + activeTextClass : toneClass
      }`}
    >
      <i className={`ti ${icon} text-[17px]`} aria-hidden="true" />
    </div>
  );

  const body = loading ? (
    <SkeletonCard />
  ) : layout === "horizontal" ? (
    <>
      {iconChip}
      <div className="min-w-0">
        <div className={`text-xl font-bold leading-none ${active ? activeTextClass : "text-neutral-900"}`}>
          {value}
        </div>
        <div
          className={`mt-1 truncate text-xs font-medium uppercase tracking-[0.06em] ${
            active ? activeTextClass : "text-neutral-500"
          }`}
        >
          {label}
        </div>
        {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
        {children}
      </div>
    </>
  ) : (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={`truncate text-xs font-bold uppercase tracking-[0.08em] ${
              active ? activeTextClass : "text-neutral-500"
            }`}
          >
            {label}
          </div>
          <div className={`mt-1.5 text-xl font-bold ${active ? activeTextClass : "text-neutral-900"}`}>
            {value}
          </div>
        </div>
        {iconChip}
      </div>
      {hint && <div className="mt-2 text-xs text-neutral-500">{hint}</div>}
      {children}
    </>
  );

  const card = (
    <Card
      padding="md"
      interactive={isInteractive}
      active={active}
      onClick={onClick}
      className={cardClassName}
      {...props}
    >
      {body}
    </Card>
  );

  if (!animate) return card;

  return (
    <motion.div
      initial={{ y: 14, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      whileHover={isInteractive ? { boxShadow: active ? glow : HOVER_GLOW_REST } : undefined}
      whileTap={isInteractive ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.28, ease: "easeOut", delay: animateDelay }}
    >
      {card}
    </motion.div>
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
