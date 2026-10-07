import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import useYearFilter from "../hooks/useYearFilter";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Alert from "../components/ui/Alert";
import { StatusDot } from "../components/ui/Badge";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Modal from "../components/ui/Modal";
import ChipGroup from "../components/ui/ChipGroup";
import { FilterRow, CollapsibleFilterRow } from "../components/ui/FilterBar";
import StatusBand from "../components/ui/StatusBand";
import FilterMenu from "../components/ui/FilterMenu";
import SearchField from "../components/ui/SearchField";
import SchoolYearMenu from "../components/ui/SchoolYearMenu";
import { GRADE_LEVELS_BY_LEVEL, LEVEL_DOTS, LEVEL_FILTER_OPTIONS, LEVEL_LABELS } from "../constants/schoolLevels";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
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
import { yearOptionsForEntry } from "../utils/schoolYear";
import SectionSelect from "../components/sections/SectionSelect";
import useArchivedYears from "../hooks/useArchivedYears";
import ArchivedYearNotice from "../components/schoolYears/ArchivedYearNotice";

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

const TABLE_COLUMNS = [
  { key: "teacher", label: "Teacher",         width: "26%" },
  { key: "year",    label: "School year",     width: "12%" },
  { key: "level",   label: "Level",           width: "17%" },
  { key: "section", label: "Grade & section", width: "17%" },
  { key: "adviser", label: "Adviser",         width: "18%" },
  { key: "actions", label: "",                width: "10%" },
];

// Newest year first, then up the grade ladder, then by section. The server's
// order is by text, which put Grade 10 before Grade 2.
const GRADE_RANK = Object.fromEntries(Object.values(GRADE_LEVELS_BY_LEVEL).flat().map((g, i) => [g, i]));
const byYearGradeSection = (a, b) =>
  b.school_year.localeCompare(a.school_year) ||
  (GRADE_RANK[a.grade_level] ?? 99) - (GRADE_RANK[b.grade_level] ?? 99) ||
  a.section.localeCompare(b.section);

// The band's legend: whether each section's adviser can still sign in to
// take attendance and enter grades. A past year's adviser leaving later is
// history, not a gap, so it's its own, quiet status.
const ADVISER_STATUS_MAP = {
  active:        { label: "Active adviser",      variant: "success", title: "Sections with an active adviser" },
  needs_adviser: { label: "Needs a new adviser", variant: "warning", title: "Sections that need a new adviser" },
  deactivated:   { label: "Adviser deactivated", variant: "muted",   title: "Past sections whose adviser has left" },
};

// ── Advisory Modal (create/edit) ────────────────────────────────────────────────
function AdvisoryModal({ advisory, defaultYear, teachers, teachersUnavailable, onClose, onSaved }) {
  const isEdit = Boolean(advisory?.advisory_id);
  const { currentYear, entryYears } = useSchoolYear();
  // A deactivated teacher can't sign in to use a section, so they are never
  // offered as a new adviser. Editing this year's (or a later year's) section
  // whose adviser was deactivated, or whose account is gone, starts with the
  // picker empty, asking for a new one; a past year's keeps its adviser.
  const currentAdviserActive = teachers.some(
    (t) => t.is_active !== false && t.user_id === advisory?.teacher_user_id,
  );
  const needsNewAdviser = isEdit && !teachersUnavailable && !currentAdviserActive
    && (!currentYear || advisory.school_year >= currentYear);

  const [form, setForm] = useState({
    teacher_user_id: needsNewAdviser ? "" : (advisory?.teacher_user_id ?? ""),
    // A new assignment starts in the year the list is showing, so assigning
    // next year's advisers doesn't mean retyping the year every time.
    school_year:     advisory?.school_year     ?? (defaultYear || currentYear),
    school_level:    advisory?.school_level    ?? "elementary",
    grade_level:     advisory?.grade_level     ?? "",
    section:         advisory?.section         ?? "",
    strand:          advisory?.strand          ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  // Only active teachers can be assigned. Editing a deactivated teacher's
  // existing advisory still shows them, so the form doesn't silently
  // switch the teacher.
  const teacherOptions = useMemo(
    () => teachers.filter((t) => t.is_active !== false
      || (!needsNewAdviser && t.user_id === advisory?.teacher_user_id)),
    [teachers, advisory, needsNewAdviser],
  );

  // A section belongs to one grade of one year: changing either clears it.
  const setF = (k, v) => setForm((f) => ({
    ...f,
    [k]: v,
    ...(k === "school_year" || k === "grade_level" ? { section: "", strand: "" } : {}),
  }));

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
          {teacherOptions.map((t) => (
            <option key={t.user_id} value={t.user_id}>{t.name} ({t.email})</option>
          ))}
        </Select>
        {/* A warning rather than a Field `hint`: this explains why the picker
            above is empty, so it has to carry more weight than grey helper
            text — it's the same amber notice the pre-migration page showed. */}
        {teachersUnavailable && (
          <Alert variant="warning" className="mt-2">
            Teacher list unavailable — the teacher accounts couldn't be loaded. Try again in a moment.
          </Alert>
        )}
        {needsNewAdviser && (
          <Alert variant="warning" className="mt-2">
            This section&apos;s adviser can no longer sign in — their account was deactivated or removed. Choose a new adviser.
          </Alert>
        )}
      </Field>

      {/* A registered year, not free text: the database only accepts years an
          admin has set up, and a typo here used to cut the adviser off from
          their own students. */}
      <Field label="School Year" required>
        <Select value={form.school_year} onChange={(e) => setF("school_year", e.target.value)}>
          {yearOptionsForEntry(entryYears, form.school_year).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
      </Field>

      <FilterRow label="School Level *">
        <ChipGroup
          options={SCHOOL_LEVELS}
          value={form.school_level}
          onChange={(v) => setForm((f) => ({ ...f, school_level: v, grade_level: "", section: "", strand: "" }))}
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
          <SectionSelect
            as={Select}
            schoolYear={form.school_year}
            gradeLevel={form.grade_level}
            schoolLevel={form.school_level}
            value={form.section}
            aria-label="Section"
            onChange={(name, section) => setForm((f) => ({ ...f, section: name, strand: section?.strand ?? "" }))}
          />
        </Field>
      </div>

      {/* Strand is Senior High only, but stays mounted and animates open so
          picking SHS slides it in rather than shoving the footer down. */}
      <CollapsibleFilterRow open={isSHS} maxHeight={110}>
        {/* The strand is the section's: picking STEM-A is picking STEM. */}
        <Field label="Strand" hint="Set by the section">
          <Input value={form.strand || "—"} readOnly disabled />
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

/// ── Table Row ─────────────────────────────────────────────────────────────────
function AdvisoryRow({ advisory, teacherName, adviserStatus, readOnly, onEdit, onDelete }) {
  const palette = getAvatarPalette(teacherName);
  return (
    <TableRow onClick={readOnly ? undefined : () => onEdit(advisory)}>
      <TableCell>
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ background: palette.bg, color: palette.color }}
            aria-hidden="true"
          >
            {initialsFrom(teacherName)}
          </div>
          <span className="truncate text-[13px] font-semibold text-neutral-900 transition-colors group-hover:text-brand-600">
            {teacherName}
          </span>
        </div>
      </TableCell>

      <TableCell>
        <span className="font-mono text-[12px] text-neutral-800">{advisory.school_year}</span>
      </TableCell>

      {/* The same dot as the Level menu, so a level reads the same in both. */}
      <TableCell>
        <span className="flex min-w-0 items-center gap-2 text-sm text-neutral-800">
          <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_DOTS[advisory.school_level] ?? "bg-neutral-400"}`} aria-hidden="true" />
          <span className="truncate">{LEVEL_LABELS[advisory.school_level] ?? advisory.school_level}</span>
        </span>
      </TableCell>

      <TableCell>
        <span className="text-sm font-medium text-neutral-900">{advisory.grade_level} · {advisory.section}</span>
        {advisory.strand && <div className="text-[11.5px] text-neutral-500">{advisory.strand}</div>}
      </TableCell>

      <TableCell>
        {adviserStatus
          ? <StatusDot status={adviserStatus} map={ADVISER_STATUS_MAP} />
          : <span className="text-sm italic text-neutral-500">—</span>}
      </TableCell>

      <TableCell onClick={(e) => e.stopPropagation()}>
        {readOnly ? (
          <span className="text-xs font-semibold text-neutral-500" title={`S.Y. ${advisory.school_year} is archived`}>Archived</span>
        ) : (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost" size="sm" icon="ti-pencil"
            aria-label={`Edit ${teacherName}'s advisory`}
            onClick={() => onEdit(advisory)}
          />
          <Button
            variant="ghost" size="sm" icon="ti-trash"
            aria-label={`Remove ${teacherName}'s advisory`}
            className="hover:bg-error-50 hover:text-error-500"
            onClick={() => onDelete(advisory)}
          />
        </div>
        )}
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
  // A failed load used to show "No advisory assignments found".
  const [loadError,  setLoadError]  = useState(null);
  const [search,     setSearch]     = useState("");
  const [levelFilter,  setLevelFilter]  = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // Opens on the current school year — still freely switchable to "All years"
  // ("") or any other year in use below.
  const [yearFilter, setYearFilter, yearIsDefault] = useYearFilter();
  // An archived year's advisers stay as they were. New assignments are still
  // fine: the form only offers years that are open.
  const isArchived = useArchivedYears();
  const [modal,      setModal]      = useState(null);
  const [toDelete,   setToDelete]   = useState(null);
  const [deleting,   setDeleting]   = useState(false);
  const searchRef = useRef(null);

  const teacherMap = useMemo(() => {
    const map = new Map();
    teachers.forEach((t) => map.set(t.user_id, t.name));
    return map;
  }, [teachers]);
  const activeTeacherIds = useMemo(
    () => new Set(teachers.filter((t) => t.is_active !== false).map((t) => t.user_id)),
    [teachers],
  );
  const { currentYear } = useSchoolYear();

  // Where each section's adviser stands. Gone means they can't sign in:
  // deactivated, or an account deleted before deactivation existed. Only
  // this year and later need a new one -- a past year's adviser leaving
  // afterwards is history, not a gap. Unknowable while the teacher list
  // failed to load, so nothing is flagged then.
  const adviserStatus = useCallback((a) => {
    if (teachersUnavailable) return null;
    if (activeTeacherIds.has(a.teacher_user_id)) return "active";
    return !currentYear || a.school_year >= currentYear ? "needs_adviser" : "deactivated";
  }, [teachersUnavailable, activeTeacherIds, currentYear]);
  const needingAdviser = useMemo(
    () => advisories.filter((a) => adviserStatus(a) === "needs_adviser"),
    [advisories, adviserStatus],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Teachers only: the full list carries every account's photo. Caught
      // on its own so a failure here doesn't reject the whole Promise.all
      // and blank the advisories list. teachersUnavailable then tells the
      // assign-teacher picker why it has no options.
      const [advisoryData, userData] = await Promise.all([
        getSectionAdvisories({ page_size: 500 }),
        getUsers({ role: "teacher" }).catch(() => null),
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
      console.error(e);
      setLoadError(e);
      setAdvisories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchData]);

  // The year menu offers the years that have an advisory, newest first.
  const yearList = useMemo(
    () => [...new Set(advisories.map((a) => a.school_year))].sort().reverse(),
    [advisories],
  );

  const teacherNameOf = useCallback(
    (a) => teacherMap.get(a.teacher_user_id) || `Removed account #${a.teacher_user_id}`,
    [teacherMap],
  );

  // Every advisory loads at once, so the band counts here: the year and the
  // Level menu narrow it, the search only the rows.
  const inScope = useMemo(() => advisories.filter((a) =>
    (!yearFilter || a.school_year === yearFilter) && (!levelFilter || a.school_level === levelFilter),
  ).sort(byYearGradeSection), [advisories, yearFilter, levelFilter]);
  const counts = loading || loadError ? null : {
    "": inScope.length,
    ...Object.fromEntries(Object.keys(ADVISER_STATUS_MAP).map((key) => [
      key,
      teachersUnavailable ? undefined : inScope.filter((a) => adviserStatus(a) === key).length,
    ])),
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inScope.filter((a) => {
      if (statusFilter && adviserStatus(a) !== statusFilter) return false;
      if (!q) return true;
      return teacherNameOf(a).toLowerCase().includes(q) ||
        a.section.toLowerCase().includes(q) ||
        a.grade_level.toLowerCase().includes(q);
    });
  }, [inScope, statusFilter, search, adviserStatus, teacherNameOf]);

  // The current year is where the page opens, so it isn't a filter to clear.
  const hasFilters = !yearIsDefault || Boolean(search.trim() || levelFilter || statusFilter);
  const clearFilters = () => {
    setYearFilter(null); setSearch(""); setLevelFilter(""); setStatusFilter("");
    searchRef.current?.focus();
  };

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

  const levelLabel = LEVEL_FILTER_OPTIONS.find((l) => l.value === levelFilter)?.label;
  const bandCaption = [
    `advisor${counts?.[""] === 1 ? "y" : "ies"} in ${yearFilter ? `S.Y. ${yearFilter}` : "all school years"}`,
    levelFilter && levelLabel,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        title="Teacher Advisories"
        actions={
          <Button icon="ti-plus" onClick={() => setModal({ mode: "create" })}>
            New Assignment
          </Button>
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">

        {/* ── Where each section's adviser stands, and the filter ──
            The school year sits in the band because its numbers are counted
            for it; its years are the ones with an advisory. */}
        <StatusBand
          total={counts?.[""]}
          caption={bandCaption}
          aside={<SchoolYearMenu value={yearFilter} onChange={setYearFilter} years={yearList} />}
          options={[
            { value: "", label: "All", count: counts?.[""] },
            ...Object.entries(ADVISER_STATUS_MAP).map(([key, meta]) => ({
              value: key,
              label: meta.label,
              count: counts?.[key],
              variant: meta.variant,
            })),
          ]}
          value={statusFilter}
          allValue=""
          onChange={setStatusFilter}
          label="Filter by adviser"
        />

        {needingAdviser.length > 0 && (
          <Alert variant="warning">
            {needingAdviser.length} section{needingAdviser.length === 1 ? "" : "s"} need{needingAdviser.length === 1 ? "s" : ""} a new adviser — the assigned teacher&apos;s account was deactivated or removed, so nobody can take attendance or enter grades there. Open the section to reassign it.
          </Alert>
        )}

        {/* ── Toolbar: search, the filter menu, Clear ── */}
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField
            id="advisories-search"
            label="Search advisories by teacher, grade or section"
            placeholder="Search by teacher name, grade level, or section…"
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

        <ArchivedYearNotice schoolYear={yearFilter} records="advisory assignments" />

        {/* ── Table ── */}
        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.1 : 0 }}
        >
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-baseline gap-2.5 border-b border-neutral-200 px-5 py-4">
              <h2 className="text-md font-bold text-neutral-900">
                {statusFilter ? ADVISER_STATUS_MAP[statusFilter].title : "All advisories"}
              </h2>
              {!loading && !loadError && (
                <span className="text-sm text-neutral-500 tabular-nums">{filtered.length.toLocaleString()}</span>
              )}
            </div>
            <Table
              headerVariant="quiet"
              columns={TABLE_COLUMNS}
              loading={loading}
              error={loadError}
              onRetry={fetchData}
              errorSubject="the advisory assignments"
              isEmpty={filtered.length === 0}
              skeletonRows={5}
              empty={{
                icon: "ti-user-off",
                title: hasFilters ? "No assignments match your filters" : "No advisory assignments yet",
                subtitle: hasFilters
                  ? "Try a different search, or clear the filters."
                  : "Assign a teacher to a section to get started",
                action: hasFilters ? (
                  <Button variant="secondary" size="sm" icon="ti-filter-off" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button size="sm" icon="ti-plus" onClick={() => setModal({ mode: "create" })}>
                    New Assignment
                  </Button>
                ),
              }}
            >
              {filtered.map((a) => (
                <AdvisoryRow
                  key={a.advisory_id}
                  advisory={a}
                  teacherName={teacherNameOf(a)}
                  adviserStatus={adviserStatus(a)}
                  readOnly={isArchived(a.school_year)}
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
            defaultYear={yearFilter}
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
