import { motion } from "framer-motion";

// ToggleCard / TogglePill — a boolean the user flips by clicking a whole
// block, rather than a bare checkbox.
//
// Both were hand-built inline in student-form/StudentFormSteps.jsx: the 4Ps
// beneficiary switch and the "Set as Primary Contact" star. Each drew its own
// track-and-knob and kept the real <input> at display:none, so neither was
// reachable by keyboard or announced by a screen reader. These render a real
// checkbox and style it, so clicking, tabbing and space-bar all work.

/**
 * ToggleCard — full-width row: icon, title, description, switch on the right.
 */
export function ToggleCard({
  checked = false,
  onChange,
  icon,
  title,
  description,
  name,
  className = "",
}) {
  return (
    <label
      className={[
        "flex cursor-pointer items-center justify-between gap-3 rounded-xl border-[1.5px] px-4 py-3.5 transition-colors duration-150",
        checked
          ? "border-brand-500 bg-brand-100"
          : "border-brand-border-soft bg-white hover:border-brand-300",
        className,
      ].join(" ")}
    >
      <span className="flex min-w-0 items-center gap-3">
        {icon && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ${
              checked ? "bg-brand-500 text-white" : "bg-brand-50 text-neutral-500"
            }`}
          >
            <i className={`ti ${icon} text-base`} aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-sm font-bold text-neutral-900">{title}</span>
          {description && (
            <span className="block text-xs text-neutral-500">{description}</span>
          )}
        </span>
      </span>

      {/* The real control: visually replaced by the track below, but still
          focusable, space-bar-toggleable and announced as a checkbox. */}
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked, e)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 peer-focus-visible:ring-3 peer-focus-visible:ring-brand-500/35 ${
          checked ? "bg-brand-500" : "bg-neutral-400"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </label>
  );
}

/**
 * TogglePill — a compact inline pill with a star/check icon, for a flag set on
 * one item among several (the primary-contact guardian).
 */
export function TogglePill({
  checked = false,
  onChange,
  iconOn = "ti-star-filled",
  iconOff = "ti-star",
  labelOn,
  labelOff,
  name,
  className = "",
}) {
  return (
    <label
      className={[
        "inline-flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-3.5 py-2 text-xs font-bold transition-colors duration-150",
        checked
          ? "border-brand-500 bg-brand-100 text-brand-600"
          : "border-brand-border-soft bg-white text-neutral-500 hover:border-brand-300 hover:text-brand-600",
        className,
      ].join(" ")}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked, e)}
        className="peer sr-only"
      />
      <motion.i
        key={checked ? "on" : "off"}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        className={`ti ${checked ? iconOn : iconOff} text-[13px]`}
        aria-hidden="true"
      />
      <span className="peer-focus-visible:underline">{checked ? labelOn : labelOff}</span>
    </label>
  );
}

export default ToggleCard;
