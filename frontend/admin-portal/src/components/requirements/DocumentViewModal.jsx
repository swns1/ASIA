import { C } from "./requirementMeta";

/**
 * Lightbox for a stored document.
 *
 * Renders a PDF in an <iframe> rather than an <img>. RequirementsPage's own
 * copy only ever rendered <img>, so opening an uploaded PDF from there showed
 * a broken image — the panel takes StudentFormPage's handling instead, but
 * decides on `file_kind` from the server rather than on the URL's extension,
 * because signed download links (…/file/?token=…) no longer carry one.
 */
export default function DocumentViewModal({ url, name, isPdf = false, onClose }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,0,0,0.82)", display: "flex",
               alignItems: "center", justifyContent: "center", zIndex: 1200, padding: 24 }}
      onClick={onClose}
    >
      <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: "absolute", top: -14, right: -14, width: 36, height: 36, borderRadius: "50%",
                   background: C.white, border: "none", cursor: "pointer", display: "flex",
                   alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.3)", zIndex: 1 }}
        >
          <i className="ti ti-x" style={{ fontSize: 16, color: C.text }} />
        </button>
        {isPdf ? (
          <iframe src={url} title={name} style={{ width: "80vw", height: "80vh", border: "none", borderRadius: 12 }} />
        ) : (
          <img
            src={url}
            alt={name}
            style={{ maxWidth: "86vw", maxHeight: "86vh", objectFit: "contain", borderRadius: 12,
                     boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
          />
        )}
        <div style={{ position: "absolute", bottom: -32, left: 0, right: 0, textAlign: "center",
                      fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
          {name}
        </div>
      </div>
    </div>
  );
}
