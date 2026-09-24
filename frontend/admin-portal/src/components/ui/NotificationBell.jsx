import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Button from "./Button";

// NotificationBell — a bell for the page header that holds "things needing
// attention".
//
// Replaces the row of alert chips DashboardPage drew above its stat cards. A
// red dot on the bell says there is something to look at; the list opens on
// click. There is deliberately no count on the bell: the dot answers "is there
// anything?", and each row already carries its own number.
//
// It is a disclosure, not a menu: the button toggles a panel of ordinary links
// that follows it in tab order, so no focus juggling or arrow-key handling is
// needed to reach them.
//
// `items`: [{ id, icon, tone: "error" | "warning", message, hint?, link }]

const TONES = {
  error: "bg-error-50 text-error-500",
  warning: "bg-warning-50 text-warning-500",
};

export default function NotificationBell({ items = [] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();
  const hasItems = items.length > 0;

  // Outside click and Escape close it. `mousedown` rather than `click`, same
  // as SchoolYearPicker, so the panel is gone before a click lands on whatever
  // is underneath it.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      {/* The icon is passed as a child, not `icon`, so it can be sized up
          without fighting Button's own text-sm. The open state is styled off
          aria-expanded: variant utilities always sort after the base ones, so
          these win over the secondary variant's bg-white and border. */}
      <Button
        ref={buttonRef}
        variant="secondary"
        iconOnly
        className="aria-expanded:border-brand-300 aria-expanded:bg-brand-50 aria-expanded:text-brand-600"
        title="Notifications"
        aria-label={
          hasItems
            ? `Notifications, ${items.length} need${items.length === 1 ? "s" : ""} your attention`
            : "Notifications, nothing new"
        }
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <i className="ti ti-bell text-[18px]" aria-hidden="true" />
      </Button>
      {hasItems && (
        <span
          className="pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white"
          aria-hidden="true"
        />
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            // z-40 matches SchoolYearPicker: above page content, under Modal.
            className="absolute right-0 top-[calc(100%+8px)] z-40 w-[min(400px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg"
          >
            <div className="flex items-baseline justify-between gap-3 border-b border-neutral-200 px-4 pb-3 pt-4">
              <h2 className="text-md font-bold text-neutral-900">Notifications</h2>
              <span className="text-sm text-neutral-500">
                {hasItems
                  ? `${items.length} need${items.length === 1 ? "s" : ""} your attention`
                  : "Nothing new"}
              </span>
            </div>

            {hasItems ? (
              <>
                <ul className="divide-y divide-neutral-200">
                  {items.map((item) => (
                    <li key={item.id}>
                      <Link
                        to={item.link}
                        onClick={() => setOpen(false)}
                        className="focus-ring flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-brand-50"
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                            TONES[item.tone] ?? TONES.warning
                          }`}
                        >
                          <i className={`ti ${item.icon} text-[17px]`} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-neutral-900">{item.message}</span>
                          {item.hint && <span className="mt-0.5 block text-sm text-neutral-600">{item.hint}</span>}
                        </span>
                        <i className="ti ti-arrow-right text-[14px] text-neutral-500" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs text-neutral-500">
                  These clear on their own once they&apos;re handled.
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 py-7 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success-50 text-success-500">
                  <i className="ti ti-circle-check text-[22px]" aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold text-neutral-900">You&apos;re all caught up</p>
                <p className="text-sm text-neutral-600">Nothing needs your attention right now.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
