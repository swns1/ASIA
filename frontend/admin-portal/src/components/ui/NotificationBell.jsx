import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { MENU_DARK } from "./darkSurfaces";
import { CHIP_GLOW } from "../../constants/statusTones";

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
// `items`: [{ id, icon, tone: "error" | "warning" | "info", message, hint?, link }]
// `failed`: some of what feeds the bell didn't load. It still gets the dot,
// and says so in place of "all caught up": a count that never arrived isn't
// nothing to do. Both home pages build `items` from dashboard/attention.js.

// The icon tile per tone; in dark it lights up like every other icon tile.
const TONES = {
  error: `bg-error-50 text-error-500 ${CHIP_GLOW.error}`,
  warning: `bg-warning-50 text-warning-500 ${CHIP_GLOW.warning}`,
  info: `bg-info-50 text-info-500 ${CHIP_GLOW.info}`,
};

export default function NotificationBell({ items = [], failed = false }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();
  const hasItems = items.length > 0;
  const needLine = `${items.length} need${items.length === 1 ? "s" : ""} your attention`;

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
      {/* Drawn like the SchoolYearPicker trigger it sits beside on the admin
          home -- same height, corners, border and open state -- rather than
          as a round Button, so the header's controls read as one set. */}
      <button
        ref={buttonRef}
        type="button"
        className="focus-ring flex h-[42px] w-[42px] items-center justify-center rounded-lg border-[1.5px] border-neutral-300 bg-surface text-neutral-700 transition-colors duration-150 hover:border-brand-500 hover:text-brand-600 aria-expanded:border-brand-500 aria-expanded:bg-brand-100 aria-expanded:text-brand-600"
        title="Notifications"
        aria-label={
          hasItems
            ? `Notifications, ${needLine}${failed ? ", some couldn't be checked" : ""}`
            : failed
              ? "Notifications, some couldn't be checked"
              : "Notifications, nothing new"
        }
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <i className="ti ti-bell text-[18px]" aria-hidden="true" />
      </button>
      {(hasItems || failed) && (
        <span
          // The ring is the button's own fill, so the dot sits cut out of it.
          className="pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-surface"
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
            className={`absolute right-0 top-[calc(100%+8px)] z-40 w-[min(400px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-neutral-200 bg-surface-raised shadow-lg ${MENU_DARK}`}
          >
            <div className="flex items-baseline justify-between gap-3 border-b border-neutral-200 px-4 pb-3 pt-4">
              <h2 className="text-md font-bold text-neutral-900">Notifications</h2>
              <span className="text-sm text-neutral-500">
                {hasItems ? needLine : failed ? "Couldn't check everything" : "Nothing new"}
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
                {failed && <FailedNotice className="border-t border-neutral-200" />}
                <p className="border-t border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs text-neutral-500">
                  These clear on their own once they&apos;re handled.
                </p>
              </>
            ) : failed ? (
              <FailedNotice />
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 py-7 text-center">
                <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-success-50 text-success-500 ${CHIP_GLOW.success}`}>
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

// In the panel when part of it didn't load: a row like the others, but not a
// link, since there is nowhere to go to fix it.
function FailedNotice({ className = "" }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 ${className}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${TONES.warning}`}>
        <i className="ti ti-alert-triangle text-[17px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-neutral-900">Some notifications couldn&apos;t be checked</span>
        <span className="mt-0.5 block text-sm text-neutral-600">Reload the page to try again.</span>
      </span>
    </div>
  );
}
