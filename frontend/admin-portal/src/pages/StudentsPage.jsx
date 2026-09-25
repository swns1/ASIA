import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useRef } from "react";
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
import FilterBar, { FilterRow } from "../components/ui/FilterBar";
import SchoolYearPicker from "../components/ui/SchoolYearPicker";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import { StatusBadge } from "../components/ui/Badge";
import { STUDENT_STATUS_MAP } from "../constants/statusMaps";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
import { deleteStudent, getStudents } from "../api/studentApi";
import { getCurrentUser, hasAnyRole, ACADEMIC_STAFF } from "../utils/auth";

const STATUS_FILTERS = ["all", "active", "inactive", "transferred", "graduated", "dropped"];

// Sorting lives on the column headers rather than a dropdown beside the
// search box, so the filter row matches every other list page. A column's
// `key` doubles as the API's `ordering` field, prefixed with "-" for
// descending — see DEFAULT_ORDERING below.
const DEFAULT_ORDERING = "-student_id";

const SEX_FILTERS = [
  { value: "",       label: "All" },
  { value: "male",   label: "Male",   icon: "ti-mars" },
  { value: "female", label: "Female", icon: "ti-venus" },
];

// Stat tiles double as status filters; tones come from the shared status map's
// semantics so the tile and the row badge agree.
const STAT_CARDS = [
  { status: "all",         label: "Total Students", icon: "ti-users",       tone: "brand" },
  { status: "active",      label: "Active",         icon: "ti-user-check",  tone: "success" },
  { status: "graduated",   label: "Graduated",      icon: "ti-certificate", tone: "info" },
  { status: "transferred", label: "Transferred",    icon: "ti-transfer",    tone: "warning" },
  { status: "dropped",     label: "Dropped",        icon: "ti-user-x",      tone: "error" },
];

const TABLE_COLUMNS = [
  // `key` is the API ordering field for sortable columns, so the header the
  // user clicks and the value sent to the backend can't drift apart.
  { key: "last_name",  label: "Student",   width: "24%", sortable: true },
  { key: "lrn",        label: "LRN",       width: "13%" },
  // The page is the school's masterlist, so it says where each learner was:
  // their latest enrollment that wasn't cancelled, from the list response.
  { key: "last_enrollment", label: "Last enrolled", width: "15%" },
  { key: "birth_date", label: "Age / DOB", width: "12%", sortable: true },
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
  const [isRecents, setIsRecents] = useState(false);
  // Students registered but never enrolled for a given year. Both the
  // registration and enrolment forms tell the registrar that someone must
  // "enrol them later"; until this filter existed nothing in the app could
  // say who, so a learner could sit with no section and no grades unnoticed.
  const [isUnenrolled, setIsUnenrolled] = useState(false);
  // The year "Not enrolled" checks. It opens on the current school year and
  // its picker is always shown, so the page always says which year the filter
  // means — during enrollment season, that can be next year.
  const [unenrolledYear, setUnenrolledYear] = useYearFilter({ allowAll: false });
  const [statusCounts, setStatusCounts] = useState({});
  const [deletingStudent, setDeletingStudent] = useState(false);

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

  // Per-status counts for the stat tiles. Non-critical: if it fails the tiles
  // show a dash rather than blocking the page.
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

  const handleSearch = () => {
    setSearch(inputVal);
    setIsRecents(false);
    fetchStudents(1, inputVal, statusFilter, sexFilter, ordering);
  };

  const handleStatusFilter = (val) => {
    setStatus(val);
    setIsRecents(false);
    fetchStudents(1, inputVal, val, sexFilter, ordering);
  };

  const handleSexFilter = (val) => {
    setSexFilter(val);
    setIsRecents(false);
    fetchStudents(1, inputVal, statusFilter, val, ordering);
  };

  // Clicking a column header sorts by it, and clicking the active one flips
  // direction. `ordering` stays the single source of truth — sortKey/sortDir
  // below are derived from it so the header carets can't drift out of sync
  // with what the API was actually asked for.
  const handleSort = (key) => {
    const next = sortKey === key && sortDir === "asc" ? `-${key}` : key;
    setOrdering(next);
    setIsRecents(false);
    fetchStudents(1, inputVal, statusFilter, sexFilter, next);
  };

  const handleRecents = () => {
    const next = !isRecents;
    setIsRecents(next);
    if (next) {
      setInputVal(""); setSearch(""); setStatus("all");
      setSexFilter(""); setOrdering(DEFAULT_ORDERING);
      fetchStudents(1, "", "all", "", DEFAULT_ORDERING);
    }
  };

  const handleUnenrolled = () => {
    const next = !isUnenrolled;
    setIsUnenrolled(next);
    fetchStudents(1, search, statusFilter, sexFilter, ordering, next);
  };

  // A year picked in the "Not enrolled for" picker only means something with
  // that filter on, so picking one turns it on.
  const handleUnenrolledYear = (year) => {
    setUnenrolledYear(year);
    if (isUnenrolled) return; // the year effect above reloads
    setIsUnenrolled(true);
    // That effect only runs when the year actually changes.
    if (year === unenrolledYear) fetchStudents(1, search, statusFilter, sexFilter, ordering, true);
  };

  const handleClearAll = () => {
    setInputVal(""); setSearch(""); setStatus("all");
    setSexFilter(""); setOrdering(DEFAULT_ORDERING); setIsRecents(false);
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

  const statusOptions = STATUS_FILTERS.map((v) => ({
    value: v,
    label: v === "all" ? "All" : STUDENT_STATUS_MAP[v]?.label ?? v,
    // "All" omits its badge: that number is already the page header's total.
    count: v === "all" ? null : statusCounts[v],
    // Same tone as the matching stat card, so clicking a card and seeing its
    // chip light up reads as one connected action instead of two disagreeing
    // colors.
    tone: v === "all" ? "brand" : STUDENT_STATUS_MAP[v]?.variant ?? "brand",
  }));

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={
          loading
            ? "Loading records…"
            : `${pageMeta.count.toLocaleString()} student${pageMeta.count === 1 ? "" : "s"} registered`
        }
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
              loading={loading && statusCounts[card.status] === undefined}
              value={statusCounts[card.status]?.toLocaleString() ?? "—"}
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
          // Always shown, so the page says which year "Not enrolled" checks —
          // the one filter here that depends on a year. It reads as applied
          // only while that filter is on. No counts: the context's count
          // enrollments.
          scope={
            <SchoolYearPicker
              label="Not enrolled for"
              value={unenrolledYear}
              onChange={handleUnenrolledYear}
              active={isUnenrolled}
              counts={{}}
              includeAllYears={false}
            />
          }
        >
          <FilterRow label="Status">
            <ChipGroup
              label="Filter by status"
              options={statusOptions}
              value={statusFilter}
              onChange={handleStatusFilter}
            />
          </FilterRow>

          <FilterRow label="Sex">
            <div className="flex flex-wrap items-center gap-2">
              <ChipGroup
                label="Filter by sex"
                options={SEX_FILTERS}
                value={sexFilter}
                onChange={handleSexFilter}
              />
              <span className="h-4 w-px bg-neutral-300" aria-hidden="true" />
              {/* An independent toggle rather than one of the Sex options, but
                  rendered through ChipGroup so it matches them exactly. */}
              <ChipGroup
                label="Show the most recently registered students"
                options={[{ value: "recents", label: "Recents", icon: "ti-clock" }]}
                value={isRecents ? "recents" : null}
                onChange={handleRecents}
              />
              <span className="h-4 w-px bg-neutral-300" aria-hidden="true" />
              <ChipGroup
                label={`Show students with no enrollment for ${unenrolledYear}`}
                options={[{ value: "unenrolled", label: "Not enrolled", icon: "ti-user-exclamation" }]}
                value={isUnenrolled ? "unenrolled" : null}
                onChange={handleUnenrolled}
              />
            </div>
          </FilterRow>
        </FilterBar>

        {/* Results */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          <Card padding="none" className="overflow-hidden">
            <Table
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
                You&apos;re about to permanently remove{" "}
                <strong className="text-neutral-900">
                  {toDelete.first_name} {toDelete.last_name}
                </strong>{" "}
                and all their associated records. This cannot be undone.
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
