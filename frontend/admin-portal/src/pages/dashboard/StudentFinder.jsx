// StudentFinder — the dashboard's "find a student" box.
//
// It looks and types like the search on the list pages (same box, 300 ms
// debounce), but the dashboard has no list of its own to narrow, so the
// matches drop down under it instead: pick one to open that student, or press
// Enter / "See all" for the Students list searched for the same words.
import { useEffect, useId, useState } from "react";
import SearchField from "../../components/ui/SearchField";
import { getStudents } from "../../api/studentApi";
import { getAvatarPalette, initialsFrom } from "../../utils/avatarPalette";

const SHOWN = 6;
const MIN_CHARS = 2;

const fullName = (st) => {
  const given = [st.first_name, st.middle_name ? `${st.middle_name[0]}.` : "", st.suffix ?? ""]
    .filter(Boolean).join(" ");
  return given ? `${st.last_name}, ${given}` : st.last_name;
};

export default function StudentFinder({ onOpen, onSeeAll }) {
  const [term, setTerm] = useState("");
  // The last answer, tagged with the words it answers, so a slow reply to an
  // older term can't pass for the current one.
  const [result, setResult] = useState(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();

  const query = term.trim();
  const ready = query.length >= MIN_CHARS;

  useEffect(() => {
    if (!ready) return undefined;
    let stale = false;
    const t = setTimeout(() => {
      getStudents({ search: query, page_size: SHOWN })
        .then((data) => {
          if (stale) return;
          const rows = Array.isArray(data) ? data : data?.results ?? [];
          setResult({ term: query, rows: rows.slice(0, SHOWN), count: data?.count ?? rows.length });
        })
        .catch(() => { if (!stale) setResult({ term: query, error: true }); });
    }, 300);
    return () => { stale = true; clearTimeout(t); };
  }, [query, ready]);

  // While the next answer is on its way the last one stays up, so the list
  // doesn't flash empty on every keystroke.
  const searching = ready && result?.term !== query;
  const shown = ready ? result : null;
  const rows = shown?.error ? [] : shown?.rows ?? [];
  const expanded = open && ready && Boolean(shown || searching);

  const change = (value) => { setTerm(value); setActive(-1); setOpen(true); };
  const pick = (st) => { setOpen(false); onOpen(st); };
  const seeAll = () => { setOpen(false); onSeeAll(query); };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" && rows.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp" && rows.length) {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && expanded && active >= 0 && rows[active]) {
      e.preventDefault();
      pick(rows[active]);
    } else if (e.key === "Escape" && expanded) {
      // The first Escape closes the list; the browser's own (clearing a
      // search box) waits for the second.
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  };

  // Mousing down on the list would blur the box and close it before the click lands.
  const keepFocus = (e) => e.preventDefault();

  return (
    <div className="relative flex min-w-0 flex-1">
      <SearchField
        id="home-student-search"
        label="Find a student by name, LRN or student number"
        placeholder="Find a student by name, LRN or student number"
        value={term}
        onChange={change}
        onEnter={seeAll}
        onClear={() => change("")}
        onKeyDown={onKeyDown}
        inputProps={{
          role: "combobox",
          "aria-expanded": expanded,
          "aria-controls": listId,
          "aria-autocomplete": "list",
          "aria-activedescendant": expanded && active >= 0 ? `${listId}-${active}` : undefined,
          autoComplete: "off",
          onFocus: () => setOpen(true),
          onBlur: () => { setOpen(false); setActive(-1); },
        }}
      />

      {expanded && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
          <ul id={listId} role="listbox" aria-label="Matching students" className="max-h-80 overflow-y-auto">
            {rows.map((st, i) => {
              const palette = getAvatarPalette(`${st.last_name}${st.first_name}`);
              const last = st.last_enrollment;
              return (
                <li
                  key={st.student_id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={keepFocus}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(st)}
                  className={`flex cursor-pointer items-center gap-3 px-3.5 py-2 transition-colors ${i === active ? "bg-brand-100" : ""}`}
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ background: palette.bg, color: palette.color }}
                    aria-hidden="true"
                  >
                    {initialsFrom(st.first_name, st.last_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-[13px] font-semibold ${i === active ? "text-brand-600" : "text-neutral-900"}`}>
                      {fullName(st)}
                    </div>
                    <div className="truncate font-mono text-[11px] text-neutral-500">
                      {st.lrn ? `LRN ${st.lrn}` : st.student_number}
                    </div>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    {last ? (
                      <>
                        <div className="text-[12px] font-semibold text-neutral-800">
                          {[last.grade_level, last.section].filter(Boolean).join(" · ")}
                        </div>
                        <div className="text-[11px] text-neutral-500">S.Y. {last.school_year}</div>
                      </>
                    ) : last === null ? (
                      <span className="text-[12px] italic text-neutral-500">Not enrolled yet</span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {shown?.error ? (
            <p className="px-3.5 py-3 text-[13px] text-neutral-600">
              Couldn&apos;t search just now. Press Enter to try the Students list.
            </p>
          ) : !searching && rows.length === 0 ? (
            <p className="px-3.5 py-3 text-[13px] text-neutral-600">No student matches &ldquo;{query}&rdquo;.</p>
          ) : null}

          {(searching || rows.length > 0) && (
            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={seeAll}
              className={`flex w-full items-center justify-between px-3.5 py-2.5 text-[12.5px] font-semibold text-brand-600 transition-colors hover:bg-brand-50 ${rows.length ? "border-t border-neutral-200" : ""}`}
            >
              <span>
                {searching
                  ? "Searching…"
                  : shown.count > rows.length
                    ? `See all ${shown.count.toLocaleString()} matches in Students`
                    : "Open these in Students"}
              </span>
              <i className="ti ti-arrow-right" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Mounted before it speaks, or screen readers miss the first count. */}
      <p role="status" className="sr-only">
        {!expanded || searching ? "" : shown?.error ? "Search failed" : `${shown?.count ?? 0} students found`}
      </p>
    </div>
  );
}
