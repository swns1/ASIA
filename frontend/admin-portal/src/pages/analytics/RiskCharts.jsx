import { useState } from "react";
import ChartFrame, { NoData } from "../../components/charts/ChartFrame";
import { barPath } from "../../components/charts/geometry";
import { GAP, RADIUS, SURFACE, chartInk } from "../../components/charts/tokens";
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
// Charts are hand-rolled SVG because this app has no charting library and the
// existing scatter plot already set that pattern; adding one for six modest
// charts would be a new dependency and a stylistic break.
//
// Conventions held across all six (dataviz mark specs):
//   · risk bands always use the reserved status palette, and always with an
//     icon + text label — the serious/warning steps are under 3:1 on a light
//     surface by design, so hue never carries the meaning alone
//   · single-series charts use one brand hue, never a value-ramp
//   · 2px surface gaps between adjacent fills; 4px rounded data-ends
//   · hairline solid grid; the only dashed line is an actual threshold
//   · labels are direct and selective — never a number on every mark
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

// ── 1 · Risk mix ─────────────────────────────────────────────────────────────
// Part-to-whole across four bands. The stat tiles above already carry the
// headline counts, so what this adds is the proportion.

function RiskMixChart({ summary, total }) {
  const [tip, setTip] = useState(null);
  const counts = summary?.by_level ?? {};
  if (!total) return <NoData />;

  const W = 760;
  const H = 150;
  const BAR_Y = 26;
  const BAR_H = 56;

  const segments = RISK_LEVELS.filter((level) => (counts[level] ?? 0) > 0).reduce((acc, level) => {
    const count = counts[level];
    const width = (count / total) * W;
    const x = acc.length ? acc[acc.length - 1].x + acc[acc.length - 1].width : 0;
    acc.push({ level, count, x, width, share: count / total });
    return acc;
  }, []);

  return (
    <ChartFrame
      viewBox={[W, H]}
      tip={tip}
      caption={`${total} student${total === 1 ? "" : "s"} assessed. Segment width is the share of the group.`}
    >
      {segments.map((seg, i) => {
        const meta = riskLevelMeta(seg.level);
        const isLast = i === segments.length - 1;
        // Trim a surface gap off every segment but the last, so adjacent
        // fills are separated by the background rather than by a border.
        const drawWidth = Math.max(1, seg.width - (isLast ? 0 : GAP));
        return (
          <g key={seg.level}>
            <path
              d={barPath(seg.x, BAR_Y, drawWidth, BAR_H, i === 0 || isLast ? RADIUS : 0)}
              fill={meta.color}
              onMouseEnter={() =>
                setTip({
                  x: seg.x + drawWidth / 2,
                  y: BAR_Y,
                  title: meta.label,
                  lines: [
                    `${seg.count} of ${total} students (${Math.round(seg.share * 100)}%)`,
                    meta.blurb,
                  ],
                })
              }
              onMouseLeave={() => setTip(null)}
              style={{ cursor: "pointer" }}
            />
            {/* Direct-label only where the segment is genuinely wide enough
                to hold the text — otherwise the legend and tooltip carry it. */}
            {drawWidth > 34 && (
              <text
                x={seg.x + drawWidth / 2}
                y={BAR_Y + BAR_H / 2 + 6}
                textAnchor="middle"
                fontSize="17"
                fontWeight="700"
                fill={ink().ink}
              >
                {seg.count}
              </text>
            )}
            {drawWidth > 96 && (
              <text
                x={seg.x + drawWidth / 2}
                y={BAR_Y + BAR_H + 20}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill={ink().muted}
              >
                {meta.label}
              </text>
            )}
            {drawWidth > 96 && (
              <text
                x={seg.x + drawWidth / 2}
                y={BAR_Y + BAR_H + 34}
                textAnchor="middle"
                fontSize="10"
                fill={ink().axis}
              >
                {Math.round(seg.share * 100)}% of the group
              </text>
            )}
          </g>
        );
      })}
      <text x={0} y={16} fontSize="11" fontWeight="600" fill={ink().axis}>
        Most urgent
      </text>
      <text x={W} y={16} textAnchor="end" fontSize="11" fontWeight="600" fill={ink().axis}>
        Doing fine
      </text>
    </ChartFrame>
  );
}

// ── 2 & 3 · By grade level / by section ──────────────────────────────────────
// Same shape, different grouping: stacked horizontal bars, ordered by how many
// students need following up, so the row that needs attention is at the top.

function GroupedBandChart({ rows, unitLabel, emptyMessage }) {
  const [tip, setTip] = useState(null);
  if (!rows?.length) return <NoData message={emptyMessage} />;

  const visible = rows.slice(0, 12);
  const W = 760;
  const LABEL_W = 150;
  const ROW_H = 30;
  const BAR_H = 17;
  const H = visible.length * ROW_H + 30;
  const plotW = W - LABEL_W - 40;
  const maxTotal = Math.max(...visible.map((r) => r.total), 1);

  return (
    <ChartFrame
      viewBox={[W, H]}
      tip={tip}
      caption={`Bar length is the number of students. Ordered by how many need following up.${
        rows.length > visible.length ? ` Showing the top ${visible.length} of ${rows.length}.` : ""
      }`}
    >
      {visible.map((row, rowIndex) => {
        const y = rowIndex * ROW_H + 8;
        // Offsets are precomputed rather than accumulated inside the render
        // callback — see the reduce in RiskMixChart for why.
        const segments = RISK_LEVELS.reduce((acc, level) => {
          const count = row.by_level?.[level] ?? 0;
          if (!count) return acc;
          const width = (count / maxTotal) * plotW;
          const x = acc.length ? acc[acc.length - 1].x + acc[acc.length - 1].width : LABEL_W;
          acc.push({ level, count, x, width });
          return acc;
        }, []);
        const rowEnd = segments.length ? segments[segments.length - 1].x + segments[segments.length - 1].width : LABEL_W;
        return (
          <g key={row.name}>
            <text x={LABEL_W - 10} y={y + BAR_H / 2 + 4} textAnchor="end" fontSize="12" fill={ink().muted}>
              {row.name.length > 20 ? `${row.name.slice(0, 19)}…` : row.name}
            </text>
            {segments.map(({ level, count, x, width }) => {
              const meta = riskLevelMeta(level);
              const drawWidth = Math.max(1, width - GAP);
              return (
                <path
                  key={level}
                  d={barPath(x, y, drawWidth, BAR_H, RADIUS)}
                  fill={meta.color}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() =>
                    setTip({
                      x: x + drawWidth / 2,
                      y,
                      title: `${row.name} · ${meta.label}`,
                      lines: [
                        `${count} of ${row.total} ${unitLabel}`,
                        `${row.flagged} need following up in total`,
                      ],
                    })
                  }
                  onMouseLeave={() => setTip(null)}
                />
              );
            })}
            <text x={rowEnd + 8} y={y + BAR_H / 2 + 4} fontSize="11" fill={ink().axis} className="tabular-nums">
              {row.total}
            </text>
          </g>
        );
      })}
    </ChartFrame>
  );
}

// ── 4 · Why students are flagged ─────────────────────────────────────────────
// The most directly actionable view: it names the intervention. Single series,
// so one hue and no legend — the title says what the bars are.

function ReasonChart({ summary }) {
  const [tip, setTip] = useState(null);
  const rows = (summary?.by_reason ?? []).filter((r) => r.code !== "limited_data");
  if (!rows.length) return <NoData message="No concerns were raised for this selection." />;

  const W = 760;
  const LABEL_W = 230;
  const ROW_H = 32;
  const BAR_H = 18;
  const H = rows.length * ROW_H + 24;
  const plotW = W - LABEL_W - 50;
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <ChartFrame
      viewBox={[W, H]}
      tip={tip}
      caption="Each student is counted once per reason, so one student can appear in several bars."
    >
      {rows.map((row, i) => {
        const y = i * ROW_H + 8;
        const width = Math.max(2, (row.count / max) * plotW);
        return (
          <g key={row.code}>
            <text x={LABEL_W - 10} y={y + BAR_H / 2 + 4} textAnchor="end" fontSize="12" fill={ink().muted}>
              {reasonLabel(row.code)}
            </text>
            <path
              d={barPath(LABEL_W, y, width, BAR_H)}
              fill={ink().bar}
              style={{ cursor: "pointer" }}
              onMouseEnter={() =>
                setTip({
                  x: LABEL_W + width / 2,
                  y,
                  title: reasonLabel(row.code),
                  lines: [`${row.count} student${row.count === 1 ? "" : "s"} affected`],
                })
              }
              onMouseLeave={() => setTip(null)}
            />
            <text
              x={LABEL_W + width + 8}
              y={y + BAR_H / 2 + 4}
              fontSize="12"
              fontWeight="700"
              fill={ink().ink}
              className="tabular-nums"
            >
              {row.count}
            </text>
          </g>
        );
      })}
    </ChartFrame>
  );
}

// ── 5 · Grade distribution ───────────────────────────────────────────────────
// The most intuitive view for anyone who has never read a chart before: where
// the class sits, and how much of it falls left of the passing mark.

function GradeDistributionChart({ scores }) {
  const [tip, setTip] = useState(null);
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

  const W = 760;
  const H = 320;
  const PAD_L = 46;
  const PAD_R = 16;
  const PAD_T = 18;
  const PAD_B = 52;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const max = Math.max(...bins.map((b) => b.count), 1);
  const colW = plotW / binCount;
  const passX = PAD_L + ((PASSING_GRADE - MIN) / (MAX - MIN)) * plotW;
  const belowPassing = graded.filter((s) => Number(s.average_grade) < PASSING_GRADE).length;

  return (
    <ChartFrame
      viewBox={[W, H]}
      tip={tip}
      caption={`${belowPassing} of ${graded.length} students sit below the ${PASSING_GRADE} passing mark.`}
    >
      {/* Hairline grid — solid, one shade off the surface */}
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PAD_T + plotH - f * plotH}
            y2={PAD_T + plotH - f * plotH}
            stroke={ink().grid}
          />
          <text x={PAD_L - 8} y={PAD_T + plotH - f * plotH + 4} textAnchor="end" fontSize="10" fill={ink().axis}>
            {Math.round(f * max)}
          </text>
        </g>
      ))}

      {bins.map((bin) => {
        const h = (bin.count / max) * plotH;
        const x = PAD_L + ((bin.from - MIN) / (MAX - MIN)) * plotW;
        const failing = bin.to <= PASSING_GRADE;
        return (
          <g key={bin.from}>
            {bin.count > 0 && (
              <path
                d={barPath(x + GAP / 2, PAD_T + plotH - h, colW - GAP, h)}
                // The one place a second hue appears: bins entirely below the
                // passing mark are the exception the chart exists to show.
                fill={failing ? riskLevelMeta("critical").color : ink().bar}
                opacity={failing ? 1 : 0.85}
                style={{ cursor: "pointer" }}
                onMouseEnter={() =>
                  setTip({
                    x: x + colW / 2,
                    y: PAD_T + plotH - h,
                    title: `${bin.from}–${bin.to}`,
                    lines: [
                      `${bin.count} student${bin.count === 1 ? "" : "s"}`,
                      failing ? "Below the passing mark" : "Passing",
                    ],
                  })
                }
                onMouseLeave={() => setTip(null)}
              />
            )}
            {bin.count > 0 && (
              <text
                x={x + colW / 2}
                y={PAD_T + plotH - h - 6}
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                fill={ink().ink}
                className="tabular-nums"
              >
                {bin.count}
              </text>
            )}
            <text
              x={x + colW / 2}
              y={H - PAD_B + 18}
              textAnchor="middle"
              fontSize="10"
              fill={ink().axis}
              className="tabular-nums"
            >
              {bin.from}
            </text>
          </g>
        );
      })}

      {/* The only dashed line on the page — an actual threshold, not a grid */}
      <line x1={passX} x2={passX} y1={PAD_T} y2={PAD_T + plotH} stroke={ink().threshold} strokeDasharray="4,3" strokeWidth={1.5} />
      <text x={passX + 6} y={PAD_T + 11} fontSize="11" fontWeight="700" fill={ink().ink}>
        Passing mark ({PASSING_GRADE})
      </text>
      <text x={W / 2} y={H - 10} textAnchor="middle" fontSize="11" fill={ink().axis}>
        Average grade
      </text>
      <text
        x={14}
        y={PAD_T + plotH / 2}
        textAnchor="middle"
        fontSize="11"
        fill={ink().axis}
        transform={`rotate(-90 14 ${PAD_T + plotH / 2})`}
      >
        Students
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
  const plotted = scores.filter((s) => s.average_grade != null && s.attendance_rate != null);
  if (!plotted.length) {
    return (
      <NoData message="This view needs both grades and attendance. Not enough attendance has been recorded for this selection yet." />
    );
  }

  const W = 760;
  const H = 380;
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
      return <ReasonChart summary={summary} />;
    case "grades":
      return <GradeDistributionChart scores={scores} />;
    case "map":
      return <AttendanceGradeChart scores={scores} onSelectStudent={onSelectStudent} />;
    case "mix":
    default:
      return <RiskMixChart summary={summary} total={total} />;
  }
}
