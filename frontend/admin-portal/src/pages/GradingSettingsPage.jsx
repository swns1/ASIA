import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Tabs from "../components/ui/Tabs";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";
import Card from "../components/ui/Card";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import StatusBand from "../components/ui/StatusBand";
import FilterMenu from "../components/ui/FilterMenu";
import SearchField from "../components/ui/SearchField";
import ErrorState from "../components/ui/ErrorState";
import EmptyState from "../components/EmptyState";
import { StatusDot } from "../components/ui/Badge";
import { LEVEL_DOTS, LEVEL_FILTER_OPTIONS, LEVEL_LABELS } from "../constants/schoolLevels";
import { COMPONENT_COLORS } from "./grades/gradeRules";
import { getCurrentUser, hasAnyRole, ACADEMIC_STAFF } from "../utils/auth";

import {
  getGradingTemplates as _getTemplates,
  createGradingTemplate as _createTemplate,
  updateGradingTemplate as _updateTemplate,
  deleteGradingTemplate as _deleteTemplate,
  createGradingComponent as _createComponent,
  updateGradingComponent as _updateComponent,
  deleteGradingComponent as _deleteComponent,
  getNarrativeCategories as _getCategories,
  createNarrativeCategory as _createCategory,
  updateNarrativeCategory as _updateCategory,
  deleteNarrativeCategory as _deleteCategory,
} from "../api/enrollmentApi";

const getTemplates    = (p = {}) => _getTemplates(p);
const createTemplate  = (p)      => _createTemplate(p);
const updateTemplate  = (id, p)  => _updateTemplate(id, p);
const deleteTemplate  = (id)     => _deleteTemplate(id);
const createComponent = (p)      => _createComponent(p);
const updateComponent = (id, p)  => _updateComponent(id, p);
const deleteComponent = (id)     => _deleteComponent(id);

const getCategories  = (p = {}) => _getCategories(p);
const createCategory = (p)      => _createCategory(p);
const updateCategory = (id, p)  => _updateCategory(id, p);
const deleteCategory = (id)     => _deleteCategory(id);

// ── Shared constants ─────────────────────────────────────────────────────────
const TABS = [
  { id: "templates", label: "Grading Templates",   icon: "ti-report-analytics" },
  { id: "narrative", label: "Narrative Categories", icon: "ti-clipboard-text"  },
];

/** Whether something is in use, for the active/inactive band and rows. */
const ACTIVE_STATUS_MAP = {
  active:   { label: "Active",   variant: "success" },
  inactive: { label: "Inactive", variant: "muted" },
};

const clearButtonClass =
  "focus-ring flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-error-600 transition-colors duration-150 hover:bg-brand-100";

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE — the tab switcher. Each tab is self-contained (own state,
// effects, handlers) and draws the page header itself, so its New button
// sits there beside the tabs, as on every other list page.
// ════════════════════════════════════════════════════════════════════════════
export default function GradingSettingsPage() {
  usePageTitle("Grading Setup");
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") === "narrative" ? "narrative" : "templates");

  const header = (action) => (
    <PageHeader
      title="Grading Setup"
      actions={<><Tabs variant="pill" tabs={TABS} value={tab} onChange={setTab} />{action}</>}
    />
  );

  return tab === "templates"
    ? <GradingTemplatesTab key="templates" header={header} />
    : <NarrativeCategoriesTab key="narrative" header={header} />;
}

// ════════════════════════════════════════════════════════════════════════════
// GRADING TEMPLATES TAB
// ════════════════════════════════════════════════════════════════════════════

// The template form's level choices, in the app's level colours. `chip` is
// spelled out rather than interpolated: Tailwind extracts class names
// statically, so `bg-${tone}-50` would never ship.
const SCHOOL_LEVELS = [
  { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", chip: "bg-nursery-50 text-nursery-500" },
  { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          chip: "bg-kindergarten-50 text-kindergarten-500" },
  { value: "elementary",        label: "Elementary",   icon: "ti-book",          chip: "bg-elementary-50 text-elementary-500" },
  { value: "junior_highschool", label: "Junior HS",    icon: "ti-school",        chip: "bg-juniorhigh-50 text-juniorhigh-500" },
  { value: "senior_highschool", label: "Senior HS",    icon: "ti-certificate",   chip: "bg-seniorhigh-50 text-seniorhigh-500" },
];

function calcTotal(components) {
  return components?.reduce((s, c) => s + parseFloat(c.weight || 0), 0) ?? 0;
}

const weightsComplete = (template) => Math.abs(calcTotal(template.components) - 100) < 0.01;

// The band's legend. A template whose weights don't add up to 100 works a
// grade out wrong; an inactive one can't be given to a subject.
const TEMPLATE_STATUS_MAP = {
  ready:      { label: "Ready",            variant: "success", title: "Ready templates" },
  incomplete: { label: "Weights not 100%", variant: "warning", title: "Templates whose weights don't add up to 100%" },
  inactive:   { label: "Inactive",         variant: "muted",   title: "Inactive templates" },
};
const templateStatus = (t) => (!t.is_active ? "inactive" : weightsComplete(t) ? "ready" : "incomplete");

const TEMPLATE_COLUMNS = [
  { key: "name",       label: "Template",   width: "26%" },
  { key: "level",      label: "Level",      width: "14%" },
  { key: "components", label: "Components", width: "32%" },
  { key: "weights",    label: "Weights",    width: "9%", align: "right" },
  { key: "status",     label: "Status",     width: "12%" },
  { key: "actions",    label: "",           width: "7%" },
];

/** A template's components as one bar, each its share of the grade. */
function WeightBar({ components }) {
  if (!components?.length) return null;
  const total = calcTotal(components);
  return (
    <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
      {components.map((c, i) => (
        <span
          key={c.grading_component_id ?? i}
          style={{ flexGrow: parseFloat(c.weight), flexBasis: 0, minWidth: 2, background: COMPONENT_COLORS[i % COMPONENT_COLORS.length] }}
        />
      ))}
      {total < 100 && <span style={{ flexGrow: 100 - total, flexBasis: 0 }} />}
    </div>
  );
}

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
    <Modal
      onClose={onClose}
      size="md"
      showClose
      loading={saving}
      className="text-left"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} icon="ti-check">
            {saving ? "Saving…" : isEdit ? "Update Template" : "Create Template"}
          </Button>
        </div>
      }
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
          <i className="ti ti-report-analytics text-xl" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-md font-bold text-neutral-900">
            {isEdit ? "Edit Template" : "New Grading Template"}
          </h2>
          <p className="text-[11px] text-neutral-500">Define components and their weights</p>
        </div>
      </div>

      <AnimatePresence>
            {error && <Alert key="tpl-error" variant="error" className="mb-4">{error}</Alert>}
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
                  <button key={lvl.value} type="button" aria-pressed={active}
                    onClick={() => setForm((f) => ({ ...f, school_level: lvl.value }))}
                    className={`focus-ring inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-[7px] text-[12px] transition-colors duration-150 ${
                      active
                        ? `${lvl.chip} border-current font-bold`
                        : "border-neutral-200 bg-white font-medium text-neutral-600 hover:border-neutral-300"
                    }`}>
                    <i className={`ti ${lvl.icon} text-[13px]`} aria-hidden="true" />{lvl.label}
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

          <div style={{ borderTop: "1px solid #f5eaea", paddingTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>Grading Components</div>
                <div style={{ fontSize: 11, color: "#8a6a6a", marginTop: 2 }}>Weights must sum to exactly 100%</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: weightOk ? "#2e6b0d" : totalWeight > 0 ? "#a32d2d" : "#8a6a6a" }}>
                  {totalWeight.toFixed(1)}% / 100%
                </span>
                <motion.button type="button" onClick={addComponent}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#fff0f0", color: "#c92a2a", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  <i className="ti ti-plus" style={{ fontSize: 13 }} />Add
                </motion.button>
              </div>
            </div>

            <div style={{ height: 6, borderRadius: 99, background: "#f0e8e8", overflow: "hidden", marginBottom: 16 }}>
              <motion.div
                animate={{ width: `${Math.min(totalWeight, 100)}%`, background: weightOk ? "#2e6b0d" : totalWeight > 100 ? "#a32d2d" : "#e03131" }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                style={{ height: "100%", borderRadius: 99 }}
              />
            </div>

            {components.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px 0", color: "#8a6a6a", fontSize: 13, fontStyle: "italic" }}>
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
                      <span style={{ fontSize: 12, color: "#8a6a6a", fontWeight: 600 }}>%</span>
                    </div>
                    <motion.button onClick={() => removeComponent(comp._key)}
                      whileHover={{ scale: 1.08, backgroundColor: "#fff0f0" }}
                      whileTap={{ scale: 0.92 }}
                      style={{ width: 28, height: 28, border: "1px solid #f0e4e4", borderRadius: 7, background: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8a6a6a", flexShrink: 0 }}>
                      <i className="ti ti-x" style={{ fontSize: 12 }} />
                    </motion.button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
    </Modal>
  );
}

function DeleteTemplateModal({ template, onConfirm, onCancel, deleting, deleteError }) {
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

function GradingTemplatesTab({ header }) {
  const canManage = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);
  const isFirstRender = useIsFirstRender();

  const [templates,    setTemplates]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  // A failed load used to read as "No templates found".
  const [loadError,    setLoadError]    = useState(null);
  const [levelFilter,  setLevelFilter]  = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search,       setSearch]       = useState("");
  const [modal,        setModal]        = useState(null);
  const [toDelete,     setToDelete]     = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [deleteError,  setDeleteError]  = useState("");
  const searchRef = useRef(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getTemplates({});
      setTemplates(Array.isArray(data) ? data : data?.results ?? []);
    } catch (e) {
      console.error(e);
      setLoadError(e);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchTemplates]);

  // Every template loads at once, so the band counts here: the Level menu
  // narrows it, the search only the rows.
  const inScope = useMemo(
    () => templates.filter((t) => !levelFilter || t.school_level === levelFilter),
    [templates, levelFilter],
  );
  const counts = loading || loadError ? null : {
    "": inScope.length,
    ...Object.fromEntries(Object.keys(TEMPLATE_STATUS_MAP).map((k) => [k, inScope.filter((t) => templateStatus(t) === k).length])),
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inScope.filter((t) => {
      if (statusFilter && templateStatus(t) !== statusFilter) return false;
      if (!q) return true;
      return t.template_name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q);
    });
  }, [inScope, statusFilter, search]);

  const hasFilters = Boolean(levelFilter || statusFilter || search.trim());
  const clearFilters = () => {
    setLevelFilter(""); setStatusFilter(""); setSearch("");
    searchRef.current?.focus();
  };

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

  const levelLabel = LEVEL_FILTER_OPTIONS.find((l) => l.value === levelFilter)?.label;

  return (
    <>
      {header(
        <Button icon="ti-plus" onClick={() => setModal({ mode: "create" })}>
          New Template
        </Button>,
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">
        {/* ── Which templates can grade, and the filter ── */}
        <StatusBand
          total={counts?.[""]}
          caption={[`grading template${counts?.[""] === 1 ? "" : "s"}`, levelFilter && levelLabel].filter(Boolean).join(" · ")}
          aside={
            <span className="hidden text-sm text-brand-border sm:block">
              A template&apos;s weights must add up to 100%
            </span>
          }
          options={[
            { value: "", label: "All", count: counts?.[""] },
            ...Object.entries(TEMPLATE_STATUS_MAP).map(([key, meta]) => ({
              value: key, label: meta.label, count: counts?.[key], variant: meta.variant,
            })),
          ]}
          value={statusFilter}
          allValue=""
          onChange={setStatusFilter}
        />

        {/* ── Toolbar: search, the filter menu, Clear ── */}
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField
            id="templates-search"
            label="Search grading templates"
            placeholder="Search templates…"
            inputRef={searchRef}
            value={search}
            onChange={setSearch}
            onClear={() => setSearch("")}
          />
          <FilterMenu
            label="Level"
            valueLabel={levelLabel ?? "All levels"}
            active={Boolean(levelFilter)}
            options={LEVEL_FILTER_OPTIONS}
            value={levelFilter}
            onChange={setLevelFilter}
            align="end"
            menuWidth={220}
          />
          {hasFilters && (
            <button type="button" onClick={clearFilters} className={clearButtonClass}>
              <i className="ti ti-filter-off text-[14px]" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>

        {/* ── Table ── */}
        <motion.div
          initial={isFirstRender ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.1 : 0 }}
        >
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-baseline gap-2.5 border-b border-neutral-200 px-5 py-4">
              <h2 className="text-md font-bold text-neutral-900">
                {statusFilter ? TEMPLATE_STATUS_MAP[statusFilter].title : "All templates"}
              </h2>
              {!loading && !loadError && (
                <span className="text-sm text-neutral-500 tabular-nums">{filtered.length}</span>
              )}
            </div>
            <Table
              headerVariant="quiet"
              columns={TEMPLATE_COLUMNS}
              loading={loading}
              error={loadError}
              onRetry={fetchTemplates}
              errorSubject="the grading templates"
              isEmpty={filtered.length === 0}
              skeletonRows={4}
              empty={{
                icon: "ti-report-analytics",
                withAvatar: false,
                title: hasFilters ? "No templates match these filters" : "No grading templates yet",
                subtitle: hasFilters
                  ? "Try a different search, or clear the filters."
                  : "Create one to say how each subject's scores make up its grade.",
                action: hasFilters ? (
                  <Button variant="secondary" size="sm" icon="ti-filter-off" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button size="sm" icon="ti-plus" onClick={() => setModal({ mode: "create" })}>
                    New Template
                  </Button>
                ),
              }}
            >
              {filtered.map((tpl) => {
                const total = calcTotal(tpl.components);
                const complete = weightsComplete(tpl);
                return (
                  <TableRow key={tpl.grading_template_id} onClick={() => setModal({ mode: "edit", template: tpl })}>
                    <TableCell>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-neutral-900 transition-colors group-hover:text-brand-600">
                          {tpl.template_name}
                        </div>
                        {tpl.description && (
                          <div className="truncate text-[11.5px] text-neutral-500">{tpl.description}</div>
                        )}
                      </div>
                    </TableCell>

                    {/* The same dot as the Level menu. */}
                    <TableCell>
                      <span className="flex min-w-0 items-center gap-2 text-sm text-neutral-800">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_DOTS[tpl.school_level] ?? "bg-neutral-400"}`} aria-hidden="true" />
                        <span className="truncate">{LEVEL_LABELS[tpl.school_level] ?? tpl.school_level}</span>
                      </span>
                    </TableCell>

                    <TableCell>
                      {tpl.components?.length ? (
                        <div className="flex flex-col gap-1.5">
                          <WeightBar components={tpl.components} />
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-neutral-600">
                            {tpl.components.map((c, i) => (
                              <span key={c.grading_component_id ?? i} className="inline-flex items-center gap-1.5">
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ background: COMPONENT_COLORS[i % COMPONENT_COLORS.length] }}
                                  aria-hidden="true"
                                />
                                {c.component_name} <span className="font-semibold text-neutral-800 tabular-nums">{parseFloat(c.weight)}%</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm italic text-neutral-500">No components yet</span>
                      )}
                    </TableCell>

                    <TableCell align="right">
                      <span className={`text-[13px] font-bold tabular-nums ${complete ? "text-neutral-900" : "text-warning-500"}`}>
                        {total.toFixed(0)}%
                      </span>
                    </TableCell>

                    <TableCell>
                      <StatusDot status={templateStatus(tpl)} map={TEMPLATE_STATUS_MAP} />
                    </TableCell>

                    {/* Row actions must not trigger the row's own click. */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost" size="sm" icon="ti-pencil"
                          aria-label={`Edit ${tpl.template_name}`}
                          onClick={() => setModal({ mode: "edit", template: tpl })}
                        />
                        {canManage && (
                          <Button
                            variant="ghost" size="sm" icon="ti-trash"
                            aria-label={`Delete ${tpl.template_name}`}
                            className="hover:bg-error-50 hover:text-error-500"
                            onClick={() => { setToDelete(tpl); setDeleteError(""); }}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </Table>
          </Card>
        </motion.div>
      </div>

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
          <DeleteTemplateModal
            key="delete-modal"
            template={toDelete}
            onConfirm={handleDelete}
            onCancel={() => { setToDelete(null); setDeleteError(""); }}
            deleting={deleting}
            deleteError={deleteError}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// NARRATIVE CATEGORIES TAB
// ════════════════════════════════════════════════════════════════════════════

const textInput =
  "h-9 rounded-sm border-[1.5px] border-neutral-300 bg-white px-2.5 text-[13px] text-neutral-900 outline-none focus:border-brand-500";

function CategoryRow({ cat, onUpdated, onDeleted, canManage }) {
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
    } catch (e) { toast.error(e?.message || "Failed to save category."); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async () => {
    setSaving(true);
    try {
      const updated = await updateCategory(cat.category_id, { is_active: !active });
      setActive(updated.is_active); onUpdated(updated);
    } catch (e) { toast.error(e?.message || "Failed to update category."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCategory(cat.category_id);
      toast.success("Category deleted.");
      onDeleted(cat.category_id);
    }
    catch (e) { toast.error(e?.message || "Failed to delete category."); }
    finally { setDeleting(false); setConfirm(false); }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2.5 bg-brand-50 px-5 py-4">
        <div className="flex gap-2.5">
          <input aria-label="Category name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" className={`${textInput} flex-1`} />
          <input aria-label="Sort order" type="number" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="Order" className={`${textInput} w-24 text-right`} />
        </div>
        <input aria-label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" className={textInput} />
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-[12.5px] text-neutral-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-brand-500" />
            Active
          </label>
          <div className="flex-1" />
          <Button
            variant="secondary" size="sm"
            onClick={() => { setEditing(false); setName(cat.name); setDesc(cat.description ?? ""); setOrder(String(cat.sort_order)); setActive(cat.is_active); }}
          >
            Cancel
          </Button>
          <Button size="sm" icon="ti-check" loading={saving} disabled={!name.trim()} onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-brand-50">
      <span className="w-8 shrink-0 font-mono text-[12px] text-neutral-500 tabular-nums" title="Sort order">#{cat.sort_order}</span>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[13px] font-semibold ${active ? "text-neutral-900" : "text-neutral-500"}`}>{cat.name}</div>
        {cat.description && <div className="truncate text-[11.5px] text-neutral-500">{cat.description}</div>}
      </div>
      <StatusDot status={active ? "active" : "inactive"} map={ACTIVE_STATUS_MAP} className="w-[88px] shrink-0" />
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" disabled={saving} onClick={handleToggleActive}>
          {active ? "Deactivate" : "Activate"}
        </Button>
        <Button variant="ghost" size="sm" icon="ti-pencil" aria-label={`Edit ${cat.name}`} onClick={() => setEditing(true)} />
        {canManage && (confirm ? (
          <>
            <Button size="sm" loading={deleting} onClick={handleDelete}>Confirm</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>Cancel</Button>
          </>
        ) : (
          <Button
            variant="ghost" size="sm" icon="ti-trash"
            aria-label={`Delete ${cat.name}`}
            className="hover:bg-error-50 hover:text-error-500"
            onClick={() => setConfirm(true)}
          />
        ))}
      </div>
    </div>
  );
}

const CATEGORY_FILTERS = [
  { value: "",         label: "All" },
  { value: "active",   label: "Active",   variant: "success", title: "Active categories" },
  { value: "inactive", label: "Inactive", variant: "muted",   title: "Inactive categories" },
];

function NarrativeCategoriesTab({ header }) {
  const canManage = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  // A failed load used to read as "No categories yet".
  const [loadError,  setLoadError]  = useState(null);
  const [reload,     setReload]     = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [search,     setSearch]     = useState("");
  const [adding,     setAdding]     = useState(false);
  const [newName,    setNewName]    = useState("");
  const [newDesc,    setNewDesc]    = useState("");
  const [newOrder,   setNewOrder]   = useState("");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const searchRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setLoadError(null);
    getCategories({ page_size: 200 })
      .then((d) => { if (!cancelled) setCategories(Array.isArray(d) ? d : d?.results ?? []); })
      .catch((e) => { if (!cancelled) { setLoadError(e); setCategories([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const handleAdd = async () => {
    if (!newName.trim()) { setError("Name is required."); return; }
    setSaving(true); setError("");
    try {
      const created = await createCategory({ name: newName.trim(), description: newDesc.trim() || null, sort_order: parseInt(newOrder) || 0, is_active: true });
      toast.success("Category created.");
      setCategories((prev) => [...prev, created]);
      setNewName(""); setNewDesc(""); setNewOrder(""); setAdding(false);
    } catch (e) {
      const msg = e?.message || "Failed to create category.";
      setError(msg);
      toast.error(msg);
    }
    finally { setSaving(false); }
  };

  // Every category loads at once, so the band counts here; the search
  // narrows only the rows.
  const counts = loading || loadError ? null : {
    "": categories.length,
    active: categories.filter((c) => c.is_active).length,
    inactive: categories.filter((c) => !c.is_active).length,
  };
  const filtered = categories.filter((c) => {
    if (statusFilter === "active" && !c.is_active) return false;
    if (statusFilter === "inactive" && c.is_active) return false;
    const q = search.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q);
  });
  const hasFilters = Boolean(statusFilter || search.trim());
  const clearFilters = () => { setStatusFilter(""); setSearch(""); searchRef.current?.focus(); };

  return (
    <>
      {header(
        <Button icon="ti-plus" onClick={() => { setAdding(true); setNewName(""); setNewDesc(""); setNewOrder(""); setError(""); }}>
          Add Category
        </Button>,
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">
        {/* ── Which categories teachers rate, and the filter ── */}
        <StatusBand
          total={counts?.[""]}
          caption={`narrative categor${counts?.[""] === 1 ? "y" : "ies"}`}
          aside={
            <span className="hidden text-sm text-brand-border sm:block">
              Teachers rate the active ones for each learner
            </span>
          }
          options={CATEGORY_FILTERS.map((f) => ({
            value: f.value, label: f.label, count: counts?.[f.value], variant: f.variant,
          }))}
          value={statusFilter}
          allValue=""
          onChange={setStatusFilter}
        />

        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField
            id="categories-search"
            label="Search narrative categories"
            placeholder="Search categories…"
            inputRef={searchRef}
            value={search}
            onChange={setSearch}
            onClear={() => setSearch("")}
          />
          {hasFilters && (
            <button type="button" onClick={clearFilters} className={clearButtonClass}>
              <i className="ti ti-filter-off text-[14px]" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>

        <AnimatePresence>
          {adding && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
              <Card padding="none">
                <div className="flex flex-col gap-2.5 px-5 py-4">
                  <h2 className="text-md font-bold text-neutral-900">New category</h2>
                  {error && <Alert variant="error">{error}</Alert>}
                  <div className="flex gap-2.5">
                    <input aria-label="Category name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Category name (e.g., Attentive in Class)"
                      className={`${textInput} flex-1`} onKeyDown={(e) => e.key === "Enter" && handleAdd()} autoFocus />
                    <input aria-label="Sort order" type="number" value={newOrder} onChange={(e) => setNewOrder(e.target.value)} placeholder="Order"
                      className={`${textInput} w-24 text-right`} />
                  </div>
                  <input aria-label="Description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)"
                    className={textInput} onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => { setAdding(false); setError(""); }}>Cancel</Button>
                    <Button size="sm" icon="ti-check" loading={saving} disabled={!newName.trim()} onClick={handleAdd}>
                      Add Category
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <Card padding="none" className="overflow-hidden">
          <div className="flex items-baseline gap-2.5 border-b border-neutral-200 px-5 py-4">
            <h2 className="text-md font-bold text-neutral-900">
              {CATEGORY_FILTERS.find((f) => f.value === statusFilter)?.title ?? "All categories"}
            </h2>
            {!loading && !loadError && (
              <span className="text-sm text-neutral-500 tabular-nums">{filtered.length}</span>
            )}
          </div>
          {loading ? (
            <div className="divide-y divide-neutral-200/70">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="h-3 w-6 animate-pulse rounded bg-neutral-100" />
                  <div className="h-3.5 flex-1 animate-pulse rounded bg-neutral-100" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <ErrorState error={loadError} subject="the narrative categories" onRetry={() => setReload((k) => k + 1)} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="ti-clipboard-text"
              title={hasFilters ? "No categories match these filters" : "No categories yet"}
              subtitle={hasFilters ? "Try a different search, or clear the filters." : 'Click "Add Category" to get started.'}
            />
          ) : (
            <div className="divide-y divide-neutral-200/70">
              {filtered.map((cat) => (
                <CategoryRow key={cat.category_id} cat={cat}
                  onUpdated={(updated) => setCategories((prev) => prev.map((c) => c.category_id === updated.category_id ? updated : c))}
                  onDeleted={(id) => setCategories((prev) => prev.filter((c) => c.category_id !== id))}
                  canManage={canManage}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
