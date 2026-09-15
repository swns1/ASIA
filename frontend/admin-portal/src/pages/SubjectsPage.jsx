import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Alert from "../components/ui/Alert";
import Badge from "../components/ui/Badge";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Modal from "../components/ui/Modal";
import Pagination from "../components/Pagination";
import ChipGroup from "../components/ui/ChipGroup";
import FilterBar, { FilterRow, CollapsibleFilterRow } from "../components/ui/FilterBar";
import { Field, Input, Select } from "../components/FormField";
import toast from "react-hot-toast";
import ConfirmModal from "../components/ConfirmModal";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, hasAnyRole, ACADEMIC_STAFF } from "../utils/auth";

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
const deleteSubject = (id)     => _deleteSubject(id).catch(() => null);
const getTemplates  = ()       => _getTemplates({ is_active: true });

// ── Constants ─────────────────────────────────────────────────────────────────
// `tone` names the shared ChipGroup palette entry. This page previously had its
// own level→colour mapping unrelated to the one Enrollments and Requirements
// use, so the same school level rendered in three different colours.
const SCHOOL_LEVELS = [
  // `chip` is spelled out rather than interpolated: Tailwind extracts class
  // names statically, so a template like `bg-${tone}-50` would never ship.
  { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", tone: "nursery",      chip: "bg-nursery-50 text-nursery-500" },
  { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          tone: "kindergarten", chip: "bg-kindergarten-50 text-kindergarten-500" },
  { value: "elementary",        label: "Elementary",   icon: "ti-book",          tone: "elementary",   chip: "bg-elementary-50 text-elementary-500" },
  { value: "junior_highschool", label: "Junior HS",    icon: "ti-school",        tone: "juniorhigh",   chip: "bg-juniorhigh-50 text-juniorhigh-500" },
  { value: "senior_highschool", label: "Senior HS",    icon: "ti-certificate",   tone: "seniorhigh",   chip: "bg-seniorhigh-50 text-seniorhigh-500" },
];

const GRADE_LEVELS_BY_LEVEL = {
  nursery:           ["Nursery"],
  kindergarten:      ["Kindergarten"],
  elementary:        ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"],
  junior_highschool: ["Grade 7","Grade 8","Grade 9","Grade 10"],
  senior_highschool: ["Grade 11","Grade 12"],
};

const SHS_STRANDS = ["STEM","ABM","HUMSS","GAS","TVL-ICT","TVL-HE","TVL-IA","TVL-AFA","Arts and Design","Sports"];

const TABLE_COLUMNS = [
  { key: 'name',     label: 'Subject',          width: '28%' },
  { key: 'code',     label: 'Code',             width: '12%' },
  { key: 'level',    label: 'Level',            width: '14%' },
  { key: 'grade',    label: 'Grade',            width: '11%' },
  { key: 'strand',   label: 'Strand / Sem',     width: '16%' },
  { key: 'template', label: 'Grading Template', width: '15%' },
  { key: 'actions',  label: '',                 width: '4%'  },
];

const getLevelMeta = (level) => SCHOOL_LEVELS.find((l) => l.value === level) ?? SCHOOL_LEVELS[2];

// ── Skeleton ──────────────────────────────────────────────────────────────────

// ── Form Modal ────────────────────────────────────────────────────────────────
function SubjectModal({ subject, templates, onSave, onClose }) {
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
      description={isEdit ? "Update subject details" : "Add a new subject to the curriculum"}
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
                    onClick={() => setF("school_level", lvl.value)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ duration: 0.12 }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 99, border: `1.5px solid ${active ? lvl.color : "#f0e4e4"}`, background: active ? lvl.bg : "white", color: active ? lvl.color : "#855c5c", fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.14s" }}
                  >
                    <i className={`ti ${lvl.icon}`} style={{ fontSize: 13 }} />{lvl.label}
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
  const navigate    = useNavigate();
  const canManage   = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);

  const [subjects,     setSubjects]    = useState([]);
  const [templates,    setTemplates]   = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [search,       setSearch]      = useState("");
  const [inputVal,     setInputVal]    = useState("");
  const [levelFilter,  setLevelFilter] = useState("all");
  const [gradeFilter,  setGradeFilter] = useState("");
  const [page,         setPage]        = useState(1);
  const [pageMeta,     setPageMeta]    = useState({ count: 0, next: null, previous: null });
  const [modal,        setModal]       = useState(null);
  const [toDelete,     setToDelete]    = useState(null);
  const [deleteError,  setDeleteError] = useState("");

  const gradeOptions = levelFilter !== "all" ? (GRADE_LEVELS_BY_LEVEL[levelFilter] ?? []) : [];

  const fetchSubjects = useCallback(async (p = 1, term = search, level = levelFilter, grade = gradeFilter) => {
    setLoading(true);
    try {
      const params = { page: p };
      if (term)              params.search       = term;
      if (level !== "all")   params.school_level = level;
      if (grade)             params.grade_level  = grade;
      const data = await getSubjects(params);
      setSubjects(data.results || []);
      setPageMeta({ count: data.count, next: data.next, previous: data.previous });
      setPage(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, levelFilter, gradeFilter]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
    fetchSubjects(1, "", "all");
    getTemplates().then((d) => setTemplates(Array.isArray(d) ? d : d?.results ?? [])).catch(() => {});
  }, []);

  const handleSave = async (id, payload) => {
    if (id) await updateSubject(id, payload);
    else    await createSubject(payload);
    toast.success(id ? "Subject updated." : "Subject created.");
    setModal(null);
    fetchSubjects(page, search, levelFilter, gradeFilter);
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
      fetchSubjects(page, search, levelFilter, gradeFilter);
    } catch (e) {
      const msg = e.message || "Delete failed.";
      setDeleteError(msg);
      toast.error(msg);
    } finally {
      setDeletingSubject(false);
    }
  };

  const totalPages = Math.ceil(pageMeta.count / 20);

  const isFirstRender = useIsFirstRender();

  return (
    <>
      {/* Topbar */}
      <PageHeader
        title="Subjects"
        icon="ti-book"
        subtitle={loading ? "Loading…" : `${pageMeta.count.toLocaleString()} subjects in curriculum`}
        actions={
          <Button icon="ti-plus" onClick={() => setModal({ mode: "create" })}>
            New Subject
          </Button>
        }
      />

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Search + filters */}
        <FilterBar
          animate={isFirstRender}
          animateDelay={0.22}
          searchValue={inputVal}
          onSearchChange={setInputVal}
          onSearch={() => { setSearch(inputVal); fetchSubjects(1, inputVal, levelFilter, gradeFilter); }}
          onClearSearch={() => { setInputVal(""); setSearch(""); fetchSubjects(1, "", levelFilter, gradeFilter); }}
          searchPlaceholder="Search by code or name…"
          searchLabel="Search subjects"
          searchInputId="subjects-search"
          hasFilters={Boolean(search || levelFilter !== "all" || gradeFilter)}
          onClearFilters={() => {
            setInputVal(""); setSearch("");
            setLevelFilter("all"); setGradeFilter("");
            fetchSubjects(1, "", "all", "");
          }}
        >
          <FilterRow label="School Level">
            <ChipGroup
              options={[
                { value: "all", label: "All Subjects", icon: "ti-books", tone: "brand", count: !loading ? pageMeta.count : null },
                ...SCHOOL_LEVELS.map((l) => ({ value: l.value, label: l.label, icon: l.icon, tone: l.tone })),
              ]}
              value={levelFilter}
              onChange={(v) => {
                setLevelFilter(v);
                setGradeFilter("");
                fetchSubjects(1, inputVal, v, "");
              }}
              label="Filter by school level"
            />
          </FilterRow>

          <CollapsibleFilterRow open={levelFilter !== "all"} label="Grade Level">
            <ChipGroup
              options={["All Grades", ...gradeOptions].map((g) => ({
                value: g === "All Grades" ? "" : g,
                label: g,
              }))}
              value={gradeFilter}
              onChange={(v) => { setGradeFilter(v); fetchSubjects(1, inputVal, levelFilter, v); }}
              label="Filter by grade level"
              stagger
              generation={levelFilter}
            />
          </CollapsibleFilterRow>
        </FilterBar>

        {/* Table */}
        <motion.div
          initial={isFirstRender ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut", delay: isFirstRender ? 0.34 : 0 }}
        >
          <Card padding="none" className="overflow-hidden">
            <Table
              columns={TABLE_COLUMNS}
              loading={loading}
              isEmpty={subjects.length === 0}
              skeletonRows={8}
              empty={{
                icon: "ti-book-off",
                title: "No subjects found",
                subtitle: "Try a different search or add a new subject",
              }}
            >
              {subjects.map((sub) => {
                const lvlMeta = getLevelMeta(sub.school_level);
                const hasTpl  = sub.grading_template_detail;
                return (
                  <TableRow
                    key={sub.subject_id}
                    onClick={() => setModal({ mode: "edit", subject: sub })}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] ${lvlMeta.chip}`}>
                          <i className={`ti ${lvlMeta.icon} text-[15px]`} aria-hidden="true" />
                        </div>
                        <div className="text-[13px] font-semibold text-neutral-900 transition-colors group-hover:text-brand-600">
                          {sub.subject_name}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-700">
                        {sub.subject_code}
                      </span>
                    </TableCell>

                    <TableCell>
                      <Badge variant={lvlMeta.tone} icon={lvlMeta.icon} size="sm">
                        {lvlMeta.label}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-[13px] text-neutral-700">{sub.grade_level}</TableCell>

                    <TableCell>
                      {sub.strand || sub.semester ? (
                        <div className="text-xs text-neutral-700">
                          {sub.strand && <span className="block">{sub.strand}</span>}
                          {sub.semester && (
                            <span className="text-xs text-neutral-500">
                              {sub.semester === "1st" ? "1st Semester" : "2nd Semester"}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs italic text-neutral-500">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {hasTpl ? (
                        <div className="inline-flex flex-col gap-0.5">
                          <Badge variant="success" icon="ti-check" size="sm">
                            {hasTpl.template_name}
                          </Badge>
                          <span className="pl-0.5 text-xs text-neutral-500">
                            {hasTpl.components?.length ?? 0} components · {hasTpl.total_weight ?? 0}%
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300 px-2.5 py-0.5 text-xs italic text-neutral-500">
                          <i className="ti ti-minus text-[10px]" aria-hidden="true" />No template
                        </span>
                      )}
                    </TableCell>

                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost" size="sm" icon="ti-pencil"
                          aria-label={`Edit ${sub.subject_name}`}
                          onClick={() => setModal({ mode: "edit", subject: sub })}
                        />
                        {canManage && (
                          <Button
                            variant="ghost" size="sm" icon="ti-trash"
                            aria-label={`Delete ${sub.subject_name}`}
                            onClick={() => setToDelete(sub)}
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

        {!loading && pageMeta.count > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            count={pageMeta.count}
            hasPrevious={Boolean(pageMeta.previous)}
            hasNext={Boolean(pageMeta.next)}
            onPageChange={(p) => fetchSubjects(p, search, levelFilter, gradeFilter)}
          />
        )}

      </div>

      {/* Modals */}
      <AnimatePresence>
        {modal && (
          <SubjectModal
            key="subject-modal"
            subject={modal.mode === "edit" ? modal.subject : null}
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
            message={<>You're about to delete <strong style={{ color: "#1a0a0a" }}>{toDelete.subject_name}</strong>. This cannot be undone and may affect existing grades.</>}
            loading={deletingSubject}
            error={deleteError}
            onConfirm={handleDelete}
            onCancel={() => { setToDelete(null); setDeleteError(""); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}


