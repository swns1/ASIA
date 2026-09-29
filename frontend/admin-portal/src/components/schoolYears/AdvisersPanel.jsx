import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Alert from "../ui/Alert";
import { ConfirmDialog } from "../ui/Modal";
import { GRADE_LEVELS_BY_LEVEL, LEVEL_LABELS } from "../../constants/schoolLevels";
import { getSectionAdvisories, deleteSectionAdvisory } from "../../api/enrollmentApi";
import { getUsers } from "../../api/identityApi";
import { firstMessageFrom } from "../../utils/apiError";
import AssignAdviserModal from "./AssignAdviserModal";
import CarryOverModal from "./CarryOverModal";

// Who advises each of a year's sections. A teacher sees the grades,
// attendance and reports of exactly the sections they advise, so a section
// without one is a gap worth seeing: every section is listed, with its
// adviser or a prompt to assign one.
//
// Only grades that have sections show -- advisers go into sections, so an
// empty grade is the Sections tab's business.

// Complete literal class strings: Tailwind can't see interpolated names.
const LEVEL_CHIP = {
  nursery:           "bg-nursery-50 text-nursery-500",
  kindergarten:      "bg-kindergarten-50 text-kindergarten-500",
  elementary:        "bg-elementary-50 text-elementary-500",
  junior_highschool: "bg-juniorhigh-50 text-juniorhigh-500",
  senior_highschool: "bg-seniorhigh-50 text-seniorhigh-500",
};

const placeKey = (grade, section) => `${grade}|${section}`;

function AdviserChip({ name, inactive = false, readOnly, onRemove }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1 text-[12.5px] font-semibold ${
        inactive
          ? "border-dashed border-neutral-400 bg-muted-50 text-muted-500"
          : "border-neutral-200 bg-white text-neutral-800"
      }`}
    >
      <i
        className={`ti ${inactive ? "ti-user-off" : "ti-user-check text-success-500"} text-[13px]`}
        aria-hidden="true"
      />
      {name}
      {inactive && (
        <span className="rounded-full bg-white px-1.5 text-[11px] font-bold">Inactive</span>
      )}
      {!readOnly && (
        <button
          type="button"
          onClick={onRemove}
          className="focus-ring inline-flex h-5 w-5 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-brand-100 hover:text-brand-600"
          aria-label={`Remove ${name} as adviser`}
        >
          <i className="ti ti-x text-[12px]" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

export default function AdvisersPanel({ schoolYear, years, sections, sectionsLoading, readOnly = false, onChanged, onOpenSections }) {
  const [advisories, setAdvisories] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [teachersUnavailable, setTeachersUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(null);   // a section
  const [removing, setRemoving] = useState(null);     // { advisory, name, section }
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [copying, setCopying] = useState(false);

  const fetchAdvisories = useCallback(async () => {
    try {
      const data = await getSectionAdvisories({ school_year: schoolYear, page_size: 500 });
      setAdvisories(Array.isArray(data) ? data : data?.results ?? []);
    } catch (e) {
      toast.error(firstMessageFrom(e) || "Failed to load the advisers.");
    }
  }, [schoolYear]);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetchAdvisories(), // eslint-disable-line react-hooks/set-state-in-effect
      // Admin-only on identity-service: caught on its own so a 403 still
      // shows who advises what, just without names to pick from.
      getUsers().catch(() => null),
    ]).then(([, users]) => {
      if (!live) return;
      if (users == null) {
        setTeachersUnavailable(true);
      } else {
        setTeachers((Array.isArray(users) ? users : users?.results ?? []).filter((u) => u.role === "teacher"));
      }
    }).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [fetchAdvisories]);

  const teacherName = useCallback(
    (id) => teachers.find((t) => t.user_id === id)?.name ?? `User #${id}`,
    [teachers],
  );
  // Deactivated teachers keep their name on past advisories (teacherName
  // above) but can't be assigned -- identity-service refuses it anyway.
  const activeTeachers = useMemo(() => teachers.filter((t) => t.is_active), [teachers]);
  // An account missing from the list (names unavailable, or no longer a
  // teacher) isn't flagged: there's nothing to go on.
  const isInactive = useCallback(
    (id) => teachers.find((t) => t.user_id === id)?.is_active === false,
    [teachers],
  );

  const advisersBySection = useMemo(() => {
    const map = new Map();
    advisories.forEach((a) => {
      const key = placeKey(a.grade_level, a.section);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    });
    return map;
  }, [advisories]);

  // The grade ladder, keeping only grades with sections.
  const ladder = useMemo(() => {
    const byGrade = new Map();
    sections.forEach((s) => {
      if (!byGrade.has(s.grade_level)) byGrade.set(s.grade_level, []);
      byGrade.get(s.grade_level).push(s);
    });
    byGrade.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return Object.entries(GRADE_LEVELS_BY_LEVEL)
      .map(([level, grades]) => [level, grades.filter((g) => byGrade.has(g)).map((g) => [g, byGrade.get(g)])])
      .filter(([, grades]) => grades.length > 0);
  }, [sections]);

  // In a year still being run, a section whose advisers have all left needs a
  // new one, so they don't count. An archived year is history: they did.
  const hasActiveAdviser = (advisers) =>
    advisers.some((a) => readOnly || !isInactive(a.teacher_user_id));
  const withAdviser = sections.filter((s) =>
    hasActiveAdviser(advisersBySection.get(placeKey(s.grade_level, s.name)) ?? []),
  ).length;
  const adviserWord = readOnly ? "an adviser" : "an active adviser";
  const hasOtherYears = years.some((y) => y.label !== schoolYear);
  const busy = loading || sectionsLoading;

  const afterChange = () => {
    fetchAdvisories();
    onChanged();
  };

  const handleRemove = async () => {
    setRemoveBusy(true); setRemoveError("");
    try {
      await deleteSectionAdvisory(removing.advisory.advisory_id);
      toast.success(`${removing.name} no longer advises ${removing.section}.`);
      setRemoving(null);
      afterChange();
    } catch (e) {
      setRemoveError(firstMessageFrom(e) || "Failed to remove the adviser.");
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-bold text-neutral-900">
              {busy ? "Loading advisers…" : sections.length
                ? `${withAdviser} of ${sections.length} ${sections.length === 1 ? "section has" : "sections have"} ${adviserWord}`
                : "No sections yet"}
            </div>
            <div className="mt-0.5 text-[12.5px] text-neutral-500">
              A teacher sees the grades, attendance and reports of the sections they advise.
            </div>
          </div>
          {!readOnly && hasOtherYears && (
            <Button variant="secondary" icon="ti-copy" onClick={() => setCopying(true)}>
              Copy from an earlier year
            </Button>
          )}
        </div>
      </Card>

      {teachersUnavailable && (
        <Alert variant="warning">Teacher names are unavailable — listing users requires admin access.</Alert>
      )}

      {!busy && sections.length === 0 ? (
        <Card padding="md">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <i className="ti ti-layout-grid text-[28px] text-neutral-300" aria-hidden="true" />
            <div>
              <div className="text-[14px] font-semibold text-neutral-800">Set up this year's sections first</div>
              <div className="text-[12.5px] text-neutral-500">Advisers are assigned to sections.</div>
            </div>
            <Button variant="secondary" size="sm" icon="ti-layout-grid" onClick={onOpenSections}>Go to Sections</Button>
          </div>
        </Card>
      ) : (
        ladder.map(([level, grades]) => (
          <Card key={level} padding="none">
            <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-3">
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${LEVEL_CHIP[level]}`}>{LEVEL_LABELS[level]}</span>
            </div>
            <ul className="divide-y divide-neutral-100">
              {grades.flatMap(([grade, list]) => list.map((s) => {
                const advisers = advisersBySection.get(placeKey(grade, s.name)) ?? [];
                const where = `${grade} ${s.name}`;
                const covered = hasActiveAdviser(advisers);
                const needsReplacement = advisers.length > 0 && !covered;
                return (
                  <li
                    key={s.section_id}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 ${needsReplacement ? "bg-warning-50/40" : ""}`}
                  >
                    <div className="flex w-44 shrink-0 items-center gap-2">
                      <span className="text-[13px] font-bold text-neutral-800">{grade}</span>
                      <Badge variant="info" size="sm">{s.strand ? `${s.name} · ${s.strand}` : s.name}</Badge>
                    </div>
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      {advisers.map((a) => (
                        <AdviserChip
                          key={a.advisory_id}
                          name={teacherName(a.teacher_user_id)}
                          inactive={isInactive(a.teacher_user_id)}
                          readOnly={readOnly}
                          onRemove={() => setRemoving({ advisory: a, name: teacherName(a.teacher_user_id), section: where })}
                        />
                      ))}
                      {advisers.length === 0 && !busy && (
                        <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-warning-500">
                          <i className="ti ti-alert-circle text-[14px]" aria-hidden="true" />No adviser
                        </span>
                      )}
                      {needsReplacement && (
                        <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-warning-500">
                          <i className="ti ti-alert-circle text-[14px]" aria-hidden="true" />
                          {advisers.length === 1 ? "Adviser's account is inactive" : "Advisers' accounts are inactive"} — assign a replacement
                        </span>
                      )}
                    </div>
                    {!readOnly && (
                      <Button
                        variant={covered ? "ghost" : "secondary"}
                        size="sm"
                        icon="ti-plus"
                        aria-label={`Assign an adviser to ${where}`}
                        disabled={busy}
                        onClick={() => setAssigning(s)}
                      >
                        {covered ? "Add" : "Assign"}
                      </Button>
                    )}
                  </li>
                );
              }))}
            </ul>
          </Card>
        ))
      )}

      <AnimatePresence>
        {assigning && (
          <AssignAdviserModal
            key="assign-adviser"
            schoolYear={schoolYear}
            section={assigning}
            teachers={activeTeachers}
            teachersUnavailable={teachersUnavailable}
            advisories={advisories}
            onClose={() => setAssigning(null)}
            onSaved={afterChange}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {removing && (
          <ConfirmDialog
            key="remove-adviser"
            icon="ti-user-minus"
            title={`Remove ${removing.name}?`}
            message={<>They'll stop advising <strong>{removing.section}</strong> and lose access to its grades, attendance and narrative reports.</>}
            error={removeError}
            confirmLabel="Remove adviser"
            loading={removeBusy}
            onConfirm={handleRemove}
            onCancel={() => { setRemoving(null); setRemoveError(""); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {copying && (
          <CarryOverModal
            key="carry-over"
            schoolYear={schoolYear}
            years={years}
            initialParts={sections.length ? ["advisers"] : ["sections", "advisers"]}
            onClose={() => setCopying(false)}
            onDone={afterChange}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
