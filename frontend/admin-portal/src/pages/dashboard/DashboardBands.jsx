// DashboardBands — the chart bands on the staff dashboard and the admin home.
//
// Kept out of DashboardPage.jsx, which is already 950 lines. Each band is a
// self-contained Panel so the page composes them and decides which roles see
// which, rather than threading chart props through the page body. Two are the
// admin home's own takes on a staff band: RiskByLevelBand splits RiskBand's
// one bar by school level, and AttendanceTargetBand marks the weeks that fell
// below target on the same series AttendanceBand draws.
//
// Everything draws with components/charts/, the same language the Analytics
// page uses. Nothing here invents a colour: risk bands come from
// analytics/riskVocabulary (the reserved status palette), and every other mark
// is a single brand hue from styles/tokens.css.

import { useId } from "react";

import BarChart from "../../components/charts/BarChart";
import { NoData } from "../../components/charts/ChartFrame";
import ColumnPlot from "../../components/charts/ColumnPlot";
import LineChart from "../../components/charts/LineChart";
import Meter from "../../components/charts/Meter";
import StackedBar from "../../components/charts/StackedBar";
import { linePath } from "../../components/charts/geometry";
import { linearAxis } from "../../components/charts/scale";
import Skeleton from "../../components/ui/Skeleton";
import { Panel } from "../../components/ui/Card";
import { STROKE, chartInk, token } from "../../components/charts/tokens";
import useTheme from "../../hooks/useTheme";
import { LEVEL_LABELS, LEVEL_SHORT_LABELS } from "../../constants/schoolLevels";
import {
  GOOD_ATTENDANCE,
  RISK_LEVELS,
  riskLevelMeta,
} from "../analytics/riskVocabulary";
import { monthSpans, plural } from "./adminHomeData";

function ChartSkeleton({ height = 180 }) {
  return <Skeleton height={height} variant="pulse" />;
}

// ── Enrollment pipeline ──────────────────────────────────────────────────────
// Pending → Enrolled → Completed is part-to-whole of the cohort, so a stacked
// bar reads it correctly: the reader wants the proportion at each stage, not
// three unrelated magnitudes. `exited` is excluded deliberately — a cancelled
// enrollment left the funnel rather than sitting in a stage of it (see
// dashboard/services.py).

const PIPELINE_STEPS = [
  { key: "pending",   label: "Pending",   tokenName: "--color-warning-500", blurb: "Applications waiting on a decision" },
  { key: "enrolled",  label: "Enrolled",  tokenName: "--color-info-500",    blurb: "Currently studying" },
  { key: "completed", label: "Completed", tokenName: "--color-success-500", blurb: "Finished the school year" },
];

// The bar's drawing box: the full-size band, the compact one for a narrow
// card, and `measured` for one across a whole page, drawn at its real width
// with no room above the bar (nothing sits there).
const PIPELINE_GEOMETRY = {
  full:     { height: 150, barY: 26, barH: 56 },
  compact:  { height: 120, barY: 18, barH: 46 },
  measured: { height: 100, barY: 8,  barH: 46 },
};

export function PipelineBand({ pipeline, loading, schoolYear, compact = false, measured = false }) {
  const theme = useTheme();
  if (loading) return <Panel title="Enrollment Pipeline"><ChartSkeleton height={measured ? 100 : 150} /></Panel>;

  const segments = PIPELINE_STEPS.map((step) => ({
    key: step.key,
    label: step.label,
    blurb: step.blurb,
    value: pipeline?.[step.key] ?? 0,
    color: token(step.tokenName, theme),
  }));

  const total = pipeline?.total ?? 0;
  const exited = pipeline?.exited ?? 0;

  return (
    <Panel
      title="Enrollment Pipeline"
      subtitle={`S.Y. ${schoolYear}`}
    >
      <StackedBar
        title={`Enrollment pipeline for school year ${schoolYear}`}
        segments={segments}
        {...PIPELINE_GEOMETRY[measured ? "measured" : compact ? "compact" : "full"]}
        measured={measured}
        emptyMessage="No enrollments recorded for this school year yet."
        caption={
          total
            ? `${total} enrollment${total === 1 ? "" : "s"} in the pipeline` +
              (exited ? ` · ${exited} cancelled or transferred out, not counted above.` : ".")
            : undefined
        }
        legend={<StepLegend steps={PIPELINE_STEPS} pipeline={pipeline} />}
      />
    </Panel>
  );
}

function StepLegend({ steps, pipeline }) {
  const theme = useTheme();
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {steps.map((step) => (
        <span key={step.key} className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: token(step.tokenName, theme) }}
            aria-hidden="true"
          />
          {step.label}
          <span className="font-bold tabular-nums text-neutral-900">
            {(pipeline?.[step.key] ?? 0).toLocaleString()}
          </span>
        </span>
      ))}
    </div>
  );
}

// ── Level distribution ───────────────────────────────────────────────────────
// Magnitude across five named, ordered categories. One hue for every bar: the
// length already encodes the value, so shading by size would spend the only
// free channel repeating it.

export function LevelBand({ levels, loading }) {
  if (loading) return <Panel title="Students by Level"><ChartSkeleton /></Panel>;

  const rows = (levels ?? []).map((l) => ({
    key: l.level,
    label: l.label,
    value: l.count,
  }));
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <Panel title="Students by Level" subtitle="Currently enrolled">
      <BarChart
        title="Enrolled students by school level"
        rows={rows}
        emptyMessage="No students enrolled yet."
        caption={total ? `${total} student${total === 1 ? "" : "s"} enrolled across all levels.` : undefined}
      />
    </Panel>
  );
}

// ── At-risk students ─────────────────────────────────────────────────────────
// The thesis's analytical contribution, on the landing page. Labels and colours
// come from riskVocabulary so staff read "Needs urgent help", never "critical"
// or a cluster index — and so this band and the Analytics page can never drift
// into two vocabularies for one number.

export function RiskBand({ risk, loading, onOpen, compact = false }) {
  if (loading) return <Panel title="Students Needing Attention"><ChartSkeleton height={150} /></Panel>;

  const bands = risk?.bands ?? {};
  // riskVocabulary orders these critical → low for its own tables; the chart
  // reads least to most severe so the eye travels toward the problem.
  const segments = [...RISK_LEVELS].reverse().map((level) => {
    const meta = riskLevelMeta(level);
    return {
      key: level,
      label: meta.label,
      blurb: meta.blurb,
      value: bands[level] ?? 0,
      color: meta.color,
    };
  });

  const flagged = risk?.flagged ?? 0;
  const total = risk?.total ?? 0;

  return (
    <Panel
      title="Students Needing Attention"
      subtitle={risk?.computed_at
        ? `Assessed ${new Date(risk.computed_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`
        : undefined}
      action={onOpen}
    >
      <StackedBar
        title="Students by level of concern"
        segments={segments}
        height={compact ? 120 : 150}
        barY={compact ? 18 : 26}
        barH={compact ? 46 : 56}
        emptyMessage="No risk assessment has been run for this school year yet."
        caption={
          total
            ? `${flagged} of ${total} student${total === 1 ? "" : "s"} need following up.`
            : undefined
        }
        legend={<RiskLegend bands={bands} />}
      />
    </Panel>
  );
}

/**
 * Always rendered wherever risk bands are drawn. The reserved status steps are
 * not separable by hue alone — two of them measure under 3:1 by design — so
 * the icon and the word are what actually carry the meaning.
 */
function RiskLegend({ bands, className = "mb-2" }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className}`}>
      {/* Reversed to match the bar's low -> critical order. RISK_LEVELS is
          declared critical-first for the Analytics tables, and reading the
          legend in one direction while the bar runs the other makes the two
          impossible to line up. */}
      {[...RISK_LEVELS].reverse().map((level) => {
        const meta = riskLevelMeta(level);
        return (
          <span key={level} className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
            <i className={`ti ${meta.icon} text-[13px]`} style={{ color: meta.color }} aria-hidden="true" />
            {meta.label}
            <span className="font-bold tabular-nums text-neutral-900">{bands[level] ?? 0}</span>
          </span>
        );
      })}
    </div>
  );
}

// ── At-risk students, by level (admin home) ──────────────────────────────────
// RiskBand's bands split by school level: one bar per level, as long as the
// level has learners assessed, so the eye goes to where the follow-ups are.
// That is what an admin can act on; the school-wide count is already the
// "Need follow-up" tile on the same page.

const LOW_TO_CRITICAL = [...RISK_LEVELS].reverse();

function assessedOn(risk) {
  return risk?.computed_at
    ? `Assessed ${new Date(risk.computed_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`
    : undefined;
}

function RiskLevelRow({ row, longest }) {
  const label = LEVEL_SHORT_LABELS[row.level] ?? row.label;
  const segments = LOW_TO_CRITICAL
    .map((level) => ({ level, n: row.bands[level] ?? 0, meta: riskLevelMeta(level) }))
    .filter((s) => s.n > 0);
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-2.5">
      <span className="text-[11.5px] font-semibold text-neutral-800">{label}</span>
      <div
        className="flex h-3.5 gap-0.5"
        style={{ width: `${(row.total * 100) / longest}%` }}
        role="img"
        aria-label={`${label}: ${segments.map((s) => `${s.n} ${s.meta.label}`).join(", ")}`}
      >
        {segments.map((s) => (
          <div
            key={s.level}
            title={`${label} · ${s.meta.label} · ${s.n}`}
            className="h-full min-w-1 rounded-[2px]"
            style={{ flex: `${s.n} 1 0`, background: s.meta.color }}
          />
        ))}
      </div>
      <span className="whitespace-nowrap text-right text-xs text-neutral-600">
        <strong className="text-sm font-bold tabular-nums text-neutral-900">{row.flagged}</strong> to follow up
      </span>
    </div>
  );
}

export function RiskByLevelBand({ risk, loading, onOpen }) {
  const title = "Students needing attention, by level";
  if (loading) return <Panel title={title}><ChartSkeleton height={150} /></Panel>;
  // A summary from before it counted by level: the school-wide bar instead.
  if (risk && !risk.by_level) return <RiskBand risk={risk} loading={false} onOpen={onOpen} compact />;

  const rows = (risk?.by_level ?? []).filter((r) => r.total > 0);
  const longest = Math.max(0, ...rows.map((r) => r.total));
  const top = rows.reduce((best, r) => (r.flagged > (best?.flagged ?? 0) ? r : best), null);

  return (
    <Panel
      title={title}
      subtitle={assessedOn(risk)}
      action={onOpen}
      className="min-w-0"
      bodyClassName="flex flex-col gap-3"
    >
      {!rows.length ? (
        <NoData message="No risk assessment has been run for this school year yet." />
      ) : (
        <>
          <RiskLegend bands={risk.bands ?? {}} className="" />
          {/* Rows share out a stretched card's extra height. */}
          <div className="flex flex-1 flex-col justify-evenly gap-2.5">
            {rows.map((row) => <RiskLevelRow key={row.level} row={row} longest={longest} />)}
          </div>
          <p className="text-xs text-neutral-500">
            {top
              ? `${LEVEL_LABELS[top.level] ?? top.label} has the most learners to follow up (${top.flagged}).`
              : "No level has learners to follow up."}
          </p>
        </>
      )}
    </Panel>
  );
}

// ── Attendance ───────────────────────────────────────────────────────────────
// Weekly attendance rate against the DepEd-derived good-attendance mark. One
// series, so no legend — the title names it. The threshold is the only dashed
// line on the plot.

export function AttendanceBand({ series, loading, compact = false }) {
  if (loading) return <Panel title="Attendance"><ChartSkeleton height={220} /></Panel>;

  const weeks = series ?? [];
  const labels = weeks.map((w) => w.week);
  // Stored 0-1, read as a percentage. Nulls survive the map: a week the school
  // was closed must break the line, not plot as zero.
  const values = weeks.map((w) => (w.rate == null ? null : Math.round(w.rate * 1000) / 10));

  const measured = values.filter((v) => v != null);
  const latest = measured.length ? measured[measured.length - 1] : null;

  return (
    <Panel title="Attendance" subtitle="Weekly rate">
      <LineChart
        title="Weekly attendance rate"
        labels={labels}
        series={[{ key: "rate", label: "Attendance rate", values }]}
        yMax={100}
        yMin={50}
        height={compact ? 200 : 260}
        threshold={{ value: GOOD_ATTENDANCE, label: `${GOOD_ATTENDANCE}% target` }}
        formatValue={(v) => `${v}%`}
        formatLabel={(iso) =>
          new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
        }
        emptyMessage="No attendance has been recorded in this period."
        caption={
          latest == null
            ? undefined
            : `Latest week ${latest}%. Excused absences are not counted against the rate.`
        }
      />
      {latest != null && !compact && (
        <Meter
          className="mt-3"
          label="Latest week against target"
          value={latest}
          max={100}
          valueText={`${latest}%`}
          targetText={`${GOOD_ATTENDANCE}% target`}
          color={latest >= GOOD_ATTENDANCE ? riskLevelMeta("low").color : riskLevelMeta("high").color}
        />
      )}
    </Panel>
  );
}

// ── Attendance against target (admin home) ───────────────────────────────────
// The same weekly series with the target drawn in: the latest week in large
// type, how many weeks fell short, and each week that did marked where it
// happened. Months name their weeks along the bottom, not one date per week.

// About the width of one "88.4% · below target" note, so notes for weeks close
// together don't pile up on each other. Every such week keeps its red point.
const NOTE_W = 124;

function AttendanceWeeks({ weeks, rates, measured }) {
  const theme = useTheme();
  const dark = theme === "dark";
  const ink = chartInk(theme);
  const colors = { line: ink.bar, low: riskLevelMeta("critical").color, tint: token("--color-error-50", theme) };
  // Dark mode shades the below-target zone from the target line down.
  const tintId = `${useId()}-tint`;
  const below = (v) => v != null && v < GOOD_ATTENDANCE;
  const axis = linearAxis(Math.min(80, Math.floor(Math.min(...measured) / 5) * 5), 100);
  // A week is a Monday's date; read it as that calendar day, not UTC midnight.
  const weekOf = (iso) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xl font-bold tabular-nums text-neutral-900">{measured.at(-1)}%</span>
        <span className="text-xs text-neutral-500">
          latest week · {measured.filter(below).length} of {plural(measured.length, "week")} below target
        </span>
      </div>
      <ColumnPlot
        title="Weekly attendance rate against the target"
        axis={axis}
        formatTick={(v) => `${v}%`}
        labels={monthSpans(weeks)}
        labelStyle="ranges"
        plotHeight={170}
        gutter={40}
        padTop={12}
        overlay={(geo) => {
          const noted = [];
          rates.forEach((v, i) => {
            if (below(v) && (!noted.length || geo.x(i) - geo.x(noted.at(-1).i) >= NOTE_W)) noted.push({ i, v });
          });
          return noted.map(({ i, v }) => {
            const y = geo.y(v);
            // Under the point, unless that would run past the plot's bottom.
            const above = y + 34 > geo.base;
            const x = Math.min(Math.max(geo.x(i), NOTE_W / 2), geo.width - NOTE_W / 2);
            return (
              <div
                key={weeks[i].week}
                className="absolute inline-flex items-center gap-[3px] whitespace-nowrap rounded-[6px] border border-brand-300 bg-surface-raised px-1.5 py-0.5 text-[10.5px] font-semibold text-error-500"
                style={{
                  left: `${(x * 100) / geo.width}%`,
                  top: `${(y * 100) / geo.height}%`,
                  transform: above ? "translate(-50%, calc(-100% - 10px))" : "translate(-50%, 10px)",
                }}
              >
                <i className="ti ti-alert-octagon" aria-hidden="true" />
                {v}% · below target
              </div>
            );
          });
        }}
      >
        {(geo) => (
          <>
            {/* Below the target, tinted; the dashed rule is the target itself.
                Dark mode fades the tint from the rule down. */}
            {dark && (
              <defs>
                <linearGradient id={tintId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#f44336" stopOpacity={0.22} />
                  <stop offset="1" stopColor="#f44336" stopOpacity={0.03} />
                </linearGradient>
              </defs>
            )}
            <rect
              x={geo.left} y={geo.y(GOOD_ATTENDANCE)}
              width={geo.width - geo.left} height={geo.base - geo.y(GOOD_ATTENDANCE)}
              fill={dark ? `url(#${tintId})` : colors.tint} opacity={dark ? 1 : 0.5}
            />
            <line
              x1={geo.left} x2={geo.width} y1={geo.y(GOOD_ATTENDANCE)} y2={geo.y(GOOD_ATTENDANCE)}
              stroke={ink.threshold} strokeDasharray="4,3" strokeWidth={1.5}
            />
            <text
              x={geo.width} y={geo.y(GOOD_ATTENDANCE) - 5}
              textAnchor="end" fontSize="10.5" fontWeight="600" fill={ink.threshold}
            >
              {GOOD_ATTENDANCE}% target
            </text>
            {/* A closed week (null) breaks the line rather than joining across it. */}
            {linePath(rates.map((v, i) => (v == null ? null : { x: geo.x(i), y: geo.y(v) }))).map((d) => (
              <g key={d}>
                {/* Dark: a soft glow under the line. */}
                {dark && (
                  <path d={d} fill="none" stroke={colors.line} strokeWidth={6} strokeOpacity={0.2} strokeLinecap="round" strokeLinejoin="round" />
                )}
                <path d={d} fill="none" stroke={colors.line} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            ))}
            {rates.map((v, i) => (v == null ? null : (
              <circle
                key={weeks[i].week}
                cx={geo.x(i)} cy={geo.y(v)} r={below(v) ? 5 : 3}
                fill={below(v) ? colors.low : ink.dot}
                stroke={below(v) ? ink.dot : colors.line}
                strokeWidth={2}
              >
                <title>{`Week of ${weekOf(weeks[i].week)} · ${v}%${below(v) ? " · below target" : ""}`}</title>
              </circle>
            )))}
          </>
        )}
      </ColumnPlot>
      <p className="text-xs text-neutral-500">Excused absences are not counted against the rate.</p>
    </>
  );
}

export function AttendanceTargetBand({ series, loading }) {
  if (loading) return <Panel title="Attendance"><ChartSkeleton height={220} /></Panel>;

  const weeks = series ?? [];
  // Stored 0-1, read as a percentage. A week the school was closed stays null.
  const rates = weeks.map((w) => (w.rate == null ? null : Math.round(w.rate * 1000) / 10));
  const measured = rates.filter((v) => v != null);

  return (
    <Panel
      title="Attendance"
      subtitle={`Weekly rate against the ${GOOD_ATTENDANCE}% target`}
      className="min-w-0"
      bodyClassName="flex flex-col gap-3"
    >
      {!measured.length ? (
        <NoData message="No attendance has been recorded in this period." />
      ) : (
        <AttendanceWeeks weeks={weeks} rates={rates} measured={measured} />
      )}
    </Panel>
  );
}

// ── Collections ──────────────────────────────────────────────────────────────
// Money collected per month, and the running total against what was billed.
//
// Two series on ONE peso axis, and both are the same kind of quantity — a
// deliberate choice made in billing/services.py: charting monthly collections
// (a flow) against outstanding balance (a stock) would need a second y-axis,
// and a dual-axis chart invents a correlation the data does not contain.

export function CollectionsBand({ summary, loading, showAmounts = true }) {
  const theme = useTheme();
  if (loading) return <Panel title="Collections"><ChartSkeleton height={220} /></Panel>;

  const series = summary?.collections_series ?? [];
  const labels = series.map((m) => m.month);
  const monthly = series.map((m) => Number(m.collected));
  const cumulative = series.map((m) => Number(m.cumulative));
  const netBilled = Number(summary?.net_billed ?? 0);
  const collected = Number(summary?.total_collected ?? 0);

  const peso = (n) =>
    `₱${Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

  return (
    <Panel title="Collections" subtitle="Monthly and running total">
      <div style={{ filter: showAmounts ? "none" : "blur(8px)" }}>
        <LineChart
          title="Collections by month"
          labels={labels}
          series={[
            { key: "cumulative", label: "Collected to date", values: cumulative, color: chartInk(theme).bar },
            { key: "monthly", label: "Collected that month", values: monthly, color: riskLevelMeta("low").color },
          ]}
          threshold={netBilled > 0 ? { value: netBilled, label: "Billed" } : null}
          formatValue={peso}
          formatLabel={(m) => {
            const [y, mo] = m.split("-");
            return new Date(Number(y), Number(mo) - 1, 1)
              .toLocaleDateString("en-PH", { month: "short" });
          }}
          emptyMessage="No payments recorded for this school year yet."
          caption={
            netBilled > 0
              ? `${peso(collected)} collected of ${peso(netBilled)} billed.`
              : undefined
          }
        />
        {netBilled > 0 && (
          <Meter
            className="mt-3"
            label="Collected against billed"
            value={collected}
            max={netBilled}
            valueText={peso(collected)}
            targetText={peso(netBilled)}
          />
        )}
      </div>
    </Panel>
  );
}
