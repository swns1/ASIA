import { useCallback, useId, useRef } from "react";
import { motion } from "framer-motion";
import { modalVariants, springTransition } from "../../utils/motion";
import useFocusTrap from "../../hooks/useFocusTrap";
import Button from "./Button";
import Alert from "./Alert";

// Modal — the one dialog primitive.
//
// Generalised from the old ConfirmModal, which was the only correctly-labelled
// dialog in the app; the bespoke modals in UsersPage, InvoicesPage,
// EnrollmentsPage and RecordPaymentModal were raw <div>s with no dialog role,
// no focus trap and no Escape handling. Everything now inherits those.
//
// Rendering stays caller-controlled (wrap in <AnimatePresence> and mount
// conditionally) to match how the existing call sites already work.

const SIZES = {
  sm: "max-w-[400px]",
  md: "max-w-[540px]",
  lg: "max-w-[720px]",
};

export default function Modal({
  onClose,
  size = "sm",
  title,
  description,
  icon,
  iconTone = "brand",
  loading = false,
  closeOnBackdrop = true,
  showClose = false,
  footer,
  className = "",
  children,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  // While an action is in flight, Escape and backdrop clicks are ignored so a
  // stray keypress can't abandon a request the user already committed to.
  const handleEscape = useCallback(() => {
    if (!loading) onClose?.();
  }, [loading, onClose]);

  useFocusTrap(dialogRef, { enabled: true, onEscape: handleEscape });

  const iconToneClass =
    iconTone === "danger"
      ? "bg-error-50 text-error-500"
      : iconTone === "neutral"
        ? "bg-muted-50 text-muted-500"
        : "bg-brand-100 text-brand-500";

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={loading || !closeOnBackdrop ? undefined : onClose}
        className="absolute inset-0 bg-brand-900/40 backdrop-blur-[4px]"
      />

      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={springTransition}
        className={`relative flex max-h-[90vh] w-[calc(100%-2rem)] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl outline-none ${
          SIZES[size] ?? SIZES.sm
        } ${className}`}
      >
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close dialog"
            className="focus-ring absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-brand-50 hover:text-brand-500 disabled:opacity-40"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6 pt-8">
          {(icon || title || description) && (
            <div className="mb-5 flex flex-col items-center gap-3 text-center">
              {icon && (
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${iconToneClass}`}>
                  <i className={`ti ${icon} text-2xl`} aria-hidden="true" />
                </div>
              )}
              {title && (
                <h2 id={titleId} className="text-lg font-bold text-neutral-900">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="text-sm leading-relaxed text-neutral-700">
                  {description}
                </p>
              )}
            </div>
          )}
          {children}
        </div>

        {footer && <div className="border-t border-neutral-200 px-8 py-5">{footer}</div>}
      </motion.div>
    </div>
  );
}

/**
 * ConfirmDialog — destructive/irreversible action gate.
 *
 * Keeps the exact prop API of the old ConfirmModal so every existing call site
 * works untouched (ConfirmModal.jsx now re-exports this).
 */
export function ConfirmDialog({
  icon = "ti-trash",
  title,
  message,
  error,
  confirmLabel = "Yes, delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  loading = false,
  danger = true,
  confirmDisabled = false,
}) {
  return (
    <Modal
      onClose={onCancel}
      size="sm"
      icon={icon}
      iconTone={danger ? "danger" : "neutral"}
      title={title}
      description={message}
      loading={loading}
      footer={
        <div className="flex gap-2.5">
          <Button
            variant="secondary"
            fullWidth
            disabled={loading}
            onClick={onCancel}
            // Focus lands on the safe choice, not the destructive one.
            data-autofocus
          >
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "destructive" : "primary"}
            fullWidth
            loading={loading}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {loading ? "Working…" : confirmLabel}
          </Button>
        </div>
      }
    >
      {error && <Alert variant="error">{error}</Alert>}
    </Modal>
  );
}
