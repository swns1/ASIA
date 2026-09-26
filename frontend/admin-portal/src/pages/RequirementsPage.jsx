import { usePageTitle } from "../hooks/usePageTitle";
import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card, { StatCard } from "../components/ui/Card";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import Pagination from "../components/Pagination";
import ChipGroup from "../components/ui/ChipGroup";
import FilterBar, { FilterRow, CollapsibleFilterRow } from "../components/ui/FilterBar";
import { getAvatarPalette } from "../utils/avatarPalette";
import { StatusBadge as StudentStatusBadge } from "../components/ui/Badge";
import { STUDENT_STATUS_MAP } from "../constants/statusMaps";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getStudent, getStudents } from "../api/studentApi";
import useYearFilter from "../hooks/useYearFilter";
import RequirementDocumentsPanel from "../components/requirements/RequirementDocumentsPanel";



// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  red: "#e03131", redDark: "#c92a2a", redLight: "#fff0f0", redBorder: "#fca5a5",
  green: "#2e7d32", greenLight: "#e8f5e0", greenBorder: "#a5d6a7",
  border: "#f5eaea", softBorder: "#f9f0f0",
  text: "#1a0a0a", muted: "#7a5050", pale: "#8a6a6a",
  bg: "#fdf8f6", white: "#ffffff",
};


const RECENT_COLUMNS = [
  { key: 'student', label: 'Student', width: '35%' },
  { key: 'lrn',     label: 'LRN',     width: '20%' },
  { key: 'grade',   label: 'Grade',   width: '20%' },
  { key: 'status',  label: 'Status',  width: '15%' },
  { key: 'arrow',   label: '',        width: '10%' },
];

// ── Filter constants ──────────────────────────────────────────────────────────
// `tone` names the shared ChipGroup palette entry; the categorical school-level
// tones are the same ones EnrollmentsPage uses, so a level reads the same colour
// on both pages.
const SCHOOL_LEVELS = [
  { value: "",                  label: "All Levels",   icon: "ti-layout-grid",   tone: "brand" },
  { value: "nursery",           label: "Nursery",      icon: "ti-baby-carriage", tone: "nursery" },
  { value: "kindergarten",      label: "Kindergarten", icon: "ti-star",          tone: "kindergarten" },
  { value: "elementary",        label: "Elementary",   icon: "ti-book",          tone: "elementary" },
  { value: "junior_highschool", label: "Junior High",  icon: "ti-school",        tone: "juniorhigh" },
  { value: "senior_highschool", label: "Senior High",  icon: "ti-certificate",   tone: "seniorhigh" },
];

const GRADE_LEVELS_BY_LEVEL = {
  "":                ["All Grades"],
  nursery:           ["All Grades", "Nursery"],
  kindergarten:      ["All Grades", "Kindergarten"],
  elementary:        ["All Grades", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  junior_highschool: ["All Grades", "Grade 7", "Grade 8", "Grade 9", "Grade 10"],
  senior_highschool: ["All Grades", "Grade 11", "Grade 12"],
};


// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function RequirementsPage() {
  usePageTitle("Requirements");
  const navigate = useNavigate();

  // Filter state
  const [levelFilter, setLevelFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  // Level and grade are where a learner is placed, which is per school year:
  // the filters list students enrolled (or pending) there in the current
  // school year, or the year a link names (see hooks/useYearFilter).
  const [schoolYear] = useYearFilter();
  const gradeOptions = GRADE_LEVELS_BY_LEVEL[levelFilter] ?? ["All Grades"];

  // Reset grade when level changes
  useEffect(() => { setGradeFilter(""); }, [levelFilter]);

  const hasFilters = levelFilter || gradeFilter;

  // Search state
  const [searchInput,   setSearchInput]   = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const searchRef = useRef(null);
  const suppressSearch = useRef(false);

  // Recent students
  const [recentStudents,        setRecentStudents]        = useState([]);
  const [recentStudentsLoading, setRecentStudentsLoading] = useState(false);
  const [recentPage,            setRecentPage]            = useState(1);
  const [recentPageMeta,        setRecentPageMeta]        = useState({ count: 0, next: null, previous: null });
  const RECENT_PAGE_SIZE = 10;

  // Requirement counts, reported up by RequirementDocumentsPanel — the panel
  // owns the checklist itself (loading, upload, replace, remove, view).
  const [reqCounts,  setReqCounts]  = useState({ total: 0, submitted: 0, requiredMissing: 0 });
  const [reqLoading, setReqLoading] = useState(false);
  const [reqRefresh, setReqRefresh] = useState(0);

  const handleReqChange = useCallback((counts) => {
    setReqCounts(counts);
    setReqLoading(false);
  }, []);

  // Auth guard
  useEffect(() => {
    if (!sessionStorage.getItem("access_token")) navigate("/");
  }, [navigate]);

  // Deep link: /requirements?student=123.
  //
  // This page used to take no parameters at all, so the only way in was the
  // sidebar followed by re-searching for a student by name. That is the whole
  // reason a registrar blocked by "missing required documents" on an
  // enrollment had nowhere to go — the enrollment pages now link straight
  // here for the learner already on screen.
  const [searchParams] = useSearchParams();
  const deepLinkId = searchParams.get("student");
  useEffect(() => {
    if (!deepLinkId) return;
    let cancelled = false;
    getStudent(deepLinkId)
      .then((student) => { if (!cancelled && student) selectStudent(student); })
      .catch(() => { /* a bad id just leaves the picker empty */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId]);

  // Load recent students — re-fetches when filters or page change
  const fetchRecentStudents = useCallback((page = 1) => {
    setRecentStudentsLoading(true);
    getStudents({
      ordering: "-student_id",
      page,
      page_size: RECENT_PAGE_SIZE,
      school_level: levelFilter,
      grade_level: gradeFilter,
      ...((levelFilter || gradeFilter) && schoolYear ? { school_year: schoolYear } : {}),
    })
      .then((data) => {
        setRecentStudents(data?.results ?? []);
        setRecentPageMeta({ count: data?.count ?? 0, next: data?.next, previous: data?.previous });
        setRecentPage(page);
      })
      .catch(() => {})
      .finally(() => setRecentStudentsLoading(false));
  }, [levelFilter, gradeFilter, schoolYear]);

  useEffect(() => { fetchRecentStudents(1); }, [fetchRecentStudents]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Live debounced student search
  useEffect(() => {
    if (suppressSearch.current) { suppressSearch.current = false; return; }
    if (!searchInput.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    setSearchLoading(true);
    setShowDropdown(true);
    const t = setTimeout(async () => {
      try {
        const data = await getStudents({ search: searchInput.trim() });
        setSearchResults(Array.isArray(data) ? data : data?.results ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Select a student → the panel loads their requirements
  function selectStudent(student) {
    suppressSearch.current = true;
    setSelectedStudent(student);
    setShowDropdown(false);
    setSearchResults([]);
    setSearchInput(`${student.first_name} ${student.last_name}`);
    setReqLoading(true);
    setReqCounts({ total: 0, submitted: 0, requiredMissing: 0 });
  }

  const reloadRequirements = useCallback(() => {
    if (!selectedStudent) return;
    setReqLoading(true);
    setReqRefresh((v) => v + 1);
  }, [selectedStudent]);

  const submitted = reqCounts.submitted;
  const pending   = Math.max(reqCounts.total - reqCounts.submitted, 0);

  return (
    <>
          <PageHeader
            title="Student Requirements"
            icon="ti-file-check"
            subtitle="Enrollment documents and submission tracker"
            actions={
              selectedStudent && (
                <Button variant="secondary" icon="ti-refresh" onClick={reloadRequirements}>
                  Refresh
                </Button>
              )
            }
          />

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-7 py-6">

            {/* ── Filter + Search panel ── */}
            {/* The search is a student autocomplete with an overlaying result
                list, not FilterBar's plain text search, so it rides in
                `extraControls`; the chip rows below are ordinary children. */}
            <FilterBar
              hasFilters={Boolean(hasFilters)}
              onClearFilters={() => { setLevelFilter(""); setGradeFilter(""); }}
              className="relative z-[100]"
              onSearch={() => { if (searchInput.trim()) setShowDropdown(true); }}
              extraControls={
                <div className="relative flex-1" ref={searchRef}>
                  <div className="filterbar-search flex h-[42px] items-center gap-2.5 rounded-lg border-[1.5px] border-neutral-300 bg-white px-4 transition-[border-color,box-shadow] duration-150">
                    <i className="ti ti-search shrink-0 text-[15px] text-neutral-500" aria-hidden="true" />
                    <label htmlFor="requirements-search" className="sr-only">Search students</label>
                    <input
                      id="requirements-search"
                      value={searchInput}
                      onChange={(e) => {
                        setSearchInput(e.target.value);
                        if (!e.target.value) { setSelectedStudent(null); setShowDropdown(false); }
                      }}
                      placeholder="Search student name, LRN, or student number…"
                      className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-neutral-900 outline-none placeholder:text-neutral-500"
                    />
                    {searchInput && (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => { setSearchInput(""); setSelectedStudent(null); setShowDropdown(false); }}
                        className="focus-ring flex shrink-0 items-center rounded-sm p-0.5 text-neutral-500 hover:text-brand-600"
                      >
                        <i className="ti ti-x text-[13px]" aria-hidden="true" />
                      </button>
                    )}
                    {searchLoading && (
                      <i className="ti ti-loader-2 shrink-0 animate-spin text-[13px] text-brand-500" aria-hidden="true" />
                    )}
                  </div>

                  {showDropdown && (
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[9999] max-h-[280px] overflow-y-auto rounded-xl border-[1.5px] border-neutral-200 bg-white shadow-[0_12px_40px_rgba(224,49,49,0.14)]">
                      {searchLoading && (
                        <div className="px-4 py-3.5 text-[13px] text-neutral-500">Searching…</div>
                      )}
                      {!searchLoading && searchResults.length === 0 && (
                        <div className="px-4 py-3.5 text-[13px] text-neutral-500">No students found.</div>
                      )}
                      {!searchLoading && searchResults.map((st) => {
                        const ap = getAvatarPalette(st.last_name ?? "X");
                        return (
                          <div
                            key={st.student_id}
                            onClick={() => selectStudent(st)}
                            className="flex cursor-pointer items-center gap-3 border-b border-neutral-200/70 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-brand-50"
                          >
                            <div
                              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-xs font-bold"
                              style={{ background: ap.bg, color: ap.color }}
                              aria-hidden="true"
                            >
                              {st.first_name?.[0]}{st.last_name?.[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-bold text-neutral-900">
                                {st.first_name} {st.middle_name ? st.middle_name + " " : ""}{st.last_name}
                              </div>
                              <div className="text-xs text-neutral-500">LRN: {st.lrn} · {st.student_number}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              }
            >
              <FilterRow label="School Level">
                <ChipGroup
                  options={SCHOOL_LEVELS.map((l) => ({
                    value: l.value, label: l.label, icon: l.icon, tone: l.tone,
                  }))}
                  value={levelFilter}
                  onChange={setLevelFilter}
                  label="Filter by school level"
                />
              </FilterRow>

              <CollapsibleFilterRow open={levelFilter !== ""} label="Grade Level">
                <ChipGroup
                  options={gradeOptions.map((g) => ({
                    value: g === "All Grades" ? "" : g, label: g,
                  }))}
                  value={gradeFilter}
                  onChange={setGradeFilter}
                  label="Filter by grade level"
                  stagger
                  generation={levelFilter}
                />
              </CollapsibleFilterRow>
            </FilterBar>

            {/* ── Selected student stats ── */}
            {selectedStudent && (() => {
              const selAp = getAvatarPalette(selectedStudent.last_name ?? "X");
              return (
              <div className="grid grid-cols-4 gap-3">
                <div className="flex items-center gap-3.5 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: selAp.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: selAp.color, flexShrink: 0 }}>
                    {selectedStudent.first_name?.[0]}{selectedStudent.last_name?.[0]}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selectedStudent.first_name} {selectedStudent.last_name}
                    </div>
                    <div style={{ fontSize: 11, color: C.pale }}>LRN: {selectedStudent.lrn}</div>
                    <div style={{ fontSize: 11, color: C.pale }}>{selectedStudent.student_number}</div>
                    <button
                      onClick={() => navigate(`/students/${selectedStudent.student_id}`)}
                      style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 7, background: "white", color: C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}
                    >
                      <i className="ti ti-user" style={{ fontSize: 12 }} />View Profile
                    </button>
                  </div>
                </div>
                <StatCard label="Total Requirements" value={reqCounts.total} icon="ti-list" iconTone="brand" loading={reqLoading} />
                <StatCard label="Submitted" value={submitted} icon="ti-circle-check" iconTone="success" loading={reqLoading} />
                <StatCard label="Pending" value={pending} icon="ti-clock" iconTone="warning" loading={reqLoading} />
              </div>
              );
            })()}

            {/* The document checklist itself lives in a shared panel so the
                enrollment pages can embed the same thing — that is where the
                completeness gate blocks a registrar, and where fixing it
                belongs. This page keeps the search, the level/grade filters
                and the recent-students table; only the per-student document
                block moved. */}
            {selectedStudent && (
              <Card padding="lg">
                <RequirementDocumentsPanel
                  studentId={selectedStudent.student_id}
                  student={selectedStudent}
                  variant="table"
                  refreshKey={reqRefresh}
                  onChange={handleReqChange}
                />
              </Card>
            )}

            {/* ── Recently enrolled students ── */}
            {!selectedStudent && (
              <>
              <Card padding="none" className="overflow-hidden">
                <Table
                  columns={RECENT_COLUMNS}
                  loading={recentStudentsLoading}
                  isEmpty={recentStudents.length === 0}
                  skeletonRows={RECENT_PAGE_SIZE}
                  empty={{
                    icon: "ti-users-off",
                    title: "No students found",
                    subtitle: hasFilters
                      ? "Try a different school level or grade."
                      : "No recently enrolled students to show.",
                  }}
                >
                  {recentStudents.map((st) => {
                    const rap = getAvatarPalette(st.last_name ?? "X");
                    const initials = `${st.first_name?.[0] ?? ""}${st.last_name?.[0] ?? ""}`.toUpperCase();
                    const fullName = [st.last_name, ",", st.first_name, st.middle_name ? st.middle_name[0] + "." : "", st.suffix ?? ""].filter(Boolean).join(" ");
                    const gradeLabel = st.grade_level
                      ? st.grade_level.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
                      : st.school_level
                        ? st.school_level.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
                        : null;
                    return (
                      <TableRow key={st.student_id} onClick={() => selectStudent(st)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                              style={{ background: rap.bg, color: rap.color }}
                              aria-hidden="true"
                            >
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold leading-tight text-neutral-900 transition-colors group-hover:text-brand-600">
                                {fullName}
                              </div>
                              <div className="mt-0.5 text-xs text-neutral-500">
                                {st.student_number || <span className="italic">no student number</span>}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          {st.lrn
                            ? <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-700">{st.lrn}</span>
                            : <span className="text-xs italic text-neutral-500">—</span>}
                        </TableCell>

                        <TableCell>
                          {gradeLabel
                            ? <span className="text-xs text-neutral-700">{gradeLabel}</span>
                            : <span className="text-xs italic text-neutral-500">—</span>}
                        </TableCell>

                        <TableCell>
                          <StudentStatusBadge status={st.status} map={STUDENT_STATUS_MAP} size="sm" />
                        </TableCell>

                        <TableCell>
                          <i className="ti ti-chevron-right text-sm text-neutral-500" aria-hidden="true" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Table>
              </Card>

              {!recentStudentsLoading && recentPageMeta.count > RECENT_PAGE_SIZE && (
                <Pagination
                  page={recentPage}
                  totalPages={Math.ceil(recentPageMeta.count / RECENT_PAGE_SIZE)}
                  count={recentPageMeta.count}
                  hasPrevious={Boolean(recentPageMeta.previous)}
                  hasNext={Boolean(recentPageMeta.next)}
                  onPageChange={(p) => fetchRecentStudents(p)}
                />
              )}
              </>
            )}
          </div>

    </>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
// Page-specific rules only. The keyframes, the `*`/body resets, the scrollbar
// styling and `.search-wrap:focus-within` all live in index.css now, and the
// `.nav-item`/`.nav-active` overrides were dead weight — the sidebar no longer
// uses those class names, so the rules matched nothing.


