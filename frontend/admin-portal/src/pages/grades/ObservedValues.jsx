import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import { OBSERVED_VALUES, observedMark } from "../../constants/observedValues";
import { PERIOD_LABELS } from "./gradeRules";

// ObservedValues — the Report on Learner's Observed Values for one grading
// period: every behaviour statement with the four DepEd marks in fixed
// columns. It used to sit under grade entry with its own period chips, so the
// page had two period pickers that could disagree; the selection card's
// period now drives both tabs.

const COLS = "grid grid-cols-[28px_minmax(0,1fr)_repeat(4,56px)] items-center gap-x-3";

export default function ObservedValues({
  gradingPeriod,
  categories,
  reports,
  loading,
  savingStates,
  onRatingChange,
  readOnly = false,
}) {
  const reportByCategory = {};
  reports.forEach((r) => { reportByCategory[r.category] = r; });
  const rated = categories.filter((c) => observedMark(reportByCategory[c.category_id]?.rating)).length;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-200 px-5 py-[18px]">
        <div className="flex flex-col gap-[3px]">
          <h2 className="text-lg font-bold text-neutral-900">Observed values</h2>
          <span className="text-sm text-neutral-500">
            {PERIOD_LABELS[gradingPeriod]} · {rated} of {categories.length} rated
          </span>
        </div>
        <div className="flex flex-wrap gap-3.5">
          {OBSERVED_VALUES.map((v) => (
            <span key={v.value} className="flex items-center gap-1.5 text-[11.5px] text-neutral-800">
              <span className="font-bold" style={{ color: v.color }}>{v.value}</span>
              {v.label}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 px-5 py-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} width="100%" height={32} radius={8} />)}
        </div>
      ) : categories.length === 0 ? (
        <div className="px-5 py-8 text-center text-[13px] text-neutral-500">
          No narrative categories configured.{" "}
          <a href="/grading-templates?tab=narrative" className="font-semibold text-brand-600 hover:underline">
            Go to Settings → Narrative Categories
          </a>{" "}
          to add some.
        </div>
      ) : (
        <>
          <div className={`${COLS} border-b border-neutral-200 px-5 py-2.5 text-[12px] font-semibold text-neutral-600`}>
            <span>#</span>
            <span>Behaviour statement</span>
            {OBSERVED_VALUES.map((v) => (
              <span key={v.value} className="text-center"><abbr title={v.label} className="no-underline">{v.value}</abbr></span>
            ))}
          </div>

          {categories.map((cat, i) => {
            const existing = reportByCategory[cat.category_id] ?? null;
            // An older row's word lights its mark, as SF9 prints it.
            const current = observedMark(existing?.rating);
            const saving = savingStates[cat.category_id] ?? false;
            return (
              <div
                key={cat.category_id}
                role="group"
                aria-label={cat.name}
                className={`${COLS} border-b border-neutral-200 px-5 py-3 transition-colors hover:bg-brand-50`}
              >
                <span className="text-[12px] font-semibold tabular-nums text-neutral-500">
                  {saving ? (
                    <>
                      <i className="ti ti-loader-2 animate-spin text-[13px] text-brand-600" aria-hidden="true" />
                      <span className="sr-only">Saving</span>
                    </>
                  ) : i + 1}
                </span>
                <span className="text-[13px] leading-[1.45] text-neutral-900 [text-wrap:pretty]">{cat.name}</span>
                {OBSERVED_VALUES.map((v) => {
                  const selected = current === v.value;
                  return (
                    <button
                      key={v.value}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${v.label} (${v.value})`}
                      title={v.label}
                      disabled={saving || readOnly}
                      // Clicking the selected mark again clears it.
                      onClick={() => onRatingChange(cat, existing, selected ? null : v.value)}
                      style={selected ? { background: v.bg, color: v.color, borderColor: v.color } : undefined}
                      className={`focus-ring h-8 rounded-sm border-[1.5px] text-[12px] transition-colors disabled:cursor-not-allowed ${
                        selected
                          ? "font-bold"
                          : "border-neutral-300 bg-white font-semibold text-neutral-600 enabled:hover:border-brand-300 enabled:hover:text-brand-600 disabled:opacity-60"
                      }`}
                    >
                      {v.value}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </>
      )}

      <p className="px-5 py-3 text-[11.5px] text-neutral-500">
        Marks follow DepEd Order 8, s. 2015 and print on SF9 as shown.
        {!readOnly && " Click a selected mark again to clear it. Each mark saves as you pick it."}
      </p>
    </Card>
  );
}
