import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Card, { Panel } from "../components/ui/Card";
import Alert from "../components/ui/Alert";
import ErrorState from "../components/ui/ErrorState";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import { StatusBadge } from "../components/ui/Badge";
import SegmentedControl from "../components/ui/SegmentedControl";
import CompareCharts from "../components/charts/compare/CompareCharts";
import { defaultCompareYears, previousLabel } from "../components/schoolYears/yearHelpers";
import { KINDS, changeBetween, fmtCount, num, share } from "../components/schoolYears/compareFigures";
import { SCHOOL_YEAR_STATE_MAP } from "../constants/statusMaps";
import { LEVEL_LABELS } from "../constants/schoolLevels";
import { GRADE_ORDER } from "../utils/grading";
import { listRegisteredSchoolYears, compareSchoolYears } from "../api/enrollmentApi";
import { getFinancialSummary, getFeeSchedules } from "../api/billingApi";

// Compare School Years — up to five registered years side by side, oldest on
// the left, each column showing its change from the one before it. Charts
// (the default) or Tables, from the same figures.
//
// Learners, classes, grades and attendance come from one enrollment-service
// request (/school-years/compare/, which says what each number counts);
// money and fees from billing, one request per year. The two load and fail
// separately, so a billing hiccup leaves the rest of the page readable.
//
// The picked years and the view live in the URL
// (?years=2025-2026,2026-2027&view=tables), so a comparison can be
// bookmarked or sent to someone and open the way it was sent.

const MAX_YEARS = 5;

const VIEWS = [
  { value: "charts", label: "Charts", icon: "ti-chart-bar" },
  { value: "tables", label: "Tables", icon: "ti-table" },
];

// ── Values and changes ──────────────────────────────────────────────────────
// Changes are neutral grey on purpose: more learners is good, more money
// outstanding isn't, and a colour meaning "good" on one row and "bad" on the
// next reads worse than none.
function Change({ value, before, kind, since }) {
  const change = changeBetween(value, before, kind);
  if (!change) return null;
  if (change.direction === "same") {
    return <div className="mt-0.5 text-[11.5px] text-neutral-400">No change</div>;
  }
  return (
    <div className="mt-0.5 inline-flex items-center gap-0.5 text-[11.5px] text-neutral-500">
      <i className={`ti ${change.direction === "up" ? "ti-arrow-up-right" : "ti-arrow-down-right"}`} aria-hidden="true" />
      <span>{change.text}</span>
      <span className="sr-only"> from S.Y. {since}</span>
    </div>
  );
}

function YearHeading({ label, state }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span>S.Y. {label}</span>
      {state && <StatusBadge status={state} map={SCHOOL_YEAR_STATE_MAP} size="sm" />}
    </div>
  );
}

// One metric per row, one year per column. A row gives `value(year)` -- the
// number the change is worked out from, or null for "no figure" -- and
// optionally `detail(year)`, a line of context under it ("40 of 52").
function CompareTable({ caption, years, states, rows, loading, error, onRetry, errorSubject }) {
  const columns = [
    { key: "metric", label: "", width: years.length > 3 ? "22%" : "30%" },
    ...years.map((y) => ({ key: y, label: <YearHeading label={y} state={states[y]} />, align: "right" })),
  ];
  return (
    <Table
      columns={columns}
      loading={loading}
      error={error}
      onRetry={onRetry}
      errorSubject={errorSubject}
      skeletonRows={4}
      empty={{ withAvatar: false }}
      stickyHeader={false}
      aria-label={caption}
    >
      {rows.map((row) => (
        <TableRow key={row.key}>
          <TableCell className={row.sub ? "pl-9 text-[13px] text-neutral-600" : "text-[13.5px] font-semibold text-neutral-900"}>
            {row.label}
            {row.hint && <div className="mt-0.5 text-[11.5px] font-normal text-neutral-500">{row.hint}</div>}
          </TableCell>
          {years.map((y, i) => {
            const v = row.value(y);
            return (
              <TableCell key={y} align="right" className="align-top tabular-nums text-[13.5px]">
                {v == null ? (
                  <span className="text-neutral-400" title={row.missing ?? "No figure for this year"}>—</span>
                ) : (
                  KINDS[row.kind].value(v)
                )}
                {v != null && row.detail && (
                  <div className="text-[11.5px] text-neutral-500">{row.detail(y)}</div>
                )}
                {i > 0 && (
                  <div>
                    <Change value={v} before={row.value(years[i - 1])} kind={row.kind} since={years[i - 1]} />
                  </div>
                )}
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </Table>
  );
}

// ── The rows ────────────────────────────────────────────────────────────────
function learnerRows(years, get) {
  const levels = Object.keys(LEVEL_LABELS).filter((level) =>
    years.some((y) => get(y)?.enrollment.by_level[level]),
  );
  return [
    { key: "learners", label: "Learners", kind: "count", value: (y) => get(y)?.enrollment.learners ?? null,
      hint: "Enrolled, completed or transferred out, each counted once" },
    ...levels.map((level) => ({
      key: level, label: LEVEL_LABELS[level], sub: true, kind: "count",
      value: (y) => get(y)?.enrollment.by_level[level] ?? null,
    })),
    { key: "new", label: "New to the school", kind: "count", value: (y) => get(y)?.enrollment.new ?? null,
      missing: "The year before isn't registered, so there's nothing to compare with" },
    { key: "returning", label: "Returning", kind: "count", value: (y) => get(y)?.enrollment.returning ?? null,
      missing: "The year before isn't registered, so there's nothing to compare with" },
    { key: "transferred", label: "Transferred out", kind: "count", value: (y) => get(y)?.enrollment.transferred_out ?? null },
    {
      key: "came_back", label: "Came back the next year", kind: "percent",
      hint: "Of the learners who stayed to the end of the year",
      missing: "The next year isn't registered yet",
      value: (y) => {
        const c = get(y)?.enrollment.came_back;
        return c ? share(c.count, c.of) : null;
      },
      detail: (y) => {
        const c = get(y).enrollment.came_back;
        return `${fmtCount(c.count)} of ${fmtCount(c.of)}`;
      },
    },
    { key: "pending", label: "Pending enrollments", kind: "count", value: (y) => get(y)?.enrollment.pending ?? null },
  ];
}

function classRows(get) {
  return [
    { key: "sections", label: "Sections", kind: "count", value: (y) => get(y)?.sections.total ?? null },
    {
      key: "with_adviser", label: "Sections with an adviser", kind: "count",
      value: (y) => get(y)?.sections.with_adviser ?? null,
      detail: (y) => `of ${fmtCount(get(y).sections.total)}`,
    },
    { key: "advisers", label: "Advisers", kind: "count", value: (y) => get(y)?.sections.advisers ?? null },
  ];
}

function academicRows(get) {
  return [
    {
      key: "average", label: "Average general average", kind: "average",
      hint: "DepEd final grades; a year still running shows its grades so far",
      missing: "No grades recorded",
      value: (y) => num(get(y)?.academics.general_average),
    },
    {
      key: "passed_all", label: "Passed every subject", kind: "percent",
      missing: "No grades recorded",
      value: (y) => {
        const a = get(y)?.academics;
        return a ? share(a.passed_all, a.graded_learners) : null;
      },
      detail: (y) => {
        const a = get(y).academics;
        return `${fmtCount(a.passed_all)} of ${fmtCount(a.graded_learners)} graded`;
      },
    },
    {
      key: "attendance", label: "Attendance rate", kind: "percent",
      hint: "Present or late, out of every day recorded",
      missing: "No attendance recorded",
      value: (y) => num(get(y)?.academics.attendance_rate),
    },
    { key: "scholarships", label: "Scholarships awarded", kind: "count", value: (y) => get(y)?.scholarships.awarded ?? null },
  ];
}

function moneyRows(get) {
  const amount = (field) => (y) => num(get(y)?.[field]);
  return [
    { key: "billed", label: "Billed", kind: "money", value: amount("net_billed"),
      hint: "After discounts and scholarships", detail: (y) => `${fmtCount(get(y).invoice_count)} invoices` },
    { key: "discounts", label: "Discounts given", kind: "money", value: amount("total_discounts") },
    { key: "collected", label: "Collected", kind: "money", value: amount("total_collected") },
    {
      key: "rate", label: "Collection rate", kind: "percent", missing: "Nothing billed",
      value: (y) => {
        const m = get(y);
        return m ? share(Number(m.total_collected), Number(m.net_billed)) : null;
      },
    },
    { key: "outstanding", label: "Outstanding", kind: "money", value: amount("outstanding") },
  ];
}

function feeRows(years, get) {
  const grades = new Set(years.flatMap((y) => (get(y) ?? []).map((s) => s.grade_level)));
  const rank = (g) => (GRADE_ORDER.includes(g) ? GRADE_ORDER.indexOf(g) : GRADE_ORDER.length);
  return [...grades]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((grade) => ({
      key: grade, label: grade, kind: "fee", missing: "No fee schedule for this grade",
      value: (y) => num((get(y) ?? []).find((s) => s.grade_level === grade)?.grand_total),
    }));
}

// ── Year chooser ────────────────────────────────────────────────────────────
function YearChooser({ labels, states, selected, onToggle }) {
  const full = selected.length >= MAX_YEARS;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="School years to compare">
      <span className="mr-1 text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">Years</span>
      {labels.map((label) => {
        const on = selected.includes(label);
        // The last year left can't be taken off; a sixth can't be added.
        const locked = on ? selected.length === 1 : full;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            disabled={locked}
            title={locked ? (on ? "Keep at least one year" : `Compare up to ${MAX_YEARS} years at a time`) : undefined}
            onClick={() => onToggle(label)}
            className={[
              "focus-ring inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed",
              on
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-brand-300",
              locked && !on ? "opacity-50" : "",
            ].join(" ")}
          >
            {on && <i className="ti ti-check text-[13px]" aria-hidden="true" />}
            S.Y. {label}
            {states[label] === "archived" && <span className="font-normal text-neutral-500">· Archived</span>}
          </button>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function SchoolYearComparePage() {
  usePageTitle("Compare School Years");
  const [searchParams, setSearchParams] = useSearchParams();

  const [registry, setRegistry] = useState({ years: [], loading: true, error: null });
  // Each answer keeps the years it's for (`key`). Until it matches the years
  // picked now, the tables show as loading -- never last pick's figures under
  // this pick's columns, nor "no fees yet" before billing has been asked.
  const [school, setSchool] = useState({ key: null, byYear: {}, error: null });
  const [billing, setBilling] = useState({ key: null, money: {}, fees: {}, error: null });

  const fetchRegistry = useCallback(async () => {
    setRegistry((r) => ({ ...r, loading: true, error: null }));
    try {
      const data = await listRegisteredSchoolYears();
      setRegistry({ years: Array.isArray(data) ? data : data?.results ?? [], loading: false, error: null });
    } catch (e) {
      setRegistry({ years: [], loading: false, error: e });
    }
  }, []);

  useEffect(() => {
    fetchRegistry(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchRegistry]);

  const labels = useMemo(() => registry.years.map((y) => y.label).sort(), [registry.years]);
  const states = useMemo(
    () => Object.fromEntries(registry.years.map((y) => [y.label, y.state])),
    [registry.years],
  );
  const current = registry.years.find((y) => y.state === "current")?.label;

  // What the URL asks for, less anything not registered; else the default.
  const selected = useMemo(() => {
    const asked = (searchParams.get("years") || "").split(",").filter((y) => labels.includes(y));
    const picked = asked.length ? asked : defaultCompareYears(labels, current);
    return [...new Set(picked)].sort().slice(-MAX_YEARS);
  }, [searchParams, labels, current]);
  const key = selected.join(",");
  const view = searchParams.get("view") === "tables" ? "tables" : "charts";
  // The later year of the pair the learner bridge shows; null for its default.
  const [bridgeTo, setBridgeTo] = useState(null);

  // Each control writes its own part of the URL and keeps the rest: picking a
  // year mustn't switch the view, nor the reverse.
  const setParam = (name, value) => setSearchParams((params) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    return next;
  }, { replace: true });

  const toggle = (label) => {
    const next = selected.includes(label)
      ? selected.filter((y) => y !== label)
      : [...selected, label].sort();
    if (!next.length || next.length > MAX_YEARS) return;
    // Taking off either year of the bridge's pair puts it back to its default.
    if (bridgeTo && !(next.includes(bridgeTo) && next.includes(previousLabel(bridgeTo)))) setBridgeTo(null);
    setParam("years", next.join(","));
  };

  // Only the latest pick's answers land: switching years quickly mustn't let
  // an earlier, slower request overwrite the table.
  const latest = useRef("");

  const fetchSchool = useCallback(async (years) => {
    const asked = years.join(",");
    setSchool((s) => ({ ...s, key: null, error: null }));
    try {
      const data = await compareSchoolYears(years);
      if (latest.current !== asked) return;
      setSchool({ key: asked, byYear: Object.fromEntries(data.years.map((y) => [y.label, y])), error: null });
    } catch (e) {
      if (latest.current === asked) setSchool({ key: asked, byYear: {}, error: e });
    }
  }, []);

  const fetchBilling = useCallback(async (years) => {
    const asked = years.join(",");
    setBilling((b) => ({ ...b, key: null, error: null }));
    try {
      const results = await Promise.all(
        years.map((y) => Promise.all([
          getFinancialSummary(y),
          getFeeSchedules({ school_year: y, is_active: true, page_size: 50 }),
        ])),
      );
      if (latest.current !== asked) return;
      const money = {}, fees = {};
      results.forEach(([summary, schedules], i) => {
        money[years[i]] = summary;
        fees[years[i]] = Array.isArray(schedules) ? schedules : schedules?.results ?? [];
      });
      setBilling({ key: asked, money, fees, error: null });
    } catch (e) {
      if (latest.current === asked) setBilling({ key: asked, money: {}, fees: {}, error: e });
    }
  }, []);

  useEffect(() => {
    if (!key) return;
    latest.current = key;
    const years = key.split(",");
    fetchSchool(years); // eslint-disable-line react-hooks/set-state-in-effect
    fetchBilling(years);
  }, [key, fetchSchool, fetchBilling]);

  const years = selected;
  const getSchool = (y) => school.byYear[y];
  const breadcrumbs = [{ label: "School Years", to: "/school-years" }, { label: "Compare" }];
  const schoolLoading = registry.loading || school.key !== key;
  const billingLoading = registry.loading || billing.key !== key;
  const schoolProps = {
    years, states,
    loading: schoolLoading,
    error: school.error,
    onRetry: () => fetchSchool(years),
    errorSubject: "the comparison",
  };
  const billingProps = {
    years, states,
    loading: billingLoading,
    error: billing.error,
    onRetry: () => fetchBilling(years),
    errorSubject: "billing figures",
  };
  const fees = feeRows(years, (y) => billing.fees[y]);
  // The charts read the same answers the tables do, one source per chart.
  const billingState = { loading: billingLoading, error: billing.error, onRetry: billingProps.onRetry };
  const sources = {
    school: { get: getSchool, loading: schoolLoading, error: school.error, onRetry: schoolProps.onRetry },
    money: { ...billingState, get: (y) => billing.money[y] },
    fees: { ...billingState, get: (y) => billing.fees[y] },
  };

  return (
    <>
      <PageHeader
        title="Compare School Years"
        icon="ti-arrows-left-right"
        breadcrumbs={breadcrumbs}
        subtitle={`Up to ${MAX_YEARS} years side by side. Each year shows its change from the one to its left.`}
        actions={
          <SegmentedControl
            label="View"
            options={VIEWS}
            value={view}
            onChange={(v) => setParam("view", v === "tables" ? "tables" : null)}
          />
        }
      />

      <div className="relative flex flex-1 flex-col gap-4 overflow-y-auto px-7 py-6">
        {registry.error ? (
          <ErrorState error={registry.error} subject="school years" onRetry={fetchRegistry} />
        ) : !registry.loading && labels.length === 0 ? (
          <Alert variant="info" title="No school years yet">
            Add one under <Link to="/school-years" className="font-bold underline underline-offset-2">School Years</Link> first.
          </Alert>
        ) : (
          <>
            <Card padding="sm">
              <YearChooser labels={labels} states={states} selected={selected} onToggle={toggle} />
              {!registry.loading && labels.length === 1 && (
                <p className="mt-2 text-xs text-neutral-500">Only one year is registered, so there's nothing to compare it with yet.</p>
              )}
            </Card>

            {view === "charts" ? (
              <CompareCharts
                years={years}
                states={states}
                sources={sources}
                bridgeTo={bridgeTo}
                onBridgeTo={setBridgeTo}
              />
            ) : (
              <>
                <Panel title="Learners" icon="ti-users" padding="none">
                  <CompareTable caption="Learners by year" rows={learnerRows(years, getSchool)} {...schoolProps} />
                </Panel>

                <Panel title="Classes" icon="ti-school" padding="none">
                  <CompareTable caption="Classes by year" rows={classRows(getSchool)} {...schoolProps} />
                </Panel>

                <Panel title="Grades and attendance" icon="ti-certificate" padding="none">
                  <CompareTable caption="Grades and attendance by year" rows={academicRows(getSchool)} {...schoolProps} />
                </Panel>

                <Panel title="Money" icon="ti-cash" subtitle="Invoices for each year's enrollments, as of today" padding="none">
                  <CompareTable caption="Money by year" rows={moneyRows((y) => billing.money[y])} {...billingProps} />
                </Panel>

                <Panel title="Fees by grade" icon="ti-receipt" subtitle="Each grade's total fees for the year" padding="none">
                  {!billingLoading && !billing.error && fees.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-neutral-500">
                      None of these years has a fee schedule yet. They're set up under{" "}
                      <Link to="/settings?tab=fees" className="font-semibold text-brand-600 underline underline-offset-2">Billing Settings</Link>.
                    </p>
                  ) : (
                    <CompareTable caption="Fees by grade and year" rows={fees} {...billingProps} />
                  )}
                </Panel>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
