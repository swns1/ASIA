import { C } from "./requirementMeta";

/**
 * The OCR reader's verdict on a document about to be uploaded.
 *
 * Every requirement type is VERIFY now (see backend ocr/policy.py): the reader
 * confirms this is the paper the slot asked for, and that it names this
 * learner. It does not extract anything and it never blocks an upload — a
 * registrar holding a valid but unusual document has to be able to proceed, so
 * this reports and gets out of the way. `null` on either answer means "no
 * claim", which is not a failure and must not be drawn as one.
 *
 * Note `check?.is_expected_document`, read off the nested `check` object.
 * StudentFormPage's copy read it off the top level, where it is always
 * undefined, so it rendered "Worth a second look" on every document it ever
 * scanned regardless of the verdict. Extracting this component is what
 * deletes that bug.
 */
export default function DocumentCheckStrip({ state, check, requirementName, studentName }) {
  if (state === "idle") return null;

  // "done" with nothing to show means the reader returned no verdict. That is
  // not a pass — drawing it green would vouch for a document nobody checked.
  const unchecked = state === "error" || (state === "done" && !check);

  if (state === "scanning") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.muted,
                    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
        <i className="ti ti-loader-2" style={{ fontSize: 14, animation: "spin 1s linear infinite" }} />
        Checking this document…
      </div>
    );
  }

  if (unchecked) {
    return (
      <div style={{ fontSize: 12, color: C.muted, background: C.bg, border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: "10px 12px" }}>
        <i className="ti ti-alert-circle" style={{ fontSize: 14, marginRight: 6 }} />
        Couldn&apos;t check this document — you can still upload it.
      </div>
    );
  }

  const problems = [];
  if (check?.is_expected_document === false) {
    problems.push(`This does not look like a ${requirementName}.`);
  }
  if (check?.names_student === false) {
    problems.push(`This document does not name ${studentName || "this student"}.`);
  }
  (check?.notes || []).forEach((n) => {
    if (n.startsWith("No readable text")) problems.push(n);
  });

  const ok = problems.length === 0;
  return (
    <div style={{
      fontSize: 12, borderRadius: 10, padding: "10px 12px",
      color: ok ? C.green : C.redDark,
      background: ok ? C.greenLight : C.redLight,
      border: `1px solid ${ok ? C.greenBorder : C.redBorder}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
        <i className={`ti ${ok ? "ti-circle-check" : "ti-alert-triangle"}`} style={{ fontSize: 14 }} />
        {ok ? "Looks right" : "Worth a second look"}
      </div>
      {problems.map((msg) => (
        <div key={msg} style={{ marginTop: 4, paddingLeft: 20 }}>{msg}</div>
      ))}
      {!ok && (
        <div style={{ marginTop: 6, paddingLeft: 20, color: C.muted }}>
          You can still upload it if you know it&apos;s correct.
        </div>
      )}
    </div>
  );
}
