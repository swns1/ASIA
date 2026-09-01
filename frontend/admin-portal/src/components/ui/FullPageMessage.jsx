// FullPageMessage — the centred card used for whole-screen outcomes.
//
// NotFoundPage and ErrorBoundary's fallback were near-identical hand-built
// copies of this (same cream backdrop, white card, icon tile, two buttons).
// ErrorBoundary mounts outside the Router, so this component must not depend
// on react-router — callers pass plain nodes as actions.

const TONES = {
  brand: "bg-brand-100 text-brand-500",
  error: "bg-error-50 text-error-500",
  warning: "bg-warning-50 text-warning-500",
  info: "bg-info-50 text-info-500",
};

export default function FullPageMessage({
  icon = "ti-alert-triangle",
  tone = "brand",
  title,
  message,
  actions,
  children,
}) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-9 text-center shadow-2xl">
        <div
          className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${
            TONES[tone] ?? TONES.brand
          }`}
        >
          <i className={`ti ${icon} text-2xl`} aria-hidden="true" />
        </div>

        <h1 className="text-xl font-bold text-neutral-900">{title}</h1>
        {message && <p className="mt-2.5 text-sm leading-relaxed text-neutral-700">{message}</p>}

        {actions && <div className="mt-6 flex flex-wrap justify-center gap-2.5">{actions}</div>}
        {children}
      </div>
    </div>
  );
}
