import { usePageTitle } from "../hooks/usePageTitle";
import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Alert from "../components/ui/Alert";
import Tabs, { TabPanel } from "../components/ui/Tabs";
import { StatusBadge } from "../components/ui/Badge";
import { ConfirmDialog } from "../components/ui/Modal";
import ErrorState from "../components/ui/ErrorState";
import YearModal from "../components/schoolYears/YearModal";
import SectionsPanel from "../components/schoolYears/SectionsPanel";
import AdvisersPanel from "../components/schoolYears/AdvisersPanel";
import CarryOverModal from "../components/schoolYears/CarryOverModal";
import { progressThrough } from "../components/schoolYears/yearHelpers";
import { SCHOOL_YEAR_STATE_MAP } from "../constants/statusMaps";
import { fmtDate } from "../utils/format";
import { firstMessageFrom } from "../utils/apiError";
import { useSchoolYear } from "../context/SchoolYearContext";
import { invalidateSections } from "../hooks/useSections";
import {
  archiveSchoolYear,
  getSchoolYear,
  getSchoolYearSetup,
  getSections,
  listRegisteredSchoolYears,
  makeSchoolYearCurrent,
  unarchiveSchoolYear,
} from "../api/enrollmentApi";

// One school year: its dates and setup checklist (Overview), its sections, and
// who advises each of them.

const TABS = ["overview", "sections", "advisers"];

function ChecklistItem({ done, title, detail, children }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <i
        className={`ti ${done ? "ti-circle-check text-success-500" : "ti-circle-dashed text-neutral-400"} mt-0.5 text-[18px]`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-neutral-900">
          {title}
          <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
        </div>
        <div className="text-[12.5px] text-neutral-500">{detail}</div>
      </div>
      {children && <div className="flex shrink-0 flex-wrap justify-end gap-2">{children}</div>}
    </li>
  );
}

function Overview({ year, setup, sectionsCount, canCopy, readOnly, onEditDates, onOpenSections, onOpenAdvisers, onCopy }) {
  const isCurrent = year.state === "current";
  const pct = isCurrent ? progressThrough(year.start_date, year.end_date) : null;
  const s = setup?.sections;
  const a = setup?.advisers;
  const c = setup?.calendar;
  const yearLink = `?school_year=${year.label}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <Card padding="md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-neutral-900">Dates</h2>
          {!readOnly && <Button variant="ghost" size="sm" icon="ti-pencil" onClick={onEditDates}>Edit</Button>}
        </div>
        <div className="text-[13.5px] text-neutral-800">{fmtDate(year.start_date)} – {fmtDate(year.end_date)}</div>
        {pct !== null && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-success-dot" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-[12px] text-neutral-500">{pct}% of the year has passed</div>
          </div>
        )}
        <p className="mt-3 text-[12.5px] leading-relaxed text-neutral-500">
          Invoices for this year count their installments and Early Bird window from the start date.
        </p>
      </Card>

      <Card padding="md">
        <h2 className="text-[15px] font-bold text-neutral-900">Setup checklist</h2>
        <p className="text-[12.5px] text-neutral-500">
          {readOnly
            ? "Where this year was left when it was archived."
            : "What this year needs before classes start. Everything stays editable until it's archived."}
        </p>
        <ul className="mt-1 divide-y divide-neutral-100">
          <ChecklistItem done title="Dates" detail={`${fmtDate(year.start_date)} – ${fmtDate(year.end_date)}`} />

          <ChecklistItem
            done={sectionsCount > 0}
            title="Sections"
            detail={sectionsCount > 0
              ? `${sectionsCount} ${sectionsCount === 1 ? "section" : "sections"} across ${s?.grades ?? "…"} ${s?.grades === 1 ? "grade" : "grades"}`
              : "None yet — enrollment and advisers pick from these"}
          >
            {!readOnly && sectionsCount === 0 && canCopy && (
              <Button variant="secondary" size="sm" icon="ti-copy" onClick={() => onCopy(["sections", "advisers"])}>
                Copy from an earlier year
              </Button>
            )}
            {!readOnly && (
              <Button variant={sectionsCount ? "ghost" : "primary"} size="sm" onClick={onOpenSections}>
                {sectionsCount ? "Manage" : "Set up"}
              </Button>
            )}
          </ChecklistItem>

          <ChecklistItem
            done={Boolean(a && a.sections > 0 && a.with_adviser === a.sections)}
            title="Advisers"
            detail={a && a.sections > 0
              ? `${a.with_adviser} of ${a.sections} sections have an adviser`
              : "Set up sections first"}
          >
            {!readOnly && a && a.sections > 0 && a.with_adviser === 0 && canCopy && (
              <Button variant="secondary" size="sm" icon="ti-copy" onClick={() => onCopy(["advisers"])}>
                Copy from an earlier year
              </Button>
            )}
            {!readOnly && a && a.sections > 0 && (
              <Button
                variant={a.with_adviser === a.sections ? "ghost" : "primary"}
                size="sm"
                onClick={onOpenAdvisers}
              >
                {a.with_adviser === a.sections ? "Manage" : "Assign"}
              </Button>
            )}
          </ChecklistItem>

          <ChecklistItem
            done={(c?.quarters_set ?? 0) >= 4}
            title="Quarter dates"
            detail={`${c?.quarters_set ?? 0} of 4 grading periods set on the calendar`}
          >
            <Button variant="ghost" size="sm" to={`/academic-calendar${yearLink}`}>Calendar</Button>
          </ChecklistItem>

          <ChecklistItem
            done={(c?.holidays ?? 0) > 0}
            title="Holidays"
            detail={c?.holidays ? `${c.holidays} on the calendar` : "None yet — the calendar can import PH holidays"}
          >
            <Button variant="ghost" size="sm" to={`/academic-calendar${yearLink}`}>Calendar</Button>
          </ChecklistItem>
        </ul>
      </Card>
    </div>
  );
}

export default function SchoolYearDetailPage() {
  const { label } = useParams();
  usePageTitle(`S.Y. ${label}`);
  const { refreshYears } = useSchoolYear();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.includes(searchParams.get("tab")) ? searchParams.get("tab") : "overview";
  const [tabDir, setTabDir] = useState(0);

  const [year, setYear] = useState(null);
  const [years, setYears] = useState([]);
  const [setup, setSetup] = useState(null);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [copying, setCopying] = useState(null);   // the parts to start with
  const [confirmCurrent, setConfirmCurrent] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(null);   // "archive" | "unarchive"
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const fetchYear = useCallback(async () => {
    setLoadError(null);
    try {
      const [y, all, s] = await Promise.all([
        getSchoolYear(label),
        listRegisteredSchoolYears(),
        getSchoolYearSetup(label).catch(() => null),
      ]);
      setYear(y);
      setYears(Array.isArray(all) ? all : all?.results ?? []);
      setSetup(s);
    } catch (e) {
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }, [label]);

  const fetchSections = useCallback(async () => {
    setSectionsLoading(true);
    try {
      const data = await getSections({ school_year: label });
      setSections(Array.isArray(data) ? data : data?.results ?? []);
    } catch {
      setSections([]);
    } finally {
      setSectionsLoading(false);
    }
  }, [label]);

  useEffect(() => {
    fetchYear(); // eslint-disable-line react-hooks/set-state-in-effect
    fetchSections();
  }, [fetchYear, fetchSections]);

  // Sections feed every placement picker; dates and the current year feed
  // every year picker. A change here reaches both now.
  const afterSectionsChange = useCallback(() => {
    invalidateSections();
    fetchSections();
    getSchoolYearSetup(label).then(setSetup).catch(() => {});
  }, [fetchSections, label]);

  const afterYearChange = useCallback(() => {
    fetchYear();
    refreshYears();
  }, [fetchYear, refreshYears]);

  const setTab = (next) => {
    setTabDir(TABS.indexOf(next) > TABS.indexOf(tab) ? 1 : -1);
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab"); else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const handleMakeCurrent = async () => {
    setBusy(true); setConfirmError("");
    try {
      await makeSchoolYearCurrent(label);
      toast.success(`S.Y. ${label} is now the current year.`);
      setConfirmCurrent(false);
      afterYearChange();
    } catch (e) {
      setConfirmError(firstMessageFrom(e) || "Failed to change the current year.");
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    const archiving = confirmArchive === "archive";
    setBusy(true); setConfirmError("");
    try {
      await (archiving ? archiveSchoolYear : unarchiveSchoolYear)(label);
      toast.success(archiving ? `S.Y. ${label} is archived.` : `S.Y. ${label} is open for changes again.`);
      setConfirmArchive(null);
      afterYearChange();
    } catch (e) {
      setConfirmError(firstMessageFrom(e) || `Failed to ${confirmArchive} the year.`);
    } finally {
      setBusy(false);
    }
  };

  const breadcrumbs = [{ label: "School Years", to: "/school-years" }, { label: `S.Y. ${label}` }];

  if (!loading && loadError) {
    return (
      <>
        <PageHeader title={`S.Y. ${label}`} icon="ti-calendar-stats" breadcrumbs={breadcrumbs} />
        <div className="px-7 py-6">
          <ErrorState error={loadError} subject="this school year" onRetry={fetchYear} />
        </div>
      </>
    );
  }

  const current = years.find((y) => y.state === "current");
  const canMakeCurrent = year && year.state !== "current" && year.state !== "archived";
  // Only a year that has ended: not the current one, not one still to come.
  const canArchive = year?.state === "open";
  const isArchived = year?.state === "archived";
  const unfinished = setup?.enrollments?.unfinished ?? 0;

  return (
    <>
      <PageHeader
        title={`S.Y. ${label}`}
        icon="ti-calendar-stats"
        breadcrumbs={breadcrumbs}
        subtitle={year ? (
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={year.state} map={SCHOOL_YEAR_STATE_MAP} size="sm" />
            {fmtDate(year.start_date)} – {fmtDate(year.end_date)}
          </span>
        ) : "Loading…"}
        actions={(canMakeCurrent || canArchive || isArchived) && (
          <div className="flex items-center gap-2">
            {canArchive && (
              <Button variant="secondary" icon="ti-archive" onClick={() => setConfirmArchive("archive")}>Archive</Button>
            )}
            {isArchived && (
              <Button variant="secondary" icon="ti-archive-off" onClick={() => setConfirmArchive("unarchive")}>Unarchive</Button>
            )}
            {canMakeCurrent && (
              <Button icon="ti-player-play" onClick={() => setConfirmCurrent(true)}>Make current</Button>
            )}
          </div>
        )}
      />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-7 py-6">
        {isArchived && (
          <Alert variant="info" title={`Archived ${fmtDate(year.archived_at)}`}>
            Its records are read-only, grade corrections included. Payments still go through.
            Unarchive it to make changes.
          </Alert>
        )}

        <Tabs
          tabs={[
            { id: "overview", label: "Overview", icon: "ti-list-check" },
            { id: "sections", label: "Sections", icon: "ti-layout-grid", count: sectionsLoading ? null : sections.length },
            { id: "advisers", label: "Advisers", icon: "ti-user-check" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {year && (
          <TabPanel id={tab} direction={tabDir}>
            {tab === "overview" ? (
              <Overview
                year={year}
                setup={setup}
                sectionsCount={sections.length}
                canCopy={years.some((y) => y.label !== label)}
                readOnly={isArchived}
                onEditDates={() => setEditing(true)}
                onOpenSections={() => setTab("sections")}
                onOpenAdvisers={() => setTab("advisers")}
                onCopy={setCopying}
              />
            ) : tab === "sections" ? (
              <SectionsPanel
                schoolYear={label}
                years={years}
                sections={sections}
                loading={sectionsLoading}
                readOnly={isArchived}
                onChanged={afterSectionsChange}
              />
            ) : (
              <AdvisersPanel
                schoolYear={label}
                years={years}
                sections={sections}
                sectionsLoading={sectionsLoading}
                readOnly={isArchived}
                onChanged={afterSectionsChange}
                onOpenSections={() => setTab("sections")}
              />
            )}
          </TabPanel>
        )}
      </div>

      <AnimatePresence>
        {editing && year && (
          <YearModal
            key="edit-dates"
            year={year}
            suggestion={{}}
            onClose={() => setEditing(false)}
            onSaved={afterYearChange}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {copying && (
          <CarryOverModal
            key="carry-over"
            schoolYear={label}
            years={years}
            initialParts={copying}
            onClose={() => setCopying(null)}
            onDone={afterSectionsChange}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmArchive && (
          <ConfirmDialog
            key="archive"
            icon={confirmArchive === "archive" ? "ti-archive" : "ti-archive-off"}
            danger={false}
            title={confirmArchive === "archive" ? `Archive S.Y. ${label}?` : `Unarchive S.Y. ${label}?`}
            message={confirmArchive === "archive" ? (
              <>
                Its enrollments, grades, attendance, advisers, sections and calendar become read-only.
                Even a grade correction will need it unarchived first. Payments still go through.
                {unfinished > 0 && (
                  <>
                    {" "}<strong>
                      {unfinished} {unfinished === 1 ? "learner is" : "learners are"} still enrolled or pending
                    </strong>{" "}
                    in this year and will stay that way. Promotion only moves learners marked completed.
                  </>
                )}
              </>
            ) : (
              <>Its records become editable again. Archive it again once the corrections are done.</>
            )}
            error={confirmError}
            confirmLabel={confirmArchive === "archive" ? "Archive" : "Unarchive"}
            loading={busy}
            onConfirm={handleArchive}
            onCancel={() => { setConfirmArchive(null); setConfirmError(""); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmCurrent && (
          <ConfirmDialog
            key="make-current"
            icon="ti-player-play"
            danger={false}
            title={`Make S.Y. ${label} current?`}
            message={
              <>
                Every page will open on <strong>S.Y. {label}</strong>.
                {current && current.label !== label && (
                  <> S.Y. {current.label} stays open for final grades and late payments; it isn't archived.</>
                )}
              </>
            }
            error={confirmError}
            confirmLabel="Make current"
            loading={busy}
            onConfirm={handleMakeCurrent}
            onCancel={() => { setConfirmCurrent(false); setConfirmError(""); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
