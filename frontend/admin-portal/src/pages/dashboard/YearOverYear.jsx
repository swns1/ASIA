// YearOverYear — the admin home's "this year vs last year" panels: learners
// and money for the picked year beside the year before it.
//
// Enrollees replaces the Enrolled tile. Billing sits above the year's own
// Billing panel (net billed, collected, outstanding), so it only draws the
// comparison and leaves the figures to that panel rather than repeating them.
// Both follow the page's year picker, and both come from useYearComparison,
// which reads the same sources as the Compare School Years page; its "Compare
// years" link is the full table behind these charts.
//
// Changes are neutral grey, as on the Compare page: more learners is good,
// more money outstanding isn't, and a colour meaning "good" in one panel and
// "bad" in the next reads worse than none.

import Card, { Panel } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import PairedColumnChart from "../../components/charts/PairedColumnChart";
import { levelRows, plural, withYear, yearChange } from "./adminHomeData";

const count = (n) => Number(n).toLocaleString("en-PH");

// Whole pesos on the columns and in the change; centavos stay in the Billing
// panel's figures.
const pesoShort = (n) =>
  `₱${Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

// The grid's labels only need to be readable at a glance: ₱200K, ₱1.2M.
const compact = new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 1 });
const pesoTick = (n) => `₱${compact.format(n)}`;

function ChangeLine({ change, since, format }) {
  if (!change) return null;
  if (!change.diff) {
    return <span className="text-xs text-neutral-500">No change from S.Y. {since}</span>;
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-neutral-500">
      <i className={`ti ${change.diff > 0 ? "ti-arrow-up-right" : "ti-arrow-down-right"}`} aria-hidden="true" />
      {change.diff > 0 ? "+" : "−"}
      {format(Math.abs(change.diff))}
      {change.pct != null && ` (${change.pct}%)`} from S.Y. {since}
    </span>
  );
}

function NoPrevious({ prev }) {
  return <p className="mt-2 text-xs text-neutral-500">No S.Y. {prev} to compare with.</p>;
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton height={28} width="45%" variant="pulse" />
      <Skeleton height={160} variant="pulse" />
    </div>
  );
}

// ── Enrollees ────────────────────────────────────────────────────────────────

export function EnrolleesPanel({ cmp, onGo }) {
  const { year, prev, compared, noPrevious, school } = cmp;
  const now = school.current?.enrollment;
  const before = school.previous?.enrollment;

  const detail = now
    ? [
        now.returning != null && `${count(now.returning)} returning`,
        now.new != null && `${count(now.new)} new`,
        now.transferred_out > 0 && `${count(now.transferred_out)} transferred out`,
      ].filter(Boolean).join(" · ")
    : "";

  return (
    <Panel
      title="Enrollees"
      subtitle={compared ? `S.Y. ${year} vs ${prev}` : `S.Y. ${year}`}
      icon="ti-school"
      // A column so the chart can take the height the row gives this card:
      // it stretches to end level with the Billing column beside it.
      bodyClassName="flex flex-col"
      action={
        compared && (
          <Button
            variant="ghost"
            size="sm"
            iconRight
            icon="ti-arrow-right"
            onClick={() => onGo(`/school-years/compare?years=${prev},${year}`)}
          >
            Compare years
          </Button>
        )
      }
    >
      {school.loading ? (
        <PanelSkeleton />
      ) : school.error || !now ? (
        <ErrorState error={school.error} subject="the learner counts" onRetry={school.retry} />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => onGo(withYear("/enrollments", year))}
              className="focus-ring rounded-sm text-2xl font-bold tabular-nums tracking-[-0.02em] text-neutral-900 transition-colors hover:text-brand-600"
            >
              {plural(now.learners, "learner")}
            </button>
            <ChangeLine change={yearChange(now.learners, before?.learners)} since={prev} format={count} />
          </div>
          {detail && <p className="mt-1 text-xs text-neutral-600">{detail}</p>}
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <PairedColumnChart
              title={`Learners by school level, S.Y. ${year}${compared ? ` against ${prev}` : ""}`}
              rows={levelRows(now.by_level, before?.by_level ?? null)}
              currentLabel={`S.Y. ${year}`}
              previousLabel={`S.Y. ${prev}`}
              fill
              integer
              formatValue={count}
              emptyMessage={`No learners in S.Y. ${year} yet.`}
              caption="Enrolled, completed or transferred out, each learner counted once."
            />
          </div>
          {noPrevious && <NoPrevious prev={prev} />}
        </>
      )}
    </Panel>
  );
}

// ── Billing, against last year ───────────────────────────────────────────────
// Net billed and collected for both years on one peso scale. The eye button
// here governs the Billing panel under it too, so the column has one control
// for hiding amounts, not two that could be mistaken for separate ones.

function NetBilledChange({ change, since }) {
  if (!change) return null;
  if (!change.diff) return <p className="text-sm text-neutral-700">Net billed is the same as S.Y. {since}.</p>;
  return (
    <p className="text-sm text-neutral-700">
      Net billed is {change.diff > 0 ? "up" : "down"}{" "}
      <strong className="font-bold tabular-nums text-neutral-900">
        {pesoShort(Math.abs(change.diff))}
        {change.pct != null && ` (${change.pct}%)`}
      </strong>{" "}
      from S.Y. {since}.
    </p>
  );
}

export function BillingComparePanel({ cmp, showAmounts, onToggleAmounts }) {
  const { year, prev, compared, noPrevious, money } = cmp;
  const now = money.current;
  const before = money.previous;
  const outstanding = Number(now?.outstanding ?? 0);

  // Blurring is presentation only -- the figures are still in the DOM. It
  // hides them from someone glancing at the screen, as BillingPanel does.
  const hideStyle = { filter: showAmounts ? "none" : "blur(8px)", userSelect: showAmounts ? "auto" : "none" };

  const rows = now
    ? [
        { key: "net_billed", label: "Net billed", current: Number(now.net_billed), previous: before ? Number(before.net_billed) : null },
        { key: "collected", label: "Collected", current: Number(now.total_collected), previous: before ? Number(before.total_collected) : null },
      ]
    : [];

  return (
    // flex-1: this card takes whatever height its column has left over, and
    // its chart fills it, so the column ends level with Enrollees.
    <Card padding="none" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-neutral-200 px-5 py-3.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-brand-100">
          <i className="ti ti-chart-bar text-[14px] text-brand-600" aria-hidden="true" />
        </div>
        <span className="flex-1 text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500">
          {compared ? `Billing · S.Y. ${year} vs ${prev}` : `Billing · S.Y. ${year}`}
        </span>
        <Button
          variant={showAmounts ? "secondary" : "ghost"}
          size="sm"
          iconOnly
          icon={showAmounts ? "ti-eye" : "ti-eye-off"}
          title={showAmounts ? "Hide amounts" : "Show amounts"}
          aria-label={showAmounts ? "Hide financial amounts" : "Show financial amounts"}
          aria-pressed={!showAmounts}
          onClick={onToggleAmounts}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
        {money.loading ? (
          <PanelSkeleton />
        ) : money.error || !now ? (
          <ErrorState error={money.error} subject="billing figures" onRetry={money.retry} />
        ) : (
          <>
            <div style={hideStyle} className="flex min-h-0 flex-1 flex-col">
              <NetBilledChange change={yearChange(now.net_billed, before?.net_billed)} since={prev} />
              <div className="mt-3 flex min-h-0 flex-1 flex-col">
                <PairedColumnChart
                  title={`Net billed and collected, S.Y. ${year}${compared ? ` against ${prev}` : ""}`}
                  rows={rows}
                  currentLabel={`S.Y. ${year}`}
                  previousLabel={`S.Y. ${prev}`}
                  fill
                  height={200}
                  formatValue={pesoShort}
                  formatTick={pesoTick}
                  emptyMessage={`Nothing billed for S.Y. ${year} yet.`}
                  caption={`As of today.${outstanding > 0 ? ` S.Y. ${year} is still collecting.` : ""}`}
                />
              </div>
            </div>
            {noPrevious && <NoPrevious prev={prev} />}
          </>
        )}
      </div>
    </Card>
  );
}
