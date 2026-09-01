// Skeleton — shared loading placeholder, replacing the six near-identical
// local `Sk` / `Skeleton` components that were redefined per page.
//
// Two variants are kept because the app genuinely used two: a gradient sweep
// on list rows and a softer opacity pulse on dashboard cards.
// Both stop under `prefers-reduced-motion`.

const VARIANTS = {
  shimmer:
    "bg-[linear-gradient(90deg,#f0e8e8_25%,#fde8e8_50%,#f0e8e8_75%)] " +
    "bg-[length:200%_100%] animate-[shimmer_1.6s_ease-in-out_infinite]",
  pulse: "bg-brand-200 animate-pulse",
};

export default function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  variant = "shimmer",
  className = "",
}) {
  return (
    <div
      // Dimensions stay inline: they're per-instance values, not design tokens.
      style={{ width, height, borderRadius: radius }}
      className={`${VARIANTS[variant] ?? VARIANTS.shimmer} motion-reduce:animate-none ${className}`}
      aria-hidden="true"
    />
  );
}

/** A table row of skeletons — matches the avatar + two-line cell used by the
 *  student/enrollment/invoice lists. */
export function SkeletonTableRow({ columns = 5, withAvatar = true }) {
  return (
    <tr className="border-b border-neutral-200/70">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          {i === 0 && withAvatar ? (
            <div className="flex items-center gap-3">
              <Skeleton width={34} height={34} radius={999} />
              <div className="flex-1 space-y-1.5">
                <Skeleton width="55%" height={12} />
                <Skeleton width="35%" height={10} />
              </div>
            </div>
          ) : (
            <Skeleton width={i === columns - 1 ? "45%" : "70%"} height={12} />
          )}
        </td>
      ))}
    </tr>
  );
}

/** Card-shaped skeleton for stat tiles and panels. */
export function SkeletonCard({ lines = 2 }) {
  return (
    <div className="space-y-2.5">
      <Skeleton width="45%" height={11} variant="pulse" />
      <Skeleton width="70%" height={24} variant="pulse" />
      {Array.from({ length: Math.max(0, lines - 2) }).map((_, i) => (
        <Skeleton key={i} width="60%" height={11} variant="pulse" />
      ))}
    </div>
  );
}
