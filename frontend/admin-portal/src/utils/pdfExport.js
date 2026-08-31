export const downloadAsPDF = async (elementId, filename, options = {}) => {
  const { default: html2pdf } = await import("html2pdf.js");
  const element = document.getElementById(elementId);
  if (!element) return;

  const landscape = options.landscape ?? false;

  // html2canvas captures the DOM's live on-screen state — it never triggers
  // @media print, unlike an actual browser print. Without this class, every
  // PDF export would capture the padded/bordered/rounded on-screen card
  // instead of the lean print layout PrintShell defines for @media print,
  // producing a taller, less space-efficient PDF than a native print.
  document.body.classList.add("force-print-layout");
  try {
    await html2pdf()
      .set({
        margin: landscape ? [6, 6, 6, 6] : [8, 8, 8, 8],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, allowTaint: true },
        jsPDF: { unit: "mm", format: "a4", orientation: landscape ? "landscape" : "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      })
      .from(element)
      .save();
  } finally {
    document.body.classList.remove("force-print-layout");
  }
};