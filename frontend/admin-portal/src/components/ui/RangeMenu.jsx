import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";

// RangeMenu — a toolbar pill like FilterMenu, for a filter that takes a range
// rather than one choice: payment dates, amounts, when a scholarship was
// awarded. It opens a small panel with From/To fields and quick picks.
//
// The fields commit together on Apply (or Enter): a half-typed range would
// otherwise refetch on every keystroke. A quick pick applies at once.
//
//   <RangeMenu
//     label="Date" valueLabel="This month" active
//     fields={[{ key: "from", label: "From", type: "date", value: from }, …]}
//     presets={[{ label: "Today", values: { from: d, to: d } }]}
//     onApply={({ from, to }) => …}
//   />

/**
 * @param {string} label  what the filter is ("Date")
 * @param {string} valueLabel  what it's set to ("Any", "Jun 1 – Jun 30")
 * @param {boolean} active  whether it's narrowing the list right now
 * @param {{ key: string, label: string, type: "date"|"number", value: string, prefix?: string }[]} fields
 * @param {{ label: string, values: Record<string, string> }[]} [presets]
 * @param {(values: Record<string, string>) => void} onApply
 * @param {"start"|"end"} [align]
 */
export default function RangeMenu({
  label,
  valueLabel,
  active,
  fields,
  presets = [],
  onApply,
  align = "end",
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({});
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const firstFieldRef = useRef(null);
  const panelId = useId();
  const fieldId = useId();

  const openPanel = () => {
    setDraft(Object.fromEntries(fields.map((f) => [f.key, f.value ?? ""])));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (open) firstFieldRef.current?.focus();
  }, [open]);

  // `mousedown`, like FilterMenu, so the panel is gone before the click lands
  // on whatever is under it.
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const apply = (values) => {
    close();
    onApply(values);
  };
  const empty = Object.fromEntries(fields.map((f) => [f.key, ""]));

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${label}: ${valueLabel}`}
        onClick={() => (open ? close() : openPanel())}
        className={`focus-ring flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border-[1.5px] px-3.5 text-[12.5px] transition-colors duration-150 ${
          active ? "border-brand-500 bg-brand-100" : "border-neutral-300 bg-white hover:border-brand-500"
        }`}
      >
        <span className="text-neutral-500">{label}</span>
        <span className={`font-bold ${active ? "text-brand-600" : "text-neutral-900"}`}>{valueLabel}</span>
        <i className="ti ti-chevron-down text-[13px] text-neutral-600" aria-hidden="true" />
      </button>

      {open && (
        <motion.div
          id={panelId}
          role="dialog"
          aria-label={label}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); close(); } }}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          // z-20 clears the table's sticky header (z-10), as FilterMenu does.
          className={`absolute top-[calc(100%+6px)] z-20 w-[300px] rounded-lg border border-neutral-200 bg-white p-3 shadow-lg ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          <form
            onSubmit={(e) => { e.preventDefault(); apply(draft); }}
            className="flex flex-col gap-3"
          >
            <div className="grid grid-cols-2 gap-2.5">
              {fields.map((f, i) => (
                <label key={f.key} htmlFor={`${fieldId}-${f.key}`} className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-neutral-600">{f.label}</span>
                  <span className="flex h-9 items-center gap-1 rounded-sm border-[1.5px] border-neutral-300 bg-white px-2 focus-within:border-brand-500">
                    {f.prefix && <span className="text-[12px] font-semibold text-neutral-500">{f.prefix}</span>}
                    <input
                      id={`${fieldId}-${f.key}`}
                      ref={i === 0 ? firstFieldRef : undefined}
                      type={f.type}
                      min={f.type === "number" ? "0" : undefined}
                      step={f.type === "number" ? "0.01" : undefined}
                      value={draft[f.key] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      className="min-w-0 flex-1 border-none bg-transparent text-[12.5px] text-neutral-900 outline-none"
                    />
                  </span>
                </label>
              ))}
            </div>

            {presets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => apply({ ...empty, ...p.values })}
                    className="focus-ring h-7 rounded-full border border-neutral-300 bg-white px-2.5 text-[12px] font-semibold text-neutral-700 transition-colors duration-150 hover:border-brand-500 hover:text-brand-600"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-neutral-200 pt-3">
              <button
                type="button"
                onClick={() => apply(empty)}
                disabled={!active}
                className="focus-ring rounded-sm px-1 text-[12px] font-semibold text-error-600 hover:underline disabled:invisible"
              >
                Clear
              </button>
              <button
                type="submit"
                className="focus-ring h-8 rounded-full bg-brand-500 px-4 text-[12px] font-bold text-white transition-colors duration-150 hover:bg-brand-600"
              >
                Apply
              </button>
            </div>
          </form>
        </motion.div>
      )}
    </div>
  );
}
