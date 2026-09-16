import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Alert from "../components/ui/Alert";
import Badge from "../components/ui/Badge";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Modal from "../components/ui/Modal";
import ChipGroup from "../components/ui/ChipGroup";
import FilterBar, { FilterRow, CollapsibleFilterRow } from "../components/ui/FilterBar";
import SchoolYearPicker from "../components/ui/SchoolYearPicker";
import { Field, Input, Select } from "../components/FormField";
import toast from "react-hot-toast";
import ConfirmModal from "../components/ConfirmModal";

import {
  getSectionAdvisories,
  createSectionAdvisory,
  updateSectionAdvisory,
  deleteSectionAdvisory,
} from "../api/enrollmentApi";
import { getUsers } from "../api/identityApi";
import { useSchoolYear } from "../context/SchoolYearContext";

// ── School level / grade level options (mirrors EnrollmentFormPage.jsx) ────────
// `tone` names the shared ChipGroup/Badge palette entry, so a school level
// reads the same colour here as it does on Subjects, Enrollments and
// Requirements. `chip` is spelled out rather than interpolated: Tailwind
// extracts class names statically, so `bg-${tone}-50` would never ship.
const SCHOOL_LEVELS = [
  { value: "nursery",           label: "Nursery",            icon: "ti-baby-carriage", tone: "nursery",      chip: "bg-nursery-50 text-nursery-500" },
  { value: "kindergarten",      label: "Kindergarten",       icon: "ti-star",          tone: "kindergarten", chip: "bg-kindergarten-50 text-kindergarten-500" },
  { value: "elementary",        label: "Elementary",         icon: "ti-book",          tone: "elementary",   chip: "bg-elementary-50 text-elementary-500" },
  { value: "junior_highschool", label: "Junior High School", icon: "ti-school",        tone: "juniorhigh",   chip: "bg-juniorhigh-50 text-juniorhigh-500" },
  { value: "senior_highschool", label: "Senior High School", icon: "ti-certificate",   tone: "seniorhigh",   chip: "bg-seniorhigh-50 text-seniorhigh-500" },
];

const GRADE_LEVELS_BY_LEVEL = {
  nursery:           ["Nursery"],
  kindergarten:      ["Kindergarten"],
  elementary:        ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"],
  junior_highschool: ["Grade 7","Grade 8","Grade 9","Grade 10"],
  senior_highschool: ["Grade 11","Grade 12"],
};

const SHS_STRANDS = [
  "STEM","ABM","HUMSS","GAS","TVL-ICT","TVL-HE","TVL-IA","TVL-AFA","Arts and Design","Sports",
];

const getLevelMeta = (level) => SCHOOL_LEVELS.find((l) => l.value === level) ?? null;

const TABLE_COLUMNS = [
  { key: "teacher", label: "Teacher",         width: "26%" },
  { key: "year",    label: "School Year",     width: "14%" },
  { key: "level",   label: "School Level",    width: "18%" },
  { key: "section", label: "Grade & Section", width: "18%" },
  { key: "strand",  label: "Strand",          width: "14%" },
  { key: "actions", label: "",                width: "10%" },
];

// ── Advisory Modal (create/edit) ────────────────────────────────────────────────
function AdvisoryModal({ advisory, teachers, teachersUnavailable, onClose, onSaved }) {
  const isEdit = Boolean(advisory?.advisory_id);
  const { schoolYear: globalSchoolYear } = useSchoolYear();

  const [form, setForm] = useState({
    teacher_user_id: advisory?.teacher_user_id ?? "",
    school_year:     advisory?.school_year     ?? globalSchoolYear,
    school_level:    advisory?.school_level    ?? "elementary",
    grade_level:     advisory?.grade_level     ?? "",
    section:         advisory?.section         ?? "",
    strand:          advisory?.strand          ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const gradeOptions = useMemo(() => GRADE_LEVELS_BY_LEVEL[form.school_level] ?? [], [form.school_level]);
  const isSHS = form.school_level === "senior_highschool";

  const handleSave = async () => {
    if (!form.teacher_user_id) { setError("Please select a teacher."); return; }
    if (!form.school_year.trim()) { setError("School year is required."); return; }
    if (!form.grade_level) { setError("Grade level is required."); return; }
    if (!form.section.trim()) { setError("Section is required."); return; }

    setSaving(true); setError("");
    try {
      const payload = {
        teacher_user_id: parseInt(form.teacher_user_id, 10),
        school_year:     form.school_year.trim(),
        school_level:    form.school_level,
        grade_level:     form.grade_level,
        section:         form.section.trim(),
        strand:          isSHS ? (form.strand || null) : null,
      };
      if (isEdit) await updateSectionAdvisory(advisory.advisory_id, payload);
      else        await createSectionAdvisory(payload);
      toast.success(isEdit ? "Advisory assignment updated." : "Advisory assignment created.");
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
      icon="ti-user-check"
      title={isEdit ? "Edit Advisory Assignment" : "New Advisory Assignment"}
      description={isEdit ? "Update which section this teacher advises" : "Assign a teacher as adviser of a section"}
      // A part-filled form shouldn't be lost to a stray backdrop click.
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button icon="ti-check" loading={saving} onClick={handleSave}>
            {saving ? "Saving…" : isEdit ? "Update" : "Create Assignment"}
          </Button>
        </div>
      }
    >
      <AnimatePresence>
        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}
      </AnimatePresence>

      <Field label="Teacher" required>
        <Select value={form.teacher_user_id} onChange={(e) => setF("teacher_user_id", e.target.value)}>
          <option value="">Select a teacher…</option>
          {teachers.map((t) => (
            <option key={t.user_id} value={t.user_id}>{t.name} ({t.email})</option>
          ))}
        </Select>
        {/* A warning rather than a Field `hint`: this explains why the picker
            above is empty, so it has to carry more weight than grey helper
            text — it's the same amber notice the pre-migration page showed. */}
        {teachersUnavailable && (
          <Alert variant="warning" className="mt-2">
            Teacher list unavailable — listing users requires admin access.
          </Alert>
        )}
      </Field>

      <Field label="School Year" required>
        <Input
          value={form.school_year}
          onChange={(e) => setF("school_year", e.target.value)}
          placeholder="e.g. 2025-2026"
        />
      </Field>

      <FilterRow label="School Level *">
        <ChipGroup
          options={SCHOOL_LEVELS}
          value={form.school_level}
          onChange={(v) => setForm((f) => ({ ...f, school_level: v, grade_level: "", strand: "" }))}
          label="School level"
          className="mb-3.5"
        />
      </FilterRow>

      <div className="grid gap-x-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        <Field label="Grade Level" required>
          <Select value={form.grade_level} onChange={(e) => setF("grade_level", e.target.value)}>
            <option value="">Select grade…</option>
            {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </Select>
        </Field>
        <Field label="Section" required>
          <Input
            value={form.section}
            onChange={(e) => setF("section", e.target.value)}
            placeholder="e.g. Rizal"
          />
        </Field>
      </div>

      {/* Strand is Senior High only, but stays mounted and animates open so
          picking SHS slides it in rather than shoving the footer down. */}
      <CollapsibleFilterRow open={isSHS} maxHeight={110}>
        <Field label="Strand">
          <Select value={form.strand} onChange={(e) => setF("strand", e.target.value)}>
            <option value="">None</option>
            {SHS_STRANDS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
      </CollapsibleFilterRow>
    </Modal>
  );
}

// ── Delete Modal ──────────────────────────────────────────────────────────────
function DeleteModal({ item, teacherName, onConfirm, onCancel, deleting }) {
  return (
    <ConfirmModal
      icon="ti-trash"
      title="Remove advisory assignment?"
      message={<>You're about to remove <strong style={{ color: "#1a0a0a" }}>{teacherName}</strong>'s advisory of <strong style={{ color: "#1a0a0a" }}>{item.grade_level} - {item.section}</strong>. They will lose access to that section's grades, attendance, and narrative reports.</>}
      loading={deleting}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

// ── Table Row ─────────────────────────────────────────────────────────────────
function AdvisoryRow({ advisory, teacherName, onEdit, onDelete }) {
  const lvlMeta = getLevelMeta(advisory.school_level);

  return (
    <TableRow onClick={() => onEdit(advisory)}>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${lvlMeta?.chip ?? "bg-brand-100 text-brand-600"}`}>
            <i className="ti ti-user-check text-[15px]" aria-hidden="true" />
          </div>
          <div className="text-[13px] font-semibold text-neutral-900 transition-colors group-hover:text-brand-600">
            {teacherName}
          </div>
        </div>
      </TableCell>

      <TableCell className="text-[13px] text-neutral-700">{advisory.school_year}</TableCell>

      <TableCell>
        {lvlMeta ? (
          <Badge variant={lvlMeta.tone} icon={lvlMeta.icon} size="sm">
            {lvlMeta.label}
          </Badge>
        ) : (
          <span className="text-[12.5px] text-neutral-700">{advisory.school_level}</span>
        )}
      </TableCell>

      <TableCell>
        <Badge variant="info" size="sm">
          {advisory.grade_level} · {advisory.section}
        </Badge>
      </TableCell>

      <TableCell className="text-[12.5px] text-neutral-700">
        {advisory.strand || <span className="italic text-neutral-500">—</span>}
      </TableCell>

      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1">
          <Button
            variant="ghost" size="sm" icon="ti-pencil"
            aria-label={`Edit ${teacherName}'s advisory`}
            onClick={() => onEdit(advisory)}
          />
          <Button
            variant="ghost" size="sm" icon="ti-trash"
            aria-label={`Remove ${teacherName}'s advisory`}
            onClick={() => onDelete(advisory)}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function TeacherAdvisoriesPage() {
  usePageTitle("Teacher Advisories");
  const isFirstRender = useIsFirstRender();

  const [advisories, setAdvisories]         = useState([]);
  const [teachers,   setTeachers]           = useState([]);
  const [teachersUnavailable, setTeachersUnavailable] = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const { schoolYear: globalSchoolYear } = useSchoolYear();

  // Default the list to the global school year once it resolves — still
  // freely switchable back to "All Years" or any other year in use below.
  useEffect(() => { if (globalSchoolYear) setYearFilter(globalSchoolYear); }, [globalSchoolYear]);
  const [modal,      setModal]      = useState(null);
  const [toDelete,   setToDelete]   = useState(null);
  const [deleting,   setDeleting]   = useState(false);

  const teacherMap = useMemo(() => {
    const map = new Map();
    teachers.forEach((t) => map.set(t.user_id, t.name));
    return map;
  }, [teachers]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // getUsers() is admin-only on identity-service (full user list, by
      // design) even though this route allows registrar too — caught on its
      // own so a 403 here doesn't reject the whole Promise.all and blank
      // the advisories list for registrar. teachersUnavailable then tells
      // the assign-teacher picker why it has no options.
      const [advisoryData, userData] = await Promise.all([
        getSectionAdvisories({ page_size: 500 }),
        getUsers().catch(() => null),
      ]);
      setAdvisories(Array.isArray(advisoryData) ? advisoryData : advisoryData?.results ?? []);
      if (userData == null) {
        setTeachers([]);
        setTeachersUnavailable(true);
      } else {
        setTeachers((Array.isArray(userData) ? userData : userData?.results ?? []).filter((u) => u.role === "teacher"));
        setTeachersUnavailable(false);
      }
    } catch (e) {
      toast.error(e.message || "Failed to load advisory assignments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "All" first, then each year present in the data. Counts ride along so the
  // selected chip can show how many assignments it's narrowing to.
  // Years and counts come from the advisories actually loaded, not from the
  // global year list: this page only ever shows years that have an advisory,
  // and the per-year tallies are exact rather than enrollment-derived.
  const { yearList, yearCounts } = useMemo(() => {
    const counts = {};
    advisories.forEach((a) => { counts[a.school_year] = (counts[a.school_year] ?? 0) + 1; });
    return { yearList: Object.keys(counts).sort().reverse(), yearCounts: counts };
  }, [advisories]);

  const filtered = useMemo(() => {
    let list = advisories;
    if (yearFilter !== "all") list = list.filter((a) => a.school_year === yearFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => {
        const teacherName = (teacherMap.get(a.teacher_user_id) || "").toLowerCase();
        return teacherName.includes(q) ||
          a.section.toLowerCase().includes(q) ||
          a.grade_level.toLowerCase().includes(q);
      });
    }
    return list;
  }, [advisories, yearFilter, search, teacherMap]);

  const hasFilters = yearFilter !== "all" || search.trim() !== "";

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteSectionAdvisory(toDelete.advisory_id);
      toast.success("Advisory assignment removed.");
      setToDelete(null);
      fetchData();
    } catch (e) {
      toast.error(e.message || "Failed to remove assignment.");
    } finally {
      setDeleting(false);
    }
  };

  const totalCount = advisories.length;
  const teacherCount = new Set(advisories.map((a) => a.teacher_user_id)).size;

  return (
    <>
      <PageHeader
        title="Teacher Advisories"
        icon="ti-user-check"
        subtitle={loading ? "Loading…" : `${totalCount} assignments · ${teacherCount} teachers assigned`}
        actions={
          <Button icon="ti-plus" onClick={() => setModal({ mode: "create" })}>
            New Assignment
          </Button>
        }
      />

      {/* ── Content ── */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-7 py-6">

        {/* Filters */}
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          onClearSearch={() => setSearch("")}
          searchPlaceholder="Search by teacher name, grade level, or section…"
          hasFilters={hasFilters}
          onClearFilters={() => { setYearFilter("all"); setSearch(""); }}
          animate={isFirstRender}
          animateDelay={0.18}
          // This page's "show everything" sentinel is the string "all", not the
          // empty string the picker uses, so it's mapped at the boundary rather
          // than changing the filter logic below.
          scope={
            <SchoolYearPicker
              value={yearFilter === "all" ? "" : yearFilter}
              onChange={(y) => setYearFilter(y === "" ? "all" : y)}
              options={yearList}
              counts={yearCounts}
              allYearsCount={advisories.length}
            />
          }
        />

        {/* Table */}
        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.24, ease: "easeOut" }}
        >
          <Card padding="none">
            <Table
              columns={TABLE_COLUMNS}
              loading={loading}
              isEmpty={filtered.length === 0}
              skeletonRows={5}
              empty={{
                icon: "ti-user-off",
                title: hasFilters ? "No assignments match your filters" : "No advisory assignments found",
                subtitle: hasFilters
                  ? "Try adjusting your search or filters"
                  : "Assign a teacher to a section to get started",
                action: hasFilters ? undefined : (
                  <Button icon="ti-plus" onClick={() => setModal({ mode: "create" })}>
                    New Assignment
                  </Button>
                ),
              }}
            >
              {filtered.map((a) => (
                <AdvisoryRow
                  key={a.advisory_id}
                  advisory={a}
                  teacherName={teacherMap.get(a.teacher_user_id) || `User #${a.teacher_user_id}`}
                  onEdit={(adv) => setModal({ mode: "edit", advisory: adv })}
                  onDelete={(adv) => setToDelete(adv)}
                />
              ))}
            </Table>
          </Card>
        </motion.div>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {modal && (
          <AdvisoryModal
            key="advisory-modal"
            advisory={modal.mode === "edit" ? modal.advisory : null}
            teachers={teachers}
            teachersUnavailable={teachersUnavailable}
            onClose={() => setModal(null)}
            onSaved={fetchData}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toDelete && (
          <DeleteModal
            key="delete-modal"
            item={toDelete}
            teacherName={teacherMap.get(toDelete.teacher_user_id) || `User #${toDelete.teacher_user_id}`}
            onConfirm={handleDelete}
            onCancel={() => setToDelete(null)}
            deleting={deleting}
          />
        )}
      </AnimatePresence>
    </>
  );
}
