import { usePageTitle } from "../hooks/usePageTitle";
import { useIsFirstRender } from "../hooks/useIsFirstRender";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Alert from "../components/ui/Alert";
import { StatusBadge } from "../components/ui/Badge";
import Table, { TableRow, TableCell } from "../components/ui/Table";
import { ConfirmDialog } from "../components/ui/Modal";
import YearModal from "../components/schoolYears/YearModal";
import { progressThrough, suggestNewYear } from "../components/schoolYears/yearHelpers";
import { SCHOOL_YEAR_STATE_MAP } from "../constants/statusMaps";
import { fmtDate } from "../utils/format";
import { firstMessageFrom } from "../utils/apiError";
import { useSchoolYear } from "../context/SchoolYearContext";
import {
  listRegisteredSchoolYears,
  deleteSchoolYear,
  makeSchoolYearCurrent,
} from "../api/enrollmentApi";

// School Years — the registry every year picker reads.
//
// An admin creates next year ahead of time (it shows as Upcoming), makes it
// current when the school moves over, and the previous year stays Open for
// final grades and late payments. Archiving is a later phase; the state
// column already shows it when it exists.

const TABLE_COLUMNS = [
  { key: "year",        label: "School Year", width: "22%" },
  { key: "state",       label: "State",       width: "14%" },
  { key: "dates",       label: "Dates",       width: "30%" },
  { key: "enrollments", label: "Enrollments", width: "12%" },
  { key: "actions",     label: "",            width: "22%" },
];

// ── Row ──────────────────────────────────────────────────────────────────────
function YearRow({ year, onOpen, onEdit, onMakeCurrent, onDelete }) {
  const isCurrent = year.state === "current";
  const canMakeCurrent = !isCurrent && year.state !== "archived";
  // The server refuses both anyway; the button says why before anyone tries.
  const deleteBlocker = isCurrent
    ? "The current year can't be deleted"
    : year.enrollment_count > 0
      ? "Has enrollments, so it can't be deleted"
      : null;
  const pct = isCurrent ? progressThrough(year.start_date, year.end_date) : null;

  return (
    <TableRow onClick={() => onOpen(year)}>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${isCurrent ? "bg-success-50 text-success-500" : "bg-brand-100 text-brand-600"}`}>
            <i className="ti ti-calendar text-[15px]" aria-hidden="true" />
          </div>
          <Link
            to={`/school-years/${year.label}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[13.5px] font-bold text-neutral-900 transition-colors hover:text-brand-600 group-hover:text-brand-600"
          >
            S.Y. {year.label}
          </Link>
        </div>
      </TableCell>

      <TableCell>
        <StatusBadge status={year.state} map={SCHOOL_YEAR_STATE_MAP} size="sm" />
      </TableCell>

      <TableCell>
        <div className="text-[13px] text-neutral-700">
          {fmtDate(year.start_date)} – {fmtDate(year.end_date)}
        </div>
        {pct !== null && (
          <div className="mt-1.5 flex items-center gap-2" aria-label={`${pct}% of the year has passed`}>
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-success-dot" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11.5px] text-neutral-500">{pct}% through</span>
          </div>
        )}
      </TableCell>

      <TableCell className="text-[13px] tabular-nums text-neutral-700">
        {year.enrollment_count ?? 0}
      </TableCell>

      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          {canMakeCurrent && (
            <Button variant="secondary" size="sm" icon="ti-player-play" onClick={() => onMakeCurrent(year)}>
              Make current
            </Button>
          )}
          <Button
            variant="ghost" size="sm" icon="ti-pencil"
            aria-label={`Edit S.Y. ${year.label} dates`}
            onClick={() => onEdit(year)}
          />
          <Button
            variant="ghost" size="sm" icon="ti-trash"
            aria-label={deleteBlocker ? `${deleteBlocker}: S.Y. ${year.label}` : `Delete S.Y. ${year.label}`}
            title={deleteBlocker ?? undefined}
            disabled={Boolean(deleteBlocker)}
            onClick={() => onDelete(year)}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function SchoolYearsPage() {
  usePageTitle("School Years");
  const isFirstRender = useIsFirstRender();
  const { refreshYears } = useSchoolYear();
  const navigate = useNavigate();

  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [modal, setModal] = useState(null);          // { mode: "create" } | { mode: "edit", year }
  const [toMakeCurrent, setToMakeCurrent] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const fetchYears = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listRegisteredSchoolYears();
      setYears(Array.isArray(data) ? data : data?.results ?? []);
    } catch (e) {
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchYears(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchYears]);

  // Every picker in the app reads the same registry, so a change here has to
  // reach them now rather than on the next login.
  const afterChange = useCallback(() => {
    fetchYears();
    refreshYears();
  }, [fetchYears, refreshYears]);

  const current = useMemo(() => years.find((y) => y.state === "current") ?? null, [years]);
  const suggestion = useMemo(() => suggestNewYear(years), [years]);

  const handleMakeCurrent = async () => {
    if (!toMakeCurrent) return;
    setBusy(true); setConfirmError("");
    try {
      await makeSchoolYearCurrent(toMakeCurrent.label);
      toast.success(`S.Y. ${toMakeCurrent.label} is now the current year.`);
      setToMakeCurrent(null);
      afterChange();
    } catch (e) {
      setConfirmError(firstMessageFrom(e) || "Failed to change the current year.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setBusy(true); setConfirmError("");
    try {
      await deleteSchoolYear(toDelete.label);
      toast.success(`S.Y. ${toDelete.label} deleted.`);
      setToDelete(null);
      afterChange();
    } catch (e) {
      setConfirmError(firstMessageFrom(e) || "Failed to delete the school year.");
    } finally {
      setBusy(false);
    }
  };

  const closeConfirm = () => { setToMakeCurrent(null); setToDelete(null); setConfirmError(""); };

  return (
    <>
      <PageHeader
        title="School Years"
        icon="ti-calendar-stats"
        subtitle={
          loading ? "Loading…"
            : current ? `Current: S.Y. ${current.label} · ${years.length} ${years.length === 1 ? "year" : "years"}`
            : `${years.length} ${years.length === 1 ? "year" : "years"} · none current`
        }
        actions={
          <>
            <Button variant="secondary" icon="ti-arrows-left-right" to="/school-years/compare" disabled={years.length === 0}>
              Compare years
            </Button>
            <Button icon="ti-plus" onClick={() => setModal({ mode: "create" })}>
              New School Year
            </Button>
          </>
        }
      />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-7 py-6">
        {!loading && !loadError && !current && years.length > 0 && (
          <Alert variant="warning" title="No current school year">
            Pages are opening on a year guessed from today's date. Make one of these years current.
          </Alert>
        )}

        <motion.div
          initial={isFirstRender ? { y: 10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, delay: 0.12, ease: "easeOut" }}
        >
          <Card padding="none">
            <Table
              columns={TABLE_COLUMNS}
              loading={loading}
              error={loadError}
              onRetry={fetchYears}
              errorSubject="school years"
              isEmpty={years.length === 0}
              skeletonRows={4}
              empty={{
                icon: "ti-calendar-off",
                title: "No school years yet",
                subtitle: "Add the year the school is in now, then make it current.",
                action: (
                  <Button icon="ti-plus" onClick={() => setModal({ mode: "create" })}>
                    New School Year
                  </Button>
                ),
              }}
            >
              {years.map((y) => (
                <YearRow
                  key={y.label}
                  year={y}
                  onOpen={(year) => navigate(`/school-years/${year.label}`)}
                  onEdit={(year) => setModal({ mode: "edit", year })}
                  onMakeCurrent={setToMakeCurrent}
                  onDelete={setToDelete}
                />
              ))}
            </Table>
          </Card>
        </motion.div>
      </div>

      <AnimatePresence>
        {modal && (
          <YearModal
            key="year-modal"
            year={modal.mode === "edit" ? modal.year : null}
            suggestion={suggestion}
            onClose={() => setModal(null)}
            onSaved={afterChange}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toMakeCurrent && (
          <ConfirmDialog
            key="make-current"
            icon="ti-player-play"
            danger={false}
            title={`Make S.Y. ${toMakeCurrent.label} current?`}
            message={
              <>
                Every page will open on <strong>S.Y. {toMakeCurrent.label}</strong>.
                {current && (
                  <> S.Y. {current.label} stays open for final grades and late payments; it isn't archived.</>
                )}
              </>
            }
            error={confirmError}
            confirmLabel="Make current"
            loading={busy}
            onConfirm={handleMakeCurrent}
            onCancel={closeConfirm}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toDelete && (
          <ConfirmDialog
            key="delete-year"
            icon="ti-trash"
            title={`Delete S.Y. ${toDelete.label}?`}
            message="This removes the year from every picker. It's only possible while nothing is filed under it."
            error={confirmError}
            loading={busy}
            onConfirm={handleDelete}
            onCancel={closeConfirm}
          />
        )}
      </AnimatePresence>
    </>
  );
}
