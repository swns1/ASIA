import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import toast from "react-hot-toast";
import ConfirmModal from "../components/ConfirmModal";
import ChipGroup from "../components/ui/ChipGroup";
import Card from "../components/ui/Card";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Modal from "../components/ui/Modal";
import Badge from "../components/ui/Badge";
import { Field, Input, Textarea } from "../components/FormField";
import FilterBar, { FilterRow } from "../components/ui/FilterBar";
import { useNavigate } from "react-router-dom";

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
  { key: "name",   label: "Scholarship",    width: "30%" },
  { key: "code",   label: "Code",           width: "14%" },
  { key: "mode",   label: "Discount Type",  width: "16%" },
  { key: "value",  label: "Discount Value", width: "14%" },
  { key: "status", label: "Status",         width: "13%" },
  { key: "actions", label: "",              width: "5%"  },
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

// ── Table Row ─────────────────────────────────────────────────────────────────
function ScholarshipRow({ sch, onEdit, onDelete }) {
  const isPct    = sch.discount_mode === "percentage";
  const isActive = sch.is_active;
  // Percentage vs fixed-amount is a category, not a status, so the two get
  // their own tones rather than borrowing the status palette.
  const modeTone = isPct ? "info" : "success";

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${isPct ? "bg-info-50" : "bg-success-50"}`}>
            <i
              className={`ti ${isPct ? "ti-percentage" : "ti-currency-peso"} text-[15px] ${isPct ? "text-info-600" : "text-success-600"}`}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-neutral-900">{sch.scholarship_name}</div>
            {sch.description && (
              <div className="max-w-[240px] truncate text-xs text-neutral-500">{sch.description}</div>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell>
        <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-700">
          {sch.scholarship_code}
        </span>
      </TableCell>

      <TableCell>
        <Badge variant={modeTone} icon={isPct ? "ti-percentage" : "ti-currency-peso"} size="sm">
          {isPct ? "Percentage" : "Fixed Amount"}
        </Badge>
      </TableCell>

      <TableCell className={`text-[15px] font-bold ${isPct ? "text-info-600" : "text-success-600"}`}>
        {formatDiscount(sch)}
      </TableCell>

      <TableCell>
        <Badge variant={isActive ? "success" : "muted"} dot size="sm">
          {isActive ? "Active" : "Inactive"}
        </Badge>
      </TableCell>

      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" icon="ti-pencil" aria-label={`Edit ${sch.scholarship_name}`} onClick={() => onEdit(sch)} />
          <Button variant="ghost" size="sm" icon="ti-trash" aria-label={`Delete ${sch.scholarship_name}`} onClick={() => onDelete(sch)} />
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

  // Counts are taken against the *other* facet plus the search, never against
  // the facet the chip belongs to — so picking "Active" doesn't rewrite the
  // Percentage/Fixed numbers to match it. Same rule the awards summary follows.
  const matchesSearch = useCallback((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.scholarship_name.toLowerCase().includes(q) ||
      s.scholarship_code.toLowerCase().includes(q) ||
      (s.description || "").toLowerCase().includes(q)
    );
  }, [search]);

  const statusOptions = useMemo(() => {
    const pool = scholarships.filter(
      (s) => matchesSearch(s) &&
        (typeFilter === "all" || s.discount_mode === typeFilter)
    );
    return [
      { value: "all",      label: "All",      count: pool.length },
      { value: "active",   label: "Active",   tone: "success", count: pool.filter((s) => s.is_active).length },
      { value: "inactive", label: "Inactive", tone: "muted",   count: pool.filter((s) => !s.is_active).length },
    ];
  }, [scholarships, typeFilter, matchesSearch]);

  const typeOptions = useMemo(() => {
    const pool = scholarships.filter(
      (s) => matchesSearch(s) &&
        (statusFilter === "all" ||
          (statusFilter === "active" ? s.is_active : !s.is_active))
    );
    return [
      { value: "all",          label: "All",          count: pool.length },
      { value: "percentage",   label: "Percentage",   tone: "info",   icon: "ti-percentage",
        count: pool.filter((s) => s.discount_mode === "percentage").length },
      { value: "fixed_amount", label: "Fixed Amount", tone: "accent", icon: "ti-currency-peso",
        count: pool.filter((s) => s.discount_mode === "fixed_amount").length },
    ];
  }, [scholarships, statusFilter, matchesSearch]);

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
    <>
      <PageHeader
        title="Scholarship Types"
        icon="ti-discount"
        subtitle={loading ? "Loading…" : `${totalCount} scholarship types · ${activeCount} active`}
        actions={
          <Button icon="ti-plus" onClick={() => setModal({ mode: "create" })}>
            New Scholarship
          </Button>
        }
      />

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>

        <FilterBar
          animate={isFirstRender}
          animateDelay={0.18}
          searchValue={search}
          onSearchChange={setSearch}
          onClearSearch={() => setSearch("")}
          searchPlaceholder="Search by name, code, or description…"
          searchLabel="Search scholarship types"
          searchInputId="scholarship-types-search"
          hasFilters={hasFilters}
          onClearFilters={() => { setStatusFilter("all"); setTypeFilter("all"); setSearch(""); }}
        >
          <FilterRow label="Status">
            <ChipGroup
              options={statusOptions}
              value={statusFilter}
              onChange={setStatusFilter}
              label="Filter by status"
            />
          </FilterRow>

          <FilterRow label="Discount Type">
            <ChipGroup
              options={typeOptions}
              value={typeFilter}
              onChange={setTypeFilter}
              label="Filter by discount type"
            />
          </FilterRow>
        </FilterBar>

        {/* Table */}
        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.24, ease: "easeOut" }}
        >
          <Card padding="none" className="overflow-hidden">
            <Table
              columns={TABLE_COLUMNS}
              loading={loading}
              isEmpty={filtered.length === 0}
              skeletonRows={6}
              empty={{
                icon: "ti-discount-off",
                title: hasFilters ? "No scholarships match your filters" : "No scholarship types found",
                subtitle: hasFilters
                  ? "Try adjusting your search or filters"
                  : "Create your first scholarship type to get started",
                action: !hasFilters && (
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
