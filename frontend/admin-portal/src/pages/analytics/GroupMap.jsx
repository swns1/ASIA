import { useState } from "react";

import ChartFrame, { NoData } from "../../components/charts/ChartFrame";
import { SURFACE, chartInk, token } from "../../components/charts/tokens";
import useElementSize from "../../components/charts/useElementSize";
import { groupShapes, isFaint, mapAxes, placeDots } from "./mapFrame";
import { formatAttendance, formatGrade } from "./riskVocabulary";

// GroupMap — the performance groups drawn on the same grade-against-attendance
// frame as the Overview's follow-up map (mapFrame.js). There, a dot's colour is
// the formula's verdict; here it is the group the grouping put the student in,
// so the two maps show two methods reading the same students.
//
// The grouping weighs three things -- grades, attendance and behavior -- and a
// flat map can show two. The caption says so, because it answers the first
// question anyone asks of this chart: "why is that dot a different colour from
// its neighbours?" Behavior is in every tooltip and in the table below.
//
// Colour is a group's standing against the others on all three together: red
// the weakest, amber in between, green the strongest (the server's `band` and
// `color`, ai/analytics_views.py GROUP_BANDS). The group cards and the table
// use the same colour, so a group is one colour on the whole tab. Three
// colours are all a scatter can hold colour-blind safe, so past three groups
// some share a colour and are told apart by shape (mapFrame.groupShapes).
// Every group is also named, in the legend and beside its average, and the
// amber -- 1.8:1 on the surface -- is outlined (isFaint).

const ink = () => chartInk();

const H = 340;
const PAD = { left: 50, right: 20, top: 30, bottom: 44 };
const DOT_R = 5;
// The pointer only has to be nearest a dot, within this many pixels: among a
// few hundred students, a target the size of the dot is a pinpoint.
const HIT = 24;
// An average marker wins over dots this much nearer the pointer: someone
// pointing at the middle of a group is after the group.
const AVERAGE_PULL = 8;

// The three bands in standing order, as the colour key names them.
const BANDS = [
  { band: "low", word: "Weakest" },
  { band: "middle", word: "In between" },
  { band: "high", word: "Strongest" },
];

const behaviorLine = (score) =>
  score == null ? "No behavior ratings yet" : `Behavior ${Number(score).toFixed(1)} of 3`;

/**
 * One mark. The square and triangle have the circle's area, so no shape
 * reads as a bigger group: a square of half-side r·√π/2, and an equilateral
 * triangle of circumradius r·1.555, centred on the point.
 */
function Marker({ shape, x, y, r, ...paint }) {
  if (shape === "square") {
    const h = r * 0.886;
    return <rect x={x - h} y={y - h} width={h * 2} height={h * 2} rx={1} {...paint} />;
  }
  if (shape === "triangle") {
    const R = r * 1.555;
    return (
      <path
        d={`M ${x} ${y - R} L ${x + R * 0.866} ${y + R * 0.5} L ${x - R * 0.866} ${y + R * 0.5} Z`}
        strokeLinejoin="round"
        {...paint}
      />
    );
  }
  return <circle cx={x} cy={y} r={r} {...paint} />;
}

/**
 * A group's colour and shape as a small key mark, outlined where the colour
 * is too light to show its own edge on the white card (the amber).
 */
export function GroupSwatch({ color, shape = "circle", size = "md" }) {
  const px = size === "sm" ? 8 : 10;
  const outlined = isFaint(color, "#ffffff");
  return (
    <svg width={px} height={px} viewBox="0 0 10 10" className="shrink-0" aria-hidden="true">
      <Marker
        shape={shape}
        x={5}
        y={shape === "triangle" ? 5.6 : 5}
        r={shape === "triangle" ? 3.6 : 4.4}
        fill={color}
        stroke={outlined ? token("--color-neutral-500") : "none"}
        strokeWidth={outlined ? 1 : 0}
      />
    </svg>
  );
}

export default function GroupMap({ result }) {
  const [tip, setTip] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [picked, setPicked] = useState(null);
  const [plotEl, setPlotEl] = useState(null);
  const size = useElementSize(plotEl);

  const groups = result?.clusters ?? [];
  const students = groups.flatMap((group) => (group.students ?? []).map((s) => ({ ...s, group })));
  // Under ten recorded days a student has no attendance rate (services.py
  // MIN_ATTENDANCE_DAYS), so there is nowhere on this map to put them.
  const plotted = students
    .filter((s) => s.grade != null && s.attendance_rate != null)
    .map((s) => ({ ...s, grade: Number(s.grade), attendance: Number(s.attendance_rate) }));
  if (!plotted.length) {
    return (
      <NoData message="This map needs both grades and attendance. Not enough attendance has been recorded for this selection yet." />
    );
  }
  const missing = students.length - plotted.length;

  // A pick left over from a grouping with more groups picks nothing.
  const pick = groups.some((g) => g.cluster_id === picked) ? picked : null;
  const isPicked = (group) => pick == null || group.cluster_id === pick;
  const faint = new Map(groups.map((g) => [g.cluster_id, isFaint(g.color)]));
  const shapes = groupShapes(groups);
  const shared = [...shapes.values()].some((s) => s !== "circle");
  const bands = BANDS.map((b) => ({ ...b, group: groups.find((g) => g.band === b.band) })).filter((b) => b.group);

  // The card's own width, so the axis text stays its real size.
  const W = size?.width ?? 760;
  const axes = mapAxes(plotted, { width: W, height: H, pad: PAD });
  const { x, y, plotH, passX, goodY, xTicks, yTicks } = axes;
  // A picked group draws last, over the rest.
  const dots = placeDots(plotted, axes).sort((a, b) => isPicked(a.group) - isPicked(b.group));

  const averages = groups
    .filter((g) => g.avg_grade != null && g.avg_attendance != null)
    .map((g) => ({ group: g, cx: x(Number(g.avg_grade)), cy: y(Number(g.avg_attendance) * 100) }));

  // Each average is named beside its marker -- to the right, or to the left
  // where the name would run off the plot -- and moved down off any name it
  // would overprint. 7px a character is 12px bold text's average glyph.
  const names = [];
  averages
    .filter((a) => isPicked(a.group))
    .sort((a, b) => a.cy - b.cy)
    .forEach((a) => {
      const width = a.group.label.length * 7;
      const right = a.cx + 14 + width <= W - PAD.right;
      const x0 = right ? a.cx + 14 : a.cx - 14 - width;
      let ny = a.cy + 4;
      while (names.some((n) => x0 < n.x0 + n.width && n.x0 < x0 + width && Math.abs(n.y - ny) < 15)) ny += 15;
      names.push({ id: a.group.cluster_id, text: a.group.label, x0, width, y: ny, anchor: right ? "start" : "end", x: right ? x0 : x0 + width });
    });

  const xTitle = result?.meta?.subject && result.meta.subject !== "Overall" ? `${result.meta.subject} grade` : "Average grade";

  function showNearest(e) {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box?.width) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    const py = ((e.clientY - box.top) / box.height) * H;

    let best = null;
    let bestDistance = HIT;
    averages.forEach((a) => {
      if (!isPicked(a.group)) return;
      const d = Math.hypot(a.cx - px, a.cy - py) - AVERAGE_PULL;
      if (d < bestDistance) {
        best = { kind: "average", key: `a${a.group.cluster_id}`, item: a };
        bestDistance = d;
      }
    });
    dots.forEach((dot) => {
      if (!isPicked(dot.group)) return;
      const d = Math.hypot(dot.cx - px, dot.cy - py);
      if (d < bestDistance) {
        best = { kind: "dot", key: `s${dot.student_id}`, item: dot };
        bestDistance = d;
      }
    });

    if (best?.key === hovered?.key) return;
    setHovered(best);
    if (!best) {
      setTip(null);
    } else if (best.kind === "dot") {
      const s = best.item;
      setTip({
        x: s.cx,
        y: s.cy,
        title: s.student_name ?? `Student #${s.student_id}`,
        lines: [
          s.group.label,
          `Average ${formatGrade(s.grade)} · Attendance ${formatAttendance(s.attendance)}`,
          behaviorLine(s.avg_narrative),
        ],
      });
    } else {
      const g = best.item.group;
      setTip({
        x: best.item.cx,
        y: best.item.cy,
        title: `${g.label}: group average`,
        lines: [
          `${g.student_count} student${g.student_count === 1 ? "" : "s"}`,
          `Average ${formatGrade(g.avg_grade)} · Attendance ${formatAttendance(g.avg_attendance)}`,
          behaviorLine(g.avg_narrative),
        ],
      });
    }
  }

  function clearHover() {
    setHovered(null);
    setTip(null);
  }

  const legend = (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Pick out a group">
        {groups.map((g) => {
          const on = pick === g.cluster_id;
          return (
            <button
              key={g.cluster_id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setPicked(on ? null : g.cluster_id);
                clearHover();
              }}
              className={`focus-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-opacity ${
                on ? "border-neutral-400 bg-neutral-50" : "border-transparent hover:bg-neutral-50"
              } ${isPicked(g) ? "" : "opacity-50"}`}
            >
              <GroupSwatch color={g.color} shape={shapes.get(g.cluster_id)} />
              <span className="text-neutral-700">{g.label}</span>
              <span className="font-bold text-neutral-900 tabular-nums">{g.student_count}</span>
            </button>
          );
        })}
        <span className="ml-1 text-xs text-neutral-500">
          {pick == null ? "Pick a group to see it on its own" : "Pick it again to see every group"}
        </span>
      </div>
      {bands.length > 0 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-neutral-500">
          <span>Colour is each group&apos;s standing on grades, attendance and behavior together:</span>
          {bands.map((b) => (
            <span key={b.band} className="inline-flex items-center gap-1.5">
              <GroupSwatch color={b.group.color} />
              <span className="font-semibold text-neutral-700">{b.word}</span>
            </span>
          ))}
        </p>
      )}
    </div>
  );

  return (
    <div>
      <ChartFrame
        viewBox={[W, H]}
        tip={tip}
        legend={legend}
        plotRef={setPlotEl}
        title={`Students by ${xTitle.toLowerCase()} and attendance, coloured by performance group: ${groups
          .map((g) => `${g.label}, ${g.student_count}`)
          .join("; ")}`}
        caption={`Each mark is one student; the larger ringed marks are each group's average.${
          shared ? " Groups sharing a colour are told apart by shape." : ""
        } Groups are formed from grades, attendance and behavior together, and a map can only show two of the three, so a mark sitting among another group's colour usually differs in behavior. Point at it to see.`}
      >
        {/* The two lines the school acts on, as on the Overview map */}
        <line x1={passX} x2={passX} y1={PAD.top} y2={PAD.top + plotH} stroke={ink().grid} strokeWidth={1.5} />
        <line x1={PAD.left} x2={W - PAD.right} y1={goodY} y2={goodY} stroke={ink().grid} strokeWidth={1.5} />

        {/* Axes */}
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke={ink().grid} />
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH} stroke={ink().grid} />
        {xTicks.map((g) => (
          <text key={g} x={x(g)} y={PAD.top + plotH + 16} textAnchor="middle" fontSize="11" fill={ink().axis}>
            {g}
          </text>
        ))}
        {yTicks.map((p) => (
          <text key={p} x={PAD.left - 8} y={y(p) + 4} textAnchor="end" fontSize="11" fill={ink().axis}>
            {p}%
          </text>
        ))}
        <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="11" fill={ink().axis}>
          {xTitle}
        </text>
        <text
          x={14} y={PAD.top + plotH / 2}
          textAnchor="middle" fontSize="11" fill={ink().axis}
          transform={`rotate(-90 14 ${PAD.top + plotH / 2})`}
        >
          Attendance
        </text>
        <text x={passX} y={PAD.top - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill={ink().axis}>
          Passing mark
        </text>

        {dots.map((d) => {
          const on = isPicked(d.group);
          const outlined = on && faint.get(d.group.cluster_id);
          return (
            <Marker
              key={d.student_id}
              shape={shapes.get(d.group.cluster_id)}
              x={d.cx}
              y={d.cy}
              r={DOT_R}
              fill={on ? d.group.color : token("--color-neutral-300")}
              // A 2px surface ring keeps overlapping marks apart; a faint
              // colour gets a darker outline instead, or its edge is lost.
              stroke={outlined ? token("--color-neutral-500") : SURFACE}
              strokeWidth={outlined ? 1.25 : 2}
            />
          );
        })}

        {/* After the dots, so they stay in front. At the line's left end,
            beside its 90% tick: the right end is where the strongest group's
            name usually sits. Pointer-transparent: the nearest-point layer
            below answers for everything. */}
        <text
          x={PAD.left + 6} y={goodY - 6}
          textAnchor="start" fontSize="11" fontWeight="600" fill={ink().axis}
          stroke={SURFACE} strokeWidth={3} paintOrder="stroke" pointerEvents="none"
        >
          Good attendance
        </text>

        {averages.map((a) => {
          const on = isPicked(a.group);
          return (
            <g key={`avg-${a.group.cluster_id}`} pointerEvents="none">
              <circle cx={a.cx} cy={a.cy} r={12} fill={SURFACE} />
              <Marker
                shape={shapes.get(a.group.cluster_id)}
                x={a.cx}
                y={a.cy}
                r={7}
                fill={on ? a.group.color : token("--color-neutral-300")}
                stroke={on ? ink().ink : token("--color-neutral-400")}
                strokeWidth={2.5}
              />
            </g>
          );
        })}

        {names.map((n) => (
          <text
            key={`name-${n.id}`}
            x={n.x} y={n.y}
            textAnchor={n.anchor} fontSize="12" fontWeight="700" fill={ink().ink}
            stroke={SURFACE} strokeWidth={4} strokeLinejoin="round" paintOrder="stroke" pointerEvents="none"
          >
            {n.text}
          </text>
        ))}

        {hovered && (
          <circle
            cx={hovered.item.cx}
            cy={hovered.item.cy}
            r={hovered.kind === "dot" ? DOT_R + 3.5 : 14}
            fill="none"
            stroke={ink().ink}
            strokeWidth={1.5}
            pointerEvents="none"
          />
        )}

        {/* The hover layer: whichever mark is nearest the pointer answers.
            A tap shows the same, for touch screens. */}
        <rect
          x={0} y={0} width={W} height={H}
          fill="transparent"
          onMouseMove={showNearest}
          onPointerDown={showNearest}
          onMouseLeave={clearHover}
        />
      </ChartFrame>
      {missing > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
          <i className="ti ti-info-circle text-[13px]" aria-hidden="true" />
          {missing === 1
            ? "1 student doesn't have enough attendance recorded yet and isn't on the map."
            : `${missing} students don't have enough attendance recorded yet and aren't on the map.`}
        </p>
      )}
    </div>
  );
}
