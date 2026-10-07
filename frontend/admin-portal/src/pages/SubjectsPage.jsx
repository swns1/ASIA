import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Alert from "../components/ui/Alert";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Modal from "../components/ui/Modal";
import Pagination from "../components/Pagination";
import StatusBand from "../components/ui/StatusBand";
import FilterMenu from "../components/ui/FilterMenu";
import SearchField from "../components/ui/SearchField";
import SchoolYearMenu from "../components/ui/SchoolYearMenu";
import { Field, Input, Select } from "../components/FormField";
import toast from "react-hot-toast";
import ConfirmModal from "../components/ConfirmModal";
import CarryOverModal from "../components/schoolYears/CarryOverModal";
import ArchivedYearNotice from "../components/schoolYears/ArchivedYearNotice";
import useYearFilter from "../hooks/useYearFilter";
import { useSchoolYear } from "../context/SchoolYearContext";
import { STATUS_DOT, STATUS_TEXT } from "../constants/statusTones";
import {
  GRADE_LEVELS_BY_LEVEL,
  LEVEL_DOTS,
  LEVEL_FILTER_OPTIONS,
  LEVEL_LABELS,
  SHS_STRANDS,
} from "../constants/schoolLevels";
import { getCurrentUser, hasAnyRole, ACADEMIC_STAFF, STAFF_ADMIN } from "../utils/auth";

// ── API ───────────────────────────────────────────────────────────────────────
import {
  getSubjects as _getSubjects,
  createSubject as _createSubject,
  updateSubject as _updateSubject,
  deleteSubject as _deleteSubject,
  getGradingTemplates as _getTemplates,
} from "../api/enrollmentApi";

const getSubjects   = (p = {}) => _getSubjects(p);
const createSubject = (p)      => _createSubject(p);
const updateSubject = (id, p)  => _updateSubject(id, p);
const deleteSubject = (id)     => _deleteSubject(id);
const getTemplates  = ()       => _getTemplates({ is_active: true });

// ── Constants ─────────────────────────────────────────────────────────────────
// The New/Edit Subject form's level choices. `chip` is spelled out rather than
// interpolated: Tailwind extracts class names statically, so a template like
// `bg-${tone}-50` would never ship.
const SCHOOL_LEVELS = [
  { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", chip: "bg-nursery-50 text-nursery-500" },
  { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          chip: "bg-kindergarten-50 text-kindergarten-500" },
  { value: "elementary",        label: "Elementary",   icon: "ti-book",          chip: "bg-elementary-50 text-elementary-500" },
  { value: "junior_highschool", label: "Junior HS",    icon: "ti-school",        chip: "bg-juniorhigh-50 text-juniorhigh-500" },
  { value: "senior_highschool", label: "Senior HS",    icon: "ti-certificate",   chip: "bg-seniorhigh-50 text-seniorhigh-500" },
];

// The band's legend: whether a subject can have grades worked out yet.
// Computing a grade needs the subject's grading template, and without one the
// server refuses, so "No template" is the part to fix. `param` is what the
// list asks the server for (?has_template=).
const TEMPLATE_FILTERS = [
  { value: "",   label: "All" },
  { value: "yes", label: "With template", variant: "success", param: true,  title: "Subjects with a template" },
  { value: "no",  label: "No template",   variant: "warning", param: false, title: "Subjects with no template" },
];

// Long enough that a word is finished, short enough that the list keeps up.
// The same wait as the other list pages.
const SEARCH_DEBOUNCE_MS = 300;

const PAGE_SIZE = 20;

const TABLE_COLUMNS = [
  { key: "name",     label: "Subject",           width: "26%" },
  { key: "code",     label: "Code",              width: "11%" },
  { key: "level",    label: "Level",             width: "15%" },
  { key: "grade",    label: "Grade",             width: "10%" },
  { key: "strand",   label: "Strand / semester", width: "12%" },
  { key: "template", label: "Grading template",  width: "18%" },
  { key: "actions",  label: "",                  width: "8%"  },
];

/** Consistent treatment for "this field is empty", instead of a blank cell. */
const Blank = () => <span className="text-sm italic text-neutral-500">—</span>;

/** A subject's grading template, as a dot matching the band's legend. */
function TemplateCell({ template }) {
  if (!template) {
    return (
      <span
        className={`inline-flex items-center gap-[7px] text-sm font-semibold ${STATUS_TEXT.warning}`}
        title="Teachers can't work out grades for this subject until it has a grading template."
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT.warning}`} aria-hidden="true" />
        No template
      </span>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-[3px]">
      <span className="flex min-w-0 items-center gap-[7px] text-sm font-medium text-neutral-900">
        <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT.success}`} aria-hidden="true" />
        <span className="truncate">{template.template_name}</span>
      </span>
      <span className="pl-[15px] text-[11.5px] text-neutral-500">
        {template.components?.length ?? 0} components · {template.total_weight ?? 0}%
      </span>
    </div>
  );
}

// ── Form Modal ────────────────────────────────────────────────────────────────
function SubjectModal({ subject, schoolYear, templates, onSave, onClose }) {
  const isEdit = Boolean(subject?.subject_id);
  const [form, setForm] = useState({
    subject_code:     subject?.subject_code     ?? "",
    subject_name:     subject?.subject_name     ?? "",
    school_level:     subject?.school_level     ?? "elementary",
    grade_level:      subject?.grade_level      ?? "Grade 1",
    strand:           subject?.strand           ?? "",
    semester:         subject?.semester         ?? "",
    grading_template: subject?.grading_template ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const isSHS = form.school_level === "senior_highschool";
  const gradeOptions = GRADE_LEVELS_BY_LEVEL[form.school_level] ?? [];

  const setF = (k, v) => setForm((f) => {
    const next = { ...f, [k]: v };
    if (k === "school_level") {
      next.grade_level = (GRADE_LEVELS_BY_LEVEL[v] ?? [])[0] ?? "";
      if (v !== "senior_highschool") { next.strand = ""; next.semester = ""; }
      else if (!next.semester) next.semester = "1st";
    }
    return next;
  });

  const handleSave = async () => {
    if (!form.subject_code.trim()) { setError("Subject code is required."); return; }
    if (!form.subject_name.trim()) { setError("Subject name is required."); return; }
    if (isSHS && !form.semester)   { setError("Semester is required for Senior HS."); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        // Set once: a subject stays in the year it was made for.
        ...(!isEdit && { school_year: schoolYear }),
        subject_code:     form.subject_code.trim(),
        subject_name:     form.subject_name.trim(),
        school_level:     form.school_level,
        grade_level:      form.grade_level,
        strand:           isSHS && form.strand ? form.strand : null,
        semester:         isSHS ? form.semester : null,
        grading_template: form.grading_template || null,
      };
      await onSave(isEdit ? subject.subject_id : null, payload);
    } catch (e) {
      const msg = e.message || "Failed to save subject.";
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
      icon="ti-book"
      title={isEdit ? "Edit Subject" : "New Subject"}
      description={isEdit ? `Update this S.Y. ${subject.school_year} subject` : `Add a subject to S.Y. ${schoolYear}'s curriculum`}
      // A part-filled form shouldn't be lost to a stray backdrop click.
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button icon="ti-check" loading={saving} onClick={handleSave}>
            {saving ? "Saving…" : isEdit ? "Update Subject" : "Create Subject"}
          </Button>
        </div>
      }
    >
        {/* Modal body */}
        <div style={{ padding: "22px 28px" }}>
          <AnimatePresence>
            {error && (
              <Alert key="modal-error" variant="error" icon="ti-alert-circle" className="mb-4">
                {error}
              </Alert>
            )}
          </AnimatePresence>

          {/* School level chips */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "#7a5050", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>School Level *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SCHOOL_LEVELS.map((lvl) => {
                const active = form.school_level === lvl.value;
                return (
                  <motion.button
                    key={lvl.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setF("school_level", lvl.value)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ duration: 0.12 }}
                    // The picked level wears its own colour. These read colour
                    // fields the level entries no longer carry, so nothing
                    // showed which level was picked.
                    className={`focus-ring inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-[7px] text-[12px] transition-colors duration-150 ${
                      active
                        ? `${lvl.chip} border-current font-bold`
                        : "border-neutral-200 bg-white font-medium text-neutral-600 hover:border-neutral-300"
                    }`}
                  >
                    <i className={`ti ${lvl.icon} text-[13px]`} aria-hidden="true" />{lvl.label}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Grid fields */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 16px" }}>
            <Field label="Subject Code" required>
              <Input value={form.subject_code} onChange={(e) => setF("subject_code", e.target.value)} placeholder="e.g. MATH-7" />
            </Field>
            <Field label="Grade Level" required>
              <Select value={form.grade_level} onChange={(e) => setF("grade_level", e.target.value)}>
                {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="Subject Name" required>
            <Input value={form.subject_name} onChange={(e) => setF("subject_name", e.target.value)} placeholder="e.g. Mathematics 7" />
          </Field>

          {/* SHS fields */}
          <AnimatePresence>
            {isSHS && (
              <motion.div
                key="shs-fields"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                style={{ overflow: "hidden" }}
              >
                <div style={{ padding: "14px 16px", background: "#fff8f6", border: "1px dashed #fca5a5", borderRadius: 10, marginBottom: 14 }}>
                  <div style={{ fontSize: 10.5, color: "#c92a2a", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>Senior HS specifics</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 16px" }}>
                    <Field label="Strand">
                      <Select value={form.strand} onChange={(e) => setF("strand", e.target.value)}>
                        <option value="">— Any strand —</option>
                        {SHS_STRANDS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </Field>
                    <Field label="Semester" required>
                      <Select value={form.semester} onChange={(e) => setF("semester", e.target.value)}>
                        <option value="1st">1st Semester</option>
                        <option value="2nd">2nd Semester</option>
                      </Select>
                    </Field>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Grading template */}
          <Field label="Grading Template">
            <Select value={form.grading_template || ""} onChange={(e) => setF("grading_template", e.target.value)}>
              <option value="">— No template assigned —</option>
              {templates.map((t) => (
                <option key={t.grading_template_id} value={t.grading_template_id}>
                  {t.template_name} ({t.school_level})
                </option>
              ))}
            </Select>
            <div className="mt-1.5 text-xs italic text-neutral-500">
              Determines how raw scores are weighted into a final grade.
            </div>
          </Field>
        </div>

    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function SubjectsPage() {
  usePageTitle("Subjects");
  // Saving a subject is the admin's and registrar's (the server refuses
  // everyone else), so nobody else is offered New, Edit or Delete.
  const canManage   = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);
  // Copying a year's setup across is the School Years API's, admin-only.
  const canCopy     = hasAnyRole(getCurrentUser(), STAFF_ADMIN);

  // Each school year has its own curriculum, copied forward from an earlier
  // year and adjusted. Opens on the current year (or the one in the link, e.g.
  // from a year's setup checklist); never "All years" -- the same code can
  // mean a different subject in another year.
  const [schoolYear, setSchoolYear, yearIsDefault] = useYearFilter({ allowAll: false });
  const { options: yearLabels, yearStates } = useSchoolYear();
  const archived = yearStates[schoolYear] === "archived";
  const canEdit = canManage && !archived;
  const [copying, setCopying] = useState(false);

  const [subjects,       setSubjects]       = useState([]);
  const [templates,      setTemplates]      = useState([]);
  const [loading,        setLoading]        = useState(true);
  // A failed load used to fall through to "No subjects for S.Y. … yet",
  // which invited copying a curriculum that was already there.
  const [loadError,      setLoadError]      = useState(null);
  const [search,         setSearch]         = useState("");
  const [inputVal,       setInputVal]       = useState("");
  const [levelFilter,    setLevelFilter]    = useState("");
  const [gradeFilter,    setGradeFilter]    = useState("");
  const [templateFilter, setTemplateFilter] = useState("");
  const [page,           setPage]           = useState(1);
  const [pageMeta,       setPageMeta]       = useState({ count: 0, next: null, previous: null });
  const [modal,          setModal]          = useState(null);
  const [toDelete,       setToDelete]       = useState(null);
  const [deleteError,    setDeleteError]    = useState("");
  const [countsReload,   setCountsReload]   = useState(0);
  const searchRef = useRef(null);

  const template = TEMPLATE_FILTERS.find((f) => f.value === templateFilter);
  const hasTemplate = template?.param;

  const fetchSubjects = useCallback(async (p = 1) => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = { page: p, school_year: schoolYear };
      if (search)      params.search       = search;
      if (levelFilter) params.school_level = levelFilter;
      if (gradeFilter) params.grade_level  = gradeFilter;
      if (hasTemplate !== undefined) params.has_template = hasTemplate;
      const data = await getSubjects(params);
      setSubjects(data.results || []);
      setPageMeta({ count: data.count, next: data.next, previous: data.previous });
      setPage(p);
    } catch (e) {
      console.error(e);
      setLoadError(e);
      setSubjects([]);
      setPageMeta({ count: 0, next: null, previous: null });
    } finally {
      setLoading(false);
    }
  }, [schoolYear, search, levelFilter, gradeFilter, hasTemplate]);

  // Any filter, or another year, is another list: back to its first page.
  useEffect(() => { fetchSubjects(1); }, [fetchSubjects]); // eslint-disable-line react-hooks/set-state-in-effect

  useEffect(() => {
    getTemplates().then((d) => setTemplates(Array.isArray(d) ? d : d?.results ?? [])).catch(() => {});
  }, []);

  // Search as you type: the box applies itself once typing pauses. Every
  // other filter is state the fetch above reads, so Enter only skips the wait.
  useEffect(() => {
    if (inputVal === search) return;
    const timer = setTimeout(() => setSearch(inputVal), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputVal, search]);

  // The band's numbers: the year's subjects (in the level and grade, when
  // set), with and without a template. Search and the template filter narrow
  // the rows, not the band, as on the other list pages. Kept with the scope
  // they were asked for, so a stale answer never shows.
  const countsKey = JSON.stringify({ schoolYear, levelFilter, gradeFilter, countsReload });
  const [counts, setCounts] = useState({ key: null, data: null });
  useEffect(() => {
    let cancelled = false;
    const { schoolYear: year, levelFilter: level, gradeFilter: grade } = JSON.parse(countsKey);
    const scope = {
      school_year: year,
      page_size: 1,
      ...(level && { school_level: level }),
      ...(grade && { grade_level: grade }),
    };
    Promise.all([
      getSubjects(scope),
      getSubjects({ ...scope, has_template: true }),
      getSubjects({ ...scope, has_template: false }),
    ])
      .then(([all, yes, no]) => {
        if (!cancelled) setCounts({ key: countsKey, data: { "": all.count, yes: yes.count, no: no.count } });
      })
      // Non-critical: the band reads "—" and the list still works.
      .catch(() => { if (!cancelled) setCounts({ key: countsKey, data: null }); });
    return () => { cancelled = true; };
  }, [countsKey]);
  const bandCounts = counts.key === countsKey ? counts.data : null;

  const refresh = () => {
    fetchSubjects(page);
    setCountsReload((k) => k + 1);
  };

  const handleSave = async (id, payload) => {
    if (id) await updateSubject(id, payload);
    else    await createSubject(payload);
    toast.success(id ? "Subject updated." : "Subject created.");
    setModal(null);
    refresh();
  };

  const [deletingSubject, setDeletingSubject] = useState(false);

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeletingSubject(true);
    setDeleteError("");
    try {
      await deleteSubject(toDelete.subject_id);
      toast.success("Subject deleted.");
      setToDelete(null);
      refresh();
    } catch (e) {
      const msg = e.message || "Delete failed.";
      setDeleteError(msg);
      toast.error(msg);
    } finally {
      setDeletingSubject(false);
    }
  };

  // What narrows the list. The year doesn't: every visit opens on one.
  const narrowed = Boolean(search || levelFilter || gradeFilter || templateFilter);
  // The current year is where the page opens, so it isn't a filter to clear.
  const hasFilters = narrowed || !yearIsDefault;
  const clearFilters = () => {
    setSchoolYear(null); // back to the current school year
    setInputVal(""); setSearch("");
    setLevelFilter(""); setGradeFilter(""); setTemplateFilter("");
    searchRef.current?.focus();
  };

  const totalPages = Math.ceil(pageMeta.count / PAGE_SIZE);
  const isFirstRender = useIsFirstRender();

  // What the band counts: the year, and the level and grade when set.
  const levelLabel = LEVEL_FILTER_OPTIONS.find((l) => l.value === levelFilter)?.label;
  const bandCaption = [
    `subject${bandCounts?.[""] === 1 ? "" : "s"} in S.Y. ${schoolYear}`,
    levelFilter && levelLabel,
    gradeFilter,
  ].filter(Boolean).join(" · ");

  const gradeMenuOptions = [
    { value: "", label: "All grades" },
    ...(GRADE_LEVELS_BY_LEVEL[levelFilter] ?? []).map((g) => ({ value: g, label: g })),
  ];

  return (
    <>
      <PageHeader
        title="Subjects"
        actions={
          canManage && (
            <>
              {canCopy && !archived && (
                <Button variant="secondary" icon="ti-copy" onClick={() => setCopying(true)}>
                  Copy from an earlier year
                </Button>
              )}
              <Button
                icon={archived ? "ti-lock" : "ti-plus"}
                disabled={archived}
                title={archived ? `S.Y. ${schoolYear} is archived, so its subjects are read-only` : undefined}
                onClick={() => setModal({ mode: "create" })}
              >
                New Subject
              </Button>
            </>
          )
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">

        {/* ── The template split, and its filter ──
            The school year sits in the band because its numbers are counted
            for it. A curriculum is always one year's, so there's no All years. */}
        <StatusBand
          total={bandCounts?.[""]}
          caption={bandCaption}
          aside={<SchoolYearMenu value={schoolYear} onChange={setSchoolYear} includeAllYears={false} />}
          options={TEMPLATE_FILTERS.map((f) => ({
            value: f.value,
            label: f.label,
            count: bandCounts?.[f.value],
            variant: f.variant,
          }))}
          value={templateFilter}
          allValue=""
          onChange={setTemplateFilter}
          label="Filter by grading template"
        />

        {/* ── Toolbar: search, the filter menus, Clear ──
            The menus open to the right edge, where the pills sit. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField
            id="subjects-search"
            label="Search subjects by code or name"
            placeholder="Search by code or name…"
            inputRef={searchRef}
            value={inputVal}
            onChange={setInputVal}
            onEnter={() => setSearch(inputVal)}
            onClear={() => { setInputVal(""); setSearch(""); }}
          />

          <FilterMenu
            label="Level"
            valueLabel={levelLabel ?? "All levels"}
            active={Boolean(levelFilter)}
            options={LEVEL_FILTER_OPTIONS}
            value={levelFilter}
            onChange={(v) => { setLevelFilter(v); setGradeFilter(""); }}
            align="end"
            menuWidth={220}
          />

          {/* A grade only narrows within a level. */}
          {levelFilter && (
            <FilterMenu
              label="Grade"
              valueLabel={gradeFilter || "All grades"}
              active={Boolean(gradeFilter)}
              options={gradeMenuOptions}
              value={gradeFilter}
              onChange={setGradeFilter}
              align="end"
              menuWidth={180}
            />
          )}

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

        <ArchivedYearNotice schoolYear={schoolYear} records="subjects" />

        {/* ── Table ── */}
        <motion.div
          initial={isFirstRender ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.1 : 0 }}
        >
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-baseline gap-2.5 border-b border-neutral-200 px-5 py-4">
              <h2 className="text-md font-bold text-neutral-900">{template?.title ?? "All subjects"}</h2>
              {!loading && !loadError && (
                <span className="text-sm text-neutral-500 tabular-nums">
                  {pageMeta.count.toLocaleString()}
                </span>
              )}
            </div>
            <Table
              headerVariant="quiet"
              columns={TABLE_COLUMNS}
              loading={loading}
              error={loadError}
              onRetry={() => fetchSubjects(page)}
              errorSubject="subjects"
              isEmpty={subjects.length === 0}
              skeletonRows={8}
              empty={{
                icon: "ti-book-off",
                withAvatar: false,
                title: narrowed ? "No subjects match these filters" : `No subjects for S.Y. ${schoolYear} yet`,
                subtitle: narrowed
                  ? "Try a different search, or clear the filters to see the whole year."
                  : canCopy
                    ? "Copy them from an earlier year, or add them one by one"
                    : "Add them one by one, or ask an admin to copy them from an earlier year",
                action: narrowed ? (
                  <Button variant="secondary" size="sm" icon="ti-filter-off" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null,
              }}
            >
              {subjects.map((sub) => (
                <TableRow
                  key={sub.subject_id}
                  onClick={canEdit ? () => setModal({ mode: "edit", subject: sub }) : undefined}
                >
                  <TableCell>
                    <div className="truncate text-[13px] font-semibold text-neutral-900 transition-colors group-hover:text-brand-600">
                      {sub.subject_name}
                    </div>
                  </TableCell>

                  <TableCell>
                    <span className="font-mono text-[12px] text-neutral-800">{sub.subject_code}</span>
                  </TableCell>

                  {/* The same dot as the Level menu, so a level reads the
                      same in both. */}
                  <TableCell>
                    <span className="flex min-w-0 items-center gap-2 text-sm text-neutral-800">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_DOTS[sub.school_level] ?? "bg-neutral-400"}`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{LEVEL_LABELS[sub.school_level] ?? sub.school_level}</span>
                    </span>
                  </TableCell>

                  <TableCell>
                    <span className="text-sm font-medium text-neutral-900">{sub.grade_level}</span>
                  </TableCell>

                  <TableCell>
                    {sub.strand || sub.semester ? (
                      <>
                        {sub.strand && <div className="text-sm text-neutral-800">{sub.strand}</div>}
                        {sub.semester && (
                          <div className="text-[11.5px] text-neutral-500">
                            {sub.semester === "1st" ? "1st Semester" : "2nd Semester"}
                          </div>
                        )}
                      </>
                    ) : <Blank />}
                  </TableCell>

                  <TableCell>
                    <TemplateCell template={sub.grading_template_detail} />
                  </TableCell>

                  {/* Row actions must not trigger the row's own click. */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {archived ? (
                      <span className="text-xs text-neutral-500">Archived</span>
                    ) : canManage ? (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost" size="sm" icon="ti-pencil"
                          aria-label={`Edit ${sub.subject_name}`}
                          onClick={() => setModal({ mode: "edit", subject: sub })}
                        />
                        <Button
                          variant="ghost" size="sm" icon="ti-trash"
                          aria-label={`Delete ${sub.subject_name}`}
                          className="hover:bg-error-50 hover:text-error-500"
                          onClick={() => setToDelete(sub)}
                        />
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          </Card>
        </motion.div>

        {!loading && !loadError && pageMeta.count > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            count={pageMeta.count}
            hasPrevious={Boolean(pageMeta.previous)}
            hasNext={Boolean(pageMeta.next)}
            onPageChange={(p) => fetchSubjects(p)}
          />
        )}

      </div>

      {/* Modals */}
      <AnimatePresence>
        {modal && (
          <SubjectModal
            key="subject-modal"
            subject={modal.mode === "edit" ? modal.subject : null}
            schoolYear={schoolYear}
            templates={templates}
            onSave={handleSave}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toDelete && (
          <ConfirmModal
            key="delete-modal"
            icon="ti-trash"
            title="Delete subject?"
            message={<>You&apos;re about to delete <strong className="text-neutral-900">{toDelete.subject_name}</strong>. This cannot be undone. A subject with grades or scores already recorded can&apos;t be deleted.</>}
            loading={deletingSubject}
            error={deleteError}
            onConfirm={handleDelete}
            onCancel={() => { setToDelete(null); setDeleteError(""); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {copying && (
          <CarryOverModal
            key="copy-subjects"
            schoolYear={schoolYear}
            years={yearLabels.map((label) => ({ label }))}
            availableParts={["subjects"]}
            initialParts={["subjects"]}
            onClose={() => setCopying(false)}
            onDone={() => { fetchSubjects(1); setCountsReload((k) => k + 1); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
