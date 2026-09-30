import ClassSizeChart from "./ClassSizeChart";
import CollectionChart from "./CollectionChart";
import FeesByGradeChart from "./FeesByGradeChart";
import LearnerBridgeChart from "./LearnerBridgeChart";
import LearnersByLevelChart from "./LearnersByLevelChart";
import RatesChart from "./RatesChart";
import TrendTiles from "./TrendTiles";

// compare/CompareCharts.jsx — Compare School Years drawn rather than tabled:
// four trend tiles, then six charts, two to a row where there's room.
//
// Everything comes from what the page already loads for its tables. Each of
// `sources` is { get(year), loading, error, onRetry }:
//   school -- /school-years/compare/: learners, classes, grades, attendance
//   money  -- billing's financial summary for the year
//   fees   -- the year's active fee schedules
// Each chart takes the one source it draws from, so billing failing leaves the
// learner charts standing.
//
// `bridgeTo` is the later year of the pair the learner bridge shows; the page
// holds it so it survives a reload of the figures.

export default function CompareCharts({ years, states, sources, bridgeTo, onBridgeTo }) {
  const { school, money, fees } = sources;
  return (
    <div className="flex flex-col gap-4">
      <TrendTiles years={years} sources={sources} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-4">
        <LearnersByLevelChart years={years} source={school} />
        <LearnerBridgeChart years={years} source={school} bridgeTo={bridgeTo} onBridgeTo={onBridgeTo} />
        <RatesChart years={years} states={states} source={school} />
        <CollectionChart years={years} states={states} source={money} />
        <ClassSizeChart years={years} source={school} />
        <FeesByGradeChart years={years} source={fees} />
      </div>
    </div>
  );
}
