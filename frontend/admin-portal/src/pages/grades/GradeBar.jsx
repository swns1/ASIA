import Button from "../../components/ui/Button";
import { COMPONENT_COLORS, REMARKS_META, formatGrade, gradeStyle } from "./gradeRules";

// GradeBar — the bar under the score sheet that holds the quarter's grade and
// saves it. It replaces a Compute button, a Save button and a breakdown card:
// the grade now follows the scores as they change (the page asks the server,
// whose formula is the one that counts), and stays put at the bottom of the
// screen while the teacher works down the sheet.

const LABEL = "text-xs font-bold uppercase tracking-[0.08em] text-neutral-500";

const STATUS_TONE = {
  muted:   "text-neutral-500",
  success: "text-success-500",
  warning: "text-warning-500",
};

/**
 * @param {object|null} computation  computeGrade()'s answer for the current scores
 * @param {boolean} fresh      whether `computation` is for the scores on screen
 * @param {object|null} existingGrade  the grade saved for this subject and period
 * @param {"muted"|"success"|"warning"} statusTone
 * @param {string} statusText
 */
export default function GradeBar({
  computation,
  fresh,
  existingGrade,
  statusTone,
  statusIcon,
  statusText,
  remarks,
  onRemarksChange,
  canSave,
  saving,
  onSave,
  readOnly,
}) {
  const final = computation?.final_grade ?? null;
  const complete = Boolean(computation?.is_complete) && final !== null;
  const band = gradeStyle(final);

  return (
    <div className="sticky bottom-4 z-10 flex items-center gap-5 rounded-2xl border border-neutral-300 bg-white px-5 py-3.5 shadow-lg">
      <div className="flex min-w-0 flex-1 items-center gap-5">
        <div className="flex shrink-0 flex-col gap-px">
          <span className={LABEL}>Final grade</span>
          <span className="flex items-baseline gap-2.5">
            <span className={`text-[28px] font-bold leading-[1.1] tracking-[-0.01em] tabular-nums ${complete ? "text-neutral-900" : "text-neutral-500"}`}>
              {formatGrade(final)}
            </span>
            {!fresh && (
              <span className="self-center">
                <i className="ti ti-loader-2 animate-spin text-[14px] text-brand-600" aria-hidden="true" />
                <span className="sr-only">Updating the grade</span>
              </span>
            )}
            {final !== null && (
              complete ? (
                <span className="text-[12px] font-semibold" style={{ color: band.color }}>{band.label}</span>
              ) : (
                <span className="text-[12px] font-semibold text-neutral-500">Running grade</span>
              )
            )}
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          {computation?.components?.length > 0 && (
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {computation.components.map((c, i) => (
                <span key={c.component_id} className="flex items-center gap-1.5 text-[12px] text-neutral-800">
                  <span
                    className="h-[7px] w-[7px] rounded-full"
                    style={{ background: COMPONENT_COLORS[i % COMPONENT_COLORS.length] }}
                    aria-hidden="true"
                  />
                  {c.component_name}
                  <span className="font-bold tabular-nums text-neutral-900">
                    {c.weighted_score === null ? "—" : `+${Number(c.weighted_score).toFixed(2)}`}
                  </span>
                </span>
              ))}
              {/* The parts add up to the initial grade; DepEd's table turns
                  that into the grade above, so say which number this is. */}
              {computation.initial_grade !== null && (
                <span className="text-[12px] text-neutral-500">
                  Initial grade <span className="tabular-nums">{Number(computation.initial_grade).toFixed(2)}</span>, transmuted
                </span>
              )}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-neutral-500" role="status">
            <span className={`flex items-center gap-1 font-semibold ${STATUS_TONE[statusTone] ?? STATUS_TONE.muted}`}>
              <i className={`ti ${statusIcon} text-[13px]`} aria-hidden="true" />
              {statusText}
            </span>
            ·
            <span>
              {existingGrade
                ? `Saved grade ${formatGrade(existingGrade.numeric_grade)}`
                : "Nothing saved for this period yet"}
            </span>
          </span>
        </div>
      </div>

      {!readOnly && (
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <label className="relative flex items-center">
            <span className="sr-only">Remarks</span>
            <select
              value={remarks}
              onChange={(e) => onRemarksChange(e.target.value)}
              className="focus-ring h-10 appearance-none rounded-lg border-[1.5px] border-neutral-300 bg-white pl-3.5 pr-9 text-[12.5px] font-semibold text-neutral-900"
            >
              <option value="">No remarks</option>
              {Object.entries(REMARKS_META).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
            <i className="ti ti-chevron-down pointer-events-none absolute right-3 text-[13px] text-neutral-600" aria-hidden="true" />
          </label>
          <Button icon="ti-device-floppy" loading={saving} disabled={!canSave} onClick={onSave}>
            {existingGrade ? "Update grade" : "Save grade"}
          </Button>
        </div>
      )}
    </div>
  );
}
