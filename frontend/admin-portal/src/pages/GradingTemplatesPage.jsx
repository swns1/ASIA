import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import toast from "react-hot-toast";
import AppLayout from "../components/AppLayout";
import ConfirmModal from "../components/ConfirmModal";
import { useNavigate } from "react-router-dom";
import { listVariants, modalVariants, springTransition } from "../utils/motion";
import { getCurrentUser, hasAnyRole, ACADEMIC_STAFF } from "../utils/auth";

import {
  getGradingTemplates as _getTemplates,
  createGradingTemplate as _createTemplate,
  updateGradingTemplate as _updateTemplate,
  deleteGradingTemplate as _deleteTemplate,
  createGradingComponent as _createComponent,
  updateGradingComponent as _updateComponent,
  deleteGradingComponent as _deleteComponent,
} from "../api/enrollmentApi";

const getTemplates    = (p = {}) => _getTemplates(p);
const createTemplate  = (p)      => _createTemplate(p);
const updateTemplate  = (id, p)  => _updateTemplate(id, p);
const deleteTemplate  = (id)     => _deleteTemplate(id);
const createComponent = (p)      => _createComponent(p);
const updateComponent = (id, p)  => _updateComponent(id, p);
const deleteComponent = (id)     => _deleteComponent(id);

// ── Constants ─────────────────────────────────────────────────────────────────
const SCHOOL_LEVELS = [
  { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", color: "#be185d", bg: "#fde8f8" },
  { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          color: "#d97706", bg: "#fdf5e8" },
  { value: "elementary",        label: "Elementary",   icon: "ti-book",          color: "#2e6b0d", bg: "#e8f5e0" },
  { value: "junior_highschool", label: "Junior HS",    icon: "ti-school",        color: "#1455a0", bg: "#e3f0fd" },
  { value: "senior_highschool", label: "Senior HS",    icon: "ti-certificate",   color: "#7c3aed", bg: "#f0e8fd" },
];

const getLevelMeta = (level) => SCHOOL_LEVELS.find((l) => l.value === level) ?? SCHOOL_LEVELS[2];

const COMPONENT_COLORS = [
  "#e03131","#1455a0","#2e6b0d","#d97706","#7c3aed","#be185d","#0891b2",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcTotal(components) {
  return components?.reduce((s, c) => s + parseFloat(c.weight || 0), 0) ?? 0;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)",
    backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite",
  }} />
);

// ── AnimatedCount ─────────────────────────────────────────────────────────────
function AnimatedCount({ value, style }) {
  const mv = useMotionValue(value);
  const sp = useSpring(mv, { stiffness: 90, damping: 18 });
  const display = useTransform(sp, Math.round);
  const [shown, setShown] = useState(value);

  useEffect(() => { mv.set(value); }, [value, mv]);
  useEffect(() => display.on("change", setShown), [display]);

  return <span style={style}>{shown}</span>;
}

// ── Weight Bar ────────────────────────────────────────────────────────────────
function WeightBar({ components }) {
  if (!components || components.length === 0) return null;
  const total = calcTotal(components);
  return (
    <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", gap: 1 }}>
      {components.map((c, i) => (
        <div key={c.grading_component_id ?? i}
          style={{ flex: parseFloat(c.weight), background: COMPONENT_COLORS[i % COMPONENT_COLORS.length], minWidth: 2 }}
          title={`${c.component_name}: ${c.weight}%`}
        />
      ))}
      {total < 100 && (
        <div style={{ flex: 100 - total, background: "#f0e8e8", minWidth: 2 }} title="Unassigned" />
      )}
    </div>
  );
}

// ── Template Card ─────────────────────────────────────────────────────────────
function TemplateCard({ template, onEdit, onDelete, canManage }) {
  const lvl    = getLevelMeta(template.school_level);
  const total  = calcTotal(template.components);
  const totalOk = Math.abs(total - 100) < 0.01;

  return (
    <motion.div
      variants={listVariants.item}
      whileHover={{ y: -3, boxShadow: "0 10px 36px rgba(224,49,49,0.13)" }}
      transition={{ duration: 0.18 }}
      style={{
        background: "white", borderRadius: 16, border: "1px solid #f5eaea",
        boxShadow: "0 2px 16px rgba(224,49,49,0.05)", overflow: "hidden",
      }}
    >
      {/* Card header */}
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #f9f0f0" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: lvl.bg, color: lvl.color }}>
                <i className={`ti ${lvl.icon}`} style={{ fontSize: 11 }} />{lvl.label}
              </span>
              {!template.is_active && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, background: "#f0ede8", color: "#7a5050" }}>Inactive</span>
              )}
              {!totalOk && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, background: "#faeeda", color: "#854f0b" }}>Incomplete</span>
              )}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a0a0a", lineHeight: 1.3 }}>
              {template.template_name}
            </div>
            {template.description && (
              <div style={{ fontSize: 12, color: "#b09090", marginTop: 4, lineHeight: 1.5 }}>{template.description}</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <motion.button onClick={() => onEdit(template)} title="Edit"
              whileHover={{ scale: 1.08, backgroundColor: "#fff0f0", borderColor: "#fca5a5" }}
              whileTap={{ scale: 0.93 }}
              style={{ width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9a7070" }}>
              <i className="ti ti-pencil" style={{ fontSize: 13 }} />
            </motion.button>
            {canManage && (
              <motion.button onClick={() => onDelete(template)} title="Delete"
                whileHover={{ scale: 1.08, backgroundColor: "#fff0f0", borderColor: "#fca5a5" }}
                whileTap={{ scale: 0.93 }}
                style={{ width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090" }}>
                <i className="ti ti-trash" style={{ fontSize: 13 }} />
              </motion.button>
            )}
          </div>
        </div>

        {/* Weight bar */}
        <div style={{ marginTop: 12 }}>
          <WeightBar components={template.components} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <span style={{ fontSize: 11, color: "#b09090" }}>{template.components?.length ?? 0} components</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: totalOk ? "#2e6b0d" : "#a32d2d" }}>
              {total.toFixed(0)}% {totalOk ? "✓" : "⚠ not 100%"}
            </span>
          </div>
        </div>
      </div>

      {/* Components list */}
      <div style={{ padding: "10px 20px 14px" }}>
        {(!template.components || template.components.length === 0) ? (
          <div style={{ fontSize: 12, color: "#d0b8b8", fontStyle: "italic", textAlign: "center", padding: "8px 0" }}>
            No components defined yet
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {template.components.map((comp, i) => (
              <div key={comp.grading_component_id ?? i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: COMPONENT_COLORS[i % COMPONENT_COLORS.length], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: "#1a0a0a" }}>{comp.component_name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#7a5050", background: "#f9f4f4", padding: "2px 8px", borderRadius: 6 }}>{comp.weight}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Template Modal ────────────────────────────────────────────────────────────
function TemplateModal({ template, onClose, onRefresh }) {
  const isEdit = Boolean(template?.grading_template_id);

  const [form, setForm] = useState({
    template_name: template?.template_name ?? "",
    description:   template?.description  ?? "",
    school_level:  template?.school_level ?? "elementary",
    is_active:     template?.is_active    ?? true,
  });

  const [components, setComponents] = useState(
    template?.components?.map((c) => ({ ...c, _key: c.grading_component_id })) ?? []
  );

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const totalWeight = components.reduce((s, c) => s + (parseFloat(c.weight) || 0), 0);
  const weightOk    = Math.abs(totalWeight - 100) < 0.01;

  const addComponent = () => setComponents((arr) => [
    ...arr,
    { _key: Date.now(), component_name: "", weight: "", sort_order: arr.length, grading_component_id: null },
  ]);

  const removeComponent = (key) => setComponents((arr) => arr.filter((c) => c._key !== key));

  const updateComp = (key, field, val) =>
    setComponents((arr) => arr.map((c) => c._key === key ? { ...c, [field]: val } : c));

  const inp = {
    width: "100%", border: "1.5px solid #fde2de", borderRadius: 10,
    padding: "9px 12px", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
    color: "#1a0a0a", background: "#fffbfb", outline: "none", boxSizing: "border-box",
  };

  const handleSave = async () => {
    if (!form.template_name.trim()) { setError("Template name is required."); return; }
    if (components.length === 0)    { setError("Add at least one grading component."); return; }
    for (const c of components) {
      if (!c.component_name.trim()) { setError("All components need a name."); return; }
      if (!c.weight || parseFloat(c.weight) <= 0) { setError("All components need a weight > 0."); return; }
    }
    if (!weightOk) { setError(`Weights must sum to 100%. Current total: ${totalWeight.toFixed(1)}%`); return; }

    setSaving(true); setError("");
    try {
      let tplId = template?.grading_template_id;

      if (isEdit) {
        await updateTemplate(tplId, {
          template_name: form.template_name.trim(),
          description:   form.description.trim() || null,
          school_level:  form.school_level,
          is_active:     form.is_active,
        });
      } else {
        const created = await createTemplate({
          template_name: form.template_name.trim(),
          description:   form.description.trim() || null,
          school_level:  form.school_level,
          is_active:     form.is_active,
        });
        tplId = created.grading_template_id;
      }

      const existing  = components.filter((c) => c.grading_component_id);
      const brand_new = components.filter((c) => !c.grading_component_id);

      for (const c of existing) {
        await updateComponent(c.grading_component_id, {
          component_name: c.component_name.trim(),
          weight:         parseFloat(c.weight),
          sort_order:     components.indexOf(c),
        });
      }

      if (isEdit && template?.components) {
        const currentIds = new Set(existing.map((c) => c.grading_component_id));
        for (const orig of template.components) {
          if (!currentIds.has(orig.grading_component_id)) {
            await deleteComponent(orig.grading_component_id);
          }
        }
      }

      for (const c of brand_new) {
        await createComponent({
          grading_template: tplId,
          component_name:   c.component_name.trim(),
          weight:           parseFloat(c.weight),
          sort_order:       components.indexOf(c),
        });
      }

      toast.success(isEdit ? "Grading template updated." : "Grading template created.");
      onRefresh();
      onClose();
    } catch (e) {
      const msg = e.message || "Failed to save template.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
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
        style={{ background: "white", borderRadius: 20, width: 580, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(224,49,49,0.18)" }}
      >
        {/* Header */}
        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(to right, #fdfafa, white)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-report-analytics" style={{ fontSize: 20, color: "#e03131" }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a" }}>
                {isEdit ? "Edit Template" : "New Grading Template"}
              </div>
              <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>Define components and their weights</div>
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

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Template Name *</label>
            <input value={form.template_name} onChange={(e) => setForm((f) => ({ ...f, template_name: e.target.value }))} placeholder="e.g. DepEd K-12 Standard" style={inp} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description…" rows={2}
              style={{ ...inp, resize: "vertical" }} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>School Level *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SCHOOL_LEVELS.map((lvl) => {
                const active = form.school_level === lvl.value;
                return (
                  <button key={lvl.value} type="button" onClick={() => setForm((f) => ({ ...f, school_level: lvl.value }))}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px",
                      borderRadius: 99, border: `1.5px solid ${active ? lvl.color : "#f0e4e4"}`,
                      background: active ? lvl.bg : "white", color: active ? lvl.color : "#9a7070",
                      fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                      transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                    }}>
                    <i className={`ti ${lvl.icon}`} style={{ fontSize: 13 }} />{lvl.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, padding: "12px 14px", background: "#fdfafa", border: "1px solid #f5eaea", borderRadius: 10 }}>
            <input type="checkbox" id="is_active" checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              style={{ width: 15, height: 15, accentColor: "#e03131", cursor: "pointer" }} />
            <label htmlFor="is_active" style={{ fontSize: 13, color: "#1a0a0a", cursor: "pointer", fontWeight: 500 }}>
              Active — available for assignment to subjects
            </label>
          </div>

          {/* Components */}
          <div style={{ borderTop: "1px solid #f5eaea", paddingTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>Grading Components</div>
                <div style={{ fontSize: 11, color: "#b09090", marginTop: 2 }}>Weights must sum to exactly 100%</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: weightOk ? "#2e6b0d" : totalWeight > 0 ? "#a32d2d" : "#b09090" }}>
                  {totalWeight.toFixed(1)}% / 100%
                </span>
                <motion.button type="button" onClick={addComponent}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#fff0f0", color: "#e03131", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  <i className="ti ti-plus" style={{ fontSize: 13 }} />Add
                </motion.button>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ height: 6, borderRadius: 99, background: "#f0e8e8", overflow: "hidden", marginBottom: 16 }}>
              <motion.div
                animate={{ width: `${Math.min(totalWeight, 100)}%`, background: weightOk ? "#2e6b0d" : totalWeight > 100 ? "#a32d2d" : "#e03131" }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                style={{ height: "100%", borderRadius: 99 }}
              />
            </div>

            {components.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px 0", color: "#c0a0a0", fontSize: 13, fontStyle: "italic" }}>
                No components yet. Click "Add" to get started.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <AnimatePresence initial={false}>
                {components.map((comp, i) => (
                  <motion.div
                    key={comp._key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#fdfafa", border: "1px solid #f5eaea", borderRadius: 12, overflow: "hidden" }}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: COMPONENT_COLORS[i % COMPONENT_COLORS.length], flexShrink: 0 }} />
                    <input value={comp.component_name}
                      onChange={(e) => updateComp(comp._key, "component_name", e.target.value)}
                      placeholder="Component name (e.g. Written Work)"
                      style={{ ...inp, flex: 1, padding: "8px 12px" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <input type="number" min="0" max="100" step="0.5"
                        value={comp.weight}
                        onChange={(e) => updateComp(comp._key, "weight", e.target.value)}
                        placeholder="0"
                        style={{ ...inp, width: 70, padding: "8px 10px", textAlign: "right" }} />
                      <span style={{ fontSize: 12, color: "#b09090", fontWeight: 600 }}>%</span>
                    </div>
                    <motion.button onClick={() => removeComponent(comp._key)}
                      whileHover={{ scale: 1.08, backgroundColor: "#fff0f0" }}
                      whileTap={{ scale: 0.92 }}
                      style={{ width: 28, height: 28, border: "1px solid #f0e4e4", borderRadius: 7, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090", flexShrink: 0 }}>
                      <i className="ti ti-x" style={{ fontSize: 12 }} />
                    </motion.button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 28px 24px", display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #f5eaea" }}>
          <motion.button onClick={onClose}
            whileHover={{ borderColor: "#e03131", color: "#e03131" }}
            style={{ background: "transparent", color: "#9a7070", border: "1.5px solid #fde2de", borderRadius: 50, padding: "9px 22px", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
            Cancel
          </motion.button>
          <motion.button onClick={handleSave} disabled={saving}
            whileHover={!saving ? { scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" } : {}}
            whileTap={!saving ? { scale: 0.96 } : {}}
            style={{ background: saving ? "#e87474" : "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 50, padding: "9px 24px", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: saving ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
            {saving
              ? <><i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 1s linear infinite" }} />Saving…</>
              : <><i className="ti ti-check" style={{ fontSize: 13 }} />{isEdit ? "Update Template" : "Create Template"}</>
            }
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Delete Modal ──────────────────────────────────────────────────────────────
function DeleteModal({ template, onConfirm, onCancel, deleting, deleteError }) {
  return (
    <ConfirmModal
      icon="ti-trash"
      title="Delete template?"
      message={<>You're about to delete <strong style={{ color: "#1a0a0a" }}>{template.template_name}</strong>. Subjects using this template will lose their grading configuration.</>}
      error={deleteError}
      loading={deleting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function GradingTemplatesPage() {
  usePageTitle("Grading Templates");
  const navigate = useNavigate();
  const canManage = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);

  const [templates,   setTemplates]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter,setStatusFilter]= useState("all"); // all | active | inactive
  const [search,      setSearch]      = useState("");
  const [modal,       setModal]       = useState(null);
  const [toDelete,    setToDelete]    = useState(null);
  const [deleting,    setDeleting]    = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [animated] = useState(false);
  const isFirstRender = !animated;

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTemplates({});
      setTemplates(Array.isArray(data) ? data : data?.results ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchTemplates(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalCount      = templates.length;
  const activeCount     = templates.filter((t) => t.is_active).length;
  const completeCount   = templates.filter((t) => Math.abs(calcTotal(t.components) - 100) < 0.01).length;
  const incompleteCount = templates.filter((t) => Math.abs(calcTotal(t.components) - 100) >= 0.01).length;

  // ── Client-side filtered list ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = templates;
    if (levelFilter !== "all") list = list.filter((t) => t.school_level === levelFilter);
    if (statusFilter === "active")   list = list.filter((t) => t.is_active);
    if (statusFilter === "inactive") list = list.filter((t) => !t.is_active);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) =>
        t.template_name.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [templates, levelFilter, statusFilter, search]);

  const hasFilters = levelFilter !== "all" || statusFilter !== "all" || search.trim() !== "";

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteTemplate(toDelete.grading_template_id);
      toast.success("Grading template deleted.");
      setToDelete(null);
      fetchTemplates();
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

  const STATS = [
    { label: "Total Templates", value: totalCount,      icon: "ti-report-analytics",       color: "#e03131", bg: "#fff0f0" },
    { label: "Active",          value: activeCount,     icon: "ti-circle-check",            color: "#2e6b0d", bg: "#e8f5e0" },
    { label: "Complete",        value: completeCount,   icon: "ti-rosette-discount-check",  color: "#1455a0", bg: "#e3f0fd" },
    { label: "Incomplete",      value: incompleteCount, icon: "ti-alert-triangle",          color: "#854f0b", bg: "#faeeda" },
  ];

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
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.01em" }}>Grading Templates</div>
          <div style={{ fontSize: 11.5, color: "#b09090", marginTop: 1 }}>
            {loading ? "Loading…" : `${totalCount} templates · ${activeCount} active · ${completeCount} complete`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <motion.button
            whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }}
            whileTap={{ scale: 0.96 }}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}
            onClick={() => setModal({ mode: "create" })}>
            <i className="ti ti-plus" style={{ fontSize: 15 }} />New Template
          </motion.button>
        </div>
      </motion.div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
          {STATS.map((s, idx) => (
            <motion.div
              key={s.label}
              initial={isFirstRender ? { y: 10, opacity: 0 } : false}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.28, delay: 0.06 + idx * 0.06, ease: "easeOut" }}
              style={{ background: "white", borderRadius: 14, padding: "16px 20px", border: "1px solid #f5eaea", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 12px rgba(224,49,49,0.06)" }}
            >
              <div style={{ width: 42, height: 42, borderRadius: 12, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <i className={`ti ${s.icon}`} style={{ fontSize: 18, color: s.color }} />
              </div>
              <div>
                {loading
                  ? <Sk w={40} h={20} r={4} />
                  : <AnimatedCount value={s.value} style={{ fontSize: 22, fontWeight: 700, color: "#1a0a0a", lineHeight: 1 }} />
                }
                <div style={{ fontSize: 11, color: "#a07878", marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Filter panel */}
        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.18, ease: "easeOut" }}
          style={{ background: "white", borderRadius: 14, padding: "16px 20px", border: "1px solid #f5eaea", boxShadow: "0 2px 12px rgba(224,49,49,0.05)", display: "flex", flexDirection: "column", gap: 12 }}
        >
          {/* Search — full width row */}
          <div className="search-wrap" style={{ display: "flex", alignItems: "center", gap: 10, background: "white", border: "1.5px solid #f0e4e4", borderRadius: 12, padding: "0 14px", height: 38, width: "100%", boxSizing: "border-box", transition: "border .15s, box-shadow .15s" }}>
            <i className="ti ti-search" style={{ fontSize: 14, color: "#c0a0a0", flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
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

          {/* Level chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 2 }}>Level</span>
            {[{ value: "all", label: "All", color: "#e03131", bg: "#fff0f0" }, ...SCHOOL_LEVELS].map((lvl, idx) => {
              const active = levelFilter === lvl.value;
              return (
                <motion.button
                  key={lvl.value}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: idx * 0.03 }}
                  onClick={() => setLevelFilter(lvl.value)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    height: 32, padding: "0 14px", borderRadius: 99,
                    border: `1.5px solid ${active ? lvl.color : "#f0e4e4"}`,
                    background: active ? lvl.bg : "white",
                    color: active ? lvl.color : "#9a7070",
                    fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer",
                    fontFamily: "'DM Sans',sans-serif",
                    transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                  }}
                >
                  {lvl.icon && <i className={`ti ${lvl.icon}`} style={{ fontSize: 12 }} />}
                  {lvl.label}
                </motion.button>
              );
            })}
          </div>

          {/* Status chips */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#c0a0a0", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 2 }}>Status</span>
            {[
              { value: "all",      label: "All",      color: "#e03131", bg: "#fff0f0" },
              { value: "active",   label: "Active",   color: "#2e6b0d", bg: "#e8f5e0" },
              { value: "inactive", label: "Inactive", color: "#7a5050", bg: "#f0ede8" },
            ].map((s) => {
              const active = statusFilter === s.value;
              return (
                <motion.button
                  key={s.value}
                  onClick={() => setStatusFilter(s.value)}
                  style={{
                    height: 32, padding: "0 14px", borderRadius: 99,
                    border: `1.5px solid ${active ? s.color : "#f0e4e4"}`,
                    background: active ? s.bg : "white",
                    color: active ? s.color : "#9a7070",
                    fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer",
                    fontFamily: "'DM Sans',sans-serif",
                    transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                  }}
                >
                  {s.label}
                </motion.button>
              );
            })}
          </div>

          {/* Clear all */}
          <AnimatePresence>
            {hasFilters && (
              <motion.button
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.16 }}
                onClick={() => { setLevelFilter("all"); setStatusFilter("all"); setSearch(""); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 99, border: "1.5px solid #fde2de", background: "white", color: "#e03131", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                <i className="ti ti-x" style={{ fontSize: 11 }} />Clear
              </motion.button>
            )}
          </AnimatePresence>
          </div>{/* end chips row */}
        </motion.div>

        {/* Cards grid */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ background: "white", borderRadius: 16, border: "1px solid #f5eaea", padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>
                <Sk w={100} h={20} /><Sk w="80%" h={14} /><Sk w="60%" h={8} r={99} />
                <div style={{ height: 1, background: "#f5eaea" }} />
                <Sk w={120} h={13} /><Sk w={140} h={13} />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: "white", borderRadius: 16, border: "1px solid #f5eaea", padding: "64px 24px", textAlign: "center" }}
          >
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#fff0f0,#fde8e8)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              <i className="ti ti-report-analytics" style={{ fontSize: 22, color: "#e08080" }} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#7a5050" }}>
              {hasFilters ? "No templates match your filters" : "No templates found"}
            </div>
            <div style={{ fontSize: 12, color: "#b09090", marginTop: 6 }}>
              {hasFilters
                ? "Try adjusting your search or filters"
                : "Create your first grading template to get started"}
            </div>
            {!hasFilters && (
              <motion.button
                whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setModal({ mode: "create" })}
                style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
                <i className="ti ti-plus" style={{ fontSize: 14 }} />Create Template
              </motion.button>
            )}
          </motion.div>
        ) : (
          <motion.div
            variants={listVariants.container}
            initial={isFirstRender ? "hidden" : false}
            animate="visible"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}
          >
            {filtered.map((tpl) => (
              <TemplateCard key={tpl.grading_template_id} template={tpl}
                onEdit={(t) => setModal({ mode: "edit", template: t })}
                onDelete={(t) => { setToDelete(t); setDeleteError(""); }}
                canManage={canManage} />
            ))}
          </motion.div>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {modal && (
          <TemplateModal
            key="template-modal"
            template={modal.mode === "edit" ? modal.template : null}
            onClose={() => setModal(null)}
            onRefresh={fetchTemplates}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toDelete && (
          <DeleteModal
            key="delete-modal"
            template={toDelete}
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
