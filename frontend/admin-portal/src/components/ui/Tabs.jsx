import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Tabs — shared tab list + animated panel.
//
// Absorbs the hand-rolled `tabDirection` state machine in StudentDetailPage and
// the separate local tab logic in InvoiceDetail. Adds the WAI-ARIA tabs
// keyboard contract (arrow keys, Home/End, roving tabindex), which neither
// hand-rolled version had.
//
// The active-tab/direction state lives in the useTabs hook (src/hooks/useTabs.js).

export default function Tabs({
  tabs = [],
  value,
  onChange,
  variant = "underline",
  className = "",
  ...props
}) {
  const listRef = useRef(null);

  // Arrow keys move between tabs and activate them (automatic activation),
  // which is the expected behaviour for lightweight tab sets like these.
  function handleKeyDown(e) {
    const idx = tabs.findIndex((t) => t.id === value);
    if (idx === -1) return;

    let next = null;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === null) return;

    e.preventDefault();
    onChange?.(tabs[next].id);
    listRef.current?.querySelectorAll("[role='tab']")[next]?.focus();
  }

  const isPill = variant === "pill";

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={handleKeyDown}
      className={[
        "flex items-center gap-1 overflow-x-auto",
        isPill ? "" : "border-b border-neutral-200",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`tabpanel-${tab.id}`}
            // Roving tabindex: only the selected tab is in the tab order.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange?.(tab.id)}
            className={[
              "focus-ring relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors",
              isPill ? "rounded-full px-4 py-2" : "px-4 py-2.5",
              selected
                ? isPill
                  ? "bg-brand-100 text-brand-600"
                  : "text-brand-600 after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500"
                : "text-neutral-600 hover:text-brand-600",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {tab.icon && <i className={`ti ${tab.icon} text-[15px]`} aria-hidden="true" />}
            {tab.label}
            {tab.count != null && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
                  selected ? "bg-brand-200 text-brand-600" : "bg-neutral-200 text-neutral-600"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Animated panel that slides in the direction of travel. */
export function TabPanel({ id, direction = 0, className = "", children }) {
  return (
    <AnimatePresence mode="wait" custom={direction} initial={false}>
      <motion.div
        key={id}
        role="tabpanel"
        id={`tabpanel-${id}`}
        aria-labelledby={`tab-${id}`}
        custom={direction}
        initial={{ opacity: 0, x: direction >= 0 ? 16 : -16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction >= 0 ? -16 : 16 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
