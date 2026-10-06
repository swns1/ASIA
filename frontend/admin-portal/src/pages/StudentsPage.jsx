import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import ConfirmModal from "../components/ConfirmModal";
import Pagination from "../components/Pagination";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import useYearFilter from "../hooks/useYearFilter";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import StatusBand from "../components/ui/StatusBand";
import FilterMenu from "../components/ui/FilterMenu";
import SearchField from "../components/ui/SearchField";
import { StatusDot } from "../components/ui/Badge";
import { STUDENT_STATUS_MAP } from "../constants/statusMaps";
import { useSchoolYear } from "../context/SchoolYearContext";
import { groupYears } from "../utils/schoolYear";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
import { deleteStudent, getStudents } from "../api/studentApi";
import { getCurrentUser, hasAnyRole, ACADEMIC_STAFF } from "../utils/auth";

const STATUS_FILTERS = ["all", "active", "inactive", "transferred", "graduated", "dropped"];

// Sorting lives on the column headers rather than a dropdown beside the
// search box, so the filter row matches every other list page. A column's
// `key` doubles as the API's `ordering` field, prefixed with "-" for
// descending — see DEFAULT_ORDERING below.
const DEFAULT_ORDERING = "-student_id";

// What the table caption says about the order rows are in, so nobody has to
// read the header carets to know. One per ordering the headers can produce.
const ORDERING_CAPTIONS = {
  [DEFAULT_ORDERING]: "Newest registered first",
  last_name:          "Sorted by last name, A to Z",
  "-last_name":       "Sorted by last name, Z to A",
  birth_date:         "Sorted by age, oldest first",
  "-birth_date":      "Sorted by age, youngest first",
};

const SEX_FILTERS = [
  { value: "",       label: "All" },
  { value: "male",   label: "Male" },
  { value: "female", label: "Female" },
];

// Long enough that a word is finished, short enough that the list keeps up.
const SEARCH_DEBOUNCE_MS = 300;

const TABLE_COLUMNS = [
  // `key` is the API ordering field for sortable columns, so the header the
  // user clicks and the value sent to the backend can't drift apart.
  { key: "last_name",  label: "Student",   width: "24%", sortable: true },
  { key: "lrn",        label: "LRN",       width: "13%" },
  // The page is the school's masterlist, so it says where each learner was:
  // their latest enrollment that wasn't cancelled, from the list response.
  { key: "last_enrollment", label: "Last enrolled", width: "15%" },
  { key: "birth_date", label: "Age",       width: "12%", sortable: true },
  { key: "sex",     label: "Sex",       width: "8%" },
  { key: "status",  label: "Status",    width: "10%" },
  { key: "contact", label: "Contact",   width: "12%" },
  { key: "actions", label: "Actions",   width: "6%", align: "right" },
];

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

export default function StudentsPage() {
  usePageTitle("Students");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canManage = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);

  const [students, setStudents]   = useState([]);
  // ?search= is how the admin home's "Find a student" box lands here.
  const [search, setSearch]       = useState(() => searchParams.get("search") ?? "");
  const [inputVal, setInputVal]   = useState(() => searchParams.get("search") ?? "");
  const [page, setPage]           = useState(1);
  const [pageMeta, setPageMeta]   = useState({ count: 0, next: null, previous: null });
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [toDelete, setToDelete]   = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [statusFilter, setStatus] = useState(() => searchParams.get("status") ?? "all");
  const [sexFilter, setSexFilter] = useState("");
  const [ordering, setOrdering]   = useState(DEFAULT_ORDERING);
  // Students registered but never enrolled for a given year. Both the
  // registration and enrolment forms tell the registrar that someone must
  // "enrol them later"; until this filter existed nothing in the app could
  // say who, so a learner could sit with no section and no grades unnoticed.
  const [isUnenrolled, setIsUnenrolled] = useState(false);
  // The year "Not enrolled" checks. Every year is its own choice in the
  // Enrollment menu, so the pill always names the year — during enrollment
  // season, that can be next year.
  const [unenrolledYear, setUnenrolledYear] = useYearFilter({ allowAll: false });
  const [statusCounts, setStatusCounts] = useState({});
  const [deletingStudent, setDeletingStudent] = useState(false);
  const { options: yearOptions, currentYear } = useSchoolYear();

  const searchRef = useRef(null);
  const token = sessionStorage.getItem("access_token");

  const fetchStudents = async (
    nextPage = 1,
    term = search,
    status = statusFilter,
    sex = sexFilter,
    ord = ordering,
    unenrolled = isUnenrolled,
  ) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getStudents({
        page: nextPage,
        page_size: PAGE_SIZE,
        search: term,
        status: status === "all" ? "" : status,
        sex,
        ordering: ord,
        unenrolled: unenrolled ? unenrolledYear : undefined,
      });
      setStudents(data.results || []);
      setPageMeta({ count: data.count, next: data.next, previous: data.previous });
      setPage(nextPage);
    } catch (err) {
      console.error(err);
      // Previously this was swallowed, so a failed request rendered as
      // "No students found" — indistinguishable from an empty database.
      setLoadError(err);
      setStudents([]);
      setPageMeta({ count: 0, next: null, previous: null });
    } finally {
      setLoading(false);
    }
  };

  // Per-status counts for the status band. Non-critical: if it fails the band
  // shows dashes rather than blocking the page.
  const fetchCounts = async () => {
    try {
      const counts = {};
      await Promise.all(
        ["", "active", "inactive", "transferred", "graduated", "dropped"].map(async (s) => {
          const res = await getStudents({ page: 1, search: "", status: s });
          counts[s === "" ? "all" : s] = res.count;
        })
      );
      setStatusCounts(counts);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!token) { navigate("/login"); return; }
    fetchStudents(1, search, statusFilter, "", DEFAULT_ORDERING);
    fetchCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when the year changes while "Not enrolled" is on — a pick in its
  // picker, or the current year arriving from School Settings. It used to
  // read the sidebar's year and never reloaded when that changed.
  useEffect(() => {
    if (!isUnenrolled) return;
    fetchStudents(1, search, statusFilter, sexFilter, ordering, true); // eslint-disable-line react-hooks/set-state-in-effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unenrolledYear]);

  // Search as you type: the list follows the box once typing pauses. `search`
  // is a dependency so that anything which applies the box itself (Enter, a
  // filter, Clear) cancels the pending run instead of fetching twice.
  useEffect(() => {
    if (inputVal === search) return;
    const timer = setTimeout(() => {
      setSearch(inputVal);
      fetchStudents(1, inputVal, statusFilter, sexFilter, ordering);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputVal, search]);

  // Every filter change also applies what's typed in the box. Without this a
  // search still waiting on its debounce would land after the filter, with
  // the filters as they were before it.
  const applyTypedSearch = () => {
    setSearch(inputVal);
    return inputVal;
  };

  const handleSearch = () => {
    fetchStudents(1, applyTypedSearch(), statusFilter, sexFilter, ordering);
  };

  const handleStatusFilter = (val) => {
    setStatus(val);
    fetchStudents(1, applyTypedSearch(), val, sexFilter, ordering);
  };

  const handleSexFilter = (val) => {
    setSexFilter(val);
    fetchStudents(1, applyTypedSearch(), statusFilter, val, ordering);
  };

  // Clicking a column header sorts by it, and clicking the active one flips
  // direction. `ordering` stays the single source of truth — sortKey/sortDir
  // below are derived from it so the header carets can't drift out of sync
  // with what the API was actually asked for.
  const handleSort = (key) => {
    const next = sortKey === key && sortDir === "asc" ? `-${key}` : key;
    setOrdering(next);
    fetchStudents(1, applyTypedSearch(), statusFilter, sexFilter, next);
  };

  // The Enrollment menu: "" for any enrollment, or a year for "Not enrolled
  // for {year}". A year only means something with the filter on, so picking
  // one turns it on.
  const handleEnrollmentFilter = (year) => {
    const term = applyTypedSearch();
    if (!year) {
      setIsUnenrolled(false);
      fetchStudents(1, term, statusFilter, sexFilter, ordering, false);
      return;
    }
    setUnenrolledYear(year);
    if (isUnenrolled) return; // the year effect above reloads
    setIsUnenrolled(true);
    // That effect only runs when the year actually changes.
    if (year === unenrolledYear) fetchStudents(1, term, statusFilter, sexFilter, ordering, true);
  };

  const handleClearAll = () => {
    setInputVal(""); setSearch(""); setStatus("all");
    setSexFilter(""); setOrdering(DEFAULT_ORDERING);
    setIsUnenrolled(false); setUnenrolledYear(null);
    fetchStudents(1, "", "all", "", DEFAULT_ORDERING, false);
    searchRef.current?.focus();
  };

  const handleClearSearch = () => {
    setInputVal("");
    setSearch("");
    fetchStudents(1, "", statusFilter, sexFilter, ordering);
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
      fetchStudents(page, search, statusFilter, sexFilter, ordering);
      fetchCounts();
    } catch (e) {
      const msg = e.message || "Delete failed.";
      setDeleteError(msg);
      toast.error(msg);
    } finally {
      setDeletingStudent(false);
    }
  };

  const hasActiveFilters =
    search || statusFilter !== "all" || sexFilter || ordering !== DEFAULT_ORDERING || isUnenrolled;

  // Derived so the header caret always reflects the ordering actually in use.
  const sortKey = ordering.replace(/^-/, "");
  const sortDir = ordering.startsWith("-") ? "desc" : "asc";
  const totalPages = Math.ceil(pageMeta.count / PAGE_SIZE);

  // The same years, in the same order, as the "Not enrolled for" picker this
  // menu replaced: the current year first, then recent, then earlier.
  const enrollmentOptions = [
    { value: "", label: "Any enrollment" },
    ...groupYears(yearOptions, currentYear).flatMap(([, years]) =>
      years.map((y) => ({ value: y, label: `Not enrolled for ${y}` })),
    ),
  ];

  const listTitle =
    statusFilter === "all"
      ? "All students"
      : `${STUDENT_STATUS_MAP[statusFilter]?.label ?? statusFilter} students`;

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
        {/* The status mix, and the status filter. */}
        <StatusBand
          total={statusCounts.all}
          caption={`student${statusCounts.all === 1 ? "" : "s"} registered`}
          aside={
            <span className="hidden text-sm text-brand-border sm:block">
              Pick a status to filter the list
            </span>
          }
          options={STATUS_FILTERS.map((v) => ({
            value: v,
            label: v === "all" ? "All" : STUDENT_STATUS_MAP[v]?.label ?? v,
            count: statusCounts[v],
            variant: STUDENT_STATUS_MAP[v]?.variant,
          }))}
          value={statusFilter}
          allValue="all"
          onChange={handleStatusFilter}
        />

        {/* Toolbar: search, the two filter menus, Clear. */}
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

          {/* Right-aligned: it sits near the page's right edge. */}
          <FilterMenu
            label="Enrollment"
            valueLabel={isUnenrolled ? `Not enrolled for ${unenrolledYear}` : "Any"}
            active={isUnenrolled}
            options={enrollmentOptions}
            value={isUnenrolled ? unenrolledYear : ""}
            onChange={handleEnrollmentFilter}
            align="end"
            menuWidth={240}
          />

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
                {!loading && !loadError && (
                  <span className="text-sm text-neutral-500 tabular-nums">
                    {pageMeta.count.toLocaleString()}
                  </span>
                )}
              </div>
              {ORDERING_CAPTIONS[ordering] && (
                <span className="text-[12px] text-neutral-500">{ORDERING_CAPTIONS[ordering]}</span>
              )}
            </div>
            <Table
              headerVariant="quiet"
              columns={TABLE_COLUMNS}
              loading={loading}
              error={loadError}
              onRetry={() => fetchStudents(page, search, statusFilter, sexFilter, ordering)}
              errorSubject="students"
              isEmpty={students.length === 0}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              empty={{
                icon: "ti-users-off",
                title: hasActiveFilters ? "No students match these filters" : "No students yet",
                subtitle: hasActiveFilters
                  ? "Try a different search term, or clear the filters to see everyone."
                  : "Add your first student to get started.",
                action: hasActiveFilters ? (
                  <Button variant="secondary" size="sm" icon="ti-filter-off" onClick={handleClearAll}>
                    Clear filters
                  </Button>
                ) : canManage ? (
                  <Button size="sm" icon="ti-user-plus" onClick={() => navigate("/students/new")}>
                    New Student
                  </Button>
                ) : null,
              }}
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

                    {/* null means never enrolled; a missing key means the
                        server didn't say, which is not the same thing. */}
                    <TableCell>
                      {st.last_enrollment ? (
                        <>
                          <div className="text-sm font-semibold text-neutral-900">
                            S.Y. {st.last_enrollment.school_year}
                          </div>
                          <div className="truncate text-xs text-neutral-500">
                            {[st.last_enrollment.grade_level, st.last_enrollment.section].filter(Boolean).join(" · ")}
                          </div>
                        </>
                      ) : st.last_enrollment === null ? (
                        <span className="text-sm italic text-neutral-500">Not enrolled yet</span>
                      ) : <Blank />}
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
            onPageChange={(p) => fetchStudents(p, search, statusFilter, sexFilter, ordering)}
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
