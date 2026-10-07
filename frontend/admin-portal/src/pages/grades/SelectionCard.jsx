import { useEffect, useState } from "react";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import { getStudents } from "../../api/studentApi";
import { getAvatarPalette, initialsFrom } from "../../utils/avatarPalette";
import { PERIOD_SHORT, formatGrade } from "./gradeRules";

// SelectionCard — the left column of the Summary, Entry and Observed values
// tabs: student, school year, subject and grading period as the rows of one
// card. They were up to five stacked cards, each with its own header, icon
// tile and padding, for what is one choice made in steps.
//
// Which rows a tab shows:      Student  School year  Subject  Period
//   summary                       ✓          ✓
//   entry                         ✓          ✓           ✓        ✓
//   observed                      ✓          ✓                    ✓

const LABEL = "text-xs font-bold uppercase tracking-[0.08em] text-neutral-500";
const CHANGE =
  "focus-ring h-7 shrink-0 rounded-full px-2.5 text-[12px] font-semibold text-brand-600 transition-colors hover:bg-brand-100";

function Row({ label, aside, children }) {
  return (
    <div className="flex flex-col gap-2.5 px-[18px] py-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className={LABEL}>{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** The student search, before anyone is picked. */
function StudentSearch({ onPick }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; } // eslint-disable-line react-hooks/set-state-in-effect
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await getStudents({ search: query, page_size: 100 });
        setResults(data.results || []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="relative">
      <div className="flex h-10 items-center gap-2.5 rounded-lg border-[1.5px] border-neutral-300 bg-white px-3 transition-[border-color,box-shadow] duration-150 focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-500/[0.09]">
        <i className="ti ti-search shrink-0 text-[15px] text-neutral-500" aria-hidden="true" />
        <input
          placeholder="Search by name or LRN…"
          aria-label="Search students"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-neutral-900 outline-none placeholder:text-neutral-500"
        />
        {loading && <i className="ti ti-loader-2 animate-spin text-[14px] text-brand-600" aria-hidden="true" />}
      </div>
      {open && query && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-[280px] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg">
          {results.length === 0 && !loading && (
            <div className="px-3 py-4 text-center text-[12.5px] text-neutral-500">No students match “{query}”.</div>
          )}
          {results.map((st) => {
            const p = getAvatarPalette(`${st.first_name ?? ""} ${st.last_name ?? ""}`);
            return (
              <button
                key={st.student_id}
                type="button"
                onClick={() => { onPick(st); setOpen(false); setQuery(""); }}
                className="flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-left hover:bg-brand-50 focus:bg-brand-50 focus:outline-none"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{ background: p.bg, color: p.color }}
                  aria-hidden="true"
                >
                  {initialsFrom(st.first_name, st.last_name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-neutral-900">{st.last_name}, {st.first_name}</span>
                  <span className="block font-mono text-[11px] text-neutral-500">LRN {st.lrn}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One school year to pick: its year, then its grade and section. */
function YearOption({ en, selected, current, onPick }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={`focus-ring flex w-full items-center justify-between gap-2.5 rounded-[10px] p-2 text-left transition-colors ${
        selected ? "bg-brand-100" : "hover:bg-brand-50"
      }`}
    >
      <span className="min-w-0">
        <span className={`block text-[13px] font-bold ${selected ? "text-brand-600" : "text-neutral-900"}`}>
          S.Y. {en.school_year}
        </span>
        <span className="block truncate text-[11.5px] text-neutral-500">{en.grade_level} · {en.section}</span>
      </span>
      {current && <span className="shrink-0 text-[11px] font-bold text-success-500">Current</span>}
    </button>
  );
}

export default function SelectionCard({
  tab,
  student,
  onPickStudent,
  onChangeStudent,
  enrollments,
  loadingEnrollments,
  enrollment,
  onPickEnrollment,
  currentYear,
  subjects,
  subject,
  onPickSubject,
  // subject_id -> the grade saved for the selected period, for the Subject
  // row's "Saved grade" column.
  savedGrades = {},
  periods = [],
  gradingPeriod,
  onPickPeriod,
}) {
  // Entry and Observed values collapse the year list to the one picked, so
  // the subject and period rows sit near the top; "Change" opens it again.
  const [choosingYear, setChoosingYear] = useState(false);
  const collapseYear = tab !== "summary" && enrollment && !choosingYear;

  const palette  = student ? getAvatarPalette(`${student.first_name ?? ""} ${student.last_name ?? ""}`) : null;
  const fullName = student ? [student.first_name, student.middle_name, student.last_name, student.suffix].filter(Boolean).join(" ") : "";

  return (
    <Card padding="none" className="divide-y divide-neutral-200">
      <Row label="Student">
        {student ? (
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
              style={{ background: palette.bg, color: palette.color }}
              aria-hidden="true"
            >
              {initialsFrom(student.first_name, student.last_name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-bold text-neutral-900">{fullName}</span>
              <span className="block font-mono text-[11.5px] text-neutral-500">LRN {student.lrn}</span>
            </span>
            <button type="button" onClick={onChangeStudent} className={CHANGE} aria-label="Change student">
              Change
            </button>
          </div>
        ) : (
          <StudentSearch onPick={onPickStudent} />
        )}
      </Row>

      {student && (
        <Row label="School year">
          {loadingEnrollments ? (
            <div className="flex flex-col gap-2">
              <Skeleton width="80%" height={14} />
              <Skeleton width="50%" height={11} />
            </div>
          ) : enrollments.length === 0 ? (
            <div className="text-[12.5px] italic text-neutral-500">No enrollments found.</div>
          ) : collapseYear ? (
            <div className="flex items-center justify-between gap-2.5">
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-neutral-900">S.Y. {enrollment.school_year}</span>
                <span className="block truncate text-[11.5px] text-neutral-500">{enrollment.grade_level} · {enrollment.section}</span>
              </span>
              <button type="button" onClick={() => setChoosingYear(true)} className={CHANGE} aria-label="Change school year">
                Change
              </button>
            </div>
          ) : (
            <div role="radiogroup" aria-label="School year" className="-mx-2 flex flex-col gap-0.5">
              {enrollments.map((en) => (
                <YearOption
                  key={en.enrollment_id}
                  en={en}
                  selected={enrollment?.enrollment_id === en.enrollment_id}
                  current={en.school_year === currentYear}
                  onPick={() => { onPickEnrollment(en); setChoosingYear(false); }}
                />
              ))}
            </div>
          )}
        </Row>
      )}

      {tab === "entry" && enrollment && (
        <Row label="Subject" aside={<span className="text-[11px] text-neutral-500">Saved grade</span>}>
          {subjects.length === 0 ? (
            <div className="text-[12.5px] italic text-neutral-500">No subjects for this level.</div>
          ) : (
            <div role="radiogroup" aria-label="Subject" className="-mx-2 flex flex-col gap-px">
              {subjects.map((sub) => {
                const selected = subject?.subject_id === sub.subject_id;
                return (
                  <button
                    key={sub.subject_id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onPickSubject(sub)}
                    className={`focus-ring flex h-[34px] w-full items-center justify-between gap-2.5 rounded-sm px-2 text-left transition-colors ${
                      selected ? "bg-brand-100" : "hover:bg-brand-50"
                    }`}
                  >
                    <span className={`truncate text-[12.5px] ${selected ? "font-bold text-brand-600" : "text-neutral-900"}`}>
                      {sub.subject_name}
                    </span>
                    <span className="shrink-0 text-[12.5px] tabular-nums text-neutral-800">
                      {formatGrade(savedGrades[sub.subject_id])}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Row>
      )}

      {tab !== "summary" && enrollment && periods.length > 0 && (
        <Row label="Grading period">
          <div
            role="group"
            aria-label="Grading period"
            className="grid gap-0.5 rounded-[10px] border border-neutral-200 bg-neutral-50 p-[3px]"
            style={{ gridTemplateColumns: `repeat(${periods.length}, minmax(0, 1fr))` }}
          >
            {periods.map((p) => {
              const selected = gradingPeriod === p;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPickPeriod(p)}
                  className={`focus-ring h-[30px] rounded-sm text-[12px] font-semibold transition-colors ${
                    selected ? "bg-white text-brand-600 shadow-sm" : "text-neutral-600 hover:text-brand-600"
                  }`}
                >
                  {PERIOD_SHORT[p] ?? p}
                </button>
              );
            })}
          </div>
        </Row>
      )}
    </Card>
  );
}
