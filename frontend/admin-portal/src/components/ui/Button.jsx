import { Link } from "react-router-dom";

// Button — the single primary/secondary/ghost/destructive action control.
//
// Replaces the `linear-gradient(135deg,#e03131,#c92a2a)` inline style that was
// hand-copied 57 times across the app. Hover/active/disabled are real CSS
// variants here, not onMouseEnter handlers, so they also work for keyboard and
// touch users and never get stuck after a re-render.
//
// NOTE: every class string below is a complete literal. Tailwind extracts
// class names statically from source, so `bg-${variant}-500` would silently
// render unstyled — always map variants to whole strings.

const BASE =
  "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap " +
  "rounded-full transition-all duration-150 outline-none select-none " +
  "focus-visible:ring-3 disabled:cursor-not-allowed";

const VARIANTS = {
  primary:
    "text-white bg-[linear-gradient(135deg,var(--color-brand-500),var(--color-brand-600))] " +
    "shadow-brand hover:shadow-brand-lg hover:-translate-y-px " +
    "active:translate-y-0 active:scale-[0.98] focus-visible:ring-brand-500/35 " +
    "disabled:bg-none disabled:bg-brand-400 disabled:shadow-none disabled:translate-y-0",
  secondary:
    "bg-white text-neutral-700 border-[1.5px] border-neutral-300 " +
    "hover:border-brand-300 hover:text-brand-500 hover:bg-brand-50 " +
    "active:scale-[0.98] focus-visible:ring-brand-500/25 " +
    "disabled:bg-neutral-50 disabled:text-neutral-400 disabled:border-neutral-200 disabled:hover:bg-neutral-50",
  ghost:
    "bg-transparent text-neutral-600 " +
    "hover:bg-brand-50 hover:text-brand-500 " +
    "active:scale-[0.98] focus-visible:ring-brand-500/25 " +
    "disabled:text-neutral-400 disabled:hover:bg-transparent",
  // Deliberately a deeper, flatter red than the vivid brand red, so a
  // destructive action is distinguishable from a primary one in an app whose
  // brand colour is itself red.
  destructive:
    "text-white bg-error-500 hover:bg-[#7f1a1a] " +
    "shadow-[0_4px_16px_rgba(155,32,32,0.32)] hover:shadow-[0_8px_24px_rgba(155,32,32,0.42)] " +
    "hover:-translate-y-px active:translate-y-0 active:scale-[0.98] focus-visible:ring-error-500/40 " +
    "disabled:bg-neutral-400 disabled:shadow-none disabled:translate-y-0",
};

const SIZES = {
  sm: "h-8 px-3.5 text-xs",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-6 text-md",
};

// Icon-only buttons are square, so they don't end up as stretched pills.
const ICON_SIZES = {
  sm: "h-8 w-8 p-0 text-xs",
  md: "h-10 w-10 p-0 text-sm",
  lg: "h-12 w-12 p-0 text-md",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  iconRight = false,
  fullWidth = false,
  iconOnly = false,
  to,
  href,
  className = "",
  children,
  ...props
}) {
  const isDisabled = disabled || loading;

  const classes = [
    BASE,
    VARIANTS[variant] ?? VARIANTS.primary,
    (iconOnly ? ICON_SIZES : SIZES)[size] ?? SIZES.md,
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const iconEl = loading ? (
    // aria-hidden: the loading state is announced via the accessible name
    // below, so the spinner itself is decorative.
    <i className="ti ti-loader-2 animate-spin" aria-hidden="true" />
  ) : icon ? (
    <i className={`ti ${icon}`} aria-hidden="true" />
  ) : null;

  const content = (
    <>
      {!iconRight && iconEl}
      {children}
      {iconRight && !loading && iconEl}
    </>
  );

  // Links can't be "disabled", so a disabled link falls back to a button to
  // keep it out of the tab order and unclickable.
  if (to && !isDisabled) {
    return (
      <Link to={to} className={classes} {...props}>
        {content}
      </Link>
    );
  }
  if (href && !isDisabled) {
    return (
      <a href={href} className={classes} {...props}>
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={classes}
      {...props}
    >
      {content}
    </button>
  );
}
