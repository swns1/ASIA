// RouteFallback — what fills the page area while a route's chunk downloads.
//
// Deliberately plain. Every page already renders its own skeleton while it
// fetches data, so a second, different-looking skeleton here would read as two
// loading states stacked on one navigation. This marks the brief gap before
// the page can render its own, and nothing more.
//
// `fullPage` is for the routes that sit outside a shell (the print documents
// and the focused forms): with no sidebar around it, the spinner needs its own
// vertical space rather than filling a content column that isn't there.
export default function RouteFallback({ fullPage = false }) {
  return (
    <div
      className={`flex min-h-0 flex-1 items-center justify-center ${
        fullPage ? "min-h-screen" : "min-h-[50vh]"
      }`}
      // Announced politely so a screen-reader user is told the page is on its
      // way instead of hearing silence after activating a nav link.
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-2.5 text-sm text-neutral-600">
        <i className="ti ti-loader-2 animate-spin text-base" aria-hidden="true" />
        Loading…
      </span>
    </div>
  );
}
