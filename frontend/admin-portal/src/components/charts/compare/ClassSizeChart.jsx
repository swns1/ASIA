import { NoData } from "../ChartFrame";
import { token } from "../tokens";
import { fmtCount, fmtOne, plural } from "../../schoolYears/compareFigures";
import ChartCard, { Caption } from "./ChartCard";

// 1f — one row per year: how full its sections are, and how many of them have
// an adviser. A list rather than a plot: two measures on different scales,
// each read as its figure, with a bar beside it for the eye.

const ROW = "grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)] gap-4";

export default function ClassSizeChart({ years, source }) {
  return (
    <ChartCard
      icon="ti-school"
      title="Class size and adviser coverage"
      subtitle="Learners per section, and sections with an adviser"
      source={source}
      errorSubject="the comparison"
      body="list"
    >
      <ClassSize years={years} get={source.get} />
    </ChartCard>
  );
}

function Track({ ratio, color, title }) {
  return (
    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-[4px] bg-neutral-300" title={title}>
      <div
        className="h-full rounded-[4px]"
        style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, background: color }}
      />
    </div>
  );
}

function ClassSize({ years, get }) {
  const rows = years.map((year) => {
    const s = get(year);
    const sections = s?.sections.total ?? 0;
    const learners = s?.enrollment.learners ?? 0;
    return {
      year,
      sections,
      advised: s?.sections.with_adviser ?? 0,
      perSection: sections ? learners / sections : null,
    };
  });
  if (!rows.some((r) => r.sections)) return <NoData message="None of these years has sections yet." />;

  // Class size bars are measured against the fullest year's.
  const fullest = Math.max(...rows.map((r) => r.perSection ?? 0));
  const colors = { size: token("--color-brand-400"), advised: token("--color-brand-600") };
  const latest = rows.at(-1);
  const unadvised = latest.sections - latest.advised;

  return (
    <>
      <div role="table" aria-label="Class size and adviser coverage by year">
        <div
          role="row"
          className={`${ROW} border-b border-neutral-200 py-2 text-xs font-bold uppercase tracking-[0.08em] text-neutral-500`}
        >
          <span role="columnheader">Year</span>
          <span role="columnheader">Learners per section</span>
          <span role="columnheader">With an adviser</span>
        </div>
        {rows.map((r) => (
          <div key={r.year} role="row" className={`${ROW} items-center border-b border-neutral-200/70 py-3`}>
            <div role="rowheader">
              <div className="text-[13px] font-semibold text-neutral-900">S.Y. {r.year}</div>
              <div className="text-xs text-neutral-500">{plural(r.sections, "section")}</div>
            </div>
            <div role="cell" className="flex items-center gap-2.5">
              <span className="min-w-[34px] text-[13.5px] font-bold tabular-nums text-neutral-900">
                {r.perSection == null ? "—" : fmtOne(r.perSection)}
              </span>
              {r.perSection != null && (
                <Track
                  ratio={fullest ? r.perSection / fullest : 0}
                  color={colors.size}
                  title={`${fmtOne(r.perSection)} learners per section`}
                />
              )}
            </div>
            <div role="cell" className="flex items-center gap-2.5">
              {r.sections ? (
                <>
                  <Track
                    ratio={r.advised / r.sections}
                    color={colors.advised}
                    title={`${fmtCount(r.advised)} of ${plural(r.sections, "section")} with an adviser`}
                  />
                  <span className="whitespace-nowrap text-[11.5px] tabular-nums text-neutral-800">
                    {fmtCount(r.advised)} of {fmtCount(r.sections)}
                  </span>
                </>
              ) : (
                <span className="text-[11.5px] text-neutral-500">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <Caption>
        {latest.sections === 0
          ? `S.Y. ${latest.year} has no sections yet.`
          : unadvised > 0
            ? `${plural(unadvised, "section")} in S.Y. ${latest.year} still need${unadvised === 1 ? "s" : ""} an adviser.`
            : `Every section in S.Y. ${latest.year} has an adviser.`}
      </Caption>
    </>
  );
}
