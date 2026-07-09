import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { modalVariants, springTransition } from "../utils/motion";

// Shared confirm dialog — replaces the ~8 near-duplicate DeleteModal /
// ConfirmModal / RemoveModal implementations that used to live one per page.
// Caller controls conditional rendering + AnimatePresence exit animation,
// same as the modals it replaces, e.g.:
//   <AnimatePresence>{showDelete && <ConfirmModal title="Delete student?" ... />}</AnimatePresence>
export default function ConfirmModal({
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
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    cancelBtnRef.current?.focus();
    function handleKeyDown(e) {
      if (e.key === "Escape" && !loading) onCancel?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [loading, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
    >
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={loading ? undefined : onCancel}
        style={{ position: "absolute", inset: 0, background: "rgba(26,10,10,0.4)", backdropFilter: "blur(4px)" }}
      />
      <motion.div
        variants={modalVariants} initial="hidden" animate="visible" exit="exit"
        transition={springTransition}
        style={{
          position: "relative", background: "white", borderRadius: 20, padding: "32px 36px",
          width: 400, boxShadow: "0 24px 64px rgba(224,49,49,0.18)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
        }}
      >
        <div style={{
          width: 60, height: 60, borderRadius: 16, background: danger ? "#fff0f0" : "#f5f3ef",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <i className={`ti ${icon}`} style={{ fontSize: 24, color: danger ? "#e03131" : "#6a6460" }} />
        </div>
        <div id="confirm-modal-title" style={{ fontSize: 18, fontWeight: 700, color: "#1a0a0a" }}>
          {title}
        </div>
        {message && (
          <div style={{ fontSize: 13, color: "#7a5050", textAlign: "center", lineHeight: 1.7 }}>
            {message}
          </div>
        )}
        {error && (
          <div style={{ width: "100%", background: "#fde8e8", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#9b2020" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 6, width: "100%" }}>
          <motion.button
            ref={cancelBtnRef}
            whileHover={{ background: "#fdf8f8" }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12 }}
            disabled={loading}
            style={{
              flex: 1, height: 42, border: "1.5px solid #f0e0e0", borderRadius: 10,
              background: "white", fontSize: 13, color: "#7a5050",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
            }}
            onClick={onCancel}
          >
            {cancelLabel}
          </motion.button>
          <motion.button
            whileHover={!loading && !confirmDisabled ? { opacity: 0.88 } : {}}
            whileTap={!loading && !confirmDisabled ? { scale: 0.97 } : {}}
            transition={{ duration: 0.12 }}
            disabled={loading || confirmDisabled}
            style={{
              flex: 1, height: 42, border: "none", borderRadius: 10,
              background: danger ? "linear-gradient(135deg, #e03131, #c92a2a)" : "linear-gradient(135deg, #3a3a3a, #1a1a1a)",
              fontSize: 13, color: "white", cursor: loading || confirmDisabled ? "not-allowed" : "pointer",
              fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
              opacity: confirmDisabled && !loading ? 0.7 : 1,
              boxShadow: danger ? "0 4px 16px rgba(224,49,49,0.3)" : "0 4px 16px rgba(0,0,0,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}
            onClick={onConfirm}
          >
            {loading
              ? <><i className="ti ti-loader-2" style={{ fontSize: 14, animation: "spin 1s linear infinite" }} />Working…</>
              : confirmLabel}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
