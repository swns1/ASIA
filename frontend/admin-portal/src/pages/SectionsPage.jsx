import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import PageHeader from "../components/ui/PageHeader";
import SchoolYearPicker from "../components/ui/SchoolYearPicker";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";
import Skeleton from "../components/ui/Skeleton";
import { getSections, getSectionAdvisories, getMySections, getEnrollments } from "../api/enrollmentApi";
import { getUsers } from "../api/identityApi";
import { getCurrentUser, hasAnyRole, STAFF_ADMIN } from "../utils/auth";
import { useSchoolYear } from "../context/SchoolYearContext";
import useYearFilter from "../hooks/useYearFilter";
import { usePageTitle } from "../hooks/usePageTitle";
import { GRADE_LEVELS_BY_LEVEL, LEVEL_LABELS } from "../constants/schoolLevels";
import { SectionDetail, StudentsTab } from "./TeacherSectionsPage";

// Every section of one school year, for admin and registrar. My Sections only
// reaches a section through its teacher, and not at all when it has none.
//
// Proof of concept: the detail pane is My Sections' own. That pane, and the
// grades/attendance/narrative endpoints behind it, are keyed by advisory, so a
// section with an adviser opens through that adviser; one without shows its
// roster only. The registrar, and anyone on an archived year, gets it view-only.

const GRADE_ORDER = Object.values(GRADE_LEVELS_BY_LEVEL).flat();

// Complete literal class strings: Tailwind can't see interpolated names.
const LEVEL_CHIP = {
  nursery:           "bg-nursery-50 text-nursery-500",
  kindergarten:      "bg-kindergarten-50 text-kindergarten-500",
  elementary:        "bg-elementary-50 text-elementary-500",
  junior_highschool: "bg-juniorhigh-50 text-juniorhigh-500",
  senior_highschool: "bg-seniorhigh-50 text-seniorhigh-500",
};

const asList = (data) => (Array.isArray(data) ? data : data?.results ?? []);

const sectionTitle = (s) => `${s.grade_level} · ${s.name}${s.strand ? ` (${s.strand})` : ""}`;

function byName(a, b) {
  return (a.last_name || "").localeCompare(b.last_name || "")
    || (a.first_name || "").localeCompare(b.first_name || "");
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-6 py-5">
      <Skeleton width={220} height={18} />
      <Skeleton width={160} height={12} />
      <div className="mt-4 flex flex-col gap-2">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={18} />)}
      </div>
    </div>
  );
}

// ── Left list: the year's sections, grouped by grade ────────────────────────
function SectionList({ rows, selectedId, onSelect, adviserNames }) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (r) => !q || [
      r.name, r.grade_level, r.strand, LEVEL_LABELS[r.school_level], adviserNames(r),
    ].some((v) => (v || "").toLowerCase().includes(q));
    const map = new Map();
    rows.filter(matches).forEach((r) => {
      if (!map.has(r.grade_level)) map.set(r.grade_level, []);
      map.get(r.grade_level).push(r);
    });
    return [...map.entries()];
  }, [rows, query, adviserNames]);

  return (
    <div className="flex w-[280px] shrink-0 flex-col border-r border-neutral-100 bg-white">
      <div className="border-b border-neutral-100 p-4">
        <label className="flex items-center gap-2 rounded-[10px] border-[1.5px] border-neutral-200 bg-neutral-50 px-3 py-2">
          <i className="ti ti-search text-sm text-neutral-500" aria-hidden="true" />
          <span className="sr-only">Search sections</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search section, grade, adviser…"
            className="w-full bg-transparent text-[12.5px] text-neutral-900 outline-none"
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 pb-3">
        {groups.length === 0 ? (
          <div className="px-2.5 py-6 text-center text-xs text-neutral-500">No sections match "{query}".</div>
        ) : (
          groups.map(([grade, list]) => (
            <div key={grade}>
              <div className="px-2.5 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-neutral-500">
                {grade}
              </div>
              {list.map((r) => {
                const selected = r.section_id === selectedId;
                const learners = r.enrollment_count ?? 0;
                return (
                  <button
                    key={r.section_id}
                    type="button"
                    onClick={() => onSelect(r.section_id)}
                    aria-current={selected ? "true" : undefined}
                    className={`focus-ring mb-1 flex w-full items-center gap-2.5 rounded-[10px] border-[1.5px] p-2.5 text-left transition-colors ${
                      selected ? "border-brand-500 bg-brand-100" : "border-transparent hover:bg-brand-50"
                    }`}
                  >
                    <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${LEVEL_CHIP[r.school_level] ?? LEVEL_CHIP.elementary}`}>
                      <i className="ti ti-users-group text-[15px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] font-bold ${selected ? "text-brand-600" : "text-neutral-900"}`}>
                        {r.name}
                        {r.strand && <span className="ml-1.5 text-[11.5px] text-seniorhigh-500">{r.strand}</span>}
                      </span>
                      <span className="block truncate text-[11px] text-neutral-500">
                        {learners} {learners === 1 ? "learner" : "learners"} ·{" "}
                        {r.advisories.length
                          ? adviserNames(r)
                          : <span className="font-semibold text-warning-500">No adviser</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Right pane: a section with an adviser ────────────────────────────────────
// Opens through the adviser's my-sections payload (roster + subjects), the
// same one My Sections uses. A Senior High section can have one adviser per
// strand, hence the switcher.
function AdvisedSection({ section, adviserName, loadTeacher, readOnly }) {
  const [advisoryId, setAdvisoryId] = useState(section.advisories[0].advisory_id);
  const advisory = section.advisories.find((a) => a.advisory_id === advisoryId) ?? section.advisories[0];
  const [state, setState] = useState({ key: null, entry: null });

  useEffect(() => {
    let live = true;
    loadTeacher(advisory.teacher_user_id).then(
      (entries) => live && setState({
        key: advisory.advisory_id,
        entry: entries.find((e) => e.advisory.advisory_id === advisory.advisory_id) ?? null,
      }),
      (e) => {
        if (!live) return;
        toast.error(e.message || "Failed to load this section.");
        setState({ key: advisory.advisory_id, entry: null });
      },
    );
    return () => { live = false; };
  }, [advisory.advisory_id, advisory.teacher_user_id, loadTeacher]);

  const loading = state.key !== advisory.advisory_id;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {section.advisories.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-6 py-2.5">
          <span className="text-xs font-semibold text-neutral-500">Advisers:</span>
          {section.advisories.map((a) => {
            const active = a.advisory_id === advisory.advisory_id;
            return (
              <button
                key={a.advisory_id}
                type="button"
                onClick={() => setAdvisoryId(a.advisory_id)}
                aria-pressed={active}
                className={`focus-ring rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  active ? "border-brand-500 bg-brand-100 text-brand-600" : "border-neutral-200 bg-white text-neutral-700 hover:border-brand-300"
                }`}
              >
                {a.strand || "Whole section"} · {adviserName(a)}
              </button>
            );
          })}
        </div>
      )}
      {loading ? (
        <DetailSkeleton />
      ) : state.entry ? (
        <SectionDetail
          key={advisory.advisory_id}
          entry={state.entry}
          adviserName={adviserName(advisory)}
          readOnly={readOnly}
        />
      ) : (
        <div className="p-6">
          <Alert variant="error">This section couldn't be loaded.</Alert>
        </div>
      )}
    </div>
  );
}

// ── Right pane: a section without an adviser ─────────────────────────────────
// Same roster rule as an advisory's (advisory_roster: currently `enrolled`).
function UnadvisedSection({ section, schoolYear, canManage }) {
  const [state, setState] = useState({ loading: true, students: [] });

  useEffect(() => {
    let live = true;
    getEnrollments({
      school_year: schoolYear,
      grade_level: section.grade_level,
      section: section.name,
      enrollment_status: "enrolled",
      page_size: 500,
    })
      .then((data) => {
        if (!live) return;
        const students = asList(data)
          .map((e) => ({ ...e.student_detail, enrollment_id: e.enrollment_id }))
          .sort(byName);
        setState({ loading: false, students });
      })
      .catch((e) => {
        if (!live) return;
        toast.error(e.message || "Failed to load the roster.");
        setState({ loading: false, students: [] });
      });
    return () => { live = false; };
  }, [schoolYear, section.grade_level, section.name]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      <div className="border-b border-neutral-100 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] ${LEVEL_CHIP[section.school_level] ?? LEVEL_CHIP.elementary}`}>
            <i className="ti ti-users-group text-[17px]" aria-hidden="true" />
          </span>
          <div>
            <div className="text-lg font-bold text-neutral-900">{sectionTitle(section)}</div>
            <div className="mt-0.5 text-xs text-neutral-500">
              {LEVEL_LABELS[section.school_level] || section.school_level} · SY {schoolYear}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {!state.loading && (
            <Badge variant="info">
              {state.students.length} {state.students.length === 1 ? "student" : "students"}
            </Badge>
          )}
          <Badge variant="warning" icon="ti-user-off">No adviser</Badge>
        </div>
      </div>
      <div className="px-6 pt-4">
        <Alert variant="info">
          Grades, attendance and narrative reports are kept through a section's adviser, so they open here once one is assigned.
          {canManage && (
            <>
              {" "}
              <Link to={`/school-years/${schoolYear}?tab=advisers`} className="font-semibold underline">
                Assign an adviser
              </Link>
            </>
          )}
        </Alert>
      </div>
      <div className="mt-2 flex-1 overflow-y-auto">
        {state.loading ? <DetailSkeleton /> : <StudentsTab students={state.students} />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function SectionsPage() {
  usePageTitle("Sections");
  const [schoolYear, setSchoolYear, yearIsDefault] = useYearFilter({ allowAll: false });
  const { currentYear, yearStates } = useSchoolYear();

  const canManage = hasAnyRole(getCurrentUser(), STAFF_ADMIN);
  const archived = yearStates?.[schoolYear] === "archived";
  const readOnly = !canManage || archived;

  const [data, setData] = useState({ year: null, sections: [], advisories: [] });
  const [teacherNames, setTeacherNames] = useState({});
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    getUsers({ role: "teacher", page_size: 500 })
      .then((users) => setTeacherNames(Object.fromEntries(asList(users).map((u) => [u.user_id, u.name]))))
      .catch(() => setTeacherNames({}));
  }, []);

  useEffect(() => {
    if (!schoolYear) return undefined;
    let live = true;
    Promise.all([
      getSections({ school_year: schoolYear }),
      getSectionAdvisories({ school_year: schoolYear, page_size: 500 }),
    ])
      .then(([sections, advisories]) => {
        if (live) setData({ year: schoolYear, sections: asList(sections), advisories: asList(advisories) });
      })
      .catch((e) => {
        if (!live) return;
        toast.error(e.message || "Failed to load sections.");
        setData({ year: schoolYear, sections: [], advisories: [] });
      });
    return () => { live = false; };
  }, [schoolYear]);

  const loading = data.year !== schoolYear;

  // One my-sections request per teacher for the whole visit, however many of
  // their sections get opened. A failure isn't remembered.
  const teacherCache = useRef(new Map());
  const loadTeacher = useCallback((teacherUserId) => {
    const cache = teacherCache.current;
    if (!cache.has(teacherUserId)) {
      cache.set(teacherUserId, getMySections({ teacher_user_id: teacherUserId }).then(asList).catch((e) => {
        cache.delete(teacherUserId);
        throw e;
      }));
    }
    return cache.get(teacherUserId);
  }, []);

  const adviserName = useCallback(
    (a) => teacherNames[a.teacher_user_id] ?? `Teacher #${a.teacher_user_id}`,
    [teacherNames],
  );
  const adviserNames = useCallback(
    (row) => row.advisories.map(adviserName).join(", "),
    [adviserName],
  );

  const rows = useMemo(() => {
    const advisoriesBySection = new Map();
    data.advisories.forEach((a) => {
      const key = `${a.grade_level}|${a.section}`;
      if (!advisoriesBySection.has(key)) advisoriesBySection.set(key, []);
      advisoriesBySection.get(key).push(a);
    });
    return data.sections
      .map((s) => ({ ...s, advisories: advisoriesBySection.get(`${s.grade_level}|${s.name}`) ?? [] }))
      .sort((a, b) => GRADE_ORDER.indexOf(a.grade_level) - GRADE_ORDER.indexOf(b.grade_level)
        || a.name.localeCompare(b.name));
  }, [data]);

  const selected = rows.find((r) => r.section_id === selectedId) ?? rows[0] ?? null;
  const unadvised = rows.filter((r) => r.advisories.length === 0).length;

  const subtitle = loading
    ? "Loading…"
    : [
        `${rows.length} ${rows.length === 1 ? "section" : "sections"}`,
        unadvised ? `${unadvised} without an adviser` : null,
        readOnly ? (archived ? "archived year, view only" : "view only") : null,
      ].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        title="Sections"
        icon="ti-layout-grid"
        subtitle={subtitle}
        actions={
          // Same year control as the admin home.
          <div className="flex items-center gap-2">
            {!yearIsDefault && (
              <Button variant="ghost" size="sm" icon="ti-arrow-back-up" onClick={() => setSchoolYear(null)}>
                Back to {currentYear}
              </Button>
            )}
            <SchoolYearPicker
              value={schoolYear}
              onChange={setSchoolYear}
              includeAllYears={false}
              // Red only while it narrows to a year other than the current one.
              active={!yearIsDefault}
              // The pill is at the page's right edge; open the panel leftward.
              align="end"
            />
          </div>
        }
      />
      <div className="flex flex-1 overflow-hidden">
        {loading ? (
          <div className="flex-1"><DetailSkeleton /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="px-4 py-20 text-center">
              <div className="mx-auto mb-3 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-brand-100">
                <i className="ti ti-layout-grid text-[22px] text-neutral-500" aria-hidden="true" />
              </div>
              <div className="text-sm font-semibold text-neutral-700">No sections set up for S.Y. {schoolYear}</div>
              {!readOnly && (
                <Link to={`/school-years/${schoolYear}?tab=sections`} className="mt-2 inline-block text-xs font-semibold text-brand-600 underline">
                  Set them up in School Years
                </Link>
              )}
            </div>
          </div>
        ) : (
          <>
            <SectionList rows={rows} selectedId={selected?.section_id} onSelect={setSelectedId} adviserNames={adviserNames} />
            {selected && (selected.advisories.length > 0 ? (
              <AdvisedSection
                key={selected.section_id}
                section={selected}
                adviserName={adviserName}
                loadTeacher={loadTeacher}
                readOnly={readOnly}
              />
            ) : (
              <UnadvisedSection
                key={selected.section_id}
                section={selected}
                schoolYear={schoolYear}
                canManage={!readOnly}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}
