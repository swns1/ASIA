import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import Badge from "../ui/Badge";
import { Field, Select } from "../FormField";
import { carryOverSchoolYear } from "../../api/enrollmentApi";
import { firstMessageFrom } from "../../utils/apiError";

// Start a year from an earlier one: copy its sections, and the advisers of
// those sections, across so that what didn't change needs no retyping.
//
// The preview is the server's own dry run, so what it lists is exactly what
// Copy will do. Nothing this year already has is touched -- a section with
// the same name in the same grade is skipped, and so is an adviser whose
// section already has one -- so it's safe after setting a few things up by
// hand, or run twice.

// In the order the server applies them: advisers land in sections.
const PARTS = [
  { id: "sections", label: "Sections", hint: "Each grade's section names and strands" },
  { id: "advisers", label: "Advisers", hint: "Each section's adviser, into the section of the same name here" },
];

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Why an adviser wasn't carried over, worded for the preview.
const ADVISER_SKIPS = {
  no_section:    (to) => `no section of the same name in S.Y. ${to}`,
  has_adviser:   () => "their section here already has an adviser",
  already:       () => "already assigned to the same section here",
  not_a_teacher: () => "no longer a teacher account",
};

function groupByGrade(rows) {
  const groups = new Map();
  rows.forEach((r) => {
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
    (result?.skipped ?? []).forEach((r) => {
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
            {toCopy.map((r) => (
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

export default function CarryOverModal({ schoolYear, years, initialParts = ["sections"], onClose, onDone }) {
  // Any other registered year can be the source; the nearest earlier one is
  // the usual pick.
  const sources = useMemo(
    () => years.map((y) => y.label).filter((l) => l !== schoolYear).sort().reverse(),
    [years, schoolYear],
  );
  const [from, setFrom] = useState(() => sources.find((l) => l < schoolYear) ?? sources[0] ?? "");
  const [picked, setPicked] = useState(() => new Set(initialParts));
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  // Always in the server's order, so the request reads the same however the
  // boxes were ticked.
  const parts = PARTS.map((p) => p.id).filter((id) => picked.has(id));
  const partsKey = parts.join(",");

  useEffect(() => {
    if (!from || !partsKey) return undefined;
    let live = true;
    setLoading(true); setError(""); // eslint-disable-line react-hooks/set-state-in-effect
    carryOverSchoolYear(schoolYear, { from, parts: partsKey.split(","), dry_run: true })
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

  const counts = {
    sections: picked.has("sections") ? preview?.sections?.copied?.length ?? 0 : 0,
    advisers: picked.has("advisers") ? preview?.advisers?.copied?.length ?? 0 : 0,
  };
  const summary = [
    counts.sections && plural(counts.sections, "section", "sections"),
    counts.advisers && plural(counts.advisers, "adviser", "advisers"),
  ].filter(Boolean).join(" and ");

  const handleApply = async () => {
    setApplying(true); setError("");
    try {
      const data = await carryOverSchoolYear(schoolYear, { from, parts });
      const done = [
        data.sections && plural(data.sections.copied?.length ?? 0, "section", "sections"),
        data.advisers && plural(data.advisers.copied?.length ?? 0, "adviser", "advisers"),
      ].filter(Boolean).join(" and ");
      toast.success(`Copied ${done} from S.Y. ${from}.`);
      onDone();
      onClose();
    } catch (e) {
      setError(firstMessageFrom(e) || "Couldn't copy from that year.");
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
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={applying}>Cancel</Button>
          <Button icon="ti-copy" loading={applying} disabled={loading || !summary} onClick={handleApply}>
            {summary ? `Copy ${summary}` : "Nothing to copy"}
          </Button>
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

          <fieldset className="mb-4">
            <legend className="mb-1.5 text-xs font-bold uppercase tracking-[0.07em] text-neutral-700">What to copy</legend>
            <div className="flex flex-col gap-1.5">
              {PARTS.map((p) => (
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
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
