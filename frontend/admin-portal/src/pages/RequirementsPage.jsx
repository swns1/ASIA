import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Pagination from "../components/Pagination";
import StatusBand from "../components/ui/StatusBand";
import FilterMenu from "../components/ui/FilterMenu";
import SearchField from "../components/ui/SearchField";
import SchoolYearMenu from "../components/ui/SchoolYearMenu";
import { StatusDot } from "../components/ui/Badge";
import { ENROLLMENT_STATUS_MAP } from "../constants/statusMaps";
import { STATUS_DOT, STATUS_TEXT } from "../constants/statusTones";
import { GRADE_LEVELS_BY_LEVEL, LEVEL_DOTS, LEVEL_FILTER_OPTIONS } from "../constants/schoolLevels";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
import { getDocumentStatus } from "../api/enrollmentApi";
import { getStudent } from "../api/studentApi";
import useYearFilter from "../hooks/useYearFilter";
import RequirementDocumentsPanel from "../components/requirements/RequirementDocumentsPanel";

// ── Constants ─────────────────────────────────────────────────────────────────
// The band's legend: whether a learner has handed in every required document
// their placement asks for. "Missing documents" is who the registrar still has
// to chase -- a pending learner in it can't be enrolled until they're in.
// Red, as the checklist marks a missing required document.
const DOCUMENT_FILTERS = [
  { value: "",         label: "All",               title: "All learners" },
  { value: "complete", label: "Complete",          title: "Complete",          variant: "success" },
  { value: "missing",  label: "Missing documents", title: "Missing documents", variant: "error" },
];

// How a learner came into the year, which decides what they owe: a
// transferee also owes their old school's records.
const ENTRY_STATUS = {
  new:        { label: "New",        hint: "Starting school here, at Nursery, Kindergarten or Grade 1" },
  transferee: { label: "Transferee", hint: "Came from another school, so owes their records from there too" },
  continuing: { label: "Continuing", hint: "Spent an earlier school year here" },
};

// Long enough that a word is finished, short enough that the list keeps up.
// The same wait as the other list pages.
const SEARCH_DEBOUNCE_MS = 300;

const PAGE_SIZE = 20;

const TABLE_COLUMNS = [
  { key: "student",    label: "Student",            width: "28%" },
  { key: "placement",  label: "Grade / section",    width: "15%" },
  { key: "entry",      label: "Entry",              width: "11%" },
  { key: "documents",  label: "Required documents", width: "30%" },
  { key: "enrollment", label: "Enrollment",         width: "12%" },
  { key: "open",       label: "",                   width: "4%"  },
];

/** "Cruz, Ana M." -- the list is sorted by last name, as on Students. */
function fullName(st) {
  const given = [st.first_name, st.middle_name ? `${st.middle_name[0]}.` : "", st.suffix ?? ""]
    .filter(Boolean).join(" ");
  if (!st.last_name) return given || `Student #${st.student_id}`;
  return given ? `${st.last_name}, ${given}` : st.last_name;
}

/** A learner's required documents, as a dot matching the band's legend. */
function DocumentsCell({ row }) {
  if (!row.missing.length) {
    return (
      <div className="flex flex-col gap-[3px]">
        <span className={`inline-flex items-center gap-[7px] text-sm font-semibold ${STATUS_TEXT.success}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT.success}`} aria-hidden="true" />
          Complete
        </span>
        <span className="pl-[15px] text-[11.5px] text-neutral-500 tabular-nums">
          {row.required ? `${row.submitted} of ${row.required} in` : "None required"}
        </span>
      </div>
    );
  }
  const names = row.missing.map((m) => m.requirement_name).join(", ");
  return (
    <div className="flex min-w-0 flex-col gap-[3px]">
      <span className={`inline-flex items-center gap-[7px] text-sm font-semibold ${STATUS_TEXT.error}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT.error}`} aria-hidden="true" />
        Missing {row.missing.length} of {row.required}
      </span>
      <span className="truncate pl-[15px] text-[11.5px] text-neutral-600" title={names}>
        {names}
      </span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function RequirementsPage() {
  usePageTitle("Requirements");
  const navigate = useNavigate();

  // What a learner owes depends on where they're placed, which is per school
  // year, so the page shows one year at a time: the current one, or the one
  // in the link (see hooks/useYearFilter).
  const [schoolYear, setSchoolYear, yearIsDefault] = useYearFilter({ allowAll: false });
  const [levelFilter, setLevelFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [docsFilter,  setDocsFilter]  = useState("");
  const [search,      setSearch]      = useState("");
  const [inputVal,    setInputVal]    = useState("");
  const searchRef = useRef(null);

  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  // A failed load used to show "No students found", as if nobody owed a thing.
  const [loadError, setLoadError] = useState(null);
  const [page,      setPage]      = useState(1);
  const [pageMeta,  setPageMeta]  = useState({ count: 0, next: null, previous: null });

  // The learner whose checklist is open: their student record, and their row
  // for the year when they have one -- which says what they're asked for.
  const [selected,   setSelected]   = useState(null);
  const [reqRefresh, setReqRefresh] = useState(0);

  // Auth guard
  useEffect(() => {
    if (!sessionStorage.getItem("access_token")) navigate("/");
  }, [navigate]);

  // The band counts the year, level and grade; search and the documents
  // filter only narrow the rows. Kept with the scope it was counted for, so
  // another scope's numbers never show while the next ones load.
  const scopeKey = JSON.stringify({ schoolYear, levelFilter, gradeFilter });
  const [summary, setSummary] = useState({ key: null, data: null });
  const bandCounts = summary.key === scopeKey ? summary.data : null;

  const fetchRows = useCallback(async (p = 1) => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = { school_year: schoolYear, page: p, page_size: PAGE_SIZE };
      if (levelFilter) params.school_level = levelFilter;
      if (gradeFilter) params.grade_level  = gradeFilter;
      if (docsFilter)  params.documents    = docsFilter;
      if (search)      params.search       = search;
      const data = await getDocumentStatus(params);
      setRows(data.results ?? []);
      setPageMeta({ count: data.count ?? 0, next: data.next, previous: data.previous });
      setSummary({ key: scopeKey, data: data.summary ?? null });
      setPage(p);
    } catch (e) {
      console.error(e);
      setLoadError(e);
      setRows([]);
      setPageMeta({ count: 0, next: null, previous: null });
    } finally {
      setLoading(false);
    }
  }, [schoolYear, levelFilter, gradeFilter, docsFilter, search, scopeKey]);

  // Any filter, or another year, is another list: back to its first page.
  useEffect(() => { fetchRows(1); }, [fetchRows]); // eslint-disable-line react-hooks/set-state-in-effect

  // Search as you type: the box applies itself once typing pauses. Every
  // other filter is state the fetch above reads, so Enter only skips the wait.
  useEffect(() => {
    if (inputVal === search) return;
    const timer = setTimeout(() => setSearch(inputVal), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputVal, search]);

  // The checklist panel reports its counts after every load and every
  // change. A change to the open learner's documents moves their row and the
  // band, so the list is fetched again -- but not on the first report, which
  // is only the checklist loading.
  const lastReport = useRef(null);
  const handleReqChange = useCallback((counts) => {
    const report = `${counts.submitted}/${counts.total}/${counts.requiredMissing}`;
    if (lastReport.current !== null && lastReport.current !== report) fetchRows(page);
    lastReport.current = report;
  }, [fetchRows, page]);

  const openStudent = (student, row = null) => {
    lastReport.current = null;
    setSelected({ student, row });
  };
  const closeStudent = () => setSelected(null);

  // Deep link: /requirements?student=123[&school_year=…].
  //
  // The enrollment pages link here for the learner on screen, which is how a
  // registrar blocked by "missing required documents" gets somewhere that
  // can fix it. Their row for the year says what they're asked for; a
  // learner with none that year still opens, on the whole catalogue.
  const [searchParams] = useSearchParams();
  const deepLinkId = searchParams.get("student");
  useEffect(() => {
    if (!deepLinkId) return;
    let cancelled = false;
    (async () => {
      let row = null;
      try {
        const data = await getDocumentStatus({ school_year: schoolYear, student: deepLinkId, page_size: 1 });
        row = data.results?.[0] ?? null;
      } catch { /* the student alone still opens */ }
      let student = row;
      if (!student) {
        try { student = await getStudent(deepLinkId); } catch { return; /* a bad id leaves the list */ }
      }
      if (!cancelled && student) openStudent(student, row);
    })();
    return () => { cancelled = true; };
  }, [deepLinkId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every filter acts on the list, so it closes an open checklist to show it.
  const filterWith = (set) => (value) => { set(value); closeStudent(); };
  const changeLevel = (value) => { setLevelFilter(value); setGradeFilter(""); closeStudent(); };

  // What narrows the list. The year doesn't: every visit opens on one.
  const narrowed = Boolean(search || levelFilter || gradeFilter || docsFilter);
  // The current year is where the page opens, so it isn't a filter to clear.
  const hasFilters = narrowed || !yearIsDefault;
  const clearFilters = () => {
    setSchoolYear(null); // back to the current school year
    setInputVal(""); setSearch("");
    setLevelFilter(""); setGradeFilter(""); setDocsFilter("");
    closeStudent();
    searchRef.current?.focus();
  };

  const totalPages = Math.ceil(pageMeta.count / PAGE_SIZE);
  const isFirstRender = useIsFirstRender();

  // What the band counts: the year, and the level and grade when set.
  const levelLabel = LEVEL_FILTER_OPTIONS.find((l) => l.value === levelFilter)?.label;
  const bandCaption = [
    `learner${bandCounts?.learners === 1 ? "" : "s"} in S.Y. ${schoolYear}`,
    levelFilter && levelLabel,
    gradeFilter,
  ].filter(Boolean).join(" · ");

  const gradeMenuOptions = [
    { value: "", label: "All grades" },
    ...(GRADE_LEVELS_BY_LEVEL[levelFilter] ?? []).map((g) => ({ value: g, label: g })),
  ];

  const docsMeta = DOCUMENT_FILTERS.find((f) => f.value === docsFilter);
  const nobodyMissing = docsFilter === "missing" && !search && !levelFilter && !gradeFilter;

  return (
    <>
      <PageHeader title="Student Requirements" />

      <div className="flex-1 space-y-4 overflow-y-auto px-7 py-6">

        {/* ── Who has their documents in, and the filter ──
            The school year sits in the band because its numbers are counted
            for it. Documents are owed per placement, so there's no All years. */}
        <StatusBand
          total={bandCounts?.learners}
          caption={bandCaption}
          aside={
            <SchoolYearMenu
              value={schoolYear}
              onChange={filterWith(setSchoolYear)}
              includeAllYears={false}
            />
          }
          options={DOCUMENT_FILTERS.map((f) => ({
            value: f.value,
            label: f.label,
            count: bandCounts ? (f.value ? bandCounts[f.value] : bandCounts.learners) : undefined,
            variant: f.variant,
          }))}
          value={docsFilter}
          allValue=""
          onChange={filterWith(setDocsFilter)}
          label="Filter by documents"
        />

        {/* ── Toolbar: search, the filter menus, Clear ──
            The menus open to the right edge, where the pills sit. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField
            id="requirements-search"
            label="Search learners by name, LRN or section"
            placeholder="Search student name, LRN or section…"
            inputRef={searchRef}
            value={inputVal}
            onChange={filterWith(setInputVal)}
            onEnter={() => setSearch(inputVal)}
            onClear={() => { setInputVal(""); setSearch(""); }}
          />

          <FilterMenu
            label="Level"
            valueLabel={levelLabel ?? "All levels"}
            active={Boolean(levelFilter)}
            options={LEVEL_FILTER_OPTIONS}
            value={levelFilter}
            onChange={changeLevel}
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
              onChange={filterWith(setGradeFilter)}
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

        {selected ? (
          <StudentChecklist
            selected={selected}
            schoolYear={schoolYear}
            refreshKey={reqRefresh}
            onRefresh={() => setReqRefresh((k) => k + 1)}
            onChange={handleReqChange}
            onBack={closeStudent}
            onProfile={() => navigate(`/students/${selected.student.student_id}`)}
          />
        ) : (
          <>
            <motion.div
              initial={isFirstRender ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.1 : 0 }}
            >
              <Card padding="none" className="overflow-hidden">
                <div className="flex items-baseline gap-2.5 border-b border-neutral-200 px-5 py-4">
                  <h2 className="text-md font-bold text-neutral-900">{docsMeta?.title ?? "All learners"}</h2>
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
                  onRetry={() => fetchRows(page)}
                  errorSubject="the requirements list"
                  isEmpty={rows.length === 0}
                  skeletonRows={8}
                  // "Nobody is missing anything" is good news only when no
                  // search or menu is hiding learners.
                  empty={
                    nobodyMissing ? {
                      icon: "ti-mood-happy",
                      title: "Nobody is missing documents",
                      subtitle: `Every learner in S.Y. ${schoolYear} has handed in the required documents their placement asks for.`,
                    } : narrowed ? {
                      icon: "ti-users-off",
                      title: "No learners match these filters",
                      subtitle: "Try a different search, or clear the filters to see the whole year.",
                      action: (
                        <Button variant="secondary" size="sm" icon="ti-filter-off" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      ),
                    } : {
                      icon: "ti-users-off",
                      title: `No learners in S.Y. ${schoolYear} yet`,
                      subtitle: "Learners show here once they're enrolled for the year, or waiting to be.",
                    }
                  }
                >
                  {rows.map((r) => {
                    const name = fullName(r);
                    const palette = getAvatarPalette(`${r.last_name ?? ""}${r.first_name ?? ""}`);
                    const entry = ENTRY_STATUS[r.entry_status];
                    return (
                      <TableRow key={r.student_id} onClick={() => openStudent(r, r)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                              style={{ background: palette.bg, color: palette.color }}
                              aria-hidden="true"
                            >
                              {initialsFrom(r.first_name, r.last_name) || "?"}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-semibold text-neutral-900 transition-colors group-hover:text-brand-600">
                                {name}
                              </div>
                              <div className="truncate text-[11.5px] text-neutral-500">
                                {[r.lrn && `LRN ${r.lrn}`, r.student_number].filter(Boolean).join(" · ") || "—"}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {/* The same dot as the Level menu, so a level reads
                            the same in both. */}
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_DOTS[r.school_level] ?? "bg-neutral-400"}`}
                              aria-hidden="true"
                            />
                            <span className="truncate text-sm font-medium text-neutral-900">{r.grade_level}</span>
                          </div>
                          <div className="truncate pl-4 text-[11.5px] text-neutral-500">{r.section}</div>
                        </TableCell>

                        <TableCell>
                          <span className="text-sm text-neutral-800" title={entry?.hint}>
                            {entry?.label ?? r.entry_status}
                          </span>
                        </TableCell>

                        <TableCell>
                          <DocumentsCell row={r} />
                        </TableCell>

                        <TableCell>
                          <StatusDot status={r.enrollment_status} map={ENROLLMENT_STATUS_MAP} />
                        </TableCell>

                        <TableCell align="right">
                          <i className="ti ti-chevron-right text-sm text-neutral-500" aria-hidden="true" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
                onPageChange={(p) => fetchRows(p)}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

/**
 * One learner's document checklist, in place of the list. The checklist
 * itself is the shared panel the enrollment pages embed, so documents are
 * handled the same way everywhere; given the learner's row for the year, it
 * shows only what their placement asks for, which is what the list counted.
 */
function StudentChecklist({ selected, schoolYear, refreshKey, onRefresh, onChange, onBack, onProfile }) {
  const { student, row } = selected;
  const name = fullName(student);
  const palette = getAvatarPalette(`${student.last_name ?? ""}${student.first_name ?? ""}`);
  const entry = row && ENTRY_STATUS[row.entry_status];
  const facts = [
    student.lrn && `LRN ${student.lrn}`,
    row && [row.grade_level, row.section].filter(Boolean).join(" · "),
    entry?.label,
  ].filter(Boolean).join(" · ");

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="sm" icon="ti-arrow-left" onClick={onBack}>
              All learners
            </Button>
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{ background: palette.bg, color: palette.color }}
              aria-hidden="true"
            >
              {initialsFrom(student.first_name, student.last_name) || "?"}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-md font-bold text-neutral-900">{name}</h2>
              {facts && <div className="truncate text-[11.5px] text-neutral-500">{facts}</div>}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" size="sm" icon="ti-refresh" onClick={onRefresh}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" icon="ti-user" onClick={onProfile}>
              View profile
            </Button>
          </div>
        </div>

        {!row && (
          <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-5 py-2.5 text-[12.5px] text-neutral-700">
            <i className="ti ti-info-circle text-[15px] text-neutral-500" aria-hidden="true" />
            Not enrolled for S.Y. {schoolYear}, so every document in the catalogue is shown.
          </div>
        )}

        <div className="px-5 py-4">
          <RequirementDocumentsPanel
            studentId={student.student_id}
            student={student}
            variant="table"
            context={row ? { schoolLevel: row.school_level, entryStatus: row.entry_status } : null}
            refreshKey={refreshKey}
            onChange={onChange}
          />
        </div>
      </Card>
    </motion.div>
  );
}
