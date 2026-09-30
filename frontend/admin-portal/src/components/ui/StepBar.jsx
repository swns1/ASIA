import { motion, AnimatePresence } from "framer-motion";
import useMediaQuery from "../../hooks/useMediaQuery";

// StepBar — the numbered progress indicator for any multi-step form.
//
// Moved here from pages/student-form/StudentFormSteps.jsx, where it was ~100
// lines of inline style objects shared by the staff registration wizard and
// the applicant kiosk. Now Tailwind tokens, so it matches the rest of the
// design system and a colour change happens in tokens.css rather than in
// eight style literals.
//
// `steps` is [{ id, label, icon }]. `size` picks the touch scale: "md" is the
// desk default, "lg" the kiosk variant for a standing device. Narrow screens
// always fall back to "md" and show only the current step's label — six large
// circles with every label spelled out need ~520px, which pushed the
// applicant form 128px past a phone screen and scrolled the whole page
// sideways.

const SIZES = {
  md: {
    circle: "h-9 w-9",
    icon: "text-base",
    iconDone: "text-sm",
    label: "text-[11px]",
    labelGap: "mb-5",
  },
  lg: {
    circle: "h-14 w-14",
    icon: "text-2xl",
    iconDone: "text-xl",
    label: "text-[13px]",
    labelGap: "mb-6",
  },
};

export default function StepBar({
  steps = [],
  current = 0,
  onStepClick,
  size = "md",
  className = "",
}) {
  const narrow = useMediaQuery("(max-width: 639px)");
  const dims = narrow ? SIZES.md : (SIZES[size] ?? SIZES.md);

  return (
    <nav
      aria-label="Progress"
      className={`flex max-w-full items-center overflow-x-auto ${className}`}
    >
      <ol className="flex w-full items-center">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const clickable = i !== current && typeof onStepClick === "function";
          return (
            <li
              key={s.id}
              className={`flex items-center ${i < steps.length - 1 ? "flex-1" : ""}`}
            >
              <button
                type="button"
                onClick={clickable ? () => onStepClick(i) : undefined}
                disabled={!clickable}
                aria-current={active ? "step" : undefined}
                title={clickable ? `Go to ${s.label}` : undefined}
                className={`focus-ring flex flex-col items-center gap-1 rounded-md ${
                  clickable ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <motion.span
                  animate={active ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                  transition={
                    active
                      ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
                      : { duration: 0.2 }
                  }
                  whileHover={clickable ? { scale: 1.1 } : undefined}
                  whileTap={clickable ? { scale: 0.93 } : undefined}
                  className={[
                    "flex shrink-0 items-center justify-center rounded-full border-2 font-bold",
                    dims.circle,
                    done
                      ? "border-brand-500 bg-brand-500 text-white"
                      : active
                        ? "border-brand-500 bg-brand-100 text-brand-500"
                        : "border-brand-border-soft bg-brand-50 text-neutral-500",
                  ].join(" ")}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {done ? (
                      <motion.i
                        key="check"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        className={`ti ti-check ${dims.iconDone}`}
                        aria-hidden="true"
                      />
                    ) : (
                      <motion.i
                        key="icon"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.15 }}
                        className={`ti ${s.icon} ${dims.icon}`}
                        aria-hidden="true"
                      />
                    )}
                  </AnimatePresence>
                </motion.span>
                <span
                  className={[
                    "whitespace-nowrap uppercase tracking-[0.04em]",
                    dims.label,
                    active
                      ? "font-bold text-brand-600"
                      : done
                        ? "font-medium text-neutral-700"
                        : "font-medium text-neutral-500",
                  ].join(" ")}
                >
                  {/* On a phone only the step you're on is named; the rest
                      are dots, so the bar fits without scrolling the page. */}
                  {narrow && !active ? <span className="sr-only">{s.label}</span> : s.label}
                </span>
              </button>

              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`mx-1.5 h-0.5 flex-1 transition-colors duration-300 ${dims.labelGap} ${
                    done ? "bg-brand-500" : "bg-brand-border-soft"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
