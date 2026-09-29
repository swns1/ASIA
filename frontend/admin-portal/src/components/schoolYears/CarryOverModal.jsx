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

// Start a year from an earlier one: copy its sections across so that what
// didn't change needs no retyping.
//
// The preview is the server's own dry run, so what it lists is exactly what
// Copy will do. Nothing this year already has is touched -- a section with
// the same name in the same grade is skipped -- so it's safe after adding a
// few sections by hand, or run twice.

function groupByGrade(rows) {
  const groups = new Map();
  rows.forEach((r) => {
    if (!groups.has(r.grade_level)) groups.set(r.grade_level, []);
    groups.get(r.grade_level).push(r);
  });
  return [...groups.entries()];
}

export default function CarryOverModal({ schoolYear, years, onClose, onDone }) {
  // Any other registered year can be the source; the nearest earlier one is
  // the usual pick.
  const sources = useMemo(
    () => years.map((y) => y.label).filter((l) => l !== schoolYear).sort().reverse(),
    [years, schoolYear],
  );
  const [from, setFrom] = useState(() => sources.find((l) => l < schoolYear) ?? sources[0] ?? "");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!from) return undefined;
    let live = true;
    setLoading(true); setError(""); // eslint-disable-line react-hooks/set-state-in-effect
    carryOverSchoolYear(schoolYear, { from, parts: ["sections"], dry_run: true })
      .then((data) => live && setPreview(data))
      .catch((e) => live && setError(firstMessageFrom(e) || "Couldn't preview the copy."))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [from, schoolYear]);

  const toCopy = preview?.sections?.copied ?? [];
  const skipped = preview?.sections?.skipped ?? [];

  const handleApply = async () => {
    setApplying(true); setError("");
    try {
      const data = await carryOverSchoolYear(schoolYear, { from, parts: ["sections"] });
      const n = data.sections?.copied?.length ?? 0;
      toast.success(`Copied ${n} ${n === 1 ? "section" : "sections"} from S.Y. ${from}.`);
      onDone();
      onClose();
    } catch (e) {
      setError(firstMessageFrom(e) || "Couldn't copy the sections.");
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
      description={`Start S.Y. ${schoolYear} from another year's sections`}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={applying}>Cancel</Button>
          <Button icon="ti-copy" loading={applying} disabled={loading || !toCopy.length} onClick={handleApply}>
            {toCopy.length ? `Copy ${toCopy.length} ${toCopy.length === 1 ? "section" : "sections"}` : "Nothing to copy"}
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

          {loading ? (
            <p className="text-[13px] text-neutral-500">Checking S.Y. {from}…</p>
          ) : preview && (
            <div className="flex flex-col gap-3">
              {toCopy.length === 0 ? (
                <p className="text-[13px] text-neutral-600">
                  {skipped.length
                    ? `S.Y. ${schoolYear} already has all ${skipped.length} of S.Y. ${from}'s sections.`
                    : `S.Y. ${from} has no sections to copy.`}
                </p>
              ) : (
                <>
                  <p className="text-[13px] font-semibold text-neutral-800">
                    Will add {toCopy.length} {toCopy.length === 1 ? "section" : "sections"}:
                  </p>
                  <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
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
                </>
              )}
              {toCopy.length > 0 && skipped.length > 0 && (
                <p className="text-[12.5px] text-neutral-500">
                  {skipped.length} already here {skipped.length === 1 ? "is" : "are"} left as {skipped.length === 1 ? "it is" : "they are"}.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
