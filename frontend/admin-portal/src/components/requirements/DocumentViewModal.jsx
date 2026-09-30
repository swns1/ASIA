import { useRef } from "react";
import useFocusTrap from "../../hooks/useFocusTrap";

/**
 * Lightbox for a stored document.
 *
 * Renders a PDF in an <iframe> rather than an <img>. RequirementsPage's own
 * copy only ever rendered <img>, so opening an uploaded PDF from there showed
 * a broken image — the panel takes StudentFormPage's handling instead, but
 * decides on `file_kind` from the server rather than on the URL's extension,
 * because signed download links (…/file/?token=…) no longer carry one.
 *
 * Deliberately NOT built on ui/Modal: this is a lightbox, not a dialog card.
 * It wants a near-opaque dark field and the image sized to the viewport, where
 * Modal gives a white rounded panel capped at 90vh with padding — which would
 * letterbox a scan inside a card instead of showing it. It uses the same focus
 * trap and Escape handling as Modal, so the two behave alike for a keyboard.
 */
export default function DocumentViewModal({ url, name, isPdf = false, onClose }) {
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, { enabled: true, onEscape: onClose });

  return (
    // Backdrop click closes; Escape does too, via the focus trap above. The
    // dialog below stops propagation so a click on the image doesn't close it.
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-brand-950/85 p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        tabIndex={-1}
        className="relative max-h-[90vh] max-w-[90vw] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="focus-ring absolute -right-3.5 -top-3.5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-neutral-900 shadow-lg transition-colors hover:bg-brand-50 hover:text-brand-600"
        >
          <i className="ti ti-x text-base" aria-hidden="true" />
        </button>

        {isPdf ? (
          <iframe src={url} title={name} className="h-[80vh] w-[80vw] rounded-xl border-0" />
        ) : (
          <img
            src={url}
            alt={name}
            className="max-h-[86vh] max-w-[86vw] rounded-xl object-contain shadow-2xl"
          />
        )}

        <div className="absolute -bottom-8 left-0 right-0 text-center text-xs text-white/70">
          {name}
        </div>
      </div>
    </div>
  );
}
