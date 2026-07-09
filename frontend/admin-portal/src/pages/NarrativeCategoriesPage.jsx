import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import AppLayout from "../components/AppLayout";

import {
  getNarrativeCategories as _getCategories,
  createNarrativeCategory as _createCategory,
  updateNarrativeCategory as _updateCategory,
  deleteNarrativeCategory as _deleteCategory,
} from "../api/enrollmentApi";

const getCategories  = (p = {}) => _getCategories(p);
const createCategory = (p)      => _createCategory(p);
const updateCategory = (id, p)  => _updateCategory(id, p);
const deleteCategory = (id)     => _deleteCategory(id);

const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite" }} />
);

function CategoryRow({ cat, onUpdated, onDeleted }) {
  const [editing,  setEditing]  = useState(false);
  const [name,     setName]     = useState(cat.name);
  const [desc,     setDesc]     = useState(cat.description ?? "");
  const [order,    setOrder]    = useState(String(cat.sort_order));
  const [active,   setActive]   = useState(cat.is_active);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirm,  setConfirm]  = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const updated = await updateCategory(cat.category_id, {
        name: name.trim(), description: desc.trim() || null,
        sort_order: parseInt(order) || 0, is_active: active,
      });
      toast.success("Category updated.");
      onUpdated(updated); setEditing(false);
    } catch { toast.error("Failed to save category."); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async () => {
    setSaving(true);
    try {
      const updated = await updateCategory(cat.category_id, { is_active: !active });
      setActive(updated.is_active); onUpdated(updated);
    } catch { toast.error("Failed to update category."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCategory(cat.category_id);
      toast.success("Category deleted.");
      onDeleted(cat.category_id);
    }
    catch { toast.error("Failed to delete category."); }
    finally { setDeleting(false); setConfirm(false); }
  };

  const inp = { border: "1.5px solid #fde2de", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none" };

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
      style={{ background: "white", borderRadius: 12, border: "1px solid #f5eaea", overflow: "hidden", boxShadow: "0 1px 6px rgba(224,49,49,0.05)" }}>
      {editing ? (
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" style={{ ...inp, flex: 1 }} />
            <input type="number" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="Sort order" style={{ ...inp, width: 90, textAlign: "right" }} />
          </div>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" style={{ ...inp, width: "100%" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#7a5050", cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ accentColor: "#7c3aed" }} />Active
            </label>
            <div style={{ flex: 1 }} />
            <button onClick={() => { setEditing(false); setName(cat.name); setDesc(cat.description ?? ""); setOrder(String(cat.sort_order)); setActive(cat.is_active); }}
              style={{ height: 32, padding: "0 12px", border: "1px solid #f0e4e4", borderRadius: 8, background: "white", fontSize: 12, color: "#9a7070", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !name.trim()}
              style={{ height: 32, padding: "0 14px", border: "none", borderRadius: 8, background: saving ? "#c97474" : "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 5 }}>
              {saving ? <i className="ti ti-loader-2" style={{ fontSize: 12, animation: "spin 1s linear infinite" }} /> : <i className="ti ti-check" style={{ fontSize: 12 }} />}Save
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: active ? "#f0e8fd" : "#f5f0f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-clipboard-text" style={{ fontSize: 16, color: active ? "#7c3aed" : "#c0a0a0" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: active ? "#1a0a0a" : "#9a8080" }}>{cat.name}</div>
            {cat.description && <div style={{ fontSize: 11, color: "#b09090", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.description}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: active ? "#f0e8fd" : "#f5f0f0", color: active ? "#7c3aed" : "#9a8080" }}>{active ? "Active" : "Inactive"}</span>
            <span style={{ fontSize: 11, color: "#c0a0a0", background: "#fdfafa", border: "1px solid #f5eaea", padding: "2px 8px", borderRadius: 6 }}>#{cat.sort_order}</span>
            <button onClick={handleToggleActive} disabled={saving}
              style={{ height: 28, padding: "0 10px", border: "1px solid #f0e4e4", borderRadius: 7, background: "white", fontSize: 11, color: "#9a7070", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>
              {active ? "Deactivate" : "Activate"}
            </button>
            <button onClick={() => setEditing(true)}
              style={{ width: 28, height: 28, border: "1px solid #f0e4e4", borderRadius: 7, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9a7070" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#fff0f0"; e.currentTarget.style.color = "#e03131"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.color = "#9a7070"; }}>
              <i className="ti ti-pencil" style={{ fontSize: 12 }} />
            </button>
            {confirm ? (
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={handleDelete} disabled={deleting}
                  style={{ height: 28, padding: "0 10px", border: "none", borderRadius: 7, background: "#e03131", color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 4 }}>
                  {deleting && <i className="ti ti-loader-2" style={{ fontSize: 11, animation: "spin 1s linear infinite" }} />}Confirm
                </button>
                <button onClick={() => setConfirm(false)}
                  style={{ height: 28, padding: "0 8px", border: "1px solid #f0e4e4", borderRadius: 7, background: "white", fontSize: 11, color: "#9a7070", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirm(true)}
                style={{ width: 28, height: 28, border: "1px solid #f0e4e4", borderRadius: 7, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#fff0f0"; e.currentTarget.style.color = "#e03131"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.color = "#c09090"; }}>
                <i className="ti ti-trash" style={{ fontSize: 12 }} />
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function NarrativeCategoriesPage() {
  usePageTitle("Narrative Categories");
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [adding,     setAdding]     = useState(false);
  const [newName,    setNewName]    = useState("");
  const [newDesc,    setNewDesc]    = useState("");
  const [newOrder,   setNewOrder]   = useState("");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");

  useEffect(() => {
    setLoading(true);
    getCategories({ page_size: 200 })
      .then((d) => setCategories(Array.isArray(d) ? d : d?.results ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    if (!newName.trim()) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      const created = await createCategory({ name: newName.trim(), description: newDesc.trim() || null, sort_order: parseInt(newOrder) || 0, is_active: true });
      toast.success("Category created.");
      setCategories((prev) => [...prev, created]);
      setNewName(""); setNewDesc(""); setNewOrder(""); setAdding(false);
    } catch {
      setError("Failed to create category.");
      toast.error("Failed to create category.");
    }
    finally { setSaving(false); }
  };

  const inp = { border: "1.5px solid #fde2de", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "'DM Sans',sans-serif", color: "#1a0a0a", background: "#fffbfb", outline: "none" };
  const activeCount   = categories.filter((c) => c.is_active).length;
  const inactiveCount = categories.filter((c) => !c.is_active).length;

  return (
    <AppLayout>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes spin    { to{transform:rotate(360deg)} }
      `}</style>
      <div style={{ background: "white", borderBottom: "1px solid #f5eaea", padding: "0 28px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 8px rgba(124,58,237,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <i className="ti ti-clipboard-text" style={{ fontSize: 16, color: "#7c3aed" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1a0a0a" }}>Narrative Categories</span>
        </div>
        <motion.button onClick={() => { setAdding(true); setNewName(""); setNewDesc(""); setNewOrder(""); setError(""); }}
          whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.97 }} transition={{ duration: 0.12 }}
          style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 16px", border: "none", borderRadius: 10, background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", boxShadow: "0 4px 14px rgba(124,58,237,0.28)" }}>
          <i className="ti ti-plus" style={{ fontSize: 14 }} />Add Category
        </motion.button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1a0a0a", letterSpacing: "-0.01em" }}>Narrative Categories</div>
          <div style={{ fontSize: 13, color: "#b09090", marginTop: 4 }}>Configure the behavioral and learning categories used in student narrative reports.</div>
        </div>

        {!loading && categories.length > 0 && (
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { label: "Total",    value: categories.length, color: "#7c3aed", bg: "#f0e8fd", icon: "ti-list" },
              { label: "Active",   value: activeCount,       color: "#2e6b0d", bg: "#e8f5e0", icon: "ti-circle-check" },
              { label: "Inactive", value: inactiveCount,     color: "#854f0b", bg: "#faeeda", icon: "ti-circle-x" },
            ].map((s) => (
              <div key={s.label} style={{ background: "white", borderRadius: 12, border: "1px solid #f5eaea", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 2px 8px rgba(124,58,237,0.04)" }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize: 16, color: s.color }} />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#1a0a0a", lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "#a07878", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <AnimatePresence>
          {adding && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}
              style={{ background: "white", borderRadius: 14, border: "2px solid #c4b5fd", padding: "18px 20px", boxShadow: "0 4px 20px rgba(124,58,237,0.12)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed", display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-plus" style={{ fontSize: 13 }} />New Category
              </div>
              {error && <div style={{ fontSize: 11, color: "#b91c1c" }}>{error}</div>}
              <div style={{ display: "flex", gap: 10 }}>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Category name (e.g., Attentive in Class)"
                  style={{ ...inp, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && handleAdd()} autoFocus />
                <input type="number" value={newOrder} onChange={(e) => setNewOrder(e.target.value)} placeholder="Sort order"
                  style={{ ...inp, width: 100, textAlign: "right" }} />
              </div>
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)"
                style={{ ...inp, width: "100%" }} onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => { setAdding(false); setError(""); }}
                  style={{ height: 34, padding: "0 14px", border: "1px solid #f0e4e4", borderRadius: 8, background: "white", fontSize: 12, color: "#9a7070", cursor: "pointer", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>Cancel</button>
                <button onClick={handleAdd} disabled={saving || !newName.trim()}
                  style={{ height: 34, padding: "0 16px", border: "none", borderRadius: 8, background: saving ? "#9b72e8" : "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "white", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 5 }}>
                  {saving ? <i className="ti ti-loader-2" style={{ fontSize: 12, animation: "spin 1s linear infinite" }} /> : <i className="ti ti-check" style={{ fontSize: 12 }} />}Add Category
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div layout style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {loading ? (
            [1,2,3,4].map((i) => (
              <div key={i} style={{ background: "white", borderRadius: 12, border: "1px solid #f5eaea", padding: "14px 18px", display: "flex", gap: 12, alignItems: "center" }}>
                <Sk w={36} h={36} r={10} /><div style={{ flex: 1 }}><Sk w="40%" h={14} /><div style={{ marginTop: 6 }}><Sk w="25%" h={11} /></div></div>
              </div>
            ))
          ) : categories.length === 0 ? (
            <div style={{ background: "white", borderRadius: 14, border: "1px solid #f5eaea", padding: "60px 24px", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "#f0e8fd", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <i className="ti ti-clipboard-text" style={{ fontSize: 24, color: "#7c3aed" }} />
              </div>
              <div style={{ fontSize: 15, color: "#5a4a7a", fontWeight: 600 }}>No categories yet</div>
              <div style={{ fontSize: 13, color: "#b09090", marginTop: 6 }}>Click "Add Category" to get started.</div>
            </div>
          ) : (
            <AnimatePresence>
              {categories.map((cat) => (
                <CategoryRow key={cat.category_id} cat={cat}
                  onUpdated={(updated) => setCategories((prev) => prev.map((c) => c.category_id === updated.category_id ? updated : c))}
                  onDeleted={(id) => setCategories((prev) => prev.filter((c) => c.category_id !== id))}
                />
              ))}
            </AnimatePresence>
          )}
        </motion.div>
      </div>
    </AppLayout>
  );
}