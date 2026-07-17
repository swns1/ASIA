import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import AppLayout from "../components/AppLayout";
import ConfirmModal from "../components/ConfirmModal";
import { useNavigate } from "react-router-dom";
import { listVariants, modalVariants, springTransition } from "../utils/motion";

import {
  getScholarshipTypes as _getScholarshipTypes,
  createScholarshipType as _createScholarshipType,
  updateScholarshipType as _updateScholarshipType,
  deleteScholarshipType as _deleteScholarshipType,
} from "../api/enrollmentApi";

const getScholarshipTypes   = (p = {}) => _getScholarshipTypes(p);
const createScholarshipType = (p)      => _createScholarshipType(p);
const updateScholarshipType = (id, p)  => _updateScholarshipType(id, p);
const deleteScholarshipType = (id)     => _deleteScholarshipType(id);

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
);

// ── Format helpers ────────────────────────────────────────────────────────────
const formatDiscount = (s) =>
  s.discount_mode === "percentage"
    ? `${parseFloat(s.discount_value).toFixed(0)}% off`
    : `₱${parseFloat(s.discount_value).toLocaleString()} off`;

// ── ScholarshipTypeModal ──────────────────────────────────────────────────────
function ScholarshipTypeModal({ scholarshipType, onClose, onSaved }) {
  const isEdit = Boolean(scholarshipType?.scholarship_type_id);

  const [form, setForm] = useState({
    scholarship_code: scholarshipType?.scholarship_code ?? "",
    scholarship_name: scholarshipType?.scholarship_name ?? "",
    description:      scholarshipType?.description      ?? "",
    discount_mode:    scholarshipType?.discount_mode    ?? "percentage",
    discount_value:   scholarshipType?.discount_value   ?? "",
    is_active:        scholarshipType?.is_active        ?? true,
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.scholarship_code.trim()) { setError("Scholarship code is required."); return; }
    if (!form.scholarship_name.trim()) { setError("Scholarship name is required."); return; }
    if (!form.discount_value || parseFloat(form.discount_value) < 0) { setError("Discount value is required."); return; }
    if (form.discount_mode === "percentage" && parseFloat(form.discount_value) > 100) { setError("Percentage cannot exceed 100%."); return; }

    setSaving(true); setError("");
    try {
      const payload = {
        scholarship_code: form.scholarship_code.trim(),
        scholarship_name: form.scholarship_name.trim(),
        description:      form.description.trim() || null,
        discount_mode:    form.discount_mode,
        discount_value:   parseFloat(form.discount_value),
        is_active:        form.is_active,
      };
      if (isEdit) await updateScholarshipType(scholarshipType.scholarship_type_id, payload);
      else        await createScholarshipType(payload);
      toast.success(isEdit ? "Scholarship type updated." : "Scholarship type created.");
      onSaved();
      onClose();
    } catch (e) {
      const msg = e.message || "Failed to save.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const inp = {
    width: "100%", border: "1.5px solid #fde2de", borderRadius: 10,
    padding: "10px 14px", fontSize: 13, fontFamily: "'DM Sans',sans-serif",
    color: "#1a0a0a", background: "#fffbfb", outline: "none", boxSizing: "border-box",
  };

  const lbl = {
    display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050",
    letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}
    >
      <motion.div
        variants={modalVariants} initial="hidden" animate="visible" exit="exit"
        transition={springTransition}
        style={{ background: "white", borderRadius: 20, width: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(224,49,49,0.18)" }}
      >
        {/* Header */}
        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(to right,#fdfafa,white)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-discount" style={{ fontSize: 20, color: "#e03131" }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a" }}>
                {isEdit ? "Edit Scholarship" : "New Scholarship Type"}
              </div>
              <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>
                {isEdit ? "Update scholarship details" : "Create a new scholarship type"}
              </div>
            </div>
          </div>
          <motion.button onClick={onClose} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", fontSize: 20, display: "flex", alignItems: "center" }}>
            <i className="ti ti-x" />
          </motion.button>
        </div>

        {/* Body */}
        <div style={{ padding: "22px 28px" }}>
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}
              >
                <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Code + Name */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Scholarship Code *</label>
              <input value={form.scholarship_code} onChange={(e) => setF("scholarship_code", e.target.value)}
                placeholder="e.g. ACADEMIC_EXCEL" style={inp} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Scholarship Name *</label>
              <input value={form.scholarship_name} onChange={(e) => setF("scholarship_name", e.target.value)}
                placeholder="e.g. Academic Excellence Award" style={inp} />
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Description</label>
            <textarea value={form.description} onChange={(e) => setF("description", e.target.value)}
              placeholder="Optional description…" rows={2}
              style={{ ...inp, resize: "vertical" }} />
          </div>

          {/* Discount mode */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Discount Type *</label>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { value: "percentage",   label: "Percentage (%)",   icon: "ti-percentage",    color: "#1455a0", bg: "#e3f0fd" },
                { value: "fixed_amount", label: "Fixed Amount (₱)", icon: "ti-currency-peso", color: "#2e6b0d", bg: "#e8f5e0" },
              ].map((opt) => {
                const active = form.discount_mode === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setF("discount_mode", opt.value)}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                      borderRadius: 12, border: `1.5px solid ${active ? opt.color : "#f0e4e4"}`,
                      background: active ? opt.bg : "white", cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif",
                      transition: "background-color 0.15s ease, border-color 0.15s ease",
                    }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: active ? "white" : "#f9f4f4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background-color 0.15s ease" }}>
                      <i className={`ti ${opt.icon}`} style={{ fontSize: 16, color: active ? opt.color : "#9a7070", transition: "color 0.15s ease" }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: active ? opt.color : "#7a5050", transition: "color 0.15s ease" }}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Discount value */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Discount Value *</label>
            <div style={{ position: "relative" }}>
              <input type="number" min="0" max={form.discount_mode === "percentage" ? 100 : undefined}
                step="0.01" value={form.discount_value}
                onChange={(e) => setF("discount_value", e.target.value)}
                placeholder={form.discount_mode === "percentage" ? "e.g. 50" : "e.g. 5000"}
                style={{ ...inp, paddingRight: 50 }} />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: "#b09090" }}>
                {form.discount_mode === "percentage" ? "%" : "₱"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#b09090", marginTop: 5, fontStyle: "italic", visibility: form.discount_mode === "percentage" ? "visible" : "hidden" }}>Must be between 0 and 100%</div>
          </div>

          {/* Active toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#fdfafa", border: "1px solid #f5eaea", borderRadius: 10 }}>
            <input type="checkbox" id="is_active" checked={form.is_active}
              onChange={(e) => setF("is_active", e.target.checked)}
              style={{ width: 15, height: 15, accentColor: "#e03131", cursor: "pointer" }} />
            <label htmlFor="is_active" style={{ fontSize: 13, color: "#1a0a0a", cursor: "pointer", fontWeight: 500 }}>
              Active — available for assignment to enrollments
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 28px 24px", display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #f5eaea" }}>
          <motion.button onClick={onClose}
            whileHover={{ borderColor: "#e03131", color: "#e03131" }}
            style={{ background: "transparent", color: "#9a7070", border: "1.5px solid #fde2de", borderRadius: 50, padding: "9px 22px", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: "pointer" }}>
            Cancel
          </motion.button>
          <motion.button onClick={handleSave} disabled={saving}
            whileHover={!saving ? { scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" } : {}}
            whileTap={!saving ? { scale: 0.96 } : {}}
            style={{ background: saving ? "#e87474" : "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 50, padding: "9px 24px", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", cursor: saving ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
            {saving
              ? <><i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 1s linear infinite" }} />Saving…</>
              : <><i className="ti ti-check" style={{ fontSize: 13 }} />{isEdit ? "Update" : "Create Scholarship"}</>
            }
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Delete Modal ──────────────────────────────────────────────────────────────
function DeleteModal({ item, onConfirm, onCancel, deleting, deleteError }) {
  return (
    <ConfirmModal
      icon="ti-trash"
      title="Delete scholarship?"
      message={<>You're about to delete <strong style={{ color: "#1a0a0a" }}>{item.scholarship_name}</strong>. This cannot be undone and may affect existing enrollments.</>}
      error={deleteError}
      loading={deleting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

// ── Table Row ─────────────────────────────────────────────────────────────────
function ScholarshipRow({ sch, onEdit, onDelete }) {
  const isPct    = sch.discount_mode === "percentage";
  const isActive = sch.is_active;

  return (
    <motion.tr
      variants={listVariants.item}
      onHoverStart={(e) => { if (e.target?.closest) e.target.closest("tr") && (e.target.closest("tr").style.background = "#fff8f6"); }}
      onHoverEnd={(e)   => { if (e.target?.closest) e.target.closest("tr") && (e.target.closest("tr").style.background = ""); }}
      style={{ cursor: "default" }}
    >
      {/* Name */}
      <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: isPct ? "#e3f0fd" : "#e8f5e0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className={`ti ${isPct ? "ti-percentage" : "ti-currency-peso"}`} style={{ fontSize: 15, color: isPct ? "#1455a0" : "#2e6b0d" }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a0a0a" }}>{sch.scholarship_name}</div>
            {sch.description && (
              <div style={{ fontSize: 11, color: "#b09090", marginTop: 1, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sch.description}</div>
            )}
          </div>
        </div>
      </td>
      {/* Code */}
      <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#5a4a4a", background: "#f9f4f4", padding: "3px 8px", borderRadius: 6 }}>{sch.scholarship_code}</span>
      </td>
      {/* Discount type */}
      <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: isPct ? "#e3f0fd" : "#e8f5e0", color: isPct ? "#1455a0" : "#2e6b0d" }}>
          <i className={`ti ${isPct ? "ti-percentage" : "ti-currency-peso"}`} style={{ fontSize: 11 }} />
          {isPct ? "Percentage" : "Fixed Amount"}
        </span>
      </td>
      {/* Discount value */}
      <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: isPct ? "#1455a0" : "#2e6b0d" }}>
          {formatDiscount(sch)}
        </span>
      </td>
      {/* Status */}
      <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: isActive ? "#e8f5e0" : "#f0ede8", color: isActive ? "#2e6b0d" : "#5c5752" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: isActive ? "#4caf50" : "#9e9e9e" }} />
          {isActive ? "Active" : "Inactive"}
        </span>
      </td>
      {/* Actions */}
      <td style={{ padding: "13px 14px", borderBottom: "1px solid #f9f0f0", verticalAlign: "middle" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 4 }}>
          <motion.button title="Edit" onClick={() => onEdit(sch)}
            whileHover={{ scale: 1.08, backgroundColor: "#fff0f0", borderColor: "#fca5a5" }}
            whileTap={{ scale: 0.93 }}
            style={{ width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9a7070" }}>
            <i className="ti ti-pencil" style={{ fontSize: 13 }} />
          </motion.button>
          <motion.button title="Delete" onClick={() => onDelete(sch)}
            whileHover={{ scale: 1.08, backgroundColor: "#fff0f0", borderColor: "#fca5a5" }}
            whileTap={{ scale: 0.93 }}
            style={{ width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090" }}>
            <i className="ti ti-trash" style={{ fontSize: 13 }} />
          </motion.button>
        </div>
      </td>
    </motion.tr>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function ScholarshipTypesPage() {
  usePageTitle("Scholarship Types");
  const navigate = useNavigate();

  const [scholarships,  setScholarships]  = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [typeFilter,    setTypeFilter]    = useState("all"); // all | percentage | fixed_amount
  const [modal,         setModal]         = useState(null);
  const [toDelete,      setToDelete]      = useState(null);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteError,   setDeleteError]   = useState("");

  const [animated] = useState(false);
  const isFirstRender = !animated;

  const fetchScholarships = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getScholarshipTypes({ page_size: 500 });
      setScholarships(Array.isArray(data) ? data : data?.results ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchScholarships(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalCount    = scholarships.length;
  const activeCount   = scholarships.filter((s) => s.is_active).length;

  // ── Client-side filtered list ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = scholarships;
    if (statusFilter === "active")     list = list.filter((s) => s.is_active);
    if (statusFilter === "inactive")   list = list.filter((s) => !s.is_active);
    if (typeFilter === "percentage")   list = list.filter((s) => s.discount_mode === "percentage");
    if (typeFilter === "fixed_amount") list = list.filter((s) => s.discount_mode === "fixed_amount");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) =>
        s.scholarship_name.toLowerCase().includes(q) ||
        s.scholarship_code.toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [scholarships, statusFilter, typeFilter, search]);

  const hasFilters = statusFilter !== "all" || typeFilter !== "all" || search.trim() !== "";

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteScholarshipType(toDelete.scholarship_type_id);
      toast.success("Scholarship type deleted.");
      setToDelete(null);
      fetchScholarships();
    } catch (e) {
      const msg = e.message || "Delete failed.";
      try {
        const parsed = JSON.parse(msg.split(": ").slice(1).join(": "));
        setDeleteError(parsed.detail || parsed.error || msg);
      } catch {
        setDeleteError(msg);
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppLayout>
      {/* ── Topbar ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        style={{ background: "white", borderBottom: "1px solid #f5eaea", padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 8px rgba(224,49,49,0.04)" }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.01em" }}>Scholarship Types</div>
          <div style={{ fontSize: 11.5, color: "#b09090", marginTop: 1 }}>
            {loading ? "Loading…" : `${totalCount} scholarship types · ${activeCount} active`}
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }}
          whileTap={{ scale: 0.96 }}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}
          onClick={() => setModal({ mode: "create" })}>
          <i className="ti ti-plus" style={{ fontSize: 15 }} />New Scholarship
        </motion.button>
      </motion.div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Filter panel */}
        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.18, ease: "easeOut" }}
          style={{ background: "white", borderRadius: 14, padding: "16px 20px", border: "1px solid #f5eaea", boxShadow: "0 2px 12px rgba(224,49,49,0.05)", display: "flex", flexDirection: "column", gap: 12 }}
        >
          {/* Search — full width */}
          <div className="search-wrap" style={{ display: "flex", alignItems: "center", gap: 10, background: "white", border: "1.5px solid #f0e4e4", borderRadius: 12, padding: "0 14px", height: 38, width: "100%", boxSizing: "border-box", transition: "border .15s, box-shadow .15s" }}>
            <i className="ti ti-search" style={{ fontSize: 14, color: "#c0a0a0", flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code, or description…"
              style={{ border: "none", outline: "none", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "transparent", width: "100%" }}
            />
            <AnimatePresence>
              {search && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                  onClick={() => setSearch("")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", display: "flex", alignItems: "center", padding: 0 }}>
                  <i className="ti ti-x" style={{ fontSize: 12 }} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Chips row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>

            {/* Status chips */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 2 }}>Status</span>
              {[
                { value: "all",      label: "All",      color: "#e03131", bg: "#fff0f0" },
                { value: "active",   label: "Active",   color: "#2e6b0d", bg: "#e8f5e0" },
                { value: "inactive", label: "Inactive", color: "#7a5050", bg: "#f0ede8" },
              ].map((f) => {
                const active = statusFilter === f.value;
                return (
                  <motion.button
                    key={f.value}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    onClick={() => setStatusFilter(f.value)}
                    style={{
                      height: 32, padding: "0 14px", borderRadius: 99,
                      border: `1.5px solid ${active ? f.color : "#f0e4e4"}`,
                      background: active ? f.bg : "white",
                      color: active ? f.color : "#9a7070",
                      fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif",
                      transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                    }}
                  >
                    {f.label}
                  </motion.button>
                );
              })}
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 24, background: "#f0e4e4" }} />

            {/* Discount type chips */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 2 }}>Type</span>
              {[
                { value: "all",          label: "All",          color: "#e03131", bg: "#fff0f0",  icon: null },
                { value: "percentage",   label: "Percentage",   color: "#1455a0", bg: "#e3f0fd",  icon: "ti-percentage" },
                { value: "fixed_amount", label: "Fixed Amount", color: "#7c3aed", bg: "#f0e8fd",  icon: "ti-currency-peso" },
              ].map((f) => {
                const active = typeFilter === f.value;
                return (
                  <motion.button
                    key={f.value}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    onClick={() => setTypeFilter(f.value)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      height: 32, padding: "0 14px", borderRadius: 99,
                      border: `1.5px solid ${active ? f.color : "#f0e4e4"}`,
                      background: active ? f.bg : "white",
                      color: active ? f.color : "#9a7070",
                      fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif",
                      transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                    }}
                  >
                    {f.icon && <i className={`ti ${f.icon}`} style={{ fontSize: 11 }} />}
                    {f.label}
                  </motion.button>
                );
              })}
            </div>

            {/* Clear */}
            <AnimatePresence>
              {hasFilters && (
                <motion.button
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setSearch(""); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, border: "1.5px solid #fde2de", background: "white", color: "#e03131", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                  <i className="ti ti-x" style={{ fontSize: 11 }} />Clear
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.24, ease: "easeOut" }}
          style={{ background: "white", border: "1px solid #f5eaea", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 16px rgba(224,49,49,0.06)" }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fdfafa" }}>
                {[
                  { label: "Scholarship",    w: "30%" },
                  { label: "Code",           w: "14%" },
                  { label: "Discount Type",  w: "16%" },
                  { label: "Discount Value", w: "14%" },
                  { label: "Status",         w: "13%" },
                  { label: "",               w: "5%"  },
                ].map(({ label, w }) => (
                  <th key={label} style={{ textAlign: "left", fontSize: 10.5, fontWeight: 600, color: "#c0a0a0", padding: "13px 18px", borderBottom: "1px solid #f5eaea", textTransform: "uppercase", letterSpacing: "0.07em", width: w }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <motion.tbody
              variants={listVariants.container}
              initial={isFirstRender ? "hidden" : false}
              animate="visible"
            >
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Sk w={36} h={36} r={10} />
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <Sk w={140} h={13} /><Sk w={90} h={11} />
                          </div>
                        </div>
                      </td>
                      {[80, 100, 80, 60, 60].map((w, j) => (
                        <td key={j} style={{ padding: "13px 18px", borderBottom: "1px solid #f9f0f0" }}><Sk w={w} h={13} /></td>
                      ))}
                    </tr>
                  ))
                : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "64px 16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#fff0f0,#fde8e8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <i className="ti ti-discount-off" style={{ fontSize: 22, color: "#e08080" }} />
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#7a5050" }}>
                            {hasFilters ? "No scholarships match your filters" : "No scholarship types found"}
                          </div>
                          <div style={{ fontSize: 12, color: "#b09090" }}>
                            {hasFilters ? "Try adjusting your search or filters" : "Create your first scholarship type to get started"}
                          </div>
                          {!hasFilters && (
                            <motion.button
                              whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => setModal({ mode: "create" })}
                              style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
                              <i className="ti ti-plus" style={{ fontSize: 14 }} />New Scholarship
                            </motion.button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                  : filtered.map((sch) => (
                      <ScholarshipRow
                        key={sch.scholarship_type_id}
                        sch={sch}
                        onEdit={(s) => setModal({ mode: "edit", scholarshipType: s })}
                        onDelete={(s) => { setToDelete(s); setDeleteError(""); }}
                      />
                    ))
              }
            </motion.tbody>
          </table>
        </motion.div>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {modal && (
          <ScholarshipTypeModal
            key="scholarship-modal"
            scholarshipType={modal.mode === "edit" ? modal.scholarshipType : null}
            onClose={() => setModal(null)}
            onSaved={fetchScholarships}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toDelete && (
          <DeleteModal
            key="delete-modal"
            item={toDelete}
            onConfirm={handleDelete}
            onCancel={() => { setToDelete(null); setDeleteError(""); }}
            deleting={deleting}
            deleteError={deleteError}
          />
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
