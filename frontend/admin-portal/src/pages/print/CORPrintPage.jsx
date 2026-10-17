// CORPrintPage.jsx
//
// The Certificate of Registration with the school's Admissions Agreement, as
// the server draws it (school_forms/cor.py): page 1 is the COR with the
// learner's subjects, then the agreement for their level on long bond, for
// the parent to sign at the counter. This page only shows that PDF, so the
// print matches the client's form exactly; it used to draw the COR itself
// in HTML and save it through html2pdf as a picture of the page, on A4.
//
// "SLIS Copy" is the school's; "Parent's Copy" changes only the label at
// the foot of each page. A guardian prints their own child's from the child
// page, and only ever the parent's copy.
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { downloadSchoolForm } from "../../api/enrollmentApi";
import { getCurrentUser } from "../../utils/auth";
import { saveBlob } from "../../utils/download";
import { PRINT_COLORS as C, PRINT_FONT } from "../../components/print/theme";
import { PrintToolbar, ToolbarButton } from "../../components/print/PrintToolbar";
import { PrintError } from "../../components/print/PrintShell";

const COPIES = [
  { value: "slis",   label: "SLIS Copy" },
  { value: "parent", label: "Parent's Copy" },
];

export default function CORPrintPage() {
  const { enrollmentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isGuardian = getCurrentUser()?.role === "guardian";
  const [copy, setCopy] = useState(isGuardian ? "parent" : "slis");
  // What the server sent for a copy, tagged with it: a result for another
  // copy than the one picked is a load still under way.
  const [result, setResult] = useState(null);   // { copy, url, blob, filename, warnings } | { copy, error }
  const frame = useRef(null);

  useEffect(() => {
    let stale = false;
    let url = null;
    downloadSchoolForm(`cor/${enrollmentId}`, { copy }, `COR-${enrollmentId}.pdf`)
      .then(({ blob, filename, warnings }) => {
        if (stale) return;
        url = URL.createObjectURL(blob);
        setResult({ copy, url, blob, filename, warnings });
      })
      .catch((err) => { if (!stale) setResult({ copy, error: err.message || "Could not load the COR." }); });
    return () => {
      stale = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [enrollmentId, copy]);

  const current = result?.copy === copy ? result : null;
  const file = current?.url ? current : null;
  const error = current?.error;

  const handlePrint = () => {
    // The browser's PDF viewer inside the frame prints the PDF itself, at
    // its own page size; where a browser won't print a framed PDF, the
    // file opens in a tab of its own to print from there.
    try {
      frame.current.contentWindow.focus();
      frame.current.contentWindow.print();
    } catch {
      window.open(file.url, "_blank");
    }
  };

  // Staff open it in a tab of its own from the enrollment page, where it is
  // the first page ("default" key) and Close shuts the tab; a guardian opens
  // it in place from their child's page, so Back returns there.
  const opened = location.key === "default";
  const goBack = () => (opened ? window.close() : navigate(-1));

  if (error) return <PrintError message={error} />;

  const switcher = (
    <div role="group" aria-label="Copy" style={{ display: "flex", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, overflow: "hidden" }}>
      {COPIES.map((c) => (
        <button key={c.value} type="button" aria-pressed={copy === c.value} onClick={() => setCopy(c.value)}
          style={{
            padding: "7px 12px", border: "none", cursor: "pointer", fontSize: 13, fontFamily: PRINT_FONT,
            background: copy === c.value ? "rgba(255,255,255,0.16)" : "transparent",
            color: copy === c.value ? "white" : "rgba(255,255,255,0.6)",
            fontWeight: copy === c.value ? 700 : 500,
          }}>
          {c.label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#ececec" }}>
      <PrintToolbar
        onBack={goBack}
        backLabel={opened ? "Close" : "Back"}
        title={file?.filename ?? "Certificate of Registration and Admissions Agreement"}
        middle={isGuardian ? null : switcher}
        actions={
          <>
            <ToolbarButton onClick={() => saveBlob(file.blob, file.filename)} disabled={!file} icon="download">
              Download PDF
            </ToolbarButton>
            <ToolbarButton onClick={handlePrint} disabled={!file} primary icon="printer">Print</ToolbarButton>
          </>
        }
      />
      {file?.warnings?.length > 0 && (
        <ul role="status" style={{ margin: 0, padding: "8px 24px 8px 40px", background: C.amberBg, color: C.amber, fontSize: 13, fontFamily: PRINT_FONT }}>
          {file.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      {file ? (
        <iframe ref={frame} src={file.url} title="Certificate of Registration and Admissions Agreement"
          style={{ flex: 1, width: "100%", border: 0 }} />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 15, fontFamily: PRINT_FONT }}>
          Preparing the COR…
        </div>
      )}
    </div>
  );
}
