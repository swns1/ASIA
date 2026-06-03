export const downloadAsPDF = async (elementId, filename, options = {}) => {
  const { default: html2pdf } = await import("html2pdf.js");
  const element = document.getElementById(elementId);
  if (!element) return;

  const landscape = options.landscape ?? false;

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
};