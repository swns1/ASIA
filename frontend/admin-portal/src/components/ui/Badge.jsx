import { fallbackStatus } from "../../constants/statusMaps";
import { STATUS_DOT, STATUS_TEXT } from "../../constants/statusTones";

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

const DOTS = STATUS_DOT;

const SIZES = {
  sm: "text-xs px-2 py-0.5 gap-1",
  md: "text-xs px-2.5 py-1 gap-1.5",
  // Beside a headline figure, where an 11px pill looks like a footnote.
  lg: "text-sm px-2.5 py-[3px] gap-1",
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

/**
 * StatusDot — a status as a coloured dot and its label, without the pill.
 *
 *   <StatusDot status={en.enrollment_status} map={ENROLLMENT_STATUS_MAP} />
 *
 * For a table that sits under a StatusBand: the dot matches the band's bar
 * and legend, and a column of pills would be heavier than the rows need. The
 * label carries the meaning; the dot only matches it to the band.
 */
export function StatusDot({ status, map = {}, className = "", ...props }) {
  const meta = map[status] ?? fallbackStatus(status);
  return (
    <span
      className={`inline-flex items-center gap-[7px] text-sm font-semibold ${STATUS_TEXT[meta.variant] ?? STATUS_TEXT.muted} ${className}`}
      {...props}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[meta.variant] ?? DOTS.muted}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
