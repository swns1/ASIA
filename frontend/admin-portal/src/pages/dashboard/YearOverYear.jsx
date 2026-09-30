// YearOverYear — the admin home's "this year vs last year" panels: learners
// by level, and how fast money is coming in, for the picked year beside the
// year before it.
//
// Enrollees replaces the Enrolled tile. Collection pace sits beside it, with
// the year's own Billing panel (net billed, collected, outstanding) under the
// pair, so it draws the pace and leaves the figures to that panel rather than
// repeating them. Both follow the page's year picker, and both come from
// useYearComparison, which reads the same sources as the Compare School Years
// page; its "Compare years" link is the full table behind these panels.
//
// Every change from one year to the next carries a pill: green with an arrow
// up, red with an arrow down. The arrow and the sign say which way without the
// colour, so the colour only adds to what the text already says. (Compare
// School Years keeps its changes grey: it lays whole rows of changes side by
// side, where colour on every cell would drown the figures.)

import Badge from "../../components/ui/Badge";
import Card, { Panel } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import ErrorState from "../../components/ui/ErrorState";
import Skeleton from "../../components/ui/Skeleton";
import ColumnPlot from "../../components/charts/ColumnPlot";
import { NoData } from "../../components/charts/ChartFrame";
import Legend from "../../components/charts/Legend";
import { linePath } from "../../components/charts/geometry";
import { linearAxis } from "../../components/charts/scale";
import { levelColor, token } from "../../components/charts/tokens";
import { LEVEL_ICONS, LEVEL_SHORT_LABELS } from "../../constants/schoolLevels";
import { collectionPace, levelRows, plural, withYear, yearChange } from "./adminHomeData";

const count = (n) => Number(n).toLocaleString("en-PH");
const one = (n) => Number(n).toFixed(1);
const sign = (d) => (d > 0 ? "+" : d < 0 ? "−" : "");

const PILL = {
  up:   { variant: "success", icon: "ti-arrow-up-right" },
  down: { variant: "error",   icon: "ti-arrow-down-right" },
  same: { variant: "muted",   icon: undefined },
};

// A change from last year as a pill. `diff` decides the direction; `text` is
// what it reads ("+4.3%", "−1.2 pts").
function ChangePill({ diff, text, size = "sm" }) {
  const tone = PILL[diff > 0 ? "up" : diff < 0 ? "down" : "same"];
  return (
    <Badge variant={tone.variant} size={size} icon={tone.icon} className="whitespace-nowrap tabular-nums">
      {text}
    </Badge>
  );
}

function NoPrevious({ prev }) {
  return <p className="text-xs text-neutral-500">No S.Y. {prev} to compare with.</p>;
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

function HeadlineChange({ change, since }) {
  if (!change) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
      {change.pct != null && (
        <ChangePill size="lg" diff={change.diff} text={`${sign(change.diff)}${one(change.pct)}%`} />
      )}
      {change.diff ? `${sign(change.diff)}${count(Math.abs(change.diff))}` : "No change"} from S.Y. {since}
    </span>
  );
}

// One level: this year's bar in the level's colour, last year's thinner and
// grey beneath it, both on the panel's one scale; then the count, the change
// and its percentage in fixed columns, so they line up down the panel. In a
// card too narrow for all three side by side (a phone), the bars take a line
// of their own under the label and the figures.
function LevelRow({ row, longest, compared, year, prev }) {
  const change = compared ? yearChange(row.current, row.previous) : null;
  const width = (n) => `${longest ? (n * 100) / longest : 0}%`;
  const color = levelColor(row.key);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 @sm:grid-cols-[110px_minmax(0,1fr)_auto]">
      <span className="inline-flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold text-neutral-800">
        <i className={`ti ${LEVEL_ICONS[row.key]}`} style={{ color }} aria-hidden="true" />
        {LEVEL_SHORT_LABELS[row.key]}
      </span>
      <div
        className="order-last col-span-2 flex flex-col gap-[3px] @sm:order-none @sm:col-span-1"
        title={`${row.label}: ${count(row.current)} in S.Y. ${year}${compared ? `, ${count(row.previous)} in S.Y. ${prev}` : ""}`}
        aria-hidden="true"
      >
        <div className="h-2.5 rounded-r-[4px]" style={{ width: width(row.current), background: color }} />
        {compared && <div className="h-1 rounded-r-[2px] bg-neutral-400" style={{ width: width(row.previous) }} />}
      </div>
      {/* Fixed widths, so the columns line up from row to row: room for a
          four-digit count, a three-digit change, and a pill up to "+100.0%"
          with its arrow. */}
      <div className="grid grid-cols-[40px_30px_80px] items-center gap-1.5 whitespace-nowrap tabular-nums">
        <span className="text-right text-[13px] font-bold text-neutral-900">{count(row.current)}</span>
        <span className="text-right text-xs text-neutral-500">
          {change && `${sign(change.diff)}${count(Math.abs(change.diff))}`}
        </span>
        <span className="justify-self-end">
          {change?.pct != null && <ChangePill diff={change.diff} text={`${sign(change.diff)}${one(change.pct)}%`} />}
        </span>
      </div>
    </div>
  );
}

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
  const rows = now ? levelRows(now.by_level, before?.by_level ?? null) : [];
  const longest = Math.max(0, ...rows.map((r) => Math.max(r.current, r.previous ?? 0)));

  return (
    <Panel
      title="Enrollees"
      subtitle={compared ? `S.Y. ${year} vs ${prev}` : `S.Y. ${year}`}
      icon="ti-school"
      className="min-w-0"
      bodyClassName="flex flex-col gap-3.5"
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
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => onGo(withYear("/enrollments", year))}
                className="focus-ring rounded-sm text-2xl font-bold leading-[1.1] tabular-nums tracking-[-0.02em] text-neutral-900 transition-colors hover:text-brand-600"
              >
                {plural(now.learners, "learner")}
              </button>
              <HeadlineChange change={yearChange(now.learners, before?.learners)} since={prev} />
            </div>
            {detail && <p className="mt-1 text-xs text-neutral-600">{detail}</p>}
          </div>
          {!rows.length ? (
            <NoData message={`No learners in S.Y. ${year} yet.`} />
          ) : (
            <>
              {compared && (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-neutral-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-3.5 rounded-[2px] bg-neutral-800" aria-hidden="true" />
                    S.Y. {year} (colour by level)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1 w-3.5 rounded-[2px] bg-neutral-400" aria-hidden="true" />
                    S.Y. {prev}
                  </span>
                </div>
              )}
              {/* Rows share out a stretched card's extra height rather than
                  leaving it as a gap at the bottom. */}
              <div className="@container flex flex-1 flex-col justify-evenly gap-3">
                {rows.map((row) => (
                  <LevelRow key={row.key} row={row} longest={longest} compared={compared} year={year} prev={prev} />
                ))}
              </div>
              <p className="text-xs text-neutral-500">Enrolled, completed or transferred out, each learner counted once.</p>
            </>
          )}
          {noPrevious && <NoPrevious prev={prev} />}
        </>
      )}
    </Panel>
  );
}

// ── Collection pace ──────────────────────────────────────────────────────────
// Each year's share of its net billing collected by the end of each month.
// Setting this year's running total against last year's whole-year total
// always reads as behind; a share by month shows whether collection is ahead
// of or behind last year right now. The eye button here governs the Billing
// panel under the pair too, so there is one control for hiding amounts, not
// two that could be mistaken for separate ones.

function PaceChart({ pace, year, prev }) {
  const colors = { now: token("--color-brand-500"), before: token("--color-neutral-400"), label: token("--color-brand-600") };
  const { months, latest } = pace;
  const pct = (v) => `${one(v)}%`;

  return (
    <ColumnPlot
      title={`Share of net billing collected by month, S.Y. ${year}${prev ? ` against ${prev}` : ""}`}
      legend={
        <Legend
          shape="line"
          className="mb-3"
          items={[
            { key: "now", label: `S.Y. ${year}`, color: colors.now },
            ...(prev ? [{ key: "before", label: `S.Y. ${prev}`, color: colors.before }] : []),
          ]}
        />
      }
      axis={linearAxis(0, 100)}
      formatTick={(v) => `${v}%`}
      labels={months.map((m) => ({ key: m.key, label: m.short, muted: m.now == null }))}
      plotHeight={170}
      gutter={40}
      padTop={20}
    >
      {(geo) => {
        const points = (key) => months.map((m, i) => (m[key] == null ? null : { x: geo.x(i), y: geo.y(m[key]) }));
        const [line] = linePath(points("now"));
        const shown = points("now").filter(Boolean);
        const end = shown.at(-1);
        // Along the line, then down to the baseline and back: the area under it.
        const area = line && `${line} L ${end.x.toFixed(2)} ${geo.base} L ${shown[0].x.toFixed(2)} ${geo.base} Z`;
        // The latest figure sits right of its point, unless that runs off the plot.
        const flip = end && end.x + 48 > geo.width;
        return (
          <>
            {linePath(points("before")).map((d) => (
              <path key={d} d={d} fill="none" stroke={colors.before} strokeWidth={2} strokeLinejoin="round" />
            ))}
            {area && <path d={area} fill={colors.now} opacity={0.08} />}
            {line && (
              <path d={line} fill="none" stroke={colors.now} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            )}
            {["before", "now"].map((key) => months.map((m, i) => (m[key] == null ? null : (
              <circle
                key={`${key}-${m.key}`}
                cx={geo.x(i)} cy={geo.y(m[key])} r={3.5}
                fill="#fff" stroke={colors[key]} strokeWidth={2}
              >
                <title>{`S.Y. ${key === "now" ? year : prev} · ${m.short} · ${pct(m[key])}`}</title>
              </circle>
            ))))}
            {end && (
              <text
                x={flip ? end.x - 8 : end.x + 8} y={end.y - 10}
                textAnchor={flip ? "end" : "start"}
                fontSize="12" fontWeight="700" fill={colors.label}
                // A halo, so last year's line can pass behind it.
                stroke="#fff" strokeWidth={3} paintOrder="stroke"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {pct(latest.now)}
              </text>
            )}
          </>
        );
      }}
    </ColumnPlot>
  );
}

function PaceSummary({ pace, year, compared }) {
  const { latest } = pace;
  if (!latest) return <p className="text-sm text-neutral-700">No month of S.Y. {year} has ended yet.</p>;
  const both = compared && latest.before != null;
  const diff = both ? latest.now - latest.before : 0;
  const level = Math.abs(diff) < 0.05;
  return (
    <>
      {both && (
        <div className="flex flex-wrap items-center gap-2">
          <ChangePill size="lg" diff={level ? 0 : diff} text={`${level ? "" : sign(diff)}${one(Math.abs(diff))} pts`} />
          <span className="text-xs text-neutral-500">
            {level ? "level with last year's pace" : diff > 0 ? "ahead of last year's pace" : "behind last year's pace"}
          </span>
        </div>
      )}
      <p className="text-sm text-neutral-700">
        By end of {latest.name},{" "}
        <strong className="font-bold tabular-nums text-neutral-900">{one(latest.now)}%</strong> of this year's billing is collected
        {both ? (
          <>
            , against <strong className="font-bold tabular-nums text-neutral-900">{one(latest.before)}%</strong> at the same point last year.
          </>
        ) : "."}
      </p>
    </>
  );
}

export function CollectionPacePanel({ cmp, today, showAmounts, onToggleAmounts }) {
  const { year, prev, compared, noPrevious, money } = cmp;
  const now = money.current;
  const pace = now ? collectionPace(year, now, compared ? money.previous : null, today) : null;

  // Blurring is presentation only -- the figures are still in the DOM. It
  // hides them from someone glancing at the screen, as BillingPanel does.
  const hideStyle = { filter: showAmounts ? "none" : "blur(8px)", userSelect: showAmounts ? "auto" : "none" };

  return (
    <Card padding="none" className="flex min-w-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-neutral-200 px-5 py-3.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-brand-100">
          <i className="ti ti-trending-up text-[14px] text-brand-600" aria-hidden="true" />
        </div>
        <span className="flex-1 text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500">
          {compared ? `Collection pace · S.Y. ${year} vs ${prev}` : `Collection pace · S.Y. ${year}`}
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

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
        {money.loading ? (
          <PanelSkeleton />
        ) : money.error || !now ? (
          <ErrorState error={money.error} subject="billing figures" onRetry={money.retry} />
        ) : (
          <>
            {!pace ? (
              <NoData message={`Nothing billed for S.Y. ${year} yet.`} />
            ) : (
              <div style={hideStyle} className="flex flex-col gap-3">
                <PaceSummary pace={pace} year={year} compared={compared} />
                <PaceChart pace={pace} year={year} prev={compared ? prev : null} />
                <p className="text-xs text-neutral-500">
                  Share of each year's net billing collected, month by month.
                  {pace.lastYearFinal != null && ` Last year finished at ${one(pace.lastYearFinal)}%.`}
                </p>
              </div>
            )}
            {noPrevious && <NoPrevious prev={prev} />}
          </>
        )}
      </div>
    </Card>
  );
}
