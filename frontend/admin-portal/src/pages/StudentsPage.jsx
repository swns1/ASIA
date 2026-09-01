import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import Pagination from "../components/Pagination";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card, { StatCard } from "../components/ui/Card";
import ChipGroup from "../components/ui/ChipGroup";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import { StatusBadge } from "../components/ui/Badge";
import { Select } from "../components/FormField";
import { STUDENT_STATUS_MAP } from "../constants/statusMaps";
import { getAvatarPalette, initialsFrom } from "../utils/avatarPalette";
import { deleteStudent, getStudents } from "../api/studentApi";
import { getCurrentUser, hasAnyRole, ACADEMIC_STAFF } from "../utils/auth";

const STATUS_FILTERS = ["all", "active", "inactive", "transferred", "graduated", "dropped"];

const SORT_OPTIONS = [
  { value: "-student_id", label: "Newest first" },
  { value: "student_id",  label: "Oldest first" },
  { value: "last_name",   label: "Name A → Z" },
  { value: "-last_name",  label: "Name Z → A" },
  { value: "birth_date",  label: "Youngest last" },
  { value: "-birth_date", label: "Youngest first" },
];

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
  { key: "student", label: "Student",   width: "30%" },
  { key: "lrn",     label: "LRN",       width: "15%" },
  { key: "age",     label: "Age / DOB", width: "16%" },
  { key: "sex",     label: "Sex",       width: "9%" },
  { key: "status",  label: "Status",    width: "11%" },
  { key: "contact", label: "Contact",   width: "13%" },
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
  const [search, setSearch]       = useState("");
  const [inputVal, setInputVal]   = useState("");
  const [page, setPage]           = useState(1);
  const [pageMeta, setPageMeta]   = useState({ count: 0, next: null, previous: null });
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [toDelete, setToDelete]   = useState(null);
  const [statusFilter, setStatus] = useState(() => searchParams.get("status") ?? "all");
  const [sexFilter, setSexFilter] = useState("");
  const [ordering, setOrdering]   = useState("-student_id");
  const [isRecents, setIsRecents] = useState(false);
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
    fetchStudents(1, "", statusFilter, "", "-student_id");
    fetchCounts();
    // Focus the search box on arrival — searching is the dominant task here.
    searchRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleOrdering = (val) => {
    setOrdering(val);
    setIsRecents(false);
    fetchStudents(1, inputVal, statusFilter, sexFilter, val);
  };

  const handleRecents = () => {
    const next = !isRecents;
    setIsRecents(next);
    if (next) {
      setInputVal(""); setSearch(""); setStatus("all");
      setSexFilter(""); setOrdering("-student_id");
      fetchStudents(1, "", "all", "", "-student_id");
    }
  };

  const handleClearAll = () => {
    setInputVal(""); setSearch(""); setStatus("all");
    setSexFilter(""); setOrdering("-student_id"); setIsRecents(false);
    fetchStudents(1, "", "all", "", "-student_id");
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
    try {
      await deleteStudent(toDelete.student_id);
      setToDelete(null);
      fetchStudents(page, search, statusFilter, sexFilter, ordering);
      fetchCounts();
    } finally {
      setDeletingStudent(false);
    }
  };

  const hasActiveFilters =
    search || statusFilter !== "all" || sexFilter || ordering !== "-student_id";
  const totalPages = Math.ceil(pageMeta.count / PAGE_SIZE);

  const statusOptions = STATUS_FILTERS.map((v) => ({
    value: v,
    // Counts on every chip, not just the selected one — you can compare
    // segments without clicking through them.
    label: v === "all" ? "All" : STUDENT_STATUS_MAP[v]?.label ?? v,
    count: statusCounts[v],
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
        <Card>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px] flex-1">
              <label htmlFor="student-search" className="sr-only">
                Search students by name, LRN, or email
              </label>
              <i
                className="ti ti-search pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-neutral-500"
                aria-hidden="true"
              />
              <input
                id="student-search"
                ref={searchRef}
                type="search"
                placeholder="Search by name, LRN, or email…"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                className="focus-ring h-10 w-full rounded-lg border-[1.5px] border-neutral-300 bg-white pl-10 pr-9 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-500 hover:border-brand-300"
              />
              {inputVal && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  className="focus-ring absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-neutral-500 hover:text-brand-500"
                >
                  <i className="ti ti-x text-[13px]" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="shrink-0">
              <label htmlFor="student-sort" className="sr-only">Sort students</label>
              <Select
                id="student-sort"
                value={ordering}
                onChange={(e) => handleOrdering(e.target.value)}
                className="h-10 w-[170px] py-0 text-sm font-semibold"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>

            <Button variant="secondary" icon="ti-search" onClick={handleSearch}>
              Search
            </Button>

            {hasActiveFilters && (
              <Button variant="ghost" icon="ti-filter-off" onClick={handleClearAll}>
                Clear filters
              </Button>
            )}
          </div>

          <hr className="my-4 border-neutral-200" />

          <div className="space-y-3">
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">
                Status
              </div>
              <ChipGroup
                label="Filter by status"
                options={statusOptions}
                value={statusFilter}
                onChange={handleStatusFilter}
              />
            </div>

            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">
                Sex
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ChipGroup
                  label="Filter by sex"
                  options={SEX_FILTERS}
                  value={sexFilter}
                  onChange={handleSexFilter}
                />
                <span className="h-4 w-px bg-neutral-300" aria-hidden="true" />
                <button
                  type="button"
                  onClick={handleRecents}
                  aria-pressed={isRecents}
                  title="Show the most recently registered students"
                  className={[
                    "focus-ring inline-flex h-8 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-xs font-semibold transition-colors",
                    isRecents
                      ? "border-brand-500 bg-brand-100 text-brand-500"
                      : "border-neutral-300 bg-white text-neutral-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-500",
                  ].join(" ")}
                >
                  <i className="ti ti-clock text-[13px]" aria-hidden="true" />
                  Recents
                </button>
              </div>
            </div>
          </div>
        </Card>

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
                          <div className="truncate text-sm font-semibold text-neutral-900 transition-colors group-hover:text-brand-500">
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
            onConfirm={handleDelete}
            onCancel={() => setToDelete(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
