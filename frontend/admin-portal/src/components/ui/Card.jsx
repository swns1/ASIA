import { motion } from "framer-motion";
import { SkeletonCard } from "./Skeleton";
import BrandBackdrop from "./BrandBackdrop";
import useTheme from "../../hooks/useTheme";
import { CHIP_GLOW } from "../../constants/statusTones";

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
  // Left undefined unless the card is a toggle (StatCard filters pass a
  // boolean). A card that just navigates is a plain button, and aria-pressed
  // on it made screen readers announce "toggle button, not pressed".
  active,
  // In dark mode, draw as the login page's brand panel (dot grid, still red
  // glows, a red under-glow) instead of a card: for the one block a page
  // leads with, as the status band is on the list pages. Light is unchanged.
  // Fields and secondary buttons on it take brandPanel.js's glass classes.
  brandPanel = false,
  className = "",
  children,
  ...props
}) {
  const theme = useTheme();
  const panel = brandPanel && theme === "dark";
  const classes = [
    "w-full rounded-xl border transition-all duration-150",
    panel
      ? "relative isolate border-[rgba(224,49,49,0.26)] bg-brand-950 shadow-panel-glow"
      : [
          "bg-surface",
          // Dark: a faint sheen from the top edge down, over the surface colour.
          "dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_60%)]",
          active ? "border-brand-500 shadow-md" : "border-neutral-200 shadow-sm dark:shadow-card-dark",
        ].join(" "),
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
    <Tag
      className={classes}
      aria-pressed={interactive && active !== undefined ? active : undefined}
      {...props}
    >
      {panel && <BrandBackdrop tone="dark" />}
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

// Dark mode: each tile glows faintly in its tone from the icon's side, like
// the login panel's corner glow. Drawn under the card's sheen, inline, since
// both are background images and a class can't stack the two.
const TONE_RGB = {
  brand: "224,49,49",
  success: "76,175,80",
  warning: "255,152,0",
  error: "244,67,54",
  info: "33,150,243",
  muted: "158,158,158",
  accent: "168,85,247",
};
const CARD_SHEEN = "linear-gradient(180deg,rgba(255,255,255,0.03),transparent 60%)";
const darkTileGlow = (tone, layout) =>
  `radial-gradient(circle at ${layout === "horizontal" ? "0% 50%" : "100% 0%"},rgba(${TONE_RGB[tone] ?? TONE_RGB.brand},0.14),transparent 45%),${CARD_SHEEN}`;

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
 *
 * Two ways to make the tile navigable, and they are not interchangeable:
 *   `onClick`      — the whole card becomes a <button>. Use for tiles whose
 *                    only job is to navigate or toggle a filter.
 *   `onValueClick` — only the value becomes a button; the card stays a <div>.
 *                    Use whenever the tile also contains its own controls
 *                    (filter buttons, selects). Nesting those inside a button
 *                    is invalid HTML and makes them keyboard-unreachable, so a
 *                    tile with controls must take this path, not `onClick`.
 * Pass `trailing` for controls pinned to the card's right edge; it renders
 * outside the text column so long labels can't push it out of alignment.
 *
 * `iconStyle` colours the icon chip directly ({ background, color }) for a
 * tile whose colour isn't one of the tones -- the risk levels, which carry
 * their own reserved status palette. It replaces the tone's chip colours
 * except while the tile is active.
 */
export function StatCard({
  label,
  value,
  icon,
  iconTone = "brand",
  iconStyle,
  hint,
  loading = false,
  active = false,
  onClick,
  onValueClick,
  valueLabel,
  trailing,
  layout = "horizontal",
  animate = false,
  animateDelay = 0,
  children,
  className = "",
  style,
  ...props
}) {
  const dark = useTheme() === "dark";
  const isInteractive = Boolean(onClick);
  const toneClass = `${ICON_TONES[iconTone] ?? ICON_TONES.brand} ${CHIP_GLOW[iconTone] ?? CHIP_GLOW.brand}`;
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

  const customChip = Boolean(iconStyle) && !active;
  const iconChip = icon && (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ${
        active ? "bg-surface " + activeTextClass : customChip ? "" : toneClass
      }`}
      style={customChip ? iconStyle : undefined}
    >
      <i className={`ti ${icon} text-[17px]`} aria-hidden="true" />
    </div>
  );

  // The value, optionally wrapped so it alone is clickable. `onClick` already
  // makes the whole card a button, so wrapping again there would nest buttons.
  const valueNode =
    onValueClick && !isInteractive ? (
      <button
        type="button"
        onClick={onValueClick}
        aria-label={valueLabel}
        className="focus-ring rounded-sm text-left transition-colors hover:text-brand-600"
      >
        {value}
      </button>
    ) : (
      value
    );

  // The skeleton mirrors the layout it stands in for — same icon chip, same
  // two text lines at the same sizes — so the card doesn't change height or
  // width when the real values arrive. A generic vertical skeleton under a
  // horizontal card made every tile jump as data loaded.
  const body = loading ? (
    layout === "horizontal" ? (
      <>
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-md bg-brand-200" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="h-5 w-16 animate-pulse rounded bg-brand-200" aria-hidden="true" />
          <div className="mt-1 h-4 w-24 animate-pulse rounded bg-brand-200" aria-hidden="true" />
        </div>
      </>
    ) : (
      <SkeletonCard />
    )
  ) : layout === "horizontal" ? (
    <>
      {iconChip}
      <div className="min-w-0 flex-1">
        <div className={`text-xl font-bold leading-none ${active ? activeTextClass : "text-neutral-900"}`}>
          {valueNode}
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
      {trailing && <div className="shrink-0 self-start">{trailing}</div>}
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
            {valueNode}
          </div>
        </div>
        {trailing ?? iconChip}
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
      style={dark && !active ? { backgroundImage: darkTileGlow(iconTone, layout), ...style } : style}
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
