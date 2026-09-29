import { useState } from "react";
import { motion } from "framer-motion";

import ChartFrame, { NoData } from "../../components/charts/ChartFrame";
import { columnPath, niceMax } from "../../components/charts/geometry";
import { SURFACE, chartInk } from "../../components/charts/tokens";
import useElementSize from "../../components/charts/useElementSize";
import {
  GOOD_ATTENDANCE,
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
// group's own students split by level, so a small section's picture is as
// readable as a big one's; how many students that is sits in words beside it.

const MAX_GROUPS = 12;

function GroupedBandChart({ rows, unitLabel, emptyMessage }) {
  if (!rows?.length) return <NoData message={emptyMessage} />;
  const visible = rows.slice(0, MAX_GROUPS);

  return (
    <div>
      <ul className="flex flex-col gap-3">
        {visible.map((row) => (
          <li key={row.name} className={ROW_GRID}>
            <span className="truncate text-sm font-semibold text-neutral-800" title={row.name}>
              {row.name}
            </span>
            <span
              className={`${BAR_CELL} flex h-3 gap-[2px] overflow-hidden rounded-full`}
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
        Each bar is one {unitLabel}&apos;s students, split by level. Ordered by how many need following up.
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
// the class sits, and how much of it falls left of the passing mark. Passing
// ranges are the on-track green and failing ones the urgent red, with a key,
// so the split reads before a single number does.

const GRADE_H = 280;

function GradeDistributionChart({ scores }) {
  const [tip, setTip] = useState(null);
  const [plotEl, setPlotEl] = useState(null);
  const size = useElementSize(plotEl);
  const graded = scores.filter((s) => s.average_grade != null);
  if (!graded.length) return <NoData message="No grades recorded for this selection yet." />;

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
  const PAD_L = 36;
  const PAD_R = 12;
  const PAD_T = 30;   // room for the passing-mark label
  const PAD_B = 44;   // grade ticks, then the axis title
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const baseY = PAD_T + plotH;

  // Whole-number steps: these are counts of students.
  const most = Math.max(...bins.map((b) => b.count), 1);
  const step = Math.max(1, niceMax(most / 4));
  const top = Math.ceil(most / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const yOf = (n) => baseY - (n / top) * plotH;
  const xOf = (grade) => PAD_L + ((grade - MIN) / (MAX - MIN)) * plotW;

  const colW = plotW / binCount;
  // Separate columns read as "how many in this range" more easily than a
  // solid wall; the gap stays modest so the shape of the spread still shows.
  const gap = Math.min(14, colW * 0.18);
  const passX = xOf(PASSING_GRADE);
  const passing = riskLevelMeta("low").color;
  const failing = riskLevelMeta("critical").color;
  const belowPassing = graded.filter((s) => Number(s.average_grade) < PASSING_GRADE).length;

  const key = (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {[
        { color: passing, text: `Passing (${PASSING_GRADE} and up)` },
        { color: failing, text: `Below the passing mark` },
      ].map((k) => (
        <span key={k.text} className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: k.color }} aria-hidden="true" />
          {k.text}
        </span>
      ))}
    </div>
  );

  return (
    <ChartFrame
      viewBox={[W, H]}
      tip={tip}
      legend={key}
      plotRef={setPlotEl}
      title={`Students by average grade, ${belowPassing} of ${graded.length} below the passing mark`}
      caption={`${belowPassing} of ${students(graded.length)} sit below the ${PASSING_GRADE} passing mark. Each column counts the students whose average falls in that range.`}
    >
      {/* Hairline grid — solid, one shade off the surface */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD_L} x2={W - PAD_R} y1={yOf(t)} y2={yOf(t)} stroke={ink().grid} />
          <text x={PAD_L - 8} y={yOf(t) + 3.5} textAnchor="end" fontSize="10" fill={ink().axis}>
            {t}
          </text>
        </g>
      ))}

      {bins.map((bin) => {
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
                title: `Averages ${bin.from} to under ${bin.to}`,
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
      {bins.concat({ from: MAX }).map((bin) => (
        <text
          key={`tick-${bin.from}`}
          x={xOf(bin.from)} y={baseY + 16}
          textAnchor="middle" fontSize="10" fill={ink().axis}
          className="tabular-nums"
        >
          {bin.from}
        </text>
      ))}

      {/* The only dashed line on the page — an actual threshold, not a grid */}
      <line
        x1={passX} x2={passX} y1={PAD_T - 8} y2={baseY}
        stroke={ink().threshold} strokeDasharray="4,3" strokeWidth={1.5}
      />
      <text x={passX} y={PAD_T - 14} textAnchor="middle" fontSize="11" fontWeight="700" fill={ink().ink}>
        Passing mark ({PASSING_GRADE})
      </text>
      <text x={PAD_L + plotW / 2} y={H - 6} textAnchor="middle" fontSize="11" fill={ink().axis}>
        Average grade
      </text>
    </ChartFrame>
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
  const PAD_L = 44;
  const PAD_R = 20;
  const PAD_T = 18;
  const PAD_B = 44;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const X_MIN = 60;
  const X_MAX = 100;
  const Y_MIN = 50;
  const Y_MAX = 100;
  const scaleX = (g) => PAD_L + ((Math.min(X_MAX, Math.max(X_MIN, g)) - X_MIN) / (X_MAX - X_MIN)) * plotW;
  const scaleY = (p) => PAD_T + plotH - ((Math.min(Y_MAX, Math.max(Y_MIN, p)) - Y_MIN) / (Y_MAX - Y_MIN)) * plotH;

  const passX = scaleX(PASSING_GRADE);
  const goodY = scaleY(GOOD_ATTENDANCE);

  // Deterministic spiral offset so students on identical figures (very common
  // at this school's scale) stay individually clickable instead of stacking
  // into one dot. Same technique as the previous performance-group scatter.
  const seen = new Map();
  const points = plotted.map((s) => {
    const key = `${Math.round(Number(s.average_grade))}:${Math.round(Number(s.attendance_rate) * 100)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const angle = n * 2.4;
    const radius = n === 0 ? 0 : 4 + n * 0.8;
    return {
      row: s,
      cx: scaleX(Number(s.average_grade)) + Math.cos(angle) * radius,
      cy: scaleY(Number(s.attendance_rate) * 100) + Math.sin(angle) * radius,
    };
  });

  const QUADRANTS = [
    { x: PAD_L + 8, y: PAD_T + 16, text: "Attending, still struggling", anchor: "start" },
    { x: W - PAD_R - 8, y: PAD_T + 16, text: "Doing well", anchor: "end" },
    { x: PAD_L + 8, y: PAD_T + plotH - 8, text: "Needs urgent help", anchor: "start" },
    { x: W - PAD_R - 8, y: PAD_T + plotH - 8, text: "Passing but often absent", anchor: "end" },
  ];

  return (
    <ChartFrame
      viewBox={[W, H]}
      tip={tip}
      plotRef={setPlotEl}
      caption="Each dot is one student. Click a dot to open their follow-up details."
    >
      {/* Quadrant guides — solid hairlines at the two lines the school acts on */}
      <line x1={passX} x2={passX} y1={PAD_T} y2={PAD_T + plotH} stroke={ink().grid} strokeWidth={1.5} />
      <line x1={PAD_L} x2={W - PAD_R} y1={goodY} y2={goodY} stroke={ink().grid} strokeWidth={1.5} />

      {QUADRANTS.map((q) => (
        <text
          key={q.text}
          x={q.x}
          y={q.y}
          textAnchor={q.anchor}
          fontSize="11"
          fontWeight="600"
          fill="#a89494"
        >
          {q.text}
        </text>
      ))}

      {/* Axes */}
      <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke={ink().grid} />
      <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={PAD_T + plotH} stroke={ink().grid} />
      {[60, 70, PASSING_GRADE, 80, 90, 100].map((g) => (
        <text key={g} x={scaleX(g)} y={PAD_T + plotH + 16} textAnchor="middle" fontSize="10" fill={ink().axis}>
          {g}
        </text>
      ))}
      {[50, 70, GOOD_ATTENDANCE, 100].map((p) => (
        <text key={p} x={PAD_L - 8} y={scaleY(p) + 4} textAnchor="end" fontSize="10" fill={ink().axis}>
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
          unitLabel="students in this grade level"
          emptyMessage="No grade levels to compare for this selection."
        />
      );
    case "section":
      return (
        <GroupedBandChart
          rows={summary?.by_section}
          unitLabel="students in this section"
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
