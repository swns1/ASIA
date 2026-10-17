// SF9PrintPage.jsx
//
// The SF9, the Learner's Progress Report Card, as the server draws it
// (school_forms/sf9.py): DepEd's folded card on long bond, with the school's
// letterhead on its cover. It is also the report card: /report-card/:id
// (the enrollment page's "Report Card", the guardian portal's "Printable
// report card") shows this same page, so every way in prints one document.
// It used to be two different HTML pages, each saved through html2pdf as a
// picture of the page, and each averaging the grades its own way.
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { downloadSchoolForm } from "../../api/enrollmentApi";
import { usePageTitle } from "../../hooks/usePageTitle";
import { saveBlob } from "../../utils/download";
import { PRINT_COLORS as C, PRINT_FONT } from "../../components/print/theme";
import { PrintToolbar, ToolbarButton } from "../../components/print/PrintToolbar";

const TITLE = "Learner's Progress Report Card";

export default function SF9PrintPage() {
  usePageTitle("Report Card");
  const { enrollmentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // What the server sent for an enrollment, tagged with it: a result for
  // another enrollment is a load still under way.
  const [result, setResult] = useState(null);   // { id, url, blob, filename, warnings } | { id, error }
  const frame = useRef(null);

  useEffect(() => {
    let stale = false;
    let url = null;
    downloadSchoolForm(`sf9/${enrollmentId}`, {}, `SF9-${enrollmentId}.pdf`)
      .then(({ blob, filename, warnings }) => {
        if (stale) return;
        url = URL.createObjectURL(blob);
        setResult({ id: enrollmentId, url, blob, filename, warnings });
      })
      .catch((err) => { if (!stale) setResult({ id: enrollmentId, error: err.message || "Could not load the report card." }); });
    return () => {
      stale = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [enrollmentId]);

  const current = result?.id === enrollmentId ? result : null;
  const file = current?.url ? current : null;
  const error = current?.error;
  // A phone's browser (Android Chrome) shows no PDF inside a page; there the
  // file is offered to open or save instead of a blank frame.
  const inline = typeof navigator === "undefined" || navigator.pdfViewerEnabled !== false;

  // The enrollment page and the guardian portal open this in the same tab,
  // so Back returns there; School Forms and the Grades summary open it in a
  // tab of its own, where it is the first page ("default" key) and Close
  // closes the tab.
  const opened = location.key === "default";
  const goBack = () => (opened ? window.close() : navigate(-1));

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

  const message = (text, color = C.muted) => (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", color, fontSize: 15, fontFamily: PRINT_FONT }}>
      {text}
    </div>
  );

  let body;
  if (error) {
    // Under the toolbar, not a page of its own: a parent who came here from
    // the portal still has the way back.
    body = message(error, C.red);
  } else if (!file) {
    body = message("Preparing the report card…");
  } else if (inline) {
    body = (
      <iframe ref={frame} src={file.url} title={TITLE}
        style={{ flex: 1, width: "100%", border: 0 }} />
    );
  } else {
    body = (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center", fontFamily: PRINT_FONT }}>
        <div style={{ fontSize: 15, color: C.dark, fontWeight: 600 }}>This browser can't show the report card here.</div>
        <div style={{ fontSize: 13, color: C.muted, maxWidth: 360 }}>Open it in your PDF viewer, or save it to print later.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <a href={file.url} target="_blank" rel="noopener"
            style={{ padding: "9px 18px", borderRadius: 8, background: C.red, color: "white", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
            Open the report card
          </a>
          <button type="button" onClick={() => saveBlob(file.blob, file.filename)}
            style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: "white", color: C.dark, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: PRINT_FONT }}>
            Save PDF
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#ececec" }}>
      <PrintToolbar
        onBack={goBack}
        backLabel={opened ? "Close" : "Back"}
        title={file?.filename ?? TITLE}
        actions={
          <>
            <ToolbarButton onClick={() => saveBlob(file.blob, file.filename)} disabled={!file} icon="download">
              Download PDF
            </ToolbarButton>
            <ToolbarButton onClick={handlePrint} disabled={!file || !inline} primary icon="printer">Print</ToolbarButton>
          </>
        }
      />
      {file?.warnings?.length > 0 && (
        <ul role="status" style={{ margin: 0, padding: "8px 24px 8px 40px", background: C.amberBg, color: C.amber, fontSize: 13, fontFamily: PRINT_FONT }}>
          {file.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      {body}
    </div>
  );
}
