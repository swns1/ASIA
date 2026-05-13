import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getVisibleNavGroups } from "../utils/navigation";
import { clearAuthSession } from "../utils/auth";

// ── API ───────────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:8003/api";

function getToken() { return sessionStorage.getItem("access_token") || ""; }

async function apiCall(method, url, body = null) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
  const opts = { method, headers };
  if (body && method !== "GET") opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) { const e = await res.text(); throw new Error(`${res.status}: ${e}`); }
  if (method === "DELETE") return null;
  return res.json();
}

const getTemplates        = (p = {}) => apiCall("GET",    `${API_BASE}/grading-templates/?${new URLSearchParams(p)}`);
const createTemplate      = (p)      => apiCall("POST",   `${API_BASE}/grading-templates/`, p);
const updateTemplate      = (id, p)  => apiCall("PATCH",  `${API_BASE}/grading-templates/${id}/`, p);
const deleteTemplate      = (id)     => apiCall("DELETE", `${API_BASE}/grading-templates/${id}/`);
const createComponent     = (p)      => apiCall("POST",   `${API_BASE}/grading-components/`, p);
const updateComponent     = (id, p)  => apiCall("PATCH",  `${API_BASE}/grading-components/${id}/`, p);
const deleteComponent     = (id)     => apiCall("DELETE", `${API_BASE}/grading-components/${id}/`);

// ── NAV ───────────────────────────────────────────────────────────────────────
const NAV = [
  { section: "Main", items: [
    { label: "Dashboard",   icon: "ti-layout-dashboard", path: "/dashboard"          },
    { label: "Students",    icon: "ti-users",             path: "/students"           },
    { label: "Enrollments", icon: "ti-clipboard-list",    path: "/enrollments"        },
    { label: "Subjects",    icon: "ti-book",              path: "/subjects"           },
    { label: "Grades",      icon: "ti-chart-bar",         path: "/grades"             },
  ]},
  { section: "Finance", items: [
    { label: "Invoices",     icon: "ti-receipt",  path: "/invoices"     },
    { label: "Payments",     icon: "ti-cash",     path: "/payments"     },
    { label: "Scholarships", icon: "ti-discount", path: "/scholarships" },
  ]},
  { section: "Settings", items: [
    { label: "Users",             icon: "ti-user-cog",     path: "/users"              },
    { label: "School Settings",   icon: "ti-settings",     path: "/settings"           },
    { label: "Grading Templates", icon: "ti-report-analytics", path: "/grading-templates" },
    { label: "Scholarship Types", icon: "ti-discount",         path: "/scholarship-types" },
    { label: "Fee Schedules",     icon: "ti-cash",             path: "/fee-schedules"     },
  ]},
];

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

// ── Skeleton ──────────────────────────────────────────────────────────────────
const Sk = ({ w = "100%", h = 14, r = 6 }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)",
    backgroundSize: "200% 100%", animation: "shimmer 1.6s ease-in-out infinite",
  }} />
);

// ── Weight bar ────────────────────────────────────────────────────────────────
function WeightBar({ components }) {
  if (!components || components.length === 0) return null;
  const total = components.reduce((s, c) => s + parseFloat(c.weight), 0);
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
function TemplateCard({ template, onEdit, onDelete }) {
  const lvl = getLevelMeta(template.school_level);
  const total = template.components?.reduce((s, c) => s + parseFloat(c.weight), 0) ?? 0;
  const totalOk = Math.abs(total - 100) < 0.01;

  return (
    <div style={{
      background: "white", borderRadius: 16, border: "1px solid #f5eaea",
      boxShadow: "0 2px 16px rgba(224,49,49,0.05)", overflow: "hidden",
      animation: "fadeUp 0.25s ease both", transition: "box-shadow 0.16s, transform 0.16s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 32px rgba(224,49,49,0.12)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 16px rgba(224,49,49,0.05)"; e.currentTarget.style.transform = ""; }}
    >
      {/* Card header */}
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #f9f0f0" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: lvl.bg, color: lvl.color }}>
                <i className={`ti ${lvl.icon}`} style={{ fontSize: 11 }} />{lvl.label}
              </span>
              {!template.is_active && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, background: "#f0ede8", color: "#7a5050" }}>Inactive</span>
              )}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a0a0a", fontFamily: "'Playfair Display', serif", lineHeight: 1.3 }}>
              {template.template_name}
            </div>
            {template.description && (
              <div style={{ fontSize: 12, color: "#b09090", marginTop: 4, lineHeight: 1.5 }}>{template.description}</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button onClick={() => onEdit(template)} title="Edit"
              style={{ width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9a7070", transition: "all 0.12s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#fff0f0"; e.currentTarget.style.color = "#e03131"; e.currentTarget.style.borderColor = "#fca5a5"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.color = "#9a7070"; e.currentTarget.style.borderColor = "#f0e4e4"; }}>
              <i className="ti ti-pencil" style={{ fontSize: 13 }} />
            </button>
            <button onClick={() => onDelete(template)} title="Delete"
              style={{ width: 30, height: 30, border: "1px solid #f0e4e4", borderRadius: 8, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090", transition: "all 0.12s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#fff0f0"; e.currentTarget.style.color = "#e03131"; e.currentTarget.style.borderColor = "#fca5a5"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.color = "#c09090"; e.currentTarget.style.borderColor = "#f0e4e4"; }}>
              <i className="ti ti-trash" style={{ fontSize: 13 }} />
            </button>
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
    </div>
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

  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

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

      // Sync components
      const existing = components.filter((c) => c.grading_component_id);
      const brand_new = components.filter((c) => !c.grading_component_id);

      // Update existing
      for (const c of existing) {
        await updateComponent(c.grading_component_id, {
          component_name: c.component_name.trim(),
          weight:         parseFloat(c.weight),
          sort_order:     components.indexOf(c),
        });
      }

      // Delete removed components (ones that were in original but not in current)
      if (isEdit && template?.components) {
        const currentIds = new Set(existing.map((c) => c.grading_component_id));
        for (const orig of template.components) {
          if (!currentIds.has(orig.grading_component_id)) {
            await deleteComponent(orig.grading_component_id);
          }
        }
      }

      // Create new
      for (const c of brand_new) {
        await createComponent({
          grading_template: tplId,
          component_name:   c.component_name.trim(),
          weight:           parseFloat(c.weight),
          sort_order:       components.indexOf(c),
        });
      }

      onRefresh();
      onClose();
    } catch (e) {
      setError(e.message || "Failed to save template.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)", animation: "fadeIn 0.15s ease" }}>
      <div style={{ background: "white", borderRadius: 20, width: 580, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(224,49,49,0.18)", animation: "slideUp 0.2s ease" }}>

        {/* Header */}
        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #f5eaea", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(to right, #fdfafa, white)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-report-analytics" style={{ fontSize: 18, color: "#e03131" }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a0a0a", fontFamily: "'Playfair Display', serif" }}>
                {isEdit ? "Edit Template" : "New Grading Template"}
              </div>
              <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>Define components and their weights</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#c0a0a0", fontSize: 20, display: "flex", alignItems: "center" }}>
            <i className="ti ti-x" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "22px 28px" }}>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 14 }} />{error}
            </div>
          )}

          {/* Template info */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Template Name *</label>
            <input value={form.template_name} onChange={(e) => setForm((f) => ({ ...f, template_name: e.target.value }))} placeholder="e.g. DepEd K-12 Standard" style={inp} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description…" rows={2}
              style={{ ...inp, resize: "vertical" }} />
          </div>

          {/* School level */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>School Level *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SCHOOL_LEVELS.map((lvl) => {
                const active = form.school_level === lvl.value;
                return (
                  <button key={lvl.value} type="button" onClick={() => setForm((f) => ({ ...f, school_level: lvl.value }))}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 99, border: `1.5px solid ${active ? lvl.color : "#f0e4e4"}`, background: active ? lvl.bg : "white", color: active ? lvl.color : "#9a7070", fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all .15s" }}>
                    <i className={`ti ${lvl.icon}`} style={{ fontSize: 13 }} />{lvl.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active toggle */}
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
                <button type="button" onClick={addComponent}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#fff0f0", color: "#e03131", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  <i className="ti ti-plus" style={{ fontSize: 13 }} />Add
                </button>
              </div>
            </div>

            {/* Weight progress bar */}
            <div style={{ height: 6, borderRadius: 99, background: "#f0e8e8", overflow: "hidden", marginBottom: 16 }}>
              <div style={{ height: "100%", width: `${Math.min(totalWeight, 100)}%`, borderRadius: 99, background: weightOk ? "#2e6b0d" : totalWeight > 100 ? "#a32d2d" : "#e03131", transition: "width 0.3s, background 0.3s" }} />
            </div>

            {components.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px 0", color: "#c0a0a0", fontSize: 13, fontStyle: "italic" }}>
                No components yet. Click "Add" to get started.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {components.map((comp, i) => (
                <div key={comp._key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#fdfafa", border: "1px solid #f5eaea", borderRadius: 12 }}>
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
                  <button onClick={() => removeComponent(comp._key)}
                    style={{ width: 28, height: 28, border: "1px solid #f0e4e4", borderRadius: 7, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#c09090", flexShrink: 0, transition: "all 0.12s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#fff0f0"; e.currentTarget.style.color = "#e03131"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.color = "#c09090"; }}>
                    <i className="ti ti-x" style={{ fontSize: 12 }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 28px 24px", display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #f5eaea" }}>
          <button onClick={onClose} style={{ background: "transparent", color: "#9a7070", border: "1.5px solid #fde2de", borderRadius: 50, padding: "9px 22px", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ background: saving ? "#e87474" : "linear-gradient(135deg,#e03131,#c92a2a)", color: "white", border: "none", borderRadius: 50, padding: "9px 24px", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", cursor: saving ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(224,49,49,0.26)" }}>
            {saving
              ? <><i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 1s linear infinite" }} />Saving…</>
              : <><i className="ti ti-check" style={{ fontSize: 13 }} />{isEdit ? "Update Template" : "Create Template"}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Modal ──────────────────────────────────────────────────────────────
function DeleteModal({ template, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,10,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "white", borderRadius: 20, padding: "32px 36px", width: 400, boxShadow: "0 24px 64px rgba(224,49,49,0.18)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, animation: "slideUp 0.2s ease" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className="ti ti-trash" style={{ fontSize: 24, color: "#e03131" }} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1a0a0a", fontFamily: "'Playfair Display', serif" }}>Delete Template?</div>
        <div style={{ fontSize: 13, color: "#7a5050", textAlign: "center", lineHeight: 1.7 }}>
          You're about to delete <strong style={{ color: "#1a0a0a" }}>{template.template_name}</strong>. Subjects using this template will lose their grading configuration.
        </div>
        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
          <button onClick={onCancel} style={{ flex: 1, height: 42, border: "1.5px solid #f0e0e0", borderRadius: 10, background: "white", fontSize: 13, color: "#7a5050", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, height: 42, border: "none", borderRadius: 10, background: "linear-gradient(135deg,#e03131,#c92a2a)", fontSize: 13, color: "white", cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 4px 16px rgba(224,49,49,0.3)" }}>Yes, delete</button>
        </div>
      </div>
    </div>
  );
}

function LogoutModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,10,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"white", borderRadius:20, padding:"32px 36px", width:380, boxShadow:"0 24px 64px rgba(224,49,49,0.18)", display:"flex", flexDirection:"column", alignItems:"center", gap:14, animation:"slideUp 0.2s ease" }}>
        <div style={{ width:56, height:56, borderRadius:14, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <i className="ti ti-logout" style={{ fontSize:24, color:"#e03131" }} />
        </div>
        <div style={{ fontSize:17, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif" }}>Log out?</div>
        <div style={{ fontSize:13, color:"#7a5050", textAlign:"center", lineHeight:1.7 }}>
          You'll be returned to the login page. Any unsaved changes will be lost.
        </div>
        <div style={{ display:"flex", gap:10, width:"100%", marginTop:4 }}>
          <button onClick={onCancel} style={{ flex:1, height:42, border:"1.5px solid #f0e0e0", borderRadius:10, background:"white", fontSize:13, color:"#7a5050", cursor:"pointer", fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
            Stay
          </button>
          <button onClick={onConfirm} style={{ flex:1, height:42, border:"none", borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", fontSize:13, color:"white", cursor:"pointer", fontWeight:700, fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.3)" }}>
            Yes, logout
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function GradingTemplatesPage() {
  const navigate = useNavigate();

  const [templates,   setTemplates]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [levelFilter, setLevelFilter] = useState("all");
  const [modal,       setModal]       = useState(null);
  const [toDelete,    setToDelete]    = useState(null);

  const [showLogout, setShowLogout] = useState(false);

  const fetchTemplates = useCallback(async (level = levelFilter) => {
    setLoading(true);
    try {
      const params = {};
      if (level !== "all") params.school_level = level;
      const data = await getTemplates(params);
      setTemplates(Array.isArray(data) ? data : data?.results ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [levelFilter]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchTemplates("all");
  }, []);

  const handleDelete = async () => {
    if (!toDelete) return;
    await deleteTemplate(toDelete.grading_template_id);
    setToDelete(null);
    fetchTemplates(levelFilter);
  };

  const activeCount   = templates.filter((t) => t.is_active).length;
  const completeCount = templates.filter((t) => {
    const total = t.components?.reduce((s, c) => s + parseFloat(c.weight), 0) ?? 0;
    return Math.abs(total - 100) < 0.01;
  }).length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-thumb { background:#f0dada; border-radius:99px; }
        .nav-item { transition:background 0.12s,color 0.12s; }
        .nav-item:hover { background:#fff4f4 !important; color:#e03131 !important; }
        .nav-active { background:#fff0f0 !important; color:#e03131 !important; font-weight:600 !important; }
        .chip-btn { display:flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:99px;border:1.5px solid #f0e4e4;background:white;font-size:12px;color:#9a7070;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;transition:all 0.14s; }
        .chip-btn:hover { border-color:#fca5a5;color:#e03131;background:#fff8f6; }
        .chip-btn.active { background:#fff0f0;border-color:#e03131;color:#e03131;font-weight:700; }
        .new-btn { transition:all 0.16s !important; }
        .new-btn:hover { background:#c92a2a !important;box-shadow:0 8px 28px rgba(224,49,49,0.32) !important;transform:translateY(-1px); }
      `}</style>

      <div style={{ display:"flex", height:"100vh", background:"#fdf8f6", fontFamily:"'DM Sans',sans-serif", overflow:"hidden" }}>

        {/* ── Sidebar ── */}
        <aside style={{ width:224, flexShrink:0, background:"white", borderRight:"1px solid #f5eaea", display:"flex", flexDirection:"column", boxShadow:"2px 0 12px rgba(224,49,49,0.04)" }}>
          <div style={{ padding:"22px 18px 18px", borderBottom:"1px solid #f5eaea" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#e03131,#c92a2a)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 12px rgba(224,49,49,0.3)" }}>
                <i className="ti ti-school" style={{ fontSize:17, color:"white" }} />
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:"#1a0a0a" }}>South Lakes IS</div>
                <div style={{ fontSize:11, color:"#b09090", marginTop:1 }}>Admin Portal</div>
              </div>
            </div>
          </div>
          <nav style={{ flex:1, padding:"14px 10px", display:"flex", flexDirection:"column", gap:2, overflowY:"auto" }}>
            {getVisibleNavGroups(NAV).map((group) => (
              <div key={group.section} style={{ marginBottom:6 }}>
                <div style={{ fontSize:9.5, color:"#cdb0b0", letterSpacing:"0.1em", textTransform:"uppercase", padding:"10px 10px 4px", fontWeight:600 }}>{group.section}</div>
                {group.items.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <div key={item.path} className={`nav-item${active?" nav-active":""}`}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:9, fontSize:13, color:active?"#e03131":"#7a5a5a", cursor:"pointer" }}
                      onClick={() => navigate(item.path)} role="button" tabIndex={0}
                      onKeyDown={(e) => e.key==="Enter" && navigate(item.path)}>
                      <i className={`ti ${item.icon}`} style={{ fontSize:16, width:20, textAlign:"center" }} />
                      {item.label}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>
            <div style={{ padding:"14px 10px", borderTop:"1px solid #f5eaea" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px", borderRadius:10, background:"#fff8f6" }}>
                <div style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#fde8e8,#fca5a5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#e03131", flexShrink:0 }}>SA</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1a0a0a" }}>Super Admin</div>
                  <div style={{ fontSize:11, color:"#b09090" }}>super_admin</div>
                </div>
                <button
                  title="Logout"
                  onClick={() => setShowLogout(true)}
                  style={{
                    width:30, height:30, border:"1px solid #f0e4e4", borderRadius:8,
                    background:"white", display:"flex", alignItems:"center", justifyContent:"center",
                    cursor:"pointer", color:"#c09090", transition:"all 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background="#fff0f0"; e.currentTarget.style.color="#e03131"; e.currentTarget.style.borderColor="#fca5a5"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background="white"; e.currentTarget.style.color="#c09090"; e.currentTarget.style.borderColor="#f0e4e4"; }}
                >
                  <i className="ti ti-logout" style={{ fontSize:14 }} />
                </button>
              </div>
            </div>
        </aside>

        {/* ── Main ── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Topbar */}
          <div style={{ background:"white", borderBottom:"1px solid #f5eaea", padding:"0 28px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, boxShadow:"0 1px 8px rgba(224,49,49,0.04)" }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#1a0a0a", fontFamily:"'Playfair Display',serif", letterSpacing:"-0.01em" }}>Grading Templates</div>
              <div style={{ fontSize:11.5, color:"#b09090", marginTop:1 }}>
                {loading ? "Loading…" : `${templates.length} templates · ${activeCount} active · ${completeCount} complete`}
              </div>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <button style={{ width:36, height:36, border:"1px solid #f5eaea", borderRadius:10, background:"white", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#9a7070", position:"relative" }}>
                <i className="ti ti-bell" style={{ fontSize:16 }} />
                <span style={{ width:8, height:8, background:"#e03131", borderRadius:"50%", position:"absolute", top:6, right:6, border:"2px solid white" }} />
              </button>
              <button className="new-btn"
                style={{ display:"flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}
                onClick={() => setModal({ mode:"create" })}>
                <i className="ti ti-plus" style={{ fontSize:15 }} />New Template
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Stat cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:12 }}>
              {[
                { label:"Total Templates", value:templates.length,  icon:"ti-report-analytics", color:"#e03131", bg:"#fff0f0" },
                { label:"Active",          value:activeCount,        icon:"ti-circle-check",     color:"#2e6b0d", bg:"#e8f5e0" },
                { label:"Complete (100%)", value:completeCount,      icon:"ti-rosette-discount-check", color:"#1455a0", bg:"#e3f0fd" },
              ].map((s) => (
                <div key={s.label} style={{ background:"white", borderRadius:14, padding:"16px 20px", border:"1px solid #f5eaea", display:"flex", alignItems:"center", gap:14, boxShadow:"0 2px 12px rgba(224,49,49,0.06)" }}>
                  <div style={{ width:42, height:42, borderRadius:12, background:s.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <i className={`ti ${s.icon}`} style={{ fontSize:18, color:s.color }} />
                  </div>
                  <div>
                    {loading ? <Sk w={40} h={20} r={4} /> : <div style={{ fontSize:22, fontWeight:700, color:"#1a0a0a", lineHeight:1 }}>{s.value}</div>}
                    <div style={{ fontSize:11, color:"#a07878", marginTop:4, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.06em" }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Level filter chips */}
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              <button className={`chip-btn${levelFilter==="all"?" active":""}`} onClick={() => { setLevelFilter("all"); fetchTemplates("all"); }}>
                All Levels
              </button>
              {SCHOOL_LEVELS.map((lvl) => (
                <button key={lvl.value} className={`chip-btn${levelFilter===lvl.value?" active":""}`}
                  onClick={() => { setLevelFilter(lvl.value); fetchTemplates(lvl.value); }}
                  style={{ borderColor:levelFilter===lvl.value?lvl.color:"#f0e4e4", color:levelFilter===lvl.value?lvl.color:"#9a7070", background:levelFilter===lvl.value?lvl.bg:"white" }}>
                  <i className={`ti ${lvl.icon}`} style={{ fontSize:12 }} />{lvl.label}
                </button>
              ))}
            </div>

            {/* Cards grid */}
            {loading ? (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:16 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"20px", display:"flex", flexDirection:"column", gap:12 }}>
                    <Sk w={100} h={20} /><Sk w="80%" h={14} /><Sk w="60%" h={8} r={99} />
                    <Sk w="100%" h={1} /><Sk w={120} h={13} /><Sk w={140} h={13} />
                  </div>
                ))}
              </div>
            ) : templates.length === 0 ? (
              <div style={{ background:"white", borderRadius:16, border:"1px solid #f5eaea", padding:"64px 24px", textAlign:"center" }}>
                <div style={{ width:56, height:56, borderRadius:16, background:"#fff0f0", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}>
                  <i className="ti ti-report-analytics" style={{ fontSize:24, color:"#e08080" }} />
                </div>
                <div style={{ fontSize:15, color:"#7a5050", fontWeight:600, fontFamily:"'Playfair Display',serif" }}>No templates found</div>
                <div style={{ fontSize:12, color:"#b09090", marginTop:6 }}>Create your first grading template to get started</div>
                <button onClick={() => setModal({ mode:"create" })}
                  style={{ marginTop:18, display:"inline-flex", alignItems:"center", gap:8, background:"linear-gradient(135deg,#e03131,#c92a2a)", color:"white", border:"none", borderRadius:10, padding:"10px 20px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", boxShadow:"0 4px 16px rgba(224,49,49,0.26)" }}>
                  <i className="ti ti-plus" style={{ fontSize:14 }} />Create Template
                </button>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:16 }}>
                {templates.map((tpl) => (
                  <TemplateCard key={tpl.grading_template_id} template={tpl}
                    onEdit={(t) => setModal({ mode:"edit", template: t })}
                    onDelete={(t) => setToDelete(t)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal && (
        <TemplateModal
          template={modal.mode === "edit" ? modal.template : null}
          onClose={() => setModal(null)}
          onRefresh={() => fetchTemplates(levelFilter)}
        />
      )}
      {toDelete && (
        <DeleteModal template={toDelete} onConfirm={handleDelete} onCancel={() => setToDelete(null)} />
      )}

      {showLogout && (
        <LogoutModal
          onConfirm={() => {
            clearAuthSession();
            navigate("/");
          }}
          onCancel={() => setShowLogout(false)}
        />
      )}
    </>
  );
}
