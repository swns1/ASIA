import Card from "../../ui/Card";
import { SkeletonCard } from "../../ui/Skeleton";
import Sparkline from "../Sparkline";
import { KINDS, changeBetween, num, share } from "../../schoolYears/compareFigures";

// compare/TrendTiles.jsx — the four figures a comparison is most often opened
// for. Each shows the latest selected year, its change from the selected year
// before it, and a sparkline through every selected year.
//
// Built on Card rather than StatCard: StatCard keeps its label to one line,
// and "Average general average" beside a sparkline needs two.

const TILES = [
  {
    key: "learners", label: "Learners", kind: "count", source: "school",
    value: (s) => s?.enrollment.learners ?? null,
  },
  {
    key: "average", label: "Average general average", kind: "average", source: "school",
    value: (s) => num(s?.academics.general_average),
  },
  {
    key: "attendance", label: "Attendance rate", kind: "percent", source: "school",
    value: (s) => num(s?.academics.attendance_rate),
  },
  {
    key: "collection", label: "Collection rate", kind: "percent", source: "money",
    value: (m) => (m ? share(Number(m.total_collected), Number(m.net_billed)) : null),
  },
];

/** `sources`: { school, money }, each { get(year), loading, error }. */
export default function TrendTiles({ years, sources }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
      {TILES.map((tile) => (
        <TrendTile key={tile.key} tile={tile} years={years} source={sources[tile.source]} />
      ))}
    </div>
  );
}

function TrendTile({ tile, years, source }) {
  if (source.loading) {
    return (
      <Card className="min-w-0">
        <SkeletonCard lines={3} />
      </Card>
    );
  }

  const last = years.at(-1);
  const prev = years.length > 1 ? years.at(-2) : null;
  const values = source.error ? [] : years.map((y) => tile.value(source.get(y)));
  const value = values.at(-1) ?? null;
  const change = prev ? changeBetween(value, values.at(-2) ?? null, tile.kind) : null;
  const foot = source.error
    ? "Couldn't be loaded"
    : value == null
      ? `No figure for S.Y. ${last} yet`
      : `S.Y. ${last}${years.length > 1 ? ` · trend across ${years.length} years` : ""}`;

  return (
    <Card className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">{tile.label}</div>
          <div className="mt-1.5 text-xl font-bold tabular-nums text-neutral-900">
            {value == null ? "—" : KINDS[tile.kind].value(value)}
          </div>
        </div>
        <Sparkline values={values} width={96} height={28} className="shrink-0" />
      </div>
      {change && (
        <div className="mt-2 flex items-center gap-0.5 text-xs text-neutral-500">
          {change.direction !== "same" && (
            <i
              className={`ti ${change.direction === "up" ? "ti-arrow-up-right" : "ti-arrow-down-right"}`}
              aria-hidden="true"
            />
          )}
          <span>{change.text} from S.Y. {prev}</span>
        </div>
      )}
      <div className="mt-0.5 text-xs text-neutral-500">{foot}</div>
    </Card>
  );
}
