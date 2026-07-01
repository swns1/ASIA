import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import AppLayout from "../components/AppLayout";
import { useNavigate } from "react-router-dom";
import { listVariants, modalVariants, springTransition } from "../utils/motion";

import {
  getFeeSchedules as _getFeeSchedules,
  createFeeSchedule as _createFeeSchedule,
  createFeeScheduleItem as _createItem,
  updateFeeScheduleItem as _updateItem,
  deleteFeeScheduleItem as _deleteItem,
  recalculateFeeSchedule as _recalculateSchedule,
} from "../api/billingApi";

const getFeeSchedules     = (p = {}) => _getFeeSchedules(p);
const createFeeSchedule   = (p)      => _createFeeSchedule(p);
const createItem          = (p)      => _createItem(p);
const updateItem          = (id, p)  => _updateItem(id, p);
const deleteItem          = (id)     => _deleteItem(id);
const recalculateSchedule = (id)     => _recalculateSchedule(id);

// ── Constants ─────────────────────────────────────────────────────────────────
const SCHOOL_LEVELS = [
  { value: "nursery",           label: "Nursery",      color: "#be185d", bg: "#fde8f8", icon: "ti-baby-carriage",
    grades: ["Nursery"] },
  { value: "kindergarten",      label: "Kindergarten", color: "#d97706", bg: "#fdf5e8", icon: "ti-star",
    grades: ["Junior Kinder", "Senior Kinder"] },
  { value: "elementary",        label: "Elementary",   color: "#2e6b0d", bg: "#e8f5e0", icon: "ti-book",
    grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"] },
  { value: "junior_highschool", label: "Junior HS",    color: "#1455a0", bg: "#e3f0fd", icon: "ti-school",
    grades: ["Grade 7", "Grade 8", "Grade 9", "Grade 10"] },
  { value: "senior_highschool", label: "Senior HS",    color: "#7c3aed", bg: "#f0e8fd", icon: "ti-certificate",
    grades: ["Grade 11", "Grade 12"] },
];

const CATEGORY_META = {
  tuition: { label: "Tuition",       color: "#e03131", bg: "#fff0f0", icon: "ti-school" },
  misc:    { label: "Miscellaneous",  color: "#1455a0", bg: "#e3f0fd", icon: "ti-clipboard-list" },
  other:   { label: "Other",          color: "#2e6b0d", bg: "#e8f5e0", icon: "ti-dots-circle-horizontal" },
};

const fmt = (n) => `₱${parseFloat(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
);

// ── AnimatedAmount ────────────────────────────────────────────────────────────
function AnimatedAmount({ value, style }) {
  const mv = useMotionValue(value);
  const sp = useSpring(mv, { stiffness: 70, damping: 18 });
  const display = useTransform(sp, (v) =>
    `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  const [shown, setShown] = useState(fmt(value));

  useEffect(() => { mv.set(value); }, [value, mv]);
  useEffect(() => display.on("change", setShown), [display]);

  return <span style={style}>{shown}</span>;
}

// ── New Fee Schedule Modal ────────────────────────────────────────────────────
function NewScheduleModal({ onClose, onSaved }) {
  const [schoolLevel, setSchoolLevel] = useState("elementary");
  const [gradeLevel,  setGradeLevel]  = useState("Grade 1");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");

  const lvl = SCHOOL_LEVELS.find((l) => l.value === schoolLevel) ?? SCHOOL_LEVELS[2];

  const handleCreate = async () => {
    setSaving(true); setError("");
    try {
      const created = await createFeeSchedule({ school_level: schoolLevel, grade_level: gradeLevel, is_active: true });
      onSaved(created);
      onClose();
    } catch (e) {
      setError(e.message || "Failed to create. This level/grade may already exist.");
    } finally { setSaving(false); }
  };

  const inp = { width: "100%", border: "1.5px solid #fde2de", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none", boxSizing: "border-box", cursor: "pointer" };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}
    >
      <motion.div
        variants={modalVariants} initial="hidden" animate="visible" exit="exit"
        transition={springTransition}
        style={{ background: "white", borderRadius: 20, width: 420, boxShadow: "0 24px 64px rgba(224,49,49,0.18)", overflow: "hidden" }}
      >
        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(to right,#fdfafa,white)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-cash" style={{ fontSize: 20, color: "#e03131" }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a0a0a" }}>New Fee Schedule</div>
              <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>Select a level and grade to create a fee structure</div>
            </div>
          </div>
          <motion.button onClick={onClose} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", fontSize: 20, display: "flex", alignItems: "center" }}>
            <i className="ti ti-x" />
          </motion.button>
        </div>

        <div style={{ padding: "22px 28px" }}>
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}
              >
                <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{error}
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>School Level</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SCHOOL_LEVELS.map((lv) => {
                const active = schoolLevel === lv.value;
                return (
                  <button key={lv.value} type="button"
                    onClick={() => { setSchoolLevel(lv.value); setGradeLevel(lv.grades[0]); }}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px",
                      borderRadius: 99, border: `1.5px solid ${active ? lv.color : "#f0e4e4"}`,
                      background: active ? lv.bg : "white", color: active ? lv.color : "#9a7070",
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif",
                      transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                    }}>
                    <i className={`ti ${lv.icon}`} style={{ fontSize: 12 }} />{lv.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 6 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Grade Level</label>
            <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} style={inp}>
              {lvl.grades.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>

        <div style={{ padding: "16px 28px 24px", display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #f5eaea" }}>
          <motion.button onClick={onClose}
            whileHover={{ borderColor: "#e03131", color: "#e03131" }}
            style={{ background: "transparent", color: "#9a7070", border: "1.5px solid #fde2de", borderRadius: 50, padding: "9px 22px", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", cursor: "pointer" }}>
            Cancel
          </motion.button>
          <motion.button onClick={handleCreate} disabled={saving}
            whileHover={!saving ? { scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" } : {}}
            whileTap={!saving ? { scale: 0.96 } : {}}
            style={{ background: saving ? "#e87474" : "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 50, padding: "9px 24px", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", cursor: saving ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
            {saving
              ? <><i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 1s linear infinite" }} />Creating…</>
              : <><i className="ti ti-plus" style={{ fontSize: 13 }} />Create</>
            }
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Fee Item Row ──────────────────────────────────────────────────────────────
function FeeItemRow({ item, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [name,    setName]    = useState(item.item_name);
  const [amount,  setAmount]  = useState(String(item.amount));
  const [saving,  setSaving]  = useState(false);

  const catMeta = CATEGORY_META[item.item_category] ?? CATEGORY_META.other;
  const inp = { border: "1.5px solid #fde2de", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none" };

  const handleSave = async () => {
    if (!name.trim() || !amount || parseFloat(amount) < 0) return;
    setSaving(true);
    await updateItem(item.fee_schedule_item_id, { item_name: name.trim(), amount: parseFloat(amount) });
    setEditing(false); setSaving(false);
    onUpdated();
  };

  const handleDelete = async () => {
    await deleteItem(item.fee_schedule_item_id);
    onDeleted();
  };

  return (
    <motion.div
      variants={listVariants.item}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#fdfafa", border: "1px solid #f5eaea", borderRadius: 10 }}
      whileHover={{ borderColor: "#fca5a5" }}
      transition={{ duration: 0.12 }}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: catMeta.color, flexShrink: 0 }} />
      {editing ? (
        <>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name"
            style={{ ...inp, flex: 1, minWidth: 0 }} />
          <div style={{ position: "relative", width: 120, flexShrink: 0 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#b09090", fontWeight: 600 }}>₱</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              style={{ ...inp, width: "100%", paddingLeft: 22, textAlign: "right" }} />
          </div>
          <motion.button onClick={handleSave} disabled={saving}
            whileHover={!saving ? { scale: 1.06 } : {}} whileTap={!saving ? { scale: 0.94 } : {}}
            style={{ background: "#e03131", color: "white", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
            {saving
              ? <i className="ti ti-loader-2" style={{ fontSize: 12, animation: "spin 1s linear infinite" }} />
              : <i className="ti ti-check" style={{ fontSize: 12 }} />
            }
          </motion.button>
          <motion.button onClick={() => { setEditing(false); setName(item.item_name); setAmount(String(item.amount)); }}
            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
            style={{ background: "white", color: "#9a7070", border: "1px solid #f0e4e4", borderRadius: 7, padding: "6px 10px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center" }}>
            <i className="ti ti-x" style={{ fontSize: 12 }} />
          </motion.button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontSize: 13, color: "#1a0a0a", fontWeight: 500 }}>{item.item_name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>{fmt(item.amount)}</span>
          <motion.button onClick={() => setEditing(true)}
            whileHover={{ scale: 1.08, backgroundColor: "#fff0f0", borderColor: "#fca5a5" }}
            whileTap={{ scale: 0.93 }}
            style={{ width: 26, height: 26, border: "1px solid #f0e4e4", borderRadius: 7, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9a7070" }}>
            <i className="ti ti-pencil" style={{ fontSize: 11 }} />
          </motion.button>
          <motion.button onClick={handleDelete}
            whileHover={{ scale: 1.08, backgroundColor: "#fff0f0", borderColor: "#fca5a5" }}
            whileTap={{ scale: 0.93 }}
            style={{ width: 26, height: 26, border: "1px solid #f0e4e4", borderRadius: 7, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090" }}>
            <i className="ti ti-trash" style={{ fontSize: 11 }} />
          </motion.button>
        </>
      )}
    </motion.div>
  );
}

// ── Add Fee Item Form ─────────────────────────────────────────────────────────
function AddFeeItemForm({ scheduleId, category, onAdded }) {
  const [name,   setName]   = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const catMeta = CATEGORY_META[category];
  const inp = { border: "1.5px solid #fde2de", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none" };

  const handleAdd = async () => {
    if (!name.trim())                      { setError("Name required."); return; }
    if (!amount || parseFloat(amount) < 0) { setError("Amount required."); return; }
    setSaving(true); setError("");
    try {
      await createItem({ fee_schedule: scheduleId, item_category: category, item_name: name.trim(), amount: parseFloat(amount) });
      setName(""); setAmount("");
      onAdded();
    } catch (e) { setError(e.message || "Failed to add."); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            style={{ fontSize: 11, color: "#b91c1c", marginBottom: 6 }}
          >{error}</motion.div>
        )}
      </AnimatePresence>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: catMeta.color, flexShrink: 0, opacity: 0.4 }} />
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder={`e.g. ${category === "tuition" ? "Tuition Fee" : category === "misc" ? "Books" : "Morning Binder"}`}
          style={{ ...inp, flex: 1, minWidth: 0 }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        <div style={{ position: "relative", width: 120, flexShrink: 0 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#b09090", fontWeight: 600 }}>₱</span>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00" style={{ ...inp, width: "100%", paddingLeft: 22, textAlign: "right" }}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        </div>
        <motion.button onClick={handleAdd} disabled={saving}
          whileHover={!saving ? { scale: 1.04 } : {}} whileTap={!saving ? { scale: 0.96 } : {}}
          style={{ background: saving ? "#e87474" : "#fff0f0", color: "#e03131", border: "1px solid #fca5a5", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
          {saving
            ? <i className="ti ti-loader-2" style={{ fontSize: 12, animation: "spin 1s linear infinite" }} />
            : <i className="ti ti-plus" style={{ fontSize: 12 }} />
          }Add
        </motion.button>
      </div>
    </div>
  );
}

// ── Schedule Detail Panel ─────────────────────────────────────────────────────
function ScheduleDetail({ schedule, onUpdated }) {
  const lvl = SCHOOL_LEVELS.find((l) => l.value === schedule.school_level) ?? SCHOOL_LEVELS[2];
  const [recalcing, setRecalcing] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState("");

  const categories = ["tuition", "misc", "other"];

  const handleRecalculate = async () => {
    setRecalcing(true); setRecalcMsg("");
    try {
      const result = await recalculateSchedule(schedule.fee_schedule_id);
      setRecalcMsg(`${result.updated} invoice${result.updated !== 1 ? "s" : ""} updated`);
      setTimeout(() => setRecalcMsg(""), 4000);
    } catch { setRecalcMsg("Recalculation failed."); }
    finally { setRecalcing(false); }
  };

  const tuitionTotal = schedule.total_tuition ?? 0;
  const miscTotal    = schedule.total_misc    ?? 0;
  const otherTotal   = schedule.total_other   ?? 0;
  const grandTotal   = schedule.grand_total   ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        style={{ background: "white", borderRadius: 16, border: "1px solid #f5eaea", padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, boxShadow: "0 2px 12px rgba(224,49,49,0.05)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: lvl.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className={`ti ${lvl.icon}`} style={{ fontSize: 20, color: lvl.color }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a" }}>{schedule.grade_level}</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: lvl.bg, color: lvl.color, marginTop: 3 }}>
              <i className={`ti ${lvl.icon}`} style={{ fontSize: 11 }} />{lvl.label}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AnimatePresence>
            {recalcMsg && (
              <motion.span
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.18 }}
                style={{ fontSize: 12, color: "#2e6b0d", fontWeight: 600, background: "#e8f5e0", border: "1px solid #a3d98a", borderRadius: 99, padding: "4px 12px", display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <i className="ti ti-circle-check" style={{ fontSize: 12 }} />{recalcMsg}
              </motion.span>
            )}
          </AnimatePresence>
          <motion.button onClick={handleRecalculate} disabled={recalcing}
            whileHover={!recalcing ? { scale: 1.02 } : {}} whileTap={!recalcing ? { scale: 0.97 } : {}}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff0f0", color: "#e03131", border: "1px solid #fca5a5", borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: recalcing ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif" }}>
            {recalcing
              ? <i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 1s linear infinite" }} />
              : <i className="ti ti-refresh" style={{ fontSize: 13 }} />
            }
            {recalcing ? "Updating…" : "Apply to Invoices"}
          </motion.button>
        </div>
      </motion.div>

      {/* Totals summary */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.06, ease: "easeOut" }}
        style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}
      >
        {[
          { label: "Tuition",       val: tuitionTotal, color: "#e03131", bg: "#fff0f0" },
          { label: "Miscellaneous", val: miscTotal,    color: "#1455a0", bg: "#e3f0fd" },
          { label: "Other",         val: otherTotal,   color: "#2e6b0d", bg: "#e8f5e0" },
          { label: "Grand Total",   val: grandTotal,   color: "#7c3aed", bg: "#f0e8fd" },
        ].map((s) => (
          <div key={s.label} style={{ background: "white", borderRadius: 12, border: "1px solid #f5eaea", padding: "14px 16px", textAlign: "center", boxShadow: "0 2px 8px rgba(224,49,49,0.04)" }}>
            <AnimatedAmount value={parseFloat(s.val)} style={{ fontSize: 15, fontWeight: 700, color: s.color }} />
            <div style={{ fontSize: 11, color: "#a07878", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Category sections */}
      {categories.map((cat, catIdx) => {
        const catMeta  = CATEGORY_META[cat];
        const catItems = (schedule.items ?? []).filter((i) => i.item_category === cat);
        return (
          <motion.div
            key={cat}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: 0.1 + catIdx * 0.06, ease: "easeOut" }}
            style={{ background: "white", borderRadius: 16, border: "1px solid #f5eaea", overflow: "hidden", boxShadow: "0 2px 12px rgba(224,49,49,0.05)" }}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #f9f0f0", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(to right,#fdfafa,white)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: catMeta.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className={`ti ${catMeta.icon}`} style={{ fontSize: 14, color: catMeta.color }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>{catMeta.label}</span>
                <span style={{ fontSize: 11, color: "#b09090" }}>{catItems.length} item{catItems.length !== 1 ? "s" : ""}</span>
                {cat !== "tuition"
                  ? <span style={{ fontSize: 11, color: "#b09090", fontStyle: "italic" }}>· no discount applied</span>
                  : <span style={{ fontSize: 11, color: "#e03131", fontStyle: "italic" }}>· discounts applied here</span>
                }
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: catMeta.color }}>
                {fmt(catItems.reduce((s, i) => s + parseFloat(i.amount), 0))}
              </span>
            </div>
            <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
              {catItems.length === 0 && (
                <div style={{ fontSize: 12, color: "#d0b8b8", fontStyle: "italic", textAlign: "center", padding: "8px 0" }}>No items yet</div>
              )}
              <motion.div
                variants={listVariants.container}
                initial="hidden" animate="visible"
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                {catItems.map((item) => (
                  <FeeItemRow key={item.fee_schedule_item_id} item={item}
                    onUpdated={onUpdated} onDeleted={onUpdated} />
                ))}
              </motion.div>
              <AddFeeItemForm scheduleId={schedule.fee_schedule_id} category={cat} onAdded={onUpdated} />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function FeeSchedulesPage() {
  const navigate = useNavigate();
  const [schedules,    setSchedules]    = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [levelFilter,  setLevelFilter]  = useState("all");
  const [showNewModal, setShowNewModal] = useState(false);

  const [animated] = useState(false);
  const isFirstRender = !animated;

  const fetchSchedules = useCallback(async (lvl = levelFilter) => {
    setLoading(true);
    try {
      const params = {};
      if (lvl !== "all") params.school_level = lvl;
      const data = await getFeeSchedules(params);
      const results = Array.isArray(data) ? data : data?.results ?? [];
      setSchedules(results);
      if (selected) {
        const refreshed = results.find((s) => s.fee_schedule_id === selected.fee_schedule_id);
        setSelected(refreshed ?? null);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [levelFilter, selected]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchSchedules("all"); // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectSchedule = (sch) => setSelected(sch);
  const handleUpdated = () => fetchSchedules(levelFilter);

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
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.01em" }}>Fee Schedules</div>
          <div style={{ fontSize: 11.5, color: "#b09090", marginTop: 1 }}>
            {loading ? "Loading…" : `${schedules.length} schedule${schedules.length !== 1 ? "s" : ""} configured`}
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.02, boxShadow: "0 6px 20px rgba(224,49,49,0.35)" }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setShowNewModal(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
          <i className="ti ti-plus" style={{ fontSize: 15 }} />New Schedule
        </motion.button>
      </motion.div>

      {/* ── Master / Detail ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "300px 1fr" }}>

        {/* ── Left: schedule list ── */}
        <motion.div
          initial={isFirstRender ? { opacity: 0, x: -12 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.26, ease: "easeOut" }}
          style={{ borderRight: "1px solid #f5eaea", display: "flex", flexDirection: "column", overflow: "hidden", background: "white" }}
        >
          {/* Level filter */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f5eaea", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, color: "#c0a0a0", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>Filter by Level</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {[{ value: "all", label: "All", color: "#e03131", bg: "#fff0f0", icon: null }, ...SCHOOL_LEVELS].map((lv) => {
                const active = levelFilter === lv.value;
                return (
                  <motion.button
                    key={lv.value}
                    onClick={() => { setLevelFilter(lv.value); fetchSchedules(lv.value); }}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      height: 26, padding: "0 10px", borderRadius: 99,
                      border: `1.5px solid ${active ? lv.color : "#f0e4e4"}`,
                      background: active ? lv.bg : "white",
                      color: active ? lv.color : "#9a7070",
                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif",
                      transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                    }}
                  >
                    {lv.icon && <i className={`ti ${lv.icon}`} style={{ fontSize: 11 }} />}
                    {lv.label}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Schedule list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ padding: "14px 16px", borderBottom: "1px solid #f9f0f0", display: "flex", flexDirection: "column", gap: 8 }}>
                    <Sk w={120} h={14} /><Sk w={80} h={11} /><Sk w="100%" h={6} r={99} />
                  </div>
                ))
              : schedules.length === 0
                ? (
                  <div style={{ padding: "40px 16px", textAlign: "center", color: "#b09090", fontSize: 13 }}>
                    <i className="ti ti-cash" style={{ fontSize: 28, color: "#f0c8c8", display: "block", marginBottom: 10 }} />
                    No fee schedules yet.<br />
                    <span style={{ fontSize: 12 }}>Click "New Schedule" to create one.</span>
                  </div>
                )
                : (
                  <motion.div
                    variants={listVariants.container}
                    initial={isFirstRender ? "hidden" : false}
                    animate="visible"
                  >
                    {schedules.map((sch) => {
                      const lv       = SCHOOL_LEVELS.find((l) => l.value === sch.school_level) ?? SCHOOL_LEVELS[2];
                      const isActive = selected?.fee_schedule_id === sch.fee_schedule_id;
                      const grandTotal = parseFloat(sch.grand_total ?? 0);
                      const itemCount  = (sch.items ?? []).length;

                      // Mini composition bar
                      const tTotal = parseFloat(sch.total_tuition ?? 0);
                      const mTotal = parseFloat(sch.total_misc ?? 0);
                      const oTotal = parseFloat(sch.total_other ?? 0);
                      const barTotal = tTotal + mTotal + oTotal || 1;

                      return (
                        <motion.div
                          key={sch.fee_schedule_id}
                          variants={listVariants.item}
                          onClick={() => handleSelectSchedule(sch)}
                          whileHover={{ backgroundColor: isActive ? lv.bg : "#fffaf9" }}
                          style={{
                            padding: "14px 16px", borderBottom: "1px solid #f9f0f0",
                            borderLeft: `3px solid ${isActive ? lv.color : "transparent"}`,
                            background: isActive ? lv.bg : "white",
                            cursor: "pointer",
                            transition: "border-left-color 0.15s ease, background-color 0.15s ease",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <i className={`ti ${lv.icon}`} style={{ fontSize: 13, color: lv.color }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>{sch.grade_level}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 6px", borderRadius: 99, background: lv.bg, color: lv.color }}>{lv.label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#b09090", marginBottom: 5 }}>{itemCount} item{itemCount !== 1 ? "s" : ""}</div>
                          {/* Mini composition bar */}
                          {grandTotal > 0 && (
                            <div style={{ display: "flex", height: 4, borderRadius: 99, overflow: "hidden", gap: 1, marginBottom: 5 }}>
                              {tTotal > 0 && <div style={{ flex: tTotal / barTotal, background: "#e03131", minWidth: 2 }} title={`Tuition: ${fmt(tTotal)}`} />}
                              {mTotal > 0 && <div style={{ flex: mTotal / barTotal, background: "#1455a0", minWidth: 2 }} title={`Misc: ${fmt(mTotal)}`} />}
                              {oTotal > 0 && <div style={{ flex: oTotal / barTotal, background: "#2e6b0d", minWidth: 2 }} title={`Other: ${fmt(oTotal)}`} />}
                            </div>
                          )}
                          <div style={{ fontSize: 14, fontWeight: 700, color: lv.color }}>{fmt(grandTotal)}</div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )
            }
          </div>
        </motion.div>

        {/* ── Right: detail panel ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <AnimatePresence mode="wait">
            {!selected ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14 }}
              >
                <div style={{ width: 60, height: 60, borderRadius: 18, background: "linear-gradient(135deg,#fff0f0,#fde8e8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className="ti ti-cash" style={{ fontSize: 28, color: "#e08080" }} />
                </div>
                <div style={{ fontSize: 16, color: "#7a5050", fontWeight: 600 }}>Select a fee schedule</div>
                <div style={{ fontSize: 13, color: "#b09090" }}>Click a schedule on the left to view and edit its items</div>
              </motion.div>
            ) : (
              <motion.div
                key={selected.fee_schedule_id}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <ScheduleDetail schedule={selected} onUpdated={handleUpdated} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Modal ── */}
      <AnimatePresence>
        {showNewModal && (
          <NewScheduleModal
            key="new-modal"
            onClose={() => setShowNewModal(false)}
            onSaved={(s) => { fetchSchedules(levelFilter); setSelected(s); }}
          />
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
