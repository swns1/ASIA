import { Panel } from "../../ui/Card";
import ErrorState from "../../ui/ErrorState";
import Skeleton from "../../ui/Skeleton";

// compare/ChartCard.jsx — the card each Compare chart sits in: the same titled
// Panel as the tables, with the chart's own loading and error states, so one
// source failing (billing, say) only blanks the charts drawn from it.
//
// `source` is { loading, error, onRetry }. `children` renders only once the
// source has answered, so a chart can read every selected year's figures
// without checking first that they've arrived.

const BODY = {
  chart: "p-5",
  // A list, whose header row sits close under the card's own.
  list: "px-5 pb-5 pt-2",
};

export default function ChartCard({
  icon,
  title,
  subtitle,
  source,
  errorSubject,
  skeletonHeight = 240,
  body = "chart",
  children,
}) {
  return (
    <Panel
      icon={icon}
      title={title}
      subtitle={subtitle}
      padding="none"
      className="min-w-0"
      bodyClassName={`flex flex-col gap-3 ${BODY[body] ?? BODY.chart}`}
    >
      {source.error ? (
        <ErrorState error={source.error} subject={errorSubject} onRetry={source.onRetry} />
      ) : source.loading ? (
        <>
          <Skeleton height={skeletonHeight} radius={10} variant="pulse" />
          <Skeleton width="60%" height={11} variant="pulse" />
        </>
      ) : (
        children
      )}
    </Panel>
  );
}

/** The sentence under a chart that says what to take from it. */
export function Caption({ children }) {
  return <p className="text-xs text-neutral-500">{children}</p>;
}
