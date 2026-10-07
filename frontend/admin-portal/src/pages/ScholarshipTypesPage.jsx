import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import toast from "react-hot-toast";
import ConfirmModal from "../components/ConfirmModal";
import Card from "../components/ui/Card";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Modal from "../components/ui/Modal";
import StatusBand from "../components/ui/StatusBand";
import FilterMenu from "../components/ui/FilterMenu";
import SearchField from "../components/ui/SearchField";
import { StatusDot } from "../components/ui/Badge";
import { Field, Input, Textarea } from "../components/FormField";

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


const TABLE_COLUMNS = [
  { key: "name",    label: "Scholarship", width: "38%" },
  { key: "code",    label: "Code",        width: "16%" },
  { key: "value",   label: "Discount",    width: "22%" },
  { key: "status",  label: "Status",      width: "14%" },
  { key: "actions", label: "",            width: "10%" },
];

// The band's legend: whether a type can be awarded. Only active ones are
// offered when awarding, so an inactive one is kept for the awards already
// made with it.
const TYPE_STATUS_MAP = {
  active:   { label: "Active",   variant: "success" },
  inactive: { label: "Inactive", variant: "muted" },
};
const STATUS_FILTERS = [
  { value: "",         label: "All" },
  { value: "active",   label: "Active",   variant: "success", title: "Active scholarship types" },
  { value: "inactive", label: "Inactive", variant: "muted",   title: "Inactive scholarship types" },
];

const MODE_FILTERS = [
  { value: "",             label: "Any" },
  { value: "percentage",   label: "Percentage" },
  { value: "fixed_amount", label: "Fixed amount" },
];

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



  return (
    <Modal
      onClose={onClose}
      size="md"
      showClose
      loading={saving}
      icon="ti-discount"
      title={isEdit ? "Edit Scholarship" : "New Scholarship Type"}
      description={isEdit ? "Update scholarship details" : "Create a new scholarship type"}
      // A part-filled form shouldn't be lost to a stray backdrop click.
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button icon="ti-check" loading={saving} onClick={handleSave}>
            {saving ? "Saving…" : isEdit ? "Update" : "Create Scholarship"}
          </Button>
        </div>
      }
    >
        <div>
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
          <div className="grid gap-x-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            <Field label="Scholarship Code" required>
              <Input
                value={form.scholarship_code}
                onChange={(e) => setF("scholarship_code", e.target.value)}
                placeholder="e.g. ACADEMIC_EXCEL"
              />
            </Field>
            <Field label="Scholarship Name" required>
              <Input
                value={form.scholarship_name}
                onChange={(e) => setF("scholarship_name", e.target.value)}
                placeholder="e.g. Academic Excellence Award"
              />
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              value={form.description}
              onChange={(e) => setF("description", e.target.value)}
              placeholder="Optional description…"
              rows={2}
            />
          </Field>

          {/* Discount mode — a two-up choice of cards rather than a select, so
              it stays bespoke; only the label goes through Field. */}
          <Field label="Discount Type" required>
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
                      <i className={`ti ${opt.icon}`} style={{ fontSize: 16, color: active ? opt.color : "#855c5c", transition: "color 0.15s ease" }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: active ? opt.color : "#7a5050", transition: "color 0.15s ease" }}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Discount value */}
          <Field label="Discount Value" required>
            <div style={{ position: "relative" }}>
              <Input type="number" min="0" max={form.discount_mode === "percentage" ? 100 : undefined}
                step="0.01" value={form.discount_value}
                onChange={(e) => setF("discount_value", e.target.value)}
                placeholder={form.discount_mode === "percentage" ? "e.g. 50" : "e.g. 5000"}
                className="pr-12" />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: "#8a6a6a" }}>
                {form.discount_mode === "percentage" ? "%" : "₱"}
              </span>
            </div>
            <div className="mt-1.5 text-xs italic text-neutral-500" style={{ visibility: form.discount_mode === "percentage" ? "visible" : "hidden" }}>
              Must be between 0 and 100%
            </div>
          </Field>

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
    </Modal>
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

/// ── Table Row ─────────────────────────────────────────────────────────────────
function ScholarshipRow({ sch, onEdit, onDelete }) {
  const isPct = sch.discount_mode === "percentage";
  return (
    <TableRow onClick={() => onEdit(sch)}>
      <TableCell>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-neutral-900 transition-colors group-hover:text-brand-600">
            {sch.scholarship_name}
          </div>
          {sch.description && (
            <div className="truncate text-[11.5px] text-neutral-500">{sch.description}</div>
          )}
        </div>
      </TableCell>

      <TableCell>
        <span className="font-mono text-[12px] text-neutral-800">{sch.scholarship_code}</span>
      </TableCell>

      {/* Percentage vs fixed amount is a category, not a status: words, not
          a coloured pill. */}
      <TableCell>
        <div className="text-[13px] font-bold text-neutral-900 tabular-nums">{formatDiscount(sch)}</div>
        <div className="text-[11.5px] text-neutral-500">{isPct ? "Percentage of tuition" : "Fixed amount"}</div>
      </TableCell>

      <TableCell>
        <StatusDot status={sch.is_active ? "active" : "inactive"} map={TYPE_STATUS_MAP} />
      </TableCell>

      {/* Row actions must not trigger the row's own click. */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" icon="ti-pencil" aria-label={`Edit ${sch.scholarship_name}`} onClick={() => onEdit(sch)} />
          <Button
            variant="ghost" size="sm" icon="ti-trash"
            aria-label={`Delete ${sch.scholarship_name}`}
            className="hover:bg-error-50 hover:text-error-500"
            onClick={() => onDelete(sch)}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function ScholarshipTypesPage() {
  usePageTitle("Scholarship Types");

  const [scholarships,  setScholarships]  = useState([]);
  const [loading,       setLoading]       = useState(true);
  // A failed load used to read as "No scholarship types found".
  const [loadError,     setLoadError]     = useState(null);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("");
  const [modeFilter,    setModeFilter]    = useState("");
  const [modal,         setModal]         = useState(null);
  const [toDelete,      setToDelete]      = useState(null);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteError,   setDeleteError]   = useState("");
  const searchRef = useRef(null);
  const isFirstRender = useIsFirstRender();

  const fetchScholarships = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getScholarshipTypes({ page_size: 500 });
      setScholarships(Array.isArray(data) ? data : data?.results ?? []);
    } catch (e) {
      console.error(e);
      setLoadError(e);
      setScholarships([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScholarships(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchScholarships]);

  // Every type is loaded at once, so the band counts here. As on the other
  // list pages, the Discount menu narrows the band and search only the rows.
  const inScope = useMemo(
    () => scholarships.filter((s) => !modeFilter || s.discount_mode === modeFilter),
    [scholarships, modeFilter],
  );
  const counts = loading || loadError ? null : {
    "": inScope.length,
    active: inScope.filter((s) => s.is_active).length,
    inactive: inScope.filter((s) => !s.is_active).length,
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inScope.filter((s) => {
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "inactive" && s.is_active) return false;
      if (!q) return true;
      return (
        s.scholarship_name.toLowerCase().includes(q) ||
        s.scholarship_code.toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q)
      );
    });
  }, [inScope, statusFilter, search]);

  const hasFilters = Boolean(statusFilter || modeFilter || search.trim());
  const clearFilters = () => {
    setStatusFilter(""); setModeFilter(""); setSearch("");
    searchRef.current?.focus();
  };

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

  const modeLabel = MODE_FILTERS.find((m) => m.value === modeFilter)?.label;
  const statusMeta = STATUS_FILTERS.find((f) => f.value === statusFilter);

  return (
    <>
      <PageHeader
        title="Scholarship Types"
        actions={
          <Button icon="ti-plus" onClick={() => setModal({ mode: "create" })}>
            New Scholarship
          </Button>
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">

        {/* ── Which types can be awarded, and the filter ── */}
        <StatusBand
          total={counts?.[""]}
          caption={[
            `scholarship type${counts?.[""] === 1 ? "" : "s"}`,
            modeFilter && modeLabel,
          ].filter(Boolean).join(" · ")}
          aside={
            <span className="hidden text-sm text-brand-border sm:block">
              Only active types can be awarded
            </span>
          }
          options={STATUS_FILTERS.map((f) => ({
            value: f.value,
            label: f.label,
            count: counts?.[f.value],
            variant: f.variant,
          }))}
          value={statusFilter}
          allValue=""
          onChange={setStatusFilter}
        />

        {/* ── Toolbar: search, the filter menu, Clear ── */}
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField
            id="scholarship-types-search"
            label="Search scholarship types"
            placeholder="Search by name, code, or description…"
            inputRef={searchRef}
            value={search}
            onChange={setSearch}
            onClear={() => setSearch("")}
          />

          <FilterMenu
            label="Discount"
            valueLabel={modeLabel ?? "Any"}
            active={Boolean(modeFilter)}
            options={MODE_FILTERS}
            value={modeFilter}
            onChange={setModeFilter}
            align="end"
            menuWidth={200}
          />

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="focus-ring flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-error-600 transition-colors duration-150 hover:bg-brand-100"
            >
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
              <h2 className="text-md font-bold text-neutral-900">{statusMeta?.title ?? "All scholarship types"}</h2>
              {!loading && !loadError && (
                <span className="text-sm text-neutral-500 tabular-nums">{filtered.length.toLocaleString()}</span>
              )}
            </div>
            <Table
              headerVariant="quiet"
              columns={TABLE_COLUMNS}
              loading={loading}
              error={loadError}
              onRetry={fetchScholarships}
              errorSubject="scholarship types"
              isEmpty={filtered.length === 0}
              skeletonRows={6}
              empty={{
                icon: "ti-discount-off",
                withAvatar: false,
                title: hasFilters ? "No scholarship types match these filters" : "No scholarship types yet",
                subtitle: hasFilters
                  ? "Try a different search, or clear the filters."
                  : "Create the first one to start awarding scholarships.",
                action: hasFilters ? (
                  <Button variant="secondary" size="sm" icon="ti-filter-off" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button size="sm" icon="ti-plus" onClick={() => setModal({ mode: "create" })}>
                    New Scholarship
                  </Button>
                ),
              }}
            >
              {filtered.map((sch) => (
                <ScholarshipRow
                  key={sch.scholarship_type_id}
                  sch={sch}
                  onEdit={(s) => setModal({ mode: "edit", scholarshipType: s })}
                  onDelete={(s) => { setToDelete(s); setDeleteError(""); }}
                />
              ))}
            </Table>
          </Card>
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
    </>
  );
}
