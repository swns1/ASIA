import { useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import ConfirmModal from "../../components/ConfirmModal";
import { GRADE_PASSING } from "../../utils/grading";
import { COMPONENT_COLORS, PERIOD_LABELS, percentageScore } from "./gradeRules";

// ScoreSheet — one quarter's scores for one subject, every grading component
// in one card on one set of columns, so items, scores, maxes and percentages
// line up. Each component used to be its own card, with the numbers sitting
// wherever each row's text ended.
//
// Scores save as they're typed (on blur or Enter); a label or max is edited
// in place by clicking it. The final grade is the page's, computed by the
// server after every change -- see GradeBar.

const COLS = "grid grid-cols-[minmax(0,1fr)_88px_72px_64px_80px] items-center gap-x-3";
const NUMBER_INPUT =
  "h-8 w-full rounded-sm border-[1.5px] bg-neutral-100 px-2.5 text-right text-[13px] tabular-nums text-neutral-900 outline-none transition-colors focus:bg-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const DASHED_INPUT =
  "h-8 rounded-sm border-[1.5px] border-dashed border-brand-border bg-white px-2.5 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-500 focus:border-solid focus:border-brand-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));
// Scores arrive as decimal strings ("20.00"); show them as typed ("20", "18.5").
const plain = (v) => (Number.isNaN(num(v)) ? String(v ?? "") : String(num(v)));

/** Text that turns into an input when clicked, and saves on Enter or blur. */
function InlineEdit({ value, onSave, readOnly, ariaLabel, type = "text", className = "", inputClassName = "", children }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (readOnly) return <span className={className}>{children}</span>;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        className={`focus-ring rounded-sm text-left hover:text-brand-600 ${className}`}
        title={`Edit ${ariaLabel.toLowerCase()}`}
      >
        {children}
      </button>
    );
  }

  const finish = async (save) => {
    setEditing(false);
    if (save && draft.trim() !== "" && draft.trim() !== String(value)) await onSave(draft.trim());
  };
  return (
    <input
      autoFocus
      type={type}
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") finish(false);
      }}
      className={inputClassName}
    />
  );
}

function ScoreRow({ entry, onUpdate, onDelete, readOnly }) {
  const [score, setScore] = useState(plain(entry.score));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const max = Number(entry.max_score);
  const value = num(score);
  const valid = !Number.isNaN(value) && value >= 0 && value <= max;
  const pct = valid && max > 0 ? (value / max) * 100 : null;

  // Server-side the same CHECKs hold (score >= 0, max > 0, score <= max), so
  // an invalid value is shown, not sent.
  const save = async (payload, revert) => {
    try {
      await onUpdate(entry.score_entry_id, payload);
    } catch (e) {
      toast.error(e.message || "Couldn't save that change.");
      revert?.();
    }
  };

  const commitScore = () => {
    if (!valid || value === Number(entry.score)) return;
    save({ score: value }, () => setScore(plain(entry.score)));
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await onDelete(entry.score_entry_id);
      toast.success("Score entry deleted.");
      setConfirmDelete(false);
    } catch (e) {
      const msg = e.message || "Delete failed.";
      setDeleteError(msg);
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`${COLS} px-5 py-1 transition-colors hover:bg-brand-50`}>
      <InlineEdit
        value={entry.label}
        readOnly={readOnly}
        ariaLabel="Item name"
        onSave={(label) => save({ label })}
        className="truncate pl-[18px] text-[13px] text-neutral-900"
        inputClassName="ml-[18px] h-8 w-[calc(100%-18px)] rounded-sm border-[1.5px] border-brand-500 bg-white px-2.5 text-[13px] outline-none"
      >
        {entry.label}
      </InlineEdit>

      {readOnly ? (
        <span className="text-right text-[13px] tabular-nums text-neutral-900">{plain(entry.score)}</span>
      ) : (
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          aria-label={`Score for ${entry.label}`}
          aria-invalid={!valid}
          value={score}
          onChange={(e) => setScore(e.target.value)}
          onBlur={commitScore}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className={`${NUMBER_INPUT} ${valid ? "border-neutral-300 focus:border-brand-300" : "border-brand-500"}`}
        />
      )}

      <InlineEdit
        value={plain(entry.max_score)}
        type="number"
        readOnly={readOnly}
        ariaLabel="Max score"
        onSave={(next) => {
          const m = Number(next);
          if (!(m > 0) || m < Number(entry.score)) {
            toast.error("Max must be above zero and at least the score.");
            return;
          }
          return save({ max_score: m });
        }}
        className="text-[13px] tabular-nums text-neutral-500"
        inputClassName={`${NUMBER_INPUT} border-brand-500`}
      >
        / {plain(entry.max_score)}
      </InlineEdit>

      <span
        className={`text-right text-[12.5px] font-semibold tabular-nums ${
          pct === null || pct < GRADE_PASSING ? "text-error-500" : "text-neutral-800"
        }`}
      >
        {pct === null ? "Check" : `${Math.round(pct)}%`}
      </span>

      <span className="flex justify-end">
        {!readOnly && (
          <Button
            variant="ghost" size="sm" iconOnly icon="ti-trash"
            title="Delete item"
            aria-label={`Delete ${entry.label}`}
            className="hover:bg-error-50 hover:text-error-500"
            onClick={() => setConfirmDelete(true)}
          />
        )}
      </span>

      <AnimatePresence>
        {confirmDelete && (
          <ConfirmModal
            icon="ti-trash"
            title="Delete score entry?"
            message={<>Remove <strong>{entry.label}</strong> ({plain(entry.score)}/{plain(entry.max_score)})? This cannot be undone.</>}
            loading={deleting}
            error={deleteError}
            onConfirm={handleConfirmDelete}
            onCancel={() => { setConfirmDelete(false); setDeleteError(""); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** The dashed row under a component's items. Max defaults to the previous
 *  item's, since a component's quizzes are usually out of the same total. */
function AddRow({ componentName, lastMax, onAdd }) {
  const [label, setLabel] = useState("");
  const [score, setScore] = useState("");
  const [max,   setMax]   = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const labelRef = useRef(null);

  const add = async () => {
    const s = num(score);
    const m = max === "" ? num(lastMax) : num(max);
    if (!label.trim())               { setError("Name the item."); return; }
    if (Number.isNaN(s) || s < 0)    { setError("Enter a score of zero or more."); return; }
    if (Number.isNaN(m) || m <= 0)   { setError("Enter the item's max score."); return; }
    if (s > m)                       { setError("The score can't be more than the max."); return; }
    setSaving(true); setError("");
    try {
      await onAdd({ label: label.trim(), score: s, max_score: m });
      setLabel(""); setScore(""); setMax("");
      labelRef.current?.focus();
    } catch (e) {
      setError(e.message || "Couldn't add that score.");
    } finally {
      setSaving(false);
    }
  };
  const onKeyDown = (e) => { if (e.key === "Enter") add(); };

  return (
    <div className={`${COLS} px-5 pb-3.5 pt-1.5`}>
      <input
        ref={labelRef}
        aria-label={`New ${componentName} item name`}
        placeholder="Add item, e.g. Quiz 3"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={onKeyDown}
        className={`${DASHED_INPUT} ml-[18px] w-[calc(100%-18px)]`}
      />
      <input
        type="number" inputMode="decimal" min="0" step="0.01"
        aria-label={`New ${componentName} item score`}
        placeholder="Score"
        value={score}
        onChange={(e) => setScore(e.target.value)}
        onKeyDown={onKeyDown}
        className={`${DASHED_INPUT} w-full text-right tabular-nums`}
      />
      <input
        type="number" inputMode="decimal" min="0.01" step="0.01"
        aria-label={`New ${componentName} item max score`}
        placeholder={lastMax != null ? plain(lastMax) : "Max"}
        value={max}
        onChange={(e) => setMax(e.target.value)}
        onKeyDown={onKeyDown}
        className={`${DASHED_INPUT} w-full tabular-nums`}
      />
      <span />
      <span className="flex justify-end">
        <button
          type="button"
          onClick={add}
          disabled={saving}
          className="focus-ring inline-flex h-8 items-center gap-[5px] rounded-full border-[1.5px] border-brand-300 bg-brand-100 px-3 text-[12px] font-bold text-brand-600 transition-colors hover:border-brand-500 disabled:opacity-60"
        >
          <i className={`ti ${saving ? "ti-loader-2 animate-spin" : "ti-plus"} text-[13px]`} aria-hidden="true" />
          Add
        </button>
      </span>
      {error && (
        <span role="alert" className="col-span-full pl-[18px] pt-1 text-[11.5px] text-error-500">{error}</span>
      )}
    </div>
  );
}

export default function ScoreSheet({
  subject,
  template,
  gradingPeriod,
  scoresByComponent,
  loading,
  readOnly,
  onUpdate,
  onDelete,
  onCreate,
}) {
  const components = template.components ?? [];
  const weights = components.map((c) => `${c.component_name} ${Number(c.weight)}`).join(", ");

  return (
    <div className="flex flex-col gap-2">
      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-200 px-5 py-[18px]">
          <div className="flex min-w-0 flex-col gap-[3px]">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-lg font-bold text-neutral-900">{subject.subject_name}</h2>
              <span className="font-mono text-[11.5px] text-neutral-500">{subject.subject_code}</span>
            </div>
            <span className="text-sm text-neutral-500">
              {template.template_name}{weights && ` · ${weights}`}
            </span>
          </div>
          <span className="text-sm font-bold text-neutral-900">{PERIOD_LABELS[gradingPeriod]}</span>
        </div>

        <div className={`${COLS} border-b border-neutral-200 px-5 py-2.5 text-[12px] font-semibold text-neutral-600`}>
          <span>Item</span>
          <span className="text-right">Score</span>
          <span>Max</span>
          <span className="text-right">%</span>
          <span className="text-right">Adds</span>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3 px-5 py-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} width="100%" height={32} radius={8} />)}
          </div>
        ) : (
          components.map((comp, ci) => {
            const entries = scoresByComponent[comp.grading_component_id] ?? [];
            const ps = percentageScore(entries);
            const adds = ps === null ? null : (ps * Number(comp.weight)) / 100;
            const lastMax = entries.length ? entries[entries.length - 1].max_score : null;
            return (
              <section
                key={comp.grading_component_id}
                aria-label={comp.component_name}
                className="border-b border-neutral-200"
              >
                <div className={`${COLS} px-5 pb-1.5 pt-3`}>
                  <span className="flex min-w-0 items-baseline gap-2.5">
                    <span
                      className="h-2 w-2 shrink-0 -translate-y-px rounded-full"
                      style={{ background: COMPONENT_COLORS[ci % COMPONENT_COLORS.length] }}
                      aria-hidden="true"
                    />
                    <span className="text-[13.5px] font-bold text-neutral-900">{comp.component_name}</span>
                    <span className="truncate text-[11.5px] text-neutral-500">
                      {Number(comp.weight)}% of grade · {entries.length} item{entries.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span />
                  <span />
                  <span className="text-right text-[12.5px] font-bold tabular-nums text-neutral-900">
                    {ps === null ? "—" : `${ps.toFixed(1)}%`}
                  </span>
                  <span className="text-right text-[12.5px] font-bold tabular-nums text-neutral-900">
                    {adds === null ? "—" : `+${adds.toFixed(2)}`}
                  </span>
                </div>

                {entries.map((entry) => (
                  <ScoreRow
                    key={entry.score_entry_id}
                    entry={entry}
                    readOnly={readOnly}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                  />
                ))}

                {readOnly ? (
                  <div className="h-2" />
                ) : (
                  <AddRow
                    componentName={comp.component_name}
                    lastMax={lastMax}
                    onAdd={(fields) => onCreate({ ...fields, grading_component: comp.grading_component_id })}
                  />
                )}
              </section>
            );
          })
        )}
      </Card>
      {!readOnly && (
        <p className="px-1 text-[11.5px] text-neutral-500">
          Max defaults to the previous item's max. Press Enter in any field of the add row to add it.
        </p>
      )}
    </div>
  );
}
