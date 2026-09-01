import { motion } from "framer-motion";
import Button from "./Button";
import { describeApiError } from "../../utils/apiError";

// ErrorState — shown when data fails to load.
//
// This exists because four of the busiest list pages used to swallow API
// failures into console.error and render their empty state instead, so a
// network outage was indistinguishable from an empty database — Payments and
// Enrollments even invited the user to "record the first payment" during an
// outage. A failed load must look like a failure, say why, and offer a way out.
//
// Pass either a raw `error` (an Axios error — wording is derived from the
// status code) or an explicit title/message.

export default function ErrorState({
  error,
  subject = "this information",
  title,
  message,
  onRetry,
  className = "",
}) {
  const described = error ? describeApiError(error, { subject }) : null;
  const heading = title ?? described?.title ?? "Something went wrong";
  const body = message ?? described?.message ?? `We couldn't load ${subject}.`;
  const canRetry = Boolean(onRetry) && (described ? described.canRetry : true);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      role="alert"
      className={`flex flex-col items-center gap-2.5 px-4 py-10 text-center ${className}`}
    >
      <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-error-50">
        <i className="ti ti-cloud-off text-2xl text-error-500" aria-hidden="true" />
      </div>
      <div className="text-md font-bold text-neutral-900">{heading}</div>
      <p className="max-w-sm text-sm text-neutral-600">{body}</p>
      {canRetry && (
        <Button variant="secondary" size="sm" icon="ti-refresh" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </motion.div>
  );
}
