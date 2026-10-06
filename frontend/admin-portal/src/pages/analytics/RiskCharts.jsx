import { useState } from "react";
import { motion } from "framer-motion";

import ChartFrame, { NoData } from "../../components/charts/ChartFrame";
import { columnPath } from "../../components/charts/geometry";
import { SURFACE, chartInk, token } from "../../components/charts/tokens";
import useElementSize from "../../components/charts/useElementSize";
import { mapAxes, placeDots } from "./mapFrame";
import {
  PASSING_GRADE,
  RISK_LEVELS,
  reasonLabel,
  riskLevelMeta,
} from "./riskVocabulary";

// RiskCharts — six ways of reading the same assessment.
//
// One chart can only answer one question, and the questions staff actually ask
// are different: "how bad is it overall", "which year group", "which section",
// "why", "how are grades spread", "who is slipping on what". So the page keeps
// one filter row and lets the reader switch the view underneath it, rather than
// picking a single scatter plot and hoping it covers everyone.
//
// Four of the six are "how many, out of how many" -- the level mix, the
// reasons, and the two groupings -- and are drawn as labelled rows of HTML:
// the name, a bar, and the figure in words ("3 need follow-up · of 25"). Real
// text at its real size, whatever the card's width, and nothing to decode.
// The two with genuine axes, the grade spread and the grades-vs-attendance
// map, stay SVG, drawn at the card's measured width so their text doesn't
// scale with it either.
//
// Conventions held across all six (dataviz mark specs):
//   · risk levels always use the reserved status palette, and always with an
//     icon + text label — the serious/warning steps are under 3:1 on a light
//     surface by design, so hue never carries the meaning alone
//   · single-series bars use one brand hue, never a value-ramp
//   · 2px surface gaps between adjacent fills; 4px rounded data-ends
//   · hairline solid grid; the only dashed line is an actual threshold
//   · the Students tab is the table-view twin for every chart here

// The primitives below used to live in this file. They now live in
// components/charts/, so the dashboard draws on the same surface with the same
// tooltip, gaps and rounding rather than a second look invented beside it.
// The colours moved with them: these were hardcoded hex, which is exactly how
// the app accumulated its contrast failures.
//
// `ink()` is resolved on first render, not at import: chartInk() reads the CSS
// custom properties off :root, and this module can execute before the
// stylesheet has been parsed. Values are cached inside tokens.js after that.
const ink = () => chartInk();

// ── Small shared pieces ──────────────────────────────────────────────────────

/**
 * The band legend. Always rendered wherever bands are drawn: the reserved
 * status steps are not separable by hue alone, so the icon and the word are
 * what actually carry the meaning.
 */
export function RiskLegend({ counts, className = "" }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className}`}>
      {RISK_LEVELS.map((level) => {
        const meta = riskLevelMeta(level);
        return (
          <span key={level} className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
            <i className={`ti ${meta.icon} text-[13px]`} style={{ color: meta.color }} aria-hidden="true" />
            {meta.label}
            {counts?.[level] != null && (
              <span className="font-bold text-neutral-900 tabular-nums">{counts[level]}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ── Shared: one labelled row ─────────────────────────────────────────────────
// Label on the left, bar in the middle, the figure in words on the right. On a
// phone the bar drops under the label and figure rather than squeezing to
// nothing between them.

const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 " +
  "sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_8.5rem]";
const BAR_CELL = "order-last col-span-2 sm:order-none sm:col-span-1";

// A bar's share of its track, grown in from the left.
function Fill({ share, color }) {
  return (
    <motion.span
      className="block h-full rounded-full"
      style={{ background: color }}
      initial={{ width: 0 }}
      animate={{ width: `${Math.min(100, share * 100)}%` }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    />
  );
}

function Track({ label, children }) {
  return (
    <span className={`${BAR_CELL} block h-2.5 overflow-hidden rounded-full bg-neutral-200`} role="img" aria-label={label}>
      {children}
    </span>
  );
}

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const students = (n) => `${n} student${n === 1 ? "" : "s"}`;

// ── 1 · How many need help ───────────────────────────────────────────────────
// One row per level, most urgent first like the tiles above it. Each bar is
// that level's share of everyone assessed, so the four read as parts of one
// group without a single stacked bar's slivers.

function RiskMixChart({ summary, total }) {
  const counts = summary?.by_level ?? {};
  if (!total) return <NoData />;
  const flagged = (counts.high ?? 0) + (counts.critical ?? 0);

  return (
    <div>
      <ul className="flex flex-col gap-3.5">
        {RISK_LEVELS.map((level) => {
          const meta = riskLevelMeta(level);
          const count = counts[level] ?? 0;
          return (
            <li key={level} className={ROW_GRID}>
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                  style={{ background: meta.color, color: meta.chipInk }}
                >
                  <i className={`ti ${meta.icon} text-[15px]`} aria-hidden="true" />
                </span>
                <span className="truncate text-sm font-semibold text-neutral-800">{meta.label}</span>
              </span>
              <Track label={`${meta.label}: ${students(count)} of ${total}, ${pct(count, total)}%`}>
                <Fill share={count / total} color={meta.color} />
              </Track>
              <span className="text-right text-sm tabular-nums text-neutral-600">
                <strong className="font-bold text-neutral-900">{count}</strong> · {pct(count, total)}%
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-neutral-500">
        {students(total)} assessed. {flagged} need{flagged === 1 ? "s" : ""} following up ({pct(flagged, total)}%).
      </p>
    </div>
  );
}

// ── 2 & 3 · By grade level / by section ──────────────────────────────────────
// One row per group, ordered by how many need following up. Each bar is that
// group's own students split by level, and its length is the group's size
// against the biggest one shown -- so a section of 8 looks small beside a
// section of 40, as on the dashboard, and the split still reads within it.

const MAX_GROUPS = 12;

function GroupedBandChart({ rows, unitLabel, emptyMessage }) {
  if (!rows?.length) return <NoData message={emptyMessage} />;
  const visible = rows.slice(0, MAX_GROUPS);
  const maxTotal = Math.max(...visible.map((r) => r.total), 1);

  return (
    <div>
      <ul className="flex flex-col gap-3">
        {visible.map((row) => (
          <li key={row.name} className={ROW_GRID}>
            <span className="truncate text-sm font-semibold text-neutral-800" title={row.name}>
              {row.name}
            </span>
            <span className={`${BAR_CELL} block min-w-0`}>
              <span
                className="flex h-3 gap-[2px] overflow-hidden rounded-full"
                style={{ width: `${(row.total / maxTotal) * 100}%`, minWidth: 10 }}
                role="img"
                aria-label={`${row.name}: ${row.flagged} of ${students(row.total)} need following up`}
              >
                {RISK_LEVELS.filter((level) => row.by_level?.[level]).map((level) => {
                  const meta = riskLevelMeta(level);
                  const count = row.by_level[level];
                  return (
                    <span
                      key={level}
                      className="h-full"
                      style={{ flexGrow: count, flexBasis: 0, background: meta.color }}
                      title={`${meta.label}: ${count} of ${row.total}`}
                    />
                  );
                })}
              </span>
            </span>
            <span className="text-right text-xs leading-tight tabular-nums text-neutral-500">
              {row.flagged ? (
                <span className="block text-sm font-semibold text-neutral-900">
                  {row.flagged} need{row.flagged === 1 ? "s" : ""} follow-up
                </span>
              ) : (
                <span className="block text-sm text-neutral-600">None to follow up</span>
              )}
              of {students(row.total)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-neutral-500">
        Each bar is one {unitLabel}&apos;s students, split by level. A longer bar is a bigger {unitLabel}. Ordered
        by how many need following up.
        {rows.length > visible.length && ` Showing the top ${visible.length} of ${rows.length}.`}
      </p>
    </div>
  );
}

// ── 4 · Why students are flagged ─────────────────────────────────────────────
// The most directly actionable view: it names the intervention. Each bar is
// the share of everyone assessed who has that reason. Single series, so one
// hue and no legend — the title says what the bars are.

function ReasonChart({ summary, total }) {
  const rows = (summary?.by_reason ?? [])
    .filter((r) => r.code !== "limited_data")
    .sort((a, b) => b.count - a.count);
  if (!rows.length) return <NoData message="No concerns were raised for this selection." />;
  const whole = Math.max(total, ...rows.map((r) => r.count));

  return (
    <div>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.code} className={ROW_GRID}>
            <span className="truncate text-sm font-semibold text-neutral-800" title={reasonLabel(row.code)}>
              {reasonLabel(row.code)}
            </span>
            <Track label={`${reasonLabel(row.code)}: ${students(row.count)}, ${pct(row.count, whole)}% of those assessed`}>
              <Fill share={row.count / whole} color={chartInk().bar} />
            </Track>
            <span className="text-right text-sm tabular-nums text-neutral-600">
              <strong className="font-bold text-neutral-900">{students(row.count)}</strong> · {pct(row.count, whole)}%
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-neutral-500">
        Share of the {students(whole)} assessed. One student can have several reasons, so these can add up to more
        than everyone.
      </p>
    </div>
  );
}

// ── 5 · How everyone is doing ────────────────────────────────────────────────
// The most intuitive view for anyone who has never read a chart before: where
// the class sits, and how much of it falls left of the passing mark. The
// headline says the count before the reader looks at a column; the failing
// side of the plot is tinted and labelled in place, so there is no key to
// match colours against. Each column carries its own count, so there is no
// count axis either.

const GRADE_H = 280;

function GradeDistributionChart({ scores }) {
  const [tip, setTip] = useState(null);
  const [plotEl, setPlotEl] = useState(null);
  const size = useElementSize(plotEl);
  const graded = scores.filter((s) => s.average_grade != null);
  if (!graded.length) return <NoData message="No grades recorded for this selection yet." />;
  const ungraded = scores.length - graded.length;

  const BIN_SIZE = 5;
  const MAX = 100;
  // The axis has to reach the lowest grade actually present. A fixed floor of
  // 60 silently folded a 47.7 average into the 60-65 bin — the chart then
  // showed that student as borderline rather than as the worst case in the
  // cohort. Floor at 40 so the axis stays readable if a grade is a data-entry
  // error rather than a real mark.
  const lowest = Math.min(...graded.map((s) => Number(s.average_grade)));
  const MIN = Math.max(40, Math.min(60, Math.floor(lowest / BIN_SIZE) * BIN_SIZE));
  const binCount = (MAX - MIN) / BIN_SIZE;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    from: MIN + i * BIN_SIZE,
    to: MIN + (i + 1) * BIN_SIZE,
    count: 0,
  }));
  graded.forEach((s) => {
    const clamped = Math.min(MAX - 0.001, Math.max(MIN, Number(s.average_grade)));
    bins[Math.floor((clamped - MIN) / BIN_SIZE)].count += 1;
  });

  const W = size?.width ?? 760;
  const H = GRADE_H;
  const PAD_L = 12;
  const PAD_R = 12;
  const PAD_T = 40;   // room for the two labels either side of the passing mark
  const PAD_B = 44;   // grade ticks, then the axis title
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const baseY = PAD_T + plotH;

  // No count axis: every column is labelled with its own count. The 8% of
  // headroom keeps the tallest column's label clear of the passing labels.
  const most = Math.max(...bins.map((b) => b.count), 1);
  const yOf = (n) => baseY - (n / (most * 1.08)) * plotH;
  const xOf = (grade) => PAD_L + ((grade - MIN) / (MAX - MIN)) * plotW;

  const colW = plotW / binCount;
  // Separate columns read as "how many in this range" more easily than a
  // solid wall; the gap stays modest so the shape of the spread still shows.
  const gap = Math.min(14, colW * 0.18);
  const passX = xOf(PASSING_GRADE);
  const passing = riskLevelMeta("low").color;
  const failing = riskLevelMeta("critical").color;
  const belowPassing = graded.filter((s) => Number(s.average_grade) < PASSING_GRADE).length;
  // A grade under the floor was clamped into the first column, so that
  // column is "under" its upper edge rather than a closed range.
  const binTitle = (bin, i) =>
    i === 0 && lowest < MIN ? `Under ${MIN + BIN_SIZE}` : `Averages ${bin.from} to ${bin.to}`;

  const headline = (
    <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      {belowPassing ? (
        <>
          {/* Spaces between the pieces so they read as one sentence to a
              screen reader; a flex row drops them from the layout. */}
          <span className="text-xl font-bold text-neutral-900 tabular-nums">
            {belowPassing} of {graded.length}
          </span>{" "}
          <span className="text-base text-neutral-800">students are below the passing mark</span>{" "}
          <span className="rounded-full bg-error-50 px-2 py-0.5 text-xs font-bold text-error-500 tabular-nums">
            {pct(belowPassing, graded.length)}%
          </span>
        </>
      ) : (
        <span className="text-base text-neutral-800">No students are below the passing mark</span>
      )}
    </div>
  );

  return (
    <div>
      <ChartFrame
        viewBox={[W, H]}
        tip={tip}
        legend={headline}
        plotRef={setPlotEl}
        title={`Students by average grade, ${belowPassing} of ${graded.length} below the passing mark`}
        caption="Each column counts the students whose average falls in that range."
      >
        {/* The failing side, tinted and named in place of a key */}
        <rect x={0} y={0} width={passX} height={baseY} fill={token("--color-error-50")} fillOpacity={0.6} />
        <line x1={PAD_L} x2={W - PAD_R} y1={baseY} y2={baseY} stroke={ink().grid} />

        {bins.map((bin, i) => {
          const x = xOf(bin.from) + gap / 2;
          const w = colW - gap;
          const y = yOf(bin.count);
          // Bins are 5 wide and the mark is a multiple of 5, so a bin is wholly
          // one side of it.
          const below = bin.to <= PASSING_GRADE;
          return (
            <g
              key={bin.from}
              onMouseEnter={() =>
                setTip({
                  x: x + w / 2,
                  y,
                  title: binTitle(bin, i),
                  lines: [students(bin.count), below ? "Below the passing mark" : "Passing"],
                })
              }
              onMouseLeave={() => setTip(null)}
              style={{ cursor: "pointer" }}
            >
              <rect x={xOf(bin.from)} y={PAD_T} width={colW} height={plotH} fill="transparent" />
              {bin.count > 0 && (
                <>
                  <path d={columnPath(x, y, w, baseY - y)} fill={below ? failing : passing} />
                  <text
                    x={x + w / 2} y={y - 6}
                    textAnchor="middle" fontSize="12" fontWeight="700" fill={ink().ink}
                    className="tabular-nums"
                  >
                    {bin.count}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* Grades sit on the edges between ranges, where they belong. */}
        {bins.concat({ from: MAX }).map((bin) => {
          const isPass = bin.from === PASSING_GRADE;
          return (
            <text
              key={`tick-${bin.from}`}
              x={xOf(bin.from)} y={baseY + 16}
              textAnchor="middle" fontSize="11"
              fontWeight={isPass ? 700 : 400}
              fill={isPass ? ink().ink : ink().axis}
              className="tabular-nums"
            >
              {bin.from}
            </text>
          );
        })}

        {/* The only dashed line on the page — an actual threshold, not a grid */}
        <line
          x1={passX} x2={passX} y1={32} y2={baseY}
          stroke={ink().threshold} strokeDasharray="4,3" strokeWidth={1.5}
        />
        <text x={passX - 10} y={24} textAnchor="end" fontSize="11" fontWeight="700" fill={token("--color-error-500")}>
          Below passing
        </text>
        <text x={passX + 10} y={24} textAnchor="start" fontSize="11" fontWeight="700" fill={token("--color-success-500")}>
          Passing · {PASSING_GRADE} and up
        </text>
        <text x={PAD_L + plotW / 2} y={H - 6} textAnchor="middle" fontSize="11" fill={ink().axis}>
          Average grade
        </text>
      </ChartFrame>
      {ungraded > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
          <i className="ti ti-info-circle text-[13px]" aria-hidden="true" />
          {ungraded === 1
            ? "1 student has no average yet and isn't shown."
            : `${ungraded} students have no average yet and aren't shown.`}
        </p>
      )}
    </div>
  );
}

// ── 6 · Attendance vs grade map ──────────────────────────────────────────────
// Two problems look identical in a list — a bright student who stopped showing
// up, and a student attending every day who still can't pass — and completely
// different here. The quadrant labels say which corner means what, so nobody
// has to interpret a scatter plot unaided.

function AttendanceGradeChart({ scores, onSelectStudent }) {
  const [tip, setTip] = useState(null);
  const [plotEl, setPlotEl] = useState(null);
  const size = useElementSize(plotEl);
  const plotted = scores.filter((s) => s.average_grade != null && s.attendance_rate != null);
  if (!plotted.length) {
    return (
      <NoData message="This view needs both grades and attendance. Not enough attendance has been recorded for this selection yet." />
    );
  }

  // The card's own width, so the axis text stays its real size.
  const W = size?.width ?? 760;
  const H = 300;
  const PAD_L = 50;   // y ticks clear of the rotated axis title
  const PAD_R = 20;
  const PAD_T = 34;   // the two top quadrant labels sit above the plot
  const PAD_B = 44;

  // The same frame as the group map on Performance groups (mapFrame.js), so
  // a student sits in the same place on both. Dots on identical figures are
  // spread so each stays individually clickable.
  const items = plotted.map((s) => ({
    row: s,
    grade: Number(s.average_grade),
    attendance: Number(s.attendance_rate),
  }));
  const axes = mapAxes(items, {
    width: W,
    height: H,
    pad: { left: PAD_L, right: PAD_R, top: PAD_T, bottom: PAD_B },
  });
  const { x: scaleX, y: scaleY, plotH, passX, goodY, xTicks, yTicks } = axes;
  const points = placeDots(items, axes);

  // The top two sit above the plot, out of the dot field; the bottom two stay
  // inside it, where the corners are emptiest.
  const QUADRANTS = [
    { x: PAD_L + 8, y: PAD_T - 10, text: "Attending, still struggling", anchor: "start" },
    { x: W - PAD_R - 8, y: PAD_T - 10, text: "Doing well", anchor: "end" },
    { x: PAD_L + 8, y: PAD_T + plotH - 8, text: "Needs urgent help", anchor: "start" },
    { x: W - PAD_R - 8, y: PAD_T + plotH - 8, text: "Passing but often absent", anchor: "end" },
  ];

  return (
    <ChartFrame
      viewBox={[W, H]}
      tip={tip}
      plotRef={setPlotEl}
      title="Grades against attendance, one dot per student"
      caption="Each dot is one student. Click a dot to open their follow-up details."
    >
      {/* Quadrant guides — solid hairlines at the two lines the school acts on */}
      <line x1={passX} x2={passX} y1={PAD_T} y2={PAD_T + plotH} stroke={ink().grid} strokeWidth={1.5} />
      <line x1={PAD_L} x2={W - PAD_R} y1={goodY} y2={goodY} stroke={ink().grid} strokeWidth={1.5} />

      {/* Axes */}
      <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke={ink().grid} />
      <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={PAD_T + plotH} stroke={ink().grid} />
      {xTicks.map((g) => (
        <text key={g} x={scaleX(g)} y={PAD_T + plotH + 16} textAnchor="middle" fontSize="11" fill={ink().axis}>
          {g}
        </text>
      ))}
      {yTicks.map((p) => (
        <text key={p} x={PAD_L - 8} y={scaleY(p) + 4} textAnchor="end" fontSize="11" fill={ink().axis}>
          {p}%
        </text>
      ))}
      <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="11" fill={ink().axis}>
        Average grade
      </text>
      <text x={14} y={PAD_T + plotH / 2} textAnchor="middle" fontSize="11" fill={ink().axis} transform={`rotate(-90 14 ${PAD_T + plotH / 2})`}>
        Attendance
      </text>

      {points.map(({ row, cx, cy }) => {
        const meta = riskLevelMeta(row.risk_level);
        return (
          <g key={row.student_id}>
            {/* 2px surface ring keeps overlapping dots readable */}
            <circle cx={cx} cy={cy} r={5} fill={meta.color} stroke={SURFACE} strokeWidth={2} />
            {/* Hit target well beyond the mark, so a dot never needs a
                dead-centre click */}
            <circle
              cx={cx}
              cy={cy}
              r={12}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onMouseEnter={() =>
                setTip({
                  x: cx,
                  y: cy,
                  title: row.student_name ?? `Student #${row.student_id}`,
                  lines: [
                    `${meta.label} · ${row.grade_level ?? "—"}${row.section ? ` · ${row.section}` : ""}`,
                    `Average ${Number(row.average_grade).toFixed(1)} · Attendance ${Math.round(
                      Number(row.attendance_rate) * 100
                    )}%`,
                  ],
                })
              }
              onMouseLeave={() => setTip(null)}
              onClick={() => onSelectStudent?.(row)}
            />
          </g>
        );
      })}

      {/* After the dots, with a surface halo, so a dot under a label never
          hides it. Pointer-transparent so the dots stay clickable. */}
      {QUADRANTS.map((q) => (
        <text
          key={q.text}
          x={q.x}
          y={q.y}
          textAnchor={q.anchor}
          fontSize="11"
          fontWeight="600"
          fill={ink().axis}
          stroke={SURFACE}
          strokeWidth={3}
          paintOrder="stroke"
          pointerEvents="none"
        >
          {q.text}
        </text>
      ))}
    </ChartFrame>
  );
}

// ── The switcher ─────────────────────────────────────────────────────────────

export default function RiskChart({ view, run, onSelectStudent }) {
  const scores = run?.scores ?? [];
  const summary = run?.summary;
  const total = scores.length;

  switch (view) {
    case "grade_level":
      return (
        <GroupedBandChart
          rows={summary?.by_grade_level}
          unitLabel="grade level"
          emptyMessage="No grade levels to compare for this selection."
        />
      );
    case "section":
      return (
        <GroupedBandChart
          rows={summary?.by_section}
          unitLabel="section"
          emptyMessage="No sections to compare for this selection."
        />
      );
    case "reasons":
      return <ReasonChart summary={summary} total={total} />;
    case "grades":
      return <GradeDistributionChart scores={scores} />;
    case "map":
      return <AttendanceGradeChart scores={scores} onSelectStudent={onSelectStudent} />;
    case "mix":
    default:
      return <RiskMixChart summary={summary} total={total} />;
  }
}
