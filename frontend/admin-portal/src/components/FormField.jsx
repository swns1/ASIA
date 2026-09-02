// FormField.jsx — shared form controls (Field / Input / Select / Textarea).
//
// The public API is unchanged, so the ~50 existing call sites in
// StudentFormPage, EnrollmentFormPage, SchoolFormsPage and the settings pages
// keep working. What changed underneath:
//
//  * Inline style objects and the manual useState(focused) + onFocus/onBlur
//    dance are gone — hover/focus/disabled/invalid are real CSS states now.
//  * Field wires accessibility automatically through context: the label is
//    associated with its control via htmlFor/id (the app previously had no
//    label association anywhere), plus aria-invalid, aria-describedby and
//    aria-required.
//  * Field accepts `error` to show a per-field message. Every form used to
//    surface only the first problem, in one banner, so fixing a form was a
//    guess-and-resubmit loop.
import { createContext, useContext, useId } from "react";

const FieldContext = createContext(null);

const CONTROL_BASE =
  "w-full rounded-lg border-[1.5px] px-3.5 py-2.5 text-base text-neutral-900 " +
  "outline-none transition-colors placeholder:text-neutral-500 " +
  "focus:bg-white focus:ring-3 " +
  "disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500 " +
  "read-only:bg-neutral-200 read-only:text-neutral-700";

const CONTROL_VALID =
  "border-brand-border-soft bg-neutral-100 hover:border-brand-300 focus:border-brand-500 focus:ring-brand-500/10";

// Invalid controls get a red border *and* an icon-marked message below, so the
// state isn't communicated by colour alone.
const CONTROL_INVALID =
  "border-error-500 bg-error-50/40 focus:border-error-500 focus:ring-error-500/15";

function useControl(ownProps) {
  const field = useContext(FieldContext);
  return {
    id: ownProps.id ?? field?.id,
    invalid: field?.invalid ?? false,
    describedBy: ownProps["aria-describedby"] ?? field?.describedBy,
    required: field?.required ?? false,
  };
}

function controlClasses(invalid, extra = "") {
  return [CONTROL_BASE, invalid ? CONTROL_INVALID : CONTROL_VALID, extra]
    .filter(Boolean)
    .join(" ");
}

export function Field({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  className = "",
  children,
}) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id, required, invalid: Boolean(error), describedBy }}>
      <div className={`mb-3.5 ${className}`}>
        {label && (
          <label
            htmlFor={id}
            className="mb-1.5 block text-xs font-bold uppercase tracking-[0.07em] text-neutral-700"
          >
            {label}
            {required && (
              <span className="text-brand-600">
                {" *"}
                {/* Spoken by screen readers; the asterisk alone is ambiguous. */}
                <span className="sr-only"> (required)</span>
              </span>
            )}
          </label>
        )}

        {children}

        {hint && !error && (
          <p id={hintId} className="mt-1.5 text-xs italic text-neutral-500">
            {hint}
          </p>
        )}

        {error && (
          <p id={errorId} className="mt-1.5 flex items-start gap-1 text-xs font-semibold text-error-500">
            <i className="ti ti-alert-circle mt-px shrink-0 text-[13px]" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

/**
 * `nativeRequired` is opt-in: setting the real `required` attribute would make
 * browsers block submission with their own tooltip, which would change the
 * behaviour of forms that already run their own validation. aria-required is
 * always set, so assistive tech is correct either way.
 */
export function Input({ className = "", nativeRequired = false, ...props }) {
  const c = useControl(props);
  return (
    <input
      {...props}
      id={c.id}
      aria-invalid={c.invalid || undefined}
      aria-describedby={c.describedBy}
      aria-required={c.required || undefined}
      required={nativeRequired && c.required ? true : props.required}
      className={controlClasses(c.invalid, className)}
    />
  );
}

export function Select({ className = "", children, ...props }) {
  const c = useControl(props);
  return (
    <select
      {...props}
      id={c.id}
      aria-invalid={c.invalid || undefined}
      aria-describedby={c.describedBy}
      aria-required={c.required || undefined}
      className={controlClasses(c.invalid, `cursor-pointer ${className}`)}
    >
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...props }) {
  const c = useControl(props);
  return (
    <textarea
      {...props}
      id={c.id}
      aria-invalid={c.invalid || undefined}
      aria-describedby={c.describedBy}
      aria-required={c.required || undefined}
      className={controlClasses(c.invalid, `min-h-[72px] resize-y ${className}`)}
    />
  );
}
