import { usePageTitle } from "../hooks/usePageTitle";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import ConfirmModal from "../components/ConfirmModal";
import Pagination from "../components/Pagination";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import useYearFilter from "../hooks/useYearFilter";
import useSections from "../hooks/useSections";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import StatusBand from "../components/ui/StatusBand";
import FilterMenu from "../components/ui/FilterMenu";
import SearchField from "../components/ui/SearchField";
import SchoolYearMenu from "../components/ui/SchoolYearMenu";
import { StatusBadge, StatusDot } from "../components/ui/Badge";
import { useSchoolYear } from "../context/SchoolYearContext";
import { ENROLLMENT_STATUS_MAP, STUDENT_STATUS_MAP } from "../constants/statusMaps";
import { GRADE_LEVELS_BY_LEVEL, LEVEL_FILTER_OPTIONS } from "../constants/schoolLevels";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
import { deleteStudent, getStudentCounts, getStudents } from "../api/studentApi";
import { getCurrentUser, hasAnyRole, ACADEMIC_STAFF } from "../utils/auth";

// The page is the school's masterlist, and the school year is its scope, set
// in the same menu as Enrollments, Grades and Subjects:
//
//   a year       that year's learners, one row each, with the grade and
//                section they were placed in, narrowed by level, grade and
//                section. A current or upcoming year can switch to the
//                learners not enrolled for it.
//   All years    every student record the school has, with where each was
//                last enrolled.
//
// It opens on the current year like every other year page. Links that mean
// everyone (the Dashboard's student total, the admin home's "Find a
// student") open it on All years with ?school_year=all.

const STATUS_FILTERS = ["all", "active", "inactive", "transferred", "graduated", "dropped"];

// What each scope is sorted by until a column header is clicked. `key` on a
// column doubles as the API's `ordering` field, prefixed with "-" for
// descending. "placement" is the order a class list reads in: grade, then
// section, then surname. The Not enrolled list is a worklist, A to Z.
const DEFAULT_ORDERING = { roll: "placement", unenrolled: "last_name", registry: "-student_id" };

// What the table caption says about the order rows are in, so nobody has to
// read the header carets to know. One per ordering the headers can produce.
const ORDERING_CAPTIONS = {
  "-student_id": "Newest registered first",
  placement:     "By grade and section, then last name",
  "-placement":  "By grade and section, highest grade first",
  last_name:     "Sorted by last name, A to Z",
  "-last_name":  "Sorted by last name, Z to A",
  birth_date:    "Sorted by age, oldest first",
  "-birth_date": "Sorted by age, youngest first",
};

const SEX_FILTERS = [
  { value: "",       label: "All" },
  { value: "male",   label: "Male" },
  { value: "female", label: "Female" },
];

const ENROLLMENT_VIEWS = [
  { value: "enrolled",     label: "Enrolled" },
  { value: "not_enrolled", label: "Not enrolled" },
];

// The years whose not-enrolled list means something: the one under way, and
// the next one while it is being enrolled into. For a past year it would
// only list the learners who joined after it.
const ENROLLING_STATES = new Set(["current", "upcoming"]);

// Long enough that a word is finished, short enough that the list keeps up.
const SEARCH_DEBOUNCE_MS = 300;

// The third column is where the learner is: their place in the year shown,
// or, with no one year to speak of, their latest enrollment.
function tableColumns(scope) {
  return [
    // `key` is the API ordering field for sortable columns, so the header the
    // user clicks and the value sent to the backend can't drift apart.
    { key: "last_name",  label: "Student",   width: "24%", sortable: true },
    { key: "lrn",        label: "LRN",       width: "13%" },
    scope === "roll"
      ? { key: "placement",       label: "Grade · Section", width: "15%", sortable: true }
      : { key: "last_enrollment", label: "Last enrolled",   width: "15%" },
    { key: "birth_date", label: "Age",       width: "12%", sortable: true },
    { key: "sex",     label: "Sex",       width: "8%" },
    { key: "status",  label: "Status",    width: "10%" },
    { key: "contact", label: "Contact",   width: "12%" },
    { key: "actions", label: "Actions",   width: "6%", align: "right" },
  ];
}

const PAGE_SIZE = 20;

function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function fmtDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
  });
}

/** Consistent treatment for "this field is empty", instead of a blank cell. */
const Blank = () => <span className="text-sm italic text-neutral-500">—</span>;

/** A menu item's count, at its right edge. Nothing while counts load. */
const countNote = (n) =>
  n == null ? null : <span className="text-[11px] text-neutral-500 tabular-nums">{n.toLocaleString()}</span>;

export default function StudentsPage() {
  usePageTitle("Students");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canManage = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);
  const token = sessionStorage.getItem("access_token");

  const [schoolYear, setSchoolYear, yearIsDefault] = useYearFilter();
  const { currentYear, yearStates } = useSchoolYear();

  // ?search= is how the admin home's "Find a student" box lands here.
  const [search, setSearch]       = useState(() => searchParams.get("search") ?? "");
  const [inputVal, setInputVal]   = useState(() => searchParams.get("search") ?? "");
  const [statusFilter, setStatus] = useState(() => searchParams.get("status") ?? "all");
  const [sexFilter, setSexFilter] = useState("");
  const [view, setView]           = useState("enrolled");
  const [schoolLevel, setSchoolLevel] = useState("");
  const [gradeLevel, setGradeLevel]   = useState("");
  const [section, setSection]         = useState("");
  // null: the scope's own order (DEFAULT_ORDERING). A header click sets it.
  const [ordering, setOrdering]   = useState(null);
  // Bumped to load the list and counts again (after a delete, or Retry).
  const [reloadKey, setReloadKey] = useState(0);

  const [toDelete, setToDelete]   = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deletingStudent, setDeletingStudent] = useState(false);

  const searchRef = useRef(null);

  // ── Scope ────────────────────────────────────────────────────────────────
  const allYears = schoolYear === "";
  const yearState = yearStates?.[schoolYear];
  // Until the registry says what state the year is in, assume only the
  // current one is being enrolled into.
  const canListUnenrolled = !allYears && (yearState ? ENROLLING_STATES.has(yearState) : schoolYear === currentYear);
  const notEnrolled = canListUnenrolled && view === "not_enrolled";
  const scope = allYears ? "registry" : notEnrolled ? "unenrolled" : "roll";
  const placementOn = scope === "roll";

  // The one description of which students are listed. The list, its counts
  // and every request below are built from it, so they can't disagree.
  const filters = useMemo(() => ({
    search,
    status: statusFilter === "all" ? "" : statusFilter,
    sex: sexFilter,
    ...(scope === "roll" && {
      school_year: schoolYear,
      school_level: schoolLevel,
      grade_level: gradeLevel,
      section,
    }),
    ...(scope === "unenrolled" && { unenrolled: schoolYear }),
  }), [search, statusFilter, sexFilter, scope, schoolYear, schoolLevel, gradeLevel, section]);

  const effectiveOrdering = ordering ?? DEFAULT_ORDERING[scope];
  const filtersKey = JSON.stringify({ filters, ordering: effectiveOrdering });

  // The page number belongs to the filters it was picked under: change any
  // filter or the sort and the list starts again from page 1.
  const [pageState, setPageState] = useState({ key: filtersKey, page: 1 });
  const page = pageState.key === filtersKey ? pageState.page : 1;
  const goToPage = (p) => setPageState({ key: filtersKey, page: p });

  // ── Loading ──────────────────────────────────────────────────────────────
  // Each answer is stored with the request it answers, so a slow one for a
  // filter already left behind can't overwrite the list now on screen.
  const listKey = `${filtersKey}|${page}|${reloadKey}`;
  const [list, setList] = useState({ key: null, results: [], count: 0, next: null, previous: null, error: null });
  const loading = list.key !== listKey;

  useEffect(() => {
    if (!token) { navigate("/login"); return undefined; }
    let live = true;
    getStudents({ page, page_size: PAGE_SIZE, ordering: effectiveOrdering, ...filters })
      .then((data) => {
        if (live) setList({ key: listKey, results: data.results || [], count: data.count ?? 0, next: data.next, previous: data.previous, error: null });
      })
      .catch((err) => {
        if (!live) return;
        console.error(err);
        // Previously this was swallowed, so a failed request rendered as
        // "No students found" — indistinguishable from an empty database.
        setList({ key: listKey, results: [], count: 0, next: null, previous: null, error: err });
      });
    return () => { live = false; };
    // listKey stands for every input of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey]);

  // The band, menu counts and sex split. Non-critical: if they fail the band
  // shows dashes rather than blocking the page.
  const countsKey = `${JSON.stringify(filters)}|${reloadKey}`;
  const [counts, setCounts] = useState({ key: null, data: null, failed: false });

  useEffect(() => {
    if (!token) return undefined;
    let live = true;
    getStudentCounts(filters)
      .then((data) => { if (live) setCounts({ key: countsKey, data, failed: false }); })
      .catch((err) => {
        console.error(err);
        if (live) setCounts((c) => ({ key: countsKey, data: c.data, failed: true }));
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countsKey]);

  const tally = counts.data;
  const statusCounts = useMemo(() => {
    const byStatus = tally?.status ?? {};
    return { ...byStatus, all: Object.values(byStatus).reduce((sum, n) => sum + n, 0) };
  }, [tally]);

  // Sections of the chosen grade in the year shown, for the Section menu.
  const { sections } = useSections(placementOn ? schoolYear : "", placementOn ? gradeLevel : "");

  // ── Changing filters ─────────────────────────────────────────────────────
  // Search as you type: the box applies itself once typing pauses. Every
  // other filter is state the requests above read, so nothing here can land
  // with stale filters; Enter only skips the wait.
  useEffect(() => {
    if (inputVal === search) return undefined;
    const timer = setTimeout(() => setSearch(inputVal), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputVal, search]);

  // Any filter change also applies what is typed in the search box, so the
  // list never shows one search while the box says another. (The chips used
  // to read the box and paging read the last search, so page 2 dropped it.)
  const handleSearch = () => setSearch(inputVal);

  // A year opens on its own list, in its own order. Grade levels carry
  // across years; section names may not.
  const handleYear = (year) => {
    handleSearch();
    setSchoolYear(year);
    setView("enrolled");
    setSection("");
    setOrdering(null);
  };

  const handleView = (next) => { handleSearch(); setView(next); setOrdering(null); };

  const handleLevel = (level) => {
    handleSearch(); setSchoolLevel(level); setGradeLevel(""); setSection("");
  };

  const handleGrade = (grade) => { handleSearch(); setGradeLevel(grade); setSection(""); };

  const handleSection = (name) => { handleSearch(); setSection(name); };

  const handleStatusFilter = (val) => { handleSearch(); setStatus(val); };

  const handleSexFilter = (val) => { handleSearch(); setSexFilter(val); };

  const handleClearSearch = () => {
    setInputVal("");
    setSearch("");
    searchRef.current?.focus();
  };

  // Derived so the header caret always reflects the ordering actually in use.
  const sortKey = effectiveOrdering.replace(/^-/, "");
  const sortDir = effectiveOrdering.startsWith("-") ? "desc" : "asc";

  // Clicking a column header sorts by it, and clicking the active one flips
  // direction.
  const handleSort = (key) => {
    handleSearch();
    setOrdering(sortKey === key && sortDir === "asc" ? `-${key}` : key);
  };

  const handleClearAll = () => {
    setInputVal(""); setSearch(""); setStatus("all"); setSexFilter("");
    setView("enrolled"); setSchoolLevel(""); setGradeLevel(""); setSection("");
    setOrdering(null); setSchoolYear(null);
    searchRef.current?.focus();
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeletingStudent(true);
    setDeleteError("");
    try {
      await deleteStudent(toDelete.student_id);
      toast.success("Student deleted.");
      setToDelete(null);
      // The last row of the last page: that page is gone now.
      if (list.results.length === 1 && page > 1) goToPage(page - 1);
      setReloadKey((k) => k + 1);
    } catch (e) {
      const msg = e.message || "Delete failed.";
      setDeleteError(msg);
      toast.error(msg);
    } finally {
      setDeletingStudent(false);
    }
  };

  // Level, grade and section are kept while hidden (on All years or Not
  // enrolled), but only count while they narrow the list.
  const hasActiveFilters = Boolean(
    search || statusFilter !== "all" || sexFilter || ordering || !yearIsDefault || notEnrolled ||
    (placementOn && (schoolLevel || gradeLevel || section)),
  );
  const students = list.results;
  const totalPages = Math.ceil(list.count / PAGE_SIZE);

  // ── Menu options ─────────────────────────────────────────────────────────
  // Counts come from /counts/, each counted inside every other filter. The
  // "All" items show none: that number is the band's own total.
  const viewOptions = ENROLLMENT_VIEWS.map((o) => ({ ...o, note: countNote(tally?.enrollment?.[o.value]) }));
  const levelOptions = LEVEL_FILTER_OPTIONS.map((o) => ({
    ...o,
    note: o.value && tally ? countNote(tally.school_level?.[o.value] ?? 0) : null,
  }));
  const gradeOptions = [
    { value: "", label: "All grades" },
    ...(GRADE_LEVELS_BY_LEVEL[schoolLevel] ?? []).map((g) => ({
      value: g, label: g, note: tally ? countNote(tally.grade_level?.[g] ?? 0) : null,
    })),
  ];
  const sectionOptions = [
    { value: "", label: "All sections" },
    ...sections.map((s) => ({
      value: s.name, label: s.name, note: tally ? countNote(tally.section?.[s.name] ?? 0) : null,
    })),
  ];
  const levelLabel = LEVEL_FILTER_OPTIONS.find((l) => l.value === schoolLevel)?.label;

  // ── Band, title and footer lines ─────────────────────────────────────────
  // What the band's total counts: the scope, and the placement filters when
  // set, since the counts are taken inside them.
  const bandTotal = tally ? statusCounts.all : undefined;
  const s = bandTotal === 1 ? "" : "s";
  const bandCaption = [
    allYears
      ? `student${s} on record`
      : notEnrolled
        ? `learner${s} not enrolled for S.Y. ${schoolYear}`
        : `learner${s} in S.Y. ${schoolYear}`,
    placementOn && schoolLevel ? levelLabel : null,
    placementOn ? gradeLevel : null,
    placementOn ? section : null,
  ].filter(Boolean).join(" · ");

  const listTitle =
    statusFilter === "all"
      ? "All students"
      : `${STUDENT_STATUS_MAP[statusFilter]?.label ?? statusFilter} students`;

  // The masterlist's male/female split, for the list as filtered. With a sex
  // filter on, the count already says it.
  const sexSplit = !sexFilter && tally?.sex && counts.key === countsKey
    ? `${(tally.sex.male ?? 0).toLocaleString()} male · ${(tally.sex.female ?? 0).toLocaleString()} female`
    : null;

  const emptyState = (() => {
    if (search && !allYears) {
      return {
        icon: "ti-search",
        title: `No match in S.Y. ${schoolYear}`,
        subtitle: "They may be in another school year, or not enrolled in this one.",
        action: (
          <Button variant="secondary" size="sm" icon="ti-world-search" onClick={() => handleYear("")}>
            Search all years
          </Button>
        ),
      };
    }
    if (notEnrolled && !search && statusFilter === "all" && !sexFilter) {
      return {
        icon: "ti-circle-check",
        title: `Everyone is enrolled for S.Y. ${schoolYear}`,
        subtitle: "Every active student has a place this school year.",
      };
    }
    if (hasActiveFilters) {
      return {
        icon: "ti-users-off",
        title: "No students match these filters",
        subtitle: "Try a different search term, or clear the filters to see everyone.",
        action: (
          <Button variant="secondary" size="sm" icon="ti-filter-off" onClick={handleClearAll}>
            Clear filters
          </Button>
        ),
      };
    }
    if (!allYears) {
      return {
        icon: "ti-users-off",
        title: `No learners enrolled for S.Y. ${schoolYear} yet`,
        subtitle: "Enrollments made for this school year will list them here.",
      };
    }
    return {
      icon: "ti-users-off",
      title: "No students yet",
      subtitle: "Add your first student to get started.",
      action: canManage ? (
        <Button size="sm" icon="ti-user-plus" onClick={() => navigate("/students/new")}>
          New Student
        </Button>
      ) : null,
    };
  })();

  return (
    <>
      <PageHeader
        title="Students"
        actions={
          canManage && (
            <Button icon="ti-user-plus" onClick={() => navigate("/students/new")}>
              New Student
            </Button>
          )
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {/* The status mix, and the status filter. The school year sits in
            the band because the band's numbers are counted for it. No counts
            on the year menu: the context's are enrollment rows, and a senior
            high learner has two of those a year. */}
        <StatusBand
          total={bandTotal}
          caption={bandCaption}
          aside={<SchoolYearMenu value={schoolYear} onChange={handleYear} />}
          options={STATUS_FILTERS.map((v) => ({
            value: v,
            label: v === "all" ? "All" : STUDENT_STATUS_MAP[v]?.label ?? v,
            count: tally ? statusCounts[v] ?? 0 : undefined,
            variant: STUDENT_STATUS_MAP[v]?.variant,
          }))}
          value={statusFilter}
          allValue="all"
          onChange={handleStatusFilter}
        />

        {/* Toolbar: search, the filter menus, Clear. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchField
            id="student-search"
            label="Search students by name, LRN, or email"
            placeholder="Search by name, LRN, or email…"
            inputRef={searchRef}
            value={inputVal}
            onChange={setInputVal}
            onEnter={handleSearch}
            onClear={handleClearSearch}
          />

          <FilterMenu
            label="Sex"
            valueLabel={SEX_FILTERS.find((o) => o.value === sexFilter)?.label ?? "All"}
            active={Boolean(sexFilter)}
            options={SEX_FILTERS}
            value={sexFilter}
            onChange={handleSexFilter}
          />

          {canListUnenrolled && (
            <FilterMenu
              label="Enrollment"
              valueLabel={notEnrolled ? "Not enrolled" : "Enrolled"}
              active={notEnrolled}
              options={viewOptions}
              value={notEnrolled ? "not_enrolled" : "enrolled"}
              onChange={handleView}
              align="end"
              menuWidth={200}
            />
          )}

          {/* A learner's level, grade and section belong to one school year,
              so these narrow a year's list only, each within the one before. */}
          {placementOn && (
            <FilterMenu
              label="Level"
              valueLabel={levelLabel ?? "All levels"}
              active={Boolean(schoolLevel)}
              options={levelOptions}
              value={schoolLevel}
              onChange={handleLevel}
              align="end"
              menuWidth={220}
            />
          )}

          {placementOn && schoolLevel && (
            <FilterMenu
              label="Grade"
              valueLabel={gradeLevel || "All grades"}
              active={Boolean(gradeLevel)}
              options={gradeOptions}
              value={gradeLevel}
              onChange={handleGrade}
              align="end"
              menuWidth={180}
            />
          )}

          {placementOn && gradeLevel && (
            <FilterMenu
              label="Section"
              valueLabel={section || "All sections"}
              active={Boolean(section)}
              options={sectionOptions}
              value={section}
              onChange={handleSection}
              align="end"
              menuWidth={180}
            />
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearAll}
              className="focus-ring flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-error-600 transition-colors duration-150 hover:bg-brand-100"
            >
              <i className="ti ti-filter-off text-[14px]" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>

        {/* Results */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          <Card padding="none" className="overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-neutral-200 px-5 py-4">
              <div className="flex items-baseline gap-2.5">
                <h2 className="text-md font-bold text-neutral-900">{listTitle}</h2>
                {!loading && !list.error && (
                  <span className="text-sm text-neutral-500 tabular-nums">
                    {list.count.toLocaleString()}
                  </span>
                )}
              </div>
              {ORDERING_CAPTIONS[effectiveOrdering] && (
                <span className="text-[12px] text-neutral-500">{ORDERING_CAPTIONS[effectiveOrdering]}</span>
              )}
            </div>
            <Table
              headerVariant="quiet"
              columns={tableColumns(scope)}
              loading={loading}
              error={list.error}
              onRetry={() => setReloadKey((k) => k + 1)}
              errorSubject="students"
              isEmpty={students.length === 0}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              empty={emptyState}
            >
              {students.map((st) => {
                const palette = getAvatarPalette(`${st.last_name}${st.first_name}`);
                const age = calcAge(st.birth_date);
                const givenNames = [
                  st.first_name,
                  st.middle_name ? `${st.middle_name[0]}.` : "",
                  st.suffix ?? "",
                ].filter(Boolean).join(" ");
                const fullName = givenNames ? `${st.last_name}, ${givenNames}` : st.last_name;

                return (
                  <TableRow
                    key={st.student_id}
                    onClick={() => navigate(`/students/${st.student_id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                          style={{ background: palette.bg, color: palette.color }}
                          aria-hidden="true"
                        >
                          {initialsFrom(st.first_name, st.last_name)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-neutral-900 transition-colors group-hover:text-brand-600">
                            {fullName}
                          </div>
                          <div className="truncate text-xs text-neutral-500">
                            {st.email || <span className="italic">no email on file</span>}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      {st.lrn ? (
                        <span className="font-mono text-[12px] text-neutral-800">{st.lrn}</span>
                      ) : <Blank />}
                    </TableCell>

                    <TableCell>
                      {scope === "roll" ? <PlacementCell placement={st.placement} /> : <LastEnrolledCell last={st.last_enrollment} />}
                    </TableCell>

                    <TableCell>
                      {age !== null ? (
                        <>
                          <div className="text-sm font-semibold text-neutral-900">{age} yrs</div>
                          <div className="text-xs text-neutral-500">{fmtDate(st.birth_date)}</div>
                        </>
                      ) : <Blank />}
                    </TableCell>

                    <TableCell>
                      {st.sex ? (
                        <span className="inline-flex items-center gap-1.5 text-sm capitalize text-neutral-700">
                          <i
                            className={`ti ${st.sex === "male" ? "ti-mars" : "ti-venus"} text-[14px] text-neutral-600`}
                            aria-hidden="true"
                          />
                          {st.sex}
                        </span>
                      ) : <Blank />}
                    </TableCell>

                    <TableCell>
                      <StatusDot status={st.status} map={STUDENT_STATUS_MAP} />
                    </TableCell>

                    <TableCell>
                      {st.mobile_number ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-neutral-700">
                          <i className="ti ti-phone text-[13px] text-neutral-600" aria-hidden="true" />
                          {st.mobile_number}
                        </span>
                      ) : <Blank />}
                    </TableCell>

                    {/* Row actions must not trigger the row's own navigation. */}
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      {scope === "unenrolled" && canManage ? (
                        // The worklist's one job: give this learner a place.
                        <Button
                          variant="secondary" size="sm" icon="ti-clipboard-plus"
                          aria-label={`Enroll ${st.first_name} ${st.last_name} for S.Y. ${schoolYear}`}
                          onClick={() => navigate(`/enrollments/new?student=${st.student_id}&school_year=${encodeURIComponent(schoolYear)}`)}
                        >
                          Enroll
                        </Button>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost" size="sm" iconOnly icon="ti-chart-bar"
                            title="View grades"
                            aria-label={`View grades for ${st.first_name} ${st.last_name}`}
                            onClick={() => navigate(`/grades?student=${st.student_id}`)}
                          />
                          <Button
                            variant="ghost" size="sm" iconOnly icon="ti-pencil"
                            title="Edit student"
                            aria-label={`Edit ${st.first_name} ${st.last_name}`}
                            onClick={() => navigate(`/students/${st.student_id}/edit`)}
                          />
                          {canManage && (
                            <Button
                              variant="ghost" size="sm" iconOnly icon="ti-trash"
                              title="Delete student"
                              aria-label={`Delete ${st.first_name} ${st.last_name}`}
                              className="hover:bg-error-50 hover:text-error-500"
                              onClick={() => setToDelete(st)}
                            />
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </Table>
          </Card>
        </motion.div>

        {!loading && !list.error && list.count > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            count={list.count}
            note={sexSplit}
            hasPrevious={Boolean(list.previous)}
            hasNext={Boolean(list.next)}
            onPageChange={goToPage}
          />
        )}
      </div>

      <AnimatePresence>
        {toDelete && (
          <ConfirmModal
            icon="ti-trash"
            title="Delete student?"
            message={
              <>
                Delete{" "}
                <strong className="text-neutral-900">
                  {toDelete.first_name} {toDelete.last_name}
                </strong>
                ? This is only for a record created by mistake, such as a
                duplicate registration, and cannot be undone. A student who has
                ever been enrolled can&apos;t be deleted — change their status to
                Transferred, Dropped or Inactive instead.
              </>
            }
            confirmLabel="Delete student"
            loading={deletingStudent}
            error={deleteError}
            onConfirm={handleDelete}
            onCancel={() => { setToDelete(null); setDeleteError(""); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** Where the learner is placed in the year shown. "Enrolled" is the usual
 *  case and stays quiet; anything else gets its badge. */
function PlacementCell({ placement }) {
  if (!placement) return <Blank />;
  const status = placement.enrollment_status;
  // Senior high has a row per semester; say which one this is.
  const semester = placement.semester ? `${placement.semester} sem` : null;
  return (
    <>
      <div className="truncate text-sm font-semibold text-neutral-900">
        {[placement.grade_level, placement.section].filter(Boolean).join(" · ")}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
        {status === "enrolled" ? (
          <span>{["Enrolled", semester].filter(Boolean).join(" · ")}</span>
        ) : (
          <>
            <StatusBadge status={status} map={ENROLLMENT_STATUS_MAP} size="sm" showIcon={false} />
            {semester && <span>{semester}</span>}
          </>
        )}
      </div>
    </>
  );
}

/** null means never enrolled; a missing key means the server didn't say,
 *  which is not the same thing. */
function LastEnrolledCell({ last }) {
  if (last) {
    return (
      <>
        <div className="text-sm font-semibold text-neutral-900">S.Y. {last.school_year}</div>
        <div className="truncate text-xs text-neutral-500">
          {[last.grade_level, last.section].filter(Boolean).join(" · ")}
        </div>
      </>
    );
  }
  if (last === null) return <span className="text-sm italic text-neutral-500">Not enrolled yet</span>;
  return <Blank />;
}
