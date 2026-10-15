// src/components/AIInsightPanel.jsx
// Reusable AI summary panel — matches SLIS red/white design system.
//
// Each summary is saved to the account that made it (backend ai/summaries.py):
// the panel loads it on open, flags it when the data has moved on since, and
// lets its owner edit it, copy it, download it as Word, publish it to staff
// or archive it. Summaries other staff published show beneath.
//
// Props:
//   title       — panel header text
//   description — short subtitle
//   request     — { contextType, payload, enrollmentId? }: what to summarize.
//                 Compared by value, so a page may build it on every render.
//   disabled    — bool, disables Analyze (e.g. no data loaded yet)

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CARD_DARK } from "./ui/darkSurfaces";
import { CHIP_GLOW } from "../constants/statusTones";
import Alert from "./ui/Alert";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import CopyButton from "./ui/CopyButton";
import { ConfirmDialog } from "./ui/Modal";
import { Field, Textarea } from "./FormField";
import {
  archiveAiSummary,
  callGemini,
  downloadAiSummaryDocx,
  editAiSummary,
  lookupAiSummary,
  shareAiSummary,
} from "../api/enrollmentApi";
import { parseAiText, toPlainText } from "../utils/aiText";
import { saveBlob } from "../utils/download";
import { fmtDateTime } from "../utils/format";

const PROVIDER_NAMES = { gemini: "Gemini", groq: "Groq" };

// ── Markup renderer ───────────────────────────────────────────────────────────
// Rules in utils/aiText.js, shared with Copy and (server-side) the Word file.
function Runs({ runs }) {
  return runs.map((r, i) =>
    r.bold ? <strong key={i} style={{ fontWeight: 700, color: "var(--color-neutral-900)" }}>{r.text}</strong>
    : r.italic ? <em key={i} style={{ fontStyle: "italic" }}>{r.text}</em>
    : r.text,
  );
}

function SummaryText({ text }) {
  return parseAiText(text).map((block, key) => {
    if (block.kind === "gap") return <div key={key} style={{ height: 6 }} />;
    if (block.kind === "heading") {
      return (
        <div key={key} style={{
          fontSize: 11, fontWeight: 700, color: "var(--color-brand-600)",
          textTransform: "uppercase", letterSpacing: "0.08em",
          marginTop: 14, marginBottom: 4,
        }}>
          {block.text}
        </div>
      );
    }
    if (block.kind === "bullet") {
      return (
        <div key={key} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%", background: "var(--color-brand-500)",
            flexShrink: 0, marginTop: 7,
          }} />
          <span className="text-[#3a2a2a] dark:text-neutral-800" style={{ fontSize: 13, lineHeight: 1.6 }}>
            <Runs runs={block.runs} />
          </span>
        </div>
      );
    }
    return (
      <p key={key} className="text-[#3a2a2a] dark:text-neutral-800" style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 2 }}>
        <Runs runs={block.runs} />
      </p>
    );
  });
}

// ── Shimmer skeleton ──────────────────────────────────────────────────────────
function Sk({ w = "100%", h = 13 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 6,
      background: "linear-gradient(90deg,var(--skeleton) 25%,var(--skeleton-shine) 50%,var(--skeleton) 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.6s ease-in-out infinite",
    }} />
  );
}

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fadeUp 0.2s ease both" }}>
      <Sk w="30%" h={10} />
      <Sk w="100%" h={13} />
      <Sk w="90%" h={13} />
      <Sk w="95%" h={13} />
      <div style={{ height: 4 }} />
      <Sk w="25%" h={10} />
      <Sk w="85%" h={13} />
      <Sk w="70%" h={13} />
    </div>
  );
}

async function saveDocx(id) {
  try {
    const { blob, filename } = await downloadAiSummaryDocx(id);
    saveBlob(blob, filename);
  } catch (e) {
    toast.error(e.message || "Couldn't download the Word file.");
  }
}

// A saved-or-not summary from an interpret answer. The save can fail while
// the AI answered: the text still shows, without the actions that need a row.
function fromAnswer(data) {
  if (data.summary) return data.summary;
  return {
    id: null, text: data.interpretation, ai_text: data.interpretation, edited: false,
    provider: data.provider || "", generated_at: new Date().toISOString(),
    stale: false, shared: false, shared_is_current: false,
  };
}

// ── Others' published summaries ───────────────────────────────────────────────
function SharedSummaries({ items }) {
  if (!items.length) return null;
  return (
    <div className="mt-5 border-t border-neutral-200 pt-4">
      <div className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-neutral-600">
        Shared by other staff ({items.length})
      </div>
      <div className="flex flex-col gap-2">
        {items.map((s) => (
          <details key={s.id} className="rounded-xl border border-neutral-200 bg-surface px-4 py-2.5">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold text-neutral-800">
              <i className="ti ti-user-share text-neutral-500" aria-hidden="true" />
              {s.owner_name}
              <span className="text-xs font-normal text-neutral-500">Shared {fmtDateTime(s.shared_at)}</span>
              {s.stale && <Badge variant="warning" size="sm" icon="ti-alert-triangle">Data changed since</Badge>}
            </summary>
            <div className="pt-2">
              <SummaryText text={s.text} />
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton text={() => toPlainText(s.text)} />
                <Button variant="secondary" size="sm" icon="ti-file-word" onClick={() => saveDocx(s.id)}>
                  Word file
                </Button>
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// Keyed by the request's value: another student or another set of filters
// mounts a fresh panel, so nothing of the last subject's summary, draft or
// pending answer can carry over -- an answer still on its way lands on the
// unmounted panel and goes nowhere. The page rebuilds `request` every render;
// equal values keep the same panel.
export default function AIInsightPanel(props) {
  const requestKey = props.request ? JSON.stringify(props.request) : "";
  return <SavedSummaryPanel key={requestKey} {...props} />;
}

function SavedSummaryPanel({ title = "AI Interpretation", description, request, disabled = false }) {
  const [lookup, setLookup]           = useState(request ? "loading" : "ready"); // loading | ready | error
  const [mine, setMine]               = useState(null);
  const [shared, setShared]           = useState([]);
  const [generating, setGenerating]   = useState(false);
  const [genError, setGenError]       = useState("");
  const [editing, setEditing]         = useState(false);
  const [draft, setDraft]             = useState("");
  const [busy, setBusy]               = useState("");        // save | share | archive
  const [confirm, setConfirm]         = useState("");        // regenerate | archive

  // Once per mount: the key above remounts for a new subject.
  useEffect(() => {
    if (!request) return undefined;
    let live = true;
    lookupAiSummary(request)
      .then((data) => {
        if (!live) return;
        setMine(data.mine ?? null);
        setShared(data.shared || []);
        setLookup("ready");
      })
      .catch(() => { if (live) setLookup("error"); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setConfirm("");
    setGenerating(true);
    setGenError("");
    setEditing(false);
    try {
      setMine(fromAnswer(await callGemini(request)));
    } catch (e) {
      setGenError(e.message || "Something went wrong.");
    } finally {
      setGenerating(false);
    }
  }

  // Regenerating replaces the owner's edit along with the AI's text.
  const onAnalyze = () => (mine?.edited ? setConfirm("regenerate") : generate());

  async function act(kind, call, done) {
    setBusy(kind);
    try {
      const result = await call();
      done?.(result);
    } catch (e) {
      toast.error(e.message || "Something went wrong. Please try again.");
    } finally {
      setBusy("");
    }
  }

  const saveEdit = (text) =>
    act("save", () => editAiSummary(mine.id, text), (s) => { setMine(s); setEditing(false); });

  const setSharing = (on) =>
    act("share", () => shareAiSummary(mine.id, on), (s) => {
      setMine(s);
      toast.success(on ? "Shared with staff." : "No longer shared.");
    });

  const archive = () =>
    act("archive", () => archiveAiSummary(mine.id), () => {
      setConfirm("");
      setMine(null);
      toast.success("Summary archived.");
    });

  const saved = mine?.id != null;
  const loading = lookup === "loading" || generating;

  return (
    <>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        .ai-analyze-btn:hover:not(:disabled) { background: linear-gradient(135deg,var(--color-action-2),#b91c1c) !important; box-shadow: 0 6px 20px rgba(224,49,49,0.35) !important; }
      `}</style>

      <div className={`bg-surface shadow-[0_2px_16px_rgba(224,49,49,0.06)] ${CARD_DARK}`} style={{
        border: "1px solid var(--color-neutral-200)", borderRadius: 16,
        animation: "fadeUp 0.25s ease both",
      }}>

        {/* ── Header ── */}
        <div className="bg-[linear-gradient(to_right,#fdfafa,white)] dark:bg-none" style={{
          padding: "14px 20px", borderBottom: "1px solid var(--color-neutral-200)",
          borderRadius: "16px 16px 0 0",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className={`bg-[linear-gradient(135deg,var(--color-brand-100),var(--color-brand-200))] ${CHIP_GLOW.brand}`} style={{
              width: 32, height: 32, borderRadius: 9,
              border: "1px solid var(--color-brand-300)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <i className="ti ti-sparkles" style={{ fontSize: 15, color: "var(--color-brand-600)" }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-neutral-900)" }}>{title}</div>
              {description && (
                <div style={{ fontSize: 11, color: "var(--color-neutral-500)", marginTop: 1 }}>{description}</div>
              )}
            </div>
          </div>

          <button
            className={`ai-analyze-btn ${disabled || loading ? "bg-[#f0dada] dark:bg-neutral-200" : ""}`}
            onClick={onAnalyze}
            disabled={disabled || loading || editing || !request}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              height: 34, padding: "0 16px",
              background: disabled || loading
                ? undefined
                : "linear-gradient(135deg, var(--color-action), var(--color-action-2))",
              color: disabled || loading ? "var(--color-neutral-500)" : "white",
              border: "none", borderRadius: 9,
              fontSize: 12.5, fontWeight: 700,
              cursor: disabled || loading ? "not-allowed" : "pointer",
              fontFamily: "'DM Sans', sans-serif",
              boxShadow: disabled || loading ? "none" : "0 4px 16px rgba(224,49,49,0.26)",
              transition: "all 0.12s",
            }}
          >
            {generating ? (
              <>
                <i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 0.8s linear infinite" }} />
                Analyzing…
              </>
            ) : (
              <>
                <i className={`ti ${mine ? "ti-refresh" : "ti-sparkles"}`} style={{ fontSize: 13 }} />
                {mine ? "Regenerate" : "Analyze"}
              </>
            )}
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "18px 22px" }}>

          {loading && <Skeleton />}

          {!loading && genError && (
            <Alert variant="error" title="Analysis failed" className="mb-3">{genError}</Alert>
          )}

          {!loading && lookup === "error" && !mine && (
            <Alert variant="warning" className="mb-3">
              Couldn&apos;t load your saved summary. You can still analyze this data.
            </Alert>
          )}

          {/* No summary of mine yet */}
          {!loading && !mine && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: "28px 20px", gap: 10,
              color: "var(--color-neutral-500)", textAlign: "center",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: "linear-gradient(135deg, var(--color-brand-100), var(--color-brand-200))",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <i className="ti ti-sparkles" style={{ fontSize: 22, color: "var(--color-neutral-500)" }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-neutral-500)" }}>
                No summary yet
              </div>
              <div style={{ fontSize: 12, color: "var(--color-neutral-500)", maxWidth: 300, lineHeight: 1.6 }}>
                Click <strong style={{ color: "var(--color-brand-600)" }}>Analyze</strong> to generate an AI summary.
                It&apos;s saved to your account, so it will be here next time.
              </div>
            </div>
          )}

          {/* My summary */}
          {!loading && mine && (
            <div style={{ animation: "fadeUp 0.25s ease both" }}>
              <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
                <span>
                  Generated {fmtDateTime(mine.generated_at)}
                  {PROVIDER_NAMES[mine.provider] && ` by ${PROVIDER_NAMES[mine.provider]}`}
                </span>
                {mine.edited && <Badge variant="info" size="sm" icon="ti-pencil">Edited {fmtDateTime(mine.edited_at)}</Badge>}
                {mine.shared && <Badge variant="success" size="sm" icon="ti-users">Shared with staff</Badge>}
              </div>

              {mine.stale && (
                <Alert variant="warning" title="The data changed after this summary was made" className="mb-3">
                  This summary is from {fmtDateTime(mine.generated_at)}. Regenerate it to include the latest data.
                </Alert>
              )}

              {!saved && (
                <Alert variant="warning" className="mb-3">
                  This summary couldn&apos;t be saved, so it will be gone when you leave this page.
                </Alert>
              )}

              {mine.shared && !mine.shared_is_current && (
                <Alert variant="info" className="mb-3">
                  Staff still see the version you shared on {fmtDateTime(mine.shared_at)}.
                  <div className="mt-2">
                    <Button size="sm" variant="secondary" icon="ti-share" loading={busy === "share"}
                      onClick={() => setSharing(true)}>
                      Share this version
                    </Button>
                  </div>
                </Alert>
              )}

              {editing ? (
                <>
                  <Field label="Your version" hint="**TEXT** on its own line is a heading; start a line with - for a bullet.">
                    <Textarea rows={12} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={20000} />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" icon="ti-device-floppy" loading={busy === "save"} onClick={() => saveEdit(draft)}>
                      Save
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy === "save"} onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    {mine.edited && (
                      <Button size="sm" variant="ghost" icon="ti-arrow-back-up" disabled={busy === "save"}
                        onClick={() => saveEdit("")}>
                        Restore AI version
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <SummaryText text={mine.text} />
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-200 pt-3">
                    <Button size="sm" variant="secondary" icon="ti-pencil" disabled={!saved}
                      onClick={() => { setDraft(mine.text); setEditing(true); }}>
                      Edit
                    </Button>
                    <CopyButton text={() => toPlainText(mine.text)} />
                    <Button size="sm" variant="secondary" icon="ti-file-word" disabled={!saved}
                      onClick={() => saveDocx(mine.id)}>
                      Word file
                    </Button>
                    {/* The server says who may share (teachers keep theirs
                        private); a copy already shared can still be withdrawn. */}
                    {(mine.can_share || mine.shared) && (
                      <Button size="sm" variant="secondary" icon={mine.shared ? "ti-users-minus" : "ti-users"}
                        disabled={!saved} loading={busy === "share"} onClick={() => setSharing(!mine.shared)}>
                        {mine.shared ? "Stop sharing" : "Share with staff"}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" icon="ti-archive" disabled={!saved}
                      onClick={() => setConfirm("archive")}>
                      Archive
                    </Button>
                  </div>
                </>
              )}

              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-sparkles" style={{ fontSize: 11, color: "var(--color-neutral-500)" }} />
                <span style={{ fontSize: 11, color: "var(--color-neutral-500)", fontStyle: "italic" }}>
                  AI-generated · For guidance purposes only
                </span>
              </div>
            </div>
          )}

          {!loading && <SharedSummaries items={shared} />}
        </div>
      </div>

      {confirm === "regenerate" && (
        <ConfirmDialog
          icon="ti-refresh"
          title="Replace your edited version?"
          message="Regenerating writes a new AI summary over your edits. A version you already shared stays as it is until you share again."
          confirmLabel="Regenerate"
          danger={false}
          onConfirm={generate}
          onCancel={() => setConfirm("")}
        />
      )}
      {confirm === "archive" && (
        <ConfirmDialog
          icon="ti-archive"
          title="Archive this summary?"
          message="It leaves this page and stops being shared. It is kept on file, not deleted."
          confirmLabel="Archive"
          danger={false}
          loading={busy === "archive"}
          onConfirm={archive}
          onCancel={() => setConfirm("")}
        />
      )}
    </>
  );
}
