import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import { LEVEL_LABELS } from "../../constants/schoolLevels";
import { GRADE_PASSING } from "../../utils/grading";
import {
  GRADE_LEGEND,
  PERIOD_LABELS,
  PERIOD_SHORT,
  formatGrade,
  gradeStyle,
  periodsFor,
  summarizeGrades,
} from "./gradeRules";

// SummaryCard — one enrollment's report card: every subject's period grades,
// its final rating and remarks, and the general average.
//
// Only failing grades are coloured. The old table put every grade in a
// band-coloured pill, so a page of passing grades was a page of colour and a
// failing one didn't stand out from it.

const REMARK = {
  passed:  { label: "Passed",      icon: "ti-circle-check", tone: "text-success-500" },
  failed:  { label: "Failed",      icon: "ti-circle-x",     tone: "text-error-500" },
  pending: { label: "In progress", icon: "ti-clock",        tone: "text-neutral-500" },
};

function Remark({ remark }) {
  const r = REMARK[remark ?? "pending"];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${r.tone}`}>
      <i className={`ti ${r.icon} text-[14px]`} aria-hidden="true" />
      {r.label}
    </span>
  );
}

const TH = "border-b border-neutral-200 px-3 py-2.5 text-[12px] font-semibold text-neutral-600";
const TD = "border-b border-neutral-200 px-3 py-[11px]";

const failing = (v) => v !== null && v < GRADE_PASSING;

export default function SummaryCard({ enrollment, subjects, grades, loading }) {
  if (loading) {
    return (
      <Card padding="lg">
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} width="100%" height={36} radius={8} />)}
        </div>
      </Card>
    );
  }

  const periods = periodsFor(enrollment);
  const s = summarizeGrades(subjects, grades, periods);
  const band = gradeStyle(s.generalAverage);

  // One line of what the table adds up to: subjects passed and failed once
  // every subject has a final rating, until then how far each period's
  // grading has got.
  const facts = s.allFinal
    ? `${subjects.length} subject${subjects.length === 1 ? "" : "s"} · ${s.passed.length} passed · ${s.failed.length} failed${
        s.failed.length ? ` (${s.failed.map((x) => x.subject_name).join(", ")})` : ""
      }`
    : s.progress
        .filter((p) => p.graded > 0)
        .map((p) => `${PERIOD_LABELS[p.period]} graded in ${p.graded} of ${subjects.length}`)
        .join(" · ");

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 px-5 py-[18px]">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h2 className="text-lg font-bold text-neutral-900">{enrollment.grade_level} · {enrollment.section}</h2>
          <span className="text-sm text-neutral-500">
            S.Y. {enrollment.school_year} · {LEVEL_LABELS[enrollment.school_level] ?? enrollment.school_level}
            {enrollment.strand && ` · ${enrollment.strand}`}
          </span>
        </div>
        <div className="flex items-end gap-4">
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">General average</span>
            <span className="text-[28px] font-bold leading-[1.1] tracking-[-0.01em] tabular-nums text-neutral-900">
              {s.generalAverage === null ? "—" : s.generalAverage.toFixed(2)}
            </span>
            {s.generalAverage === null ? (
              <span className="text-[11.5px] font-semibold text-neutral-500">Shown once every subject has a final rating</span>
            ) : (
              <span className="text-[11.5px] font-semibold" style={{ color: band.color }}>{band.label}</span>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon="ti-printer"
            to={`/print/sf9/${enrollment.enrollment_id}`}
            target="_blank"
            rel="noopener"
          >
            Print SF9
          </Button>
        </div>
      </div>

      {facts && (
        <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-100 px-5 py-2.5 text-sm text-neutral-800">
          <i className="ti ti-list-check shrink-0 text-[15px] text-neutral-600" aria-hidden="true" />
          {facts}
        </div>
      )}

      <div className="overflow-x-auto">
        {/* A cross-tab, not a record list, so it keeps its own <table>
            rather than the shared Table. */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className={`${TH} pl-5 text-left`}>Subject</th>
              {periods.map((p) => (
                <th key={p} scope="col" className={`${TH} w-16 text-right`}>
                  <abbr title={PERIOD_LABELS[p]} className="no-underline">{PERIOD_SHORT[p]}</abbr>
                </th>
              ))}
              <th scope="col" className={`${TH} w-24 text-right`}>Final rating</th>
              <th scope="col" className={`${TH} w-28 pr-5 text-left`}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {subjects.length === 0 ? (
              <tr>
                <td colSpan={periods.length + 3} className="px-5 py-10 text-center text-sm italic text-neutral-500">
                  No subjects found for this enrollment level.
                </td>
              </tr>
            ) : (
              <>
                {s.rows.map(({ subject, byPeriod, final, remark }) => (
                  <tr key={subject.subject_id} className="transition-colors hover:bg-brand-50">
                    <td className={`${TD} pl-5`}>
                      <div className="truncate text-[13px] font-semibold text-neutral-900">{subject.subject_name}</div>
                      <div className="font-mono text-[11px] text-neutral-500">{subject.subject_code}</div>
                    </td>
                    {periods.map((p) => (
                      <td
                        key={p}
                        className={`${TD} text-right text-[13px] tabular-nums ${
                          failing(byPeriod[p]) ? "font-bold text-error-500"
                          : byPeriod[p] === null ? "text-neutral-500" : "text-neutral-900"
                        }`}
                      >
                        {formatGrade(byPeriod[p])}
                      </td>
                    ))}
                    <td className={`${TD} text-right text-[13px] font-bold tabular-nums ${
                      failing(final) ? "text-error-500" : final === null ? "text-neutral-500" : "text-neutral-900"
                    }`}>
                      {final === null ? "—" : final.toFixed(2)}
                    </td>
                    <td className={`${TD} pr-5`}><Remark remark={remark} /></td>
                  </tr>
                ))}
                <tr className="bg-neutral-50">
                  <th scope="row" className={`${TD} pl-5 text-left text-[13px] font-bold text-neutral-900`}>General average</th>
                  {periods.map((p) => (
                    <td key={p} className={`${TD} text-right text-[12px] tabular-nums text-neutral-500`}>
                      {s.periodAverages[p] === null ? "—" : s.periodAverages[p].toFixed(2)}
                    </td>
                  ))}
                  <td className={`${TD} text-right text-base font-bold tabular-nums text-neutral-900`}>
                    {s.generalAverage === null ? "—" : s.generalAverage.toFixed(2)}
                  </td>
                  <td className={`${TD} pr-5`}>
                    <Remark remark={s.generalAverage === null ? null : s.generalAverage >= GRADE_PASSING ? "passed" : "failed"} />
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      <p className="px-5 py-3 text-[11.5px] leading-relaxed text-neutral-500">
        {GRADE_LEGEND.map((l) => `${l.range} ${l.label}`).join(" · ")}. The period cells in the last row are each period's average.
      </p>
    </Card>
  );
}
