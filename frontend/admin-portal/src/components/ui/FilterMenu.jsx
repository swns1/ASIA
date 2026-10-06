import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";

// FilterMenu — a compact filter that shows its value and opens a menu of
// choices. The Students and Enrollments toolbars use it for every filter that
// isn't search or status, replacing chip rows that took a labelled line each.
//
// A menu button with radio items: focus moves into the menu on open, the
// arrow keys, Home and End walk it, Enter or Space picks, and Escape, Tab or a
// click outside closes it.

const ALIGN = {
  start: "left-0",
  // For a pill near the right edge, where a left-anchored menu would run off
  // the page.
  end: "right-0",
};

// The pill. "light" sits on the page; "dark" sits on a StatusBand, where it
// stays outlined whatever it's set to, since the band has no pale tint to
// mark "set" with.
const TONES = {
  light: {
    trigger: "h-10 rounded-lg",
    idle: "border-neutral-300 bg-white hover:border-brand-500",
    set: "border-brand-500 bg-brand-100",
    label: "text-neutral-500",
    value: "text-neutral-900",
    valueSet: "text-brand-600",
    chevron: "text-neutral-600",
  },
  dark: {
    trigger: "h-9 rounded-full",
    idle: "border-white/16 bg-transparent hover:border-white/30",
    set: "border-white/16 bg-transparent hover:border-white/30",
    label: "text-brand-300",
    value: "text-white",
    valueSet: "text-white",
    chevron: "text-brand-border",
  },
};

/**
 * @param {string} label  what the filter is ("Sex")
 * @param {string} valueLabel  what it's set to ("All", "Female")
 * @param {boolean} active  whether it's narrowing the list right now
 * @param {{ value: string, label: string, dot?: string, note?: React.ReactNode }[]} options
 *   `dot` is a literal bg class for a colour key (a school level); `note` sits
 *   at the right of the item ("Current").
 * @param {string} value  the selected option's value
 * @param {(value: string) => void} onChange
 * @param {"start"|"end"} [align]  the edge the menu prefers to line up with
 * @param {number} [menuWidth]  the menu's minimum width, in px
 * @param {"light"|"dark"} [tone]
 */
export default function FilterMenu({
  label,
  valueLabel,
  active,
  options,
  value,
  onChange,
  align = "start",
  menuWidth = 200,
  tone = "light",
}) {
  const t = TONES[tone] ?? TONES.light;
  const [open, setOpen] = useState(false);
  // The edge the menu actually opens from. `align` is a preference: on a
  // narrow screen the toolbar wraps, and a pill that sat at the right edge
  // can land at the left, where a right-anchored menu would open off-screen.
  const [side, setSide] = useState(align);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);
  // Which item takes focus once the menu has rendered.
  const focusOnOpen = useRef(0);
  const menuId = useId();

  const selectedIdx = Math.max(0, options.findIndex((o) => o.value === value));

  const openMenu = (idx = selectedIdx) => {
    // The preferred edge, unless the menu only fits from the other one.
    const box = triggerRef.current.getBoundingClientRect();
    const fits = {
      start: box.left + menuWidth <= document.documentElement.clientWidth,
      end: box.right - menuWidth >= 0,
    };
    const other = align === "end" ? "start" : "end";
    setSide(!fits[align] && fits[other] ? other : align);
    focusOnOpen.current = idx;
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (open) itemRefs.current[focusOnOpen.current]?.focus();
  }, [open]);

  // `mousedown`, like SchoolYearPicker, so the menu is gone before the click
  // lands on whatever is under it.
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const pick = (next) => {
    close();
    if (next !== value) onChange(next);
  };

  const onTriggerKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(e.key === "ArrowUp" ? options.length - 1 : selectedIdx);
    }
  };

  const onMenuKeyDown = (e) => {
    const items = itemRefs.current.slice(0, options.length);
    const at = items.indexOf(document.activeElement);
    const focus = (i) => items[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); focus(at + 1); break;
      case "ArrowUp":   e.preventDefault(); focus(at - 1); break;
      case "Home":      e.preventDefault(); focus(0); break;
      case "End":       e.preventDefault(); focus(items.length - 1); break;
      case "Escape":    e.preventDefault(); close(); break;
      case "Tab":       close(false); break;
      default: break;
    }
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // The two spans would otherwise be read run together ("SexAll").
        aria-label={`${label}: ${valueLabel}`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={`focus-ring flex items-center gap-2 whitespace-nowrap border-[1.5px] px-3.5 text-[12.5px] transition-colors duration-150 ${t.trigger} ${
          active ? t.set : t.idle
        }`}
      >
        <span className={t.label}>{label}</span>
        <span className={`font-bold ${active ? t.valueSet : t.value}`}>{valueLabel}</span>
        <i className={`ti ti-chevron-down text-[13px] ${t.chevron}`} aria-hidden="true" />
      </button>

      {open && (
        <motion.div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          // z-20 clears the table's sticky header (z-10) and stays under the
          // page header (z-30). The height cap is for the year list, which
          // gains an entry every school year.
          className={`absolute top-[calc(100%+6px)] z-20 max-h-[280px] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg ${ALIGN[side] ?? ALIGN.start}`}
          style={{ minWidth: menuWidth }}
        >
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                tabIndex={-1}
                onClick={() => pick(o.value)}
                className="flex h-[34px] w-full items-center gap-2 whitespace-nowrap rounded-sm px-2.5 text-left text-[12.5px] text-neutral-900 outline-none hover:bg-brand-50 focus:bg-brand-50"
              >
                {o.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${o.dot}`} aria-hidden="true" />}
                <span className="flex-1">{o.label}</span>
                {o.note}
                {selected && <i className="ti ti-check text-[14px] text-brand-500" aria-hidden="true" />}
              </button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
