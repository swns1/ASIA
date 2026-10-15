// aiText.js — the light markup AI summaries are written in, read one way.
//
// A line that is wholly **BOLD** is a section heading, a line starting "* "
// or "- " is a bullet, and **bold** / *italic* work inside a line. The panel
// renders it (components/AIInsightPanel.jsx), Copy turns it into plain text,
// and the Word file follows the same rules server-side
// (backend/enrollment-service/ai/summary_docx.py parse_blocks).

const HEADING = /^\*\*[^*]+\*\*$/;
const BULLET = /^[*-]\s+/;
const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;

/** [{ text, bold, italic }] for one line. */
export function parseInline(text) {
  return text
    .split(INLINE)
    .filter(Boolean)
    .map((part) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) return { text: part.slice(2, -2), bold: true, italic: false };
      if (/^\*[^*]+\*$/.test(part)) return { text: part.slice(1, -1), bold: false, italic: true };
      return { text: part, bold: false, italic: false };
    });
}

/** [{ kind: "heading", text } | { kind: "bullet" | "paragraph", runs } | { kind: "gap" }] */
export function parseAiText(text) {
  return (text || "").split("\n").map((raw) => {
    const line = raw.trim();
    if (!line) return { kind: "gap" };
    if (HEADING.test(line)) return { kind: "heading", text: line.replace(/\*\*/g, "") };
    if (BULLET.test(line)) return { kind: "bullet", runs: parseInline(line.replace(BULLET, "")) };
    return { kind: "paragraph", runs: parseInline(line) };
  });
}

const runsText = (runs) => runs.map((r) => r.text).join("");

/** The summary as plain text for pasting anywhere: no asterisks, bullets as
 *  "•", headings in capitals, one blank line between blocks at most. */
export function toPlainText(text) {
  const lines = parseAiText(text).map((block) => {
    if (block.kind === "gap") return "";
    if (block.kind === "heading") return block.text.toUpperCase();
    if (block.kind === "bullet") return `• ${runsText(block.runs)}`;
    return runsText(block.runs);
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
