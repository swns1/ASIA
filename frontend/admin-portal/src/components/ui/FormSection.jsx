import { useId } from "react";
import Card from "./Card";

// FormSection / SectionHeader / Divider — the three grouping shapes a long
// form needs.
//
// FormSection was a local component inside EnrollmentFormPage; SectionHeader
// and Divider were inline-styled helpers inside student-form/StudentFormSteps.
// All three are here now so the enrollment form, the student registration
// wizard and the applicant kiosk draw a section the same way.

/**
 * FormSection — a numbered block of a multi-part form. `step` is the badge
 * number; omit it for a section that isn't part of a numbered sequence and
 * pass `icon` instead, which renders the same chip the page header uses.
 */
export default function FormSection({
  step,
  icon,
  title,
  subtitle,
  action,
  className = "",
  bodyClassName = "p-5",
  children,
}) {
  const headingId = useId();
  return (
    <Card padding="none" role="group" aria-labelledby={headingId} className={className}>
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {step != null && (
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-600"
              aria-hidden="true"
            >
              {step}
            </span>
          )}
          {step == null && icon && (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600"
              aria-hidden="true"
            >
              <i className={`ti ${icon} text-[17px]`} />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={headingId} className="truncate text-sm font-bold text-neutral-900">
              {title}
            </h2>
            {subtitle && <p className="truncate text-xs text-neutral-500">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

/**
 * SectionHeader — icon chip + title + subtitle, with a rule underneath. For a
 * heading *inside* a card (each wizard step opens with one), where a nested
 * FormSection would mean a card in a card.
 */
export function SectionHeader({ icon, title, subtitle, action, className = "" }) {
  return (
    <div
      className={`mb-5 flex items-center justify-between gap-3 border-b border-brand-border-soft pb-3.5 ${className}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-500">
            <i className={`ti ${icon} text-[18px]`} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-md font-bold text-neutral-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * ModalHeader — left-aligned icon chip + title + subtitle, for a dialog whose
 * header is a heading rather than ui/Modal's centred title block (which suits
 * a confirm, not a form). Used by the upload, fee-schedule, grading-template
 * and calendar dialogs, which each drew this by hand.
 *
 * `tint` overrides the chip's colours ({ background, color, borderColor }) for
 * a dialog whose accent is a value rather than a token — the calendar's event
 * colours are user-chosen hex, so they can't be classes.
 */
export function ModalHeader({ icon, title, subtitle, tint, action, className = "" }) {
  return (
    <div className={`mb-5 flex items-center gap-3.5 ${className}`}>
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
          tint ? "" : "border-transparent bg-brand-100 text-brand-600"
        }`}
        style={tint}
      >
        <i className={`ti ${icon} text-xl`} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold text-neutral-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[11px] text-neutral-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * Divider — a labelled rule between field groups within a step.
 */
export function Divider({ label, className = "" }) {
  if (!label) {
    return <hr className={`my-4 border-brand-border-soft ${className}`} />;
  }
  return (
    <div className={`my-4 flex items-center gap-2.5 ${className}`}>
      <span className="h-px flex-1 bg-brand-border-soft" aria-hidden="true" />
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500">
        {label}
      </span>
      <span className="h-px flex-1 bg-brand-border-soft" aria-hidden="true" />
    </div>
  );
}
