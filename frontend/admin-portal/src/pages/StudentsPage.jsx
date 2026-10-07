import { usePageTitle } from "../hooks/usePageTitle";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import ConfirmModal from "../components/ConfirmModal";
import Pagination from "../components/Pagination";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card, { StatCard } from "../components/ui/Card";
import ChipGroup from "../components/ui/ChipGroup";
import useYearFilter from "../hooks/useYearFilter";
import useSections from "../hooks/useSections";
import FilterBar, { CollapsibleFilterRow, FilterRow } from "../components/ui/FilterBar";
import SchoolYearPicker from "../components/ui/SchoolYearPicker";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import { StatusBadge } from "../components/ui/Badge";
import { useSchoolYear } from "../context/SchoolYearContext";
import { ENROLLMENT_STATUS_MAP, STUDENT_STATUS_MAP } from "../constants/statusMaps";
import { GRADE_LEVELS_BY_LEVEL } from "../constants/schoolLevels";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
import { deleteStudent, getStudentCounts, getStudents } from "../api/studentApi";
import { getCurrentUser, hasAnyRole, ACADEMIC_STAFF } from "../utils/auth";

// The page is the school's masterlist, and the school year is its scope, set
// in the same picker as Enrollments, Grades and Payments:
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

const SEX_FILTERS = [
  { value: "",       label: "All" },
  { value: "male",   label: "Male",   icon: "ti-mars" },
  { value: "female", label: "Female", icon: "ti-venus" },
];

// Same chips, icons and tones as the Enrollments page's level filter.
const LEVEL_FILTERS = [
  { value: "",                  label: "All Levels",   icon: "ti-layout-grid",   tone: "brand" },
  { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", tone: "nursery" },
  { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          tone: "kindergarten" },
  { value: "elementary",        label: "Elementary",   icon: "ti-book",          tone: "elementary" },
  { value: "junior_highschool", label: "Junior High",  icon: "ti-school",        tone: "juniorhigh" },
  { value: "senior_highschool", label: "Senior High",  icon: "ti-certificate",   tone: "seniorhigh" },
];

const ENROLLMENT_VIEWS = [
  { value: "enrolled",     label: "Enrolled",     icon: "ti-user-check" },
  { value: "not_enrolled", label: "Not enrolled", icon: "ti-user-exclamation" },
];

// The years whose not-enrolled list means something: the one under way, and
// the next one while it is being enrolled into. For a past year it would
// only list the learners who joined after it.
const ENROLLING_STATES = new Set(["current", "upcoming"]);

// Stat tiles double as status filters; tones come from the shared status map's
// semantics so the tile and the row badge agree.
const STAT_CARDS = [
  { status: "all",         label: "Total Students", icon: "ti-users",       tone: "brand" },
  { status: "active",      label: "Active",         icon: "ti-user-check",  tone: "success" },
  { status: "graduated",   label: "Graduated",      icon: "ti-certificate", tone: "info" },
  { status: "transferred", label: "Transferred",    icon: "ti-transfer",    tone: "warning" },
  { status: "dropped",     label: "Dropped",        icon: "ti-user-x",      tone: "error" },
];

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
    { key: "birth_date", label: "Age / DOB", width: "12%", sortable: true },
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

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** Consistent treatment for "this field is empty", instead of a blank cell. */
const Blank = () => <span className="text-sm italic text-neutral-500">—</span>;

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

  // The tiles, chip counts and header line. Non-critical: if they fail the
  // tiles show a dash rather than blocking the page.
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

  // Sections of the chosen grade in the year shown, for the Section chips.
  const { sections } = useSections(placementOn ? schoolYear : "", placementOn ? gradeLevel : "");

  // ── Changing filters ─────────────────────────────────────────────────────
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

  // ── Chip options ─────────────────────────────────────────────────────────
  // Counts come from /counts/, each counted inside every other filter, and a
  // chip shows its own only while selected. The "All" chips show none: that
  // number is the list's own total.
  const statusOptions = STATUS_FILTERS.map((v) => ({
    value: v,
    label: v === "all" ? "All" : STUDENT_STATUS_MAP[v]?.label ?? v,
    count: v === "all" ? null : statusCounts[v] ?? 0,
    // Same tone as the matching stat card, so clicking a card and seeing its
    // chip light up reads as one connected action instead of two disagreeing
    // colors.
    tone: v === "all" ? "brand" : STUDENT_STATUS_MAP[v]?.variant ?? "brand",
  }));
  const sexOptions = SEX_FILTERS.map((o) => ({ ...o, count: o.value ? tally?.sex?.[o.value] ?? 0 : null }));
  const viewOptions = ENROLLMENT_VIEWS.map((o) => ({ ...o, count: tally?.enrollment?.[o.value] ?? null }));
  const levelOptions = LEVEL_FILTERS.map((o) => ({ ...o, count: o.value ? tally?.school_level?.[o.value] ?? 0 : null }));
  const gradeOptions = [
    { value: "", label: "All Grades" },
    ...(GRADE_LEVELS_BY_LEVEL[schoolLevel] ?? []).map((g) => ({ value: g, label: g, count: tally?.grade_level?.[g] ?? 0 })),
  ];
  const sectionOptions = [
    { value: "", label: "All Sections" },
    ...sections.map((s) => ({ value: s.name, label: s.name, count: tally?.section?.[s.name] ?? 0 })),
  ];

  // ── Header and footer lines ──────────────────────────────────────────────
  const subtitle = !tally
    ? (counts.failed ? (allYears ? "Every student on record" : `S.Y. ${schoolYear}`) : "Loading records…")
    : allYears
      ? `${plural(tally.registered ?? 0, "student")} on record`
      : `${plural(tally.year_total ?? 0, "learner")} in S.Y. ${schoolYear}`;
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
        subtitle={subtitle}
        icon="ti-users"
        actions={
          canManage && (
            <Button icon="ti-user-plus" onClick={() => navigate("/students/new")}>
              New Student
            </Button>
          )
        }
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {/* Stat tiles — also the primary status filter */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {STAT_CARDS.map((card) => (
            <StatCard
              key={card.status}
              label={card.label}
              icon={card.icon}
              iconTone={card.tone}
              layout="horizontal"
              loading={!tally && !counts.failed}
              value={tally ? (statusCounts[card.status] ?? 0).toLocaleString() : "—"}
              active={statusFilter === card.status}
              onClick={() =>
                handleStatusFilter(statusFilter === card.status ? "all" : card.status)
              }
            />
          ))}
        </div>

        {/* Filters */}
        <FilterBar
          searchInputId="student-search"
          searchLabel="Search students by name, LRN, or email"
          searchPlaceholder="Search by name, LRN, or email…"
          searchRef={searchRef}
          searchValue={inputVal}
          onSearchChange={setInputVal}
          onSearch={handleSearch}
          onClearSearch={handleClearSearch}
          hasFilters={hasActiveFilters}
          onClearFilters={handleClearAll}
          // No counts: the context's are enrollment rows, and a senior high
          // learner has two of those a year.
          scope={<SchoolYearPicker value={schoolYear} onChange={handleYear} counts={{}} />}
        >
          {canListUnenrolled && (
            <FilterRow label={`Enrollment · S.Y. ${schoolYear}`}>
              <ChipGroup
                label={`Enrolled or not enrolled for S.Y. ${schoolYear}`}
                options={viewOptions}
                value={notEnrolled ? "not_enrolled" : "enrolled"}
                onChange={handleView}
              />
            </FilterRow>
          )}

          {/* A learner's level, grade and section belong to one school year,
              so these narrow a year's list only. */}
          <CollapsibleFilterRow open={placementOn} label="School Level">
            <ChipGroup
              label="Filter by school level"
              options={levelOptions}
              value={schoolLevel}
              onChange={handleLevel}
            />
          </CollapsibleFilterRow>

          <CollapsibleFilterRow open={placementOn && schoolLevel !== ""} label="Grade Level">
            <ChipGroup
              label="Filter by grade level"
              stagger
              generation={schoolLevel}
              options={gradeOptions}
              value={gradeLevel}
              onChange={handleGrade}
            />
          </CollapsibleFilterRow>

          <CollapsibleFilterRow open={placementOn && gradeLevel !== ""} label="Section">
            <ChipGroup
              label="Filter by section"
              stagger
              generation={`${schoolYear}|${gradeLevel}|${sections.length}`}
              options={sectionOptions}
              value={section}
              onChange={handleSection}
            />
          </CollapsibleFilterRow>

          <div className="flex flex-wrap gap-x-7 gap-y-3">
            <FilterRow label="Status">
              <ChipGroup
                label="Filter by status"
                options={statusOptions}
                value={statusFilter}
                onChange={handleStatusFilter}
              />
            </FilterRow>

            <FilterRow label="Sex">
              <ChipGroup
                label="Filter by sex"
                options={sexOptions}
                value={sexFilter}
                onChange={handleSexFilter}
              />
            </FilterRow>
          </div>
        </FilterBar>

        {/* Results */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          <Card padding="none" className="overflow-hidden">
            <Table
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
                const fullName = [
                  st.last_name, ",", st.first_name,
                  st.middle_name ? `${st.middle_name[0]}.` : "",
                  st.suffix ?? "",
                ].filter(Boolean).join(" ");

                return (
                  <TableRow
                    key={st.student_id}
                    onClick={() => navigate(`/students/${st.student_id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
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
                        <span className="rounded-sm bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-700">
                          {st.lrn}
                        </span>
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
                      <StatusBadge status={st.status} map={STUDENT_STATUS_MAP} />
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
