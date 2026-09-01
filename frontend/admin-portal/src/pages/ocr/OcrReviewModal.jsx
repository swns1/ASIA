import { useMemo, useState } from "react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import { CONFIDENCE_TONE, buildReviewRows, rowNote } from "./ocrFields";

// The review gate.
//
// The card this replaced said "OCR found 7 fields (medium confidence) — review
// before applying" and then offered one Apply button. It asked people to review
// data it never showed them, and applying it overwrote form state wholesale.
//
// Here every claim is visible next to what the form already holds, each row is
// ticked individually, and the two dangerous cases — overwriting a saved value,
// and disagreeing with another document — arrive UNTICKED so they cost a
// deliberate decision rather than a reflex.

function VerdictPill({ row }) {
  if (row.isConflict) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-error-50 px-2 py-0.5 text-xs font-bold text-error-500">
        <i className="ti ti-alert-triangle text-[12px]" aria-hidden="true" />
        Conflict
      </span>
    );
  }
  if (row.unchanged) {
    return <span className="text-xs text-neutral-500">No change</span>;
  }
  if (row.overwrites) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-xs font-bold text-warning-500">
        <i className="ti ti-pencil text-[12px]" aria-hidden="true" />
        Replaces
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-xs font-bold text-success-500">
      <i className="ti ti-plus text-[12px]" aria-hidden="true" />
      Fills blank
    </span>
  );
}

export default function OcrReviewModal({
  documentName,
  result,
  student,
  guardians,
  onApply,
  onClose,
}) {
  const initialRows = useMemo(
    () =>
      buildReviewRows({
        extracted: result?.extracted,
        fieldConfidence: result?.field_confidence,
        ledger: result?.ledger,
        student,
        guardians,
      }),
    [result, student, guardians]
  );

  const [checked, setChecked] = useState(() =>
    Object.fromEntries(initialRows.map((r) => [r.key, r.checked]))
  );

  const acceptedKeys = initialRows.filter((r) => checked[r.key]).map((r) => r.key);
  const conflicts = initialRows.filter((r) => r.isConflict).length;
  const warnings = result?.warnings ?? [];

  function toggle(key) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setAll(value) {
    setChecked(Object.fromEntries(initialRows.map((r) => [r.key, value])));
  }

  return (
    <Modal
      size="lg"
      title={`Review what we read from ${documentName}`}
      description="Nothing is added to the form until you tick it."
      icon="ti-file-search"
      showClose
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs text-neutral-500">
            {acceptedKeys.length} of {initialRows.length} selected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Discard
            </Button>
            <Button
              size="sm"
              icon="ti-check"
              disabled={!acceptedKeys.length}
              onClick={() => onApply(result.extracted, acceptedKeys)}
            >
              Add {acceptedKeys.length || ""} to form
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {warnings.map((w) => (
          <Alert key={w} variant="warning" title="Check this document">
            {w}
          </Alert>
        ))}

        {conflicts > 0 && (
          <Alert variant="error" title={`${conflicts} field${conflicts === 1 ? "" : "s"} disagree with another document`}>
            When two documents give different answers, one of them is wrong — or they
            belong to different students. These are left unticked; open the row to see
            what each document says.
          </Alert>
        )}

        {!initialRows.length && (
          <p className="py-6 text-center text-sm text-neutral-500">
            Nothing readable was found on this document.
          </p>
        )}

        {initialRows.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">
                Fields found
              </span>
              <span className="flex gap-2 text-xs">
                <button type="button" onClick={() => setAll(true)}
                        className="focus-ring rounded-sm font-semibold text-brand-500 hover:underline">
                  Select all
                </button>
                <button type="button" onClick={() => setAll(false)}
                        className="focus-ring rounded-sm font-semibold text-neutral-500 hover:underline">
                  Clear
                </button>
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-neutral-50">
                    <th scope="col" className="w-10 px-3 py-2" />
                    <th scope="col" className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">
                      Field
                    </th>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">
                      On the form now
                    </th>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">
                      From this document
                    </th>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {initialRows.map((row) => (
                    <tr key={row.key}
                        className={`border-t border-neutral-200 ${row.isConflict ? "bg-error-50/40" : ""}`}>
                      <td className="px-3 py-2.5 align-top">
                        <input
                          type="checkbox"
                          checked={Boolean(checked[row.key])}
                          onChange={() => toggle(row.key)}
                          aria-label={`Apply ${row.label}`}
                          className="focus-ring h-4 w-4 accent-brand-500"
                        />
                      </td>
                      <td className="px-3 py-2.5 align-top font-semibold text-neutral-900">
                        {row.label}
                        <span className={`ml-1.5 text-xs font-normal ${CONFIDENCE_TONE[row.confidence] ?? "text-neutral-500"}`}>
                          {row.confidence}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top text-neutral-600">
                        {row.current || <span className="italic text-neutral-500">empty</span>}
                      </td>
                      <td className="px-3 py-2.5 align-top font-semibold text-neutral-900">
                        {row.incomingText}
                        {row.isConflict && row.claims.length > 1 && (
                          <ul className="mt-1 space-y-0.5">
                            {row.claims.map((c) => (
                              <li key={`${c.source_code}-${c.value}`} className="text-xs font-normal text-neutral-600">
                                <span className="font-semibold">{c.source_label}:</span>{" "}
                                {String(c.value)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <VerdictPill row={row} />
                        {rowNote(row) && (
                          <div className="mt-0.5 text-xs text-neutral-500">{rowNote(row)}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-neutral-500">
              Read by {result?.source_engine === "groq" ? "the backup reader" : "the local reader"}
              {result?.mean_confidence != null && ` · text confidence ${Math.round(result.mean_confidence * 100)}%`}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
