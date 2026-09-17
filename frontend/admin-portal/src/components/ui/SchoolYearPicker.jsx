import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSchoolYear } from "../../context/SchoolYearContext";
import { groupYears } from "../../utils/schoolYear";

// SchoolYearPicker — the school-year control that sits in FilterBar's `scope`
// slot, to the right of the search field.
//
// School year is not a facet like Status or School Level: it's the *scope*
// every other filter narrows within, and unlike the others its option list
// grows without bound. /api/enrollments/school-years/ returns every year that
// has enrollments — the old 5-year window was removed precisely because it
// made the oldest year unreachable once a school had six years of history. As
// a chip row that list wrapped to two or three lines, and because School Year
// was the first row, it pushed every other facet (and the table) down the page.
//
// So year leaves the chip rows and becomes a labelled pill with a grouped
// popover: constant height at three years or thirty.
//
// The Current / Recent / Earlier grouping and the `year · count` label come
// from utils/schoolYear.js, shared with Sidebar.jsx's picker. The two are
// deliberately different widgets — a native <select> for the global default,
// this combobox for a per-page filter whose list can run long — but they must
// never disagree about which year is "Recent", so the grouping lives in one
// place rather than in each.

// Below this many years the list is short enough to scan directly, and a
// search field would be chrome that earns nothing. Past it, typing beats
// scrolling — which is the whole point of not being a chip row.
const FILTER_THRESHOLD = 8;

export default function SchoolYearPicker({
  value = "",
  onChange,
  // All four default to the global context, so the common case passes only
  // value/onChange. Invoices overrides `options`/`counts` because its year
  // list comes from /summary/ — years that have *invoices*, which is not the
  // same set as years that have enrollments.
  options: optionsProp,
  counts: countsProp,
  currentYear: currentYearProp,
  includeAllYears = true,
  allYearsCount,
  label = "School year",
  className = "",
}) {
  const ctx = useSchoolYear();
  const options = optionsProp ?? ctx.options;
  const counts = countsProp ?? ctx.yearCounts;
  const currentYear = currentYearProp ?? ctx.currentYear;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Which row the keyboard is on. Tracked separately from `value` so arrowing
  // through the list doesn't refetch the page on every keypress — selection
  // commits on Enter or click.
  const [activeIdx, setActiveIdx] = useState(-1);

  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const filterRef = useRef(null);
  const listRef = useRef(null);
  const baseId = useId();

  const showFilter = options.length >= FILTER_THRESHOLD;

  // The flat, filtered row list the keyboard walks. Groups are presentational;
  // arrowing moves between *rows*, so headers are not part of this.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (y) => !q || y.toLowerCase().includes(q);
    const flat = [];
    groupYears(options, currentYear).forEach(([groupLabel, years]) => {
      const kept = years.filter(match);
      if (kept.length) flat.push({ type: "group", label: groupLabel });
      kept.forEach((y) => flat.push({ type: "year", year: y }));
    });
    // "All years" sits last, and outside the groups: a real year is the
    // primary choice, so the escape hatch reads as an opt-in rather than the
    // default. Matches how InvoicesPage orders its year chips.
    if (includeAllYears && !q) flat.push({ type: "all" });
    return flat;
  }, [options, currentYear, query, includeAllYears]);

  const selectableIdxs = useMemo(
    () => rows.reduce((acc, r, i) => (r.type === "group" ? acc : [...acc, i]), []),
    [rows]
  );

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setQuery("");
    setActiveIdx(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const commit = useCallback(
    (year) => {
      onChange?.(year);
      close();
    },
    [onChange, close]
  );

  // Outside click. Matches RequirementsPage's existing dropdown: `mousedown`
  // rather than `click`, so the panel is gone before a click lands on whatever
  // is underneath it.
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  // On open, land focus where typing is useful and put the cursor on the
  // current selection rather than at the top of the list. Deliberately keyed on
  // `open` alone: re-running this as `rows` changes would drag the cursor back
  // to the selected year on every keystroke in the filter field, and the
  // setState is a one-shot initialisation rather than a render-driven sync.
  useEffect(() => {
    if (!open) return;
    const selectedIdx = rows.findIndex(
      (r) => (r.type === "year" && r.year === value) || (r.type === "all" && value === "")
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIdx(selectedIdx >= 0 ? selectedIdx : selectableIdxs[0] ?? -1);
    if (showFilter) filterRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the active row in view — without this, arrowing past the visible
  // window moves an invisible cursor.
  useEffect(() => {
    if (!open || activeIdx < 0) return;
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    // Guarded: jsdom doesn't implement scrollIntoView, and it's a nicety here
    // rather than something the picker's correctness depends on.
    el?.scrollIntoView?.({ block: "nearest" });
  }, [activeIdx, open]);

  const moveActive = (dir) => {
    if (!selectableIdxs.length) return;
    const pos = selectableIdxs.indexOf(activeIdx);
    const next =
      pos === -1
        ? selectableIdxs[0]
        : selectableIdxs[(pos + dir + selectableIdxs.length) % selectableIdxs.length];
    setActiveIdx(next);
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "Escape":       e.preventDefault(); close(); break;
      case "ArrowDown":    e.preventDefault(); moveActive(1); break;
      case "ArrowUp":      e.preventDefault(); moveActive(-1); break;
      case "Home":         e.preventDefault(); setActiveIdx(selectableIdxs[0]); break;
      case "End":          e.preventDefault(); setActiveIdx(selectableIdxs[selectableIdxs.length - 1]); break;
      case "Tab":          close(false); break;
      case "Enter": {
        e.preventDefault();
        const row = rows[activeIdx];
        if (row?.type === "year") commit(row.year);
        else if (row?.type === "all") commit("");
        break;
      }
      default: break;
    }
  };

  const triggerLabel = value || "All years";
  const triggerCount = value ? counts[value] : allYearsCount;
  // "All years" is a real, deliberate choice, not an empty one — but it is not
  // a *narrowing* one, so it stays neutral at rest. While the popover is open
  // the whole trigger emphasises together: the focus ring already draws a red
  // border on click, and leaving the text and badge grey underneath it made
  // the control contradict itself.
  const emphasised = Boolean(value) || open;
  const activeId = activeIdx >= 0 ? `${baseId}-opt-${activeIdx}` : undefined;

  return (
    <div ref={wrapRef} className={`relative shrink-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${triggerLabel}`}
        className={`focus-ring flex h-[42px] items-center gap-2.5 rounded-lg border-[1.5px] px-3 text-left transition-colors duration-150 ${
          emphasised
            ? "border-brand-500 bg-brand-100"
            : "border-neutral-300 bg-white hover:border-brand-500"
        }`}
      >
        <span className="flex flex-col">
          <span
            className={`text-[9.5px] font-bold uppercase leading-none tracking-[0.09em] ${
              emphasised ? "text-brand-500" : "text-neutral-500"
            }`}
          >
            {label}
          </span>
          <span
            className={`text-[13px] font-bold leading-tight tabular-nums ${
              emphasised ? "text-brand-600" : "text-neutral-700"
            }`}
          >
            {triggerLabel}
          </span>
        </span>

        {triggerCount != null && (
          <span
            className={`shrink-0 rounded-full px-[7px] py-px text-[10px] font-bold tabular-nums text-white ${
              emphasised ? "bg-brand-500" : "bg-neutral-400"
            }`}
          >
            {triggerCount.toLocaleString()}
          </span>
        )}

        <motion.i
          className={`ti ti-chevron-down text-[11px] ${emphasised ? "text-brand-500" : "text-neutral-500"}`}
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18 }}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            // Left-aligned: the pill sits left of centre in the search row, so
            // anchoring right would push the panel off the panel's edge.
            // z-40 clears the table but stays under Modal's z-[999].
            className="absolute left-0 top-[calc(100%+6px)] z-40 w-[268px] rounded-xl border-[1.5px] border-neutral-200 bg-white p-[7px] shadow-[0_12px_40px_rgba(224,49,49,0.14)]"
          >
            {showFilter && (
              <div className="mx-[3px] mb-1 mt-[3px] flex h-[34px] items-center gap-[7px] rounded-lg border-[1.5px] border-neutral-300 px-2.5 focus-within:border-brand-500">
                <i className="ti ti-search shrink-0 text-[13px] text-neutral-500" aria-hidden="true" />
                <label htmlFor={`${baseId}-filter`} className="sr-only">
                  Jump to school year
                </label>
                <input
                  ref={filterRef}
                  id={`${baseId}-filter`}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Jump to year…"
                  autoComplete="off"
                  className="min-w-0 flex-1 border-none bg-transparent text-[12.5px] text-neutral-900 outline-none placeholder:text-neutral-500"
                />
              </div>
            )}

            {/* The same handler is bound here as on the trigger and the filter
                field: below FILTER_THRESHOLD there is no filter input to hold
                focus, so without this the arrow keys would have nowhere to
                land once the panel was open. */}
            <div
              ref={listRef}
              role="listbox"
              aria-label={label}
              aria-activedescendant={activeId}
              tabIndex={-1}
              onKeyDown={onKeyDown}
              className="max-h-[208px] overflow-y-auto"
            >
              {rows.length === 0 && (
                <div className="px-2.5 py-3 text-[12.5px] text-neutral-500">
                  No school year matches “{query}”.
                </div>
              )}

              {rows.map((row, idx) => {
                if (row.type === "group") {
                  return (
                    <div
                      key={`g-${row.label}`}
                      className="px-2.5 pb-[5px] pt-[9px] text-[9.5px] font-bold uppercase tracking-[0.1em] text-neutral-500"
                    >
                      {row.label}
                    </div>
                  );
                }

                const isAll = row.type === "all";
                const year = isAll ? "" : row.year;
                const selected = value === year;
                const n = isAll ? allYearsCount : counts[year];

                return (
                  <button
                    key={isAll ? "all" : year}
                    id={`${baseId}-opt-${idx}`}
                    data-idx={idx}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => commit(year)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold ${
                      isAll ? "mt-1.5 border-t border-neutral-200 pt-2.5" : ""
                    } ${
                      selected
                        ? "bg-brand-100 text-brand-600"
                        : activeIdx === idx
                          ? "bg-brand-50 text-neutral-700"
                          : "text-neutral-700"
                    }`}
                  >
                    <i
                      className={`ti ti-check shrink-0 text-[13px] text-brand-500 ${selected ? "" : "invisible"}`}
                      aria-hidden="true"
                    />
                    <span className="flex-1 tabular-nums">{isAll ? "All years" : year}</span>
                    {n != null && (
                      <span
                        className={`text-[11px] font-semibold tabular-nums ${
                          selected ? "text-brand-600" : "text-neutral-500"
                        }`}
                      >
                        {n.toLocaleString()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
