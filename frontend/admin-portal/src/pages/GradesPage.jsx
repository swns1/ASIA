import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../components/ui/PageHeader";
import Tabs from "../components/ui/Tabs";
import Card from "../components/ui/Card";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Button from "../components/ui/Button";
import StatusBand from "../components/ui/StatusBand";
import FilterMenu from "../components/ui/FilterMenu";
import SearchField from "../components/ui/SearchField";
import SchoolYearMenu from "../components/ui/SchoolYearMenu";
import toast from "react-hot-toast";
import AIInsightPanel from "../components/AIInsightPanel";
import Pagination from "../components/Pagination";
import Alert from "../components/ui/Alert";
import { GRADE_LEVELS_BY_LEVEL, LEVEL_FILTER_OPTIONS } from "../constants/schoolLevels";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
import { useSchoolYear } from "../context/SchoolYearContext";
import SelectionCard from "./grades/SelectionCard";
import ScoreSheet from "./grades/ScoreSheet";
import GradeBar from "./grades/GradeBar";
import SummaryCard from "./grades/SummaryCard";
import ObservedValues from "./grades/ObservedValues";
import {
  GRADE_LEGEND,
  GRADING_PERIODS_BY_LEVEL,
  PERIOD_LABELS,
  gradeStyle,
  periodsFor,
  subjectParamsFor,
  summarizeGrades,
} from "./grades/gradeRules";

// ── API ───────────────────────────────────────────────────────────────────────
import {
  getEnrollments as _getEnrollments,
  getGradeAverages as _getGradeAverages,
  getSubjects as _getSubjects,
  getGrades as _getGrades,
  getScoreEntries as _getScoreEntries,
  createScoreEntry as _createScore,
  updateScoreEntry as _updateScore,
  deleteScoreEntry as _deleteScore,
  computeGrade as _computeGrade,
  saveGrade as _saveGrade,
  updateGrade as _updateGrade,
  getNarrativeCategories as _getNarrativeCategories,
  getNarrativeReports as _getNarrativeReports,
  createNarrativeReport as _createNarrativeReport,
  updateNarrativeReport as _updateNarrativeReport,
  deleteNarrativeReport as _deleteNarrativeReport,
  callGemini,
} from "../api/enrollmentApi";
import { getStudent as _getStudent } from "../api/studentApi";
import useYearFilter from "../hooks/useYearFilter";
import useArchivedYears from "../hooks/useArchivedYears";
import ArchivedYearNotice from "../components/schoolYears/ArchivedYearNotice";
import { GRADE_PASSING } from "../utils/grading";
import useLatestRequest from "../hooks/useLatestRequest";

const getStudent              = (id)     => _getStudent(id);
const getEnrollments         = (p = {}) => _getEnrollments(p);
const getGradeAverages       = (p = {}) => _getGradeAverages(p);
const getSubjects            = (p = {}) => _getSubjects(p);
const getGrades              = (p = {}) => _getGrades(p);
const getScoreEntries        = (p = {}) => _getScoreEntries(p);
const createScore            = (p)      => _createScore(p);
const updateScore            = (id, p)  => _updateScore(id, p);
const deleteScore            = (id)     => _deleteScore(id);
const computeGrade           = (p = {}) => _computeGrade(p);
const saveGrade              = (p)      => _saveGrade(p);
const updateGrade            = (id, p)  => _updateGrade(id, p);
const getNarrativeCategories = (p = {}) => _getNarrativeCategories(p);
const getNarrativeReports    = (p = {}) => _getNarrativeReports(p);
const createNarrativeReport  = (p)      => _createNarrativeReport(p);
const updateNarrativeReport  = (id, p)  => _updateNarrativeReport(id, p);
const deleteNarrativeReport  = (id)     => _deleteNarrativeReport(id);

// Grades can be viewed whatever the enrollment's status -- a finished year is
// all `completed` -- so every page here lists the learners who attended.
// Pending and cancelled rows never have grades and are left out. Changing
// grades is locked only by an archived year (useArchivedYears), never by status.
const ATTENDED_STATUSES = "enrolled,completed,transferred_out";

// The band's legend: where each learner's average stands. "No grades" is a
// learner with nothing recorded yet, so the three add up to the total. `key`
// is the field of the grade-averages response that counts it.
const REMARK_FILTERS = [
  { value: "",       label: "All" },
  { value: "passed", label: "Passed",    variant: "success", key: "passed" },
  { value: "failed", label: "Failed",    variant: "error",   key: "failed" },
  { value: "none",   label: "No grades", variant: "muted",   key: "no_grades" },
];

const OVERVIEW_PAGE_SIZE = 20;

// Long enough that a word is finished, short enough that the list keeps up.
// The same wait as the Students and Enrollments lists.
const SEARCH_DEBOUNCE_MS = 300;

// Overview's sortable columns. `Table` renders the caret and wires the click,
// so the local SortIcon helper this page used is gone.
const OVERVIEW_COLUMNS = [
  { key: "name",        label: "Student",         align: "left", width: "40%" },
  { key: "grade_level", label: "Grade / Section", sortable: true },
  { key: "total",       label: "Grades",          sortable: true },
  { key: "passed",      label: "Passed",          sortable: true },
  { key: "failed",      label: "Failed",          sortable: true },
  { key: "avg",         label: "Average",         sortable: true },
];

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ onNavigate }) {

  const [schoolYear,    setSchoolYear, yearIsDefault] = useYearFilter();
  const [schoolLevel,   setSchoolLevel]   = useState("");
  const [gradeLevel,    setGradeLevel]    = useState("");
  const [gradingPeriod, setGradingPeriod] = useState("");
  const [remarks,       setRemarks]       = useState("");
  const [search,        setSearch]        = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [rows,     setRows]     = useState([]);
  // The roster fetch used to swallow its failure into `setRows([])`, so an
  // outage or a 403 rendered the same "No students found - try adjusting the
  // filters" as a genuinely empty result: the page told a registrar to fix
  // their filters while the server was down.
  const [loadError, setLoadError] = useState(null);
  const [pageMeta, setPageMeta] = useState({ count: 0, next: null, previous: null });
  // Set when the Passed/Failed filter narrows a page after the server has
  // already counted it — see fetchPage.
  const [filterNote, setFilterNote] = useState("");
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [sortKey,  setSortKey]  = useState("avg");
  const [sortDir,  setSortDir]  = useState("asc");
  const searchInputRef = useRef(null);

  // Search as you type: the box applies itself once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const gradeLevelOptions = schoolLevel ? (GRADE_LEVELS_BY_LEVEL[schoolLevel] ?? []) : [];
  const periodOptions     = schoolLevel ? (GRADING_PERIODS_BY_LEVEL[schoolLevel] ?? []) : [];

  // reset cascaded filters + page when level changes
  useEffect(() => { setGradeLevel(""); setGradingPeriod(""); }, [schoolLevel]);

  // The band's numbers: how every learner in the selection averages, from
  // the server. The rows below can only say so for the page they fetched.
  // Search narrows the rows, not the band, as on the other list pages. Kept
  // with the scope it was asked for, so a stale answer never shows.
  const averagesScope = {
    enrollment_status__in: ATTENDED_STATUSES,
    ...(schoolYear && { school_year: schoolYear }),
    ...(schoolLevel && { school_level: schoolLevel }),
    ...(gradeLevel && { grade_level: gradeLevel }),
    ...(gradingPeriod && { grading_period: gradingPeriod }),
  };
  const averagesKey = JSON.stringify(averagesScope);
  const [averages, setAverages] = useState({ key: null, data: null });
  useEffect(() => {
    let cancelled = false;
    getGradeAverages(JSON.parse(averagesKey))
      .then((d) => { if (!cancelled) setAverages({ key: averagesKey, data: d }); })
      // An older server without the endpoint: the band reads "—" and the
      // page works as before.
      .catch(() => { if (!cancelled) setAverages({ key: averagesKey, data: null }); });
    return () => { cancelled = true; };
  }, [averagesKey]);
  const counts = averages.key === averagesKey ? averages.data : null;

  const hasFilters = !yearIsDefault || schoolLevel || gradeLevel || gradingPeriod || remarks || search;

  const clearFilters = () => {
    setSchoolYear(null); // back to the current school year, not All years
    setSchoolLevel(""); setGradeLevel("");
    setGradingPeriod(""); setRemarks(""); setSearch(""); setPage(1);
  };

  const fetchPage = useCallback(async (nextPage, opts = {}) => {
    const sy  = opts.schoolYear    ?? schoolYear;
    const sl  = opts.schoolLevel   ?? schoolLevel;
    const gl  = opts.gradeLevel    ?? gradeLevel;
    const gp  = opts.gradingPeriod ?? gradingPeriod;
    const rm  = opts.remarks       ?? remarks;
    const srch = opts.search       ?? debouncedSearch;

    setLoading(true);
    setLoadError(null);
    try {
      const params = {
        page: nextPage,
        page_size: OVERVIEW_PAGE_SIZE,
        enrollment_status__in: ATTENDED_STATUSES,
      };
      if (sy)   params.school_year  = sy;
      if (sl)   params.school_level = sl;
      if (gl)   params.grade_level  = gl;
      if (srch) params.search       = srch;

      const d = await getEnrollments(params);
      const enrollments = Array.isArray(d) ? d : d?.results ?? [];
      const meta = { count: d?.count ?? enrollments.length, next: d?.next ?? null, previous: d?.previous ?? null };

      const gradeParams = {};
      if (gp) gradeParams.grading_period = gp;

      const gradeResults = await Promise.all(
        enrollments.map((en) =>
          getGrades({ enrollment: en.enrollment_id, page_size: 200, ...gradeParams })
            .then((g) => Array.isArray(g) ? g : g?.results ?? [])
            .catch(() => [])
        )
      );

      let built = enrollments.map((en, i) => {
        const grades = gradeResults[i];
        const nums   = grades.map((g) => parseFloat(g.numeric_grade)).filter((n) => !isNaN(n));
        const avg    = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
        const passed = grades.filter((g) => parseFloat(g.numeric_grade) >= GRADE_PASSING).length;
        const failed = grades.filter((g) => parseFloat(g.numeric_grade) < GRADE_PASSING && !isNaN(parseFloat(g.numeric_grade))).length;
        const sd     = en.student_detail ?? {};
        const name   = sd.full_name ?? [sd.first_name, sd.middle_name, sd.last_name, sd.suffix].filter(Boolean).join(" ");
        return { enrollment_id: en.enrollment_id, name, lrn: sd.lrn, student_number: sd.student_number, grade_level: en.grade_level, section: en.section, school_year: en.school_year, school_level: en.school_level, avg, passed, failed, total: grades.length, _student: sd, _enrollment: en };
      });

      // The Passed/Failed filter runs HERE, on the page the server already
      // returned, because it tests a per-learner average that only exists once
      // every enrollment's grades have been fetched -- there is no server-side
      // field to filter on.
      //
      // That is a real constraint, but the page used to hide it: `meta.count`
      // stayed the server's unfiltered total, so selecting "Failed" on a
      // 400-enrollment year showed two rows under a footer reading "Page 1 of
      // 20 · 400 total records", and every following page was mostly empty
      // with no way to tell how many failing learners there actually were.
      // The count is now labelled for what it is, and the band above says how
      // many there are in all.
      const fetchedOnPage = built.length;
      if (rm) {
        built = built.filter((r) => {
          if (rm === "passed") return r.avg !== null && r.avg >= GRADE_PASSING;
          if (rm === "failed") return r.avg !== null && r.avg < GRADE_PASSING;
          if (rm === "none")   return r.avg === null;
          return true;
        });
      }
      const rmLabel = REMARK_FILTERS.find((f) => f.value === rm)?.label ?? rm;
      setFilterNote(
        rm ? `${built.length} of ${fetchedOnPage} on this page match "${rmLabel}"` : "",
      );

      setRows(built);
      setPageMeta(meta);
      setPage(nextPage);
    } catch (e) {
      setRows([]);
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }, [schoolYear, schoolLevel, gradeLevel, gradingPeriod, remarks, debouncedSearch]);

  // Refetch from page 1 whenever filters change
  useEffect(() => { fetchPage(1); }, [schoolYear, schoolLevel, gradeLevel, gradingPeriod, remarks, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (av === null || av === undefined) av = sortDir === "asc" ? Infinity : -Infinity;
      if (bv === null || bv === undefined) bv = sortDir === "asc" ? Infinity : -Infinity;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [rows, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const totalPages   = Math.ceil(pageMeta.count / OVERVIEW_PAGE_SIZE);

  const isFirstRender = useIsFirstRender();

  // What the band counts: the year, and the level, grade and period when set.
  const remark = REMARK_FILTERS.find((f) => f.value === remarks);
  const bandCaption = [
    `enrollment${counts?.learners === 1 ? "" : "s"} in ${schoolYear ? `S.Y. ${schoolYear}` : "all school years"}`,
    schoolLevel && LEVEL_FILTER_OPTIONS.find((l) => l.value === schoolLevel)?.label,
    gradeLevel,
    gradingPeriod && PERIOD_LABELS[gradingPeriod],
  ].filter(Boolean).join(" · ");

  // The caption's number. With a pass/fail filter the rows are one page's
  // matches, so it says the band's whole count instead -- unless a search is
  // narrowing the rows, which the band doesn't follow.
  const captionCount = !remarks
    ? (!loading && !loadError ? pageMeta.count : null)
    : (!debouncedSearch ? counts?.[remark?.key] : null);

  return (
    <div className="space-y-4">

      {/* ── How the selection is doing, and the pass/fail filter ──
          The school year sits in the band because its numbers are counted
          for it. */}
      <StatusBand
        total={counts?.learners}
        caption={bandCaption}
        aside={<SchoolYearMenu value={schoolYear} onChange={setSchoolYear} />}
        options={REMARK_FILTERS.map((f) => ({
          value: f.value,
          label: f.label,
          count: counts ? (f.key ? counts[f.key] : counts.learners) : undefined,
          variant: f.variant,
        }))}
        value={remarks}
        allValue=""
        onChange={setRemarks}
        label="Filter by average"
      />

      {/* ── Toolbar: search, the filter menus, Clear ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchField
          id="grades-search"
          label="Search students by name or LRN"
          placeholder="Search student name or LRN…"
          inputRef={searchInputRef}
          value={search}
          onChange={setSearch}
          onEnter={() => setDebouncedSearch(search.trim())}
          onClear={() => setSearch("")}
        />

        <FilterMenu
          label="Level"
          valueLabel={LEVEL_FILTER_OPTIONS.find((l) => l.value === schoolLevel)?.label ?? "All levels"}
          active={Boolean(schoolLevel)}
          options={LEVEL_FILTER_OPTIONS}
          value={schoolLevel}
          onChange={setSchoolLevel}
          align="end"
          menuWidth={220}
        />

        {/* Grades and grading periods differ by level (quarters, or SHS
            semesters), so both wait for one. */}
        {schoolLevel && (
          <FilterMenu
            label="Grade"
            valueLabel={gradeLevel || "All grades"}
            active={Boolean(gradeLevel)}
            options={[{ value: "", label: "All grades" }, ...gradeLevelOptions.map((g) => ({ value: g, label: g }))]}
            value={gradeLevel}
            onChange={setGradeLevel}
            align="end"
            menuWidth={180}
          />
        )}

        {schoolLevel && (
          <FilterMenu
            label="Period"
            valueLabel={PERIOD_LABELS[gradingPeriod] ?? "All periods"}
            active={Boolean(gradingPeriod)}
            options={[{ value: "", label: "All periods" }, ...periodOptions.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))]}
            value={gradingPeriod}
            onChange={setGradingPeriod}
            align="end"
            menuWidth={200}
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

      <ArchivedYearNotice schoolYear={schoolYear} records="grades" />

      {/* ── Table ── */}
      <motion.div
        initial={isFirstRender ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26, ease: "easeOut", delay: isFirstRender ? 0.1 : 0 }}
      >
        <Card padding="none">
          <div className="flex items-baseline gap-2.5 border-b border-neutral-200 px-5 py-4">
            <h2 className="text-md font-bold text-neutral-900">
              {remarks ? remark?.label : "All enrollments"}
            </h2>
            {captionCount != null && (
              <span className="text-sm text-neutral-500 tabular-nums">{captionCount.toLocaleString()}</span>
            )}
          </div>
          <Table
            headerVariant="quiet"
            columns={OVERVIEW_COLUMNS}
            loading={loading}
            error={loadError}
            errorSubject="the class list"
            onRetry={() => fetchPage(1)}
            isEmpty={sorted.length === 0}
            skeletonRows={6}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            empty={
              // A search that filtered everything out is a different message
              // from having no students at all — the first is about the query,
              // the second about the filters.
              rows.length > 0
                ? { icon: "ti-search-off", title: "No matching students", subtitle: `No students match "${search}".` }
                : { icon: "ti-users", title: "No students found", subtitle: "Try adjusting the filters above." }
            }
          >
            {sorted.map((r) => {
              const gs  = gradeStyle(r.avg);
              const pal = getAvatarPalette(r.name);
              return (
                <TableRow key={r.enrollment_id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{ background: pal.bg, color: pal.color }}
                        aria-hidden="true"
                      >
                        {initialsFrom(r.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-neutral-900">{r.name}</div>
                        <div className="truncate text-[11.5px] text-neutral-500">LRN {r.lrn} · {r.student_number}</div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="secondary" size="sm" icon="ti-table"
                          onClick={(e) => { e.stopPropagation(); onNavigate("summary", r._student, r._enrollment); }}
                          title="View Grade Summary"
                        >
                          Summary
                        </Button>
                        <Button
                          variant="secondary" size="sm" icon="ti-pencil"
                          onClick={(e) => { e.stopPropagation(); onNavigate("entry", r._student, r._enrollment); }}
                          title="Go to Grade Entry"
                        >
                          Entry
                        </Button>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell align="center">
                    <div className="text-sm font-medium text-neutral-900">{r.grade_level}</div>
                    <div className="text-[11.5px] text-neutral-500">{r.section}</div>
                  </TableCell>

                  <TableCell align="center">
                    <span className="text-[13px] font-semibold text-neutral-900 tabular-nums">{r.total}</span>
                  </TableCell>

                  <TableCell align="center">
                    <span className="text-[13px] font-bold text-success-500 tabular-nums">{r.passed}</span>
                  </TableCell>

                  <TableCell align="center">
                    <span className={`text-[13px] font-bold tabular-nums ${r.failed > 0 ? "text-error-500" : "text-neutral-500"}`}>
                      {r.failed}
                    </span>
                  </TableCell>

                  <TableCell align="center">
                    {r.avg !== null ? (
                      <span
                        className="rounded-lg px-3 py-0.5 text-[13px] font-bold tabular-nums"
                        style={{ background: gs.bg, color: gs.color }}
                      >
                        {r.avg.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-xs italic text-neutral-500">No grades</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </Table>

          {/* Legend */}
          {!loading && !loadError && sorted.length > 0 && (
            <div className="flex flex-wrap items-center gap-3.5 border-t border-neutral-200 px-5 py-3">
              <span className="text-xs font-semibold text-neutral-500">Legend:</span>
              {GRADE_LEGEND.map((l) => (
                <div key={l.range} className="flex items-center gap-1.5">
                  <span
                    className="rounded-md px-1.5 py-0.5 text-xs font-bold"
                    style={{ background: l.bg, color: l.color }}
                  >
                    {l.range}
                  </span>
                  <span className="text-xs text-neutral-500">{l.label}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>

      {/* ── Pagination ── */}
      {!loading && pageMeta.count > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          count={pageMeta.count}
          note={filterNote}
          hasPrevious={!!pageMeta.previous}
          hasNext={!!pageMeta.next}
          onPageChange={fetchPage}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

const TAB_FOR_PATH = {
  "/grades/summary":  "summary",
  "/grades/entry":    "entry",
  "/grades/observed": "observed",
};

// How long scores sit still before the grade is worked out again: long enough
// that a teacher tabbing down a column doesn't fire a request per field.
const COMPUTE_DEBOUNCE_MS = 400;

/** Whether two grades are the same to the hundredth the server keeps. */
const sameGrade = (a, b) =>
  a !== null && a !== undefined && b !== null && b !== undefined && Math.abs(Number(a) - Number(b)) < 0.005;

/** A tab's right column before there's anything to show. */
function EmptyPanel({ icon, title, children }) {
  return (
    <Card padding="none" className="px-6 py-20 text-center">
      <i className={`ti ${icon} text-[28px] text-neutral-500`} aria-hidden="true" />
      <div className="mt-3 text-base font-semibold text-neutral-700">{title}</div>
      <div className="mt-1.5 text-[13px] text-neutral-500">{children}</div>
    </Card>
  );
}

export default function GradesPage() {
  usePageTitle("Grades");
  const location = useLocation();
  const [tab, setTab] = useState(TAB_FOR_PATH[location.pathname] ?? "overview");
  const { currentYear } = useSchoolYear();

  // ── Shared state (student + enrollment) ──────────────────────────────────
  const [student,     setStudent]     = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [enrollment,  setEnrollment]  = useState(null);
  // Grades of an archived year can be read, not changed -- corrections mean
  // unarchiving the year first.
  const isArchived = useArchivedYears();
  const entryReadOnly = isArchived(enrollment?.school_year);
  const [loadingEnr,  setLoadingEnr]  = useState(false);

  // ── Summary tab state ────────────────────────────────────────────────────
  const [sumGrades,   setSumGrades]   = useState([]);
  const [sumSubjects, setSumSubjects] = useState([]);
  const [loadingSum,  setLoadingSum]  = useState(false);

  // ── Entry tab state ──────────────────────────────────────────────────────
  const [entSubjects,    setEntSubjects]    = useState([]);
  const [subject,        setSubject]        = useState(null);
  const [gradingPeriod,  setGradingPeriod]  = useState("");
  const [scoreEntries,   setScoreEntries]   = useState([]);
  // The server's grade for the scores, and which scores it was worked out
  // from: it is kept while newer scores are being computed, and Save waits
  // until it matches what's on screen.
  const [computation,    setComputation]    = useState(null);
  const [computedFor,    setComputedFor]    = useState(null);
  const [manualRemarks,  setManualRemarks]  = useState(""); // teacher-editable override of computation.remarks
  // Once the teacher picks a remark it stays theirs; until then it follows
  // the computed grade.
  const remarksTouched = useRef(false);
  const [existingGrade,  setExistingGrade]  = useState(null);
  const [loadingScores,  setLoadingScores]  = useState(false);
  const [savingFinal,    setSavingFinal]    = useState(false);
  const [savedMsg,       setSavedMsg]       = useState("");
  const [entryError,     setEntryError]     = useState("");

  // ── Observed values state ────────────────────────────────────────────────
  const [narrativeCategories,   setNarrativeCategories]   = useState([]);
  const [narrativeReports,      setNarrativeReports]      = useState([]);
  const [loadingNarrative,      setLoadingNarrative]      = useState(false);
  const [narrativeSavingStates, setNarrativeSavingStates] = useState({});

  // ── Deep link: /grades?student=<id> preselects a student (e.g. from a
  // "View Grades" quick-link on the Students list) so staff land straight on
  // the overview tab instead of using the manual picker. Adding
  // &tab=summary&enrollment=<id> (e.g. from My Sections' per-row "Summary"
  // link) instead jumps straight to that enrollment's grade table, the same
  // place OverviewTab's own "Summary" action lands on. ─────────────────────
  const deepLinkRef = useRef(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const studentId = params.get("student");
    if (!studentId) return;
    deepLinkRef.current = {
      tab: params.get("tab"),
      enrollmentId: params.get("enrollment"),
    };
    getStudent(studentId)
      .then((s) => { if (s) setStudent(s); })
      .catch(() => toast.error("Could not load the requested student."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Once that student's enrollments have loaded, finish the summary deep
  // link: pick the requested enrollment (or the most recent one) and switch
  // to the Summary tab — mirrors what OverviewTab's onNavigate does manually.
  useEffect(() => {
    const pending = deepLinkRef.current;
    if (!pending || pending.tab !== "summary" || enrollments.length === 0) return;
    deepLinkRef.current = null;
    const match = pending.enrollmentId
      ? enrollments.find((e) => String(e.enrollment_id) === String(pending.enrollmentId))
      : null;
    setEnrollment(match ?? enrollments[0]);
    setTab("summary");
  }, [enrollments]);

  // ── Load enrollments when student changes ──────────────────────────────────
  // Every tab lists every attended enrollment; an archived year's opens read-only.
  useEffect(() => {
    if (!student) {
      setEnrollments([]); setEnrollment(null);
      setSumGrades([]); setSumSubjects([]);
      setSubject(null); setEntSubjects([]);
      setLoadingEnr(false);
      return;
    }
    // Each loader below drops an answer for a student, enrollment or period
    // the reader has already moved off. Landing last, it showed one record
    // under another's name -- and the entry forms save against what they
    // show, so a grade or rating could be filed on the wrong record.
    let cancelled = false;
    setLoadingEnr(true);
    getEnrollments({ student: student.student_id, enrollment_status__in: ATTENDED_STATUSES, page_size: 20 })
      .then((d) => { if (!cancelled) setEnrollments(Array.isArray(d) ? d : d?.results ?? []); })
      .catch(() => { if (!cancelled) setEnrollments([]); })
      .finally(() => { if (!cancelled) setLoadingEnr(false); });
    return () => { cancelled = true; };
  }, [student]);

  // ── Summary: load grades + subjects when enrollment changes ───────────────
  // Entry reads these grades too, for the subject list's "Saved grade".
  useEffect(() => {
    if (!enrollment) { setSumGrades([]); setSumSubjects([]); setLoadingSum(false); return; }
    let cancelled = false;
    setLoadingSum(true);
    Promise.all([
      getGrades({ enrollment: enrollment.enrollment_id, page_size: 200 })
        .then((d) => Array.isArray(d) ? d : d?.results ?? []),
      getSubjects(subjectParamsFor(enrollment))
        .then((d) => Array.isArray(d) ? d : d?.results ?? []),
    ])
      .then(([g, s]) => { if (!cancelled) { setSumGrades(g); setSumSubjects(s); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingSum(false); });
    return () => { cancelled = true; };
  }, [enrollment]);

  // ── Entry: load subjects when enrollment changes ──────────────────────────
  useEffect(() => {
    if (!enrollment) { setEntSubjects([]); setSubject(null); return; }
    let cancelled = false;
    getSubjects(subjectParamsFor(enrollment))
      .then((d) => { if (!cancelled) setEntSubjects(Array.isArray(d) ? d : d?.results ?? []); })
      .catch(() => { if (!cancelled) setEntSubjects([]); });
    const periods = periodsFor(enrollment);
    setGradingPeriod(periods[0] ?? "");
    setSubject(null);
    setComputation(null);
    remarksTouched.current = false;
    return () => { cancelled = true; };
  }, [enrollment]);

  // ── Entry: load scores when subject/period changes ────────────────────────
  const beginScoresLoad = useLatestRequest();
  const loadScores = useCallback(async () => {
    if (!enrollment || !subject || !gradingPeriod) return;
    const isCurrent = beginScoresLoad();
    setLoadingScores(true);
    try {
      const data = await getScoreEntries({
        enrollment_id:  enrollment.enrollment_id,
        subject_id:     subject.subject_id,
        grading_period: gradingPeriod,
        page_size:      200,
      });
      const g = await getGrades({ enrollment: enrollment.enrollment_id, subject: subject.subject_id, grading_period: gradingPeriod });
      if (!isCurrent()) return;
      setScoreEntries(Array.isArray(data) ? data : data?.results ?? []);
      const existing = (Array.isArray(g) ? g : g?.results ?? [])[0] ?? null;
      setExistingGrade(existing);
      if (!remarksTouched.current) setManualRemarks(existing?.remarks ?? "");
    } catch (e) { console.error(e); }
    finally { if (isCurrent()) setLoadingScores(false); }
  }, [enrollment, subject, gradingPeriod, beginScoresLoad]);

  useEffect(() => { loadScores(); }, [loadScores]);

  // ── Entry: the grade follows the scores ───────────────────────────────────
  // After any score is added, changed or removed, the server works the grade
  // out again: its formula (DepEd's, with the transmutation table) is the one
  // that counts. The last answer stays on screen until the new one lands.
  useEffect(() => {
    if (!enrollment || !subject?.grading_template_detail || !gradingPeriod) return;
    if (loadingScores || scoreEntries.length === 0) return;
    let cancelled = false;
    const basis = scoreEntries;
    const timer = setTimeout(async () => {
      try {
        const result = await computeGrade({
          enrollment_id: enrollment.enrollment_id, subject_id: subject.subject_id, grading_period: gradingPeriod,
        });
        if (cancelled) return;
        setComputation(result);
        setComputedFor(basis);
        // Passed or failed from the 75 mark, unless the grade is the one
        // already saved -- then whatever was saved with it.
        if (!remarksTouched.current) {
          setManualRemarks(
            existingGrade && sameGrade(result.final_grade, existingGrade.numeric_grade)
              ? existingGrade.remarks ?? ""
              : result.remarks ?? "",
          );
        }
      } catch (e) {
        if (cancelled) return;
        setEntryError(e.message || "Failed to compute grade.");
        setComputedFor(basis);
      }
    }, COMPUTE_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enrollment, subject, gradingPeriod, scoreEntries, existingGrade, loadingScores]);

  useEffect(() => {
    getNarrativeCategories({ is_active: true, page_size: 100 })
      .then((d) => setNarrativeCategories(Array.isArray(d) ? d : d?.results ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "observed" || !enrollment || !gradingPeriod) { setNarrativeReports([]); setLoadingNarrative(false); return; }
    let cancelled = false;
    setLoadingNarrative(true);
    getNarrativeReports({ enrollment: enrollment.enrollment_id, grading_period: gradingPeriod, page_size: 100 })
      .then((d) => { if (!cancelled) setNarrativeReports(Array.isArray(d) ? d : d?.results ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingNarrative(false); });
    return () => { cancelled = true; };
  }, [tab, enrollment, gradingPeriod]);

  const handleNarrativeRating = useCallback(async (category, existingReport, newRating) => {
    const catId = category.category_id;
    setNarrativeSavingStates((prev) => ({ ...prev, [catId]: true }));
    try {
      if (newRating === null) {
        if (existingReport) {
          await deleteNarrativeReport(existingReport.report_id);
          setNarrativeReports((prev) => prev.filter((r) => r.report_id !== existingReport.report_id));
        }
      } else if (existingReport) {
        const updated = await updateNarrativeReport(existingReport.report_id, { rating: newRating });
        setNarrativeReports((prev) => prev.map((r) => r.report_id === updated.report_id ? updated : r));
      } else {
        const created = await createNarrativeReport({ enrollment: enrollment.enrollment_id, category: catId, grading_period: gradingPeriod, rating: newRating });
        setNarrativeReports((prev) => [...prev, created]);
      }
    } catch (e) {
      console.error("Failed to save narrative report:", e);
      toast.error(e?.message || "Failed to save narrative rating.");
    }
    finally { setNarrativeSavingStates((prev) => ({ ...prev, [catId]: false })); }
  }, [enrollment, gradingPeriod]);

  const handleSaveFinal = async () => {
    if (!computation) return;
    setSavingFinal(true); setEntryError("");
    try {
      const payload = { enrollment: enrollment.enrollment_id, subject: subject.subject_id, grading_period: gradingPeriod, numeric_grade: computation.final_grade, remarks: manualRemarks || null };
      if (existingGrade) {
        await updateGrade(existingGrade.grade_id, { numeric_grade: computation.final_grade, remarks: manualRemarks || null });
      } else {
        await saveGrade(payload);
      }
      setSavedMsg("Grade saved");
      setTimeout(() => setSavedMsg(""), 3000);
      toast.success("Final grade saved.");
      remarksTouched.current = false;
      await loadScores();
      // Refresh summary grades too
      if (enrollment) {
        getGrades({ enrollment: enrollment.enrollment_id, page_size: 200 })
          .then((d) => setSumGrades(Array.isArray(d) ? d : d?.results ?? []))
          .catch(() => {});
      }
    } catch (e) {
      const msg = e.message || "Failed to save grade.";
      setEntryError(msg);
      toast.error(msg);
    }
    finally { setSavingFinal(false); }
  };

  // Each change reloads the sheet, and the new scores bring a new grade.
  const handleUpdateScore = async (id, payload) => { await updateScore(id, payload); await loadScores(); };
  const handleDeleteScore = async (id) => { await deleteScore(id); await loadScores(); };
  const handleCreateScore = async (fields) => {
    await createScore({
      enrollment:     enrollment.enrollment_id,
      subject:        subject.subject_id,
      grading_period: gradingPeriod,
      ...fields,
    });
    await loadScores();
  };

  // A new selection starts from its own saved grade and remark.
  const clearEntry = () => { setComputation(null); remarksTouched.current = false; };
  const pickStudent = (s) => { setStudent(s); setEnrollment(null); setSubject(null); clearEntry(); };
  const pickEnrollment = (en) => { setEnrollment(en); setSubject(null); clearEntry(); };
  const pickSubject = (sub) => { setSubject(sub); clearEntry(); };
  const pickPeriod = (p) => { setGradingPeriod(p); clearEntry(); };

  const periods  = periodsFor(enrollment);
  const template = subject?.grading_template_detail;

  const scoresByComponent = useMemo(() => {
    const map = {};
    scoreEntries.forEach((e) => {
      if (!map[e.grading_component]) map[e.grading_component] = [];
      map[e.grading_component].push(e);
    });
    return map;
  }, [scoreEntries]);

  // The subject list's "Saved grade": each subject's grade for this period.
  const savedGrades = useMemo(() => {
    const map = {};
    sumGrades.forEach((g) => { if (g.grading_period === gradingPeriod) map[g.subject] = g.numeric_grade; });
    return map;
  }, [sumGrades, gradingPeriod]);

  // ── The grade bar's state ─────────────────────────────────────────────────
  const shownComputation = scoreEntries.length > 0 ? computation : null;
  const computeFresh = scoreEntries.length === 0 || (computation !== null && computedFor === scoreEntries);
  const finalGrade = shownComputation?.final_grade ?? null;
  const complete = Boolean(shownComputation?.is_complete) && finalGrade !== null;
  const gradeChanged = complete && !sameGrade(finalGrade, existingGrade?.numeric_grade);
  const remarksChanged = complete && Boolean(existingGrade) && (manualRemarks || "") !== (existingGrade.remarks ?? "");
  const canSave = !entryReadOnly && computeFresh && complete && (gradeChanged || remarksChanged);
  const status = !complete
    ? { tone: "muted", icon: "ti-info-circle", text: "Add a score to every component to get a grade" }
    : gradeChanged || remarksChanged
      ? { tone: "warning", icon: "ti-point-filled", text: "Unsaved change" }
      : { tone: "success", icon: "ti-circle-check", text: savedMsg || "Up to date" };

  // ── Summary right panel ───────────────────────────────────────────────────
  const summaryPanel = !student ? (
    <EmptyPanel icon="ti-table" title="No student selected">
      Search for a student on the left to view their grade report.
    </EmptyPanel>
  ) : !enrollment ? (
    <EmptyPanel icon="ti-clipboard-list" title="Select a school year">
      Pick an enrollment from the left to see the grade table.
    </EmptyPanel>
  ) : (
    <div className="flex flex-col gap-4">
      <SummaryCard enrollment={enrollment} grades={sumGrades} subjects={sumSubjects} loading={loadingSum} />

      {!loadingSum && sumGrades.length === 0 && (
        <Alert variant="warning" title="No grades recorded yet">
          Use the Entry tab to start recording scores.
          <div className="mt-2.5">
            <Button size="sm" variant="secondary" icon="ti-pencil" onClick={() => setTab("entry")}>
              Go to Entry
            </Button>
          </div>
        </Alert>
      )}

      {!loadingSum && sumGrades.length > 0 && (
        <AIInsightPanel
          title="AI Grade Interpretation"
          description="Gemini-powered analysis of this student's academic performance"
          disabled={sumGrades.length === 0}
          onFetch={() => {
            const report = summarizeGrades(sumSubjects, sumGrades, periodsFor(enrollment));
            const subjectMap = {};
            sumSubjects.forEach((s) => { subjectMap[s.subject_id] = s.subject_name; });
            const gradesBySubject = {};
            sumGrades.forEach((g) => {
              const name = subjectMap[g.subject] ?? `Subject #${g.subject}`;
              if (!gradesBySubject[name]) gradesBySubject[name] = {};
              gradesBySubject[name][g.grading_period] = parseFloat(g.numeric_grade);
            });
            const recorded = sumGrades.map((g) => parseFloat(g.numeric_grade)).filter((n) => !Number.isNaN(n));
            const recordedAverage = recorded.length ? recorded.reduce((a, b) => a + b, 0) / recorded.length : null;
            // Subjects are passed or failed on their final rating. Before any
            // subject has one, say what is known -- how many quarter grades
            // pass or fail -- under names that say so. The page used to send
            // those quarter-grade counts as subjects.
            const hasFinals = report.rows.some((r) => r.final !== null);
            const counts = hasFinals
              ? { passed_subjects: report.passed.length, failed_subjects: report.failed.length }
              : {
                  passed_period_grades: recorded.filter((n) => n >= GRADE_PASSING).length,
                  failed_period_grades: recorded.filter((n) => n < GRADE_PASSING).length,
                };
            return callGemini("grade_report", {
              grade_level:     enrollment.grade_level,
              school_level:    enrollment.school_level,
              section:         enrollment.section,
              school_year:     enrollment.school_year,
              overall_average: (report.generalAverage ?? recordedAverage)?.toFixed(2),
              ...counts,
              total_grades:    recorded.length,
              grades_by_subject: gradesBySubject,
            });
          }}
        />
      )}
    </div>
  );

  // ── Entry right panel ─────────────────────────────────────────────────────
  const entryPanel = (
    <div className="flex flex-col gap-4">
      <ArchivedYearNotice schoolYear={enrollment?.school_year} records="grades" />
      {!student || !enrollment ? (
        <EmptyPanel icon="ti-pencil" title="Select a student and enrollment">
          Use the panel on the left to get started.
        </EmptyPanel>
      ) : !subject ? (
        <EmptyPanel icon="ti-book" title="Select a subject">
          Pick a subject from the left panel to enter scores.
        </EmptyPanel>
      ) : !template ? (
        <Alert variant="warning" title="No grading template assigned">
          “{subject.subject_name}” doesn't have a grading template. Go to <strong>Subjects</strong> and assign one first.
        </Alert>
      ) : (
        <>
          <AnimatePresence>
            {entryError && (
              <Alert key="entry-error" variant="error" dismissible onDismiss={() => setEntryError("")}>
                {entryError}
              </Alert>
            )}
          </AnimatePresence>
          <ScoreSheet
            subject={subject}
            template={template}
            gradingPeriod={gradingPeriod}
            scoresByComponent={scoresByComponent}
            loading={loadingScores}
            readOnly={entryReadOnly}
            onUpdate={handleUpdateScore}
            onDelete={handleDeleteScore}
            onCreate={handleCreateScore}
          />
          <GradeBar
            computation={shownComputation}
            fresh={computeFresh}
            existingGrade={existingGrade}
            statusTone={status.tone}
            statusIcon={status.icon}
            statusText={status.text}
            remarks={manualRemarks}
            onRemarksChange={(v) => { remarksTouched.current = true; setManualRemarks(v); }}
            canSave={canSave}
            saving={savingFinal}
            onSave={handleSaveFinal}
            readOnly={entryReadOnly}
          />
        </>
      )}
    </div>
  );

  // ── Observed values right panel ───────────────────────────────────────────
  const observedPanel = (
    <div className="flex flex-col gap-4">
      <ArchivedYearNotice schoolYear={enrollment?.school_year} records="grades" />
      {!student || !enrollment ? (
        <EmptyPanel icon="ti-clipboard-text" title="Select a student and enrollment">
          Use the panel on the left to get started.
        </EmptyPanel>
      ) : (
        <ObservedValues
          gradingPeriod={gradingPeriod}
          categories={narrativeCategories}
          reports={narrativeReports}
          loading={loadingNarrative}
          savingStates={narrativeSavingStates}
          onRatingChange={handleNarrativeRating}
          readOnly={entryReadOnly}
        />
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Grades"
        actions={
          <Tabs
            variant="pill"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "overview", icon: "ti-layout-list",    label: "Overview" },
              { id: "summary",  icon: "ti-table",          label: "Summary" },
              { id: "entry",    icon: "ti-pencil",         label: "Entry" },
              { id: "observed", icon: "ti-clipboard-text", label: "Observed values" },
            ]}
          />
        }
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-7 py-6">
        {tab === "overview" ? (
          <OverviewTab onNavigate={(targetTab, studentObj, enrollmentObj) => {
            setStudent(studentObj);
            setEnrollment(enrollmentObj);
            setSubject(null);
            clearEntry();
            setTab(targetTab);
          }} />
        ) : (
          // Below lg the selection card stacks above the content.
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[288px_minmax(0,1fr)]">
            <SelectionCard
              tab={tab}
              student={student}
              onPickStudent={pickStudent}
              onChangeStudent={() => pickStudent(null)}
              enrollments={enrollments}
              loadingEnrollments={loadingEnr}
              enrollment={enrollment}
              onPickEnrollment={pickEnrollment}
              currentYear={currentYear}
              subjects={entSubjects}
              subject={subject}
              onPickSubject={pickSubject}
              savedGrades={savedGrades}
              periods={periods}
              gradingPeriod={gradingPeriod}
              onPickPeriod={pickPeriod}
            />
            <div key={tab} className="min-w-0">
              {tab === "summary" ? summaryPanel : tab === "entry" ? entryPanel : observedPanel}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
