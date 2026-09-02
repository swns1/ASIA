import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useNavigate } from "react-router-dom";

import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card, { Panel } from "../components/ui/Card";
import Alert from "../components/ui/Alert";
import Skeleton from "../components/ui/Skeleton";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import { StatusBadge } from "../components/ui/Badge";
import { ENROLLMENT_STATUS_MAP } from "../constants/statusMaps";
import { describeApiError } from "../utils/apiError";
import Sparkline from "../components/charts/Sparkline";
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

const peso = (n) =>
  `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Dashboard stat tile.
 *
 * The card itself is a plain container and the metric is a button, rather than
 * the whole card being clickable — the previous version nested filter buttons
 * and selects inside a clickable div, which is invalid and unreachable by
 * keyboard.
 */
function DashboardStat({
  label, icon, value, loading, chipText, chipTone = "neutral",
  onOpen, openLabel, filters, filterValues, onFilterChange,
}) {
  const [showFilters, setShowFilters] = useState(false);
  const hasActiveFilter = filters?.some((f) => filterValues?.[f.key]);

  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.07em] text-neutral-500">
          {label}
        </span>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-100">
          <i className={`ti ${icon} text-[15px] text-brand-500`} aria-hidden="true" />
        </div>
      </div>

      <div className="text-2xl font-bold leading-none text-neutral-900">
        {loading ? (
          <Skeleton height={28} width="60%" variant="pulse" />
        ) : onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            aria-label={openLabel}
            className="focus-ring rounded-sm transition-colors hover:text-brand-500"
          >
            <AnimatedCount target={value ?? 0} loading={loading} />
          </button>
        ) : (
          <AnimatedCount target={value ?? 0} loading={loading} />
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        {loading ? (
          <Skeleton height={16} width="60%" variant="pulse" />
        ) : (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP_TONES[chipTone]}`}>
            {chipText}
          </span>
        )}

        {filters?.length > 0 && (
          <div className="flex shrink-0 gap-1">
            {hasActiveFilter && (
              <Button
                variant="ghost" size="sm" icon="ti-x"
                onClick={() => filters.forEach((f) => onFilterChange(f.key, null))}
              >
                Clear
              </Button>
            )}
            <Button
              variant={hasActiveFilter ? "secondary" : "ghost"}
              size="sm"
              icon="ti-adjustments-horizontal"
              aria-expanded={showFilters}
              onClick={() => setShowFilters((v) => !v)}
            >
              {hasActiveFilter ? "Filtered" : "Filter"}
            </Button>
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {showFilters && filters?.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex gap-1.5 border-t border-neutral-200 pt-2.5">
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
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
    const data = await _getEnrollmentScholarships({ page_size: 4, school_year: schoolYear });
    const results = Array.isArray(data) ? data : data.results ?? [];
    setScholarshipCount(results.length);
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
    const token = sessionStorage.getItem("access_token");
    if (!token) { navigate("/"); return; }
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

  const revenueCells = [
    { label: "Net Billed",  key: "net_billed",      icon: "ti-receipt",      tone: "bg-info-50 text-info-500",       link: "/invoices" },
    { label: "Collected",   key: "total_collected", icon: "ti-cash",         tone: "bg-success-50 text-success-500", link: "/invoices?status=paid", series: "cumulative" },
    { label: "Outstanding", key: "outstanding",     icon: "ti-alert-circle", tone: "bg-error-50 text-error-500",     link: "/invoices?status=unpaid" },
  ];

  // Only "Collected" gets a sparkline: it is the one figure with real
  // month-by-month history. `net_billed` is a single balance and
  // `outstanding` is derived from it, so neither has a series to draw.
  const collectionsSpark = {
    cumulative: (financialSummary?.collections_series ?? []).map((m) => Number(m.cumulative)),
  };

  const net = parseFloat(financialSummary?.net_billed ?? 0);
  const collected = parseFloat(financialSummary?.total_collected ?? 0);
  const collectionPct = net > 0 ? Math.min(100, Math.round((collected / net) * 100)) : 0;

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

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-6 xl:overflow-hidden">
        <AnimatePresence>
          {error && (
            <Alert variant="error" dismissible onDismiss={() => setError("")}>
              {error}
            </Alert>
          )}
        </AnimatePresence>

        {/* Things needing attention, surfaced before the metrics. */}
        {alerts.length > 0 && (
          <div className="flex flex-wrap gap-2.5">
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
          </div>
        )}

        {/* Headline metrics */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardStat
            label="Total Students" icon="ti-users" value={totalStudents} loading={loading}
            chipText={`${activeStudents.toLocaleString()} active`} chipTone="up"
            onOpen={() => navigate("/students")} openLabel="View all students"
          />
          <DashboardStat
            label="Enrolled this S.Y." icon="ti-calendar-event" value={enrolledCount} loading={loading}
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
            label="Pending Enrollment" icon="ti-clipboard-list" value={pendingCount} loading={loading}
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
            label="Scholarships Awarded" icon="ti-award" value={scholarshipCount} loading={loading}
            chipText={`S.Y. ${schoolYear}`} chipTone="info"
            onOpen={canViewScholarships ? () => navigate("/scholarships") : undefined}
            openLabel="View scholarships"
          />
        </div>

        {/* Revenue — billing roles only; the backend 403s everyone else, so
            showing a ₱0.00 strip to other roles would just mislead. */}
        {canViewFinancials && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {revenueCells.map((item) => (
              <Card key={item.key} padding="md" className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-sm ${item.tone}`}>
                    <i className={`ti ${item.icon} text-[14px]`} aria-hidden="true" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500">
                    {item.label}
                  </span>
                </div>
                {loading ? (
                  <Skeleton height={22} width="70%" variant="pulse" />
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate(item.link)}
                    className="focus-ring rounded-sm text-left text-xl font-bold tracking-[-0.02em] text-neutral-900 transition-colors hover:text-brand-500"
                    style={{
                      filter: showAmounts ? "none" : "blur(8px)",
                      userSelect: showAmounts ? "auto" : "none",
                    }}
                  >
                    {peso(financialSummary?.[item.key])}
                  </button>
                )}
                <div className="flex items-end justify-between gap-2">
                  <div className="text-xs text-neutral-500">S.Y. {financialYear ?? schoolYear}</div>
                  {/* A sparkline only where a real series exists. Collections
                      are the one dashboard figure with month-by-month history
                      behind them (Payment.payment_date); the student and
                      enrolment counts have no time axis in the schema, and
                      drawing a trend line for them would be inventing one. */}
                  {!loading && item.series && (
                    <Sparkline
                      values={collectionsSpark[item.series] ?? []}
                      className={showAmounts ? "" : "blur-[6px]"}
                    />
                  )}
                </div>
              </Card>
            ))}

            <Card padding="md" className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-accent-50">
                  <i className="ti ti-chart-pie text-[14px] text-accent-500" aria-hidden="true" />
                </div>
                <span className="flex-1 text-xs font-semibold uppercase tracking-[0.06em] text-neutral-500">
                  Collection Rate
                </span>
                <div className="flex gap-1">
                  {financialYear && (
                    <Button variant="ghost" size="sm" iconOnly icon="ti-x"
                      title="Reset to current school year" aria-label="Reset to current school year"
                      onClick={() => setFinancialYear(null)} />
                  )}
                  <Button
                    variant={showAmounts ? "secondary" : "ghost"} size="sm" iconOnly
                    icon={showAmounts ? "ti-eye" : "ti-eye-off"}
                    title={showAmounts ? "Hide amounts" : "Show amounts"}
                    aria-label={showAmounts ? "Hide financial amounts" : "Show financial amounts"}
                    aria-pressed={!showAmounts}
                    onClick={() => setShowAmounts((v) => !v)}
                  />
                  <Button
                    variant={financialYear ? "secondary" : "ghost"} size="sm" iconOnly
                    icon="ti-adjustments-horizontal"
                    title="Filter by school year" aria-label="Filter by school year"
                    aria-expanded={showFinancialFilters}
                    onClick={() => setShowFinancialFilters((v) => !v)}
                  />
                </div>
              </div>

              <AnimatePresence initial={false}>
                {showFinancialFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <label className="sr-only" htmlFor="financial-year">School year</label>
                    <select
                      id="financial-year"
                      value={financialYear ?? ""}
                      onChange={(e) => setFinancialYear(e.target.value || null)}
                      className="focus-ring w-full cursor-pointer rounded-sm border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 outline-none"
                    >
                      <option value="">Current ({schoolYear})</option>
                      {schoolYearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </motion.div>
                )}
              </AnimatePresence>

              {loading ? (
                <Skeleton height={22} width="50%" variant="pulse" />
              ) : (
                <div
                  className={`text-xl font-bold ${
                    collectionPct >= 80 ? "text-success-500"
                      : collectionPct >= 50 ? "text-warning-500" : "text-error-500"
                  }`}
                  style={{ filter: showAmounts ? "none" : "blur(8px)", userSelect: showAmounts ? "auto" : "none" }}
                >
                  {collectionPct}%
                </div>
              )}
              <div
                className="h-1.5 overflow-hidden rounded-full bg-neutral-200"
                role="progressbar"
                aria-valuenow={collectionPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Collection rate"
              >
                {!loading && (
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${
                      !showAmounts ? "bg-neutral-400"
                        : collectionPct >= 80 ? "bg-success-dot"
                        : collectionPct >= 50 ? "bg-warning-dot" : "bg-brand-500"
                    }`}
                    style={{ width: showAmounts ? `${collectionPct}%` : "50%" }}
                  />
                )}
              </div>
            </Card>
          </div>
        )}

        {/* The three questions the dashboard exists to answer, in one row:
            where students are in the process, who needs help, and whether the
            school is turning up. All three are scoped server-side — a teacher
            sees their own advisory roster, not the school. */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
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
        </div>
      </div>
    </>
  );
}
