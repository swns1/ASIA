// src/components/AIInsightPanel.jsx
// Reusable Gemini AI interpretation panel — matches SLIS red/white design system.
// Props:
//   title       — panel header text
//   description — short subtitle shown before analysis
//   onFetch     — async fn that returns { interpretation: string } from the backend
//   disabled    — bool, disables the Analyze button (e.g. no data loaded yet)

import { useState, useEffect } from "react";

import { enrollmentClient } from "../api/enrollmentApi";

export async function callGemini(context_type, payload) {
  const res = await enrollmentClient.post("/ai/interpret/", { context_type, payload });
  return res.data; // { interpretation: string }
}

// ── Markdown-lite renderer ────────────────────────────────────────────────────
// Converts **bold**, bullet lines, and numbered sections into styled JSX.
function renderInterpretation(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let key = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { elements.push(<div key={key++} style={{ height: 6 }} />); continue; }

    // Section headers like **PERFORMANCE SUMMARY**
    if (/^\*\*[^*]+\*\*$/.test(line)) {
      const label = line.replace(/\*\*/g, "");
      elements.push(
        <div key={key++} style={{
          fontSize: 10.5, fontWeight: 700, color: "#e03131",
          textTransform: "uppercase", letterSpacing: "0.08em",
          marginTop: 14, marginBottom: 4,
        }}>
          {label}
        </div>
      );
      continue;
    }

    // Bullet lines starting with * or -
    if (/^[\*\-]\s+/.test(line)) {
      const content = line.replace(/^[\*\-]\s+/, "");
      elements.push(
        <div key={key++} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%", background: "#e03131",
            flexShrink: 0, marginTop: 7,
          }} />
          <span style={{ fontSize: 13, color: "#3a2a2a", lineHeight: 1.6 }}>
            {renderInline(content)}
          </span>
        </div>
      );
      continue;
    }

    // Regular paragraph line
    elements.push(
      <p key={key++} style={{ fontSize: 13, color: "#3a2a2a", lineHeight: 1.7, marginBottom: 2 }}>
        {renderInline(line)}
      </p>
    );
  }

  return elements;
}

// Handles inline **bold** and *italic* within a line
function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part))
      return <strong key={i} style={{ fontWeight: 700, color: "#1a0a0a" }}>{part.replace(/\*\*/g, "")}</strong>;
    if (/^\*[^*]+\*$/.test(part))
      return <em key={i} style={{ fontStyle: "italic" }}>{part.replace(/\*/g, "")}</em>;
    return part;
  });
}

// ── Shimmer skeleton ──────────────────────────────────────────────────────────
function Sk({ w = "100%", h = 13 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 6,
      background: "linear-gradient(90deg,#f0e8e8 25%,#fde8e8 50%,#f0e8e8 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.6s ease-in-out infinite",
    }} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AIInsightPanel({ title = "AI Interpretation", description, onFetch, disabled = false, initialInterpretation = "", autoFetch = false }) {
  const [status, setStatus]   = useState(initialInterpretation ? "success" : "idle");
  const [result, setResult]   = useState(initialInterpretation);
  const [errMsg, setErrMsg]   = useState("");
  const [source, setSource]   = useState(initialInterpretation ? "groq" : "");

  async function handleAnalyze() {
    setStatus("loading");
    setResult("");
    setErrMsg("");
    try {
      const data = await onFetch();
      setResult(data.interpretation || "No interpretation returned.");
      setSource("gemini");
      setStatus("success");
    } catch (e) {
      setErrMsg(e.message || "Something went wrong.");
      setStatus("error");
    }
  }

  function handleRegenerate() {
    handleAnalyze();
  }

  useEffect(() => {
    if (autoFetch && !initialInterpretation && !disabled) handleAnalyze();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        .ai-analyze-btn:hover:not(:disabled) { background: linear-gradient(135deg,#c92a2a,#b91c1c) !important; box-shadow: 0 6px 20px rgba(224,49,49,0.35) !important; }
        .ai-regen-btn:hover { color: #e03131 !important; border-color: #fca5a5 !important; background: #fff0f0 !important; }
      `}</style>

      <div style={{
        background: "white", border: "1px solid #f5eaea", borderRadius: 16,
        boxShadow: "0 2px 16px rgba(224,49,49,0.06)",
        animation: "fadeUp 0.25s ease both",
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid #f5eaea",
          borderRadius: "16px 16px 0 0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "linear-gradient(to right, #fdfafa, white)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: "linear-gradient(135deg, #fff0f0, #fde8e8)",
              border: "1px solid #fca5a5",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <i className="ti ti-sparkles" style={{ fontSize: 15, color: "#e03131" }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a0a0a" }}>{title}</div>
              {description && (
                <div style={{ fontSize: 11, color: "#b09090", marginTop: 1 }}>{description}</div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {status === "success" && (
              <button
                className="ai-regen-btn"
                onClick={handleRegenerate}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  height: 32, padding: "0 12px",
                  border: "1px solid #f0e4e4", borderRadius: 8,
                  background: "white", fontSize: 12, color: "#9a7070",
                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 500, transition: "all 0.12s",
                }}
              >
                <i className="ti ti-refresh" style={{ fontSize: 12 }} />
                Regenerate
              </button>
            )}

            <button
              className="ai-analyze-btn"
              onClick={handleAnalyze}
              disabled={disabled || status === "loading"}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                height: 34, padding: "0 16px",
                background: disabled || status === "loading"
                  ? "#f0dada"
                  : "linear-gradient(135deg, #e03131, #c92a2a)",
                color: disabled || status === "loading" ? "#b09090" : "white",
                border: "none", borderRadius: 9,
                fontSize: 12.5, fontWeight: 700,
                cursor: disabled || status === "loading" ? "not-allowed" : "pointer",
                fontFamily: "'DM Sans', sans-serif",
                boxShadow: disabled || status === "loading" ? "none" : "0 4px 16px rgba(224,49,49,0.26)",
                transition: "all 0.12s",
              }}
            >
              {status === "loading" ? (
                <>
                  <i className="ti ti-loader-2" style={{ fontSize: 13, animation: "spin 0.8s linear infinite" }} />
                  Analyzing…
                </>
              ) : (
                <>
                  <i className="ti ti-sparkles" style={{ fontSize: 13 }} />
                  {status === "success" ? "Re-analyze" : "Analyze"}
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "18px 22px" }}>

          {/* Idle state */}
          {status === "idle" && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: "28px 20px", gap: 10,
              color: "#c0a0a0", textAlign: "center",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: "linear-gradient(135deg, #fff0f0, #fde8e8)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <i className="ti ti-sparkles" style={{ fontSize: 22, color: "#e8a0a0" }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#b09090" }}>
                No analysis yet
              </div>
              <div style={{ fontSize: 12, color: "#c8b0b0", maxWidth: 280, lineHeight: 1.6 }}>
                Click <strong style={{ color: "#e03131" }}>Analyze</strong> to generate an AI-powered interpretation of this data using Gemini.
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {status === "loading" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fadeUp 0.2s ease both" }}>
              <Sk w="30%" h={10} />
              <Sk w="100%" h={13} />
              <Sk w="90%" h={13} />
              <Sk w="95%" h={13} />
              <div style={{ height: 4 }} />
              <Sk w="25%" h={10} />
              <Sk w="85%" h={13} />
              <Sk w="70%" h={13} />
              <div style={{ height: 4 }} />
              <Sk w="35%" h={10} />
              <Sk w="80%" h={13} />
              <Sk w="60%" h={13} />
            </div>
          )}

          {/* Error state */}
          {status === "error" && (
            <div style={{
              background: "#fef2f2", border: "1px solid #fca5a5",
              borderRadius: 10, padding: "14px 16px",
              display: "flex", alignItems: "flex-start", gap: 10,
              animation: "fadeUp 0.2s ease both",
            }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 16, color: "#e03131", flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#b91c1c" }}>Analysis failed</div>
                <div style={{ fontSize: 12, color: "#c0504a", marginTop: 3, lineHeight: 1.5 }}>{errMsg}</div>
              </div>
            </div>
          )}

          {/* Success state */}
          {status === "success" && (
            <div style={{ animation: "fadeUp 0.25s ease both" }}>
              {renderInterpretation(result)}
              <div style={{
                marginTop: 16, paddingTop: 12, borderTop: "1px solid #f5eaea",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <i className="ti ti-sparkles" style={{ fontSize: 11, color: "#e8a0a0" }} />
                <span style={{ fontSize: 10.5, color: "#c0a8a8", fontStyle: "italic" }}>
                  {source === "groq" ? "Generated by Groq (Llama 4)" : "Generated by Gemini"} · For guidance purposes only
                </span>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
