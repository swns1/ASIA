import { useEffect, useId, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import Badge from "../ui/Badge";
import { Field, Select } from "../FormField";
import { carryOverSchoolYear } from "../../api/enrollmentApi";
import { carryOverFees } from "../../api/billingApi";
import { firstMessageFrom } from "../../utils/apiError";
import { fmtDate } from "../../utils/format";
import { GRADE_ORDER } from "../../utils/grading";

// Start a year from an earlier one: copy its sections, the advisers of those
// sections, its calendar, its subjects and its fees across so that what
// didn't change needs no retyping.
//
// The preview is the servers' own dry run, so what it lists is exactly what
// Copy will do. Nothing this year already has is touched -- a section with
// the same name in the same grade is skipped, so is an adviser whose section
// already has one, a subject whose code is already used here, and a grade
// that already has fees -- so it's safe
// after setting a few things up by hand, or run twice.
//
// Sections, advisers, the calendar and subjects are enrollment-service's to copy, fees
// billing's; the modal asks each for its own parts and shows them as one.

// In the order they're applied: advisers land in sections.
const PARTS = [
  { id: "sections", label: "Sections", hint: "Each grade's section names and strands" },
  { id: "advisers", label: "Advisers", hint: "Each section's adviser, into the section of the same name here" },
  { id: "calendar", label: "Calendar", hint: "Holidays, quarters and events, on the same day and month" },
  { id: "subjects", label: "Subjects", hint: "Each grade's subjects and grading templates, ready to adjust" },
  { id: "fees",     label: "Fees",     hint: "Each grade's fee schedule and its items, ready to adjust" },
];
const ALL_PARTS = PARTS.map((p) => p.id);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const peso = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Why an adviser wasn't carried over, worded for the preview.
const ADVISER_SKIPS = {
  no_section:    (to) => `no section of the same name in S.Y. ${to}`,
  has_adviser:   () => "their section here already has an adviser",
  already:       () => "already assigned to the same section here",
  not_a_teacher: () => "no longer a teacher account",
  inactive:      () => "their account is inactive",
};

// The servers sort grade_level as text (Grade 1, Grade 10, Grade 11, Grade 2);
// list grades in school order instead. Stable, so each grade keeps the
// servers' order within it.
const gradeRank = (g) => (GRADE_ORDER.includes(g) ? GRADE_ORDER.indexOf(g) : GRADE_ORDER.length);
const byGrade = (rows) => [...rows].sort((a, b) => gradeRank(a.grade_level) - gradeRank(b.grade_level));

function groupByGrade(rows) {
  const groups = new Map();
  byGrade(rows).forEach((r) => {
    if (!groups.has(r.grade_level)) groups.set(r.grade_level, []);
    groups.get(r.grade_level).push(r);
  });
  return [...groups.entries()];
}

function SectionsPreview({ result, from, to }) {
  const toCopy = result?.copied ?? [];
  const skipped = result?.skipped ?? [];
  if (toCopy.length === 0) {
    return (
      <p className="text-[13px] text-neutral-600">
        {skipped.length
          ? `S.Y. ${to} already has all ${skipped.length} of S.Y. ${from}'s sections.`
          : `S.Y. ${from} has no sections to copy.`}
      </p>
    );
  }
  return (
    <>
      <p className="text-[13px] font-semibold text-neutral-800">
        Will add {plural(toCopy.length, "section", "sections")}:
      </p>
      <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
        {groupByGrade(toCopy).map(([grade, rows]) => (
          <li key={grade} className="flex flex-wrap items-center gap-1.5">
            <span className="w-24 shrink-0 text-[12.5px] font-semibold text-neutral-700">{grade}</span>
            {rows.map((r) => (
              <Badge key={r.name} variant="info" size="sm">
                {r.strand ? `${r.name} · ${r.strand}` : r.name}
              </Badge>
            ))}
          </li>
        ))}
      </ul>
      {skipped.length > 0 && (
        <p className="text-[12.5px] text-neutral-500">
          {skipped.length} already here {skipped.length === 1 ? "is" : "are"} left as {skipped.length === 1 ? "it is" : "they are"}.
        </p>
      )}
    </>
  );
}

function AdvisersPreview({ result, from, to, withSections }) {
  const toCopy = result?.copied ?? [];
  const skipped = result?.skipped ?? [];
  const byReason = useMemo(() => {
    const map = new Map();
    byGrade(result?.skipped ?? []).forEach((r) => {
      if (!map.has(r.reason)) map.set(r.reason, []);
      map.get(r.reason).push(r);
    });
    return [...map.entries()];
  }, [result]);
  const onlyMissingSections = !withSections && skipped.length > 0
    && skipped.every((r) => r.reason === "no_section") && toCopy.length === 0;

  return (
    <>
      {toCopy.length === 0 ? (
        <p className="text-[13px] text-neutral-600">
          {skipped.length ? "No advisers to assign." : `S.Y. ${from} has no advisers to copy.`}
        </p>
      ) : (
        <>
          <p className="text-[13px] font-semibold text-neutral-800">
            Will assign {plural(toCopy.length, "adviser", "advisers")}:
          </p>
          <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
            {byGrade(toCopy).map((r) => (
              <li key={`${r.teacher_user_id}-${r.grade_level}-${r.section}`} className="flex items-center gap-2 text-[12.5px]">
                <span className="w-24 shrink-0 font-semibold text-neutral-700">{r.grade_level}</span>
                <Badge variant="info" size="sm">{r.strand ? `${r.section} · ${r.strand}` : r.section}</Badge>
                <span className="truncate text-neutral-700">{r.teacher_name ?? `User #${r.teacher_user_id}`}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {byReason.length > 0 && (
        <ul className="flex flex-col gap-1 text-[12.5px] text-neutral-500">
          {byReason.map(([reason, rows]) => (
            <li key={reason}>
              {plural(rows.length, "adviser", "advisers")} skipped —{" "}
              {(ADVISER_SKIPS[reason] ?? (() => "not copied"))(to)}
              {reason === "no_section" && ` (${rows.map((r) => `${r.grade_level} ${r.section}`).join(", ")})`}.
            </li>
          ))}
        </ul>
      )}
      {onlyMissingSections && (
        <Alert variant="info">Tick <strong>Sections</strong> too, to bring the sections across first.</Alert>
      )}
    </>
  );
}

function FeesPreview({ result, from, to }) {
  const toCopy = result?.copied ?? [];
  const skipped = result?.skipped ?? [];
  if (toCopy.length === 0) {
    return (
      <p className="text-[13px] text-neutral-600">
        {skipped.length
          ? `S.Y. ${to} already has fees for all ${skipped.length} of S.Y. ${from}'s grades.`
          : `S.Y. ${from} has no fees to copy.`}
      </p>
    );
  }
  return (
    <>
      <p className="text-[13px] font-semibold text-neutral-800">
        Will add fees for {plural(toCopy.length, "grade", "grades")}:
      </p>
      <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
        {byGrade(toCopy).map((r) => (
          <li key={`${r.school_level}-${r.grade_level}`} className="flex items-center gap-2 text-[12.5px]">
            <span className="w-24 shrink-0 font-semibold text-neutral-700">{r.grade_level}</span>
            <span className="font-semibold text-neutral-800">{peso(r.total)}</span>
            <span className="text-neutral-500">· {plural(r.items, "item", "items")}</span>
          </li>
        ))}
      </ul>
      {skipped.length > 0 && (
        <p className="text-[12.5px] text-neutral-500">
          {plural(skipped.length, "grade", "grades")} already {skipped.length === 1 ? "has" : "have"} fees here, left as {skipped.length === 1 ? "it is" : "they are"}.
        </p>
      )}
    </>
  );
}

function SubjectsPreview({ result, from, to }) {
  const toCopy = result?.copied ?? [];
  const skipped = result?.skipped ?? [];
  if (toCopy.length === 0) {
    return (
      <p className="text-[13px] text-neutral-600">
        {skipped.length
          ? `S.Y. ${to} already has all ${skipped.length} of S.Y. ${from}'s subjects.`
          : `S.Y. ${from} has no subjects to copy.`}
      </p>
    );
  }
  return (
    <>
      <p className="text-[13px] font-semibold text-neutral-800">
        Will add {plural(toCopy.length, "subject", "subjects")}:
      </p>
      <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
        {groupByGrade(toCopy).map(([grade, rows]) => (
          <li key={grade} className="flex items-baseline gap-2 text-[12.5px]">
            <span className="w-24 shrink-0 font-semibold text-neutral-700">{grade}</span>
            <span className="min-w-0 text-neutral-800">
              {rows.map((r) => r.subject_name).join(", ")}
            </span>
          </li>
        ))}
      </ul>
      {skipped.length > 0 && (
        <p className="text-[12.5px] text-neutral-500">
          {plural(skipped.length, "subject", "subjects")} with a code already used here {skipped.length === 1 ? "is" : "are"} left as {skipped.length === 1 ? "it is" : "they are"}.
        </p>
      )}
    </>
  );
}

function CalendarPreview({ result, from, to }) {
  const toCopy = result?.copied ?? [];
  const skipped = result?.skipped ?? [];
  const shift = result?.shift_years ?? 0;
  if (toCopy.length === 0) {
    return (
      <p className="text-[13px] text-neutral-600">
        {skipped.length
          ? `S.Y. ${to}'s calendar already has all ${skipped.length} of S.Y. ${from}'s events.`
          : `S.Y. ${from} has nothing on its calendar to copy.`}
      </p>
    );
  }
  const moved = `${Math.abs(shift)} ${Math.abs(shift) === 1 ? "year" : "years"} ${shift < 0 ? "back" : "on"}`;
  return (
    <>
      <p className="text-[13px] font-semibold text-neutral-800">
        Will add {plural(toCopy.length, "calendar event", "calendar events")}, {moved}:
      </p>
      <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
        {toCopy.map((r) => (
          <li key={`${r.event_type}-${r.title}-${r.start_date}`} className="flex items-center gap-2 text-[12.5px]">
            <span className="w-28 shrink-0 font-semibold text-neutral-700">{fmtDate(r.start_date)}</span>
            <span className="truncate text-neutral-800">{r.title}</span>
          </li>
        ))}
      </ul>
      {skipped.length > 0 && (
        <p className="text-[12.5px] text-neutral-500">
          {skipped.length} already on this year's calendar {skipped.length === 1 ? "is" : "are"} left as {skipped.length === 1 ? "it is" : "they are"}.
        </p>
      )}
      <Alert variant="info">
        Same day and month, {moved}. Check holidays that move each year (Holy Week, Eid) and the
        quarter dates on the calendar afterwards.
      </Alert>
    </>
  );
}

// Each server's share of the parts, run one after the other: sections,
// advisers, the calendar and subjects first (enrollment-service), then fees
// (billing).
async function carryOver(schoolYear, from, parts, dryRun) {
  const schoolParts = parts.filter((p) => p !== "fees");
  const result = {};
  if (schoolParts.length) {
    Object.assign(result, await carryOverSchoolYear(schoolYear, {
      from, parts: schoolParts, ...(dryRun && { dry_run: true }),
    }));
  }
  if (parts.includes("fees")) {
    const data = await carryOverFees({ from, to: schoolYear, ...(dryRun && { dry_run: true }) });
    result.fees = data.fees;
  }
  return result;
}

function describe(result) {
  return [
    result.sections && plural(result.sections.copied?.length ?? 0, "section", "sections"),
    result.advisers && plural(result.advisers.copied?.length ?? 0, "adviser", "advisers"),
    result.calendar && plural(result.calendar.copied?.length ?? 0, "calendar event", "calendar events"),
    result.subjects && plural(result.subjects.copied?.length ?? 0, "subject", "subjects"),
    result.fees && `fees for ${plural(result.fees.copied?.length ?? 0, "grade", "grades")}`,
  ].filter(Boolean).join(" and ");
}

export default function CarryOverModal({
  schoolYear,
  years,
  initialParts = ["sections"],
  // Which parts this place offers: Billing Settings copies fees only, the
  // Subjects page subjects only.
  availableParts = ALL_PARTS,
  onClose,
  onDone,
}) {
  // Any other registered year can be the source; the nearest earlier one is
  // the usual pick.
  const sources = useMemo(
    () => years.map((y) => y.label).filter((l) => l !== schoolYear).sort().reverse(),
    [years, schoolYear],
  );
  const offered = PARTS.filter((p) => availableParts.includes(p.id));
  const [from, setFrom] = useState(() => sources.find((l) => l < schoolYear) ?? sources[0] ?? "");
  const [picked, setPicked] = useState(() => new Set(initialParts.filter((p) => availableParts.includes(p))));
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const summaryId = useId();

  // Always in the order they're applied, however the boxes were ticked.
  const parts = ALL_PARTS.filter((id) => picked.has(id));
  const partsKey = parts.join(",");

  useEffect(() => {
    if (!from || !partsKey) return undefined;
    let live = true;
    setLoading(true); setError(""); // eslint-disable-line react-hooks/set-state-in-effect
    carryOver(schoolYear, from, partsKey.split(","), true)
      .then((data) => live && setPreview(data))
      .catch((e) => live && setError(firstMessageFrom(e) || "Couldn't preview the copy."))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [from, schoolYear, partsKey]);

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const count = (id) => (picked.has(id) ? preview?.[id]?.copied?.length ?? 0 : 0);
  const summary = [
    count("sections") && plural(count("sections"), "section", "sections"),
    count("advisers") && plural(count("advisers"), "adviser", "advisers"),
    count("calendar") && plural(count("calendar"), "calendar event", "calendar events"),
    count("subjects") && plural(count("subjects"), "subject", "subjects"),
    count("fees") && `fees for ${plural(count("fees"), "grade", "grades")}`,
  ].filter(Boolean).join(" · ");

  const handleApply = async () => {
    setApplying(true); setError("");
    const schoolParts = parts.filter((p) => p !== "fees");
    let copiedFirst = null;
    try {
      if (schoolParts.length && parts.includes("fees")) {
        // Two servers, so two steps: say which one landed if the second fails.
        copiedFirst = await carryOverSchoolYear(schoolYear, { from, parts: schoolParts });
        const fees = await carryOverFees({ from, to: schoolYear });
        toast.success(`Copied ${describe({ ...copiedFirst, fees: fees.fees })} from S.Y. ${from}.`);
      } else {
        toast.success(`Copied ${describe(await carryOver(schoolYear, from, parts, false))} from S.Y. ${from}.`);
      }
      onDone();
      onClose();
    } catch (e) {
      const reason = firstMessageFrom(e) || "Couldn't copy from that year.";
      if (copiedFirst) {
        onDone();
        setError(`Copied ${describe(copiedFirst)}, but not the fees: ${reason}`);
      } else {
        setError(reason);
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      size="md"
      showClose
      loading={applying}
      icon="ti-copy"
      title="Copy from an earlier year"
      description={`Start S.Y. ${schoolYear} from another year's setup`}
      footer={
        // The counts sit beside the buttons, not in one: four parts' worth
        // made the button wider than the modal and pushed Cancel out of view.
        <div className="flex items-center justify-between gap-4">
          <p id={summaryId} className="min-w-0 text-[12.5px] text-neutral-600">
            {summary || "Nothing to copy"}
          </p>
          <div className="flex shrink-0 gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={applying}>Cancel</Button>
            <Button
              icon="ti-copy"
              loading={applying}
              disabled={loading || !summary}
              onClick={handleApply}
              aria-describedby={summaryId}
            >
              Copy
            </Button>
          </div>
        </div>
      }
    >
      <AnimatePresence>
        {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      </AnimatePresence>

      {sources.length === 0 ? (
        <Alert variant="info">There's no other school year to copy from yet.</Alert>
      ) : (
        <>
          <Field label="Copy from">
            <Select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Copy from">
              {sources.map((l) => <option key={l} value={l}>S.Y. {l}</option>)}
            </Select>
          </Field>

          {offered.length > 1 && (
            <fieldset className="mb-4">
              <legend className="mb-1.5 text-xs font-bold uppercase tracking-[0.07em] text-neutral-700">What to copy</legend>
              <div className="flex flex-col gap-1.5">
                {offered.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-neutral-200 px-3 py-2.5 hover:border-brand-300">
                    <input
                      type="checkbox"
                      className="focus-ring mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-500"
                      checked={picked.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    <span>
                      <span className="block text-[13px] font-semibold text-neutral-900">{p.label}</span>
                      <span className="block text-[12px] text-neutral-500">{p.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {parts.length === 0 ? (
            <p className="text-[13px] text-neutral-500">Tick at least one thing to copy.</p>
          ) : loading ? (
            <p className="text-[13px] text-neutral-500">Checking S.Y. {from}…</p>
          ) : preview && (
            <div className="flex flex-col gap-4">
              {picked.has("sections") && preview.sections && (
                <div className="flex flex-col gap-2">
                  <SectionsPreview result={preview.sections} from={from} to={schoolYear} />
                </div>
              )}
              {picked.has("advisers") && preview.advisers && (
                <div className="flex flex-col gap-2">
                  <AdvisersPreview
                    result={preview.advisers}
                    from={from}
                    to={schoolYear}
                    withSections={picked.has("sections")}
                  />
                </div>
              )}
              {picked.has("calendar") && preview.calendar && (
                <div className="flex flex-col gap-2">
                  <CalendarPreview result={preview.calendar} from={from} to={schoolYear} />
                </div>
              )}
              {picked.has("subjects") && preview.subjects && (
                <div className="flex flex-col gap-2">
                  <SubjectsPreview result={preview.subjects} from={from} to={schoolYear} />
                </div>
              )}
              {picked.has("fees") && preview.fees && (
                <div className="flex flex-col gap-2">
                  <FeesPreview result={preview.fees} from={from} to={schoolYear} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
