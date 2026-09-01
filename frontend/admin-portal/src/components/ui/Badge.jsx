import { fallbackStatus } from "../../constants/statusMaps";

// Badge / StatusBadge — the one pill used for every status in the app.
//
// StatusBadge is intentionally a thin renderer over a caller-supplied map
// rather than a component that knows every domain's vocabulary: an "unpaid"
// invoice and a "pending" enrollment are different concepts that happen to
// share a shape. The maps live in src/constants/statusMaps.js.

const VARIANTS = {
  success: "bg-success-50 text-success-500",
  warning: "bg-warning-50 text-warning-500",
  error: "bg-error-50 text-error-500",
  info: "bg-info-50 text-info-500",
  muted: "bg-muted-50 text-muted-500",
  accent: "bg-accent-50 text-accent-500",
  brand: "bg-brand-100 text-brand-600",
};

const DOTS = {
  success: "bg-success-dot",
  warning: "bg-warning-dot",
  error: "bg-error-dot",
  info: "bg-info-dot",
  muted: "bg-muted-dot",
  accent: "bg-accent-dot",
  brand: "bg-brand-500",
};

const SIZES = {
  sm: "text-xs px-2 py-0.5 gap-1",
  md: "text-xs px-2.5 py-1 gap-1.5",
};

export default function Badge({
  variant = "muted",
  size = "md",
  dot = false,
  icon,
  className = "",
  children,
  ...props
}) {
  const classes = [
    "inline-flex items-center rounded-full font-bold leading-none",
    VARIANTS[variant] ?? VARIANTS.muted,
    SIZES[size] ?? SIZES.md,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...props}>
      {dot && (
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOTS[variant] ?? DOTS.muted}`}
          aria-hidden="true"
        />
      )}
      {icon && <i className={`ti ${icon} text-[1.05em]`} aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * StatusBadge — renders a status key through a domain map.
 *
 *   <StatusBadge status={s.status} map={STUDENT_STATUS_MAP} />
 *
 * Unknown keys fall back to a humanised label rather than rendering blank, so
 * a new backend status never shows up as an empty pill.
 */
export function StatusBadge({ status, map = {}, showIcon = true, ...props }) {
  const meta = map[status] ?? fallbackStatus(status);
  return (
    <Badge
      variant={meta.variant}
      icon={showIcon ? meta.icon : undefined}
      {...props}
    >
      {meta.label}
    </Badge>
  );
}
