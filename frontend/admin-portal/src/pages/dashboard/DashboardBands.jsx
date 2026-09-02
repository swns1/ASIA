// DashboardBands — the four chart bands on the staff dashboard.
//
// Kept out of DashboardPage.jsx, which is already 950 lines. Each band is a
// self-contained Panel so the page composes them and decides which roles see
// which, rather than threading chart props through the page body.
//
// Everything draws with components/charts/, the same language the Analytics
// page uses. Nothing here invents a colour: risk bands come from
// analytics/riskVocabulary (the reserved status palette), and every other mark
// is a single brand hue from styles/tokens.css.

import BarChart from "../../components/charts/BarChart";
import LineChart from "../../components/charts/LineChart";
import Meter from "../../components/charts/Meter";
import StackedBar from "../../components/charts/StackedBar";
import Skeleton from "../../components/ui/Skeleton";
import { Panel } from "../../components/ui/Card";
import { chartInk, token } from "../../components/charts/tokens";
import {
  GOOD_ATTENDANCE,
  RISK_LEVELS,
  riskLevelMeta,
} from "../analytics/riskVocabulary";

const ink = () => chartInk();

function ChartSkeleton({ height = 180 }) {
  return <Skeleton height={height} variant="pulse" />;
}

// ── Enrolment pipeline ───────────────────────────────────────────────────────
// Pending → Enrolled → Completed is part-to-whole of the cohort, so a stacked
// bar reads it correctly: the reader wants the proportion at each stage, not
// three unrelated magnitudes. `exited` is excluded deliberately — a cancelled
// enrolment left the funnel rather than sitting in a stage of it (see
// dashboard/services.py).

const PIPELINE_STEPS = [
  { key: "pending",   label: "Pending",   tokenName: "--color-warning-500", blurb: "Applications waiting on a decision" },
  { key: "enrolled",  label: "Enrolled",  tokenName: "--color-info-500",    blurb: "Currently studying" },
  { key: "completed", label: "Completed", tokenName: "--color-success-500", blurb: "Finished the school year" },
];

export function PipelineBand({ pipeline, loading, schoolYear, compact = false }) {
  if (loading) return <Panel title="Enrolment Pipeline"><ChartSkeleton height={150} /></Panel>;

  const segments = PIPELINE_STEPS.map((step) => ({
    key: step.key,
    label: step.label,
    blurb: step.blurb,
    value: pipeline?.[step.key] ?? 0,
    color: token(step.tokenName),
  }));

  const total = pipeline?.total ?? 0;
  const exited = pipeline?.exited ?? 0;

  return (
    <Panel
      title="Enrolment Pipeline"
      subtitle={`S.Y. ${schoolYear}`}
    >
      <StackedBar
        title={`Enrolment pipeline for school year ${schoolYear}`}
        segments={segments}
        height={compact ? 120 : 150}
        barY={compact ? 18 : 26}
        barH={compact ? 46 : 56}
        emptyMessage="No enrolments recorded for this school year yet."
        caption={
          total
            ? `${total} enrolment${total === 1 ? "" : "s"} in the pipeline` +
              (exited ? ` · ${exited} cancelled or transferred out, not counted above.` : ".")
            : undefined
        }
        legend={<StepLegend steps={PIPELINE_STEPS} pipeline={pipeline} />}
      />
    </Panel>
  );
}

function StepLegend({ steps, pipeline }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {steps.map((step) => (
        <span key={step.key} className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: token(step.tokenName) }}
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
function RiskLegend({ bands }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
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

// ── Collections ──────────────────────────────────────────────────────────────
// Money collected per month, and the running total against what was billed.
//
// Two series on ONE peso axis, and both are the same kind of quantity — a
// deliberate choice made in billing/services.py: charting monthly collections
// (a flow) against outstanding balance (a stock) would need a second y-axis,
// and a dual-axis chart invents a correlation the data does not contain.

export function CollectionsBand({ summary, loading, showAmounts = true }) {
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
            { key: "cumulative", label: "Collected to date", values: cumulative, color: ink().bar },
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
