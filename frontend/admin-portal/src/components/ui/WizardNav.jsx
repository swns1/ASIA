import Button from "./Button";

// WizardNav — the Back / Next / Submit row under a multi-step form card.
//
// Replaces the two floating circular chevrons StudentFormPage parked 60px
// outside its card (which had nowhere to go below ~900px, carried their
// labels only in a `title` tooltip, and stated "why is Submit disabled?"
// nowhere a keyboard or touch user could read). The applicant kiosk already
// drew a row like this by hand; both use this now.
//
// `hint` is shown under the row — the place to say what still needs filling
// in when `submitDisabled` is set, rather than hiding it in a tooltip.

export default function WizardNav({
  onBack,
  onNext,
  onSubmit,
  isLastStep = false,
  backDisabled = false,
  nextDisabled = false,
  submitDisabled = false,
  loading = false,
  backLabel = "Back",
  nextLabel = "Next",
  submitLabel = "Submit",
  submitIcon = "ti-check",
  hint,
  // "muted" explains what is still missing; "error" reports a validation
  // failure the user just triggered by pressing Submit.
  hintTone = "muted",
  className = "",
}) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack} disabled={backDisabled} type="button">
          <i className="ti ti-chevron-left" aria-hidden="true" /> {backLabel}
        </Button>

        {isLastStep ? (
          <Button
            onClick={onSubmit}
            disabled={submitDisabled}
            loading={loading}
            type="button"
          >
            {submitLabel} <i className={`ti ${submitIcon}`} aria-hidden="true" />
          </Button>
        ) : (
          <Button onClick={onNext} disabled={nextDisabled} type="button">
            {nextLabel} <i className="ti ti-chevron-right" aria-hidden="true" />
          </Button>
        )}
      </div>

      {hint && (
        <p
          className={`mt-2 text-right text-xs ${
            hintTone === "error" ? "font-semibold text-error-500" : "text-neutral-500"
          }`}
          aria-live="polite"
        >
          {hint}
        </p>
      )}
    </div>
  );
}
