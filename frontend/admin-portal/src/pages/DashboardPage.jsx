import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useNavigate } from "react-router-dom";

import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import { Panel, StatCard } from "../components/ui/Card";
import BillingPanel from "../components/ui/BillingPanel";
import Alert from "../components/ui/Alert";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import { StatusBadge } from "../components/ui/Badge";
import { ENROLLMENT_STATUS_MAP } from "../constants/statusMaps";
import { describeApiError } from "../utils/apiError";
import { pageVariants } from "../utils/motion";
import { AttendanceBand, PipelineBand, RiskBand } from "./dashboard/DashboardBands";

// ── API ───────────────────────────────────────────────────────────────────────
import { getStudents as _getStudents } from "../api/studentApi";
import {
  getEnrollments as _getEnrollments,
  getEnrollmentScholarships as _getEnrollmentScholarships,
  getDashboardSummary as _getDashboardSummary,
} from "../api/enrollmentApi";
import { getInvoices as _getInvoices, getFinancialSummary as _getFinancialSummary } from "../api/billingApi";
import { useSchoolYear } from "../context/SchoolYearContext";
import { getCurrentUser, hasAnyRole, BILLING_ROLES, ACADEMIC_STAFF } from "../utils/auth";

function AnimatedCount({ target, loading }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 90, damping: 18 });
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString());
  useEffect(() => { if (!loading) motionVal.set(target ?? 0); }, [loading, target, motionVal]);
  if (loading) return null;
  return <motion.span style={{ fontVariantNumeric: "tabular-nums" }}>{display}</motion.span>;
}

const LEVEL_GRADES = {
  "":                [],
  nursery:           ["Nursery"],
  kindergarten:      ["Kinder"],
  elementary:        ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"],
  junior_highschool: ["Grade 7","Grade 8","Grade 9","Grade 10"],
  senior_highschool: ["Grade 11","Grade 12"],
};

const LEVEL_LABELS = {
  nursery: "Nursery", kindergarten: "Kindergarten", elementary: "Elementary",
  junior_highschool: "Junior HS", senior_highschool: "Senior HS",
};
const LEVEL_ICONS = {
  nursery: "ti-baby-carriage", kindergarten: "ti-star", elementary: "ti-book",
  junior_highschool: "ti-school", senior_highschool: "ti-certificate",
};
const CHIP_TONES = {
  up:      "bg-success-50 text-success-500",
  down:    "bg-error-50 text-error-500",
  neutral: "bg-muted-50 text-muted-500",
  info:    "bg-info-50 text-info-500",
};

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Dashboard stat tile — the shared StatCard plus this page's extras: an
 * animated count, a status chip, and an expandable per-card filter drawer.
 *
 * It takes StatCard's `onValueClick` rather than `onClick`, so the card stays
 * a <div> and the filter controls below stay real, keyboard-reachable buttons.
 * Making the whole card a button would nest them, which is invalid HTML and
 * unreachable by keyboard — the bug this tile was rewritten to fix once.
 *
 * `iconTone` is per-metric, not decorative: it is what makes a pending queue
 * read as pending at a glance. The previous version hardcoded brand red on all
 * four tiles, so "needs action" looked exactly as calm as a headcount.
 */
function DashboardStat({
  label, icon, iconTone = "brand", value, loading, chipText, chipTone = "neutral",
  onOpen, openLabel, filters, filterValues, onFilterChange,
}) {
  const [showFilters, setShowFilters] = useState(false);
  const hasActiveFilter = filters?.some((f) => filterValues?.[f.key]);

  return (
    <StatCard
      label={label}
      icon={icon}
      iconTone={iconTone}
      loading={loading}
      value={<AnimatedCount target={value ?? 0} loading={loading} />}
      onValueClick={onOpen}
      valueLabel={openLabel}
      trailing={
        filters?.length > 0 && (
          <Button
            variant={hasActiveFilter ? "secondary" : "ghost"}
            size="sm"
            iconOnly
            icon="ti-adjustments-horizontal"
            title={hasActiveFilter ? "Filtered — change or clear" : `Filter ${label.toLowerCase()}`}
            aria-label={hasActiveFilter ? `Filtered ${label.toLowerCase()}, change or clear` : `Filter ${label.toLowerCase()}`}
            aria-expanded={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          />
        )
      }
    >
      {!loading && chipText && (
        <div className="mt-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP_TONES[chipTone]}`}>
            {chipText}
          </span>
        </div>
      )}

      <AnimatePresence initial={false}>
        {showFilters && filters?.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            // A zero explicit height plus overflow-hidden can collapse the
            // measured content to nothing and silently clip the selects, so
            // the inner wrapper keeps its own min-height.
            className="overflow-hidden"
          >
            <div className="mt-2.5 flex min-h-[34px] flex-wrap items-center gap-1.5 border-t border-neutral-200 pt-2.5">
              {filters.map((f) => (
                <div key={f.key} className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`${label}-${f.key}`}>
                    {f.placeholder ?? f.key}
                  </label>
                  <select
                    id={`${label}-${f.key}`}
                    value={filterValues?.[f.key] ?? ""}
                    onChange={(e) => onFilterChange(f.key, e.target.value || null)}
                    className="focus-ring w-full min-w-0 cursor-pointer rounded-sm border border-neutral-300 bg-white px-1.5 py-1 text-xs text-neutral-700 outline-none"
                  >
                    <option value="">{f.placeholder ?? "All"}</option>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              ))}
              {hasActiveFilter && (
                <Button
                  variant="ghost" size="sm" icon="ti-x"
                  onClick={() => filters.forEach((f) => onFilterChange(f.key, null))}
                >
                  Clear
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </StatCard>
  );
}

const RECENT_ENROLLMENT_COLUMNS = [
  { key: "student", label: "Student" },
  { key: "level",   label: "Level / Grade" },
  { key: "section", label: "Section" },
  { key: "status",  label: "Status" },
];

export default function DashboardPage() {
  usePageTitle("Dashboard");
  const navigate = useNavigate();
  const now = useClock();

  // Revenue figures come from billing-service, which already 403s
  // non-billing roles (see StudentInvoiceViewSet.financial_summary) — this
  // just keeps the UI from showing a misleading ₱0.00 strip (from the
  // silently-caught 403) to roles that were never going to get real numbers,
  // and skips the doomed fetch entirely.
  const canViewFinancials = hasAnyRole(getCurrentUser(), BILLING_ROLES);
  // /scholarships is ACADEMIC_STAFF-only (App.jsx) — teacher/accounting can
  // reach the Dashboard (STAFF_ALL) but clicking through to Scholarships
  // silently bounces them back here via PrivateRoute's redirect, so the
  // scholarship count stays visible (its own data is fine for any staff
  // role) but the links to /scholarships are hidden for roles that can't use them.
  const canViewScholarships = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);
  const canViewAnalytics = hasAnyRole(getCurrentUser(), ACADEMIC_STAFF);

  const [enrolledFilters, setEnrolledFilters] = useState({ year: null, level: null, grade: null });
  const [pendingFilters, setPendingFilters]   = useState({ year: null, level: null, grade: null });
  const [financialYear, setFinancialYear]     = useState(null);
  const [showFinancialFilters, setShowFinancialFilters] = useState(false);
  const [showAmounts, setShowAmounts] = useState(true);

  function updateFilter(setter) {
    return (key, val) => setter((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "level") next.grade = null;
      return next;
    });
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [totalStudents, setTotalStudents]       = useState(0);
  const [activeStudents, setActiveStudents]     = useState(0);
  const [enrolledCount, setEnrolledCount]       = useState(0);
  const [pendingCount, setPendingCount]         = useState(0);
  const [scholarshipCount, setScholarshipCount] = useState(0);

  const [summary, setSummary] = useState(null);
  const [recentEnrollments, setRecentEnrollments] = useState([]);

  const [financialSummary, setFinancialSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);

  const { schoolYear, options: schoolYearOptions } = useSchoolYear();

  const isFirstEnrolledFetch = useRef(true);
  const isFirstPendingFetch = useRef(true);
  const isFirstFinancialFetch = useRef(true);

  async function fetchAll() {
    setLoading(true);
    try {
      await Promise.all([
        // One call for the pipeline, level distribution, attendance series and
        // risk bands. It replaces six requests — five of which existed only to
        // read `.count` off a one-row page per school level — and is the only
        // source of period-grouped data, so the trend charts depend on it.
        fetchDashboardSummary(),
        fetchStudentStats(),
        // These two stay separate: their tiles are independently filterable by
        // year/level/grade, and the summary describes the whole school year.
        fetchEnrollmentStats(),
        fetchPendingStats(),
        fetchRecentEnrollments(),
        fetchScholarships(),
        fetchAlerts(),
        ...(canViewFinancials ? [fetchFinancialSummary()] : []),
      ]);
      setError("");
    } catch (e) {
      console.error("Dashboard fetch error:", e);
      setError(describeApiError(e, { subject: "your dashboard" }).message);
    } finally {
      setLoading(false);
    }
  }

  function parseGp(f) {
    if (f.grade) return { grade_level: f.grade };
    if (f.level) return { school_level: f.level };
    return {};
  }

  function cardLink(path, params) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return qs ? `${path}?${qs}` : path;
  }

  async function fetchDashboardSummary() {
    setSummary(await _getDashboardSummary({ school_year: schoolYear }));
  }

  async function fetchStudentStats() {
    const [data, active] = await Promise.all([
      _getStudents({ page_size: 1 }),
      _getStudents({ status: "active", page_size: 1 }),
    ]);
    setTotalStudents(data.count ?? 0);
    setActiveStudents(active.count ?? 0);
  }

  async function fetchEnrollmentStats() {
    const sy = enrolledFilters.year ?? schoolYear;
    const data = await _getEnrollments({ enrollment_status: "enrolled", school_year: sy, page_size: 1, ...parseGp(enrolledFilters) });
    setEnrolledCount(data.count ?? 0);
  }

  async function fetchPendingStats() {
    const sy = pendingFilters.year ?? schoolYear;
    const data = await _getEnrollments({ enrollment_status: "pending", school_year: sy, page_size: 1, ...parseGp(pendingFilters) });
    setPendingCount(data.count ?? 0);
  }

  async function fetchRecentEnrollments() {
    const data = await _getEnrollments({ school_year: schoolYear, page_size: 10, ordering: "-enrollment_id" });
    setRecentEnrollments((data.results ?? []).slice(0, 5));
  }

  async function fetchScholarships() {
    // page_size:1 and the paginator's own `count`, matching the enrolled and
    // pending fetchers above. Counting `results.length` off a page instead
    // capped the tile at its own page size — it read 4 for any total of 4 or
    // more. An unpaginated response has no `count`, so fall back to the rows.
    const data = await _getEnrollmentScholarships({ page_size: 1, school_year: schoolYear });
    if (Array.isArray(data)) { setScholarshipCount(data.length); return; }
    setScholarshipCount(data.count ?? (data.results ?? []).length);
  }

  async function fetchFinancialSummary() {
    try {
      setFinancialSummary(await _getFinancialSummary(financialYear ?? schoolYear));
    } catch { /* non-critical */ }
  }

  async function fetchAlerts() {
    const newAlerts = [];
    try {
      const [unpaidData, pendingEnrData] = await Promise.all([
        // Billing-service-gated — skip entirely for non-billing roles rather
        // than making a call that's always going to 403.
        canViewFinancials ? _getInvoices({ status: "unpaid", page_size: 1 }).catch(() => null) : Promise.resolve(null),
        _getEnrollments({ enrollment_status: "pending", school_year: schoolYear, page_size: 1 }).catch(() => null),
      ]);
      if (unpaidData?.count > 0) {
        newAlerts.push({
          id: "unpaid", icon: "ti-receipt-off", tone: "error",
          message: `${unpaidData.count} unpaid invoice${unpaidData.count !== 1 ? "s" : ""}`,
          link: "/invoices?status=unpaid",
        });
      }
      if (pendingEnrData?.count > 0) {
        newAlerts.push({
          id: "pending_enr", icon: "ti-clock", tone: "warning",
          message: `${pendingEnrData.count} enrollment${pendingEnrData.count !== 1 ? "s" : ""} pending approval`,
          link: `/enrollments?enrollment_status=pending&school_year=${schoolYear}`,
        });
      }
    } catch { /* alerts are non-critical */ }
    setAlerts(newAlerts);
  }

  useEffect(() => {
    if (!schoolYear) return; // global school year still resolving
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolYear]);

  useEffect(() => {
    if (isFirstEnrolledFetch.current) { isFirstEnrolledFetch.current = false; return; }
    fetchEnrollmentStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrolledFilters]);
  useEffect(() => {
    if (isFirstPendingFetch.current) { isFirstPendingFetch.current = false; return; }
    fetchPendingStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFilters]);
  useEffect(() => {
    if (isFirstFinancialFetch.current) { isFirstFinancialFetch.current = false; return; }
    fetchFinancialSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financialYear]);


  const yearOpts = schoolYearOptions.map((y) => ({ value: y, label: y }));
  const levelOpts = Object.entries(LEVEL_LABELS).map(([v, l]) => ({ value: v, label: l }));
  const gradeOpts = (f) => (LEVEL_GRADES[f.level] ?? []).map((g) => ({ value: g, label: g }));

  // The revenue figures, their sparkline series and the collection rate all
  // moved into BillingPanel, which derives them from the same payload.

  return (
    <>
      <PageHeader
        title="Dashboard"
        icon="ti-layout-dashboard"
        subtitle={`S.Y. ${schoolYear} · ${now.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`}
        actions={
          <div className="text-right">
            <div className="text-xl font-bold tabular-nums tracking-[-0.02em] text-neutral-900">
              {now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div className="text-xs text-neutral-500">
              {now.toLocaleTimeString("en-PH", { timeZoneName: "short" }).split(" ").pop()}
            </div>
          </div>
        }
      />

      <motion.div
        variants={pageVariants.container}
        initial="hidden"
        animate="visible"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-6 xl:overflow-hidden"
      >
        <AnimatePresence>
          {error && (
            <Alert variant="error" dismissible onDismiss={() => setError("")}>
              {error}
            </Alert>
          )}
        </AnimatePresence>

        {/* Things needing attention, surfaced before the metrics. */}
        {alerts.length > 0 && (
          <motion.div variants={pageVariants.item} className="flex flex-wrap gap-2.5">
            {alerts.map((al) => (
              <button
                key={al.id}
                type="button"
                onClick={() => navigate(al.link)}
                className={[
                  "focus-ring flex min-w-[200px] flex-1 items-center gap-2.5 rounded-md border px-4 py-2.5 text-sm font-semibold transition-colors",
                  al.tone === "error"
                    ? "border-error-500/25 bg-error-50 text-error-500 hover:bg-error-50/70"
                    : "border-warning-500/25 bg-warning-50 text-warning-500 hover:bg-warning-50/70",
                ].join(" ")}
              >
                <i className={`ti ${al.icon} text-[16px]`} aria-hidden="true" />
                {al.message}
                <i className="ti ti-arrow-right ml-auto text-[13px]" aria-hidden="true" />
              </button>
            ))}
          </motion.div>
        )}

        {/* Headline metrics */}
        <motion.div variants={pageVariants.item} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardStat
            label="Total Students" icon="ti-users" iconTone="brand" value={totalStudents} loading={loading}
            chipText={`${activeStudents.toLocaleString()} active`} chipTone="up"
            onOpen={() => navigate("/students")} openLabel="View all students"
          />
          <DashboardStat
            label="Enrolled this S.Y." icon="ti-calendar-event" iconTone="success" value={enrolledCount} loading={loading}
            chipText={`S.Y. ${enrolledFilters.year ?? schoolYear}`} chipTone="neutral"
            filters={[
              { key: "year",  options: yearOpts,  placeholder: "S.Y." },
              { key: "level", options: levelOpts, placeholder: "All Levels" },
              ...(enrolledFilters.level ? [{ key: "grade", options: gradeOpts(enrolledFilters), placeholder: "All Grades" }] : []),
            ]}
            filterValues={enrolledFilters}
            onFilterChange={updateFilter(setEnrolledFilters)}
            openLabel="View enrolled students"
            onOpen={() => navigate(cardLink("/enrollments", {
              enrollment_status: "enrolled",
              school_year: enrolledFilters.year ?? schoolYear,
              ...parseGp(enrolledFilters),
            }))}
          />
          <DashboardStat
            label="Pending Enrollment" icon="ti-clipboard-list" iconTone="warning" value={pendingCount} loading={loading}
            chipText={pendingCount > 0 ? "needs action" : "all clear"}
            chipTone={pendingCount > 0 ? "down" : "up"}
            filters={[
              { key: "year",  options: yearOpts,  placeholder: "S.Y." },
              { key: "level", options: levelOpts, placeholder: "All Levels" },
              ...(pendingFilters.level ? [{ key: "grade", options: gradeOpts(pendingFilters), placeholder: "All Grades" }] : []),
            ]}
            filterValues={pendingFilters}
            onFilterChange={updateFilter(setPendingFilters)}
            openLabel="View pending enrollments"
            onOpen={() => navigate(cardLink("/enrollments", {
              enrollment_status: "pending",
              school_year: pendingFilters.year ?? schoolYear,
              ...parseGp(pendingFilters),
            }))}
          />
          <DashboardStat
            label="Scholarships Awarded" icon="ti-award" iconTone="accent" value={scholarshipCount} loading={loading}
            chipText={`S.Y. ${schoolYear}`} chipTone="info"
            onOpen={canViewScholarships ? () => navigate("/scholarships") : undefined}
            openLabel="View scholarships"
          />
        </motion.div>

        {/* Billing — one panel, not four tiles. collected + outstanding =
            net_billed and the rate is collected ÷ net_billed, so these were
            never four independent metrics; the panel shows that relationship
            instead of restating one fact across four peer cards.

            Billing roles only: the backend 403s everyone else, so a ₱0.00
            strip shown to other roles would just mislead. */}
        {canViewFinancials && (
          <motion.div variants={pageVariants.item}>
            <BillingPanel
              summary={financialSummary}
              loading={loading}
              schoolYear={schoolYear}
              filterYear={financialYear}
              onFilterYearChange={setFinancialYear}
              schoolYearOptions={schoolYearOptions}
              showAmounts={showAmounts}
              onToggleAmounts={() => setShowAmounts((v) => !v)}
              showFilters={showFinancialFilters}
              onToggleFilters={() => setShowFinancialFilters((v) => !v)}
              onOpenInvoices={(link) => navigate(link)}
            />
          </motion.div>
        )}

        {/* The three questions the dashboard exists to answer, in one row:
            where students are in the process, who needs help, and whether the
            school is turning up. All three are scoped server-side — a teacher
            sees their own advisory roster, not the school. */}
        <motion.div variants={pageVariants.item} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <PipelineBand
            pipeline={summary?.pipeline}
            loading={loading}
            schoolYear={schoolYear}
            compact
          />
          <RiskBand
            risk={summary?.risk}
            loading={loading}
            compact
            onOpen={
              canViewAnalytics ? (
                <Button variant="ghost" size="sm" iconRight icon="ti-arrow-right"
                  onClick={() => navigate("/analytics")}>
                  Analytics
                </Button>
              ) : undefined
            }
          />
          <AttendanceBand series={summary?.attendance_series} loading={loading} compact />
        </motion.div>

        <motion.div variants={pageVariants.item} className="flex min-h-0 flex-1 flex-col">
          <Panel
            title="Recent Enrollments"
            padding="none"
            className="min-h-0 flex-1"
            bodyClassName="overflow-auto"
            action={
              <Button variant="ghost" size="sm" iconRight icon="ti-arrow-right" onClick={() => navigate("/enrollments")}>
                View all
              </Button>
            }
          >
            <Table
              columns={RECENT_ENROLLMENT_COLUMNS}
              loading={loading}
              skeletonRows={5}
              stickyHeader={false}
              isEmpty={recentEnrollments.length === 0}
              empty={{
                icon: "ti-clipboard-off",
                title: "No enrollments yet",
                subtitle: `Nothing recorded for S.Y. ${schoolYear}.`,
                withAvatar: false,
              }}
            >
              {recentEnrollments.map((en) => (
                <TableRow key={en.enrollment_id} onClick={() => navigate(`/enrollments/${en.enrollment_id}`)}>
                  <TableCell className="font-semibold text-neutral-900">
                    {en.student_name ?? `Student #${en.student}`}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <i
                        className={`ti ${LEVEL_ICONS[en.school_level] ?? "ti-school"} text-[13px] text-neutral-600`}
                        aria-hidden="true"
                      />
                      {LEVEL_LABELS[en.school_level] ?? en.school_level} · {en.grade_level}
                    </span>
                  </TableCell>
                  <TableCell>{en.section}</TableCell>
                  <TableCell>
                    <StatusBadge status={en.enrollment_status} map={ENROLLMENT_STATUS_MAP} />
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          </Panel>
        </motion.div>
      </motion.div>
    </>
  );
}
